# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend + embedded SQLite; Vue 3 + Capacitor client.

Everything decided is written down, with reasons, in the files referenced below. Read docs on demand for the subsystem you're touching — don't preload everything.

## Commands

Toolchain (go, node, golangci-lint) is pinned in `mise.toml` — run `mise install` once per machine; if `go` isn't on PATH, prefix commands with `mise exec --`.

Backend (repo root):

- `go test -race ./...` — full suite, must stay green
- `go build ./...` && `go vet ./...`
- `golangci-lint run` — config in `.golangci.yml` (`client/` excluded)
- Coverage gates (CI-enforced): ≥ 90 % `internal/sync`, ≥ 75 % overall

Client (`client/`):

- `npm run test:unit -- --run` — vitest
- `npm run build` — type-check (vue-tsc) + vite build
- `npm run lint` — oxlint + eslint (CI runs both *without* `--fix`)
- `npm run format` — prettier over `src/`; CI's autoformat job commits formatting fixes back to branches, so keep files clean locally (a PostToolUse hook in `.claude/settings.json` does this automatically)

## Where things live

| Question | File |
|---|---|
| What's built, how, and what's still open? | `docs/STATE.md` — implementation status, build history, open items. **Read the relevant section before touching a subsystem; update it when you finish something** |
| What does the product do? | `docs/PRD_Base.md` (original vision) |
| What changed/was added since? | `docs/PRD_Addendum_v2.10.md` — **always authoritative over PRD_Base.md where they differ** |
| What do the screens look like? | `docs/UI_Spec_v1.10.md` — screens M1–M20, global patterns G-1–G-11 |
| What's the wire protocol? | `docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/migrations/` — **single source of truth, do not duplicate it into docs/** |
| Why was X chosen over Y? | `docs/ADR-00N_*.md` — six ADRs, each: options considered, weighted decision matrix, consequences, revisit trigger |
| What must the UI test suite cover? | `docs/UI_Test_Spec_v1.0.md` — Playwright E2E scope with FR/NFR traceability; not yet implemented |
| How do I write code here? | `docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| Where is the product headed? | `docs/Vision_NorthStar_v1.0.md` — directional expansion from packing app to family vacation companion (phases Plan/Prepare/During/After). **Not authoritative over shipped scope**, drives no implementation; packing ships first. Flags ADR-007 (outbound fetching) as the gate for planning features. |

Only the current version of every document is kept — if you're ever tempted to write "v2" of something, replace the file and update its own revision note instead of leaving both around.

## Current state (short)

Backend complete for the current spec: sync (HLC + field-level merge), store (both sync partitions, all migrations), api (pull/push, JWT/JWKS/OIDC, WebSocket hub + presence, notifications + Web Push, item images, instance admin), portable YAML, `cmd/jitpackd`, Docker. Client covers screens M1–M20 plus Local Mode, theming, import wizards. All tests green (`go test -race ./...`; client vitest).

Full detail — including **what's still open** — lives in `docs/STATE.md`. Don't rebuild something described there; don't guess at history it already records.

## Working agreement (non-negotiable, see CODING_PRINCIPLES.md for full detail)

- Test-first: red (failing test as spec) → green → refactor. No production code without a driving test.
- Table-driven tests; real in-memory SQLite for integration tests, never DB mocks; `go test -race` always.
- Coverage: ≥ 90 % on `internal/sync` and `internal/domain` (when it exists), ≥ 75 % overall.
- English throughout; comments only for *why*, never *what*; godoc mandatory on exported symbols.
- Standard library first — any new dependency needs a one-line justification, footprint is a first-class concern (NFR-4.3).
- **Dependency pinning (supply-chain):** everything resolves to an exact version verified by hash — npm `package-lock.json` (`npm ci`), Go `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA (`@<sha> # vN`). Never reference a base image or Action by bare tag; Dependabot updates the digests/SHAs.
- Package boundaries: `api → domain/sync/store`, `store → domain`; `domain` and `sync` import nothing internal, ever.
- Commit messages: **Conventional Commits** (`feat:`/`fix:`/`build:`/`refactor:`/`style:`…) — release-please derives releases from them; reference spec IDs (`FR-5.4`, `NFR-4.2a`) in the body.

## Agent workflow

- `/next` — pick the next open item (reads `docs/STATE.md`), `/status` — health check, `/review` — check changes against project standards.
- When a feature is done: tests green with `-race`, lint clean, godoc on exported symbols, **`docs/STATE.md` updated in the same commit**.
- Deviations from the binding docs go through `DEVIATIONS.md`, not silent divergence.
