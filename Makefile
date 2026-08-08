# Local mirror of the CI pipeline (.github/workflows/ci.yml).
# Each target maps 1:1 to a CI job or step, so a green `make ci` predicts a
# green pipeline. When you change a job in ci.yml, change its target here.
.PHONY: ci build vet fmt fmt-check test cover tidy-check go-lint \
        client client-deps client-lint client-build client-test client-fmt \
        e2e docker-build all

## --- toolchain -------------------------------------------------------------
# `mise.toml` is the one place the toolchain is pinned. But CLAUDE.md points
# people at `make ci` as the check to trust before finishing a change, and that
# promise has to hold from a plain shell in a fresh clone — not only inside a
# shell where `mise activate` has already run. So: use the tools directly when
# they are on PATH, otherwise route each recipe through `mise exec`, and fail
# with an instruction rather than a bare `go: No such file or directory`.
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
ci: fmt-check test tidy-check go-lint client

# The full set, including the two slow jobs.
all: ci e2e docker-build

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
go-lint:
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
client: client-lint client-build client-test

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

client-build: $(CLIENT_DEPS)
	cd client && $(RUN) npm run build

client-test: $(CLIENT_DEPS)
	cd client && $(RUN) npx vitest run

client-fmt: $(CLIENT_DEPS)
	cd client && $(RUN) npx prettier --check --experimental-cli src/

## --- e2e job --------------------------------------------------------------
# Needs the Playwright browsers (`npx playwright install chromium webkit`) and
# a built bundle — `npm run test:e2e` serves client/dist via vite preview.
e2e: client-build
	cd client && $(RUN) npm run test:e2e

## --- docker-build job -----------------------------------------------------
# Left out of `ci` because it needs a running docker daemon.
docker-build:
	docker build .
