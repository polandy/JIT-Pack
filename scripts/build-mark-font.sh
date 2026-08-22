#!/usr/bin/env bash
#
# Rebuild the self-hosted emoji face for the item mark (FR-28.6).
#
# The face is subsetted to *exactly* the curated index of FR-28.2 and to
# nothing else. That is not only a weight decision: `scripts/mark-font-gate.mjs`
# compares the @font-face `unicode-range` against the index on every build, so
# adding an entry to `client/src/domain/itemMarks.ts` without rerunning this
# script fails the build rather than shipping a glyph that renders as tofu.
#
# Why a self-hosted face at all — the reason is agreement, not availability: a
# packing list is shared, and on platform emoji the same row shows a tan trench
# coat on one device and a navy peacoat on another. Sender and reader would be
# looking at different lists. See ADR-021.
#
# Requires fonttools with brotli. On NixOS:
#   nix-shell -p "python3.withPackages(ps: [ps.fonttools ps.brotli])" \
#     --run scripts/build-mark-font.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${repo_root}/client/src/assets/fonts/noto-emoji-marks.woff2"
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

# Noto Color Emoji, COLRv1 build (SIL Open Font License 1.1). Pinned to a
# commit rather than a branch — invariant 8 applies to an asset we ship.
src_commit="f3ae03f5e9b3b8516fa151f7168159ca1a3e7515"
src_url="https://raw.githubusercontent.com/googlefonts/noto-emoji/${src_commit}/fonts/Noto-COLRv1.ttf"

echo "fetching Noto-COLRv1 @ ${src_commit:0:8}…"
curl -sSLf -o "${work}/noto.ttf" "${src_url}"

echo "reading the curated index…"
node "${repo_root}/scripts/mark-codepoints.mjs" > "${work}/unicodes.txt"
echo "  $(tr ',' '\n' < "${work}/unicodes.txt" | wc -l) code points"

pyftsubset "${work}/noto.ttf" \
  --unicodes-file="${work}/unicodes.txt" \
  --flavor=woff2 \
  --layout-features='' \
  --no-hinting \
  --output-file="${out}"

echo "wrote ${out} ($(stat -c%s "${out}") bytes)"
echo "now run: node scripts/mark-font-gate.mjs"
