#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
script=$(cd "$(dirname "$0")/.." && pwd)/scripts/sync-upstream-tags.sh

git init -q --bare "$root/fork.git"
git init -q --bare "$root/upstream.git"
git init -q "$root/source"
git -C "$root/source" config user.name 'Tag Sync Test'
git -C "$root/source" config user.email 'tag-sync@example.invalid'
git -C "$root/source" checkout -q -b main
echo base > "$root/source/page"
git -C "$root/source" add page
git -C "$root/source" commit -qm base
git -C "$root/source" remote add fork "$root/fork.git"
git -C "$root/source" remote add upstream "$root/upstream.git"
git -C "$root/source" push -q fork main
git -C "$root/source" push -q upstream main

git -C "$root/source" tag -a v0.1.0 -m 'release 0.1.0'
git -C "$root/source" tag v0.2.0
git -C "$root/source" push -q upstream --tags
git clone -q -b main "$root/fork.git" "$root/work"
git -C "$root/work" remote add upstream "$root/upstream.git"
cd "$root/work"

bash "$script" origin upstream
for tag in v0.1.0 v0.2.0; do
  upstream_oid=$(git -C "$root/source" rev-parse "refs/tags/$tag")
  fork_oid=$(git --git-dir="$root/fork.git" rev-parse "refs/tags/$tag")
  test "$upstream_oid" = "$fork_oid"
done
bash "$script" origin upstream

# 同名タグが異なる場合は上書きしない。
git -C "$root/work" config user.name 'Tag Sync Test'
git -C "$root/work" config user.email 'tag-sync@example.invalid'
echo fork >> "$root/work/page"
git -C "$root/work" add page
git -C "$root/work" commit -qm fork-only
git -C "$root/work" push -q origin main
git -C "$root/work" tag -f v0.2.0
git -C "$root/work" push -q --force origin refs/tags/v0.2.0
if bash "$script" origin upstream > "$root/output" 2>&1; then
  echo 'conflicting tag was accepted' >&2
  exit 1
fi
grep -q 'refusing to overwrite' "$root/output"

# upstream main が未取り込みなら、新しいタグは追加しない。
echo upstream >> "$root/source/page"
git -C "$root/source" add page
git -C "$root/source" commit -qm upstream-only
git -C "$root/source" tag v0.3.0
git -C "$root/source" push -q upstream main refs/tags/v0.3.0
if bash "$script" origin upstream > "$root/output" 2>&1; then
  echo 'tag for unsynced upstream main was accepted' >&2
  exit 1
fi
grep -q 'has not incorporated upstream main' "$root/output"
if git --git-dir="$root/fork.git" show-ref --verify --quiet refs/tags/v0.3.0; then
  echo 'unsynced tag appeared in fork' >&2
  exit 1
fi

echo 'tag sync tests passed'
