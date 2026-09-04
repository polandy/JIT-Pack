#!/usr/bin/env bash
# Checks that every place naming a toolchain version names the same one.
#
# A major lives in three files at once — the build stage that produces the
# published artifact (since ADR-043 both toolchains build the one image, so
# both stages are in the root Dockerfile), mise.toml (what a developer runs)
# and ci.yml (what the checks run) — and nothing else notices when they
# disagree: CI compiles
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

node_image=$(image_version Dockerfile node)
node_mise=$(sed -n 's|^node *= *"\([0-9]*\)".*|\1|p' mise.toml | head -1)
# Since T-6 the six jobs share one composite action, so the workflow names the
# major once. The `sort -u` and the "more than one" check stay: they are what
# would catch a job that goes back to its own setup-node, which is the drift
# the composite was made to end.
node_setup=.github/actions/client-setup/action.yml
node_ci=$(sed -n 's|^ *node-version: *\([0-9]*\) *$|\1|p' "$node_setup" .github/workflows/*.yml | sort -u)

[ -n "$node_image" ] || fail "node: no digest-pinned FROM node:<major>-alpine in Dockerfile"
[ -n "$node_ci" ] || fail "node: no node-version: in $node_setup"
[ "$(printf '%s\n' "$node_ci" | wc -l)" -eq 1 ] ||
	fail "node: the workflows and $node_setup disagree about node-version ($(echo $node_ci))"

check_all_equal "node" "$node_image" \
	"Moving the major means changing Dockerfile (tag *and* digest), mise.toml and $node_setup together." \
	"Dockerfile(node)=$node_image" "mise.toml=$node_mise" "$node_setup=$node_ci"

# --- go: the backend build image, go.mod and the two toolchains -------------

go_image=$(image_version Dockerfile golang)
go_mise=$(sed -n 's|^go *= *"\([0-9.]*\)".*|\1|p' mise.toml | head -1)
# go.mod carries the patch level (1.26.0); the image and mise name the minor.
go_mod=$(sed -n 's|^go \([0-9]*\.[0-9]*\).*|\1|p' go.mod | head -1)

[ -n "$go_image" ] || fail "go: no digest-pinned FROM golang:<version>-alpine in Dockerfile"

check_all_equal "go" "$go_image" \
	"Moving the version means changing Dockerfile (tag *and* digest), mise.toml and the go directive in go.mod together — and golangci-lint with them, see below." \
	"Dockerfile(go)=$go_image" "mise.toml=$go_mise" "go.mod=$go_mod"

# --- golangci-lint: a fourth place the Go language version is named ---------
#
# The linter refuses to load a config for a module targeting a newer Go than
# the one golangci-lint itself was built with ("the Go language version
# (go1.26) used to build golangci-lint is lower than the targeted Go version
# (1.27.0)"). So a Go major drags the linter along, and the linter version is
# named twice: mise.toml is what `make ci` runs, ci.yml is what the pipeline
# runs, and a lint result that differs between the two is the whole problem
# this file exists to prevent.
#
# What is *not* checked here is whether the pinned version is new enough for
# the go directive above — that depends on the toolchain the release was built
# with, which is not readable from any file in the repository. golangci-lint's
# own go.mod stays a major behind on purpose ("the minimum Go version must
# always be latest-1"), so it answers a different question and reading it
# would mislead. Only running the binary says, and `make ci` does exactly that
# one step later. The coupling is named in the failure hints instead.

golangci_mise=$(sed -n 's|^golangci-lint *= *"\([0-9.]*\)".*|\1|p' mise.toml | head -1)
# Scoped to the step that uses it: a bare `version:` is a key any other action
# may also carry, and matching those would compare unrelated pins.
golangci_ci=$(awk '
	/golangci\/golangci-lint-action/ { step = 1; next }
	step && $1 == "version:" { v = $2; sub(/^v/, "", v); print v; step = 0 }
	step && /^ *- / { step = 0 }
' .github/workflows/ci.yml | sort -u)

[ -n "$golangci_mise" ] || fail "golangci-lint: no golangci-lint = \"<version>\" in mise.toml"
[ -n "$golangci_ci" ] || fail "golangci-lint: no version: under golangci-lint-action in .github/workflows/ci.yml"
# As with node: sort -u collapsed the lines, so more than one left means the
# workflow lints with two different versions and no single comparison shows it.
[ "$(printf '%s\n' "$golangci_ci" | wc -l)" -eq 1 ] ||
	fail "golangci-lint: .github/workflows/ci.yml uses more than one version ($(echo $golangci_ci))"

check_all_equal "golangci-lint" "$golangci_mise" \
	"Moving it means changing mise.toml and the golangci-lint-action version: in ci.yml together. A Go bump needs one too: the linter must be built with a Go at least as new as the go directive, or it refuses the config outright." \
	"mise.toml=$golangci_mise" ".github/workflows/ci.yml=$golangci_ci"

echo "toolchain-pins: ok — node $node_image, go $go_image, golangci-lint $golangci_mise agree everywhere"
