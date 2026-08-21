#!/usr/bin/env bash
# Checks that every place naming a toolchain version names the same one.
#
# A major lives in three files at once — the build image that produces the
# published artifact, mise.toml (what a developer runs) and ci.yml (what the
# checks run) — and nothing else notices when they disagree: CI compiles
# through setup-node/setup-go, never through the image, so a Dockerfile bumped
# on its own is green while the image ships a bundle no test ever exercised.
# That happened (node 24 -> 26, PR #121), which is why this file exists.
#
# The gate is the reason Dependabot may keep proposing majors: its PR arrives,
# this turns red, and the message below names the other files to change. Run by
# `make ci` and the docker-build job in .github/workflows/ci.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

# GitHub Actions understands ::error::; a bare terminal just prints it.
fail() {
	echo "::error::$1"
	exit 1
}

# Reads the version out of `FROM <image>:<version>-alpine@sha256:…`.
image_version() {
	local file="$1" image="$2"
	sed -n "s|^FROM ${image}:\([0-9.]*\)-alpine@sha256:.*|\1|p" "$file" | head -1
}

check_all_equal() {
	local subject="$1" expected="$2" hint="$3"
	shift 3
	local entry name actual
	for entry in "$@"; do
		name="${entry%%=*}"
		actual="${entry#*=}"
		[ -n "$actual" ] || fail "$subject: could not read a version from $name"
		if [ "$actual" != "$expected" ]; then
			fail "$subject pins disagree: $name says $actual, expected $expected. $hint"
		fi
		printf '%-42s %s\n' "$name" "$actual"
	done
}

# --- node: the image that builds the published SPA, and the two toolchains ---

node_image=$(image_version client/Dockerfile node)
node_mise=$(sed -n 's|^node *= *"\([0-9]*\)".*|\1|p' mise.toml | head -1)
node_ci=$(sed -n 's|^ *node-version: *\([0-9]*\) *$|\1|p' .github/workflows/ci.yml | sort -u)

[ -n "$node_image" ] || fail "node: no digest-pinned FROM node:<major>-alpine in client/Dockerfile"
# `sort -u` collapsed every node-version: line; more than one left means the
# workflow disagrees with itself, which no single comparison below would show.
[ "$(printf '%s\n' "$node_ci" | wc -l)" -eq 1 ] ||
	fail "node: .github/workflows/ci.yml uses more than one node-version ($(echo $node_ci))"

check_all_equal "node" "$node_image" \
	"Moving the major means changing client/Dockerfile (tag *and* digest), mise.toml and every node-version: in ci.yml together." \
	"client/Dockerfile=$node_image" "mise.toml=$node_mise" ".github/workflows/ci.yml=$node_ci"

# --- go: the backend build image, go.mod and the two toolchains -------------

go_image=$(image_version Dockerfile golang)
go_mise=$(sed -n 's|^go *= *"\([0-9.]*\)".*|\1|p' mise.toml | head -1)
# go.mod carries the patch level (1.26.0); the image and mise name the minor.
go_mod=$(sed -n 's|^go \([0-9]*\.[0-9]*\).*|\1|p' go.mod | head -1)

[ -n "$go_image" ] || fail "go: no digest-pinned FROM golang:<version>-alpine in Dockerfile"

check_all_equal "go" "$go_image" \
	"Moving the version means changing Dockerfile (tag *and* digest), mise.toml and the go directive in go.mod together." \
	"Dockerfile=$go_image" "mise.toml=$go_mise" "go.mod=$go_mod"

echo "toolchain-pins: ok — node $node_image, go $go_image agree everywhere"
