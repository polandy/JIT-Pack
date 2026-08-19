#!/usr/bin/env bash
#
# The Playwright behaviour suite (dev-docs/UI_Test_Spec_v1.0.md), run inside the
# pinned Playwright image.
#
# Why a container rather than `npx playwright install --with-deps` on the
# runner: that step was **1124 s of a 1776 s job** — 63 % of the e2e job spent
# installing WebKit's ~200 apt libraries on every single run. The browser
# binaries were cached; the system libraries are not cacheable and were paid
# for every time. The image has both baked in.
#
# It also makes `make e2e` work on a NixOS host, where a downloaded Chromium
# does not run at all.
#
# Deliberately *unlike* scripts/visual.sh in one respect: no `--platform`. The
# baselines pin it so an arm64 Mac renders what the amd64 runner rendered;
# behaviour tests assert behaviour, so forcing emulation there would only make
# an Apple-Silicon run slow enough to start tripping test budgets.
#
# Arguments are passed to `playwright test`. CI passes `--shard=N/4`, one per
# matrix leg; `make e2e` passes nothing and runs the whole suite.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/playwright-image.sh
. "${repo_root}/scripts/playwright-image.sh"
require_matching_playwright_version "${repo_root}"

# Mounting the repository hands the container the *host's* node_modules, and
# off the runner those are the wrong platform — see the long note in
# scripts/visual.sh, which hit this first. CI installs on Linux, where the
# mount is exactly right.
cache_dir="${XDG_CACHE_HOME:-${HOME}/.cache}/jitpack-e2e-node_modules"
mounts=(-v "${repo_root}:/w")
install=""
if [ "$(uname -s)" != "Linux" ]; then
  mkdir -p "${cache_dir}"
  mounts+=(-v "${cache_dir}:/w/client/node_modules")
  install='npm ci --no-audit --no-fund >/dev/null && '
fi

# --user/HOME keep the report and any trace out of root ownership, which
# `git worktree remove` would otherwise refuse to clean up.
exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e CI=1 \
  --network host \
  "${mounts[@]}" \
  -w /w/client \
  "${PLAYWRIGHT_IMAGE}" \
  sh -c "${install}"'exec npx playwright test "$@"' \
  sh "$@"
