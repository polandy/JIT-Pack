# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend + embedded SQLite; Vue 3 + Capacitor client (not yet started).

If you're picking this up fresh: read this file fully before touching code. It replaces re-reading a long design conversation — everything decided is written down, with reasons, in the files referenced below.

## Where things live

| Question | File |
|---|---|
| What does the product do? | `docs/PRD_Base.md` (original vision) |
| What changed/was added since? | `docs/PRD_Addendum_v2.9.md` — **always authoritative over PRD_Base.md where they differ** |
| What do the screens look like? | `docs/UI_Spec_v1.9.md` — 19 screens (M1–M19), global patterns G-1–G-10 |
| What's the wire protocol? | `docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/migrations/001_schema.sql` — **single source of truth, do not duplicate it into docs/** |
| Why was X chosen over Y? | `docs/ADR-00N_*.md` — six ADRs, each: options considered, weighted decision matrix, consequences, revisit trigger |
| How do I write code here? | `docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |

Only the current version of every document is kept — if you're ever tempted to write "v2" of something, replace the file and update its own revision note instead of leaving both around.

## Current state

`go test -race ./...` → all green, 100 tests.

**Built:**
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O.
- `internal/store` — SQLite repositories: change_log/conflict_log, pull with tombstone+compaction, push with idempotent mutation replay (multi-table: trip_items, travelers, containers, comments), Single-User bootstrap, avatar + display-name, template/trip export+import. Membership with three-tier role model (owner/admin/editor, FR-4.5/4.7).
- `internal/api` — HTTP handlers: pull/push, JWT auth (HS256 shared secret or RS256 via JWKS from IdP), trip-membership enforcement, Single-User Mode (`api.NewSingleUser`, bypasses auth *and* membership per FR-17.3), avatar upload/download with ETag, display-name endpoint. WebSocket hub (`hub.go`/`ws.go`): per-trip subscriptions, `trip.changed` broadcast on push, presence with `in_sync` computation. Portable YAML export/import endpoints for templates and trips. JWKS provider (`jwks.go`): fetches RSA public keys on startup, refreshes every 5 min, key lookup by `kid`.
- `internal/portable` — YAML wire types for portable template/trip export/import (FR-18.1–18.6). Pure marshal/unmarshal, no I/O deps. `gopkg.in/yaml.v3`.
- Two-client end-to-end tests (`internal/api/e2e_test.go`) proving concurrent offline edits converge per NFR-4.2a over real HTTP.

**Not built yet, in the order I'd tackle them:**

1. ~~**`cmd/jitpackd` main wiring**~~ — **DONE.** `cmd/jitpackd/main.go` + `config.go`: env-based Config, picks `api.New` vs `api.NewSingleUser`, graceful shutdown. 5 table-driven config tests.
2. ~~**Dockerfile / docker-compose.yml**~~ — **DONE.** Multi-stage build (golang:1.22-alpine → alpine:3.21), docker-compose with healthcheck, mem_limit, homelab conventions. Smoke-tested.
3. ~~**WebSocket hub + presence**~~ — **DONE.** `internal/api/hub.go` + `ws.go`: in-memory hub, per-trip subscriptions, `trip.changed` on push, presence with `in_sync` (cursor vs `store.HeadSeq`). `github.com/coder/websocket`. 10 new tests (6 hub unit + 4 WS integration). `item.locked`/`item.unlocked` and `notification.created` events not yet implemented (depend on locking UI and notification system).
4. ~~**Portable YAML export/import**~~ — **DONE.** `internal/portable` (YAML types + marshal/unmarshal), `internal/store/export.go` (template/trip export+import), `internal/api/export.go` (four endpoints: `GET /templates/{id}/export`, `POST /templates/import`, `GET /trips/{id}/export.yaml`, `POST /trips/import`). `gopkg.in/yaml.v3`. 19 new tests (8 portable, 6 store, 5 API). Item dedup/near-duplicate prompts (FR-16.3-style) not yet implemented — requires the master item matching UI.
5. ~~**RS256/JWKS against a real IdP**~~ — **DONE.** `internal/api/jwks.go`: JWKS provider with background refresh, RSA public key parsing from JWK, key lookup by `kid`. `api.NewWithJWKS(st, jwks)` constructor for RS256 mode. Config: `JITPACK_JWKS_URL` (mutually exclusive with `JITPACK_JWT_SECRET`). 7 new tests (4 JWKS unit + 1 full API integration + 2 config). HS256 remains available for tests and simple setups.
6. ~~**Vue 3 + Capacitor client**~~ — **IN PROGRESS.** 105 client tests passing. Built so far:
   - **Scaffold:** Ionic Vue + Capacitor + Pinia + Vitest + TypeScript. Router with tab layout + detail routes.
   - **Sync layer:** HLC generator (TS port), APIClient, SyncOutbox, WebSocket composable, Auth composable (single-user + OIDC).
   - **Stores:** `tripStore` (trips, trip_items, travelers, containers, todos/prep, KPIs, grouping), `masterStore` (categories, items, templates, template_items, search).
   - **Sync orchestrator:** Wires stores ↔ outbox ↔ WebSocket. Optimistic UI (G-5): mutations apply locally first, drain fires in background. Pull changes auto-route to correct store. WebSocket `trip.changed`/`master.changed` trigger drains. Todo actions (add/resolve/reopen FR-7.3).
   - **Global patterns:** G-2 sync indicator (synced/syncing/offline), G-6 quantity stepper (checkbox for qty=1, +/- for qty>1), G-9 responsive layout (desktop nav rail ≥900px, mobile bottom tabs).
   - **Screens:** M1 Dashboard (greeting, trip cards, KPIs, prep todos FR-7.3), M2 Trip List (filter, progress rings, FAB), M4 Packing List (KPI strip with prep counter, grouping, stepper, skip/unskip, inline quick-add FR-5.6, collapsible prep section, item prep badges), M5 Item Detail (stepper, mode, assignment, flags, preparation todos section), M7 Template List (my/published, item count), M8 Template Editor (item picker, quantity formula, swipe-to-delete), M9 Item Inventory (search, category groups, unit/consumable chips), M10 Item Editor (name, category, weight, value, unit, consumable).
   - **Not yet built:** M3 Trip Creation Wizard, M6 Shopping Views, M11–M18 (P2 screens). OIDC login flow UI.

7. **Local Mode — backend-free client (Addendum 3.19, UI-Spec M19/G-2 local state).** Client persists to IndexedDB, no server at all; collaboration UI inert per FR-19.3. The architecture is already 90% there (optimistic full-row mutations + generic `applyChanges`), so this is mostly a persistence layer plus an orchestrator variant. Task order:
   1. **Mutation completeness audit** — in Local Mode the optimistic rows in `useMutations.ts`/`useSyncOrchestrator.ts` become authoritative (FR-19.2); audit every mutation for missing fields (`created_at` etc.) against the schema, add table-driven tests. Benefits Server Mode too.
   2. **Persistence layer** — IndexedDB adapter storing rows as `table+id → row` (same shape as `PullChange`); load on startup via existing `applyChanges`; `navigator.storage.persist()` + status surface (NFR-4.11).
   3. **Local orchestrator** — same interface as `useSyncOrchestrator`, `enqueueAndDrain` becomes apply-optimistic + persist; no outbox/WS. `App.vue` picks the implementation by persisted mode.
   4. **M19 mode selection** + G-2 *local* state with storage & backup detail (FR-19.6).
   5. **Collaboration UI gating** per FR-19.3 (mirrors existing single-user hiding, G-8).
   Note for M3 wizard (item 6): template-instantiation/formula evaluation must live client-side (or shared), so Local Mode gets it for free.

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
