#!/usr/bin/env bash
# upstream のタグオブジェクトを fork に追加する。既存タグは一切書き換えない。
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo 'usage: sync-upstream-tags.sh <fork-remote> <upstream-remote>' >&2
  exit 2
fi

fork_remote=$1
upstream_remote=$2

# ローカルの refs/tags を変更せず、比較用の名前空間へ実際のリモート参照を取得する。
git fetch --no-tags "$fork_remote" '+refs/heads/main:refs/sync-tags/fork-main'
git fetch --no-tags "$upstream_remote" '+refs/heads/main:refs/sync-tags/upstream-main'
git fetch --prune --no-tags "$fork_remote" '+refs/tags/*:refs/sync-tags/fork/*'
git fetch --prune --no-tags "$upstream_remote" '+refs/tags/*:refs/sync-tags/upstream/*'

if ! git merge-base --is-ancestor refs/sync-tags/upstream-main refs/sync-tags/fork-main; then
  echo 'fork main has not incorporated upstream main; refusing to sync tags' >&2
  exit 1
fi

missing=()
while IFS= read -r upstream_ref; do
  tag=${upstream_ref#refs/sync-tags/upstream/}
  fork_ref="refs/sync-tags/fork/$tag"
  upstream_object=$(git rev-parse "$upstream_ref")

  if git show-ref --verify --quiet "$fork_ref"; then
    fork_object=$(git rev-parse "$fork_ref")
    if [ "$fork_object" != "$upstream_object" ]; then
      echo "tag $tag differs in fork; refusing to overwrite it" >&2
      exit 1
    fi
    continue
  fi

  if ! target=$(git rev-parse --verify "$upstream_ref^{commit}" 2>/dev/null) ||
     ! git merge-base --is-ancestor "$target" refs/sync-tags/fork-main; then
    echo "tag $tag does not point to a commit in fork main; refusing to push it" >&2
    exit 1
  fi
  missing+=("$upstream_ref:refs/tags/$tag")
done < <(git for-each-ref --format='%(refname)' refs/sync-tags/upstream)

if [ "${#missing[@]}" -eq 0 ]; then
  echo 'upstream tags are already in sync'
  exit 0
fi

# force を使わず、一括 push。annotated tag も元のタグオブジェクトのまま移す。
git push --atomic "$fork_remote" "${missing[@]}"
echo "synced ${#missing[@]} upstream tag(s)"
