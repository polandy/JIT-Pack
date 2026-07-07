# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend + embedded SQLite; Vue 3 + Capacitor client (not yet started).

If you're picking this up fresh: read this file fully before touching code. It replaces re-reading a long design conversation — everything decided is written down, with reasons, in the files referenced below.

## Where things live

| Question | File |
|---|---|
| What does the product do? | `docs/PRD_Base.md` (original vision) |
| What changed/was added since? | `docs/PRD_Addendum_v2.8.md` — **always authoritative over PRD_Base.md where they differ** |
| What do the screens look like? | `docs/UI_Spec_v1.8.md` — 18 screens (M1–M18), global patterns G-1–G-10 |
| What's the wire protocol? | `docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/migrations/001_schema.sql` — **single source of truth, do not duplicate it into docs/** |
| Why was X chosen over Y? | `docs/ADR-00N_*.md` — six ADRs, each: options considered, weighted decision matrix, consequences, revisit trigger |
| How do I write code here? | `docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |

Only the current version of every document is kept — if you're ever tempted to write "v2" of something, replace the file and update its own revision note instead of leaving both around.

## Current state

`go test -race ./...` → all green, 89 tests.

**Built:**
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O.
- `internal/store` — SQLite repositories: change_log/conflict_log, pull with tombstone+compaction, push with idempotent mutation replay, Single-User bootstrap, avatar + display-name, template/trip export+import.
- `internal/api` — HTTP handlers: pull/push, JWT auth (HS256 placeholder — see gap #5 below), trip-membership enforcement, Single-User Mode (`api.NewSingleUser`, bypasses auth *and* membership per FR-17.3), avatar upload/download with ETag, display-name endpoint. WebSocket hub (`hub.go`/`ws.go`): per-trip subscriptions, `trip.changed` broadcast on push, presence with `in_sync` computation. Portable YAML export/import endpoints for templates and trips.
- `internal/portable` — YAML wire types for portable template/trip export/import (FR-18.1–18.6). Pure marshal/unmarshal, no I/O deps. `gopkg.in/yaml.v3`.
- Two-client end-to-end tests (`internal/api/e2e_test.go`) proving concurrent offline edits converge per NFR-4.2a over real HTTP.

**Not built yet, in the order I'd tackle them:**

1. ~~**`cmd/jitpackd` main wiring**~~ — **DONE.** `cmd/jitpackd/main.go` + `config.go`: env-based Config, picks `api.New` vs `api.NewSingleUser`, graceful shutdown. 5 table-driven config tests.
2. ~~**Dockerfile / docker-compose.yml**~~ — **DONE.** Multi-stage build (golang:1.22-alpine → alpine:3.21), docker-compose with healthcheck, mem_limit, homelab conventions. Smoke-tested.
3. ~~**WebSocket hub + presence**~~ — **DONE.** `internal/api/hub.go` + `ws.go`: in-memory hub, per-trip subscriptions, `trip.changed` on push, presence with `in_sync` (cursor vs `store.HeadSeq`). `github.com/coder/websocket`. 10 new tests (6 hub unit + 4 WS integration). `item.locked`/`item.unlocked` and `notification.created` events not yet implemented (depend on locking UI and notification system).
4. ~~**Portable YAML export/import**~~ — **DONE.** `internal/portable` (YAML types + marshal/unmarshal), `internal/store/export.go` (template/trip export+import), `internal/api/export.go` (four endpoints: `GET /templates/{id}/export`, `POST /templates/import`, `GET /trips/{id}/export.yaml`, `POST /trips/import`). `gopkg.in/yaml.v3`. 19 new tests (8 portable, 6 store, 5 API). Item dedup/near-duplicate prompts (FR-16.3-style) not yet implemented — requires the master item matching UI.
5. **RS256/JWKS against a real IdP** — currently HS256 with a hardcoded test secret in `internal/api`, fine for tests, not for production use with Authelia.
6. **Vue 3 + Capacitor client** — nothing started. `docs/UI_Spec_v1.8.md` is the full screen-by-screen spec; `docs/ADR-006_Client_Framework.md` justifies Vue over React/Svelte.

## Known deviation — read before touching `internal/store`

`internal/store` imports `github.com/mattn/go-sqlite3` (CGO) instead of the CODING_PRINCIPLES-approved pure-Go `modernc.org/sqlite`, purely because the sandbox this was built in couldn't reach `modernc.org` on its network allowlist. Full note in `DEVIATIONS.md`.

**If your environment has normal internet access:** switch to `modernc.org/sqlite` first, before building anything else. It's a one-line import change (driver name `"sqlite"` instead of `"sqlite3"`) and removes the CGO/C-toolchain build requirement, restoring the static, dependency-free binary ADR-001 is actually optimizing for.

## Working agreement (non-negotiable, see CODING_PRINCIPLES.md for full detail)

- Test-first: red (failing test as spec) → green → refactor. No production code without a driving test.
- Table-driven tests; real in-memory SQLite for integration tests, never DB mocks; `go test -race` always.
- Coverage: ≥90% on `internal/sync` and `internal/domain` (when it exists), ≥75% overall.
- English throughout; comments only for *why*, never *what*; godoc mandatory on exported symbols.
- Standard library first — any new dependency needs a one-line justification, footprint is a first-class concern (NFR-4.3).
- Package boundaries: `api → domain/sync/store`, `store → domain`; `domain` and `sync` import nothing internal, ever.
