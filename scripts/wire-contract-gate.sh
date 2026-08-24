#!/usr/bin/env bash
# The client's wire types and path builders are generated from
# internal/api/wire.go (NFR-4.14, ADR-026/027). This regenerates them and fails
# when a checked-in file differs.
#
# It exists because the two sides used to be written independently: in one week
# that produced three defects, each invisible to both test suites — the client
# read a key no server sends, took a hint for a cursor, and expected one
# partition's refusal shape from the other. A generator alone would not have
# caught them; what catches them is that the build refuses a wire change the
# client has not followed.
set -euo pipefail

cd "$(dirname "$0")/.."

# The shapes and the paths: two generated files, one declaration (ADR-027).
types_target="client/src/api/types.ts"
routes_target="client/src/api/routes.ts"

# Generated beside the tree rather than over it: the check must compare wire.go
# against the files on disk, not against whatever git happens to hold — running
# it must never rewrite the files it is judging.
fresh_types="$(mktemp)"
fresh_routes="$(mktemp)"
trap 'rm -f "$fresh_types" "$fresh_routes"' EXIT

go run ./cmd/wiregen -o "$fresh_types" -routes-o "$fresh_routes" >/dev/null

check() {
	target="$1"
	fresh="$2"

	if [ ! -s "$fresh" ]; then
		echo "wire-contract-gate: the generator produced nothing for $target — a gate that scanned nothing must not report ok." >&2
		exit 1
	fi

	if ! diff -u "$target" "$fresh" >/dev/null 2>&1; then
		echo "wire-contract-gate: $target does not match internal/api/wire.go." >&2
		echo >&2
		diff -u --label "$target (checked in)" --label "$target (generated)" "$target" "$fresh" >&2 || true
		echo >&2
		echo "Either the contract changed and the client's half did not, or the file was" >&2
		echo "edited by hand. Run 'make wire' and commit $target with the Go change." >&2
		exit 1
	fi

	echo "wire-contract-gate: ok ($target matches internal/api/wire.go)"
}

check "$types_target" "$fresh_types"
check "$routes_target" "$fresh_routes"
