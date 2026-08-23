# Local mirror of the CI pipeline (.github/workflows/ci.yml).
# Each target maps 1:1 to a CI job or step, so a green `make ci` predicts a
# green pipeline. When you change a job in ci.yml, change its target here.
.PHONY: ci ci-remote pins build vet fmt fmt-check test cover tidy-check go-lint \
        client client-deps client-lint client-tokens client-marks client-build client-test client-fmt \
        e2e e2e-single visual visual-update docker-build all

## --- toolchain -------------------------------------------------------------
# `mise.toml` is the one place the toolchain is pinned. But CLAUDE.md points
# people at `make ci` as the check to trust before finishing a change, and that
# promise has to hold from a plain shell in a fresh clone — not only inside a
# shell where `mise activate` has already run. So: use the tools directly when
# they are on PATH, otherwise route each recipe through `mise exec`, and fail
# with an instruction rather than a bare `go: No such file or directory`.
#
# The failure is deliberately at parse time, which costs `make docker-build` its
# former independence from the Go toolchain. Deferring it into the recipes would
# be worse: `fmt-check` reads its assertion out of a command substitution, so a
# tool that fails inside `$(...)` yields empty output and the target would pass
# while checking nothing.
TOOLS := go gofmt golangci-lint node npm
MISSING := $(strip $(foreach t,$(TOOLS),$(if $(shell command -v $(t) 2>/dev/null),,$(t))))

ifeq ($(MISSING),)
  RUN :=
else ifneq ($(shell command -v mise 2>/dev/null),)
  RUN := mise exec --
else
  $(error toolchain not found ($(MISSING)) and mise is not installed. \
Install mise from https://mise.jdx.dev, then run `mise install` in this \
directory — mise.toml pins the versions CI uses)
endif

# Everything CI checks that runs fast and needs no browser or docker daemon.
# `e2e` (Playwright browsers) and `docker-build` (needs dockerd) are separate
# on purpose — run them explicitly when you touch the client UI or the image.
ci: pins log-index fmt-check test tidy-check go-lint client

# Cheap and first: the toolchain majors are named in three files each, and a
# disagreement is invisible to every other check (see the script's header).
pins:
	@./scripts/toolchain-pins-gate.sh

# Beside it for the same reason: the implementation log's index is read
# instead of the log, so a section missing from it is unreachable — and
# nothing else can see that.
log-index:
	@$(RUN) node scripts/log-index-gate.mjs

# The full set, including the two slow jobs.
all: ci e2e docker-build

# The same full set, but on GitHub's machines rather than this one. Pushes the
# current branch, dispatches the CI workflow against it and waits for the
# verdict -- no pull request needed. Prefer this over `make all` for the jobs
# that want docker and a browser; see the script's header.
ci-remote:
	@./scripts/ci-remote.sh

## --- go job ---------------------------------------------------------------
# NOT `./...`: client/node_modules ships Go source (the npm package `flatted`
# vendors a Go implementation), and `go test ./...` picks it up as soon as the
# client dependencies are installed — dragging overall coverage below the gate.
# CI never sees it because its go job runs on a fresh checkout, which is
# exactly the local/CI divergence this Makefile exists to prevent.
GO_PKGS := ./cmd/... ./internal/...

build:
	$(RUN) go build $(GO_PKGS)

vet:
	$(RUN) go vet $(GO_PKGS)

# `gofmt -l` exits 0 even when files need formatting, so the emptiness of its
# output is the actual assertion. CI's autoformat job would fix this for you,
# but a formatting commit pushed onto your branch mid-review is noise.
fmt-check:
	@test -z "$$($(RUN) gofmt -l cmd internal)" || \
		{ echo "gofmt needed:"; $(RUN) gofmt -l cmd internal; exit 1; }

fmt: $(CLIENT_DEPS)
	$(RUN) gofmt -w cmd internal
	cd client && $(RUN) npm run format

test: build vet
	$(RUN) go test $(GO_PKGS) -race -count=1 -coverprofile=coverage.txt
	@$(MAKE) --no-print-directory cover

# Thresholds live in the script, shared with the ci.yml `go` job. It shells out
# to `go tool cover`, so it needs the toolchain on PATH like any other target.
cover:
	@$(RUN) ./scripts/coverage-gate.sh coverage.txt

