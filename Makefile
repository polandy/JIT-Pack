# Local mirror of the CI pipeline (.github/workflows/ci.yml).
# Each target maps 1:1 to a CI job or step, so a green `make ci` predicts a
# green pipeline. When you change a job in ci.yml, change its target here.
.PHONY: ci build vet fmt fmt-check test cover tidy-check go-lint \
        client client-deps client-lint client-build client-test client-fmt \
        e2e docker-build all

# Everything CI checks that runs fast and needs no browser or docker daemon.
# `e2e` (Playwright browsers) and `docker-build` (needs dockerd) are separate
# on purpose — run them explicitly when you touch the client UI or the image.
ci: fmt-check test go-lint client

# The full set, including the two slow jobs.
all: ci e2e docker-build

## --- go job ---------------------------------------------------------------
build:
	go build ./...

vet:
	go vet ./...

# `gofmt -l` exits 0 even when files need formatting, so the emptiness of its
# output is the actual assertion. CI's autoformat job would fix this for you,
# but a formatting commit pushed onto your branch mid-review is noise.
fmt-check:
	@test -z "$$(gofmt -l cmd internal)" || \
		{ echo "gofmt needed:"; gofmt -l cmd internal; exit 1; }

fmt:
	gofmt -w cmd internal
	cd client && npm run format

test: build vet
	go test ./... -race -count=1 -coverprofile=coverage.txt
	@$(MAKE) --no-print-directory cover

# Thresholds live in the script, shared with the ci.yml `go` job.
cover:
	@./scripts/coverage-gate.sh coverage.txt

# The nix-free way to get the CI version: see .github/workflows/ci.yml for the
# pinned golangci-lint version and keep the two in step.
go-lint:
	golangci-lint run ./...

tidy-check:
	go mod tidy
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
	cd client && npm ci
	@touch $@

client-deps: $(CLIENT_DEPS)

client-lint: $(CLIENT_DEPS)
	cd client && npx oxlint .
	cd client && npx eslint .

client-build: $(CLIENT_DEPS)
	cd client && npm run build

client-test: $(CLIENT_DEPS)
	cd client && npx vitest run

client-fmt: $(CLIENT_DEPS)
	cd client && npx prettier --check --experimental-cli src/

## --- e2e job --------------------------------------------------------------
# Needs the Playwright browsers (`npx playwright install chromium webkit`) and
# a built bundle — `npm run test:e2e` serves client/dist via vite preview.
e2e: client-build
	cd client && npm run test:e2e

## --- docker-build job -----------------------------------------------------
# Left out of `ci` because it needs a running docker daemon.
docker-build:
	docker build .
