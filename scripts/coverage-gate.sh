#!/usr/bin/env bash
# Enforces the coverage thresholds from the working agreement
# (docs/CODING_PRINCIPLES.md §2). Used by both `make cover` and the `go`
# job in .github/workflows/ci.yml, so a local run and CI apply the same
# numbers — the thresholds exist exactly once, here.
#
# Usage: scripts/coverage-gate.sh <coverage-profile>
set -euo pipefail

MIN_OVERALL=75
MIN_SYNC=90

profile="${1:?usage: coverage-gate.sh <coverage-profile>}"

# GitHub Actions understands ::error::; a bare terminal just prints it.
fail() {
	echo "::error::$1"
	exit 1
}

check() {
	local name="$1" actual="$2" minimum="$3"
	printf '%-16s %5s%%  (minimum %s%%)\n' "$name" "$actual" "$minimum"
	if awk -v c="$actual" -v m="$minimum" 'BEGIN { exit !(c < m) }'; then
		fail "$name coverage $actual% is below the $minimum% minimum"
	fi
}

overall=$(go tool cover -func="$profile" | awk '/^total:/ { gsub(/%/, ""); print $3 }')

# Per-package statement coverage straight from the profile. `go tool cover
# -func` only reports per-function percentages, which cannot be averaged back
# into a statement-weighted number — so sum the profile's own statement counts
# instead. Profile line: <file>:<span> <numStatements> <executionCount>.
sync=$(awk -v pkg="/internal/sync/" '
	index($1, pkg) { total += $2; if ($3 > 0) covered += $2 }
	END { if (total) printf "%.1f", 100 * covered / total; else print "0" }
' "$profile")

[ -n "$overall" ] || fail "could not read total coverage from $profile"

check overall "$overall" "$MIN_OVERALL"
check internal/sync "$sync" "$MIN_SYNC"