# The version is pinned in mise.toml and must match the golangci-lint-action
# `version:` in .github/workflows/ci.yml — a local lint running a different
# major version is worse than no local lint.
# `config verify` first, because the action runs it and `run` does not: an
# option of the wrong *shape* (a string where the schema wants a list) is
# tolerated by `run` and fails the CI job — which is exactly the kind of
# drift this target exists to catch before the push (2026-08-18).
go-lint:
	$(RUN) golangci-lint config verify
	$(RUN) golangci-lint run $(GO_PKGS)

# Unlike the targets above, `go mod tidy` takes no package list, so it also
# scans client/node_modules. Today the Go source in there imports only the
# standard library and nothing leaks into go.mod; if that ever changes, this
# target is where it will show up.
tidy-check:
	$(RUN) go mod tidy
	git diff --exit-code go.mod go.sum

## --- client job -----------------------------------------------------------
# CI lints without --fix; the package scripts fix in place. Check, don't fix,
# so the local run fails on the same things CI does.
client: client-lint client-tokens client-marks client-build client-devcode client-test

# `npm ci` is CI's first client step. Locally it only needs to rerun when the
# lockfile moved, so hang it off the stamp npm itself writes — otherwise every
# target pays a full reinstall. Without this the npx calls below silently fetch
# a *different* tool version from the registry and lint something else than CI.
CLIENT_DEPS := client/node_modules/.package-lock.json

$(CLIENT_DEPS): client/package-lock.json
	cd client && $(RUN) npm ci
	@touch $@

client-deps: $(CLIENT_DEPS)

client-lint: $(CLIENT_DEPS)
	cd client && $(RUN) npx oxlint .
	cd client && $(RUN) npx eslint .

# Invariant 9b: the three token tables own colour, type and shape; a view
# that decides one for itself is an error. Node built-ins only, so unlike
# every other client target it needs no install.
client-tokens:
	$(RUN) node scripts/design-tokens-gate.mjs

# FR-28.6: the curated mark index, the font subset and the CSS unicode-range
# are one decision expressed in three files. Node built-ins only, like the
# gate above.
client-marks:
	$(RUN) node scripts/mark-font-gate.mjs

client-build: $(CLIENT_DEPS)
	cd client && $(RUN) npm run build

# After client-build: it reads what the build actually emitted.
client-devcode:
	$(RUN) node scripts/dev-code-gate.mjs

client-test: $(CLIENT_DEPS)
	cd client && $(RUN) npx vitest run

client-fmt: $(CLIENT_DEPS)
	cd client && $(RUN) npx prettier --check --experimental-cli src/

## --- visual baselines (ADR-013) -------------------------------------------
# The invocation lives in scripts/visual.sh, which CI calls directly: a
# GitHub runner has no golangci-lint and no mise, so `make` there fails on
# the parse-time toolchain guard above before any recipe runs — on a tool
# the baselines do not use. Same two-callers reasoning as
# scripts/coverage-gate.sh.
#
# Excluded from `make ci` and from `npm run test:e2e`: a baseline check
# belongs to the review loop, not to every test run.
visual: client-build
	scripts/visual.sh

# Rewrites every baseline. The resulting image diff is the review — an
# intended visual change should be visible in the PR that causes it.
visual-update: client-build
	scripts/visual.sh --update-snapshots

## --- e2e job --------------------------------------------------------------
# Needs docker and a built bundle: scripts/e2e.sh runs the suite inside the
# pinned Playwright image, so the browsers and their system libraries come
# with the image rather than being installed. Vite preview serves client/dist
# from inside the container (--network host).
#
# That also makes this target usable on a NixOS host, where a downloaded
# Chromium does not run at all.
e2e: client-build
	scripts/e2e.sh

# The backend-backed cases (UI-Test-Spec §2.2, mode `single`): a real
# Single-User jitpackd behind the preview proxy. The binary is built here on
# the host — CGO-free, so the container runs it off the repo mount.
# CGO_ENABLED=0 is load-bearing, not habit: a host-toolchain cgo build links
# the host's dynamic loader path, which does not exist inside the container —
# the failure is a misleading "../jitpackd-e2e: not found" (exit 127) from
# the shell, on a file that is plainly there.
e2e-single: client-build
	CGO_ENABLED=0 $(RUN) go build -o jitpackd-e2e ./cmd/jitpackd
	E2E_BACKEND=1 scripts/e2e.sh --project=single

## --- docker-build job -----------------------------------------------------
# Left out of `ci` because it needs a running docker daemon.
docker-build:
	docker build .
