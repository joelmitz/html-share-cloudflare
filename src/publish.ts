import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BuildManifest } from './bundle.js';
import { buildSite } from './bundle.js';
import type { HtmlShareConfig } from './config.js';
import { consoleUrl } from './config.js';
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
  const exact = manifest.pages.filter((page) => page.slug === query);
  const matches = exact.length === 1
    ? exact
    : manifest.pages.filter((page) => page.slug.includes(query) || page.title.includes(query));
  if (matches.length !== 1) throw new Error(matches.length ? `Multiple pages match ${query}: ${matches.map((p) => p.slug).join(', ')}` : `Page not found: ${query}`);
  const result = await deviceShare(config, matches[0].slug, 'public', days);
  return result.url;
}
