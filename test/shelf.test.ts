import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanShelfAdded, cleanShelfDone } from '../functions/review-handler.ts';
import { buildShelf, chipWidth, resolveStreamChips, type BuiltPage } from '../src/bundle.js';

function page(slug: string, stream: string, updatedAt: string, streamChip = stream): BuiltPage {
  return {
    slug,
    title: slug,
    source: `examples/${slug}.html`,
    updatedAt,
    date: updatedAt,
    repository: 'examples',
    stream,
    streamLabel: stream,
    streamChip,
    objectKey: `pages/${slug}/index.html`,
  };
}

test('resolves shelf items to the latest page or link and drops finished ones', () => {
  const pages = [
    page('plan-v1', 'launch-plan', '2026-01-10T00:00:00.000Z'),
    page('plan-v2', 'launch-plan', '2026-01-12T00:00:00.000Z'),
  ];
  // 2026-01-20 09:30 JST
  const now = new Date('2026-01-20T00:30:00.000Z');
  const shelf = buildShelf([
    { id: 'no-due-link', title: 'Link without due', url: 'https://example.com/thread', added: '2026-01-15', done: false },
    { id: 'plan', title: 'Launch plan', stream: 'launch-plan', due: '2026-01-25', done: false },
    { id: 'soon', title: 'Soon', url: 'https://example.com/a', due: '2026-01-21', done: false },
    { id: 'yesterday', title: 'Due yesterday', url: 'https://example.com/b', due: '2026-01-19', done: false },
    { id: 'expired', title: 'Expired', url: 'https://example.com/c', due: '2026-01-18', done: false },
    { id: 'finished', title: 'Finished', url: 'https://example.com/d', done: true },
    { id: 'empty-stream', title: 'No pages', stream: 'unknown', done: false },
  ], pages, now);

  // 締切の近い順、締切なしは後ろ。締切の翌日までは残し、それを過ぎたら落とす
  assert.deepEqual(shelf.map((item) => item.id), ['yesterday', 'soon', 'plan', 'no-due-link']);
  const plan = shelf.find((item) => item.id === 'plan');
  assert.equal(plan?.slug, 'plan-v2');
  assert.equal(plan?.count, 2);
  assert.equal(plan?.last, '2026-01-12T00:00:00.000Z');
  const link = shelf.find((item) => item.id === 'no-due-link');
  assert.equal(link?.url, 'https://example.com/thread');
  assert.equal(link?.last, '2026-01-15');
});

test('names theme items after the theme chip unless a title is written', () => {
  const pages = [page('report', 'weekly-report', '2026-01-10T00:00:00.000Z', '週次レポート')];
  const now = new Date('2026-01-11T00:00:00.000Z');
  const shelf = buildShelf([
    { id: 'untitled', stream: 'weekly-report', done: false },
    { id: 'titled', title: '週次レポートの締め', stream: 'weekly-report', due: '2026-01-12', done: false },
    { id: 'link-only', url: 'https://example.com/thread', done: false },
  ], pages, now);
  assert.equal(shelf.find((item) => item.id === 'untitled')?.title, '週次レポート');
  assert.equal(shelf.find((item) => item.id === 'titled')?.title, '週次レポートの締め');
  // url だけの項目は、title が無ければ id を名前にする
  assert.equal(shelf.find((item) => item.id === 'link-only')?.title, 'link-only');
});

test('keeps the link of a theme item so the filter note can show it', () => {
  const pages = [page('study', 'study-group', '2026-01-10T00:00:00.000Z', '社内勉強会')];
  const [entry] = buildShelf([
    { id: 'study', stream: 'study-group', url: 'https://chat.example.com/threads/1', done: false },
  ], pages, new Date('2026-01-11T00:00:00.000Z'));
  assert.equal(entry.stream, 'study-group');
  assert.equal(entry.slug, 'study');
  assert.equal(entry.url, 'https://chat.example.com/threads/1');
});

test('resolves theme chips with fallbacks and warns about missing or long ones', () => {
  assert.equal(chipWidth('社内勉強会'), 5);
  assert.equal(chipWidth('Q3ロードマップ説明会'), 10);
  const { chips, warnings } = resolveStreamChips([
    { stream: 'release', streamLabel: '新機能リリースの準備と告知', streamChip: '新機能リリース' },
    { stream: 'release', streamLabel: '新機能リリースの準備と告知' },
    { stream: 'study', streamLabel: '社内勉強会' },
    { stream: 'study', streamChip: '社内勉強会' },
    { stream: 'weekly', streamLabel: '週次レポート' },
    { stream: 'long', streamLabel: '長い', streamChip: '四半期ごとの全社向け成果報告会' },
    { stream: 'plain' },
  ]);
  assert.equal(chips.get('release'), '新機能リリース');
  // 同じテーマのどのページに書いてもよい
  assert.equal(chips.get('study'), '社内勉強会');
  assert.equal(chips.has('weekly'), false);
  assert.equal(chips.has('plain'), false);
  assert.equal(warnings.length, 2);
  // 見出しがあるのにチップ名が無いテーマだけを挙げる（見出しも無いテーマはキーのまま出す）
  assert.match(warnings[0], /streamChip（進行中チップの短い名前）が無いテーマ: weekly$/);
  assert.match(warnings[1], /長すぎるテーマ（全角11字まで）: long「四半期ごとの全社向け成果報告会」/);
  assert.deepEqual(resolveStreamChips([{ stream: 'ok', streamLabel: '見出し', streamChip: '見出し' }]).warnings, []);
});

test('orders undated shelf items by the most recent activity', () => {
  const shelf = buildShelf([
    { id: 'older', title: 'Older', url: 'https://example.com/1', added: '2026-01-01', done: false },
    { id: 'newer', title: 'Newer', url: 'https://example.com/2', added: '2026-01-05', done: false },
  ], [], new Date('2026-01-06T00:00:00.000Z'));
  assert.deepEqual(shelf.map((item) => item.id), ['newer', 'older']);
});

test('dedupes shelf marks and keeps stored marks when an old client omits them', () => {
  assert.deepEqual(cleanShelfDone(['a', 'a', 'b'], ['old']), ['a', 'b']);
  assert.deepEqual(cleanShelfDone(undefined, ['a', 'b']), ['a', 'b']);
  assert.deepEqual(cleanShelfDone(undefined, undefined), []);
  assert.deepEqual(cleanShelfDone([], ['a']), []);
  assert.throws(() => cleanShelfDone(Array.from({ length: 301 }, (_, i) => `id-${i}`), []), /shelfDone is invalid/);
  assert.throws(() => cleanShelfDone('a', []), /shelfDone is invalid/);
});

test('dedupes added themes, caps them at 100, and keeps stored ones when omitted', () => {
  assert.deepEqual(cleanShelfAdded(['book', 'book', 'talk'], ['old']), ['book', 'talk']);
  assert.deepEqual(cleanShelfAdded(undefined, ['book', 'talk']), ['book', 'talk']);
  assert.deepEqual(cleanShelfAdded(undefined, undefined), []);
  assert.deepEqual(cleanShelfAdded(undefined, ['a', 1]), ['a']);
  assert.deepEqual(cleanShelfAdded([], ['a']), []);
  assert.equal(cleanShelfAdded(Array.from({ length: 100 }, (_, i) => `s-${i}`), []).length, 100);
  assert.throws(() => cleanShelfAdded(Array.from({ length: 101 }, (_, i) => `s-${i}`), []), /shelfAdded is invalid/);
  assert.throws(() => cleanShelfAdded('a', []), /shelfAdded is invalid/);
});
