#!/usr/bin/env bash
# An inventory alone cannot see directories added by a newer Pages deployment.
set -euo pipefail
repo="repos/$GITHUB_REPOSITORY"
test "$(gh api "$repo/git/ref/heads/experiment/vue3-workspace" --jq .object.sha)" = "$SOURCE"
list="$(mktemp)"
trap 'rm -f "$list"' EXIT
gh api "$repo/deployments?environment=github-pages&per_page=50" --jq '.[] | [.id,.sha] | @tsv' > "$list"
while read -r id sha; do
  states="$(gh api "$repo/deployments/$id/statuses?per_page=100" --jq '.[].state')"
  if grep -Fxq success <<<"$states"; then
    # 25f1d9f is the Pages operations commit which deployed the PR44 artifact.
    if [[ "$sha" == 25f1d9f457bbe230accc60bfbebc22c6d8d58017 || "$sha" == "$GITHUB_SHA" ]]; then
      exit 0
    fi
    echo "There is a newer Pages deployment ($sha). Take its complete archive as the baseline first." >&2
    exit 1
  fi
done < "$list"
echo "Could not identify the last successful github-pages deployment" >&2
exit 1
