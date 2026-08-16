#!/usr/bin/env bash
#
# Visual baselines (ADR-013).
#
# One command with two callers — `make visual` and the CI `visual` job — for
# the same reason scripts/coverage-gate.sh has two: the thing that must not
# drift is the *invocation*, and a copy in the workflow would drift the first
# time somebody added a project.
#
# It deliberately does not go through the Makefile. The Makefile guards its
# whole toolchain at parse time (go, gofmt, golangci-lint, node, npm), and a
# GitHub runner has no golangci-lint and no mise — so `make visual` there
# fails before running anything, on a tool the baselines do not use.
#
# Pass --update-snapshots to rewrite the baselines.
set -euo pipefail

# Pinned by digest (invariant 8). The tag beside it is the readable half and
# must match the @playwright/test version in client/package-lock.json — a
# mismatch fails at browser launch with "Executable doesn't exist".
IMAGE="mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e" # v1.62.1-noble

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --user/HOME are not optional: without them the run leaves root-owned files
# in the worktree that `git worktree remove` then cannot delete.
#
# --platform is the same idea as the digest: the runner is amd64, so a
# baseline recorded on an arm64 Mac would be judged against a rendering it
# never saw. Naming the platform costs nothing on the runner (it is already
# amd64) and makes an Apple-Silicon machine emulate rather than diverge —
# which is what lets the images be *generated* anywhere. Verified 2026-08-16:
# all 16 existing baselines reproduced byte-identically this way.
exec docker run --rm \
  --platform linux/amd64 \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e CI=1 \
  --network host \
  -v "${repo_root}:/w" \
  -w /w/client \
  "${IMAGE}" \
  npx playwright test --project=visual-mobile --project=visual-desktop "$@"
