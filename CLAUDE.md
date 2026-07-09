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

`go test -race ./...` → all green, 113 tests.

**Built:**
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O.
- `internal/store` — SQLite repositories: change_log/conflict_log, pull with tombstone+compaction, push with idempotent mutation replay (trip partition: trip_items, travelers, containers, comments), Single-User bootstrap, avatar + display-name, template/trip export+import. Membership with three-tier role model (owner/admin/editor, FR-4.5/4.7). Master-partition sync (`master.go`, spec §4/§5): `ApplyMasterMutation`/`PullMaster` for categories, items, templates, template_items, trips — ownership enforced (templates/template_items by owner, trips by member; delete owner/admin), `owner_id`/`created_by` stamped server-side, trip insert auto-creates owner membership, template delete tombstones cascaded template_items, FK violations → outcome `rejected`, pull visibility per user (own + published templates, member trips). Migrations tracked via `PRAGMA user_version` (reopen-safe). Not yet in the master partition: trip_series, destination_*, trip_members (whitelist them in `syncableColumns`+`masterPartitionTables` when the client mutates them).
- `internal/api` — HTTP handlers: pull/push for both partitions (`/sync/trips/{id}` + `/sync/master`), JWT auth (HS256 shared secret or RS256 via JWKS from IdP), trip-membership enforcement, Single-User Mode (`api.NewSingleUser`, bypasses auth *and* membership per FR-17.3), avatar upload/download with ETag, display-name endpoint. WebSocket hub (`hub.go`/`ws.go`): per-trip subscriptions, `trip.changed` broadcast on push, `master.changed` to the pusher's own connections only (lazy discovery for others, spec §8), presence with `in_sync` computation. Portable YAML export/import endpoints for templates and trips. JWKS provider (`jwks.go`): fetches RSA public keys on startup, refreshes every 5 min, key lookup by `kid`.
- `internal/portable` — YAML wire types for portable template/trip export/import (FR-18.1–18.6). Pure marshal/unmarshal, no I/O deps. `gopkg.in/yaml.v3`.
- Two-client end-to-end tests (`internal/api/e2e_test.go`) proving concurrent offline edits converge per NFR-4.2a over real HTTP.

**Not built yet, in the order I'd tackle them:**

