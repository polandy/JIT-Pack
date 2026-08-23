#!/usr/bin/env bash
# The client's wire types are generated from internal/api/wire.go (NFR-4.14,
# ADR-026). This regenerates them and fails when the checked-in file differs.
#
# It exists because the two sides used to be written independently: in one week
# that produced three defects, each invisible to both test suites — the client
# read a key no server sends, took a hint for a cursor, and expected one
# partition's refusal shape from the other. A generator alone would not have
# caught them; what catches them is that the build refuses a wire change the
# client has not followed.
set -euo pipefail

cd "$(dirname "$0")/.."

target="client/src/api/types.ts"

# Generated beside the tree rather than over it: the check must compare wire.go
# against the file on disk, not against whatever git happens to hold — running
# it must never rewrite the file it is judging.
fresh="$(mktemp)"
trap 'rm -f "$fresh"' EXIT

go run ./cmd/wiregen -o "$fresh" >/dev/null

if [ ! -s "$fresh" ]; then
	echo "wire-contract-gate: the generator produced nothing — a gate that scanned nothing must not report ok." >&2
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
