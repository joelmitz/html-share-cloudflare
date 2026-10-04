#!/usr/bin/env node
// Static checks for pages built with the create-html skill.
//   node skills/create-html/scripts/check-html.mjs <file.html> [...]
// Prints NG lines for defects and WARN lines for things to review. Exits 1 when any NG is found.
// Each check targets a failure that renders silently: the page still opens, but text vanishes,
// a band disappears, or everything below a point loses its container.
import { readFileSync } from 'node:fs';

export function checkHtml(source) {
  const ng = [];
  const warn = [];
  const css = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (source.split(/<body\b[^>]*>/i)[1] ?? '').split(/<\/body>/i)[0];
  const text = body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), decl: m[2] }));
  const has = (re) => re.test(source);

  // Document skeleton. A fragment without meta charset is decoded as Latin-1 once it is served.
  if (!/^\s*<!doctype html>/i.test(source)) ng.push('missing <!doctype html>');
  if (!/<html\b[^>]*\blang=/i.test(source)) ng.push('<html> has no lang attribute');
  if (!/<meta\s+charset=["']?utf-8/i.test(source)) ng.push('missing <meta charset="utf-8">');
  if (!/name=["']viewport["']/i.test(source)) ng.push('missing viewport meta');
  if (!/name=["']robots["'][^>]*noindex/i.test(source)) ng.push('missing robots noindex meta');
  if (/\{\{[A-Z0-9_]+\}\}/.test(source)) ng.push('unresolved {{PLACEHOLDER}}');

  // Stylesheet structure. Copying CSS together with its <style> tags closes the sheet early.
  const opens = (source.match(/<style\b/gi) ?? []).length;
  const closes = (source.match(/<\/style>/gi) ?? []).length;
  if (opens !== closes) ng.push(`<style> open/close mismatch (${opens}/${closes})`);
  if (/<style\b[^>]*>(?:(?!<\/style>)[\s\S])*<style\b/i.test(source)) ng.push('<style> nested inside <style>');

  // Markdown habits leaking into HTML: the asterisks render as-is.
  if (/\*\*[^*\s][^*]*\*\*/.test(text)) ng.push('Markdown **bold** in page text; use <b>');

  // Hero: inherited white loses to any later bare `p{color:...}`, so paint every descendant.
  if (has(/class=["'][^"']*\bhero\b/) && !/\.hero\s*,\s*\.hero\s*\*\s*\{[^}]*color\s*:\s*#fff/i.test(css)) {
    ng.push('hero text is not forced white with `.hero, .hero * { color: #fff }`');
  }
  const hero = rules.find((r) => /^\.hero$/.test(r.sel));
  const heroPad = hero?.decl.match(/padding(?:-top)?\s*:\s*([^;]+)/)?.[1] ?? '';
  if (hero && heroPad) {
    const px = Number(heroPad.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
    if (!heroPad.includes('safe-area-inset-top') || px < 64) {
      ng.push('hero top padding must be calc(64px + env(safe-area-inset-top, 0px)) or more; the floating page tools cover 52px');
    }
  }

  // Tables: without an explicit <thead> the browser builds only <tbody> and the header band vanishes.
  if (has(/<table\b/i) && has(/<th\b/i) && !has(/<thead\b/i)) ng.push('<table> uses <th> without an explicit <thead>');
  if (rules.some((r) => /(^|[\s,>])th\b/.test(r.sel) && /gradient|--[\w-]*grad\b/.test(r.decl))) ng.push('gradient on th restarts per cell; put it on thead');
  if (rules.some((r) => /(^|[\s,>])table\b/.test(r.sel) && /min-width\s*:\s*[1-9]/.test(r.decl))) ng.push('table has min-width; it forces horizontal overflow on phones');
  if (has(/class=["'][^"']*\bcard\b/) && has(/<table\b/i) && !/\.card\s+thead\s*\{[^}]*background-image\s*:\s*none/i.test(css)) {
    ng.push('tables inside cards need `.card thead { background-image: none }` so bands do not nest');
  }

  // Code blocks: `.wrap code` (0,1,1) beats a bare `pre code` (0,0,2) and paints white text on a pale background.
  if (rules.some((r) => /^(pre|code|pre\s+code)$/.test(r.sel)) && has(/class=["'][^"']*\bwrap\b/)) {
    ng.push('bare pre/code rule next to .wrap; scope it as `.wrap pre` / `.wrap pre code` with explicit color');
  }

  // A decorated quote box: tinted background + thick left rule + rounded corners + padding in one rule.
  for (const r of rules) {
    const d = r.decl;
    if (/background(-color)?\s*:\s*(?!transparent|none)/.test(d) && /border-left\s*:\s*([3-9]|\d\d)px/.test(d)
      && /border-radius/.test(d) && /padding/.test(d)) {
      ng.push(`decorated quote box in \`${r.sel}\`; use either a light surface or a thin rule, not both`);
    }
  }

  // Unbalanced <div>: an extra close ends .wrap early and every later section runs full width.
  const divDelta = (body.match(/<div\b/gi) ?? []).length - (body.match(/<\/div>/gi) ?? []).length;
  if (divDelta) ng.push(`<div> open/close delta ${divDelta > 0 ? '+' : ''}${divDelta}`);

  // Stray characters from another script. They look like the intended glyphs and pass proofreading.
  if (/<html\b[^>]*\blang=["']ja/i.test(source)) {
    const stray = [...new Set(text.match(/[Ѐ-ӿᄀ-ᇿ㄰-㆏가-힯]/g) ?? [])];
    if (stray.length) ng.push(`unexpected Hangul/Cyrillic characters in Japanese text: ${stray.join(' ')}`);
  }

  // SVG shapes outside the viewBox are clipped and disappear without an error.
  let fig = 0;
  for (const m of source.matchAll(/<svg\b[^>]*viewBox=["']\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)["'][^>]*>([\s\S]*?)<\/svg>/gi)) {
    fig += 1;
    const [w, h] = [Number(m[1]), Number(m[2])];
    const over = [];
    for (const r of m[3].matchAll(/<rect\b[^>]*?\bx=["'](-?[\d.]+)["'][^>]*?\by=["'](-?[\d.]+)["'][^>]*?\bwidth=["']([\d.]+)["'][^>]*?\bheight=["']([\d.]+)["']/gi)) {
      const [x, y, rw, rh] = r.slice(1).map(Number);
      if (x < 0 || y < 0 || x + rw > w || y + rh > h) over.push(`rect(${x},${y},${rw},${rh})`);
    }
    for (const t of m[3].matchAll(/<text\b[^>]*?\bx=["'](-?[\d.]+)["'][^>]*?\by=["'](-?[\d.]+)["']/gi)) {
      const [x, y] = t.slice(1).map(Number);
      if (x < 0 || y < 0 || x > w || y > h) over.push(`text(${x},${y})`);
    }
    if (over.length) ng.push(`svg #${fig} (viewBox ${w}x${h}) has shapes outside: ${over.slice(0, 5).join(' ')}`);
  }

  // Review items, not defects.
  if (!has(/<svg\b/i) && !has(/<img\b/i)) warn.push('no figure on the page; check whether a schedule, flow, or structure would read better as a diagram');
  const tables = (source.match(/<table\b/gi) ?? []).length;
  if (tables > 5) warn.push(`${tables} tables; more than five usually means the structure, not the content, is heavy`);
  const kb = Buffer.byteLength(source) / 1024;
  if (kb > 1024) warn.push(`page is ${Math.round(kb)} KB; embedded images above about 1 MB slow every later check`);

  return { ng, warn };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: check-html.mjs <file.html> [...]');
    process.exit(2);
  }
  let failed = false;
  for (const file of files) {
    const { ng, warn } = checkHtml(readFileSync(file, 'utf8'));
    for (const line of ng) console.log(`NG   ${file}: ${line}`);
    for (const line of warn) console.log(`WARN ${file}: ${line}`);
    if (!ng.length) console.log(`OK   ${file}`);
    failed ||= ng.length > 0;
  }
  process.exit(failed ? 1 : 0);
}
