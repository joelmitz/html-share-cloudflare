#!/usr/bin/env bash
# upstream package.json の version だけを fork の package/lock に反映する。
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo 'usage: sync-upstream-version.sh <fork-remote> <upstream-remote>' >&2
  exit 2
fi

fork_remote=$1
upstream_remote=$2
if [ -n "$(git status --porcelain=v1)" ]; then
  echo 'working tree is not clean; refusing to update version' >&2
  exit 1
fi

git fetch --no-tags "$fork_remote" '+refs/heads/main:refs/sync-version/fork-main'
git fetch --no-tags "$upstream_remote" '+refs/heads/main:refs/sync-version/upstream-main'
if [ "$(git rev-parse HEAD)" != "$(git rev-parse refs/sync-version/fork-main)" ] ||
   ! git merge-base --is-ancestor refs/sync-version/upstream-main HEAD; then
  echo 'fork main is not the checked-out, synchronized HEAD; refusing to update version' >&2
  exit 1
fi

upstream_version=$(git show refs/sync-version/upstream-main:package.json |
  node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const value = JSON.parse(data).version; if (typeof value !== "string") process.exit(1); process.stdout.write(value); });')
echo "upstream package version: $upstream_version"

# npm version は package.json と package-lock.json のルート版数を揃える。
# lifecycle script、タグ作成、Git commit の自動実行は抑止する。
npm version "$upstream_version" --allow-same-version --no-git-tag-version --ignore-scripts
while IFS= read -r changed; do
  case "$changed" in
    package.json|package-lock.json) ;;
    *) echo "unexpected version change: $changed" >&2; exit 1 ;;
  esac
done < <(git diff --name-only)
if git diff --quiet -- package.json package-lock.json; then
  echo 'fork package version is already in sync'
  exit 0
fi

git add -- package.json package-lock.json
git diff --cached --check
git -c user.name='html-share sync' -c user.email='github-actions[bot]@users.noreply.github.com' \
  commit -m "chore: upstream package version $upstream_version に同期"
git push "$fork_remote" HEAD:refs/heads/main
echo "synced fork package version to $upstream_version"