1. ~~**`cmd/jitpackd` main wiring**~~ — **DONE.** `cmd/jitpackd/main.go` + `config.go`: env-based Config, picks `api.New` vs `api.NewSingleUser`, graceful shutdown. 5 table-driven config tests.
2. ~~**Dockerfile / docker-compose.yml**~~ — **DONE.** Multi-stage build (golang:1.22-alpine → alpine:3.21), docker-compose with healthcheck, mem_limit, homelab conventions. Smoke-tested.
3. ~~**WebSocket hub + presence**~~ — **DONE.** `internal/api/hub.go` + `ws.go`: in-memory hub, per-trip subscriptions, `trip.changed` on push, presence with `in_sync` (cursor vs `store.HeadSeq`). `github.com/coder/websocket`. 10 new tests (6 hub unit + 4 WS integration). `item.locked`/`item.unlocked` and `notification.created` events not yet implemented (depend on locking UI and notification system).
4. ~~**Portable YAML export/import**~~ — **DONE.** `internal/portable` (YAML types + marshal/unmarshal), `internal/store/export.go` (template/trip export+import), `internal/api/export.go` (four endpoints: `GET /templates/{id}/export`, `POST /templates/import`, `GET /trips/{id}/export.yaml`, `POST /trips/import`). `gopkg.in/yaml.v3`. 19 new tests (8 portable, 6 store, 5 API). Item dedup/near-duplicate prompts (FR-16.3-style) not yet implemented — requires the master item matching UI.
5. ~~**RS256/JWKS against a real IdP**~~ — **DONE.** `internal/api/jwks.go`: JWKS provider with background refresh, RSA public key parsing from JWK, key lookup by `kid`. `api.NewWithJWKS(st, jwks)` constructor for RS256 mode. Config: `JITPACK_JWKS_URL` (mutually exclusive with `JITPACK_JWT_SECRET`). 7 new tests (4 JWKS unit + 1 full API integration + 2 config). HS256 remains available for tests and simple setups.
6. ~~**Vue 3 + Capacitor client**~~ — **IN PROGRESS.** 166 client tests passing. Built so far:
   - **Scaffold:** Ionic Vue + Capacitor + Pinia + Vitest + TypeScript. Router with tab layout + detail routes.
   - **Sync layer:** HLC generator (TS port), APIClient, SyncOutbox, WebSocket composable, Auth composable (single-user + OIDC).
   - **Stores:** `tripStore` (trips, trip_items, travelers, containers, todos/prep, KPIs, grouping), `masterStore` (categories, items, templates, template_items, search).
   - **Sync orchestrator:** Wires stores ↔ outbox ↔ WebSocket. Optimistic UI (G-5): mutations apply locally first, drain fires in background. Pull changes auto-route to correct store. WebSocket `trip.changed`/`master.changed` trigger drains. Todo actions (add/resolve/reopen FR-7.3).
   - **Domain layer (`src/domain/`, pure, no I/O):** `formula.ts` — quantity formula engine (FR-1.3/1.5/15.3): variable catalog (trip_duration, num_travelers, num_adults, num_children, season, transport_mode, accommodation), ceil/floor/round, ==/!= comparisons as 0/1, null propagation (FR-2.1a: null trip_duration → caller falls back to 1), `validateFormula` wired into M8 (invalid formulas can't be persisted). `instantiate.ts` — template instantiation (FR-2.2/2.3a/1.4/1.8/15.2): conditions filter with preview reasons, per_person expansion to one row per traveler, per-day consumable rate × duration, dedup across templates (max default, sum if any side requests it), merged/excluded reported for the M3 preview footer. Client-side by design so Local Mode gets it for free.
   - **Global patterns:** G-2 sync indicator (synced/syncing/offline), G-6 quantity stepper (checkbox for qty=1, +/- for qty>1), G-9 responsive layout (desktop nav rail ≥900px, mobile bottom tabs).
   - **Screens:** M1 Dashboard (greeting, trip cards, KPIs, prep todos FR-7.3), M2 Trip List (filter, progress rings, FAB), M3 Trip Creation Wizard (4 steps: metadata + attribute chips FR-15.1, travelers FR-2.5, template selection with live dedup/exclusion preview, quantity review with overrides; `createTripFromWizard` cascade: trips → master partition first, then travelers/trip_items → trip partition, because the server grants creator membership on the master push; sharing/roles and series picker deferred — membership/series sync not built), M4 Packing List (KPI strip with prep counter, grouping, stepper, skip/unskip, inline quick-add FR-5.6, collapsible prep section, item prep badges), M5 Item Detail (stepper, mode, assignment, flags, preparation todos section), M6 Shopping Views (two tabs buy_before/buy_local grouped by category, check-off: BUY_BEFORE → mode pack per FR-3.3, BUY_LOCAL → packed; quick-add per list via `addTripItem` mode opt; M4 toolbar entry with badge, hidden when empty; FR-13.3 destination checklists deferred until series exist), M7 Template List (my/published, item count), M8 Template Editor (item picker, quantity formula, swipe-to-delete), M9 Item Inventory (search, category groups, unit/consumable chips), M10 Item Editor (name, category, weight, value, unit, consumable).
   - **Persistence wiring:** all editor mutations go through the orchestrator — M8/M10 master edits (`createMasterItem`/`updateMasterItem`/`deleteMasterItem`/`updateTemplate`/`addTemplateItem`/`updateTemplateItem`/`deleteTemplateItem` actions on the master partition), M5 assignment controls (`assignTraveler`/`assignContainer`/`setLatePacker` on the trip partition). No store-local placeholder mutations remain.
   - **Not yet built:** M11–M18 (P2 screens). OIDC login flow UI. M3 deferred bits: series picker (FR-13.1), sharing/role step (FR-4.5), history suggestions (FR-14.2). Template/item *creation* UI in M7/M9 (orchestrator actions exist).

7. ~~**Local Mode — backend-free client (Addendum 3.19, UI-Spec M19/G-2 local state).**~~ — **DONE** (2026-07-09):
   - `src/local/persistence.ts` — IndexedDB adapter, rows as `table/id → row` in `PullChange` shape; `requestDurability()` per NFR-4.11.
   - Local Mode is a config variant of `useSyncOrchestrator` (`local: IndexedDBPersistence`), not a parallel composable: `onPullChanges` is the single funnel and persists every change; enqueue/drain/WS are no-ops; `connect()` loads from IndexedDB through the same `applyChanges` path as a server pull (FR-19.2).
   - M19 `ModeSelectionPage` rendered by `App.vue` before the router until a mode is persisted (`jitpack_mode`, plus `jitpack_server_url` for Server Mode); switching later requires the FR-19.5 export/import path, no toggle.
   - G-2 shows the `local` state (new `SyncState` value, phone glyph, FR-19.6).
   - Test infra: `fake-indexeddb` (dev dep — jsdom has no IndexedDB).
   - Still open: FR-19.3 collaboration-UI gating is trivially satisfied today (no collaboration UI exists yet) — gate it when sharing/presence UI lands. NFR-4.11 export reminder (>30 days) and storage-detail popover not built. FR-19.5 migration flow relies on portable YAML export/import UI (M18).

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` now uses the pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`, and the Dockerfile needs no C toolchain. History in `DEVIATIONS.md`.

## Working agreement (non-negotiable, see CODING_PRINCIPLES.md for full detail)

- Test-first: red (failing test as spec) → green → refactor. No production code without a driving test.
- Table-driven tests; real in-memory SQLite for integration tests, never DB mocks; `go test -race` always.
- Coverage: ≥90% on `internal/sync` and `internal/domain` (when it exists), ≥75% overall.
- English throughout; comments only for *why*, never *what*; godoc mandatory on exported symbols.
- Standard library first — any new dependency needs a one-line justification, footprint is a first-class concern (NFR-4.3).
- Package boundaries: `api → domain/sync/store`, `store → domain`; `domain` and `sync` import nothing internal, ever.
