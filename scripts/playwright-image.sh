# The Playwright container image, named once for the two scripts that run it.
#
# Sourced by scripts/visual.sh and scripts/e2e.sh. It is a separate file rather
# than a constant in one of them because the digest and the @playwright/test
# version in client/package-lock.json have to move together, and a second copy
# would drift the first time only one of them was bumped — with a failure mode
# ("Executable doesn't exist") that names neither.
#
# Pinned by digest (invariant 8). The tag beside it is the readable half and
# must match the @playwright/test version in client/package-lock.json.
#
# This is the one pin Dependabot does not maintain: its docker ecosystem reads
# Dockerfiles, not shell scripts. Bumping it is deliberate — it rewrites every
# visual baseline (ADR-013), so it belongs in its own PR.
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e" # v1.62.1-noble

# The version the digest above resolves to, repeated as data so it can be
# checked rather than trusted.
PLAYWRIGHT_VERSION="1.62.1"

# require_matching_playwright_version fails early, and by name, when the image
# and client/package-lock.json have drifted apart.
#
# Without it the drift surfaces inside the container as Playwright's own
# "Executable doesn't exist at /ms-playwright/…", which names neither cause nor
# fix. It is a live failure mode, not a hypothetical: Dependabot bumps
# @playwright/test in the lockfile and cannot see this file, so every such PR
# arrives already broken until the digest is bumped with it.
#
# $1 is the repository root.
require_matching_playwright_version() {
  _lock="$1/client/package-lock.json"
  _have="$(sed -n '/"node_modules\/@playwright\/test": {/,/^    }/ s/.*"version": "\([^"]*\)".*/\1/p' "${_lock}" 2>/dev/null | head -1)"
  # An unreadable or restructured lockfile must not block the suite: the check
  # exists to explain a failure, not to become one.
  if [ -z "${_have}" ]; then
    echo "warning: could not read @playwright/test from ${_lock}; skipping the image/lockfile check" >&2
    return 0
  fi
  if [ "${_have}" != "${PLAYWRIGHT_VERSION}" ]; then
    echo "error: the pinned Playwright image is v${PLAYWRIGHT_VERSION}, but client/package-lock.json wants v${_have}." >&2
    echo "       Bump PLAYWRIGHT_IMAGE and PLAYWRIGHT_VERSION in scripts/playwright-image.sh together." >&2
    echo "       Note that a bump rewrites every visual baseline (ADR-013) — run 'make visual-update' and review the diff." >&2
    return 1
  fi
}
