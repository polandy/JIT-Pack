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

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The image is pinned once, in one file, for this script and scripts/e2e.sh.
# shellcheck source=scripts/playwright-image.sh
. "${repo_root}/scripts/playwright-image.sh"
require_matching_playwright_version "${repo_root}"

# Mounting the repository hands the container the *host's* `node_modules`,
# and off the runner those are the wrong platform: rolldown and its siblings
# ship native binaries, so vite's preview server dies at "Cannot find module
# … linux-x64" the moment Playwright starts it, and the run fails before it
# renders anything. CI installs on Linux, where the mount is exactly right;
# anywhere else the container gets its own tree and fills it itself. That
# install takes ~9 s over virtiofs — cheap enough that checking whether it is
# still current would cost more than redoing it.
#
# The tree lives in the user's cache, deliberately *not* in the worktree: a
# second `node_modules` under `client/` is walked by everything that walks the
# project — eslint follows it in and tries to load a dependency's own config.
# Ignoring it in one tool would only move the problem to the next one.
cache_dir="${XDG_CACHE_HOME:-${HOME}/.cache}/jitpack-visual-node_modules"
mounts=(-v "${repo_root}:/w")
install=""
if [ "$(uname -s)" != "Linux" ]; then
  mkdir -p "${cache_dir}"
  mounts+=(-v "${cache_dir}:/w/client/node_modules")
  install='npm ci --no-audit --no-fund >/dev/null && '
fi

# --user/HOME are not optional: without them the run leaves root-owned files
# in the worktree that `git worktree remove` then cannot delete.
#
# --platform is the same idea as the digest: the runner is amd64, so a
# baseline recorded on an arm64 Mac would be judged against a rendering it
# never saw. Naming the platform costs nothing on the runner (it is already
# amd64) and makes an Apple-Silicon machine emulate rather than diverge —
# which is what lets the images be *generated* anywhere: the baselines
# reproduce byte-identically this way.
# The preview server's port is a *host* port (--network host), so two
# worktrees recording or checking baselines at once collide on it — and
# Playwright's message for that names the port and not the cause. The
# override reaches the container for the same reason it does in e2e.sh.
env_flags=()
if [ -n "${E2E_PORT:-}" ]; then
  env_flags+=(-e E2E_PORT)
fi

exec docker run --rm \
  --platform linux/amd64 \
  ${env_flags[@]+"${env_flags[@]}"} \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e CI=1 \
  --network host \
  "${mounts[@]}" \
  -w /w/client \
  "${PLAYWRIGHT_IMAGE}" \
  sh -c "${install}"'exec npx playwright test --project=visual-mobile --project=visual-desktop "$@"' \
  sh "$@"
