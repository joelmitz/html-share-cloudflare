#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { buildOnly, publish, revive, share } from './publish.js';
import { initializeKeys, storePrivateKey } from './keys.js';
import { addPageToConfig, loadConfig } from './config.js';
import {
  claimReviews,
  completeReviews,
  listInbox,
  pair,
  pullReviews,
  pushReviews,
  stopWatching,
  watchReviews,
  type ReviewCard,
} from './review-client.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function stdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function usage(): never {
  console.error(`HTML共有くん

Usage:
  html-share build [--config file]
  html-share publish [--config file]
  html-share share <slug> [--days 7]
  html-share page add <path> [--title title] [--public]
  html-share page revive <slug> [--days 14] [--no-publish]
  html-share keys init [--overwrite]
  html-share keys store [--overwrite]
  html-share review pair <code> [--name name]
  html-share review push --session <id> [--file cards.json]
  html-share review pull [--session <id>]
  html-share review inbox
  html-share review claim <id...>
  html-share review complete <id...>
  html-share review watch --session <id> [--timeout-minutes 240]
  html-share review stop --session <id>`);
  process.exit(2);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || flag('--help') || flag('-h')) usage();

  if (command === 'page' && process.argv[3] === 'revive') {
    const query = process.argv[4];
    if (!query) usage();
    const config = loadConfig(option('--config'));
    const days = option('--days') === undefined ? undefined : Number(option('--days'));
    const { page, keep } = revive(config, query, days);
    // keep を書いた設定を読み直してから publish する
    const published = flag('--no-publish') ? undefined : await publish(loadConfig(option('--config')));
    console.log(JSON.stringify({ ok: true, revived: page.slug, title: page.title, keep, ...(published ? { published } : { next: 'html-share publish' }) }, null, 2));
    return;
  }
  // page add は addPageToConfig() が生YAMLを直接読み書きするだけで、loadConfig()
  // が要求するcontent.pagesの非空制約を必要としない。新規セットアップ直後
  // （content.pagesがまだ空）で最初の1件を追加するための唯一の手段でもあるため、
  // 他コマンドより先に、loadConfig()を呼ばずに処理する。
  if (command === 'page') {
    const action = process.argv[3];
    const pagePath = process.argv[4];
    if (action !== 'add' || !pagePath) usage();
    // 既定は'internal'（internal Worker限定）。外部共有したいときだけ
    // --publicを明示する（誤って個人的な内容を外部共有してしまう事故を防ぐ既定値）
    const visibility = flag('--public') ? 'public' : 'internal';
    const added = addPageToConfig(option('--config'), pagePath, option('--title'), visibility);
    console.log(JSON.stringify({ ok: true, added, path: pagePath, visibility }));
    return;
  }

  const config = loadConfig(option('--config'));

  if (command === 'build') {
    const result = buildOnly(config);
    console.log(JSON.stringify({
      ok: true,
      pages: result.manifest.pages.length,
      archived: result.manifest.archived.length,
      buildRoot: result.buildRoot,
    }, null, 2));
    return;
  }
  if (command === 'publish') {
    console.log(JSON.stringify({ ok: true, ...(await publish(config)) }, null, 2));
    return;
  }
  if (command === 'share') {
    const query = process.argv[3];
    if (!query) usage();
    const days = Number(option('--days') ?? 7);
    console.log(await share(config, query, days));
    return;
  }
  if (command === 'keys') {
    const action = process.argv[3];
    if (action === 'init') {
      const result = initializeKeys(config, flag('--overwrite'));
      console.log(JSON.stringify({ ok: true, publicKeyPath: result.publicKeyPath, privateKeyPath: result.privateKeyPath }, null, 2));
      return;
    }
    if (action === 'store') {
      await storePrivateKey(config, flag('--overwrite'));
      console.log(JSON.stringify({ ok: true, secrets: ['console:SIGNING_PRIVATE_KEY', 'content:SIGNING_PUBLIC_KEY'] }));
      return;
    }
    usage();
  }
  if (command === 'review') {
    const action = process.argv[3];
    if (action === 'pair') {
      const code = process.argv[4];
      if (!code) usage();
      console.log(JSON.stringify({ ok: true, deviceName: await pair(config, code, option('--name')) }));
      return;
    }
    if (action === 'push') {
      const sessionId = option('--session');
      if (!sessionId) usage();
      const source = option('--file') ? readFileSync(option('--file')!, 'utf8') : await stdin();
      const input = JSON.parse(source) as ReviewCard | ReviewCard[];
      const cards = Array.isArray(input) ? input : [input];
      console.log(JSON.stringify({ ok: true, items: await pushReviews(config, sessionId, cards) }, null, 2));
      return;
    }
    if (action === 'pull') {
      console.log(JSON.stringify({ ok: true, items: await pullReviews(config, option('--session')) }, null, 2));
      return;
    }
    if (action === 'inbox') {
      const requests = await listInbox(config);
      // Keep requests pending until their independent destination is confirmed. Claim each waiting
      // request first; requests already `in_progress` were claimed by this computer (e.g. before a
      // restart) and must be resumed, not claimed again.
      const next = requests.length
        ? 'Oldest first. Each request has a `status`. Claim each "waiting" one before dispatching it: `html-share review claim <id>`.'
          + ' A 409 means another computer already claimed it, so skip it. "in_progress" requests are already yours (likely claimed before a restart): do not claim again, resume them.'
          + ' Verify each target repository and follow the inbox skill to launch one session per independent request.'
          + ' Continue here only when both repository and topic match. Serialize overlapping work.'
          + ' Record and verify the destination before `html-share review complete <id>`.'
          + ' Keep failed, ambiguous, or waiting requests open. Reuse existing dispatch receipts instead of relaunching.'
          + ' `target` is a nickname hint, not a filesystem path.'
        : undefined;
      console.log(JSON.stringify({ ok: true, requests, ...(next ? { next } : {}) }, null, 2));
      return;
    }
    if (action === 'claim') {
      const ids = process.argv.slice(4).filter((value) => !value.startsWith('--'));
      if (!ids.length) usage();
      const results = await claimReviews(config, ids);
      console.log(JSON.stringify({ ok: true, results }, null, 2));
      return;
    }
    if (action === 'complete') {
      const ids = process.argv.slice(4).filter((value) => !value.startsWith('--'));
      if (!ids.length) usage();
      await completeReviews(config, ids);
      console.log(JSON.stringify({ ok: true, completed: ids }));
      return;
    }
    if (action === 'watch') {
      const sessionId = option('--session');
      if (!sessionId) usage();
      const timeoutMinutes = Number(option('--timeout-minutes') ?? 240);
      console.log(JSON.stringify({ ok: true, items: await watchReviews(config, sessionId, timeoutMinutes) }, null, 2));
      return;
    }
    if (action === 'stop') {
      const sessionId = option('--session');
      if (!sessionId) usage();
      console.log(JSON.stringify({ ok: true, stopped: stopWatching(sessionId) }));
      return;
    }
    usage();
  }
  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
