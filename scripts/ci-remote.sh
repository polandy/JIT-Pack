#!/usr/bin/env bash
#
# Run the full pipeline on GitHub for the current branch, instead of on this
# machine.
#
# Why this exists: `make ci` is the fast local gate (~80 s) and stays local,
# but the jobs it deliberately excludes -- `e2e`, `visual`, `docker-build` and
# the coverage profile -- need docker, a browser and real cores. On a laptop
# they are the single largest source of contention, and every one of them
# already runs on GitHub for free. Before `workflow_dispatch` existed the only
# way to get them there was to open a pull request, so they got run locally
# instead. This is the front door that makes the cheap option also the easy one.
#
# It waits for the run it started -- not merely the newest run -- by recording
# the newest run id *before* dispatching and polling until a different one
# appears for this branch. That is a loop on a condition rather than a fixed
# wait, so it cannot report on somebody else's run or give up early.
#
# Exits non-zero when the run fails, so it composes in a shell chain.
set -euo pipefail

WORKFLOW=ci.yml

command -v gh >/dev/null || { echo "ci-remote: the GitHub CLI (gh) is not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ci-remote: gh is not authenticated -- run 'gh auth login'" >&2; exit 1; }

branch=$(git branch --show-current)
[ -n "$branch" ] || { echo "ci-remote: detached HEAD -- check out a branch first" >&2; exit 1; }
if [ "$branch" = "main" ]; then
  echo "ci-remote: refusing to dispatch on main -- work happens on a feature branch" >&2
  exit 1
fi

# The dispatch runs whatever the *remote* branch holds, so an unpushed commit
# would silently be checked in its absence. Push first, always.
echo "ci-remote: pushing $branch"
git push --set-upstream origin "$branch"

newest_run() {
  gh run list --workflow "$WORKFLOW" --branch "$branch" --limit 1 \
    --json databaseId --jq '.[0].databaseId // empty'
}

before=$(newest_run)
echo "ci-remote: dispatching $WORKFLOW on $branch"
gh workflow run "$WORKFLOW" --ref "$branch"

echo -n "ci-remote: waiting for the run to be created"
until id=$(newest_run); [ -n "$id" ] && [ "$id" != "$before" ]; do
  echo -n .
  sleep 2
done
echo

echo "ci-remote: $(gh run view "$id" --json url --jq .url)"
exec gh run watch "$id" --exit-status
