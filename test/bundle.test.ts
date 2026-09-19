import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSite, bundleHtml, slugify } from '../src/bundle.js';
import type { HtmlShareConfig } from '../src/config.js';

test('bundles local assets and adds privacy metadata', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-bundle-'));
  writeFileSync(path.join(root, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(path.join(root, 'page.html'), '<!doctype html><html><head><title>Demo</title></head><body><img src="pixel.png"></body></html>');
  const bundled = bundleHtml(path.join(root, 'page.html'), [realpathSync(root)], 1024);
  assert.match(bundled, /data:image\/png;base64,/);
  assert.match(bundled, /name="robots" content="noindex/);
  assert.match(bundled, /name="referrer" content="no-referrer"/);
  assert.match(bundled, /table\[data-mb-view="card"\]/);
  assert.match(bundled, /data-mb-tables/);
  assert.match(bundled, /\.cal-grid\[data-mb-cal="list"\]/);
});

test('rejects pages outside approved roots, including symlinks', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-root-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'html-share-outside-'));
  const secret = path.join(outside, 'secret.html');
  writeFileSync(secret, '<p>outside</p>');
  const link = path.join(root, 'linked.html');
  symlinkSync(secret, link);
  assert.throws(() => bundleHtml(link, [realpathSync(root)], 1024), /outside content\.roots/);
});

test('creates stable ASCII slugs', () => {
  assert.equal(slugify('Release Notes 2026'), 'release-notes-2026');
  assert.match(slugify('共有結果'), /^page-[a-f0-9]{8}$/);
});

test('includes share capabilities in the generated manifest without exposing CIDRs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-manifest-'));
  const page = path.join(root, 'page.html');
  writeFileSync(page, '<h1>Demo</h1>');
  const config = {
    ownerEmail: 'owner@example.com',
    aws: {
      region: 'ap-northeast-1',
      consoleDomain: 'console.example.com',
      contentDomain: 'content.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:111122223333:certificate/00000000-0000-4000-8000-000000000000',
      cognitoDomainPrefix: 'html-share-test',
      publicKeyPath: '.html-share/keys/public.pem',
      privateKeyPath: '.html-share/keys/private.pem',
      privateKeyParameterName: '/html-share/test/private-key',
    },
    content: {
      roots: ['.'],
      pages: [{ path: 'page.html' }],
      ownerLinkDays: 7,
      maximumShareDays: 30,
      maximumAssetBytes: 1024,
      allowedInternalCidrs: ['203.0.113.0/24'],
      siteName: '#HTML共有くん',
    },
    configFile: path.join(root, 'html-share.config.yaml'),
    baseDir: root,
  } satisfies HtmlShareConfig;

  const manifest = buildSite(config, path.join(root, 'build'));
  assert.equal(manifest.internalSharing, true);
  assert.equal(manifest.maximumShareDays, 30);
  assert.doesNotMatch(JSON.stringify(manifest), /203\.0\.113/);
});

test('adds link preview tags after the charset declaration', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-ogp-'));
  writeFileSync(
    path.join(root, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>四半期の振り返り</title></head>'
      + '<body><div class="hero"><p class="sub">売上と稼働を1枚にまとめました</p></div>'
      + '<p>本文の最初の段落です</p></body></html>',
  );
  const bundled = bundleHtml(path.join(root, 'page.html'), [realpathSync(root)], 1024, {
    siteName: '#HTML共有くん',
  });

  assert.match(bundled, /<meta property="og:site_name" content="#HTML共有くん">/);
  assert.match(bundled, /<meta property="og:title" content="四半期の振り返り">/);
  // 説明文はヒーローのリード文から拾う
  assert.match(bundled, /<meta property="og:description" content="売上と稼働を1枚にまとめました">/);
  // 画像を設定していないので og:image は出さず、カードは小さいほうを指定する
  assert.doesNotMatch(bundled, /og:image/);
  assert.match(bundled, /<meta name="twitter:card" content="summary">/);

  // 文字コード宣言より後ろに入っていること。日本語が charset より前に出ると
  // クローラー側が文字化けしうる（文字コードは先頭1024バイトまでに宣言する決まり）。
  assert.ok(bundled.indexOf('charset') < bundled.indexOf('og:title'));
  assert.ok(Buffer.byteLength(bundled.slice(0, bundled.indexOf('charset'))) < 1024);
});

test('uses the configured image and title for link previews', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-ogp-image-'));
  writeFileSync(
    path.join(root, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>もとの題</title></head><body><p>本文</p></body></html>',
  );
  const bundled = bundleHtml(path.join(root, 'page.html'), [realpathSync(root)], 1024, {
    siteName: 'My Share',
    title: '設定で付けた題',
    imageUrl: 'https://example.com/og.png',
  });

  assert.match(bundled, /<meta property="og:title" content="設定で付けた題">/);
  assert.match(bundled, /<meta property="og:image" content="https:\/\/example\.com\/og\.png">/);
  assert.match(bundled, /<meta name="twitter:card" content="summary_large_image">/);
});

test('leaves pages that already declare their own link preview alone', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-ogp-own-'));
  writeFileSync(
    path.join(root, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta property="og:title" content="自前の題"><title>別の題</title></head><body><p>本文</p></body></html>',
  );
  const bundled = bundleHtml(path.join(root, 'page.html'), [realpathSync(root)], 1024, {
    siteName: '#HTML共有くん',
  });

  assert.match(bundled, /<meta property="og:title" content="自前の題">/);
  assert.doesNotMatch(bundled, /og:site_name/);
});

test('adds nothing when link previews are not configured', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'html-share-ogp-off-'));
  writeFileSync(
    path.join(root, 'page.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>題</title></head><body><p>本文</p></body></html>',
  );
  const bundled = bundleHtml(path.join(root, 'page.html'), [realpathSync(root)], 1024);
  assert.doesNotMatch(bundled, /og:/);
});
