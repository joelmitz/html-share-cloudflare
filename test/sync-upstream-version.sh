#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
script=$(cd "$(dirname "$0")/.." && pwd)/scripts/sync-upstream-version.sh

git init -q --bare "$root/fork.git"
git init -q --bare "$root/upstream.git"
git init -q "$root/source"
git -C "$root/source" config user.name 'Version Sync Test'
git -C "$root/source" config user.email 'version-sync@example.invalid'
git -C "$root/source" checkout -q -b main
cat > "$root/source/package.json" <<'JSON'
{"name":"@minorun365/html-share","version":"0.1.0","private":true}
JSON
cat > "$root/source/package-lock.json" <<'JSON'
{"name":"@minorun365/html-share","version":"0.1.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"@minorun365/html-share","version":"0.1.0"}}}
JSON
git -C "$root/source" add package.json package-lock.json
git -C "$root/source" commit -qm base
git -C "$root/source" remote add fork "$root/fork.git"
git -C "$root/source" remote add upstream "$root/upstream.git"
git -C "$root/source" push -q fork main
git -C "$root/source" push -q upstream main

git clone -q -b main "$root/fork.git" "$root/work"
git -C "$root/work" config user.name 'Version Sync Test'
git -C "$root/work" config user.email 'version-sync@example.invalid'
git -C "$root/work" remote add upstream "$root/upstream.git"
node - "$root/work" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
for (const file of ['package.json', 'package-lock.json']) {
  const target = path.join(process.argv[2], file);
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));
  data.name = '@joelmitz/html-share-cloudflare';
  if (file === 'package-lock.json') data.packages[''].name = data.name;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
}
NODE
git -C "$root/work" add package.json package-lock.json
git -C "$root/work" commit -qm fork-identity
git -C "$root/work" push -q origin main

(cd "$root/source" && npm version 0.2.0 --no-git-tag-version --ignore-scripts > /dev/null)
git -C "$root/source" add package.json package-lock.json
git -C "$root/source" commit -qm upstream-version
git -C "$root/source" push -q upstream main
git -C "$root/work" fetch -q upstream main
git -C "$root/work" merge -q -s ours --no-edit FETCH_HEAD
git -C "$root/work" push -q origin main

cd "$root/work"
before=$(git rev-parse HEAD)
bash "$script" origin upstream
test "$(git diff --name-only "$before" HEAD | sort)" = "$(printf 'package-lock.json\npackage.json' | sort)"
node - <<'NODE'
const fs = require('node:fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const l = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
if (p.name !== '@joelmitz/html-share-cloudflare' || p.version !== '0.2.0' ||
    l.name !== p.name || l.version !== p.version || l.packages[''].version !== p.version) process.exit(1);
NODE
synced=$(git rev-parse HEAD)
bash "$script" origin upstream
test "$(git rev-parse HEAD)" = "$synced"

(cd "$root/source" && npm version 0.3.0 --no-git-tag-version --ignore-scripts > /dev/null)
git -C "$root/source" add package.json package-lock.json
git -C "$root/source" commit -qm newer-upstream-version
git -C "$root/source" push -q upstream main
if bash "$script" origin upstream > "$root/output" 2>&1; then
  echo 'accepted a version from unsynchronized upstream main' >&2
  exit 1
fi
grep -q 'not the checked-out, synchronized HEAD' "$root/output"
test "$(git rev-parse HEAD)" = "$synced"

echo 'version sync tests passed'
