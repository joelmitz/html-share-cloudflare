import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error plain ESM script without type declarations
import { checkHtml } from '../skills/create-html/scripts/check-html.mjs';

const template = readFileSync(new URL('../skills/create-html/assets/brief-template.html', import.meta.url), 'utf8');
const filled = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key: string) => `サンプル ${key.toLowerCase()}`);

test('the filled template passes every check', () => {
  const { ng, warn } = checkHtml(filled);
  assert.deepEqual(ng, []);
  assert.deepEqual(warn, []);
});

test('the untouched template reports its placeholders', () => {
  assert.ok(checkHtml(template).ng.some((line: string) => line.includes('PLACEHOLDER')));
});

const breakages: Array<[string, (html: string) => string, RegExp]> = [
  ['missing charset', (h) => h.replace('<meta charset="utf-8">', ''), /charset/],
  ['missing robots', (h) => h.replace(/<meta name="robots"[^>]*>/, ''), /robots/],
  ['style tags copied into the sheet', (h) => h.replace(':root {', '<style>\n:root {'), /<style>/],
  ['Markdown bold in text', (h) => h.replace('<p class="sub">', '<p class="sub">**重要**'), /Markdown/],
  ['hero relies on inheritance', (h) => h.replace('.hero, .hero * { color: #fff; }', '.hero { color: #fff; }'), /forced white/],
  ['hero hidden under the page tools', (h) => h.replace('calc(64px + env(safe-area-inset-top, 0px)) 0 46px', '40px 0 46px'), /top padding/],
  ['table without thead', (h) => h.replace(/<thead>([\s\S]*?)<\/thead>/, '$1'), /thead/],
  ['gradient on th', (h) => h.replace('.wrap th { padding', '.wrap th { background-image: var(--blue-grad); padding'), /restarts per cell/],
  ['table min-width', (h) => h.replace('.wrap table { width: 100%;', '.wrap table { width: 100%; min-width: 600px;'), /min-width/],
  ['band nested in a card', (h) => h.replace('.card thead { background-image: none; background: var(--soft); }', ''), /nest/],
  ['bare pre code', (h) => h.replace('.wrap pre code {', 'pre code {'), /bare pre\/code/],
  ['decorated quote box', (h) => h.replace('.callout { margin: 22px 0;', '.callout { border-left: 5px solid var(--gold); margin: 22px 0;'), /decorated quote/],
  ['extra closing div', (h) => h.replace('<footer>', '</div><footer>'), /<div> open\/close/],
  ['stray Hangul character', (h) => h.replace('<p class="sub">', '<p class="sub">설명'), /Hangul/],
  ['shape outside the viewBox', (h) => h.replace('<rect x="460" y="30" width="170"', '<rect x="560" y="30" width="170"'), /outside/],
];

for (const [name, breakIt, expected] of breakages) {
  test(`detects: ${name}`, () => {
    const { ng } = checkHtml(breakIt(filled));
    assert.ok(ng.some((line: string) => expected.test(line)), `expected ${expected} in ${JSON.stringify(ng)}`);
  });
}

test('warns when a page has no figure', () => {
  const { ng, warn } = checkHtml(filled.replace(/<figure[\s\S]*?<\/figure>/, ''));
  assert.deepEqual(ng, []);
  assert.ok(warn.some((line: string) => line.includes('no figure')));
});
