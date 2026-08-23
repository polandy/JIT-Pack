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
# Identifying the right run is the fiddly part. The push below triggers a
# `pull_request` run of this same workflow whenever the branch already has a
# PR open, so "watch the newest run on this branch" would usually watch *that*
# one -- and it would look entirely correct while reporting on a different set
# of commits than the dispatch. The listing is therefore filtered to
# `workflow_dispatch` runs, and the newest one is recorded before dispatching
# so the wait ends on a genuinely new id rather than a stale one.
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

# The dispatch checks the commit, not the working tree -- unlike `make ci`,
# which checks what is on disk. A tracked-but-uncommitted change would there-
# fore earn a green verdict for code the developer does not have, which is the
# one failure mode this tool must not have. Untracked files are fine: they
# cannot be part of what CI would build anyway.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ci-remote: tracked changes are not committed. CI would check the commit," >&2
  echo "           not your working tree, so the verdict would not be about your" >&2
  echo "           code. Commit (or stash) first:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

# The dispatch runs whatever the *remote* branch holds, so an unpushed commit
# would silently be checked in its absence. Push first, always.
echo "ci-remote: pushing $branch"
git push --set-upstream origin "$branch"

# Only dispatched runs: see the header -- the push above may have started a
# `pull_request` run of the same workflow on the same branch.
newest_run() {
  gh run list --workflow "$WORKFLOW" --branch "$branch" --event workflow_dispatch \
    --limit 1 --json databaseId --jq '.[0].databaseId // empty'
}

before=$(newest_run)
echo "ci-remote: dispatching $WORKFLOW on $branch"
if ! gh workflow run "$WORKFLOW" --ref "$branch"; then
  echo "ci-remote: dispatch failed. GitHub only honours a workflow_dispatch trigger" >&2
  echo "           once it exists on the default branch -- if ci.yml gained it on a" >&2
  echo "           branch that has not merged yet, that is the reason." >&2
  exit 1
fi

# Bounded: a dispatch that produces no run at all must fail loudly rather than
# spin. Two minutes is far beyond the queueing delay actually observed.
deadline=$((SECONDS + 120))
echo -n "ci-remote: waiting for the run to be created"
until id=$(newest_run); [ -n "$id" ] && [ "$id" != "$before" ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo
    echo "ci-remote: dispatched, but no new run appeared within 120 s. Check" >&2
    echo "           gh run list --workflow $WORKFLOW --branch $branch" >&2
    exit 1
  fi
  echo -n .
  sleep 2
done
echo

echo "ci-remote: $(gh run view "$id" --json url --jq .url)"
exec gh run watch "$id" --exit-status
