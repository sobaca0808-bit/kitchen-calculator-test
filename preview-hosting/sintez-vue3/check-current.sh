#!/usr/bin/env bash
set -euo pipefail
repo="repos/$GITHUB_REPOSITORY"
test "$(gh api "$repo/git/ref/heads/integration/sintez-vue3" --jq .object.sha)" = "$SOURCE"
list="$(mktemp)"
trap 'rm -f "$list"' EXIT
gh api "$repo/deployments?environment=github-pages&per_page=50" --jq '.[] | [.id,.sha] | @tsv' > "$list"
while read -r id sha; do
  states="$(gh api "$repo/deployments/$id/statuses?per_page=100" --jq '.[].state')"
  if grep -Fxq success <<<"$states"; then
    # Only the last fully verified Vue experiment is the input to this first publication.
    test "$sha" = e55d2039621eeea47aaa4a54270e922bfe47b3c5
    exit 0
  fi
done < "$list"
exit 1
