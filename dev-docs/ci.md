# CI — what runs where, and how to read it

The detail behind `CLAUDE.md`'s commands. `make ci` locally, the slow jobs on GitHub (owner's rule).

## Local: `make ci`

`make ci` mirrors the CI jobs 1:1 — gofmt, build, vet, race tests, coverage gates, golangci-lint, client
lint/build/vitest, plus the `client-cli` build, which only runs here. It prints one line per target and a failing
target's output in full; `make ci V=1` streams everything. Budget ~80 s cold and ~30 s warm on an idle 16-core machine;
**read the load average before trusting a timing** — a parallel session has turned a 100 s vitest run into 370 s.

`e2e`, `visual`, `docker-build` and the coverage profile are excluded from `make ci` on purpose: `make e2e`/`visual`
need docker and a built bundle (ADR-013), and `visual-update` rewrites baselines. `make all` runs everything.

## Remote: `make ci-remote`

Pushes the branch, dispatches `ci.yml`, waits quietly and prints the job verdicts — and, when red, only what failed.
**The e2e jobs skip `workflow_dispatch`**: they are a pull-request and push-to-main signal, not a per-`ci-remote` one;
`visual` and `docker-build` still run there.

**`e2e` and `visual` skip a diff that touches no app input** (`scripts/diff-scope.mjs` — a path its list does not name
runs them, so a new source location costs a run, never a missed regression), and **a pull request inside one feature
module runs e2e on one leg** (ADR-079; `--grep "@<module>|@smoke"`, locally `make e2e-module M=planner`).

## Reading a red run

`node scripts/ci-failures.mjs [<run-id> | --pr <n>]` — the failing assertions and their source lines, without the image
pulls and attachment banners around them. `gh run view --log-failed` only when that is not enough.

**A red e2e leg is the diff until proved otherwise.** A rerun without a diagnosis pays for the run twice and teaches
nothing; fix a real flake at its cause (a missing signal in the production code), never with a wait.

## The e2e legs

The leg counts are a measurement, not a constant — `scripts/e2e-matrix.mjs` (ADR-091: each browser sharded on its own
axis; a pull request runs WebKit on `@smoke|@webkit` only, `main` both engines in full). A growing suite makes them
stale silently, so when e2e feels slow read the per-leg times of a recent run first. **A single run cannot resolve a
leg-count change**: the runners' variance is the size of every effect worth chasing (log: 'Three CI levers, two
measured worse than nothing and one disproved').

## Workflows and branch protection

`.github/`: `ci.yml` (go, go-lint, client, format, visual, e2e ×N, e2e-single, e2e-server, docker-build,
dependabot-merge), `docker.yml` (image to ghcr.io on `v*` tags, ADR-043), `release.yml` (release-please). A
`concurrency` group supersedes a superseded **pull-request** run; a push to main is never cancelled.

**`main` is protected**: required checks `go`, `go-lint`, `client`, `format` (ADR-040), `docker-build`; no force-push
or deletion, linear history, admins not exempt, no review approvals required. `e2e` and `visual` are deliberately
**not** required (a sharded matrix would need every leg named; `dependabot-merge` waits for them). If a required check
wedges: `gh api -X DELETE repos/polandy/JIT-Pack/branches/main/protection`, merge, re-apply.

The CI `format` job *checks* gofmt and prettier (ADR-040): run `make fmt` before pushing if `make ci` complains.
