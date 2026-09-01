import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { BuiltPage } from '../src/bundle.js';
import type { HtmlShareConfig } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import { acquirePublishLock, buildOnly, matchingPages, share } from '../src/publish.js';

function fixture(pages: Array<{ slug: string; title: string; objectKey: string }>): { config: ReturnType<typeof loadConfig> } {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-publish-'));
  mkdirSync(path.join(root, 'pages'));
  writeFileSync(path.join(root, 'pages', 'demo.html'), '<h1>Demo</h1>');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  mkdirSync(path.join(root, 'keys'));
  writeFileSync(path.join(root, 'keys', 'private.pem'), privateKey);
  writeFileSync(path.join(root, 'keys', 'public.pem'), publicKey);
  const configFile = path.join(root, 'html-share.config.yaml');
  writeFileSync(configFile, `ownerEmail: owner@example.com
cloudflare:
  accountId: "0123456789abcdef0123456789abcdef"
  consoleDomain: console.example.com
  contentDomain: content.example.com
  consoleBucket: html-share-console
  contentBucket: html-share-content
  publicKeyPath: keys/public.pem
  privateKeyPath: keys/private.pem
content:
  roots: [pages]
  pages:
    - path: pages/demo.html
  ownerLinkDays: 7
  maximumShareDays: 30
  maximumAssetBytes: 1024
`);
  const config = loadConfig(configFile);
  mkdirSync(path.join(root, '.html-share', 'build'), { recursive: true });
  writeFileSync(path.join(root, '.html-share', 'build', 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    pages: pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      source: 'pages/demo.html',
      updatedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      repository: 'pages',
      stream: '',
      streamLabel: '',
      objectKey: page.objectKey,
    })),
  }));
  return { config };
}

test('share resolves an exact slug even when it prefixes another slug', () => {
  const { config } = fixture([
    { slug: 'report-2026-08-04-141049', title: '利用状況レポート 2026-08-04', objectKey: 'pages/report-2026-08-04-141049/index.html' },
    { slug: 'report-2026-08-04-141049-ja', title: '利用状況レポート 2026-08-04(日本語)', objectKey: 'pages/report-2026-08-04-141049-ja/index.html' },
  ]);
  const url = new URL(share(config, 'report-2026-08-04-141049', 7));
  assert.equal(url.pathname, '/pages/report-2026-08-04-141049/index.html');
});

test('share still falls back to partial match when there is no exact slug', () => {
  const { config } = fixture([
    { slug: 'demo-report', title: 'デモレポート', objectKey: 'pages/demo-report/index.html' },
  ]);
  const url = new URL(share(config, 'demo', 7));
  assert.equal(url.pathname, '/pages/demo-report/index.html');
});

test('share reports an ambiguous partial match when no exact slug exists', () => {
  const { config } = fixture([
    { slug: 'weekly-report-a', title: 'A', objectKey: 'pages/a/index.html' },
    { slug: 'weekly-report-b', title: 'B', objectKey: 'pages/b/index.html' },
  ]);
  assert.throws(() => share(config, 'weekly-report', 7), /Multiple pages match/);
});

function page(slug: string, title = slug): BuiltPage {
  return {
    slug,
    title,
    source: `${slug}.html`,
    updatedAt: '2026-08-27T00:00:00.000Z',
    date: '2026-08-27T00:00:00.000Z',
    repository: 'test',
    stream: 'test',
    streamLabel: 'Test',
    objectKey: `pages/${slug}/index.html`,
  };
}

test('prefers an exact slug over prefix and title matches', () => {
  const exact = page('report-2026-08-04-141049');
  const longer = page('report-2026-08-04-141049-ja');
  assert.deepEqual(matchingPages([exact, longer], exact.slug), [exact]);
});

test('keeps partial matching when there is no exact slug', () => {
  const first = page('release-notes', 'Release notes');
  const second = page('roadmap', 'Release roadmap');
  assert.deepEqual(matchingPages([first, second], 'Release'), [first, second]);
});

// publish の排他。build は生成物をまるごと作り直し、送信は「ローカルに無いキーを消す」ので、
// 2つの publish が重なると、まだ生成されていないページがバケットから消える。どちらの
// コマンドも成功して終わるため、テストで押さえておかないと壊れたことに気づけない。
function lockConfig(): HtmlShareConfig {
  return { baseDir: mkdtempSync(path.join(tmpdir(), 'html-share-lock-')) } as HtmlShareConfig;
}

test('refuses a second publish while one holds the lock', () => {
  const config = lockConfig();
  const release = acquirePublishLock(config);
  assert.throws(() => acquirePublishLock(config), /Another publish is in progress/);
  release();
  const again = acquirePublishLock(config);  // 解放後は取れる
  again();
});

test('releasing twice is harmless', () => {
  const config = lockConfig();
  const release = acquirePublishLock(config);
  release();
  release();
  assert.equal(existsSync(path.join(config.baseDir, '.html-share', 'publish.lock')), false);
});

test('takes over a lock left behind by a dead process', () => {
  const config = lockConfig();
  const lock = path.join(config.baseDir, '.html-share', 'publish.lock');
  mkdirSync(lock, { recursive: true });
  writeFileSync(path.join(lock, 'pid'), '2147483647\n');  // 存在しない pid
  const release = acquirePublishLock(config);
  assert.equal(readFileSync(path.join(lock, 'pid'), 'utf8').trim(), String(process.pid));
  release();
});

test('does not steal a lock that has no pid file yet', () => {
  const config = lockConfig();
  mkdirSync(path.join(config.baseDir, '.html-share', 'publish.lock'), { recursive: true });
  assert.throws(() => acquirePublishLock(config), /Another publish is in progress/);
});

test('buildOnly acquires the same lock', () => {
  const config = lockConfig();
  const release = acquirePublishLock(config);
  assert.throws(() => buildOnly(config), /Another publish is in progress/);
  release();
});
