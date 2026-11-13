import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ArchivedPage, BuildManifest, BuiltPage } from './bundle.js';
import { OG_CARD_KEY, addDays, buildSite, jstToday } from './bundle.js';
import type { HtmlShareConfig } from './config.js';
import { consoleUrl, setPageKeep } from './config.js';
import { REVIVE_DAYS } from './retention.js';
import {
  acquirePublishLock,
  commitPublish,
  deviceShare,
  pairedDeviceId,
  renewPublishLock,
  type CommitPageInput,
} from './review-client.js';

function r2Client(config: HtmlShareConfig): S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    // 世代付きキーへの書き込みのみで削除操作は行わないため（§4.2）、
    // 必要な権限はObject Write（PutObject）だけで足りる。
    throw new Error('Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (an R2 API token with Object Write).');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.cloudflare.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

// N件アップロードごとにlockを延長する（設計§4.2）。lock TTLは30分あり、延長自体は
// 安価（D1へのUPDATE1本）なので、頻度過多のコストより間隔が空きすぎてTTLを
// 超過するリスクの方を避ける。
const RENEW_EVERY_N_UPLOADS = 50;

function buildUnlocked(config: HtmlShareConfig): { buildRoot: string; manifest: BuildManifest } {
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = buildSite(config, buildRoot);
  return { buildRoot, manifest };
}

export function buildOnly(config: HtmlShareConfig): { buildRoot: string; manifest: BuildManifest } {
  const release = acquireLocalPublishLock(config);
  try {
    return buildUnlocked(config);
  } finally {
    release();
  }
}

/**
 * 同じbaseDirのbuild/upload/commitを1プロセスに限定する。
 * buildSiteはbuildRootを削除して作り直すため、upload中に別のbuildが始まると、
 * 生成物の欠落や読み取り競合が起こる。ロックはpublish完了まで保持する。
 */
function acquireLocalPublishLock(config: HtmlShareConfig): () => void {
  const lock = path.resolve(config.baseDir, '.html-share', 'publish.lock');
  mkdirSync(path.dirname(lock), { recursive: true });
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let owner = 0;
    try {
      owner = Number.parseInt(readFileSync(path.join(lock, 'pid'), 'utf8').trim(), 10);
    } catch {
      throw new Error(`Another publish is in progress. Wait for it to finish, or remove ${lock} if no process owns it.`);
    }
    if (!Number.isInteger(owner) || owner <= 0 || isAlive(owner)) {
      throw new Error(`Another publish is in progress. Wait for it to finish, or remove ${lock} if no process owns it.`);
    }
    rmSync(lock, { recursive: true, force: true });
    try {
      mkdirSync(lock);
    } catch {
      throw new Error(`Another publish is in progress. Wait for it to finish, or remove ${lock} if no process owns it.`);
    }
  }
  writeFileSync(path.join(lock, 'pid'), `${process.pid}\n`);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    rmSync(lock, { recursive: true, force: true });
  };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function publish(config: HtmlShareConfig): Promise<{ consoleUrl: string; pages: number }> {
  const releaseLocalLock = acquireLocalPublishLock(config);
  try {
    const { buildRoot, manifest } = buildUnlocked(config);
    const deviceId = pairedDeviceId(config);
    // R2認証情報の検証はネットワークを一切使わないため、remote lockより先に行う。
    const client = r2Client(config);
    const lock = await acquirePublishLock(config);

    // リンクプレビューの画像は deviceId/gen に属さない共有の固定キー（署名なしで開ける唯一のキー）。
    // 公開ページがあるときだけ、公開バケットへ内容そのままを上書きする（冪等）。
    const ogCard = path.join(buildRoot, 'content', OG_CARD_KEY);
    if (existsSync(ogCard) && manifest.pages.some((page) => page.visibility === 'public')) {
      await client.send(new PutObjectCommand({
        Bucket: config.cloudflare.contentBucket,
        Key: OG_CARD_KEY,
        Body: readFileSync(ogCard),
        ContentType: 'image/jpeg',
        CacheControl: 'no-store, max-age=0',
      }));
    }

    const commitPages: CommitPageInput[] = [];
    let uploaded = 0;
    for (const page of manifest.pages) {
      // page.objectKeyはローカルの構築物内(content/配下)の相対パスであり、R2上の
      // 実際のキーではない。R2キーはdeviceId/genを注入してこの場で導出する（§4.1）。
      const body = readFileSync(path.join(buildRoot, 'content', page.objectKey));
      const objectKey = `pages/${deviceId}/${lock.gen}/${page.slug}/index.html`;
      const bucket = page.visibility === 'public' ? config.cloudflare.contentBucket : config.cloudflare.internalBucket;
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: 'text/html; charset=utf-8',
        CacheControl: 'no-store, max-age=0',
      }));
      uploaded += 1;
      if (uploaded % RENEW_EVERY_N_UPLOADS === 0) await renewPublishLock(config, lock.token);
      commitPages.push({
        slug: page.slug,
        title: page.title,
        source: page.source,
        repository: page.repository,
        stream: page.stream,
        streamLabel: page.streamLabel,
        date: page.date,
        updatedAt: page.updatedAt,
        bytes: body.byteLength,
        md5: createHash('md5').update(body).digest('hex'),
        visibility: page.visibility,
      });
    }

    const result = await commitPublish(config, lock.token, commitPages);
    return { consoleUrl: `${consoleUrl(config)}/app/`, pages: result.pages };
  } finally {
    releaseLocalLock();
  }
}


export async function share(config: HtmlShareConfig, query: string, days: number): Promise<string> {
  if (days > config.content.maximumShareDays) {
    throw new Error(`Share duration exceeds the configured maximum of ${config.content.maximumShareDays} days`);
  }
  const buildRoot = path.resolve(config.baseDir, '.html-share', 'build');
  const manifest = JSON.parse(readFileSync(path.join(buildRoot, 'manifest.json'), 'utf8')) as BuildManifest;
  // ローカルのmanifest.jsonはクエリ解決（部分一致の利便性）だけに使う。署名の
  // 権威は常にサーバー側（POST /api/device/shares、D1のpages行）にあり、CLIは
  // 秘密鍵を持たない（§6）。
  // slugの完全一致を最優先する。他ページのslug/titleの接頭辞になっているだけで
  // 「複数一致」エラーになっていた（例: report-2026-08-04-141049 と
  // report-2026-08-04-141049-ja）。完全一致が無いときだけ部分一致にフォールバックする。
  const matches = matchingPages(manifest.pages, query);
  if (matches.length === 0 && matchingPages(manifest.archived ?? [], query).length > 0) {
    throw new Error(`${query} is in the archive and is not served. Run \`html-share page revive ${query}\` first.`);
  }
  if (matches.length !== 1) throw new Error(matches.length ? `Multiple pages match ${query}: ${matches.map((p) => p.slug).join(', ')}` : `Page not found: ${query}`);
  const result = await deviceShare(config, matches[0].slug, 'public', days);
  return result.url;
}

export function matchingPages<T extends Pick<BuiltPage, 'slug' | 'title'>>(pages: T[], query: string): T[] {
  // Exact slug first, then a unique exact title, then partial matches. Without the title
  // step, a page titled exactly as the query stops resolving once another page's title
  // starts with the same words.
  const exact = pages.filter((page) => page.slug === query);
  if (exact.length > 0) return exact;
  const titleExact = pages.filter((page) => page.title === query);
  if (titleExact.length === 1) return titleExact;
  return pages.filter((page) => page.slug.includes(query) || page.title.includes(query));
}

/**
 * 保管庫のページを配信へ戻す。設定ファイルのそのページに keep（今日から days 日後）を書く。
 * 見直し日を過ぎてもまだ要るなら、もう一度 revive するか keep を延ばす。
 * 保管庫の一覧は直前の build の manifest から引く（build していなければ先に build する）
 */
export function revive(config: HtmlShareConfig, query: string, days = REVIVE_DAYS, now = new Date()): { page: ArchivedPage; keep: string } {
  if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer');
  const manifestFile = path.resolve(config.baseDir, '.html-share', 'build', 'manifest.json');
  let manifest: BuildManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as BuildManifest;
  } catch {
    throw new Error(`No build found at ${manifestFile}. Run \`html-share build\` first.`);
  }
  const matches = matchingPages(manifest.archived ?? [], query);
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? `Multiple archived pages match ${query}: ${matches.map((page) => page.slug).join(', ')}`
      : `No archived page matches ${query}`);
  }
  const keep = addDays(jstToday(now), days);
  setPageKeep(config.configFile, matches[0].source, keep);
  return { page: matches[0], keep };
}
