# Implementation log

What has been built, in the order it was built, with the reasoning decided
along the way. This is **history**: append to it, don't restructure it.

`CLAUDE.md` is the orientation document — what the project is, where things
live, and the invariants that must hold. It deliberately no longer carries this
log, because a file that grows with every shipped feature stops working as the
thing you read first. If something recorded here is still load-bearing for
*future* work, it belongs in `CLAUDE.md`'s invariants or in an ADR as well —
this log alone is not where a binding rule should live.

## Current state

> **Repack (Return-Trip Mode) is REMOVED (owner decision, 2026-07-17).** Spec retired (PRD Addendum
> §3.11, UI-Spec M13, UI-Test-Spec M13 cases) and client code + tests deleted (`domain/repack.ts`,
> `RepackPage.vue`, the router route, `startRepack`/`completeRepack`/`resetForRepack`, all view
> references). The `outbound_packed` column and the `repack` value in the trips-status CHECK remain
> as inert dead schema in already-applied migrations 001/004 — applied migrations are never edited.
> **Do not reintroduce repack.**

`go test -race ./...` → all green, 194 tests. Client: 407 vitest tests (52 files).

**CI/CD** (`.github/`, modeled on skipper-cd, 2026-07-10): `ci.yml` — Go job (build, vet, `-race` tests, coverage gates 75 % overall / 90 % `internal/sync`, `go mod tidy` check), golangci-lint (config in `.golangci.yml`: errcheck excludes for deferred-cleanup/response-writing idioms, staticcheck all minus QF1001, `client/` excluded), client job (`npm ci`, oxlint + eslint *without* `--fix`, `npm run build` = type-check + vite, `vitest run`), **autoformat job** (gofmt + prettier, commits `style: apply automatic formatting` back to the branch; skipped on fork PRs; GITHUB_TOKEN pushes don't retrigger CI — fine, formatting is semantics-free), docker-build check. `docker.yml` — ghcr.io push on `v*` tags (semver + sha + latest). `release.yml` — release-please (go) maintains the release PR from Conventional Commits; authenticates with a PAT (`secrets.RELEASE_PLEASE_TOKEN`, falls back to `GITHUB_TOKEN` if unset) so the release PR gets CI and the release tag it creates triggers docker.yml directly (GITHUB_TOKEN-raised events never trigger workflows — that's why the old explicit docker dispatch existed; removed 2026-07-11 to avoid a double build once the PAT lands). PAT is a fine-grained token on this repo with contents:write + pull-requests:write + workflows. Dependabot weekly (gomod, npm in /client, actions, docker) + auto-merge for patch/minor. Client `src/` is fully prettier-formatted since 2026-07-10 — keep it that way or the autoformat bot will. Branch protection/rulesets are **unavailable** (free-plan private repo, API returns 403 "Upgrade to GitHub Pro or make this repository public") — Dependabot merging is instead gated by the `dependabot-merge` job in ci.yml (`needs` all check jobs, so it waits for green by construction; majors stay open for review). The Actions setting "allow GitHub Actions to create and approve pull requests" is enabled (2026-07-10, release-please needs it). If the repo ever goes public: add real branch protection on `main` with go/go-lint/client/docker-build as required checks.

**Built:**
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O.
- `internal/store` — SQLite repositories: change_log/conflict_log, pull with tombstone+compaction, push with idempotent mutation replay (trip partition: trip_items, travelers, containers, comments), Single-User bootstrap, avatar + display-name, template/trip export+import. Membership with three-tier role model (owner/admin/editor, FR-4.5/4.7). Master-partition sync (`master.go`, spec §4/§5): `ApplyMasterMutation`/`PullMaster` for categories, items, templates, template_items, trips — authorization enforced (trips by member, delete owner/admin; templates/template_items shared instance-wide since the FR-1.6 MVP simplification), `owner_id`/`created_by` stamped server-side on insert and never rewritten, trip insert auto-creates owner membership, template delete tombstones cascaded template_items, FK violations → outcome `rejected`, pull visibility per user (member trips; categories/items/templates instance-wide). Migrations tracked via `PRAGMA user_version` (reopen-safe). Series in the master partition since migration 006 (M16): trip_series (owner_id stamped, owner-only visibility), destination_profiles/destination_checklist_items authorized+visible via the series-owner chain (`ownsAll`/`ownedBy`), series/profile deletes tombstone their FK cascade (`cascadeChildren`). trip_members in the master partition since migration 009 (FR-4.5/4.7): single-column `id` + `updated_hlc` (natural key kept as UNIQUE(trip_id, user_id)), managed only by Owner/Admin, clients can never grant `owner`, the creator's row is immutable (any mutation of a role=owner row rejects), duplicate adds reject via the broadened `isConstraintViolation` (FK+UNIQUE+CHECK → outcome `rejected`); trip insert logs the auto-created owner membership, and a member grant re-logs the `trips` row so a late-added member's cursor picks the trip up (`memberTrip` touch); roster rows visible to every member of their trip. `ListUsers` directory for the M3 sharing picker.
- `internal/api` — HTTP handlers: pull/push for both partitions (`/sync/trips/{id}` + `/sync/master`), JWT auth (HS256 shared secret or RS256 via JWKS from IdP), trip-membership enforcement, Single-User Mode (`api.NewSingleUser`, bypasses auth *and* membership per FR-17.3), avatar upload/download with ETag, display-name endpoint. WebSocket hub (`hub.go`/`ws.go`): spec-§7 wire protocol (`?token=` query-param auth for browser dials, `{"subscribe": ["trip:<id>"]}`/`unsubscribe`/`{"cursor": {trip_id, seq}}` client frames, `{type, payload}` envelope), per-trip subscriptions, `trip.changed` broadcast on push, `master.changed` to the pusher's own connections only (lazy discovery for others, spec §8), presence as `users:[{user_id, device_count, in_sync}]`. Portable YAML export/import endpoints for templates and trips. JWKS provider (`jwks.go`): fetches RSA public keys on startup, refreshes every 5 min, key lookup by `kid`.
- `internal/portable` — YAML wire types for portable template/trip export/import (FR-18.1–18.6). Pure marshal/unmarshal, no I/O deps. `gopkg.in/yaml.v3`.
- Two-client end-to-end tests (`internal/api/e2e_test.go`) proving concurrent offline edits converge per NFR-4.2a over real HTTP.

**Not built yet, in the order I'd tackle them:**

1. ~~**`cmd/jitpackd` main wiring**~~ — **DONE.** `cmd/jitpackd/main.go` + `config.go`: env-based Config, picks `api.New` vs `api.NewSingleUser`, graceful shutdown. 5 table-driven config tests.
2. ~~**Dockerfile / docker-compose.yml**~~ — **DONE.** Multi-stage build (golang:1.22-alpine → alpine:3.21), docker-compose with healthcheck, mem_limit, homelab conventions. Smoke-tested.
3. ~~**WebSocket hub + presence**~~ — **DONE.** `internal/api/hub.go` + `ws.go`: in-memory hub, per-trip subscriptions, `trip.changed` on push, presence with `in_sync` (cursor vs `store.HeadSeq`). `github.com/coder/websocket`. 10 new tests (6 hub unit + 4 WS integration). `item.locked`/`item.unlocked` implemented (2026-07-09): server stamps actor columns on push (`stampActor` in server.go — comment `author_id` on insert, `packing_now_by`+`packing_now_at` on state packing_now, `packer_user_id` on state packed per FR-4.2; client placeholders like 'current-user' are never trusted, which also prevents FK 500s) and emits the ephemeral lock events before `trip.changed`. Client: `packingNow` action (M4 swipe right), all pack/skip transitions clear the claim, `isLockedByOther` merges ephemeral locks + synced packing_now state with the §7 15-min staleness rule; locked rows are non-interactive with lock chip (G-3); own-device claims tracked in `myLocks` because the client doesn't know its user id pre-OIDC. `notification.created` done (2026-07-10, see item 8).
4. ~~**Portable YAML export/import**~~ — **DONE.** `internal/portable` (YAML types + marshal/unmarshal), `internal/store/export.go` (template/trip export+import), `internal/api/export.go` (four endpoints: `GET /templates/{id}/export`, `POST /templates/import`, `GET /trips/{id}/export.yaml`, `POST /trips/import`). `gopkg.in/yaml.v3`. 19 new tests (8 portable, 6 store, 5 API). Item dedup/near-duplicate prompts (FR-16.3-style) not yet implemented — requires the master item matching UI.
5. ~~**RS256/JWKS against a real IdP**~~ — **DONE.** `internal/api/jwks.go`: JWKS provider with background refresh, RSA public key parsing from JWK, key lookup by `kid`. `api.NewWithJWKS(st, jwks)` constructor for RS256 mode. Config: `JITPACK_JWKS_URL` (mutually exclusive with `JITPACK_JWT_SECRET`). HS256 remains available for tests and simple setups. **OIDC exchange (2026-07-09):** the server brokers code+PKCE (`auth.go`: `POST /api/v1/auth/token|refresh`, `GET /api/v1/auth/config`; env `JITPACK_OIDC_TOKEN_URL`/`_AUTHORIZE_URL`/`_CLIENT_ID`, requires JWKS) — verifies the IdP token via JWKS, JIT-provisions (`store.EnsureOIDCUser`), passes the token set through. In JWKS mode `authed` maps token sub (OIDC subject) → `users.id` per request, so attribution is always `users.id` (spec §2 updated). Client: PKCE helpers (`src/auth/pkce.ts`, RFC-7636-vector-tested), token persistence (`src/auth/tokens.ts`), `/login` + `/auth/callback` pages, App.vue redirects to login when the server offers OIDC and no session exists. **Token auto-refresh (2026-07-09):** `src/auth/refresh.ts` (`createAuthRefresher`) refreshes proactively 30 s before expiry and reactively on 401 (APIClient retries the failed request once via the `onUnauthorized` hook — all four request paths incl. blob/raw), single-flight for concurrent callers, keeps the old refresh token when the IdP doesn't rotate, network failure ≠ logout (keeps current token — offline is normal); only an IdP rejection clears tokens and fires `jitpack:auth-expired`, which App.vue answers with a redirect to `/login`. `getToken` is now a possibly-async `TokenProvider` throughout (APIClient, WS dial awaits it). Spec §2 documents the client behavior.
6. ~~**Vue 3 + Capacitor client**~~ — **IN PROGRESS.** 407 client tests passing. Built so far:
   - **Scaffold:** Ionic Vue + Capacitor + Pinia + Vitest + TypeScript. Router with tab layout + detail routes.
   - **Sync layer:** HLC generator (TS port), APIClient, SyncOutbox, WebSocket composable, Auth composable (single-user + OIDC).
   - **Stores:** `tripStore` (trips, trip_items, travelers, containers, todos/prep, KPIs, grouping), `masterStore` (categories, items, templates, template_items, search).
   - **Sync orchestrator:** Wires stores ↔ outbox ↔ WebSocket. Optimistic UI (G-5): mutations apply locally first, drain fires in background. Pull changes auto-route to correct store. WebSocket `trip.changed`/`master.changed` trigger drains. Todo actions (add/resolve/reopen FR-7.3).
   - **Domain layer (`src/domain/`, pure, no I/O):** `instantiate.ts` — template instantiation (FR-2.2/2.3a/1.4/15.2): conditions filter with preview reasons, plain integer quantities (`formula.ts` and the FR-1.3/1.5 engine were **removed 2026-08-08**, owner decision — see the Open-items record), per_person expansion to one row per traveler, dedup across templates (max default, sum if any side requests it), merged/excluded reported for the M3 preview footer. Client-side by design so Local Mode gets it for free.
   - **Global patterns:** G-2 sync indicator (synced/syncing/offline/local), G-6 quantity stepper (checkbox for qty=1, +/- for qty>1), G-9 responsive layout (desktop nav rail ≥900px, mobile bottom tabs), G-10 presence facepile + group-sync badge in M4 (fed by WS presence events; client reports its pull cursor after each trip drain so the server can compute `in_sync`; hidden with ≤1 user, so inert in Single-User/Local per G-8). G-2 conflict log: `GET /trips/{id}/conflicts` (documented in spec §8), ConflictLogPage at `/trips/:tripId/conflicts`, opened by tapping the sync indicator inside a trip; Local Mode resolves empty without network (single writer).
   - **Screens:** M1 Dashboard (greeting, trip cards, KPIs, prep todos FR-7.3), M2 Trip List (filter, progress rings, FAB; Share slide option → TripMembersPage at `/trips/:tripId/members` per FR-4.5/4.7 — roster with role select (Editor/Admin) and remove for Owner/Admin, read-only for Editors, owner row immutable, add-picker from `GET /users`; pure view logic in `src/domain/members.ts` `buildRosterView`, mirrors the server rules; Share hidden without an OIDC session per G-8), M3 Trip Creation Wizard (4 steps: metadata + attribute chips FR-15.1, travelers FR-2.5, template selection with live dedup/exclusion preview, quantity review with overrides; `createTripFromWizard` cascade: trips → master partition first, then travelers/trip_items → trip partition, because the server grants creator membership on the master push; series picker in step 1 with inline "New series…" — inline series enqueue *before* the trip in the same master queue, a separate drain could race; picking a series prefills empty attribute chips from its defaults, `?series=` preselects from M16; step 4 offers the series' destination checklist (FR-13.3) as opt-out extra trip items; sharing/role step in step 2 (FR-4.5/4.7): user picker from `GET /users` minus self, Editor/Admin role select, grants enqueued *after* the trips insert in the same master queue (server authorizes against the fresh trip), rendered only with an OIDC session per G-8 — Single-User/Local hide it), M4 Packing List (KPI strip with prep counter, grouping, stepper, skip/unskip, inline quick-add FR-5.6, collapsible prep section, item prep badges), M5 Item Detail (stepper, mode, assignment, flags, preparation todos section, comment thread FR-7.1 with flag-as-task FR-7.2 — flagged comments become todos in the same comments table; note: FR-7.2's hard completion-block is superseded by FR-7.3's "packed with open prep" state; trip-level comments modeled in the store, UI deferred), M6 Shopping Views (two tabs buy_before/buy_local grouped by category, check-off: BUY_BEFORE → mode pack per FR-3.3, BUY_LOCAL → packed; quick-add per list via `addTripItem` mode opt; M4 toolbar entry with badge, hidden when empty; FR-13.3 destination checklists are offered in M3 step 4, not here), M11 Container Management (FR-10.1–10.3: CRUD with carrier/max-weight/pairing on `containers` incl. `paired_container_id`; pure weight math in `src/domain/containers.ts` — planned weight × quantity, amber ≥90 %/red >max, pairing imbalance vs heavier side with 15 % default overridable per trip via `attributes.imbalance_threshold`; unassigned bucket with assign select; `deleteContainer` unassigns items first — plain FK would reject the delete; entry from M4's container grouping; no threshold-setting UI yet), M12 Analytics (FR-8.2/10.4/14.3: `src/domain/analytics.ts` pure — `analyzeByDimension` person/category/container with planned/packed weight, value totals, honest "unweighted (n)" bucket; `seriesWeightTrend` + `topFlagged` over archived trips synced to the device; page at `/trips/:tripId/analytics` with stacked bars, dimension segment, trend section when the trip has a series; tap slice → M4 grouped by that dimension — per-slice deep filters not built; entry: tap the M4 KPI strip), M13 Repack Mode — **removed 2026-07-17, see the note at the top of this section** (one survivor of that work is kept because it was never repack-specific: the outbox chunks pushes at the 200-mutation server cap and only drops pushed chunks, so large wizard trips no longer wedge the queue), M14 Post-Trip Review Assistant (FR-9.1/9.2: `src/domain/review.ts` pure `buildReviewProposals` — unused-flagged templated items → "set quantity to 0 in the source template", missing-flagged items → "add to the trip's dominant template" (the one that contributed most items), dedup against items the template already contains, ad-hoc names matched to master items case-insensitively (unmatched → apply creates the master item first); proposals are recomputed from current state, so applied cards vanish = resumability for free; runs client-side like generation, spec §8 archive/review rows marked superseded; `archiveTrip` = plain `trips.status` mutation, `applyReviewProposal` writes ordinary master mutations straight to the source template (the fork path went with the FR-1.6 MVP simplification, 2026-08-08); "Never ask again" scoped to the item–template pair in a device-local localStorage store (`src/local/reviewDismissals.ts`) — deliberate: no synced table for UI mutings, another device asks at most once more; flag history counted over archived series trips synced to the device (M12-style honesty); page at `/trips/:tripId/review` = card stack Apply/Skip/Never + applied-changes summary; M4 toolbar: archive on active trips auto-launches review, sparkles re-entry on archived trips. Open: NFR-4.2a conflict-log compaction on archive has no server trigger now that archiving is a plain status mutation — noted in spec §8), M7 Template List (one shared list, item count), M8 Template Editor (item picker, quantity, swipe-to-delete), M9 Item Inventory (search, category groups, unit chips), M10 Item Editor (name, category, weight, value, unit), M16 Series & Destination Profile (FR-13.1–13.3: page at `/series/:seriesId` — name + default attribute chips (M3 prefill source), destination notes and checklist editor on the lazily created unique profile (`ensureDestinationProfile`), trip history with per-trip stats and detach, attach-select over series-less trips, "New trip in series" → M3 `?series=`, trends shortcut → newest trip's M12; M2 groups trips by series with tappable header → M16; orchestrator: createSeries/updateSeries/setTripSeries/ensureDestinationProfile/updateDestinationProfile/add-update-deleteChecklistItem, all master partition), Trip Cloning (FR-12.1/12.2: `src/domain/clone.ts` pure `planClone` — curated list with fresh pack state (skips travel with the clone as list curation, pack progress/flags don't), three carry-over toggles (traveler assignments / packer delegations / container assignments; containers only copied when their toggle is on), quantities carry over unchanged (formula re-evaluation retired with FR-1.3/1.5); `cloneTrip` cascade mirrors the wizard (trips→master first; container *pairing* set in a second upsert pass — a forward pair reference would violate the FK); ClonePage at `/trips/:tripId/clone` with fresh dates + toggles + live preview; entries: M2 slide option on archived trips (slide-archive on active trips now actually works → M14), M16 "Clone last trip" on the newest archived series trip per FR-12.1; spec §8 clone row superseded), M15 Import Wizard (FR-16.1–16.3/NFR-4.7: `src/domain/spreadsheet.ts` pure — CSV parser with ,/;/tab auto-detect + quotes, `analyzeGrid` suggests item column/trip columns/category rows, `parseQuantity` (x/✓ → 1), `normalizeTripDate` (bare year → Dec 31), `findDuplicates` (exact-normalized auto-merge + Levenshtein ≤2 prompts, FR-16.3), `buildImportPlan` (category grouping, trailing '?' → open task); `commitImport` cascade: categories reused case-insensitively then created, master items merged per dedup decision, trips archived+`imported` with original quantities as packed rows, '?' noise → todo comment on the row; page at `/import` 4 steps (file/paste → mapping with select-all-default trip toggles + per-trip series target → dedup merge/keep-separate → confirm); entries: M2 title-row upload icon, M9 empty state. Scope cuts, documented in spec §8: CSV only (XLSX = export to CSV; parser dep fails NFR-4.3), NFR-4.7 transactionality approximated by pre-validation + parents-first idempotent enqueue — no cross-mutation server transaction), M17 Settings (page at `/tabs/settings`, header gear now resolves — it was a dead link; profile per FR-17.13: editable display name (inline `[A-Za-z0-9._-]{1,50}` validation) + avatar upload with on-device 256×256 JPEG center-crop when *no* OIDC session exists (single-user server), read-only IdP note otherwise, plain note in Local Mode; identity via new `GET /api/v1/me`; data section: NFR-4.5 full-JSON + per-trip-CSV downloads through `downloadExport` (auth-header blob), portable-YAML note in Local Mode; conflict-log pointer (G-2 lives on the trip sync indicator), about section. Deliberate gap: avatar pan/zoom crop positioning deferred, center-crop only. Notification prefs + Web-Push toggle live in the Notifications section since 2026-07-10 (item 8). Server: `internal/api/backup.go` + `internal/store/backup.go` (ExportFull visibility-filtered, UserDisplayName, CSV from the portable ExportTrip document); APIClient gained put/putRaw/getBlob and tolerates empty 200 bodies), M18 Portable Import Preview (FR-18.4/18.5: `src/domain/portable.ts` pure — YAML parse via the `yaml` package (already a transitive Vite dep, zero added footprint) with validation (malformed rejected at the picker), forward compatibility (unknown fields ignored, newer `schema_version` → warning + best-effort), `matchPortableItems` reuses the M15 `findDuplicates` for new/matched/near states; `commitPortableImport` client-side — **decided: import runs client-side** because the portable export is Local Mode's backup (NFR-4.11) and restore must work serverless, and the FR-16.3 merge prompts need decisions before commit; the server's POST import endpoints remain for API use. Template → new shared template (FR-1.6 MVP, name collision → " (import)" suffix, unmatched items create master items, conditions/dedup/late_packer carried); trip → *planning* trip, travelers/containers remapped by name, progress preserved via state derivation (open/partial/packed/skipped), unmatched trip rows stay ad-hoc; single-screen page at `/portable-import` (summary header, state chips, merge segments, schema warning); entries: M7 + M2 title rows. `addTemplateItem` mutation now carries conditions. **Portable export UI (FR-18.2/18.3)**: `serializeTemplate`/`serializeTrip` in portable.ts write the exact server format (field names, omit-empty, by-name ordering — round-trip tested against `parsePortable`), generated **client-side from the stores** so Local Mode backups work without a server (NFR-4.11) and FR-19.5's migration path is complete in both directions; M7 download button per template, M2 slide option with progress/clean ActionSheet per FR-18.3, M17 Local-Mode data section offers trip+template YAML downloads; shared `src/lib/download.ts`).
   - **Persistence wiring:** all editor mutations go through the orchestrator — M8/M10 master edits (`createMasterItem`/`updateMasterItem`/`deleteMasterItem`/`updateTemplate`/`addTemplateItem`/`updateTemplateItem`/`deleteTemplateItem` actions on the master partition), M5 assignment controls (`assignTraveler`/`assignContainer`/`setLatePacker` on the trip partition). No store-local placeholder mutations remain.
   - **M2 Delete (FR-4.5, done 2026-07-11):** destructive slide option with confirm, shown only to the trip Owner (`canDelete`: non-collaborative modes always, else the roster is checked against `fetchMe`); `deleteTrip` mutation + orchestrator action tombstone the trip on the master partition, server enforces Owner/Admin and cascades, local store drops the trip + child rows.
   - **M7/M9 creation UI (done 2026-07-11):** the New Template (M7) and New Item (M9) FABs prompt for a name, create the row (`createTemplate` — new orchestrator action, owner_id server-stamped; `createMasterItem` — existing), and open the editor (M8/M10).
   - **G-4 deep-link highlight (done 2026-07-11):** mention/task notifications carry the comment id (`?comment=` in `notificationRoute` + the `sw.js` mirror); M5 watches the thread and scrolls to + flashes that message once it's synced in.
   - **FR-14.2 history suggestions (done 2026-07-11):** M3 step 4 offers a one-tap default per item — duration-normalized median of the series' last three trips ("2024: 5 · 2025: 6 → use 6"). `src/domain/suggestions.ts` (pure, tested), computed client-side from synced series trips like generation/analytics/review (works in Local Mode; supersedes the planned `GET /suggestions` endpoint, spec §8 struck through).
   - **NFR-4.11 export reminder (done 2026-07-11):** Local Mode M17 warns when the portable-YAML backup is stale (never, or >30 days — `src/local/exportReminder.ts`, pure/tested, device-local timestamp cleared on each YAML download) + a Storage-details row (navigator.storage estimate/persisted).
   - **M17 avatar pan/zoom crop (done 2026-07-11):** `AvatarCropModal` (drag to pan, slider to zoom over a circular viewport) replaces the center-only crop; geometry in `src/lib/avatarCrop.ts` (pure/tested), output the same 256×256 JPEG.
   - **Not yet built:** OIDC login flow UI polish (token auto-refresh is done, see item 5). Rosters of trips created before migration 009 never enter the master feed (no backfill — consistent with 005/006; recreate or re-share affected trips). M15 XLSX support (CSV only, see spec §8 — deliberate NFR-4.3 cut). TypeScript 7 bump blocked by vue-tsc incompatibility (dependabot PR #4 left open).

7. ~~**Local Mode — backend-free client (Addendum 3.19, UI-Spec M19/G-2 local state).**~~ — **DONE** (2026-07-09):
   - `src/local/persistence.ts` — IndexedDB adapter, rows as `table/id → row` in `PullChange` shape; `requestDurability()` per NFR-4.11.
   - Local Mode is a config variant of `useSyncOrchestrator` (`local: IndexedDBPersistence`), not a parallel composable: `onPullChanges` is the single funnel and persists every change; enqueue/drain/WS are no-ops; `connect()` loads from IndexedDB through the same `applyChanges` path as a server pull (FR-19.2).
   - M19 `ModeSelectionPage` rendered by `App.vue` before the router until a mode is persisted (`jitpack_mode`, plus `jitpack_server_url` for Server Mode); switching later requires the FR-19.5 export/import path, no toggle.
   - G-2 shows the `local` state (new `SyncState` value, phone glyph, FR-19.6).
   - Test infra: `fake-indexeddb` (dev dep — jsdom has no IndexedDB).
   - Still open: FR-19.3 collaboration-UI gating is trivially satisfied today (no collaboration UI exists yet) — gate it when sharing/presence UI lands. NFR-4.11 export reminder (>30 days) + storage-detail popover done 2026-07-11 (client item 6). FR-19.5 migration is complete in both directions: M18 imports and the client-side YAML exports (M7/M2/M17) both work serverless.

8. ~~**Notification system (FR-6.2, NFR-4.6, UI-Spec M17).**~~ — **DONE** (2026-07-10), three commits (server core, Web Push, client):
   - **Server detection** (`internal/api/notifications.go`, hooked into `handlePush` after `trip.changed`): three kinds — `delegation` (a push sets `packer_user_id` to another member; state=packed never triggers because `stampActor` self-stamps), `mention` (`@display-name` in a comment body, case-insensitive, names may contain spaces, word-boundary after the name), `task` (task comment on an item whose packer is another member; a packer who is also mentioned gets only the task). Skipped entirely in Single-User Mode (FR-17.3) and on solo trips. Store: `internal/store/notifications.go` (rows in the existing `notifications` table, payload = FR-6.3 deep-link context incl. `actor_name`/`item_name`/`preview`), per-kind prefs as JSON on `users.notification_prefs` (NULL/missing key = enabled) checked at *creation* time. Migration 007.
   - **API**: `GET /notifications` (`?unread=1`), `POST /notifications/{id}/read` (owner-scoped, idempotent), `GET/PUT /me/notification-prefs`. WS `notification.created {notification_id}` goes to all connections *authenticated* as the target (no `user:` subscription needed — the frame is accepted but redundant, spec §7 updated).
   - **Web Push (NFR-4.6)**: `internal/api/push.go` + `internal/store/push.go`, migration 008 (`push_subscriptions`, `server_keys`). VAPID keypair self-generated on first use, persisted first-writer-wins in `server_keys`. `GET /push/vapid-key`, `POST /push/subscriptions` (endpoint = identity, rebinds on re-register), `DELETE /push/subscriptions` (owner-scoped). Sends run in a detached goroutine, RFC 8291 `aes128gcm`; 404/410 from the push service drops the subscription. Env `JITPACK_PUSH_CONTACT` (VAPID sub). Dependency `github.com/SherClockHolmes/webpush-go` (RFC 8291 encryption + VAPID signing — crypto not to hand-roll; only pulls x/crypto). UnifiedPush/FCM/APNs not implemented (no native build exists); WS is the universal in-app fallback.
   - **Client**: `src/notifications/format.ts` pure (`describeNotification` wording + `notificationRoute` deep link — mirrored in `public/sw.js`, which can't import modules); `src/notifications/push.ts` (browser dance: permission → SW register → `pushManager.subscribe` with the VAPID key → server registration; server half injected as `PushServerAPI` = `orchestrator.pushApi`). Orchestrator: `onNotification` config callback, `notification.created` → fetch unread → surface each id once (`surfacedNotifications` set), `connect()` also surfaces unread missed while away; `markNotificationRead`/`fetchNotificationPrefs`/`saveNotificationPrefs` actions; APIClient gained `delete`. App.vue: toast per notification (top, 6 s, "Open" → deep link route), read stamped on dismiss — deliberate: no inbox screen exists in the UI spec, the toast is the delivery. M17: Notifications section (three kind toggles + "Push on this device" with support detection), only rendered with an OIDC session (`collaborative`) per FR-17.3/FR-19.3/G-8.
   - G-4 deep-link highlight implemented 2026-07-11 (mention/task → M5 flashes the referenced comment; see client item 6). `public/sw.js` is push-only — no caching, offline remains the state-sync story.

9. ~~**Theming / Dark Mode Default (Addendum 3.21, FR-21.1–21.4, UI-Spec G-11).**~~ — **DONE** (2026-07-10). `client/src/theme/catppuccin.css` is the single FR-21.2 token table: Mocha on `:root` (dark default in every mode, FR-21.1), Latte behind the `jitpack-latte` root class; Ionic's variables (all 9 colors incl. rgb/contrast/shade/tint, background/text, stepped colors via `color-mix()` from the two anchors) consume the same `--ct-*` custom properties — no parallel color system. Semantic mapping: primary=blue, secondary=teal, tertiary=mauve, success=green, warning=peach, danger=red, light=surface0, medium=overlay1, dark=text; app bg=mantle, cards/items=base. `client/src/theme/theme.ts` (`initTheme`/`setTheme`/`resolveTheme`, key `jitpack_theme`) flips the class; `dark.system.css` removed from `main.ts`. FR-21.4 twice: inline pre-paint script in `index.html` + synchronous `initTheme()` before mount — dark is the stylesheet default, so a missing preference can't flash. M17 gained an Appearance section (light-theme toggle, every mode, device-local). The claude.ai/design project "JIT-Pack Design System" shows the same token table on every card (Mocha/Latte side by side).
10. ~~**Instance User Management (Addendum 3.23, FR-23.1–23.6, UI-Spec M20).**~~ — **DONE** (2026-07-10), two commits (server, client):
   - **Server**: migration 010 (`users.is_instance_admin`, `deactivated_at`). Admin role is declarative (FR-23.1): `JITPACK_ADMIN_EMAILS` (comma-separated, `cmd/jitpackd/config.go` `splitList`) matched case-insensitively against the token's `email` claim (`isAdminEmail`), stamped authoritatively in both directions by `EnsureOIDCUser` on every login — which now also stamps `users.email` (empty claim leaves it alone) and re-stamps a reset ('') display name from the IdP claim, all in one conditional UPDATE that keeps the per-request hot path read-only. Deactivation (FR-23.3, `internal/store/admin.go`): 403 `account_deactivated` in `authed` (covers `wsAuth` — it delegates), push subscriptions deleted, `CreateNotification` suppressed at the single source, hidden from `GET /users`, JIT login never resurrects; data/attributions untouched; admins → 409 `admin_undeactivatable` (remove from the env list first). `/api/v1/admin/` surface behind `adminOnly` (layered on `authed` like `member`): overview with usage counts (`AdminUsers`), deactivate/reactivate, avatar + display-name reset (FR-23.4). `GET /me` gained `is_instance_admin`. No delete anywhere (FR-23.5, anonymization is the revisit path). Single-User bypasses `authed` → whole feature inert (FR-17.11/G-8).
   - **Client**: `email` scope added to the authorize request (`pkce.ts` — prerequisite for the claim). `src/domain/admin.ts` pure `adminActionsFor` (no Deactivate on admins/own row, Reactivate on deactivated rows, resets always, mirrors the server). Orchestrator: `fetchAdminUsers`/`deactivateUser`/`reactivateUser`/`adminResetAvatar`/`adminResetDisplayName`, `fetchMe` typed with the admin flag. M20 `AdminPage` at `/admin`: account list (avatar, email, provisioning date, usage counts, Admin/Deactivated chips, "(you)" marker, dimmed deactivated rows), per-row ActionSheet, FR-23.3 consequences spelled out in the deactivation confirm; M17 gained the Administration row (rendered only `collaborative && me.is_instance_admin`).
11. ~~**Item Dependencies / "Companion Items" (Addendum 3.20, FR-20.1–20.4).**~~ — **DONE** (2026-07-10), four commits (server, domain, wiring, UI):
   - **Server**: migration 011 `item_dependencies` (`item_id` depends on `depends_on_item_id`, mode `required`/`suggested`, optional `quantity` (plain integer since migration 014); UNIQUE pair, CHECK against self-reference). Master partition via whitelist only — shared like `items` (anyone writes, everyone sees); item deletes cascade both directions and tombstone the relations (`cascadeChildren`). No server-side cycle check — that's save-time client validation per the addendum, and the resolver tolerates synced cycles.
   - **Domain** (`client/src/domain/dependencies.ts`, pure): `resolveDependencies` runs after `generateTripItems` — required companions join transitively (BFS, visited-set cycle guard), suggested surface as one-tap candidates, anything already on the list dedups by `source_item_id` per FR-20.3 (two mains requiring the same companion merge at max, FR-2.3a — the relation carries no dedup attribute). Companion quantities reuse `computeQuantity` (plain integer since the FR-1.3/1.5 removal). `dependentsOf` = transitive co-skip set; `dependencyCycleError` = save-time validator with readable path.
   - **Wiring**: masterStore `item_dependencies` case + `dependencyList`/`getItemDependencies`/`getCompanionDependencies`; orchestrator `addItemDependency`/`updateItemDependency`/`deleteItemDependency` (master partition), `skipItem` co-skips transitive dependents in the same push (FR-20.2), `quickAddItem` with a `sourceItemId` auto-adds missing *required* companions (FR-20.4: required never prompts).
   - **UI**: M10 "Depends on" section (picker excludes self+existing, mode select, inline cycle error) + read-only "Companions" list; M3 step-3 chip "+ N companion items (…)", step-4 companion list with via-item, FR-20.3 dedup notes ("already on the list, not duplicated"), suggested companions as opt-in checkboxes (checkbox = the one tap; accepted rows commit with `source_template_id: null` — `TripWizardDraft.items` widened accordingly); M5 "Companions" hint with one-tap Add (via quickAdd, which chains required companions of the accepted suggestion); M4 skipped section shows the co-skip reason ("skipped: Kamera not on this trip").
12. ~~**Item Images (Addendum 3.22, FR-22.1–22.6).**~~ — **DONE** (2026-07-11), three commits (server, client core, UI):
   - **Server**: migration 012 `item_images` (`item_id` PK → `items(id) ON DELETE CASCADE`, `image BLOB`, `mime` CHECK `image/jpeg`, `CHECK length ≤ 153600`, `updated_at`) + `items.image_hash TEXT` (nullable, added to `syncableColumns["items"]`). The BLOB is deliberately outside the sync envelope (ADR-002); only `image_hash` flows through the master feed. Store `SetItemImage`/`GetItemImage`/`DeleteItemImage` (`internal/store/itemimage.go`) stamp `image_hash` through the master change-log with a fresh **server-side HLC** — new `Store.hlc` generator (random per-process device id; wall-clock ms keeps HLCs increasing across restarts) since there's no client mutation behind the fact. `withImageTx` bumps `items.updated_hlc` + appends the change_log entry in one tx; a missing item → `ErrItemNotFound`. API (`internal/api/itemimage.go`): `GET /items/{id}/image` (public, ETag = hash, like avatars), `PUT`/`DELETE` behind `s.authed` **only** — FR-22.6 forbids a trip-role gate on shared item data. 150 KB / JPEG validated at handler + store + CHECK (defense-in-depth). `master.changed` pinged to the actor's own devices. 13 tests (7 store, 6 api).
   - **Client core**: `src/lib/imageResize.ts` — zero-config optimizer (FR-22.2/22.3): `fitDimensions` (longer edge ≤ 1024, no crop, no upscale) + `backoffEncode` (pure, injected-encoder tested; steps JPEG quality 0.82→0.4, then shrinks dims 15 %/round until ≤150 KB) + `canvasEncoder`/`optimizeItemImage` (browser `createImageBitmap` + `toBlob`). `src/local/persistence.ts` gained an IndexedDB `images` store (DB v2) keyed by item id, blobs kept as `ArrayBuffer` for cross-runtime structured-clone safety. Orchestrator `setItemImage`/`deleteItemImage`/`itemImageUrl`: Server Mode uploads then `drainMaster()` pulls the stamped `image_hash` back; Local Mode writes the blob + a client-computed hash (`hashBlob`, sha256[:8] to match the server) through the same `onPullChanges` funnel; `itemImageUrl` returns the public GET URL (`?v=hash` cache-buster) or a Local Mode object URL. `MasterItem.image_hash` carried through `rowToItem`. 11 tests.
   - **UI**: M10 ItemEditorPage "Photo" section (add/replace/remove, live preview, object-URL lifecycle managed); reusable `ItemThumbnail.vue` (resolves the URL via the orchestrator, owns its lifecycle, renders nothing without a photo); M9 ItemInventoryPage row thumbnails; M5 ItemDetailPage shows the source master item's photo.
   - Open: avatar-style pan/zoom crop is intentionally absent (a reference photo keeps its aspect ratio, FR-22.3). Revisit trigger unchanged from ADR-002 — filesystem/object storage if photos grow past ~150 KB or the deployment leaves home-lab scale.
13. ~~**Single-origin deployment (nginx client container).**~~ — **DONE** (2026-07-14). `client/Dockerfile` builds the SPA and serves it from nginx; `client/nginx.conf` reverse-proxies `/api`, `/ws` and `/health` to the backend, so the deliberately CORS-less API is reached same-origin. `docker-compose.yml` gained a `web` service on `:3000` and the `app` service became internal-only. Single-User Mode is now a genuine open-and-use path: open the app, pick Server Mode, no login. Shipped with `fix(singleuser)`: `EnsureLocalSingleUserID` (`internal/store/singleuser.go`) seeds the configured `JITPACK_LOCAL_USER_ID` row on startup — the single-user server attributes every request to that id, so without the row the first write failed on the `owner_id` foreign key (trips, memberships). Idempotent, and it preserves a display name the user later changed (FR-17.2).
14. ~~**Playwright E2E harness scaffold.**~~ — **SCAFFOLD ONLY.** `client/playwright.config.ts`, `client/e2e/` (`fixtures.ts`, `smoke.spec.ts`, `README.md`), a CI job, and `dev-docs/UI_Test_Spec_v1.0.md` (per-screen cases + FR/NFR traceability matrix). The **cases themselves are not written** — and per the Open-items note above they should wait for the M4/M5/M6/M8 concept lock, since the redesign rewrites them.
15. **Concept & direction documents** (2026-07-12 – 2026-07-18) — the current phase's output, all *specification*, no code:
    - `dev-docs/UI_Concept_Prototype.html` — the clickable prototype every §3.25 decision was tested against. `dev-docs/UI_Concept_Overview.html` — M1–M20 coverage overview.
    - `dev-docs/Navigation_Concept_v1.0.md` — information architecture: nav rail, trip entry points, back-stack, onboarding, empty states, edge cases.
    - `dev-docs/Vision_NorthStar_v1.0.md` — directional expansion from packing app to family vacation companion (Plan/Prepare/During/After). **Not authoritative over shipped scope**, drives no implementation. Flags **ADR-007 (outbound fetching)** as the gate for planning features — note that ADR is referenced but **not yet written**, and its number has since been taken — ADR-007 is now Session Brokering — so the outbound-fetching decision gets the next free number when written.
    - PRD Addendum gained §3.24 (item tags, lifecycle delete), §3.25 (packing-screen refinements, FR-25.1–25.10), §3.26 (calendar feed) and NFR-4.12 (i18n) — §3.24/§3.25/§3.26 **status: proposed**, NFR-4.12 **accepted 2026-08-07**. §3.11 (Repack) retired.
16. **i18n (NFR-4.12)** — **FOUNDATION DONE** (2026-08-07), migration open. `client/src/i18n/`: `index.ts` (locale resolution, `t`, `Intl` wrappers) + `messages/en.ts` and `messages/de.ts`. **English is the primary/default locale and also the fallback; German is fully supported** (owner decision — the client was already written in English, so German is an addition, not a rewrite). **No `vue-i18n`**: two locales need only key lookup, `{placeholder}` interpolation and a one/other plural rule, and date/number formatting is `Intl` — justification and revisit trigger recorded in NFR-4.12. The call shape stays vue-i18n-compatible (`t('key', { n })`) so swapping the module later does not touch call sites.
    - Keys are **flat and dot-namespaced** (`packing.itemsLeft`), not nested — a missing translation is a one-line diff, and the catalogue-integrity test can compare key sets directly. That test fails the build if an English key has no German counterpart, so a string cannot ship untranslated.
    - Locale is a Vue `ref`, so `t()` in a template re-evaluates on language change — no reload. Resolution order: persisted choice → browser locale if German → English. Persisted device-local under `jitpack_locale`, the same pattern and failure handling as the theme (FR-21.3); `initLocale()` runs before mount in `main.ts` next to `initTheme()`, and sets `document.documentElement.lang`. An unknown key renders as the key itself rather than blank, so gaps are visible in review.
    - Plural rule is `n === 1` → singular, everything else plural (so zero takes the plural form, correct for both locales). An unmatched `{placeholder}` is left verbatim — a visible `{n}` is a bug report, "undefined" reads as data loss.
    - M17 gained a Language row (IonSelect, English/German) beside the Appearance toggle. 24 tests.
    - **Open:** the ~300 existing hard-coded English strings across 35 `.vue` files are **not yet externalized** — only the new Language row uses `t()`. Until that migration lands, switching to German changes very little on screen. Sequenced after the M4/M5 rebuild on purpose (see the MVP order above).
17. **M4/M5 rebuild (§3.25, FR-25.1–25.10)** — **IN PROGRESS** (started 2026-08-07).
    - **Done: the pure view model** `client/src/domain/packingView.ts` (26 tests). `buildPackingView` turns items + travelers + containers into groups of entries, where an entry is either a flat row or a per-person **cluster**. It owns the three behaviours that are pure list arithmetic: FR-25.1 clustering, FR-25.2 hiding done rows, FR-25.4 the multi-select mode filter. `isDone` is the single definition of "done" — fully packed **or** skipped, but *never* a packed row with an open preparation todo (FR-7.3), because hiding that is exactly the false "all done" the state exists to prevent.
    - Invariant worth keeping: **headers count over the full set, lists render the filtered set.** Group headers, cluster headers and the mode pills all tally over every row, so a group reading "3/8" while showing five rows is honest. Two consequences are deliberate and tested: cluster-vs-flat is decided over the full set (packing one instance must not restructure the list), and mode counts are taken over *open* rows before filtering (so the pills do not renumber as you toggle them).
    - Not yet built: the screen itself — lean header + overflow, full-screen (hidden tab bar), collapsing header, pack-out animation + undo snackbar, packer avatar (FR-25.3), quick-add FAB behaviour.

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` now uses the pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`, and the Dockerfile needs no C toolchain. History in `DEVIATIONS.md`.

## Concept phase, 2026-08-07/08 — the packing MVP

Recorded here because it is history: what was decided, mocked and specced, and
why. The remaining *work* is listed in CLAUDE.md under "Not built yet"; this
section is the reasoning behind it. Everything below was settled in the clickable
prototype (`dev-docs/UI_Concept_Prototype.html`, driven headless by
`dev-docs/UI_Concept_Prototype.verify.mjs`) before being written up.

Explicitly flagged as open in the entries below — the natural feed for `/next`:

### MVP scope (owner decision, 2026-08-07)

**The goal is a running MVP with the packing feature completely finished — not more
specification.** The concept phase (§3.24–§3.26, North Star) had grown open-ended; it is now
bounded. Two decisions fix the scope:

1. **The surrounding features stay as they are.** M1/M2/M3/M7/M9/M10/M16/M17/M20, Local Mode,
   import/export and the whole backend are *not* reworked to the new concept (no top-bar
   slim-down, no `Navigation_Concept` rebuild) — they already work. Only what packing needs gets
   touched.
2. **i18n ships with the MVP** (NFR-4.12, now *accepted*): **English is the primary/default
   language, German is fully supported.** The client is currently hard-coded English, so this is
   externalizing ~300 existing strings plus a German catalogue — done *before* the M4/M5 rebuild
   so the new screens are localized from the start rather than retrofitted. Implemented in-house,
   no `vue-i18n` (footprint justification and revisit trigger in NFR-4.12).

**Sequencing decision (owner, 2026-08-08) — concept first, then the foundation:**

1. **Everything around packing is finished conceptually and as a mockup *before* effective
   implementation starts.** Reason: every concept round so far has invalidated code that was
   already written — units, quantity formulas, consumables and publish/fork were each built and
   then removed again. Implementing a moving target is the expensive failure this rule prevents.
   Concept and mockup rounds (per the mockup-first agreement) are the work until the owner
   declares the packing concept closed.
2. **When implementation starts, it starts with the domain-free basics** — login, users, code
   base — not with packing features. Note for that moment: much of this already exists
   (OIDC/JWT/JWKS, sync, store, CI); the question to raise then is audit-and-harden vs. rework,
   not build-from-scratch.

Work done *before* this decision on 2026-08-08 (FR-1.6 relaxation, migration 016) is kept, not
reverted — it is green, and the schema it adds is what the closed §3.27 concept calls for.

**In the MVP, in order:**

- **i18n foundation** — module + both catalogues + M17 switch **done 2026-08-07** (item 16).
- **M4/M5 — concept CLOSED 2026-08-08.** Both are fully mocked and settled; the decisions live in
  §3.25 (FR-25.1–25.17) and UI-Spec G-12, with E2E cases written. Implementation is still open:
  the pure view model (`src/domain/packingView.ts`) exists, the screen itself is not rebuilt yet
  and must be built from the mock and localized with `t()` from the first line.
- **Translate the surrounding screens** — the ~300 existing hard-coded English strings across
  M1/M2/M3/M7/M9/M10/M16/M17/M20. Deliberately sequenced *after* the M4/M5 rebuild (owner
  decision 2026-08-07): those two screens are being replaced anyway, so translating their old
  markup first would be thrown away.
- **M6** — re-mocked 2026-08-07, **FR-25.6 resolved**: "for whom" is derived from membership and
  shown on one aggregated buy row, not re-entered and not split per traveler. Per-item notes in.
  Grew from there: faceted filter (FR-25.11g), assignee + description at add time (FR-25.12/13a),
  category with master-item autocomplete (FR-25.13b), reveal-bought with who/when (FR-25.11i/j).
- **G-12 (UI-Spec) — new pattern, 2026-08-07:** screen actions live as an icon cluster **in the
  app bar**, replacing the settings gear on detail screens; search collapses behind its icon and
  the filter carries its count. M4 was converted to it and is back to a one-line header. The
  app-bar placement matters beyond tidiness: M4's sub-header collapses on scroll, so a cluster
  sitting there would slide away mid-task (measured, E2E-G12-03).
- **M8 — concept CLOSED 2026-08-08.** FR-25.7 (progressive disclosure, sensible defaults),
  FR-25.13 quick-add, M5-sheet position editing, FR-27.6 scope shaping and FR-27.7 tasks are all
  mocked; the UI-Spec M7/M8 entries were rewritten to match on 2026-08-08 (they still carried the
  "redesign pending" note). Implementation open, sequenced behind the concept per the decision
  above.

- **FR-25.9 Erwachsen/Kind-Mengen — REMOVED (owner decision 2026-08-08,** "es gibt keine
  Unterscheidung von Erwachsenen- und Kind-Mengen"**), and with it the traveler *type* itself
  (FR-2.5):** a per-person position carries one quantity for everyone; concrete per-person numbers
  are set on the trip (FR-25.8), where the actual people are known. The Adult/Child field was the
  only thing FR-25.9 read, so it went too — asked and confirmed rather than assumed. Prototype,
  PRD (FR-25.9 stub + FR-2.5), UI-Spec M3/M8 and E2E-M3-03 updated. **Implementation open** (not
  started, per the concept-first decision): migration dropping `travelers.profile`, sync whitelist,
  client traveler type and the M3 step-2 control.
- **§3.27 Template composition ("Gruppen") + trip→template round-trip — added to the MVP by
  owner decision 2026-08-08** (explicitly asked whether to park it per the 2026-08-07 scope rule;
  answer: "nein, das gehört zum MVP" — this amends decision 1 above for M3/M7/M8). **Concept
  CLOSED 2026-08-08:** mocked end-to-end in the prototype (M7 composition display, M8 groups
  section with cycle guard + resolution footer + blast-radius note, M3 real dedup preview with
  named merges + single-item picker, M2 applied-changes chip, new M21 "Vorlage aus Reise"),
  verified headless (41 assertions), written up as FR-27.1–27.5 with E2E cases M3-11/12, M7-07,
  M8-07/08/09, M21-01…03, FLOW-09. **Second round same day (owner proposal): explicit scopes**
  — every template is a `Gruppe` (items only, includable) or a `Ferien-Vorlage` (groups + own
  items), declared at creation, guarded scope switch; two levels, so include cycles are
  structurally impossible (FR-27.1 refined, FR-27.6 new; M7-08/M8-10 added; 49 assertions).
  **Third round: preparation tasks on template positions** (FR-27.7, owner request) — tasks
  defined at the position instantiate as FR-7.3 todos on the generated trip item (open prep
  blocks "done" via the existing FR-25.2 rule); edits propagate per FR-27.4; M8-11/M3-13
  added. **Fourth round:** FR-25.7 realised in M8 (one-tap add, collapsed "Standard" row,
  Menge + Vorbereitung first, rest behind "Mehr Optionen"; M8-12) and FR-27.8 new (M10
  "Enthalten in" back-references with tap-through, per-trip usage history deliberately
  deferred; M10-05). **Fifth round: cross-trip comment history in M10** (FR-27.9, owner
  request — "die Packliste kontinuierlich von Ferien zu Ferien verbessern"): comments from
  this item's packing rows aggregated with author/trip/timestamp, client-side over synced
  trips, read-only; M10-06. **Sixth round: FR-1.6 publish/fork removed from the MVP** (owner
  decision 2026-08-08, "Jeder sieht einfach alles") — templates/groups are shared
  instance-wide like master items (FR-22.6 model), owner_id stays as creator metadata;
  publish toggle, my/published split and all fork paths gone from prototype and specs
  (parked in the FR-1.6 stub with revisit trigger). **Seventh round: FR-25.13 extended to M8**
  (owner directive, "identisch wie in der Packliste") — the position picker replaced by the
  M4/M6 quick-add pattern verbatim (FAB expansion, master autocomplete, visible scope-labelled
  confirm, Enter, stays open, blur-collapse when empty, duplicate report instead of double
  add, free text creates the master item); M8-13 added, M8-04/M8-12 reworded. **Eighth round:
  position editing = the M5 sheet** (owner directive, "gleich wie in der Packliste-Ansicht")
  — tapping a position opens the M5-pattern bottom sheet with glance chips, FR-25.15
  auto-save chip, Menge + Vorbereitung first and "Details ▾" for the rest; the inline
  expanding row form is gone; M8-14 added. 74 assertions headless.
  **FR-1.6 relaxation IMPLEMENTED end-to-end 2026-08-08:** server — `master.go` pull filter
  and mutation authorization treat templates/template_items like master items (shared;
  `owner_id` still stamped on insert, never rewritten by an editor), `is_published` off the
  sync whitelist and out of the backup filter (the column *stays* in the schema, dormant, so
  the parked stub needs no migration to come back); client — `Template.is_published` gone
  from the type, store, mutations and portable export, `forkTemplate`/`requiresFork` and the
  `applyReviewProposal({fork})` branch removed, M7 is one shared list without the publish
  toggle, M8's published warning and M14's fork card are gone. Docs (Sync-API §4/§8, UI-Spec
  M18, FR-18.2/18.4) follow. **Schema + sync wiring IMPLEMENTED 2026-08-08 (migration 016):**
  `templates.kind` (`CHECK ('group','template')`, default `template` so existing rows become
  Ferien-Vorlagen), `template_includes` (unique pair, self-include CHECK, index on the
  included side) and `template_item_tasks` (a row per task, *not* a JSON column — field-level
  LWW would treat a blob as one field and lose concurrent edits); all three on the master
  partition whitelist, shared visibility, FR-27.1's two-level rule enforced in
  `validInclude` (a Gruppe including a Gruppe rejects like any invalid mutation), and a
  template delete now tombstones tasks → positions → includes on both sides. Implementation
  open: `instantiate.ts` include expansion + task
  materialisation, planning-trip refresh diff, M21 screen, portable YAML for includes/tasks
  (FR-18.2), and the M7/M8 client rework. **UI-Spec entry for M21 written
  2026-08-08** (screen inventory + full entry + cross-screen flow 6 in `UI_Spec_v1.10.md`,
  documenting the mocked screen; the test spec's "entry to follow" note is gone).

- **Gruppe in die laufende Reise (FR-27.10, owner request 2026-08-08) — mocked + specced,
  implementation open:** the M4 quick-add adds **whole groups**, not only items ("ich möchte auch
  in den Ferien eine Gruppe von Pack-Elementen hinzufügen können, bspw. Makro Fotografie").
  Group suggestions filter as you type under *„Ganze Gruppe hinzufügen“*; one tap runs the same
  resolution M3 does at generation — dedup against the trip's existing rows, provenance stamped
  (so FR-27.5 still recognises them), FR-27.7 tasks materialised as prep todos — and reports the
  outcome. Not flagged *Missing* on purpose: an added group is a grown plan, not a forgotten item,
  and the flag would feed M14 a false signal. E2E M4-26/27.

- **Packlisten-Filter überlebt die Session (FR-25.18, owner request 2026-08-08) — mocked +
  specced, implementation open:** filter, *Erledigte* switch and grouping are remembered per trip
  for the session (restored before first paint, so M4 never flashes unfiltered). Session-scoped on
  purpose where grouping is durable — a filter hides rows, and a forgotten one reads as "nothing
  left to do" (FR-25.11a); a fresh session starts unfiltered. The search term is not restored.
  E2E M4-28.

- **Phasen-Hub gestrichen, M4 *ist* der Reise-Screen (owner decision 2026-08-08) — mocked +
  specced:** a trip opens straight into its packing list; the four-phase hub
  (Planen/Vorbereiten/Unterwegs/Danach) is gone from the prototype. Three of its four panels were
  North-Star content with nothing behind them (idea board, day plan, expenses), and its entries
  duplicated M4's G-12 trip line. What was real about *Danach* survives as M4's **closing card on
  an archived trip**: "Vorlage aus dieser Reise" (M21/FR-27.5, whose entry moved here) plus the
  M14 suggestions. Re-entry point recorded in UI-Spec M4 and `Vision_NorthStar_v1.0.md` §2 so the
  phase model is picked up deliberately when Plan/During get content — the frame then goes *above*
  M4. E2E M4-29, M21-01 reworded.

- **M14 Review-Assistent — Konzeptrunde nachgeholt 2026-08-08 (FR-27.11), mocked + specced:**
  the screen existed only as two hard-coded rows in the dropped phase hub. Now a real screen:
  proposals derived from the trip's FR-9.1 flags, **each targeting the Gruppe the item came from**
  (picker offers groups only; an ad-hoc "fehlte" row defaults to the trip's dominant group), with
  the FR-27.4 blast radius on the row and an applied-change log entry on every planning trip using
  it. **A list with an open count, not a card stack** — that 2026-07-17 decision is superseded:
  a stack hides how much is left, which is what FR-25.11a rejects on the packing list. Applied and
  skipped rows stay visible and marked. Reached from M4's closing card (teaser of two + "Alle N
  prüfen →"), beside the M21 entry: M21 folds back structure, M14 folds back single items.
  E2E M14-04/05. Implementation open.

- **M11 Gepäck & Container — Konzeptrunde nachgeholt 2026-08-08, mocked + specced:** three real
  gaps closed. Containers could not be **created or edited** at all (the FAB did nothing here);
  they now use the M5 sheet grammar — name, carrier, limit, pairing, delete, auto-save chip — and
  creation is the FR-24.5 minimal form (FAB creates with a placeholder name and opens the sheet).
  **Pairing was unreachable code** — the seed had no pair, so FR-10.3's imbalance indicator had
  never rendered; the seed now has two paired suitcases, and pairing is set and released on *both*
  sides (a half-set pair renders an imbalance against a container that disagrees). **Assignment
  was a button wall** (one button per container per row, growing with containers × items); it is
  now one tappable row opening the container picker, each option showing its current load.
  Deleting a container **unassigns** its items instead of taking them down with it. E2E M11-05/06.
  Implementation open.

- **M12 Auswertung — Konzeptrunde nachgeholt 2026-08-08, mocked + specced:** two defects found by
  clicking. Tapping a bar only set M4's **grouping**, never the filter — you tapped "Technik ·
  3,2 kg" and got the whole list, with the number you tapped nowhere on screen; it now sets the
  FR-25.11 facet, so the chip names it (FR-25.11a) and the session keeps it (FR-25.18).
  And **per-person items were bucketed under `undefined`**: they carry no top-level `trav`/`qty`
  (those live on the pp entries, FR-25.1), so the Person view invented a group and the weight math
  used undefined quantities. Aggregation now expands each item into (traveler, qty, packed) shares
  — one contribution per traveler by Person, summed back into one bucket by Kategorie/Gepäck.
  E2E M12-04/05. Implementation open.

- **Zuständigkeit ≠ Packbeleg (FR-25.19, owner correction 2026-08-08) — mocked + specced:** the M5
  control read *„Gepackt von · Person“* but assigned the row (its own hint said „Delegieren löst
  Push aus“), and the FR-25.3 avatar plus FR-25.17 stamp read that same field as a record — so
  delegating to Sia and packing it yourself claimed Sia had packed it. Now two things:
  **Verantwortliche Person** is assigned (push, FR-6.2), **who packed it** is written automatically
  from the acting user and cleared on un-pack. The row keeps **one** right-edge avatar (responsible
  → blue ring, packer → green ring + check); both are named in the sheet and the stamp where they
  differ. M1's "Dir zum Packen übergeben" now reads responsibility. **Implementation open:** a
  second nullable column beside `packer_user_id` for the record. E2E M4-30.

- **Prototype defect found by clicking, 2026-08-08 (pre-existing):** in the M5 sheet a
  per-person item is rendered from a **derived aggregate copy** (`{...raw, …}`), and the action
  handler wrote item-level edits to that copy — so on exactly those rows *responsibility, mode,
  luggage, late-packer, the unused/missing flags and the buy-now undo* silently did nothing and
  reverted on the next render. Fixed by writing to the stored item; for a plain item the two are
  the same object, which is why it never showed there. **Method note:** the verify suite had
  asserted what the sheet *does to the model* by setting fields directly, so no assertion ever
  clicked the control — that is how it survived. The new cases drive real clicks.

- **Fremd zugewiesene Zeilen standardmässig ausgeblendet (FR-25.20, owner request 2026-08-08) —
  mocked + specced:** M4 opens on your own work; rows whose FR-25.19 responsible person is someone
  else are filtered out, unassigned rows always stay (nobody claimed them, so they are everyone's).
  Never silent — a reveal bar at the foot names the count and the people, mirroring FR-25.2's done
  bar, and the switch joins *Erledigte* in the filter panel (both render from one shape now). The
  header stays unfiltered per G-12, which is what makes a short list safe. Session-scoped like the
  rest of the view (FR-25.18). E2E M4-31. Implementation open.

- **Konsistenz-Durchgang 2026-08-08 (owner request).** Method: every visible control on every
  screen was clicked in isolation on a freshly loaded page and checked for *any* effect on DOM,
  view or model — 258 controls; then the specs' concrete claims were probed against the mockup.
  Note on method: the first pass compared DOM *lengths* and therefore missed class swaps (a
  segment moving its `sel`), which produced false positives until it compared the DOM exactly.
  **Two dead controls found and fixed:** the M3 "+ Neue Serie…" chip opened a native `prompt()` —
  the only place in the app that left the inline-capture pattern (FR-25.13), and on a phone the
  modal interruption the concept avoids everywhere else; and the FR-14.2 history suggestions in
  M3 step 4 offered "→ 6 übernehmen" next to a 6, a button that could not change anything, now
  rendered as a confirming line instead. **Three questions raised for the owner** (see below /
  session notes): §3.20 item dependencies are implemented in code but absent from the concept;
  M2's ordering contradicts its own spec entry; "Verantwortliche Person" (M5) and "Zugewiesen an"
  (M6) name the same thing differently. Everything else the specs claim is realised was found
  clickable.

- **Die drei Fragen des Konsistenz-Durchgangs, beantwortet 2026-08-08 (owner) und umgesetzt:**
  - **§3.20 Abhängigkeiten bleiben — nachgemockt.** M10 lists *Hängt ab von* with a
    nötig/empfohlen toggle and, read-only, *Wird gebraucht von*; the M4 quick-add pulls required
    companions onto the trip and says so, and skipping an item co-skips them with the reason
    naming the parent (FR-20.1/20.2/20.4). The feature had been shipped since 2026-07 but was
    invisible in the concept, so the rebuild would have dropped it.
  - **M2 wird flach.** No series grouping; ordering by usefulness rather than literal
    newest-first: active trip on top, upcoming **soonest first** (a trip in three weeks beats one
    in eighteen months, which date-descending would rank above it), archived newest first. The
    series moves onto the row as a chip and stays the entry to M16; the optional grouped view is
    dropped. E2E M2-06.
  - **Ein Begriff: „Zugewiesen an“** in M4/M5 and M6 alike, replacing „Verantwortliche Person“ from
    the FR-25.19 round the same day. The substance of FR-25.19 — assignment vs. automatic record —
    is unchanged; only the word is now shared with the shopping list, which had it first.

- **Inventar-UX-Runde (owner directives 2026-08-08, mocked + specced):** M9 is **lean by
  default** (primary-tag avatar + name); which extras show (Tags/Gewicht/Preis) is a
  device-local preference behind an eye icon with a settings sheet (FR-24.4 new). M10
  **creation is a minimal form** (name + tags, Gewicht/Preis behind "Mehr ▾"; the
  existing-item sections Enthalten-in/Kommentare/Löschen are absent until the item exists
  — FR-24.5 new). Tag capture is a **filter-or-create search field** (FR-24.1 refinement; typing filters chips, ＋/Enter creates unmatched names). E2E M9-01/05, M10-01/07/08 + matrix. Implementation of the two FRs is open
  (client M9/M10 rework).

- **FR-1.8 Einheiten — REMOVED end-to-end (owner decision 2026-08-08,** "wir haben nur
  Stück"**):** `items.unit` dropped (migration 015), sync whitelist trimmed, portable YAML
  `unit` field gone (legacy files import fine — unknown fields ignored, FR-18.5), client
  type/editor/inventory/quick-add cleaned, prototype unit chips and M10 segment removed,
  G-6 unit-label clause void. All suites green.

- **FR-1.3/1.5 Mengenformeln — REMOVED end-to-end (owner decision 2026-08-08,** "entferne
  all das Formel-Zeugs"**):** quantities are plain integers everywhere. Migration 014 rebuilds
  `template_items` (`quantity_formula` → `quantity INTEGER NOT NULL DEFAULT 1`) and
  `item_dependencies` (`quantity_formula` → nullable `quantity`), numeric legacy values carried
  over, formula strings folded to 1; sync whitelists renamed; portable YAML `quantity` is a
  number with FR-18.4-tolerant import of legacy strings (Go `portable.Quantity` unmarshaller +
  client `coerceQuantity`); client `formula.ts` deleted, `computeQuantity` simplified,
  clone re-evaluation retired (quantities carry over), M8 gets a numeric stepper; prototype
  formula engine removed (stepper in the M5-sheet, wizard step 4 shows template quantities +
  FR-14.2 history suggestions); docs: FR-1.3/1.5/15.3 retirement stubs, FR-2.1a/12.2/18.2/20.x
  adjusted, test spec M8-01/M3-08 + matrix updated. All suites green (go -race, 428 vitest,
  build, lint, 76 prototype assertions).

- **FR-1.7 Verbrauchsartikel — REMOVED end-to-end (owner decision 2026-08-08,** "das Feature
  brauche ich nicht"**):** consumable flag *and* the per-day unit/rate it fed. Migration 013
  rebuilds `items` without `is_consumable`/`per_day_rate` (unit CHECK narrowed to
  pieces/pairs, `per_day` rows folded to pieces), sync whitelist trimmed, client UI (M9
  chip/filter, M10 toggle + rate field), `instantiate.ts` per-day branch, prototype and all
  docs updated (FR-1.7 removal stub, FR-1.8 narrowed). Per-day needs are plain quantities now,
  adjusted per trip in M3 step 4. All suites green after removal.

**Parked until the MVP ships** (specified, not deleted — do not start these):

- **§3.24 Item tags & lifecycle-aware delete** (FR-24.1–24.3) — needs a migration and changes the
  item model without making packing better.
- **§3.26 Calendar reminders / iCalendar feed** (FR-26.1–26.6) — own endpoint, own security model,
  four open questions.
- **North-Star phases** (`Vision_NorthStar_v1.0.md`) — directional only, drives nothing now.

Independent of the MVP:

- **UI test suite (Playwright E2E)** — `dev-docs/UI_Test_Spec_v1.0.md` is written and the harness is
  scaffolded (`client/e2e/`, `playwright.config.ts`, smoke spec, CI job); the per-screen cases are
  not implemented. Sequencing note: the M4/M5/M6/M8 cases get rewritten by the redesign, so writing
  them before the concept locks is wasted work.
- **OIDC login flow UI polish** — token auto-refresh is done (item 5); the login/callback pages are functional but unpolished.
- **NFR-4.2a conflict-log compaction on archive** — no server trigger since archiving became a plain `trips.status` mutation (M14 note, spec §8).
- **FR-16.3 dedup prompts for the server-side YAML import endpoints** — the client M18 flow has them; the raw `POST /templates/import` / `POST /trips/import` API does not (item 4).
- **M11 imbalance threshold UI** — the per-trip override (`attributes.imbalance_threshold`) exists, but no UI sets it.
- **M12 per-slice deep filters** — tapping an analytics slice opens M4 grouped by that dimension, but not filtered to the slice.
- **TypeScript 7 bump** — blocked by vue-tsc incompatibility (dependabot PR #4 left open).

Deliberate cuts (revisit only with cause): M15 XLSX support (CSV only, NFR-4.3, spec §8); avatar-style pan/zoom crop for item photos (FR-22.3 keeps aspect ratio); no backfill for rosters of trips created before migration 009 (recreate or re-share affected trips, consistent with 005/006).

## Basics audit, 2026-08-08 — one toolchain

Owner decision after the concept merged (PR #51 / `259fdac`): the build starts with the
domain-free basics, and because login/users/sync/CI already exist and are green, the mode
is **audit-and-harden, not rework**. First finding, and the one that had to go first
because it is the *verification* command everything else leans on:

- **`flake.nix` and `mise.toml` pinned the same three tools to different versions.** Worse
  than the "two mechanisms for one job" the backlog item described. The devShell listed only
  `x86_64-linux` and `aarch64-linux`, so on the maintainer's darwin machine it could never
  have worked at all; it pinned `go_1_25` where `mise.toml` said 1.26; and it took
  `golangci-lint` unpinned from `nixos-unstable`, which is the bare-tag pattern invariant 8
  forbids everywhere else. **`flake.nix` + `flake.lock` deleted**, mise is the single
  mechanism, and its comment now names which CI field each version mirrors.

- **The local toolchain diverged from CI, latently.** `ci.yml` resolves Go through
  `go-version-file: go.mod` (1.25.0) while mise installed 1.26 — both green, so nothing was
  failing, but the Makefile exists precisely to keep local and CI in step, and `gofmt` output
  has changed between Go releases before. A `fmt-check` that can be green locally and red in
  CI defeats the target's whole purpose. Resolved in the direction the owner chose:
  **`go.mod` 1.25.0 → 1.26.0**, so CI, mise and the `golang:1.26-alpine` build image now
  agree. `go mod tidy` was a no-op beyond that line and `go.sum` did not move.

- **`make ci` now works from a plain shell in a fresh clone**, which is what CLAUDE.md
  promises. The Makefile probes for `go gofmt golangci-lint node npm`; if all are present it
  calls them directly (`RUN` empty, recipes unchanged), otherwise it prefixes every recipe
  with `mise exec --`, and if mise is missing too it stops at parse time with an instruction
  to install it instead of `go: No such file or directory`. All three paths were exercised
  with a stripped `env -i` PATH, including really building through the re-exec, not just
  `make -n`.

No ADR: the choice was forced rather than weighed — one of the two mechanisms could not run
on the maintainer's platform and violated an existing invariant.

## Basics audit, 2026-08-08 — FR-23.1 required an unverified claim

Second finding of the auth-path audit, and a live privilege-escalation path rather
than a latent one.

`authed` (`server.go`) re-derived the instance-admin role on **every** request from
`s.isAdminEmail(emailClaim(claims))`, and `email_verified` did not appear anywhere in
the repository. OIDC Core §5.7 is explicit that `email` carries no verification
guarantee by itself — `email_verified` does — so against an IdP with self-service
profiles, any account could set its address to the one in `JITPACK_ADMIN_EMAILS` and
be stamped `is_instance_admin = 1` on its next request, with the admin surface
opening immediately. The driving test confirmed it before the fix: `GET
/api/v1/admin/users` answered 200 with `"is_instance_admin":true` both for
`email_verified: false` and for a token with no such claim at all.

The fix is small because the allowlist was the only consumer: `isAdminEmail` now
takes the verification flag and requires it, and `emailVerifiedClaim` reads the claim
as a JSON bool or the string `"true"` (providers differ), treating everything else —
absent included — as unverified. Both call sites, the `authed` middleware and the
OIDC broker's JIT provisioning in `auth.go`, were updated.

Two properties worth keeping in the tests: the role is *re-stamped* per request, so
withdrawing verification has to take the role away again rather than leave a permanent
admin behind; and the tests assert the consequence — whether the admin-only surface
opens — instead of reading `users.is_instance_admin`, so they still describe the rule
if the storage changes.

**Operator consequence, recorded in FR-23.1:** an IdP that does not release
`email_verified` now grants no instance admin at all. That is the correct default —
the alternative is trusting a self-declared address — but it is a behaviour change for
an existing deployment whose IdP omits the claim.

Still open from this audit, deliberately not fixed here because it needs a
compatibility decision: neither `authed` nor the OIDC broker validates `aud` or `iss`,
so on a shared IdP a token minted for a different application validates here.

## Basics audit, 2026-08-08 — first-party sessions (ADR-007)

Owner directive during the audit: **Authelia is the reference IdP — where it
prescribes something, JIT-Pack conforms.** Held against that, the auth layer was
wrong at its root, not at its edges: the broker passed the IdP token set through
and `authed` validated the IdP *access token* per request, reading identity out
of it. Authelia's access tokens are opaque by default, carry no identity claims
unless a claims policy copies them in, and their `aud` is the introspection
endpoint — the owner's real deployment (`access_token_signed_response_alg:
"none"`, no claims policy) could never have run this flow. Meanwhile the ID
token, the credential actually minted for this application, arrived in every
token response and was discarded unread.

Rebuilt per ADR-007 (options weighed there: JWT access tokens, introspection,
first-party sessions):

- **Login** (`/auth/token`): confidential-client code exchange
  (`client_secret_basic` — the secret finally exists, `JITPACK_OIDC_CLIENT_SECRET`),
  ID token validated against the discovered JWKS with `iss` and `aud` = client id
  (closing the audit's Finding B at the only place identity is established),
  identity from UserInfo (sub must match the ID token per OIDC Core §5.3.2),
  then JIT-Pack's own tokens: 15-min HS256 access (`sub` = `users.id`) + rotating
  single-use refresh token, SHA-256-hashed into the new `sessions` table
  (migration 017). The IdP token set never reaches the client.
- **Refresh** (`/auth/refresh`): peek → replay the stored IdP refresh token at
  Authelia (4xx deletes the session, 5xx/network leaves the chain untouched —
  offline is normal) → re-read UserInfo, re-stamping FR-23.1 at refresh cadence →
  rotate own token, slide the 90-day expiry (NFR-4.4). Replayed links die.
- **Per request**: `authed` shrank to signature check + FR-23.3 deactivation
  lookup. No JWKS, no `EnsureOIDCUser`, no identity mapping — `NewWithJWKS` and
  `mapOIDCSubject` are gone.
- **Config**: clean break, owner-approved. `JITPACK_SESSION_SECRET` required in
  multi-user mode; OIDC group is issuer + client id + client secret, everything
  else via `/.well-known/openid-configuration` at startup (which also closed the
  gap that no UserInfo URL was configurable at all). `JITPACK_JWT_SECRET`,
  `JITPACK_JWKS_URL`, `JITPACK_OIDC_TOKEN_URL`, `JITPACK_OIDC_AUTHORIZE_URL`
  deleted.
- **Client**: zero changes — the wire shape of `/auth/token`, `/auth/refresh`,
  `/auth/config` is identical; `expires_in` 3600 → 900 is absorbed by the
  existing proactive refresh. Verified against `client/src/auth/`.
- **Specs**: Sync-API §2 rewritten (it had promised the pass-through), FR-23.1
  moved to the UserInfo source with revocation-at-refresh semantics, README got
  the stock Authelia client block (identical shape to the owner's other
  clients, `"none"` algs included).

The fake IdP in `auth_test.go` serves discovery, JWKS, token and userinfo and is
steerable per test (wrong `aud`/`iss`, forged key, missing id_token, 4xx vs 5xx,
rotating IdP refresh tokens). The FR-23.1 table from the `email_verified` fix
carries over against UserInfo, plus revocation-at-refresh. Store sessions are
clock-injected throughout — an earlier draft of `CreateSession` called
`time.Now()` internally and promptly broke its own purge test; the parameter is
what makes the expiry tests deterministic.

## Basics audit, 2026-08-09 — failure-path coverage

Third audit field: not the coverage total (the gates were green throughout) but
whether the rules that enforce authorization and correctness cover their
*rejection* branches — CODING_PRINCIPLES §2's "an uncovered branch in merge
logic fails review regardless of the total".

Method worth keeping: the gate profile is per-package, so functions exercised
only through another package's tests read as 0 % — `store.IsInstanceAdmin`
looked dead while `adminOnly` covered it from the api tests. A second profile
with `-coverpkg=./cmd/...,./internal/...` separates real gaps from that
artifact. After filtering plain `if err != nil` plumbing (untestable without
fault injection, and not what the rule is about), **17 genuinely uncovered
behavior branches** remained; all are covered now:

- **FR-4.7 / §5 visibility:** roster rows invisible to non-members; the deny
  sides of `CanManageTravelers` (non-member) and `IsTripCreator` (unknown trip,
  legacy NULL creator).
- **FR-13.2 destination chain:** missing and unknown parents deny cleanly for
  the owner too (`ownsAll` empty-set / no-rows); profile deletes tombstone
  their checklist items — the middle level beside the already-tested series
  cascade.
- **FR-27.1 includes:** the full two-level table — missing/unknown ends, group
  as parent, template as child.
- **FR-27.7:** deleting a position tombstones its tasks.
- **§4 pagination:** `has_more` + cursor advance + cursor hold on an empty
  page, and the page-window rule twice (roster row and series deleted beyond
  the window must not leak as live; the tombstone follows) — the second one is
  what finally exercised `ownedBy`'s no-rows branch, and both document real
  protocol behavior rather than chasing a percentage.
- **Broker contract:** 422 shapes, refresh-501, ID token without subject,
  UserInfo outage at login (502, no half-provisioned user), and a session
  token without `sub` (invariant 3: attribution always resolves to users.id).

Left uncovered deliberately, with reasons: the defensive `return false` tails
of `authorizeMaster`/`masterVisible` and `memberTrip`'s unresolvable branch
(unreachable through the public API — `validate` and `authorizeMaster` gate
earlier), `EnsureOIDCUser`'s concurrent-provisioning race arm and
`RotateSession`'s rows-affected race arm (both need a mutation between two
statements of one call — not deterministically reachable, and the race rule
forbids probabilistic tests), and DB-error plumbing throughout.

## Basics audit, 2026-08-09 — supply-chain pinning (NFR-4.3 / invariant 8)

Fourth audit field. The established surfaces were already clean — Actions by
full commit SHA, Docker bases by digest, `go mod verify` green, npm via the
lockfile — but the docs restructure had quietly opened a new one: the MkDocs
toolchain installed via pip with only `mkdocs-material==9.6.14` pinned. The
version pin held for one package; every transitive (mkdocs, jinja2, pygments,
…) resolved to whatever was newest at build time, unverified — exactly the
bare-tag pattern invariant 8 forbids, on the pipeline that publishes the
manual.

Closed with the same shape the other ecosystems use: `docs/requirements.in`
is the human-edited input, `docs/requirements.txt` is compiled from it with
`uv pip compile --generate-hashes --universal` (354 hashes, transitives
included), the workflow installs with an explicit `--require-hashes` so an
unhashed edit fails instead of silently reopening the gap, and Dependabot
gains the `pip` ecosystem so the pins stay fresh like all the others.
Verified by building the site strict from a fresh venv off the hashed set.

Also checked and fine as-is: the only npm packages with install scripts are
the two `fsevents` copies (macOS watcher, optional), which npm blocks by
default — no allowlist needed until something else appears.

## M19: the server URL arrives pre-filled (FR-19.1)

Found while deploying the compose stack for manual testing: the first-launch
screen offered an empty field with a `https://jitpack.example.com` placeholder,
so every tester had to type their own address before Connect became clickable —
and the one plausible-looking wrong answer, the backend port, is exactly what
`docs/getting-started.md` already needed a warning box against.

The right default was never ambiguous. The API sets no CORS headers, so a
self-hosted instance *must* serve the SPA and the API from one origin (that is
what `client/nginx.conf` is for). `window.location.origin` is therefore correct
by construction in every real deployment, and the two exceptions are both
explicit: a build-time `VITE_API_URL` still wins, and the Vite dev server keeps
pointing at `http://localhost:8080` because there the two genuinely do split.

The logic sits in `defaultServerBaseUrl()` in `client/src/config.ts` rather than
in the component, so it is a pure function with a unit test; `ModeSelectionPage`
just seeds its ref from it. `serverBaseUrl()` now shares that fallback instead of
repeating the literal.

Both new tests were run red against the old implementation before being kept —
the vitest cases fail with `http://localhost:8080`, and the e2e case
(E2E-M19-04) fails the same way on Chromium *and* WebKit. That mattered here:
the natural `toBeEnabled()` assertion on the Connect `ion-button` is false-green
(the custom element is never "disabled" in the DOM sense), so the case asserts
the input's value and reaches through to the inner `button`.

## Migrations 018/019: the two schema debts the concept left open (FR-25.9, FR-25.19)

Item 5 of "Not built yet", cleared 2026-08-11 on owner instruction. Both
migrations turned out to be one statement each — the owner's steer was explicit:
still in development, so the pragmatic route that loses no data, not a ceremony.

**018 — `travelers.profile` is gone.** The first draft was migration 004's
twelve-step table rebuild, on the assumption that SQLite refuses `DROP COLUMN`
while a `CHECK` names the column. Tried it against the real driver before
writing it: `ALTER TABLE travelers DROP COLUMN profile` succeeds, rows intact.
The rebuild would have been thirty lines of risk (two inbound foreign keys) for
nothing. Unlike `outbound_packed`, which stays inert because nothing asks for
it, this field was on the sync whitelist and on a screen — so it goes rather
than lingering: schema, whitelist (a client still sending it is now *rejected*,
not ignored), the portable YAML type, the client traveler type, and the M3
step-2 Adult/Child segment. A trip exported before this still imports; yaml.v3
ignores unknown keys, so the retired field is dropped rather than refused, and
the api export round-trip test was left carrying `profile: adult` on purpose as
the proof.

**019 — `packed_by_user_id` beside `packer_user_id`.** The interesting half.
`stampActor` used to write `packer_user_id` on `state=packed`, which is exactly
the conflation FR-25.19 corrects. Now: `packer_user_id` is the assignment and is
the client's to set (which is also what makes the FR-6.2 delegation notification
read correctly — it fires on a deliberate assignment and nothing else), while
the record is server-owned. Three rules, all tested: set from the acting user on
`packed`, cleared on any other state (FR-25.17 — a stamp must not outlive the
state it describes), and **stripped from every `trip_items` mutation before
either**, so it cannot be forged on a push that touches no state at all. That
last one is the invariant-3 case and it does not follow from the first two.

The backfill copies `packer_user_id` into the record for rows already in state
`packed` and touches nothing else: on those rows the person genuinely was the
packer, while inventing a record for an unpacked row would claim work nobody
did.

Two things worth keeping:

- `migrate` grew a `migrateTo(db, target)` seam so a test can stage a database
  at 018 and assert what 019 does to real rows. A migration that transforms data
  is behaviour, and behaviour that only ever runs against an empty schema in
  tests is untested.
- Changing `addTraveler`'s signature dropped a positional argument, and
  `vue-tsc` was happy: the old third argument `'child'` slid silently into
  `linkedUserId`, both `string`. Only the test caught it. The three production
  call sites were correct; the lesson is that a positional signature change is
  not type-safe when the neighbours share a type.

Not built here, deliberately: the M4/M5 presentation of the split — the two
rings and „gepackt von Andy · zuständig war Sia“ — belongs to the screen
rebuilds. No `.vue` file reads either column today, so there is no half-built
surface left behind.

## Brand mark: Check-Latch → Packed Backpack (2026-08-12)

The owner rejected the Check-Latch mark and asked for playful, simple
variants in the spirit of the skipper-cd logo. Six directions were
explored (backpack, suitcase-in-motion, cube stack, tote, checklist,
luggage tag), then four backpack refinements; the owner picked the
original open-backpack motif: an open backpack with two packing cubes
peeking out, thick rounded lavender outline, teal/peach cube accents —
all Catppuccin values, matching the app's own palette.

Where it landed, and why that shape:

- `client/public/favicon.svg` and `docs/assets/mark.svg` carry the mark
  on its Mocha tile. The dark tile makes the icon self-contained on any
  background, so the favicon's previous `prefers-color-scheme` handling
  became unnecessary and was dropped.
- `BrandMark.vue` stays tileless and reads every color from `--ct-*`
  tokens, so the in-app mark follows the active Mocha/Latte flavor
  (G-11, invariant 9) instead of hard-coding one flavor's values.
- `docs/assets/logo-light.svg` / `logo-dark.svg` remain the wordmark
  lockups (Latte/Mocha text); `mkdocs.yml` now points its header logo
  and favicon at the square `mark.svg` instead of scaling down the
  300px-wide lockup.

No ADR: an aesthetic choice among equivalent options, not an
engineering tradeoff. No spec update owed: neither the UI-Spec nor the
manual describes the mark's artwork.

## Navigation: the back button that was built but unreachable (ADR-011)

Reported by the owner while looking at M3 — "es fehlt ein zurück button". It was
there: `TripWizardPage.vue` has an `IonBackButton` with a `default-href`, and so
do sixteen other screens. Measuring instead of reading the stylesheet found why
nobody had ever seen one.

`App.vue` renders the global header, then `.app-body` holding the router outlet.
`.app-content` has no `position: relative`, so Ionic's absolutely-positioned
`ion-router-outlet` resolves against `ion-app` and covers the whole viewport:

```
.app-body      0,56  430x844      correct, below the header
.app-content   position: static   ← the cause
ion-page       0,0   430x900      escapes, covers the full window
```

Each drill-down's own header therefore lands at `y=0`, under the global one.
`isVisible()` says true — Playwright does not test occlusion — but `click()`
times out against the covering bar. That distinction is the whole diagnosis, and
it is why the earlier screenshots showed no page titles either.

The one-line CSS fix would have left two stacked bars, 112 px of chrome, on a
product whose §3.25 decision is that the bar stays low and M4 hides the tab bar
to buy height. So the layout bug forced an architectural question rather than
being the whole of it. ADR-011 weighs the three options; the owner chose one bar
whose left slot switches — logo on the four tab roots, `‹ back` + title
everywhere else, sync glyph and settings unconditional on the right.

The accepted cost is real and worth restating: **G-9's "home from anywhere" is
gone.** It was load-bearing — Navigation_Concept §7's cold-start deep-link case
named the logo as the guaranteed escape. That guarantee moves to a back-target
contract: every non-root route declares its parent, so `‹ back` leads somewhere
real even when history has one entry. §7's former *proposal* is now binding, and
the declaration belongs in `router/index.ts` where a missing parent is visible.

Concept and specs are updated ahead of the code, deliberately — the owner asked
to sharpen the concept before anything is built. Nothing in `client/` changed
here.

## One header bar, built (ADR-011)

The implementation of the decision recorded a day earlier. `App.vue` renders the
only `ion-header`; the seventeen per-screen headers are gone. Its left slot is
the logo on a tab root and `‹ back` plus the title elsewhere, and `.app-content`
finally has the `position: relative` that stops Ionic's outlet from escaping.

**The back target comes from the route, not from history.** `meta.parent` is a
path pattern filled from the current route's params (`router/backTarget.ts`).
Two tests guard it: the resolution itself, and a sweep over the *real* route
table asserting every non-root route declares a parent — which is what makes
"someone adds a screen without a way back" a failing build rather than a thing
noticed months later. That sweep carries a second assertion that it inspected
more than ten routes, so a broken flattening cannot make it pass vacuously.

**Two bugs surfaced while building, neither of them the one we set out to fix.**

*The title vanished on M4.* Coming from the wizard, the header rendered empty. A
single shared ref for the dynamic title looked obvious and was wrong: Ionic keeps
the outgoing page mounted through the transition, so the wizard's `onUnmounted`
fires *after* M4 has set its title and wiped it. Titles are now keyed by route
path, which makes the outcome independent of unmount ordering instead of racing
it — the same reflex the no-timing rule asks for. Five unit tests pin the
ordering, including the late-unmount case directly.

*The desktop rail rendered at every width.* Pre-existing, and visible on the
deployed build too — checked before assuming it was mine. `.desktop-nav` in
`App.vue` (specificity 0,1,0) never beat `NavRail.vue`'s scoped `.nav-rail`
(0,2,0), so `display: none` never applied and the media query was decorative.
The breakpoint moved into the component that owns the rail; `App.vue` no longer
has an opinion about it, so there is one place rather than two. The concept's
Part II claimed the old behaviour as "as built" and has been corrected.

**On the e2e cases.** `E2E-G9-01`/`-02` were already taken, so the new unit is
`-03` … `-07`; the collision would have gone unnoticed until someone searched by
id. Every case **clicks** rather than asserting the control is visible, because
`toBeVisible()` is exactly what passed all along on the occluded build. Verified
red against a deliberately broken `goBack` before being kept.

`E2E-G9-01`'s "Logo is a home link to M1 from within a trip" is retired in the
same pass — the clause the ADR knowingly gave up.

## A pre-existing Ionic transition error, found by asserting for it

Deploying merged `main` and driving the seeded trip surfaced an uncaught
`TypeError: Cannot read properties of undefined (reading 'classList')` on the
way back from a trip to the trip list. The navigation itself works — the URL
changes, the list renders — so nothing in the suite had ever noticed.

The first diagnosis was wrong and worth recording as such. `goBack` asked Ionic
for the `'pop'` action, and since the declared parent is frequently *not* the
entry Ionic pushed (a deep-linked child has no such entry at all), unwinding a
stack that does not match looked like an obvious cause. Changing it moved the
message from `classList` to `ionPageElement` — a symptom shifting, not a fix.
Trying all four variants (`'back'`, no direction, `router.push`, `router.replace`)
produced the error every time, which ruled out the call shape entirely.

**It predates ADR-011.** Built the commit before the one-header change, drove
list → trip → *browser* back, and got the identical error. The single header bar
did not introduce it; it made the path a one-tap affordance instead of a
gesture, and the new assertion made it visible. The real shape is Ionic
animating from a root-outlet page back to a route that lives inside the nested
tabs outlet.

What ships here is therefore smaller than "a fix": the `'pop'` action is dropped
because it is wrong on its own terms — the parent is not the popped entry — and
E2E-G9-08 covers the round trip entered through the list, which nothing else
did. The known error is **filtered by its whole dereference, not by property name**,
so a new runtime error still fails the case — matching bare `classList` would
have swallowed a genuine error of ours that merely mentions the property. Chromium and WebKit word the same
failure differently (`reading 'x'` vs `undefined is not an object (evaluating
'o.x')`), which the first filter missed and WebKit caught.

Left open deliberately: the Ionic transition itself. It is cosmetic today —
nothing user-visible fails — and chasing a cross-outlet animation bug in a
minified dependency is its own piece of work, not a rider on this one.

## M4, built from the mock

The first screen rebuild (backlog item 3). The concept has been settled since
2026-08-08 and mocked in the prototype; this is the same screen in Vue, with
the arithmetic where it can be tested and the wording where it can be
translated.

**The view model came first, and grew three axes.** `packingView.ts` already
carried clustering, hide-done and the mode counts from the concept phase —
written then, never wired to anything. It gained the facet filter (OR within,
AND across), the FR-25.20 default that hides other people's rows, and the fold
state, and lost its own mode filter: FR-25.4's pill strip is the *Beschaffung*
facet now, and keeping a second path to the same question is how two filters
start disagreeing.

Three rules there are worth stating because getting them wrong is invisible on
screen. Facet counts run against the *other* active facets but not the value's
own, so a number says what picking it would yield rather than what is already
shown; a selected value survives at zero, since a filter you cannot undo from
inside the panel is a trap; an unselected dead end is not offered at all. The
FR-25.20 reveal bar counts only what revealing would actually show — the mock
counts over the unfiltered set, which promises rows that one tap does not
deliver, and that is a deliberate deviation. And `narrowed` carries FR-25.11e
in one flag, so the component cannot re-derive "is anything hiding rows?" per
empty state, which is exactly how the original implementation came to announce
"Alles gepackt" over an unmatched search.

**FR-25.17 needed a column.** „gepackt von Andy · heute 14:32" wants a *when*,
and nothing on the row could stand in: `updated_hlc` is the last touch of any
kind, so a comment added afterwards would redate the packing. Migration 020
adds `trip_items.packed_at`, stamped and cleared by `stampActor` with the
record it belongs to. One deliberate difference from the user id beside it: a
client-supplied RFC 3339 value is *kept*, because packing happens offline and
the envelope can land days later. A clock is not an identity claim — invariant
3 governs actors and foreign keys — and `packing_now_at` has taken client
values since it was written. Unparseable values are replaced rather than
trusted, so the column always holds a real instant. Rows packed before the
migration keep their packer and get no time; the screen names the packer alone
there rather than inventing one.

**What the screen dropped.** The KPI tile strip, the grouping segment bar and
the two filter toggles are gone — none survived the redesign. The separate
"consciously skipped" section went with them: FR-25.2 counts a skipped row as
done, so it is revealed by the same *Erledigte* switch as a packed one, and two
mechanisms for one class of rows would have shown them twice with both on. The
UI-Spec's Elements list still described that section and has been corrected.
Archive kept its app-bar button although the mock has no such control anywhere:
it is the only path to M14 today, and matching a mock that never modelled
archiving would have removed a working feature.

**Three defects surfaced while writing the Playwright unit, none of them test
artefacts.** Tapping a row's checkbox opened M5 *and* packed the row, because
the control sits inside a row that is a link. The first tap after adding an
item was swallowed entirely: the quick-add collapsed on blur, which removes a
block from the flow above the list, so the rows moved between pointer-down and
pointer-up and the browser dispatched no click at all — the form now closes
only when asked to, which FR-25.13a permits and which is the better trade
against a list that ignores one tap in a place nobody would look for it. And
the filter sheet's footer — the outcome line and *Zurücksetzen*, the two things
FR-25.11b puts there — sat below the viewport, because Ionic's drag breakpoints
keep the modal box full-height and translate it down; the sheet is sized and
anchored instead.

**Found and not fixed:** in Local Mode a trip's *items* do not come back after
a reload, though the trip itself does and the rows are demonstrably in
IndexedDB (`jitpack-local` / `rows`). It is the local persistence path rather
than the packing list, so it was reported instead of being repaired inside an
M4 change; the one e2e case that would have crossed it was rewritten to leave
M4 through the app instead of reloading, and the fresh-session half of FR-25.18
is asserted in the `usePackingFilter` unit test, where it is deterministic.

**No `docs/` page.** The manual covers running an instance and stops before the
UI on purpose, because most screens are still being rebuilt; a page for M4
alone would be an island next to M5, M9 and M11 that do not have one. It is
owed as a set once the rebuilds land, and this is the note that says so.

## What hand-testing M4 turned up — and why the suite had not

The maintainer opened the rebuilt screen and hit four things in a row: the
desktop rail did nothing, mobile had no navigation at all, `‹ back` did
nothing, and the search icon kept filtering a screen he had already left. A
fifth complaint — "my trip wasn't persisted" — turned out to be two more
defects wearing that costume.

His verdict on the process is the important part and is now in the working
agreement: *„dir wäre das nicht passiert, wenn du saubere e2e ui tests
gemacht hättest. das gehört immer dazu."* He is right, and the failure mode
is specific: the M3 and M4 units were both green throughout. A per-screen
suite proves the screen. Nothing exercised getting to it, leaving it, or
what the app bar did afterwards — and the cases for exactly that
(E2E-G1-01, G9-01…08, G12-01) had been *written* since the UI-Test-Spec was
drafted and never implemented. A specified case nobody runs is a comment.

**One cause under three symptoms.** The four anchors lived under an
`IonTabs` layout, which carries its own router outlet, while every other
route rendered in the root one. Crossing between them left the outgoing
page painted while the URL moved on — so the rail, the tab bar and back
all "did nothing" in the only sense a user cares about. It also threw the
`classList` error that a session in August reproduced on the pre-ADR-011
build and filed as *cosmetic*; it was this, and the exemption in
`navigation.spec.ts` was quietly hiding the evidence. ADR-012 removes the
second outlet, `TabBar.vue` becomes plain links beside the one that
remains, and the exemption is gone with the error.

**"Not persisted" was two defects, neither of them persistence.** The rows
were in IndexedDB and on their way into the store the whole time. First,
M4's app-bar actions were `<Teleport>`ed into the header's DOM — which
Ionic relocates after mount — so on a cold boot Vue patched a container
that had moved and threw `emitsOptions of null` mid-patch, aborting the
render. An empty screen reads as lost data; it was a crash. Actions are
now *described* (`useHeaderActions`) and the header owns its own DOM, the
same shape `useHeaderTitle` already had. Second, and genuinely a
durability bug: the Local Mode save was fire-and-forget, so a row added
and immediately followed by a reload went into a transaction the
navigation cancelled — FR-19.2 promises durability and the app said
"saved" while the write was still open. Writes are serialised now, and
the G-2 indicator reports *syncing* until the write lands.

That last part is also what made the case testable without a sleep. The
rule the suite already had — no waiting on durations — forced the right
fix rather than a longer timeout: if there is nothing observable to wait
for, the missing signal *is* the defect.

**The duplicate that hid behind back.** With the outlets merged, `‹ back`
still left two live instances of the trip list, because it navigated with
the default *push*. The stale instance kept winning the header's action
registry, so the search field rendered on a page nobody could see. Back
replaces now.

**A sample trip, and what it is not.** `src/dev/sampleTrip.ts` seeds an
active trip with categories, both buy modes, a late packer and two
per-person clusters. It is dev-only (`import.meta.env.DEV`), so it leaves
the production bundle entirely, and E2E-G8-02 asserts that — Demo Mode was
removed in Addendum v2.10 as a *product* surface and is not returning
through a side door. It lands through the existing M18 portable-import
path rather than a second way of building a trip, and `activateTrip` had
to be added because the wizard only ever produced planning trips: until
now nothing in the app could move one to *active* at all.

## The filter panel, reworked from mockups

Owner verdict on the built panel: the filters should bite immediately and
the apply button is not needed, the sheet sits too flat against the list
behind it, the close control is unattractive, the axes want icons — and
the whole thing is cluttered, so rework it with mockups.

Three were drawn and driven: all values open as chips, a master/detail
split with the facets on the left, and one row per facet showing its
current selection. The owner chose the first. The trade is honest and
worth recording: it is the longest panel of the three and it scrolls,
which buys the thing the other two cannot — you see what is set *and*
what picking anything else would yield, without a single tap.

**The apply button was a fiction.** The list underneath had already
changed by the time the footer offered to confirm it; the button asked
for a tap to agree with something that had happened. The outcome line
moved into the head, where it describes the state rather than promising
one, and *Zurücksetzen* appears there only when there is something to
undo.

**The fold was what made it unreadable.** Reading the current filter cost
one tap per axis, and FR-25.11d's counts — the ones that say what picking
a value would yield, computed against the *other* facets — were hidden
exactly while they were most useful. As chips they visibly shrink while
you filter, so the rule is doing its work in the open. The per-facet
*Alle*/*Keine* pair went with the fold: *Alle* is what an empty facet
already means, and *Keine* is the facet's own *zurücksetzen*.

The panel is now mantle against the page's base with a rim, a shadow and
a dimmed backdrop; the way out is a ✕ in a circle; and every axis carries
a glyph, the same one whether it appears as a grouping or as a facet.

Both the prototype and the app carry it, and the prototype's headless
verifier stayed green through the change — it clicks facet values by
`data-fopt`, which survived the move from rows to chips because the
attribute is the contract, not the markup.

**The aeroplane is a train.** Trips are ground travel in this household;
the icon is the first thing the app says about itself, and it was saying
the wrong thing.

## The list's own hierarchy

Reported after looking at the rebuilt list: „der Titel Kleidung als
Oberkategorie ist kleiner als die Unterkategorien Regenjacke und
Sonnenhut", and the categories were hard to tell apart at all.

Both were mine. The group header had shipped as G-12-style uppercase
micro-type — 0.82rem against the rows' 0.88rem — so the heading was
literally smaller than the things it was heading. And the mock wraps each
group's rows in a card, which is what separates one category from the
next; the Vue rebuild kept the header and dropped the card, leaving a
slightly larger gap to do the work of an edge.

Now: the category heads its block at 1.02rem, a per-person cluster names
itself at 0.88rem in the muted tone, and the rows are plain — three
levels, three weights, in the order they actually nest. Each group is a
bordered card, so the seam between categories is an edge.

Two things surfaced while checking it in the browser rather than in the
stylesheet, which is why that rule exists. The sticky trip line was
painted *through* by the rows: its background came from
`--ion-background-color`, which resolves to nothing inside `ion-content`,
and `ion-item-sliding` is positioned and transformed, so at `z-index: 2`
the list won. And the line faded its opacity while collapsing, so
mid-scroll the progress figure and a group header were legible on top of
each other — it clips now instead of fading.

E2E-M4-21 guards the ordering on computed font size. A class assertion
would have proved nothing here: everything rendered correctly, in the
wrong order of importance.

## A trip needs a year, not a date (FR-2.1b)

Owner decision: „Das Datum für einen Trip soll optional sein. Nur das Jahr
ist required. bei der Selektion ist das aktuelle Jahr bereits vorgewählt."

FR-2.1a had already made the *start* date optional and kept the end date
as "the trip's planning anchor". That was the wrong anchor. A trip exists
as a plan long before its dates do, so requiring the end date meant
inventing one — and an invented date is worse than an absent one, because
it then drove M2's ordering, the series history and the „bis …" line, all
of them stating knowledge nobody had.

Migration 021 adds `trips.year NOT NULL` and makes `end_date` nullable,
backfilling the year out of the end date every existing trip was still
required to have. `duration_days` needs both dates now; everything
derived from it already had a no-duration path from FR-2.1a.

**The rebuild swallowed a column, and the suite caught it.** Modelled on
migration 004, the new `trips` table reproduced the shape from *then* —
without `updated_hlc`, which 005 had added since. Every master pull of a
trip broke instantly. A twelve-step rebuild has to carry every column the
table has grown, and the only reliable way to know that is to read the
migrations after the one being copied.

Two places had been sorting trips by a date directly; both now use
`tripOrderKey` (start date → end date → year), so a year-only trip has a
defined place instead of wherever the engine left it. The quantity-history
hint (FR-14.2) used to slice its year out of the end date and now reads
the field, which is the same information without the assumption.

The wizard's step 1 gate is a name and nothing else: the year picker opens
on the current year, so the required field is satisfied before the user
arrives. E2E-M3-11 drives the whole wizard without touching a date and
then checks that the trip reads by its year in the list — it fails against
the old gate, which is what makes it a guard rather than a description.

## Trip creation, folded (FR-2.1c)

Owner: „beim trip erstellen, sollen die optionalen parameter weniger
stark sichtbar sein, um den user nicht zu überfordern."

The house already had the idiom — FR-25.7 for template positions, FR-24.5
for master items, M5's own *Details ▾* — so this is that pattern applied
to M3 rather than a new one invented for it. Name and year stand alone;
dates, series and the three attributes sit behind one *Mehr Optionen* row.

The part worth stating: the row **summarises what is set behind it**. A
series prefills transport and accommodation (FR-13.2), so a fold that
showed nothing would hide a change the user did not make themselves —
which is FR-25.11a's argument about invisible filters, in a different
screen. E2E-M3-12 asserts both halves: the inputs are absent while
folded, and a value set behind the fold is stated on the row.

The e2e fixture had to learn the same thing, and the way it broke is the
useful part: six cases in three suites failed at once, all of them
filling a date that had moved. A shared seed helper is a contract; when
the screen it drives changes shape, that is where the change surfaces.

## Default travellers (FR-2.5a)

Owner: „man sollte default travelers konfigurieren können, welche im
wizard dann automatisch schon drin sind … Im Wizard sollte man das
einfach anpassen können."

Configured once in M17, present in M3's step 2, and fully editable there —
the last part is what keeps them a starting point rather than a rule.

**Device-local, and that is a trade, not an oversight.** A synced
household list would need a schema, a partition and an account; Local
Mode has none of those, and the feature has to work in all three modes
(invariant 5). So it sits beside the theme and the language, and the cost
— a second device configures its own — is written into the requirement
with the revisit trigger that reverses it.

The normalisation rules exist for the wizard's sake: a blank name would
block step 2's validation, and two travellers with one name make every
per-person row ambiguous. The setting refuses to produce either, so the
screen downstream never has to.

No prototype change: the mock has always shown Andy, Sia and Leonardo
prefilled in step 2 — that *is* this behaviour, and what is new is where
the three names come from, which is a settings list the mock has never
modelled.

## M5, rebuilt as a sheet

Owner: „von einem packlisten element die detail ansicht ist nicht
ansprechend und unübersichtlich. gestalte das als ux experte neu."

The concept was never the problem — §3.25 settled M5 in the mock a week
ago. The *build* had never followed it: nine equally loud sections, all
expanded, in the order they happened to be written. Same story as M4.

The order is now the order of the reasons someone opens the screen:
identity, then **packing** as the biggest control on it, then a read-only
glance row, then **preparation** and **notes** — the two things touched
while packing — and everything else behind *Details ▾*. The photo shrank
from 200 px to 44 px beside the title: it helps you recognise the thing,
and most rows have none at all.

**Presentation cost one architectural decision.** M5 is specified as a
sheet over M4, so the item URL must render the list *and* the sheet.
Making it its own route mounted a second copy of the list behind the
sheet — Ionic keeps a page per matched path — so the item path is now an
**alias of the trip route**, and opening or closing **replaces** rather
than pushes. One list, one page, and the URL still says what is open.

Two things fell out of that and are worth stating:

`‹ back` means two things on one screen now — close the sheet, or leave
the trip — so the route declares which via `meta.overlayParam`. On a
phone it is moot: the sheet's backdrop covers the app bar, so ✕ or a
swipe is the way out, and the e2e case says so rather than pretending
back is reachable. The rule still governs the desktop panel and the
browser's own back button, where it is unit-tested.

Replacing the route re-renders the list, so opening an item scrolls it
back to the top. That is the one regression against pushing, and it is
recorded here rather than discovered later: restoring M4's scroll offset
per trip is the fix when it starts to grate.

## Post-#73 review remediation (2026-08-14)

A three-way review of the merged M4/M5 rebuild — code, process, and the
screens rendered beside the concept prototype — produced one critical
finding, several real ones, and two claims that did not survive checking.
This entry records both halves, because a review's misses are as useful
to remember as its hits.

**The critical one: a single failed IndexedDB write silenced the session.**
`persistence.ts` serialises writes through a promise tail, which is what
FR-19.2's durability rests on. The tail was the *uncaught* promise, so one
rejection — a quota error, a transaction the browser aborted — left it
rejected forever: every later `save()` chained `.then` onto a rejected
promise, the callback never ran, and the change was dropped with no
signal. In the one mode that has nowhere else to put the data. The tail is
now the caught promise and the caller still receives its own rejection.
`whenSettled()` therefore reports *drained*, not *succeeded* — which is
what the G-2 glyph needs, since it has to leave the syncing state either
way. Fixing that exposed a second leak behind it: `setLocal()` did not
clear the offline flag, so the glyph would have stranded on "offline" for
the rest of the session even once writes resumed. Local Mode has no
connection to lose; a write that lands is the evidence the condition
cleared.

**The WebSocket dial sent the string `"null"` when it had no token.** It
interpolated the token straight into the URL, and `wsAuth` promotes any
non-empty `?token=` to an `Authorization` header, so an absent one
arrived as `Bearer null`. No token now means no parameter, and a present
token is percent-encoded.

**How severe this is was got wrong first, and the correction is the
useful part.** It was written up — in the review, in this log, in the PR
body — as *"Single-User Mode could never open its WebSocket, rejected
403"*. Running the branch by hand on 2026-08-14 disproved that in about a
minute: `authed` **bypasses the token entirely in single-user mode**
(`server.go:153`), so that mode upgraded to `101` with `?token=null` and
without it alike. The real effect is narrower and lives in multi-user
mode, where both forms are refused — but `?token=null` answers `401
invalid token` while the truth is `401 missing bearer token`. Given the
manual has a whole troubleshooting entry pointing at `?token=`, handing
back the wrong one of those two is a real cost; it is just not a broken
mode. The other half — the missing `encodeURIComponent` — stays a latent
bug rather than an active one, since JWTs are base64url.

Worth keeping as a habit: the claim survived a code review and a
self-review because everyone read `wsAuth` and nobody read `authed`
beside it. One `curl -i` against a running binary settled it.

**One grouping state, not two.** M12's slice tap called
`tripStore.setGroupBy`, which the M4 rebuild stopped reading — M4 takes
its grouping from `usePackingFilter`. The tap navigated and the grouping
silently stayed put. The store's copy (`groupByPrefs`, `getGroupBy`,
`setGroupBy`, `groupedItems`) had no other reader and is gone;
`setStoredGroupBy` is the one way for a departing screen to set what M4
shows.

The first attempt at it wrote only the stored value, and the e2e case
written during the self-review is what caught that this was still broken:
**ADR-012 leaves one router outlet, so M4 is not remounted on the way
back from M12** — it was never unmounted — and a value in storage is read
at mount and never again. The tap navigated and the grouping stayed put,
exactly as before. Both unit tests were green throughout, because each
side was correct about its own state; only a test that crossed the screen
boundary could see it. So `setStoredGroupBy` writes storage *and* moves
the live ref of the mount already on screen, which a small per-trip
registry in `usePackingFilter` makes reachable. Worth remembering as a
shape, not just a fix: **a handoff between two screens cannot be verified
from either end.**

**The reveal bar counted two different things.** "Show 3 packed" became
"Hide 5 packed" for the same rows: one direction counted rows, the other
summed `packed_count`. `hiddenDoneCount` is now `doneCount` — done rows
among the ones the filter lets through, unchanged by the toggle, because
the bar labels the same set in both directions.

**`/trips/new` had lost its anchors.** The rule that makes M4 full-screen
matched on path *shape*, and the wizard has the same one without being a
drill-down. E2E-G1-03 covers it; the existing G1-02 asserted "hidden on
M4 and nowhere else" and could not see it, because it only ever visited
M4.

Also: the strings the rebuild itself hard-coded are localized (M3 step 1
and M20 in full, including the folded summary, which was printing raw
enum values like `holiday_flat`), the duplicated amendment paragraph in
the UI-Spec is gone, and the second `E2E-G12-02` is renumbered.

**What the review got wrong.** `openSlice()` was reported as dead code;
it is called, and `git blame` shows the call site landed with it. A
hard-coded `rgba(137,180,250,.16)` was reported in `FilterSheet.vue`; it
does not exist — that triplet appears only as `--ct-blue-rgb` in the
token table. And the documentation contradiction was one stale file, not
three: `e2e-tests.md` and this log already agreed with the code, and
CLAUDE.md was corrected by #79.

Three invariant-9 violations the rebuild did introduce — raw
`rgba(0,0,0,…)` shadows in `FilterSheet.vue` and `PackingListPage.vue` —
are deliberately **not** fixed here. There is no shadow token to move
them onto; `catppuccin.css` carries colour and nothing else. They are
part of the design-token work that comes before the next screen rebuilds.

## The app gets its own two faces (FR-21.5/21.6, G-13)

First of the five design-foundation PRs, and the one that touches every
view from a single file. The finding that started it: the client declared
**no `font-family` at all** — every screen rendered in whatever Ionic's
platform stack resolved to, which is why the rebuilt M4 and M5 landed the
concept's information architecture and still did not look like it.

`client/src/theme/typography.css` now sits beside `catppuccin.css` and
owns exactly one thing, the way that file owns colour: the `@font-face`
rules, the two family tokens, the `--jp-text-*` scale, `--ion-font-family`
and the `.jp-*` role classes. Fraunces is the display face, Hanken
Grotesk the UI face, both variable woff2 in latin **and latin-ext** —
the German catalogue needs the extended range.

**Self-hosted and committed, not fetched.** Local Mode may have no
network at all, so a font request per boot is not a slow path, it is a
missing one; NFR-4.3 rules out the third-party request besides. The files
are checked in rather than pulled through `@fontsource-*`: that package
would satisfy invariant 8 through the lockfile just as well, but it adds
two dependencies to ship four static assets.

**The face follows the role, never the tag.** The tempting shortcut —
`h1, h2 { font-family: display }` — is wrong, and the prototype says so:
it sets M2's trip rows in the *UI* face. Putting every card title in the
serif would flatten the hierarchy the serif exists to state. So each role
is named once (`.jp-page-title`, `.jp-hero-title`, `.jp-sheet-title`,
`.jp-num`) and applied where that role occurs. Every screen touched also
**lost** the local `font-size`/`font-weight` it had been carrying, so
there is one definition per role and no second opinion — the point of a
token table, and the reason this file is now part of invariant 9.

Raw `px` lives in `typography.css` and nowhere else, deliberately: PR 3's
gate rejects bare `px` under `client/src` outside the token files, and a
role class hard-coding `34px` would recreate the magic numbers the file
exists to retire. A unit test asserts exactly that.

**A note on how the unit tests read the CSS.** They load it with `fs`,
not with an import. Vitest stubs CSS imports — including `?raw` — so the
assertion runs against an empty string and passes forever. That was tried
first, and it is the shape to remember: a test whose subject the test
runner has replaced with nothing is green by construction.

Two claims in `design-foundation-plan.md` did not survive implementation
and are corrected in place: the prototype has more display-face
declarations than the plan's table lists (it called the table complete),
and the blanket `h1, h2` rule above. `docs/` is owed nothing here, and
that is a decision rather than an omission — the published manual covers
server operation, and self-hosting a font changes nothing an operator
configures.

## The three colour anchors (FR-21.7, G-11)

Second of the design-foundation steps, and the one that explains why the
built screens still looked generic after the typography landed. The
palette was never the problem — the **roles** were. `catppuccin.css`
mapped blue onto `--ion-color-primary`, which Ionic paints on tabs, the
FAB, checkboxes and segments without being asked, and demoted peach to
`warning`. So the brand appeared nowhere and the action colour appeared
everywhere: a default Ionic app wearing a Catppuccin palette.

The anchors are now a block of their own, above the Ionic mapping:
**peach = brand, blue = action, green/teal = done**. A component asks for
the role; only that block decides which hue a role is.

**The brand is deliberately not the primary.** It was tempting — one line
and the whole app turns peach. But primary is what Ionic paints on
buttons and links, and those are things you *act on*; repainting them
would make every button shout the brand. Identity gets the few surfaces
that carry it: the anchor you are on, the create FAB, the eyebrows, the
preparation and shopping marks.

**Two consequences the plan had not seen, both found by implementing.**
Freeing peach leaves `warning` empty, and caution had to go somewhere:
yellow. That fixed a real confusion rather than merely relocating one —
while peach was `warning`, a container over its weight limit and the
product's own identity were the same colour, and the louder reading won.
The second: M2's trip ring ran peach below 50 %, blue to 99 %, green at
100 %. Under the new anchors that meant an unpacked trip was marked in
the brand colour, which reads as an alert. Progress now runs the done
ramp end to end and nothing else — **progress is never the brand.**

**Where the rules live matters as much as what they say.** FAB, checkbox,
toggle and progress bar are element rules in the token table, not per
screen, so a FAB added six rebuilds from now is not a fresh decision. And
`color="brand"` is a real Ionic colour name now: without it the only way
to reach peach from a template was `color="warning"`, which is precisely
how the preparation badge and the shopping count came to be painted as
cautions.

**Twelve literal fallbacks are gone.** `var(--ion-color-light, #eee)` and
its eleven siblings read as harmless defensive code, and the plan
undercounted them at nine. Every one was a *light* colour sitting behind
a dark-default theme, so the fallback could only ever paint the wrong
thing, and only when something was already broken. A unit case now
rejects a hex literal anywhere under `client/src`.

Two notes on the tests. The e2e cases compare against the **role token**,
not against a hex, so they hold in Latte as well as Mocha. And the first
version of them failed against a correct page twice, both times for
reasons worth keeping: a custom property computes to the token text it
was given (`#fab387`) while `color` computes to `rgb(250, 179, 135)`, so
the two need separate readers; and the tab bar is *hidden* at the default
desktop viewport, where the rail carries the anchors instead — the case
now asserts both presentations, which is what G-11 actually claims.

**Two things the self-review caught, both about rules that described
themselves rather than the code.** `--ion-color-primary` still reached for
`--ct-blue` directly, so `--jp-action` had no consumer at all and blue was
decided in two places while peach and green were decided in one — the
anchor block described a rule that two of its three roles followed. Primary
now resolves *through* the role.

And `seed({ theme })` in the e2e fixtures wrote `'dark'`/`'light'` into
`jitpack_theme`, which `readTheme` does not recognise: anything but
`'latte'` resolves to Mocha, so a light-theme case would have asserted the
dark theme and passed. Nothing used it yet, which is why nobody noticed —
and the Latte case added here would have been the first victim. The option
is typed as `Theme` now, and the case asserts `jitpack-latte` is on the
root *before* it asserts anything about colour. Verified by seeding Mocha
and watching it go red.

**Latte reads the brand deeper (owner, 2026-08-14, after seeing it
rendered).** "Peach is the brand" turned out to be one *role* with two
readings rather than one value. Latte's peach is a saturated orange on a
near-white ground where Mocha's is a pastel on a near-black one, so the
light theme shouted.

Measuring rather than guessing changed the answer. The obvious calmer
choice — a paler, softer peach, or Latte's own rosewater — would have made
things worse: stock Latte peach already managed only **2.45:1** as an
11 px tab label, and rosewater is **2.17:1**. On a light ground quieter
and darker are the same direction, so deepening the token calms the shout
*and* fixes the legibility in one move (**3.56:1**). It is a `color-mix`
of two palette tokens, not a picked hex, so it still follows the flavour.

Rendering caught the correction inside the correction: deepening the FAB
gradient's far stop alongside it lands on **brick**, because Latte's
maroon plus ink is a red — the create button read as *danger*. The far
stop stays in the peach family instead. That is not a detail a contrast
number could have told me, which is the argument for looking at both.

The general rule, now in G-11 and FR-21.7: **a role is flavour-relative.**
Where a role lands differently in the two flavours it is restated per
flavour, never averaged into one value that suits neither. The `--jp-*`
tokens carry that naturally; a single constant could not have.

One consequence worth guarding: CSS cannot derive an rgb triplet from a
`color-mix()`, and Ionic's rgba() internals need one, so Latte writes
`--jp-brand-rgb` by hand beside the mix. A unit case asserts the two are
always restated together — otherwise they drift apart silently and only
the ripples stay on the old hue. The FAB glow and the rail's active
background were moved off the triplet onto `color-mix` for the same
reason: fewer places that can disagree.

**Correction, same day, from reviewing that change:** the note above said a
unit case keeps `--jp-brand-rgb` in step with the mix. It did not — it
asserted only that the Latte block *restates both*, which catches
forgetting one and nothing else. A hand-written triplet that is simply
**wrong** passes it, and the only symptom would be Ionic's ripples sitting
on the old hue. E2E-G11-05 now resolves both through a canvas — the one
place a browser will normalise `color(srgb …)` and `rgb(…)` to the same
bytes — and compares them per channel. Proved red by pasting the stock
Latte peach back into the triplet: *"latte: --jp-brand 192,93,44 and
--jp-brand-rgb 254,100,11 disagree"*.

Worth keeping as a shape, since it is the second time in two PRs: **a test
that asserts a rule is stated is not a test that the rule holds.** The
typography suite had the same gap — asserting a role class exists rather
than that no view contradicts it.

### 2026-08-14 — Surfaces: three planes, a radius scale, and a gate (FR-21.8, G-14, invariant 9b)

Third design-foundation step. The defect it closes is the most instructive one
of the three, because **no rule then in force could see it**: `.group-card`
declared `background: var(--ct-mantle)` — a real palette token, sourced from
the token table, passing invariant 9 and its unit suite — and `--ct-mantle` is
what `--ion-background-color` is set to. The card was painted the exact colour
of the page behind it, so a 1px hairline was the entire distinction between an
object and its background. A stylesheet reads as correct either way; only a
rendered pixel says otherwise.

So depth became a role, the way brand and action did: page → card → sunken,
each named once, with Ionic's background variables resolving *through* the
roles rather than beside them. `.jp-card` carries plane, rim, radius and lift
together, and its children defer to it.

**The radius scale is smaller than the values it replaced, and that is the
finding.** Nine values were in use (2/4/7/8/10/12/14/22/999px) with no rule for
picking one. But three of them were not a small step at all: every stray 2, 4
and 7 px was **half the height of the bar or handle it rounded**, so all of
them meant "fully round". They collapsed into one pill token rather than
snapping onto an invented `--jp-r-xs`. Five steps, each with a job. `50%` stays
raw on actual circles — a circle is a shape, not a size — and the gate allows
that by rule rather than by allowlist, as it does the `0 0 0 <n>px` ring form,
which casts no light and therefore is not elevation.

Elevation is split across two files on purpose: the geometry in `surfaces.css`,
the ink and its weight in `catppuccin.css`. Same reason FR-21.7's brand is
flavour-relative — Mocha casts in crust, which in Latte is a light grey that
would cast no shadow at all, and 0.6 alpha reads as depth on near-black and as
dirt on near-white.

**Two false greens, both caught by running the thing rather than reading it.**

The gate had the defect it exists to prevent. Run from the wrong working
directory it resolved a path that matched nothing, globbed zero files, and
printed *ok*. It was found by accidentally running it from `client/src` — a
gate that scans nothing now exits non-zero, because "ok" is the worst answer it
could give.

The Latte shadow e2e case passed against the bug it was written to catch. It
asserted the shadow ink is darker than the card, and Latte's crust satisfies
that (676 to the card's 725) while being useless as a shadow. Substituting
Mocha's ink back in kept it green. The assertion that holds is that the ink is
darker than the palette's darkest **surface** — anything lighter is a plane,
and planes do not cast shadows. **Third occurrence in three PRs of one shape:
a test that asserts a rule is stated is not a test that the rule holds.** It is
worth treating as a standing check on any new guard: name the mutation it would
catch, then make that mutation.

**PR 3 was split, and the split is recorded in the plan.** It bundled the card
planes, the radius scale, the elevation tokens and the 123-site type migration
— four sweeps that each change how every screen looks. One PR containing all
four cannot be eyeballed, since a regression in any one is indistinguishable
from an intended change in the other three. Shape shipped here; the type
migration is PR 3b, still ahead of the screen rebuilds, and extends the same
gate. The spacing scale the plan asked for was dropped outright: with the gate
scoped to colour, radius and elevation it would have had no consumers and no
gate, which is the unused-token shape PR 1 already removed a class for. Spacing
is also not one decision the way a radius is — a radius describes what kind of
thing an element is, spacing describes one particular layout.

**Two more findings from reviewing the same PR, and one of them is the
fourth false green.**

*The scrim.* `--jp-scrim` was derived from `--jp-shadow-alpha` on the
reasoning that a backdrop and the shadow its sheet casts should be the same
darkness. That is true of a backdrop and wrong of a scrim: the avatar crop
mask is not suggesting depth, it is making a circle legible against
everything outside it. Latte's shadow weight is deliberately light (0.22, so
a card does not look grimy), which took the crop mask from 0.55 to 0.198 —
a functional opacity quietly inheriting an aesthetic one. It has its own
`--jp-scrim-alpha` now, restated per flavour and held near Mocha's, because
what a scrim has to *do* does not change with the flavour, only which ink it
does it in.

*The M2 separators, and the test that did not catch them.* Wrapping each
series in a card, I set `lines="none"` on the list to stop Ionic's
full-width line spilling past the card's radius. Three trips in one card
then ran together with nothing between them — a card bounds the *group*, not
its entries. Found by rendering M2 with three trips rather than the one the
screenshot happened to have.

The guard written for it **passed against `lines="none"`**. It read
`--inner-border-width` on the `ion-item` host; Ionic drives that line from an
attribute selector in its own stylesheet, so on a row nobody styled the
custom property is simply *unset* — and "unset" is not "0". It now measures
the rendered `border-bottom-width` on `.item-inner` inside the shadow root,
and is proved red in both directions: no seam between rows, and a seam on the
last row that duplicates the card's own edge.

**Fourth occurrence, and the pattern is now specific enough to act on.** All
four had the same shape — the assertion was made against the *nearest
readable thing* rather than against the rendered outcome: a token's presence
instead of its value, a declared property instead of a painted pixel, "darker
than the card" instead of "dark enough to be a shadow". The check that would
have caught every one of them is cheap: **make the mutation the test claims
to catch, and watch it fail.** That is now the standing rule for any new
guard here, and it has caught more real defects in three PRs than the reviews
did.

One more, and it is the gate reviewing itself: it flagged the unit test that
asserts what `--jp-scrim` resolves to. Tests are excluded now, and by rule
rather than by convenience — the gate stops a *view* from deciding colour or
shape, and a test that asserts a token's text paints nothing. Verified after
the exclusion that a real view is still caught, by putting a raw radius back
into `SearchRow.vue`.

**Two more, both from the owner asking what the Latte shadow actually looks
like — which is the whole argument for the eyeball pass in one example.**

Routing `--ion-item-background` through the card plane repainted every
`ion-list` as well: Ionic reads that same variable for the list element, so
a list wrapping cards laid a card-coloured slab a few pixels wider than the
cards on it, and each card's shadow fell onto its own container rather than
onto the page. The original defect, one plane up. It was invisible in the
stylesheet again; what gave it away was that the pixels under a card edge
measured **lighter** than the page, which is the one thing a shadow cannot
be. Fixed with `ion-list:has(.jp-card)` — the rule states the actual
condition, covers screens not built yet, and outranks Ionic's `.list-md`,
which a bare element selector does not.

Then the measurement contradicted what had already been written into three
documents. Latte was described as casting "far softer" than Mocha. Off the
rendered pixels: **Latte darkens the page by 49/765, Mocha by 10/765** —
five times as hard, at a third of the alpha. The cause is structural rather
than a mistuned value: crust sits seven units below mantle, so a shadow cast
in crust on a mantle page cannot darken by more than seven units however
hard it is thrown, and raising the alpha buys nothing. **The dark flavour
lifts a card by the plane step (+21) and the light one by the shadow (−49)**,
each using the mechanism its ground supports. The palette holds nothing
below crust to cast in, and inventing one would be a second palette — so
this is the honest answer rather than a workaround.

Worth keeping beside the false-green rule: **a plausible symmetry is a
claim, and a claim about pixels is checked by reading pixels.** "Latte casts
softer" was written from the alpha, which is the input, not the result.

### 2026-08-15 — The type migration: 170 declarations onto the scale (FR-21.5, G-13)

The other half of the split PR 3. The typography step shipped `--jp-text-*`
ahead of its callers on purpose; this is where the 123 `font-size`, 40
`font-weight` and 7 `letter-spacing` sites across 31 screens moved onto it,
and where the gate grew its fourth rule.

**Most of it was mechanical. Three things were not, and none was visible
before doing the work.**

*Icons needed a table, not an exemption.* The plan had said the gate would
carve out icon sizing "by rule rather than by allowlist". That was the wrong
shape: `font-size` on an `ion-icon` is a **glyph box**, not a text size, and
an exemption would have left 40 sites unowned. A second scale
(`--jp-icon-xs … 2xl`, six steps, each with a real occupant) needs no
exemption at all, and it stops the thing an exemption would have permitted —
a later adjustment to body copy silently resizing every icon in the app.

*The section label was an unnamed role, not eleven stray sizes.* Nine screens
carried it as a 16px semibold sentence; two carried it as the small uppercase
label the concept prototype actually specifies. Same element, two answers,
neither of them written down anywhere. Migrating the nine onto a token would
have put a 16px step into the table that the design does not use — the token
table would have been recording a mistake rather than a decision. `.jp-eyebrow`
names it once, and owns colour as well as type: a label that is not recessive
stops being a label, and leaving that to nine call sites is nine chances to
forget. **This is the one visible change in an otherwise mechanical pass**, so
it shipped with before/after screenshots rather than as a footnote.

*The scale grew where the app pushed on it.* Seven sites — two badges, an
avatar's initials and its tick, two counts and a prep marker — sat below 11px
with nowhere to go, so
`--jp-text-3xs` was added rather than the sites rounded up out of their
layouts. That is the mechanism `typography.css` predicted when the scale
shipped ahead of its callers: a size the table does not have is a signal about
the table.

**Two carve-outs, both by rule.** `letter-spacing: 0` is a reset — it declines
a decision rather than making one, and a token for "none of the above" would
claim otherwise. SVG text needed no gate rule in the end: inside a `viewBox` a
font-size is in **user units**, a proportion of the drawing, so M2's ring label
moved to an SVG attribute beside `cx` and `r` and left CSS entirely. A px token
there would have rendered at 10/36 of the ring's width.

**Every new guard was proved red against its own defect** before being kept —
a seventh icon step, the missing `3xs`, a screen restating the eyebrow, a
screen claiming the class without the role, and both e2e cases (the eyebrow
reduced back to a sentence, and an icon sized from the text scale). That
check is now routine here rather than a reaction to the four false greens in
the surfaces step.

**One process note, paid for.** `git checkout <file>` was used to undo a test
probe in a file that also held uncommitted migration work, and took the
migration with it. The probe pattern used everywhere else in these PRs — copy
to `/tmp`, restore from there — does not have that failure mode. The gate
caught the loss immediately, which is the argument for having it.

**Two corrections from reviewing the same PR.**

The count was wrong: `--jp-text-3xs` has **seven** occupants, not the four
stated in the token comment, the unit test, the plan and the log. Counted
from `var(--jp-text-3xs)` rather than from memory — two badges, an avatar's
initials and its tick, two counts and a prep marker. A number written into
five places from an impression is five wrong places.

And `.tick` was the one site the migration genuinely moved: 8px to 10px,
inside a 12px circle. Measured rather than assumed — the glyph's line box
comes out 13px, which reads as an overflow until you look: 13px is the em
box, and the checkmark's *ink* stays inside the disc. Rendered at 6× beside
the old size to confirm, and it is the more legible of the two at real size.
Kept. The measurement is recorded because "13 in 12" is exactly the kind of
number that would otherwise be re-discovered and 'fixed' later.

### 2026-08-15 — The pack-out: a row that leaves, and one undo (FR-25.2)

Fourth design-foundation step, and the app's first motion of any kind — there
was no `<Transition>`, no `<TransitionGroup>` and no keyframe anywhere in
`client/src` before this. Packing a row dropped it from the array and Vue
removed the node on the next tick: the snap was the entire feedback channel,
and a mistap had no way back short of finding the reveal bar, showing the done
rows, finding the row and un-checking it.

**The plan's shape held. Three things inside it did not, and each was found by
running rather than reading.**

*No view-model change was needed.* The plan expected the list to hold a "still
animating" set so a done row could outlive its own removal. `<TransitionGroup>`
already owns exactly that, so `buildPackingView` is untouched and stays pure.

*A custom property does not transition.* The wash was written first as
`--background` — which is what Ionic reads — and unregistered custom properties
animate discretely, so the green appeared and disappeared within one frame. It
is a real `background` now. The split shade that showed while both the item and
its slider carried the wash was settled by measurement rather than by argument:
one side was the tint over `--ct-base`, the other the same tint over
`--ct-surface0`, which named the duplication immediately.

*The snackbar landed under the FAB* — on top of the one control it exists for.
Ionic 8's `positionAnchor` puts it above, which is FR-25.11h's rule one layer up.

**Two defects the new cases caught, both of them mine.**

The outgoing snackbar's dismiss handler disarmed the **incoming** pack's undo:
`announcePacked` awaited `packToast?.dismiss()` and the outgoing toast's
`onDidDismiss` then found itself still current, so packing two rows in a row
left the second with no undo. Clearing the handle *before* dismissing makes the
outgoing handler's identity check fail, which is what it was for.

And E2E-M4-35 — "un-packing announces nothing" — **passed against the build
with its own guard removed.** The snackbar is created asynchronously, so an
absence check arrives before it would have appeared and reports success on a
page that was about to show one. It asserts a counter the page now renders
(`data-pack-announcements`) instead: the same deterministic-seam move the G-2
indicator made for Local Mode writes, and the reason CLAUDE.md phrases that
rule as "if nothing observable exists to wait on, that absence is the defect".

Worth noting as the fifth of its family: **an assertion about an absence needs
a positive signal that is guaranteed to arrive later than the thing it denies.**
"No toast is on screen right now" is not that signal. A counter is.

**One deliberate piece of production code exists for a test**, and it is
recorded here so it is not removed as cruft: `data-pack-announcements` on M4's
content element. It makes an otherwise untestable rule testable, which is the
trade CLAUDE.md endorses rather than a workaround for a lazy test.

**One thing looked like a defect and is not, recorded so it is not "fixed"
later.** In a frozen frame the leaving row reads two-tone: a pale block over
the left third, green over the rest. Dumping every painted background inside
the row named it — `div.ripple-effect`, Ionic's Material tap ripple, expanding
from the checkbox in `--ct-text`. It is on every row tap in the app already
(opening the sheet, un-packing) and predates this change; it lives for about
200 ms and is gone before the collapse finishes. Stills make it look like a
competing wash because a still is exactly what it is not. Whether Material
ripples belong in this app at all is a separate decision about every tap
target, not something to settle inside the pack-out.

### 2026-08-15 — Visual baselines, and the end of the design foundation (ADR-013)

Fifth and last step. "Looks right" was untestable: no `toHaveScreenshot`
anywhere, which is why each of the four token PRs before this shipped a
hand-built screenshot artifact — the only way to show what had changed. From
here a diff does that, and the artifact is for explaining rather than for
detecting.

**The decision is where the images are rendered, and it is ADR-013.** The
maintainer's NixOS host cannot launch Playwright's downloaded browsers at
all, so local runs happen in the pinned container; if CI rendered on the
runner instead, accepting an intended change would mean pushing, letting CI
fail, and committing images the maintainer never saw. So both sides run the
same digest-pinned image, which also makes the renderer a hash-verified
dependency like every other (invariant 8). The costs are real and named
there: a second browser mechanism in CI, image bumps that rewrite every
baseline, and PNGs that git keeps forever.

**The plan contained a contradiction.** It asked for a dev-only gallery *and*
for baselines covering it — but a route behind `import.meta.env.DEV` is not
in the bundle the visual project drives. Split the jobs rather than the
difference: baselines cover the real screens, the gallery is a human tool
with none. Verified rather than assumed — `grep` over `dist/` after a
production build finds no gallery chunk.

**Determinism was the actual work.** Two sources of randomness would have
made every baseline fail on its second run:

*Avatar colours.* `UserAvatar` hashes its seed into a palette colour, and the
seed is a traveler id — `crypto.randomUUID()`. Stubbed in the spec so the
whole app is deterministic, rather than masking the avatars, which would have
blinded the baselines to the one component the colour step was about.

*And the clock, which turned out to be the opposite of what it looked like.*
Freezing `Date.now()` so a rendered year cannot drift is the obvious
companion — and with it the packed row never leaves the list. Probing said
why the row stayed but not why the write did: the checkbox flips and the
header count, which reads the store, does not move, so the mutation never
lands. **The obvious suspect is ruled out** — `HLCGenerator.next()` handles
equal timestamps correctly (`if (now <= lastMillis) counter++`) — so it is
something else in the write path. Not traced: no baseline renders a date, so
the freeze bought nothing. Written down with the ruled-out suspect named,
because the next person to reach for `setFixedTime` will otherwise spend the
same hour.

That last one is worth keeping as a shape of its own, distinct from the
false-green family: **I wrote the HLC explanation into a comment as fact
before checking it, and it was wrong.** Reading the generator took two
minutes and cost nothing; shipping the sentence would have cost the next
person an afternoon chasing a mechanism that does not exist.

**Two smaller things the first runs found.** A global `testIgnore` for
`visual.spec.ts` also hid the file from the visual projects, which then
reported "No tests found" — an error rather than a pass, which is the only
reason it was caught immediately. And `reducedMotion` does not type-check as
a project-level `use` option in this Playwright version; it belongs in the
spec, where `pack-out.spec.ts` already had it.

**One thing caught before CI rather than by it.** The visual job first called
`make visual`, and a GitHub runner has neither `golangci-lint` nor `mise` —
so `make` fails there on its parse-time toolchain guard, before any recipe
runs, over a tool the baselines never touch. The invocation moved into
`scripts/visual.sh`, which `make visual` and the workflow both call: the same
two-callers shape as `scripts/coverage-gate.sh`, and the thing that must not
drift is the invocation rather than a digest copied into two files.

**And one gap the review found in the pin itself.** Dependabot's docker
ecosystem reads Dockerfiles and compose files, not shell scripts — so the
digest in `scripts/visual.sh` is the one pin in the repository it will never
update. Invariant 8 previously claimed, without qualification, that
Dependabot keeps the digests fresh; it now names the exception, because a
blanket claim with a silent hole is worse than a narrower true one. The
manual bump is also the behaviour ADR-013 wants: a new image rewrites every
baseline, and that should be a decision rather than a Tuesday.

The `client/e2e/README.md` recipe was stale too — it named the v1.61.1 image
while `@playwright/test` is 1.62.1, which fails at browser launch with
exactly the error the surrounding paragraph warns about.

### 2026-08-15 — M7 gets its two scopes (§3.27, FR-27.1/27.6)

The first of the screen rebuilds the design foundation was built for. M7 was
a flat list of names with an item count; §3.27 gave templates a **scope** two
migrations ago and nothing in the client had ever read it. Now the list is
scope-shaped: *Alle · Ferien · Gruppen*, with *Alle* rendering the two scopes
as sections — vacation templates first, because they are what a trip starts
from and groups are the building blocks — group rows carrying their chip, and
the FAB asking which scope to create instead of assuming one.

**The scope is declared, never derived.** That is FR-27.1's rule and it is
the reason the FAB opens a chooser rather than creating a template and
letting usage decide: a freshly created group that nothing includes yet would
be unclassifiable, and "it has no includes, so it must be a group" would
misfile every empty Ferien-Vorlage. The chooser is two cards with one line
each, because *Gruppe* alone does not say what a group is for.

**One resolution, three callers.** `client/src/domain/templates.ts` expands a
template's includes and merges the result by master item under the existing
FR-2.3a rule. It is deliberately **not** a new algorithm — FR-27.2 says as
much — and deliberately not a second one either: the M7 row count reads the
same resolution the M8 footer and trip generation will, so the count on the
row and the count in the trip cannot drift apart. Expansion stops after one
level on purpose. FR-27.1 fixes the hierarchy at two levels, and *that* is
what makes include cycles structurally impossible; following a group's own
includes would quietly hand the cycle back and leave the validator that no
longer exists to catch it. A mutation test guards exactly this: making the
expansion transitive turns the case red.

**What the row now counts.** A composed Ferien-Vorlage with no positions of
its own used to read "0 Artikel", which described the row rather than the
trip it would produce. It now counts the resolved set. The include-dependent
half of that display — the "2 Gruppen ·" prefix and the *enthält: …* line —
is built and unit-tested but not yet reachable, because nothing in the app
can write an include until the M8 rebuild. The e2e ledger says so rather than
letting a partial case read as a full one.

**A hole this PR would otherwise have opened.** Adding scopes without
touching the portable format would have made an exported Gruppe import back
as a Ferien-Vorlage — the same name, the wrong thing. The YAML now carries a
`scope` field beside `kind`, which are two different questions: `kind` says
whether the document is a template or a trip, `scope` says which of the two
template scopes it is. Both parsers reject an unknown scope rather than
defaulting it, and a scope on a *trip* document is an error rather than an
ignored field. Files written before scopes existed carry none and read back
as `template` — the same default migration 016 applies to pre-scope rows.

**Two things only the rendered screen said.** The segment's middle tab was
specced as "Ferien-Vorlagen" and truncates to an ellipsis at 390 px, which
names a scope worse than one word does; it now carries the short form and the
section head below spells it out. And the create sheet used an `IonContent`
inside an auto-height modal, which has no intrinsic height to give — the
sheet sized itself to nothing and swallowed every tap meant for its cards.
The e2e run found that one before the screenshot did, with "ion-modal
intercepts pointer events"; a plain box fixed it.

**On the tests.** Every case here was checked against a build with the rule
removed: transitive expansion, a `sum` default instead of `max`, groups
rendered before vacation templates, a create path that ignores the chosen
scope, a template row read without its kind, includes left behind by a
deleted template. Five of the six turned a case red on the first try. The
sixth did not — nothing asserted that a Vorlage's *own* position leads the
merge report ahead of its groups' — so that case was written before the
mutation was reverted. That is the pattern this project has now paid for six
times: the assertion that was never watched failing is the assertion that is
not there.

### 2026-08-15 — M7's two open decisions, settled by rendered variants

The PR-88 review left two questions that were the owner's to answer: what the
row carries, and how creating works. Rather than argue them in prose, both
were built as working variants on a scratch branch and rendered — three row
shapes (inline button / long-press menu / swipe), three create flows (system
dialog / name-in-sheet / create-then-rename). Two of the six died on sight in
the render: **swipe's option panel breaks out of the card** and paints over
the row below, and **create-then-rename writes an unnamed row the moment you
tap** — the prototype does it, but the prototype has no persistence, so its
mock never showed that cost. The owner picked A2 (long-press) and B2
(name-in-sheet).

**The implementation found a real bug the variant did not have to face.** The
first guard against "the hold's release also opens the row" was a one-shot
swallow-next-click flag. A hold-driven e2e case went red on its *last*
assertion: after cancelling the menu, a legitimate tap no longer opened the
row. Cause: the release click usually never reaches the row at all (down on
the row, up on the presented overlay — the click fires on their common
ancestor), so the flag went stale and ate the next genuine tap. The fix is a
different shape, not a patched flag: **row taps are inert while the menu
lives** — a state with a beginning (the hold fires, set before the overlay
attaches) and an end (dismiss), which is what made the race deterministically
testable at all. Both new rules were mutation-checked red: guard removed,
name-guard removed.

**That hold e2e case then had to go, and where it went matters.** Driving the
500 ms with `page.clock` worked on a freshly loaded page and failed
nondeterministically on a warm app — under the faked clock, Ionic's action
sheet sometimes never attaches (chromium, one repeat in three), and on webkit
any `getAnimations()`-based settle hangs on an unrelated *infinite* spinner
animation. Under CI's full-suite load, `page.goBack()` across the root→tabs
outlet boundary additionally wedges the outlet — the pre-existing Ionic
transition defect from the navigation work, in a new costume; the suite now
leaves M8 the way a user does, through the ADR-011 header chevron. The 500 ms
moved to where they are deterministic: `useLongPress`, a pure composable
unit-tested with fake timers (arm, fire once, release disarms, slop disarms,
jitter survives), while the e2e case proves the guard through `contextmenu` —
the same handler the hold fires into. The one-line `pointerdown` wiring is
the accepted, *stated* gap; the ledger names it.

Two Ionic locator lessons re-paid, one of them for the second time:
`toBeDisabled()` does not see an `ion-button`'s disabled state (it lives as
`aria-disabled` on the custom element — the same family as the false-green
`toBeEnabled()` this project already recorded), and a `getByRole('button')`
inside an `ion-item button` matches the row itself.

## 2026-08-15 — M8 rebuilt: the scope-shaped editor (§3.27, FR-27.2/27.4/27.6/27.7)

The second screen rebuild, straight after M7 (#88), same worktree pattern.
What landed, in the order it was built:

**The plumbing first** — the client could read §3.27's schema but not write
half of it. `template_includes` gains its two mutations and orchestrator
wrappers (the M7 read side landed without them, deliberately);
`template_item_tasks` gains everything — the type, master-table pull routing,
store state with the position-delete cascade mirrored, both mutations. Two
pure guards joined `domain/templates.ts`: `scopeSwitchBlock` (FR-27.6, both
directions, deliberately directional) and `planningTripsUsing` (FR-27.4's
warning surface: planning trips whose rows carry the template — or a Vorlage
that includes it — as provenance). A Local Mode round trip proves the whole
path touches no network. All four mutation checks ran red first: swapped
guard directions, dropped planning filter, dropped include reachability,
dropped task cascade.

**The screen** — scope segment with guarded switch (refusals are anchored
toasts naming the reason or the consumer; "Eingebunden in: …" stays visible
on an included group), the Gruppen section with the picker (groups only,
already-included hidden, "Neue Gruppe anlegen…" as an inline field — the M7
B2 lesson applied, no `prompt()`, no row before a name), the FR-27.2
resolution footer naming every merge with its contributors, the FR-27.4
blast-radius note, name-sorted position rows with deviation chips or
"Standard", and the FR-25.13 quick-add **reused, not copied**: QuickAddItem
lost its unused `tripId`, gained `confirmLabel` (the scope-labelled commit)
and `excludeItemIds` (a position the template carries is not suggested
again). The position sheet is a new `PositionSheet.vue` in the as-built M5
grammar: glance chips, Menge with a plain stepper (0 = "bewusst nicht dabei",
FR-5.5), the FR-27.7 task list with the blocking rule stated inline, and
assignment/procurement/dedup/conditions/Später-Packer behind "Details ▾".
The M3 attribute catalogue moved to `lib/attributeLabels.ts` so the FR-15.2
condition chips and the wizard's fold summary read one vocabulary. M7's
long-press menu gained the rename and delete it had reserved space for —
delete guarded like promotion: an included group names its consumer instead
of cascading out of every Vorlage that builds on it.

**Corrections against the spec, recorded as UI-Spec/UI-Test-Spec amendments:**
no swipe-to-delete and no reorder (no order column; the M7 render killed
swipe-in-card), and the blast note deliberately also fires on a group reached
through an including Vorlage. The first draft of the amendment also waved the
FR-25.15 indicator away as "G-2 already says it" — the /pr-review pass caught
that FR-25.15 *explicitly rejects that argument* (captured-here versus
reached-the-server is the offline story), so the indicator was built instead
of excused: one shared `SaveIndicator` (amber ● in flight → green ✓ settled,
seam = the FR-19.2 orchestrator state), now in **both** sheets — the M5
rebuild had quietly shipped without it. Flip unit-tested, mutation-checked.

**Render pass:** built bundle, Local Mode, eight framed states (group editor,
sheet collapsed/expanded, picker, composed Vorlage with merge line, inline
group creation, guard toast, blast note both ways). One real defect caught on
pixels, not in review: bottom toasts slid in behind the tab bar and cut the
guard message in half — fixed with the M4 `positionAnchor` pattern on both
M7 and M8. Mid-run the owner set a new standing rule: **Playwright runs on
CI, not on this host** — the render pass was finished with one minimal
re-shoot (three frames) and everything since, including the new
`template-editor.spec.ts` (13 cases across three describes, closing
E2E-M7-07's include half on the way), is verified by the CI e2e job only.

**Two determinism defects the first CI round surfaced**, both instances of
known patterns. (1) E2E-M7-07 collects the `.section-head` sequence with a
one-shot `allInnerTexts()`, and the M8 rebuild gave the editor the same
class — during the back transition the outgoing editor still counts as a
visible page, so the collection read both screens at once. The e2e helpers
now treat "back on M7" as *settled* (the editor's scope switch gone from
the visible page), not merely *arrived* — the same one-visible-page lesson
the M7 round taught, applied to a locator that spans pages. (2) The visual
dashboard baseline encodes "Good morning", so the `visual` job was green
only inside the baseline's own time-of-day window — #87 and #88 passed it
by scheduling luck. The `freeze()` stub now pins `Date.prototype.getHours`
beside the existing `randomUUID` stub; `Date.now()` stays untouched (the
#87 finding: freezing it silently breaks the Local Mode write path).

## M9/M10 — the inventory on a tag set (§3.24, 2026-08-16)

Third and fourth screen rebuilds, and the first one that needed schema. The
owner unparked §3.24's tag half on 2026-08-16 ("wir machen es mit tags")
and explicitly allowed a destructive migration ("wir muessen nicht wirklich
migrieren wir alles loeschen und neu aufbauen koennen") — which was then not
needed: migration 022 preserves everything.

**What the decision actually cost is in ADR-014**, and it is one line of
schema: `items.UNIQUE(name, category_id)` becomes `UNIQUE(name)`. With no
category on the item there is no second column to be unique against, so
"Adapter" can no longer exist once under Technik and once under Velo. The
model's answer is one Adapter with two tags — the point of the feature — but
it is a capability removed, and the migration therefore *renames* colliding
rows rather than dropping them: archived trips reach their master items
through `trip_items.source_item_id`, and deleting one to satisfy a
constraint would cut a trip loose from its own history. Two passes, because
two rows with no category could collide before 022 (SQLite treats NULLs as
distinct in a UNIQUE) and the category-name suffix would not separate them.

**The scoping decision that kept this small:** `trip_items.category_name`
did not move. It was always a denormalised snapshot of *one* grouping key
taken at generation time, and one grouping key is still what a trip row
needs — from here it is the primary tag. Renaming it would have rippled
through M4, M12, analytics, export and the spreadsheet import for no
behaviour change at all. Measured before deciding: 221 client references to
"category" across 45 files, of which the master side was seven.

**A defect found while wiring, not by a test that existed:** `cascadeChildren`
in `master.go` announces FK cascades to clients as tombstones, and knew
neither end of `item_tags`. Deleting an item or a tag would have left every
device holding an assignment the server had cascaded away — for a tag that
means the inventory keeps grouping items under a heading that no longer
exists. Both ends now covered, and the two tests fall against the unfixed
build.

**Two false-green tests, one of them mine and one of them the suite's.**

1. `TestPush_ItemTag_RejectsUnknownColumn` asserted "some error". Whitelisting
   a bogus column made the push fail anyway — in the SQL layer, with
   "no such column" — so the test stayed green while the guarantee it names
   (the whitelist gate in front of SQL) was gone. It now asserts
   `errors.Is(err, ErrUnknownColumn)` and falls under exactly that mutation.
   Same fix applied to the `category_id` rejection test. This is the fifth
   consecutive PR to pay for asserting against the nearest readable thing.
2. **The desktop visual baselines under-detect by ~3.5×.** `maxDiffPixelRatio:
   0.002` scales with viewport *area*: 658 px of tolerance at 390×844, but
   2304 px at 1280×900. M9's rebuild changed three lines of empty-state copy
   and added an app-bar icon; the mobile baseline failed at 4075 differing
   pixels and **the desktop one passed**. Worse, `--update-snapshots` only
   rewrites baselines whose comparison failed, so the desktop PNG kept
   depicting the *old* screen — text and all — and would have gone on
   tolerating drift from an already-wrong picture. It was force-regenerated
   by deleting it. The threshold itself is ADR-013's tuning and deliberately
   left alone here; the finding is recorded for the owner to decide, since
   moving to an absolute `maxDiffPixels` would give both viewports the same
   sensitivity at the cost of re-tuning against antialiasing noise.

**Shape of the two screens.** M9 is lean by default and the chip axis
filters wider than the list groups — an item matches a chip when the tag is
anywhere in its set, while the grouping stays on the primary tag, so
filtering by *Sommer* surfaces the swimsuit filed under *Kleidung*. The
FR-24.4 property preference reuses the `HeaderAction` badge the M4 filter
introduced. M10's tag control keeps assigned tags pinned above the matches,
because a filter that can hide what the item already carries is a filter
that loses edits. Its creation mode reports a duplicate name itself rather
than letting the push reject it — a consequence of `UNIQUE(name)` that the
user should meet as a sentence, not as a failed sync.

**Local Mode needed nothing:** its persistence is table-agnostic
(`table/id → row`), so `item_tags` rides the existing path. `internal/portable`
needed nothing either — its `Item.Category` is the trip row's snapshot, not
the master item's category, which was worth checking rather than assuming.

Still open from §3.24: **FR-24.3 lifecycle-aware deletion stays parked** —
a rule about history rather than classification, and nothing in the tag
model depends on it.

## M11 — containers rebuilt on the concept round (FR-10.1–10.3, 2026-08-16)

The fourth screen rebuild, and the first time M11 was rendered at all — the
concept round of 2026-08-08 had rejected the prototype's screen (a flat form
per card, one assign button per container per row) without anything being
built in its place. What runs now: a card per container (name, carrier,
weight bar with the FR-10.3 grades, imbalance line), the M5-grammar
`ContainerSheet` for editing, FR-24.5 placeholder-name creation from the
FAB, and an unassigned bucket of plain rows whose tap opens the same sheet
surface as a container *picker* with each option's current load.

**The defect worth the rebuild: pairing was one-sided.** The old screen
wrote `paired_container_id` only on the tapped container, so the partner
rendered an imbalance against a container that did not consider itself
paired — exactly the half-set state the UI-Spec warns about. The write set
now comes from the pure domain (`pairWrites`/`unpairWrites`/
`releasePartnersOnDelete` in `client/src/domain/containers.ts`): both sides
at once, exclusive (a re-pair releases the old partner first, releases
ordered before sets so a freed partner can never overwrite the new pair),
idempotent, and self-repairing on a legacy one-sided row. `deleteContainer`
releases the surviving partner alongside its existing item unassignment.

**Found on the pixels, not in the stylesheet:** the sheet's carrier section
rendered as a bare heading on a trip without travelers — now absent, not
emptied (the FR-24.5 stance). Rendered against the seeded :3000 instance
through a Vite proxy inside the pinned Playwright container.

**The e2e unit paid for two lessons** (ledger has the detail): Playwright
CSS pierces shadow DOM, so "no button grid" is asserted as zero `ion-select`
per row rather than zero `button`; and a tap during an overlay's dismiss
animation is swallowed by the backdrop, so `closeSheet()` waits for
`ion-modal.show-modal` to be gone. The symmetric-pairing case was
mutation-proved by reverting `pairContainer` to the one-sided write.

Beside the rebuild, `formatWeight` — five identical copies across five
files — moved to `client/src/lib/format.ts`, and the M9/M10 unit's missing
row in the ledger's status table was repaired.

No ADR: every tradeoff here was decided in the 2026-08-08 concept round;
this entry records execution, not decision.

## Browser back with the M5 sheet open (Navigation Concept §7 case 4, 2026-08-16)

Found by the owner on the first eyeball after M11: back on an open item
detail landed on the trip list, skipping the packing list. Root cause: the
sheet *replaces* the trip's history entry (deliberate — a push measurably
mounts a twin packing list, re-verified during this fix), so the entry under
the overlay does not exist and a history pop goes two screens back. The
chevron was already overlay-aware (`backTarget`); the browser's button was
not.

The fix (`client/src/router/overlayBackGuard.ts`) treats a pop leaving a
route with an active `meta.overlayParam` as "close the overlay": the pop
completes, then the overlay parent is pushed. Two rejected mechanics, both
paid for in the attempt: a `beforeEach` redirect renders the wrong screen
under the right URL, because Ionic latches the pending pop direction when a
navigation *confirms* and an aborted pop leaves it stale for the corrective
navigation to consume; and intercepting `popstate` before the router means
forging vue-router's position state. Letting both navigations confirm keeps
Ionic coherent, costs one brief visible bounce through the trip list, and
rebuilds the natural list → trip chain so the next back lands right.

Unit-specified against a memory-history router (pop closes, chain restored,
plain pops untouched, the chevron's replace not intercepted); e2e-covered by
E2E-M5-13, red-proved against the unguarded build. Known accepted gap:
a back during the sheet's enter animation still races Ionic's transition
queue — documented in the concept doc, unreachable by an intentional back.

## M11 joins the visual baselines, and the image gets a platform (2026-08-16)

Owner decision on the question PR #91 left open: M11 is the first screen
outside M4 to get baselines. Two shots (E2E-VIS-06/07), because the screen
renders three things no existing baseline does — a load bar whose fill
carries an FR-10.3 grade colour, the paired/imbalance line, and the card
list — plus the M5 sheet grammar applied to a container, whose load line and
pairing chips exist on no other surface. The load is real rather than
staged: a master item with a weight, quick-added through its suggestion, so
the bar grades something.

**The finding is next to the images, not in them.** Generating them off the
runner surfaced that ADR-013's digest pin was half a pin. A digest fixes
*what is in* the image; on an Apple-Silicon machine docker resolves that
same digest to its arm64 variant, so a baseline recorded on a development
machine would be judged in CI against a rendering it never saw. The image
now carries `--platform linux/amd64`, which is a no-op on the amd64 runner
and emulation everywhere else. Proof rather than argument: with the platform
named, all 16 pre-existing baselines reproduced byte-identically on the Mac
(`git status` showed only the four new PNGs), and only then were the M11
images kept.

**The platform pin was only half of "generatable off the runner."** Naming it
made the *images* comparable; the run still could not start. `make visual`
mounts the worktree, which hands the container the host's `node_modules`, and
rolldown ships a native binary — so vite's preview server died at "Cannot find
module … linux-x64" before a single pixel was rendered. That the baselines
above exist at all is because they were produced in a copy whose dependencies
were installed *inside* the image. `scripts/visual.sh` now does that itself
when the host is not Linux: the container mounts its own tree out of the
user's cache directory and fills it with `npm ci`, which costs ~9 s over
virtiofs — cheap enough that a staleness check would cost more than redoing
it. The first attempt put that tree under `client/`, and `make ci` rejected it
within a minute: a second `node_modules` inside the project is walked by
everything that walks the project, and eslint followed it in. Ignoring it in
one tool would have moved the problem to the next one. CI is untouched, because there the host *is* Linux and the
mount is already right. Proven by running `make visual` unmodified on the Mac:
20/20, the M11 images included.

Two Docker Desktop leftovers cost the detour and are worth naming for the
next machine: a `credsStore: desktop` in `~/.docker/config.json` pointing at
an uninstalled helper, which fails every pull with a credentials error, and
a stale `vite preview` from a deleted worktree squatting on port 4173, which
Playwright's `reuseExistingServer` could not reuse because it answered 404.

## What "covered by e2e" was not covering (2026-08-16)

Asked after the M11 eyeball whether the screen was fully covered, and the
honest answer was no — in a way worth recording, because none of the three
gaps was a missing test id. All six M11 ids were implemented and green.

1. **A spec sentence is a list of promises.** E2E-M11-05's text said pairing
   is released "when cleared **or when one side is deleted**". Only the first
   half was asserted; the second lived as a domain unit
   (`releasePartnersOnDelete`) and was marked implemented anyway. It now sits
   in E2E-M11-04, because that is the only place it is *visible*: with two
   empty containers a released and an un-released survivor render identically,
   so an assertion there would have passed whatever the code did. Under a
   skew, a survivor still pointing at a deleted partner goes on reporting
   100 % imbalance — that is the observable, and it is mutation-proved.
2. **A spec sentence can also over-claim the implementation.** E2E-M11-03
   promised assigning items "into/between containers". The screen has no
   between: an assigned item leaves the bucket and the cards do not list their
   contents. Re-assignment lives in M5's container control. The spec sentence
   was the defect, not a missing test.
3. **Getting to the screen was nobody's case.** The M11 unit reaches M11 in
   its own `beforeEach`-style helper, which is not the same as covering the
   navigation — the working agreement puts that in `global-nav.spec.ts` after
   four defects that both green screen suites missed. E2E-G9-11 now owns the
   luggage button and the way back.

**The mutation proof itself nearly lied.** The first attempt edited the
orchestrator, re-ran the case, and watched it stay green — which reads as "the
assertion is weak" and is in fact "Playwright serves `dist/`, and nobody
rebuilt". Test-side edits need no rebuild; production-side edits always do.
With the rebuild the case is red without the release and green with it.

All three gaps are now checks in `.claude/skills/pr-review/SKILL.md` §5:
read the spec's case text against the test body sentence by sentence, read it
against the *screen* too, cover the global patterns rather than only the
screen, and mutation-prove the case that owns the PR's headline defect —
rebuilding between the two runs.

## M12 — analytics rebuilt on the concept round (FR-8.1/8.2/14.3, 2026-08-16)

The last dimension of the 2026-08-08 concept round to reach code. What the
round found, and what the rebuild does about it:

1. **The slice tap now filters, not just groups.** `analyzeTrip` keys every
   slice by exactly what M4's facets filter on — traveler id,
   `category_name`, container id, `''` for the absence bucket — so the tap
   is `setStoredFacet` (new, beside `setStoredGroupBy` in
   `usePackingFilter`, same ADR-012 shape: storage synchronously **and**
   the still-mounted M4's live ref) plus the grouping, and the reader lands
   on the number they tapped. Other facets are cleared deliberately: one
   number was tapped, so one facet is in force.
2. **The `undefined` bucket cannot recur, by construction.** The
   prototype's per-person entries carried no top-level traveler/quantity
   and needed a shares expansion; the client's data model already is the
   expansion — one row per traveler instance, each with its own quantity
   and packed count. The unit test pins the shape anyway
   (`analytics.spec.ts`: one contribution per traveler by Person, one
   summed bucket by category, equal totals).
3. **Unweighted rows leave the bars entirely** (a zero-width bar reads as
   "weighs nothing") and are counted beside the chart; their value still
   counts. Trend is **packed** weight per year — an archived trip's plan
   is an intention, the packed count is the record — and the flagged list
   is series-scoped, both matching the prototype.
4. **G-13's headline figure got its class** (`.jp-figure`, display face on
   the two KPI boxes) — written now because M12 is its first rendered
   user, per the rule that a role class waits for a pixel to check it.

Sequencing note: E2E-M12-03's positive half (trend columns on screen) is
blocked on a product gap found while writing the case — nothing user-facing
can move a trip to *active*, so nothing can archive one; the ledger records
it and the North-Star phase owns the transition. i18n rode along: M12 is
t()-localized in both catalogues, including the analytics keys added here.

Remaining rebuild after this: M14.

## M14 — review assistant rebuilt on the concept round (FR-9.2/27.11, 2026-08-16)

The last screen rebuild. The 2026-08-08 concept round changed both halves
of the old M14 (2026-07 card stack writing to "the dominant template"), and
the rebuild follows the prototype:

1. **A list, not a card stack.** Every proposal at once under an
   "Offen · N" head; applied and skipped rows stay in place, dimmed and
   chip-marked, and an "Übernommen · N" footer counts what was written —
   the same honesty stance FR-25.11a takes on the packing list. The row
   state lives in a merge of live proposals and session decisions
   (`watchEffect`), so a proposal applied elsewhere disappears while a row
   decided here survives its own recompute.
2. **Proposals target groups** (`domain/review.ts` rewritten): *ungenutzt*
   defaults to the group the row's provenance names, *fehlte* to the group
   that contributed most of the trip; a row whose provenance is a
   Ferien-Vorlage's own position yields nothing — that structure feedback
   is M21's job (FR-27.5). The per-row picker offers groups only, and for
   an *unused* row only groups that carry the item (`retargetGroups`) —
   zeroing a position that does not exist would apply as a silent no-op;
   recorded in the UI-Spec as a decision. Apply takes the picker's group,
   not the default (`applyReviewProposal(proposal, groupId)`), and the
   FR-27.4 blast radius is stated per row from `planningTripsUsing` on
   the *selected* group, live.
3. **"Nie mehr fragen" is pair-scoped** — `dismissalKey(itemRef, groupId)`
   against the row's current target; the same item still surfaces for a
   different group. Archiving a flag-less trip now skips the assistant
   with the specified toast instead of presenting an empty screen (M4's
   `onArchive`).
4. **Coverage splits three ways, honestly.** Domain arithmetic in
   `domain/__tests__/review.spec.ts` (21 cases); the list semantics in a
   *component* test (`views/trips/__tests__/ReviewPage.spec.ts`, first of
   its kind for a page) because every positive e2e case needs an FR-9.1
   flag and the only flag writer gates on an *active* trip — the same
   planning→active product gap the M12 unit recorded; the e2e unit
   (`e2e/review.spec.ts`) pins the reachable surface (framed empty state,
   G-9 back) and the ledger names the owed cases for when the transition
   ships. The FR-27.4 applied-change log entry stays with the §3.27
   refresh package, same as M8's E2E-M8-09 note.

The test-spec M14 section was reconciled in the same PR (it still described
the card stack, targeted templates, and carried a duplicate case id — the
no-flags case is E2E-M14-06 now). i18n rode along: M14 is t()-localized in
both catalogues.

Because no app path can produce a populated M14 at all (not even in dev —
the sample trip's rows carry no provenance and FR-27.10's group add is part
of the unbuilt §3.27 package), the dev gallery grew a fixture button
(`src/dev/reviewFixture.ts`): it seeds in-memory rows covering both proposal
kinds, the retarget picker and the blast radius, then opens the *real*
route. State only — a reload clears it — and DEV-only like the gallery
itself, so it is absent from the production bundle.

With this, every screen rebuild from the 2026-08-14 plan is code. What the
plan still owes is in CLAUDE.md's "Not built yet": the §3.27 client package
(instantiate expansion, FR-27.4 refresh, M21), the i18n remainder, the
Playwright backlog — and M14, like M12, is unverifiable end-to-end until
something user-facing moves a trip to *active*.

## §3.27 generation: composed templates actually reach the packing list (2026-08-16, PR pending)

The first half of "Not built yet" item 2. Everything M7 and M8 could build
since 2026-08-15 was inert at the one moment that matters: `instantiate.ts`
filtered template positions by the templates it was *handed*, so a trip
generated from a Ferien-Vorlage carried only that Vorlage's own positions and
silently dropped every group attached to it. The machinery existed on both
ends — `template_includes` in migration 016, `resolveTemplate` for M7's row
count and M8's footer — with nothing joining them.

Four things, in the order they were built:

1. **Include expansion at generation (FR-27.2).** `GenerationInput` now takes
   the template *catalogue* plus the picked ids, rather than a pre-filtered
   list: the caller cannot know a Vorlage's composition, so generation
   resolves it. Expansion is one level, matching `resolveTemplate` and the
   two-level hierarchy FR-27.1 fixed — following an included group's own
   includes would quietly reintroduce the depth that FR rejected, and with it
   the cycle it cannot have. Rows keep the **contributing group** as
   `source_template_id`, which is what FR-27.5 and FR-27.11 read back a year
   later, and `MergedOverlap` carries its contributing templates so the merge
   can be named instead of counted. A template both picked directly and
   reached through an include contributes once — without that guard a `sum`
   position merges with itself and doubles.
2. **Task materialisation (FR-27.7).** Generated rows carry the preparation
   tasks of the position(s) that produced them, and `createTripFromWizard`
   writes each as an ordinary FR-7.3 todo. No new flag: an open prep todo
   already blocks "done", so M4, M5 and M1 pick it up unchanged. A merged item
   keeps the **union** of its contributors' tasks (dropping the second group's
   task would lose exactly the knowledge the feature is for) with identical
   text collapsed to one todo, and each todo is enqueued behind the
   `trip_items` row it references — the comments row carries that id as a
   foreign key. The `'current-user'` actor placeholder became a named constant
   with the invariant-3 reasoning on it; it had been a literal in three files.
3. **M3 step 3, scope-shaped (FR-27.6).** Two sections mirroring M7. Every row
   counts what picking it *resolves* to rather than its own positions — a
   Vorlage frequently owns none and is nothing but its groups — and a group a
   picked Vorlage already brings says so on the row instead of letting a second
   tap look like it added something (the FR-25.13 duplicate-report rule). The
   footer names each merge with its groups and states the inherited task count.
   The merge sentence is **M8's, reused**: same fact about the same
   composition, and two wordings would have drifted apart. The section is
   t()-localized; the rest of the wizard stays with the i18n backlog item.
4. **An e2e unit that immediately paid for itself** (`e2e/trip-composition.spec.ts`,
   E2E-M3-11/13, composition built through M7/M8 per spec §2.4). It reported
   the same merge as „in Wildlife & Makro" on WebKit and „in Makro & Wildlife"
   on Chromium, from identical data.

That last one was **not a flake, and a retry would have buried it.**
`template_includes` has no sort column, so the rows arrive in whatever order
the sync or IndexedDB produced — and both `resolveTemplate` and generation read
that order straight through. It decides which group is a merged item's *first
contributor*, hence whose attributes and `source_template_id` the generated row
carries: two devices could have disagreed about where a packed item came from.
`includedTemplatesOf` now derives the order (group name, include id as
tie-break) for both callers, and the superseded case asserting "the order they
were included" was rewritten rather than adjusted — that order does not exist
in the data. **Standing lesson, one more time in a different costume: the
rendered run is the only place some defects exist.** The component tests were
green, the domain suite was green, and both would have stayed green forever.

Two smaller repairs rode along. The M7/M8 seeding helpers moved into
`e2e/fixtures.ts` rather than being copied a third time (`visiblePage` is still
duplicated in four other specs — a separate cleanup). And the traceability had
grown a collision: the test spec used E2E-M3-11/12/13 for the §3.27 cases while
three unrelated step-1 cases had taken the same ids in code. The code's three
are renumbered E2E-M3-14/15/16, and the spec now carries entries for them,
which it never had.

What item 2 still owes: the FR-27.4 planning-trip refresh diff (with its M2
applied-changes chip, which also unblocks E2E-M8-09/M8-11's log half and
M14-04's), the M21 screen (FR-27.5), portable YAML for includes and tasks
(FR-18.2), FR-27.3's single-item add in step 3, and FR-27.10's whole-group add
to a running trip — that last one owes task materialisation on its rows too,
which this PR deliberately did not build into `addCompanionItems`: a companion
comes from a dependency, not from a template position, so it has no tasks.

## FR-27.12: a group stops being a name with a number (2026-08-16, PR pending)

Owner question after the §3.27 generation PR: „die Gruppe, bspw. Makro
Fotografie, sollte man anschauen können. haben wir das spezifiziert?" — no, and
the gap was wider than one screen. A group announced *how many* items it held
and never *which*, in all three places it is offered: M3 step 3, M8's Gruppen
section and M14's target picker. The only answer was the M8 editor, which from
the wizard costs the draft and from M14 the review pass.

**Decided on rendered variants, not on argument**
(`dev-docs/UI_Concept_GroupPeek_variants.html`, generated from the prototype's
own stylesheet so the forms could not be judged on differing paint): a peek
sheet (A), an unfolding row (B), and a row that names its first items with no
interaction at all (C). The owner chose **A and C together**, which is what
shipped.

What decided it against B — the nicest of the three on M3 — was that the same
question is asked on three surfaces with three shapes: M8's picker is a chip
row and M14's target a select, and neither has a row to unfold. One form that
answers everywhere beat the best form for one screen.

Three things worth keeping:

1. **The sheet is a look, not an editor**, and a test pins that its only button
   closes it. Editing a group has one home (M8); a second editing surface is a
   second place for the same rule to drift.
2. **The list is the resolved one**, so a Ferien-Vorlage peeks through its
   composition and a shared camera appears once — and it is ordered by item
   name, for exactly the reason `includedTemplatesOf` is ordered: positions
   arrive in sync order, and a list somebody scans for „ist das Stativ dabei?"
   must not answer differently on two devices.
3. **Two names per row, not three** — decided on pixels: at 390 px three German
   item names wrap, turning a scannable row into a four-line block. The count
   („+2") is the honest half of a summary that cannot answer the precise
   question.

`SheetModal` collects the bottom-sheet chrome that four screens each carried a
copy of; the peek would have been the fifth. The four are untouched — moving
them is mechanical and belongs in its own change.

E2E-M3-11 needed tightening in the same PR: it checked scope separation with a
substring, and a Vorlage's row now legitimately contains „Makro-Objektiv". An
assertion that passed for the wrong reason failed the moment the screen said
more than it used to.

## The dev seed grows a master partition (2026-08-16)

Owner, wanting to test the freshly merged §3.27 work: „kannst du zu Testzwecken
Items und Gruppen zum initialen Datenstand hinzufügen. Das soll auch künftig so
sein als Standard."

`sampleTrip.ts` seeded a trip and nothing else, which was enough while the trip
screens were the ones being built. Since §3.27 it is not: a trip carries its own
rows and teaches the master partition nothing, so M7, M8, M3 step 3 and the
FR-27.12 peek all opened empty on a fresh device and testing any of them started
with twenty minutes of typing.

`sampleMaster.ts` fills that gap and the M2 dev button now seeds both — master
first, then the trip. **Standing rule from here on: a new master-data feature
extends this seed.** That is the "als Standard" half of the request, and it is
recorded in CLAUDE.md where a dev looks rather than only here.

Same two constraints as the trip seed, for the same reasons. It is **dev-only**
behind `import.meta.env.DEV`, so module and trigger drop out of a production
build — this is not Demo Mode returning; that was a *product* surface and stays
removed (Addendum v2.10). And it writes through the **orchestrator's own
actions**, so every row it creates is one a user could have created, rather than
inventing a second seeding path that would be the one nobody notices breaking.

The data is picked for what is otherwise tedious to reach rather than for
volume: two groups **sharing the camera**, so the FR-27.2 merge has something to
name in both M3's footer and M8's resolution footer; a Vorlage with **own
positions beside its two groups**, so the resolved count differs from either
half; an FR-27.7 task on a shared position, so a generated trip starts with a
real prep todo; and a third group left **deliberately unincluded**, so M8's
picker and M3's *Zusätzliche Gruppen* both have an offer. Six tests pin those
properties — not the contents — because a seed that quietly stops producing a
resolvable composition wastes the session that discovers it.

**Still open, deliberately:** the sample *trip* is still built through the M18
portable-import path, so its rows carry no `source_template_id`. Generating it
from the seeded Vorlage instead would give it provenance and finally make M14
reachable with real proposals — but it changes what the trip seed is, so it is a
decision rather than a side effect of this change.

## Plain HTTP could not write at all (2026-08-16)

Found by the owner testing the fresh §3.27 work from an iPad on
`http://192.168.1.35:3000`: the dev seed button did nothing, then „New item
anlegen geht nicht". The cause was one line, and it was everywhere —
`crypto.randomUUID()` is defined **only in a secure context**, and all 24 id
sites in `useMutations.ts` called it directly. On a self-hosted instance served
over plain HTTP on a LAN — a first-class deployment for this product — creating
an item, a trip, a tag or a template threw and the screen did nothing.

`lib/ids.ts` is now the single id source: `randomUUID` where the platform has
it, otherwise the same RFC 4122 v4 built from `crypto.getRandomValues`, which
carries no secure-context restriction. It **refuses** rather than falling back
to `Math.random` if neither exists: these ids are primary keys other devices
merge against (NFR-4.2a), and a collision there is silent data loss where a
thrown error is at least visible.

Three things this cost, worth keeping:

1. **The suite was green in the one environment where the bug cannot exist.**
   Playwright serves from `localhost`, which is a secure context. No amount of
   coverage in that shape would ever have found it. `e2e/insecure-context.spec.ts`
   removes `randomUUID` before boot and drives the four real creation paths;
   E2E-NFR-SEC-01 asserts the premise so the unit cannot silently stop testing
   anything. Red-proved by reverting the fix and rebuilding.
2. **A missing signal cost more than the bug.** The dev seed button was an async
   handler that only navigated on success, so a throw was indistinguishable
   from a dead control — the owner reasonably suspected the button, twice. Once
   it reported the failure, the message named the cause in one line. The
   handler now reports both outcomes, and the seeding moved to
   `dev/sampleData.ts` so the outcome has one shape and one place to fail.
3. **A guard, not a memory.** A unit test rejects `crypto.randomUUID` anywhere
   in `client/src` outside `lib/ids.ts` — the same idea as the no-raw-colour
   rule, because the next call would be invisible on localhost again.

Ridealong from the same session: the Local Mode sync indicator set no icon size
and inherited 13 px beside its 25 px neighbours, where a phone outline reads as
a missing-glyph box („links vom Zahnrad siehts kaputt aus"). It is on
`--jp-icon-md` now, which is where invariant 9 says icon sizes come from.

## The dev-only surfaces were not dev-only (2026-08-16)

Found reviewing PR #98, by checking a claim instead of reading it. `sampleTrip.ts`
said — and `sampleMaster.ts` copied, and the addendum and CLAUDE.md repeated —
that the seed "drops out of a production build entirely". It did not. Three
chunks (`sampleData`, `sampleMaster`, `sampleTrip`) sat in `client/dist/assets`
of every release, and the same was true of the M14 fixture.

The mistake is worth naming precisely, because it looks correct: the guard was
`v-if="isDev"` **on the button**, while the `import('@/dev/sampleTrip')` inside
the handler stayed a live code path. A `v-if` hides a surface; only a
compile-time-false branch *around the import* removes the code, which is the
shape `router/index.ts` has always used for the gallery route. Moving the guard
to `if (!import.meta.env.DEV) return` prunes all three.

**Nobody could reach it, which is exactly why nobody noticed.** A hidden
surface and an absent one are indistinguishable from the outside; only the
bundle can tell them apart. So the fix ships with `scripts/dev-code-gate.mjs`
(`make client`, CI client job): it fails the build when a dev chunk name or a
piece of seed *data* appears in `dist`.

Two things that gate taught while being written, both kept in its comments:

1. **The first fingerprint was wrong in an instructive way.** „Makro Fotografie"
   looked like seed data and is also example copy in the i18n catalogue — a
   guard that fires on shipping product text is worse than no guard. The marks
   are now strings only the seeds contain („Fotoreise (Beispiel)", „Kartusche
   prüfen"), and the gate was proved by planting one in a built chunk.
2. **The claim is now stated as narrowly as it is true.** The *modules* are
   gone; the button's `v-if` branch still leaves its label in the page chunk as
   dead string. That is an inert branch of a few bytes, not a reachable
   surface, and the comments say so rather than rounding up to "entirely".

## FR-27.14: the footer stops being the whole answer (2026-08-17)

M8 said „6 Artikel · 2 Gruppen + 1 eigene Position" and left it there. The
number answers *how many* and never *what*, so from the editor of a Ferien-
Vorlage — the thing whose entire purpose is to produce a packing list — there
was no way to see what a trip would get. Owner asked for it with a mockup, then
picked variant A from the rendered round.

**What it cost to build was small, and deliberately so:** the FR-27.12 peek
sheet already resolves a Vorlage through its composition, so this added an entry
point and the information a bare list was missing. The footer became a button;
`resolvedLines` grew from `{name, quantity}` to carry what a count cannot say.

Three marks, each defending a specific lie a number would tell:

* **nur 1×** — the line exists once because a merge collapsed it, not because
  one template asked once (FR-27.2).
* **pro Person** — a per-person position fans out at generation over travelers
  the *trip* knows about; a template printing „3×" would be guessing (FR-25.8).
* **the procurement mode and mit Bedingung** — at template level nothing is
  excluded yet, so a conditional row must say so rather than appearing as a
  promise the trip may break (FR-15.2).

**One rule came out of a failing test rather than the plan.** Provenance was
going to be shown on every line; peeking a *group* then reads „aus Makro
Fotografie" on every row of Makro Fotografie. The rule is narrower: a template
that includes nothing has only one possible source, so the sheet stays quiet —
provenance is information only once a composition can differ. The same sheet
now serves both cases without a flag.

Two smaller things: the item name got its own element, because the tests were
otherwise asserting against concatenated strings where marks and source run
together (`Kamera once onlyfrom Makro…`) — a test reaching for the nearest
readable thing again, and the fix is an anchor rather than a cleverer regex.
And both M8 describes now declare `test.slow()`: the fifth composition-building
case pushed WebKit past the 30 s budget and four cases failed, three of them
untouched — the M3 unit's lesson, arriving a second time in the same week.

## The ＋ answers where it is (2026-08-17)

Owner, testing: the ＋ should appear only where something can be added, and on
M7 it should follow the context — standing on *Gruppen*, it should create a
group rather than ask.

**M7's chooser now asks only where the question is real.** The scope segment
already states what you are looking at, so a single-scope tab answers it and
the sheet opens on the name, titled with the scope it is about to create. Only
*Alle* still asks. The rule lives in `domain/templates.ts` as
`scopeForNewTemplate`, returning **null for "ask" rather than a default**: the
two kinds are not interchangeable (FR-27.1), and a wrong guess is not
recoverable once something includes the group.

That placement was not the first attempt. The rule started as a component test
against M7's modal, which is teleported and therefore invisible to the mount —
the failing test was the signal that the decision did not belong in the view.
Moved into the domain it is five lines and two cases; the flow itself is
covered where it belongs, in e2e.

**The ＋ steps aside while the quick-add is open** (M4 and M8). It would open
what is already open, and the composer wants the room.

**One regression nearly shipped inside that fix.** Hiding the whole `IonFab`
also removes `#m4-fab-anchor` / `#m8-fab-anchor` — the elements both screens
position their toasts against — which would have dropped every toast behind the
tab bar, the exact defect fixed on 2026-08-15. The guard sits on the *button*
instead, and E2E-M8-17 asserts the container survives, so the next person to
tidy this cannot quietly reintroduce it.

**The durable fix is one level further, and is not made here** (raised by the
session working on #101, 2026-08-17): the anchor is *infrastructure that
happens to live inside the FAB*. As its own always-present element it could not
be removed by a change to the button at all, and the coupling that produced
this near-miss would be gone rather than guarded. Worth doing when a third
screen needs an anchored toast; for one guarded pair it is more machinery than
the problem.

Not found, and worth recording because it was the owner's example: the item
editor (M10) has **no** FAB at 390 px or at 1024 px, and none of the six FABs
in the client sits on a screen without an add action. The misfire was the
composer case above.

**The hiding broke a real flow, and CI caught what the hand check could not.**
Eight visual baselines and part of the e2e suite failed on the first run: the
specs add several items in a loop and tap the ＋ each time, but the composer
*stays open* after an add (FR-25.13) — so the second iteration waited forever
for a button that had just, correctly, disappeared. Adding three things in a
row is not a test artefact; it is the flow. My manual check added one item and
was blind to it by construction.

The production behaviour stands; the thirteen call sites went through one
guarded `openQuickAdd()` in `fixtures.ts`, which taps the ＋ only when the
composer is closed — the guard `addPosition` has had since the M8 rebuild,
now shared instead of copied.

## The sheet header's two round controls (2026-08-16, FR-25.15 / G-14)

Owner-flagged from a rendered phone: on M5's item detail the green save ✓ sat
visibly higher than the ✕ beside it. Measured rather than guessed — 26 px
against 34 px, both hung from the header's `flex-start` edge, which puts the
smaller circle's centre 4 px above the larger one's. Nothing in either
stylesheet is wrong on its own; the pair is.

The fix names the diameter once, `--jp-control-round` in `surfaces.css`, and
the indicator and all three sheet ✕ buttons (M5, M8's position sheet, M11's
container sheet) resolve through it. A control's size is a shape decision, so
it belongs in the shape table with the radii — restating it per sheet is how
the two got to disagree in the first place. The glyph moved one step up the
type scale with the circle: at 13 px inside a 34 px disc it read lighter than
the ✕, which takes its size from the icon table rather than the text scale.

E2E-M5-14 pins it, and cost one lesson worth writing down: the first draft
called `boundingBox()` twice and failed **on the fixed build** under parallel
load, reporting a 5 px difference between two boxes that are aligned — the two
calls land in different frames of the sheet's enter animation. Reading both
rects inside one `evaluate` makes the shared transform cancel out, so the
comparison is exact regardless of when it runs. Settling the animation first
would have been the weaker fix: it waits and hopes, this one cannot be wrong.

The visual baselines did not move: the M11 sheet's changed disc is ~380 px of
a 329 000 px frame, under ADR-013's `maxDiffPixelRatio`. A tolerance that
absorbs an intended change also absorbs an unintended one — which is why the
geometry has its own assertion rather than relying on the screenshots.

## §3.28: the packing row gets a mark, decided on pixels (2026-08-17, spec only)

Owner question: a pack item can carry a photo — would emojis, or an icon from a
library, not make more sense? With three conditions attached: recognisable per
icon, searchable the way WhatsApp is, and ideally *suggested*.

The answer is not either/or, and saying so was the first useful move: the photo
(§3.22) answers **which** jacket, and it exists on a handful of rows because
nobody photographs forty items. What a forty-row list lacks is a **mark** — the
always-affordable symbol that says *what kind of thing this is* before the name
is read. So the photo stays and the mark is added beside it, with a ladder
deciding which is shown (FR-28.4).

**Decided by rendering, not by arguing.** Four marks, one fifteen-row list, one
frame: emoji, an icon library, photo-first, and a coloured initial as the honest
null variant. Two things only the render could settle:

1. **The icon library is the option that fits our own rules and it still lost.**
   Monochrome strokes in a role colour satisfy G-11/G-13/G-14 without an
   exception, and at 34 px sunscreen, bottle and water bottle are the same
   picture. Its substitute rate was also the **higher** of the two — 7 of 15
   against emoji's 6 — because libraries carry travel gear and not household
   detail. That margin is one row and proves nothing by itself; the
   distinguishability does. The argument favoured it; the pixels did not.
2. **The null variant is worse than nothing.** A coloured initial repeats, in a
   circle, the name standing next to it. That is what made "no mark" an
   acceptable and *normal* row state in FR-28.1 rather than a gap to fill.

The list was seeded on purpose with a row nothing fits (*Trekkingstöcke*) and
several near-misses (*Fleecepullover*, *Schlafsack*, *Wasserflasche* — Unicode
has no water bottle): a symbol system is decided in its tail, not in its head.

Counting those beat a claim I had already written down: the first draft of this
entry said 4 substitutes against 6. Counting the rendered data said **6 against
7**, which keeps the conclusion and removes the margin it looked like it had.

**The suggestion is cheap and was built to prove it.** The variant page carries
a working picker: one keyword index (de + en), scored against the item name.
`Tarnzelt → ⛺`, `Kaffeekanne → ☕`, `Wasserflasche → 🧴🥤💧`. One correction came
out of running it: German compounds need splitting, but a suffix may only become
a token when the index already knows it — the first version happily tokenised
„Zahnbürste" into *ürste*, and the suggestion line read like noise. That rule is
in FR-28.3 and is a test name, not a comment.

Two costs are accepted in writing rather than discovered later: the mark is the
one surface whose colours do not come from the token table (G-15 confines it to
content — never a button, a status or a progress), and a self-hosted subsetted
emoji face rewrites every visual baseline when it lands (ADR-013), which the
implementing PR does once, deliberately.

**No ADR here.** The tradeoff is real and an ADR is owed — but `adr/README.md`
is explicit that one without code is a plan, so it ships with the build, using
this round as its evidence.

## G-2's detail, and the Local Mode backup behind it (2026-08-17, FR-19.6/NFR-4.11)

Owner question, from the running instance: *„was bedeutet das Icon zwischen Lupe
und Zahnrad?"* — the phone glyph. That the question had to be asked is the
defect: G-2 has specified a detail behind the glyph since UI-Spec v1.0, and the
app had none. `onSyncTap` pushed `/trips/:id/conflicts` when a trip route
happened to be open and returned silently everywhere else, which is most of the
app and all of Local Mode.

**The sheet splits by run mode, not by glyph state.** Server Mode explains the
connection, counts the queue and leads to the conflict log; Local Mode explains
that no server exists, reports storage against quota with the NFR-4.11 eviction
warning, and offers the backup. Local Mode never offers the conflict log — one
writer produces none, and an entry that describes a mode you are not in is
worse than no entry. The split is on `mode` rather than on `state` because an
in-flight Local Mode write reports as *syncing* (FR-19.2) and must still get
the storage story.

**The one-tap export had to become a whole-device backup.** M17 already exported
one trip or one template at a time; NFR-4.11 calls the export *the* backup, and
a backup that asks the user to remember each trip and template one by one is not
one anybody performs. So the file is every trip and every template as one
multi-document YAML — which immediately owed the other half: **our own importer
could not read it back**. A backup nobody can restore is not a backup, so M18
grew a restore branch (list the documents, import them together) and
`commitPortableRestore` matches **per document as it goes**, never once up
front: a backup names the same master item in a template and in every trip that
uses it, and matching against the pre-restore inventory would have created one
copy per mention. The test that pins that is the one that would otherwise have
shipped a duplicate inventory on every restore.

**Two defects only the rendered pixel showed, both in the same sheet.**

1. *The last line sat under the tab bar.* An auto-height Ionic sheet is measured
   once at presentation, and the storage section arrived a tick later because
   `navigator.storage.estimate()` is async. The fix is ordering — read the facts,
   then open — not padding. Found by screenshotting; invisible in the markup and
   invisible to the component test, which has no modal.
2. *„Last backup -1 days ago."* The sheet captures `now` when it opens, the
   stamp is written when the user taps, so the stamp is the later of the two and
   `Math.floor` of a small negative is −1. `reminderState` clamps at zero now,
   which also covers a device whose clock moved back. **The e2e case caught this,
   not the component test** — the component test injects both clocks and would
   have had to be written by someone already suspecting the bug.

A third one worth recording as method: the first screenshots looked like the tab
bar was painting over the sheet. It was not — the shot was taken mid-animation,
40 px of translate from what a user sees. The screenshot driver now waits for the
modal wrapper's bottom to reach the viewport bottom. A rendered check is only
evidence once the render has settled.

Localization came along for the ride: the glyph's tooltip was four English
literals beside four catalogue keys nobody used.

## FR-2.6 variant A: the review step reviews (2026-08-17)

Owner picked A from the rendered round: the decisions live on the row.

Step 4 changed exactly one thing before this — the amount. Everything else
waited until the trip existed, so the wizard's last step asked for approval of
a list it would not let you correct.

**What A means concretely, and where its edges are:**

* **✕ drops a row as FR-5.5 *skipped*, never as a deletion.** The row stays,
  struck through and reversible, and reaches the trip with quantity 0 — which
  `addGeneratedTripItem` already turns into `skipped`. Deleting instead would
  make this one gesture behave differently here than everywhere else in the
  product, and would leave the next trip nothing to learn from.
* **The marks are labels, not controls.** *pro Person* and the procurement mode
  explain what the row already is. Turning them into editors would put a second
  procurement-and-assignment surface beside M5, which is the thing FR-2.6
  argues against in the first place.
* **The create button counts what is actually coming.** A number that still
  includes the row you just dropped is worse than no number.
* **The mockup's add line is not built here.** Adding single items to a trip
  being created is FR-27.3's, and it owns that in step 3; a second path in
  step 4 would leave two mechanisms for one act.

Reusing `quantityOverrides` made the whole thing small: dropping is an override
of 0, restoring is deleting the override, and *dropped* is derived rather than
stored — so the state that decides the row's fate is the one already travelling
to `createTripFromWizard`, with nothing to keep in sync.

Two of my own test assumptions were wrong rather than the code, both worth the
minute they cost: with no travelers a per-person position fans out over nobody
and produces **no row at all** (the walk now adds one), and the expected item
count was guessed instead of derived from the list under test.

## Coverage audit of 2026-08-17's merged PRs — the two gaps it found

Not a feature. The day's four merged PRs (#99 sheet-header pair, #101 G-2
detail + backup, #102 FR-27.14 peek entry + the scope-following ＋, #103 FR-2.6
review step) were re-read against what actually drives them, unit and e2e. Two
had a hole, and both holes were of the same kind: the *reading* half of a
behaviour whose *writing* half was covered.

**#101 — the backup could be written and never read.** `commitPortableRestore`
had unit cases and E2E-G2-03 asserted the download, but nothing walked M18's
restore branch, which is the screen a user restores through. In Local Mode the
file is the only copy there is, so this was the gap worth closing first.
`e2e/backup-restore.spec.ts` now takes a real backup through the G-2 detail and
restores it into a second browser context — a device that has never seen the
data, because restoring onto the device that wrote the file would pass against
an importer that does nothing at all.

It found a defect on its first run: `commitRestore` replaced to `/trips`, which
is **not a route** (only `/trips/new` and `/trips/:tripId` are). The restore
happened, the router matched nothing, and the user was left looking at the
import form with the file still pasted into it — no trips, no message, no sign
anything had been imported. Fixed to `/tabs/trips`. The first draft of the case
did not see it either: `getByText('Samedan 2026')` was green *because* the
pasted YAML was on screen, so the assertion moved onto `trip-row-<name>`. A
test that reads back the input it just filled proves nothing.

A second observation from that run is left as an owner question rather than
designed around: a restored trip is *planning*, M2 opens on *Active*, so a
restore currently ends on a screen that says "No active trips". The case selects
the Planned segment and says why.

**#102 — the ＋ steps aside on M8, and nobody asked M4.** FR-25.13a's amendment
landed in both screens' templates and got one case (E2E-M8-17). The shared
`openQuickAdd` fixture tolerates the button being there or not — it has to, it
is a helper — so it would have stayed green either way. E2E-M4-36 asserts M4's
half, including that `#m4-fab-anchor` survives (the FR-25.2 snackbar hangs off
it) and that adding does not bring the button back, since the composer stays
open.

Both new cases were red-proved against a mutated build — the `v-if` removed,
and `preview()` filtering unreadable documents out — and both pass on Chromium
and WebKit. Two `data-testid`s were added to production markup for them
(`portable-restore-row`, `m2-portable-import`), which is the testability-by-
design principle #93 wrote down: an assertion should name the thing it means.

**Judged covered, no work owed:** #103 (unit cases for drop/restore/count/marks
plus E2E-M3-18), #102's other halves (E2E-M8-16, E2E-M7-09,
`GroupPeekSheet.spec.ts`, the `templates.ts` domain cases) and #99 (E2E-M5-14
measures the rendered pair; the token it introduced cannot regress without
somebody re-typing a raw px). #101's Server Mode half of the sheet stays
component-test-only, as its own ledger entry already states.

### The review step that let both gaps through, and what changed in it

Worth recording beside the gaps themselves, because the fix is process rather
than code. `/pr-review` **ran** on #101 and #102 and marked client coverage ✅
on both. Reading the two verdicts back:

* #101's own summary says *"M18 now reads such a file"* — and no section of
  that review mentions `PortableImportPage.vue`, which the same diff changed.
* #102's verdict is entirely about FR-27.14. The diff also amended FR-25.13a
  across two screens; that half appears nowhere in the review.
* #103 got no `/pr-review` at all.

Both reviews checked the feature named in the **title**. A PR routinely carries
two, and the second one is the one that ships untested — which is exactly what
happened twice in one day. Being more careful is not a fix for that; a step that
cannot be answered from the tests that exist is.

So the skill gained **§4.0**: before any other coverage check, build a table with
one row per changed production file naming the test that drives *that file's
changed lines*, and **post the table in the verdict** rather than a claim that it
was built. A row that cannot be filled is a finding regardless of the title.
Three rules came out of the same two misses and sit with it: a write half and a
read half are two behaviours (and for the only copy of a user's data, the read
half is the more important one); one rule written into N templates needs N cases;
and a shared test helper that tolerates both states is never the assertion.
`CLAUDE.md` now also says a missing verdict comment is itself a blocker.

### The restore landing (owner call, 2026-08-17)

The audit above left one thing as a question rather than deciding it: a restore
landed on M2, which opens on *Active*, while every imported trip is `planning`
(FR-18.4) — so a restore that had just written the user's whole device back
ended on the words "No active trips". Owner's answer: land on **Planned**.

Built as a route query rather than a flag on the page: `client/src/views/trips/
tripFilter.ts` names the three segments once and parses a query value, M2 honours
it through a `watch` and M18 sets it. Three details are deliberate.

* **A watch, not a read at setup.** Ionic keeps M2 mounted, so a restore arriving
  while the page is already alive would otherwise land on whatever segment was
  last tapped.
* **An unknown or absent value changes nothing.** `parseTripFilter` returns null
  rather than defaulting to `active`, because a default would silently reset the
  user's own choice every time the list is re-entered without a query.
* **`planned` is the segment, `planning` the DB status.** The two are one keystroke
  apart and a unit case pins that they are not interchangeable — the query is a
  UI vocabulary, not a status column leaking into the URL.

Red-proved by dropping the query from the replace: **both** M18 cases fall, and
E2E-M18-06 falls on the honest symptom — the restored trip is not on screen at
all. That is the case doing what the audit was about: asserting the outcome the
user sees rather than the mechanism.

## FR-5.5 — "bewusst nicht einpacken" gets a control (2026-08-18)

The backlog said the state existed and no view could reach it. Two of its three
premises turned out to be wrong, and checking them is what shaped the work:

* **A view did call `skipItem`.** M4 carried an `IonItemSliding` with *skip* and
  *unskip* options — kept through the §3.25 rebuild rather than dropped, as the
  note assumed.
* **M4 did not badge a skipped row.** Nothing was rendered where a packed row
  carries its FR-25.17 stamp, so a revealed skipped row was indistinguishable
  from a packed one — the confusion FR-5.5 exists to remove, reintroduced one
  screen later.
* **The swipe was broken in a way only a render shows.** Opened, its option panel
  left the row's `.jp-card`: square block to the screen edge, the row losing its
  stepper, and the label a *state name* ("Bewusst weggelassen") rather than an
  action. That is the same failure the swipe lost the M7 A2/B2 round on, and it
  had been sitting in M4 since the rebuild because nothing swiped it.

So the question was not "which control do we add" but "which one replaces it".
Four variants were rendered (`dev-docs/build-skip-control-variants.mjs` →
`UI_Concept_SkipControl_variants.html`, with the defect screenshot beside them);
the owner chose **A + C**, the split M7/M8 already use:

* **A — press and hold a row** → the action sheet: *Jetzt packen* · *Nicht
  einpacken*, and on a skipped row *Doch einpacken* and nothing else. Reuses
  `useLongPress` and M7's `rowMenuActive` guard verbatim, including the reason it
  is a state with an end rather than a swallow-next-click flag.
* **C — a spelled-out control in the M5 sheet**, beside the stepper. The stepper
  says *how many*; only this says *none, on purpose*.

**D was rejected on the meaning, not the mechanics**: long-pressing "−" already
zeroes a row, and letting that zero *be* the decision would put words in the
user's mouth. Quantity 0 stays a counter reading; skipping writes both.

Three things moved into the domain rather than staying inline, because the view
needed the *list* and not just the effect:

* `coSkipTargets` — which rows the FR-20.2 cascade takes along. `skipItem` now
  returns them, snapshotted before the write, which is what lets the snackbar
  name them and the undo restore exactly those.
* `skippedVia` — why a co-skipped row is skipped, **derived** from the dependency
  graph and the current states. A stored reason would have to survive un-skips on
  either side and edits to the dependency itself; this cannot go stale.
* `usePackUndo` became `useRowUndo`: it holds *rows*, plural, and takes its
  restore per action — a pack changes `packed_count` and `state`, a skip changes
  `quantity` too, and one shared restore would write back a field its action never
  touched, reverting whatever a sync had put there.

Rendered and eyeballed before the case was finalised: the menu, the snackbar
("„Sonnencreme" stays at home · UNDO") and both states of the M5 control.
Five e2e cases in `client/e2e/skip-item.spec.ts`, mutation-proved in both
directions with a rebuild between runs — removing the menu entry reddens the four
M4 cases and leaves M5 green, removing the M5 control reddens M5 alone.

## 2026-08-18 — FR-27.4: a planned trip follows the groups it was made from

The last mechanical piece of the §3.27 client package. A group edited after a
trip was generated used to reach nothing: the M8 blast-radius note *warned*
about a propagation that did not exist. It exists now — migration 023, ADR-016
— and the shape of it was decided by one question the schema could not answer.

**"Manual edits always win" is not a rule until something can evaluate it.**
The trip row says 5, the group says 3. Did the user set 5, or did the group say
5 last week? Comparing the row against the *current* template cannot tell, so
the refresh keeps a ledger of what generation last produced per position
(`trip_generated_positions`). Row equals the snapshot → untouched, an update may
land. Row differs → theirs, leave it. **Ledger entry with no row at all → they
deleted it, and it never comes back** — which is the case a snapshot column on
`trip_items` cannot express, because it dies with the row it describes, and the
reason that option lost. The full weighing is ADR-016.

Three things settled while building, each of which changes behaviour:

* **Protection is broader than the snapshot.** A row is also the user's once
  packing has begun on it or it was skipped (FR-5.5) — a template edit must not
  rewrite a count somebody physically verified, nor quietly undo a decision.
* **A protected row's snapshot is deliberately not refreshed.** Nudging it
  forward would hand the row back to the template the moment the user reverted
  their own edit, which is the opposite of what FR-27.4 promises.
* **Travelers are part of what a trip follows.** The diff re-resolves against
  the *current* roster, so a person added to a planning trip gets the per-person
  positions (FR-25.8) and one removed takes their untouched rows along. That
  falls out of re-resolution rather than being built, but it is a decision, so
  it is written down and tested.

**Two devices, one trip.** Both pull the same group edit, both run the refresh,
and with random ids both insert their own row — a duplicate produced by the
feature whose job is to keep the list right. The ids of propagated rows and
ledger entries are therefore *derived* from (trip, item, traveler), so the two
inserts are one row that the NFR-4.2a merge resolves. The cost is that trip-item
ids stop being opaque; nothing depends on that today, and ADR-016 carries the
revisit trigger.

**Why a diff and not a push from M8.** M8, M14 and M21 all write to a group, and
a group edit can equally arrive over sync from another device, which no screen
here could have pushed. One re-resolution on trip open and after a master pull
covers all four; the alternative was four call sites that must each remember.
It also means **M14 owes nothing extra**: applying a proposal writes to the
group, and the trips following it log it on their next open.

**Nothing lands silently.** `trip_applied_changes` is the log behind M2's chip,
and it stores *structured* detail (`{"field":"quantity","from":2,"to":3}`) rather
than a sentence — the row syncs, and a sentence would freeze one language into
the database. The view words it.

Partitioning split by **who reads a table, not what it is about**: the ledger
travels the trip partition beside the rows it describes, while the registry and
the log travel the master partition like `trip_members`, because M2 renders its
chip and M8 its note with no trip partition loaded.

Existing trips deliberately do not move: they have no registered sources, and
deriving sources from `trip_items.source_template_id` was rejected for the same
reason as the snapshot column — it guesses at rows the user may have removed on
purpose.

E2E-M8-09 runs the whole circle (edit the group → open the trip → the row is
there → M2 names it), mutation-proved in both directions and repeated three
times on both browsers. The frozen case stayed a component test: reaching an
*active* trip in the browser still needs the planning→active transition no UI
ships. The dev seed grew a second, *planned* trip for the same reason — the
existing sample trip is active on purpose and therefore frozen, so without it
the feature cannot be looked at.

**Owner-Eyeball, 2026-08-18:** Chip angenommen. Eine Änderung daraus — der Log
steht **bis zehn Einträgen direkt unter der Zeile**, darüber klappt er hinter den
Chip. Die Schwelle statt „immer geklappt": ein paar Zeilen sind es wert, dort
gelesen zu werden, wo sie passiert sind, aber M2 ist der Haupteinstieg und es gibt
bewusst kein *gesehen* — ein unbegrenzter Log schöbe jede andere Reise nach unten,
bis die betriebsame abreist. Der Chip ist in der Inline-Fassung ein Label ohne
Interaktion; ein Bedienelement, das nichts umschaltet, lügt über Zustand.

Die Umstellung deckte einen echten Testfehler auf: seit der Log inline steht,
enthält M2 das Wort „Stativ" ebenfalls, und während des Ionic-Übergangs sind beide
Seiten kurz sichtbar — `getByText('Stativ')` löste auf zwei Elemente auf. Der Fall
prüft jetzt die *Überschrift* der Zeile. Merke: eine Textsuche auf der „sichtbaren
Seite" ist nur eindeutig, solange kein zweiter Screen dasselbe Wort trägt.

### The §4a pass that came with it

The owner stopped the PR twice on the same thing: `case "trip_template_sources":`
and a triple-nested `append`. The rule existed in one line of a personal
CLAUDE.md and nowhere binding, so it became CODING_PRINCIPLES §4a — what must be
named, what may stay a literal, where the constant lives — with `goconst` as the
Go floor. The carve-out is written down rather than silently configured: a JSON
field name in a payload literal is the wire contract itself, fixed by the
Sync-API spec, and a constant between the code and the shape it implements hides
what a reader came to check. Go now names its tables, trip roles and portable
document kinds; the client gets the same table list as `TABLE`, and the
orchestrator's two routing sets are hoisted out of `onPullChanges` rather than
rebuilt on every pull. The failure this prevents is specific: a table missing
from both routing sets is dropped in silence.

## FR-27.4, revised the day after it landed: the group *asks* (2026-08-18)

Owner, hours after the refresh merged: „wenn ich eine Gruppe ändere, die in einem
aktiven Trip verwendet wird, so soll ich gefragt werden, ob es auf die angewendet
werden soll. Auf vergangene Trips soll es keinen Impact haben." That inverts two
of the three rules the merged model rested on — *planning* trips followed
silently, everything else was frozen from departure onward.

Three decisions settled it. **Past means archived or the end date gone by**, the
broader of the two options offered (the recommendation had been archived-only).
**The question is asked at the trip, and nowhere else** — not when the group is
saved. Three holes in asking at save time, one of them already paid for in #106:
in Server Mode the person editing the group is not the person travelling; the
affected trips' partitions are not loaded on the editing device (*„nicht geladen
≠ leer"*); and a modal on every group edit trains the user to dismiss it. And
**#106 merges first**, the new model as a follow-up — the machinery it built is
exactly what the new one needs.

**The change turned out to be cheap, for a reason worth recording.** `planRefresh`
was already a pure derivation with the writes kept separate, so a *proposal* is
simply a diff nobody has applied yet: no table, no pending state, nothing to sync.
The three surfaces split apart — `proposeTripRefresh` derives, `acceptTripRefresh`
applies, `declineTripRefresh` applies `declinePlan`.

**Declining needed no new state at all.** The ledger already records what
generation last produced, and `isProtected` already reads a row that differs from
it as the user's own — so writing the *refused* version into the ledger detaches
exactly the refused positions and leaves the rest of the group still speaking for
the trip. No flag, no expiry, nothing extra on the wire.

That has a consequence the UI has to say out loud, and the note under the two
buttons says it: **a refused position stops following the group in that trip.** A
working note written before the code claimed the user would be re-asked on the
group's *next* change; that is false against `isProtected`, which skips a
protected row entirely. Per-position detachment is the coherent rule, and other
positions keep following — so a later group edit still reaches the trip.

**What the new rule cost, and what it saved.** It only distinguishes past from
not-past, so the missing planning→active transition — the gap that left half the
old model untestable in the browser — stops mattering here. What it did cost is
one boundary that cannot be reached through the UI at all: a trip whose end date
has gone by needs either a clock or a date the wizard will not produce. So the
clock became a seam (`today` injected into the orchestrator, defaulting to the
*local* calendar date — `toISOString()` answers in UTC and would put a trip a day
out for anyone far enough east or west on the evening it ends), and the boundary
is pinned in the unit with a value a test can stand on either side of.

**Two findings from the work itself.** The sweep over loaded trips carried its
own copy of the status rule (`status !== 'planning'`), which would have stayed
behind silently after `planRefresh` was fixed — found by reading the function,
not by a red test. And two of the decline tests were green against a *broken*
`declinePlan`: they asserted a downstream effect (nothing proposed on the next
run) that an empty ledger produces just as well. They now assert the declined
snapshot itself, and fall when it is wrong. Both e2e cases were mutation-proved
the same way: restoring apply-on-open turns E2E-M8-09 red at "offered, not
applied", and a decline that applies the plan turns E2E-M8-19 red.

## FR-27.3 — single items in M3 (2026-08-18)

Trip creation could combine Ferien-Vorlagen and Gruppen and nothing else, so
"diesmal noch die Drohne mit" meant building a group for one item — filing
rather than packing.

**Where the rule went.** `generateTripItems` takes `singleItemIds` and resolves
them **after** the templates, which is the whole design: "already there" is only
decidable once the composition is resolved. Three consequences fell out of that
ordering rather than being decided separately — an item a template already
brought is *reported* (`alreadyIncluded`) instead of duplicated; a **per-person
fan-out counts as present**, because the item is on the trip twice already and a
trip-global third row reads as a third one; and a position a **condition kept
out** (FR-15.2) is *overridden* by the hand-pick, with the exclusion report no
longer claiming the item is off the list.

**One type change with teeth.** `GeneratedItem.source_template_id` widened to
`string | null` — a single item has no template and nothing may claim it does,
because FR-27.4 and FR-27.5 both read that provenance. The refresh now skips
template-less rows explicitly: it never produces one, and one could not follow
anything anyway. Making that a stated fact rather than a coincidence of the
caller is the point.

**The picker is deliberately not the quick-add.** §3.25's consistency directive
points at `QuickAddItem`, and M8 reused it verbatim for exactly that reason. It
is the wrong component here: it exists to *write a row*, free text included, and
to stay open through a run of rows. Step 3 picks something that already exists —
a name nobody owns has no weight, no tag and nothing for FR-27.5 to recognise a
year later. What the two share is `searchItems`, which is the part that must not
diverge; the twenty lines of field-and-chips are not.

**Two things found while building.** `v-model` on an `ion-input` binds through a
custom element that nothing outside a real browser drives, so the component test
saw an empty query however it typed — the field uses `:value` + `@ionInput`, the
same seam the name field above it already used. And the e2e case (E2E-M3-12,
specified long before) had to end **on the created trip**: a footer count proves
the preview, not that the row arrived.

No seed change was owed: `Wandersocken` is in the sample inventory and in no
group, so a fresh device can exercise the picker as it stands.

## Portable YAML learns the composition (2026-08-18, ADR-017)

The format could describe a template's positions and nothing about what a
Ferien-Vorlage is *made of*. Two consequences, one of them quiet and bad: a
shared file imported a Vorlage that resolved to nothing, and the NFR-4.11
backup — the only copy a Local Mode device has — restored the same emptiness.
The failure surfaces at the next trip generation, on a device that no longer
has the file.

**The decision was between self-contained and referential**, and it is written
up in ADR-017 with the matrix. The groups travel whole. What made it clear-cut
was driver 2 rather than the sharing story: a backup that restores a name is
not a backup.

**The identity rule is the half worth remembering.** The name is a group's
identity across instances — nothing else survives the trip — so an import
*links* a group of that name and never rewrites it. That rule is not politeness:
since FR-27.4 a group edit reaches every trip that follows it, so an importer
that "helpfully" merged the file's positions into an existing group would change
other people's packing lists from a file they never opened. The cost, stated in
the ADR, is that an import can give you less than the file described.

**Found while building:** the Go exporter never wrote `scope` at all, so a group
exported through the server came back a Ferien-Vorlage — the exact defect
FR-27.1's spec text warns about, three lines above a client parser that rejects
an unknown scope. It had no test because nothing asserted the exported
*document*, only its items.

**Where it is enforced:** both parsers reject includes on a trip, includes on a
group (FR-27.1 is two levels, which is what makes cycles impossible) and an
unnamed group — at the file boundary, before anything reaches a store. And all
four client write paths go through one `compositionFrom`, so M7's export, the
settings export and the backup cannot disagree about what a file contains.

## The identity rule was half a rule (2026-08-18, ADR-017)

Found reviewing the branch that introduced it, before it merged. ADR-017's
link-or-create rule lived only in the `includes` loop, so it decided what
happened to a group *nested in a Vorlage* and said nothing about the group's
own document. A backup carries the same group both ways — the ADR calls that
redundancy deliberate — so the result depended on which document the file
listed first:

```
group-first    -> 1 group :  Makro Fotografie
vorlage-first  -> 2 groups:  Makro Fotografie | Makro Fotografie (import)
```

**That order is not stable, which is what made it a defect rather than a
curiosity.** The file is written in `templateList` order; in Local Mode the
store is hydrated from IndexedDB with `getAll()` over keys of the form
`templates/<random hex>`, so the order is arbitrary relative to creation and
re-rolled on every reload. Roughly half of all restores would have produced a
duplicate group, included by nothing, carrying a copy of the positions.

E2E-M18-07 passed throughout: it creates the group first in a warm store, which
is exactly the order that works. The unit cases now run **both** orders through
`commitPortableRestore`, and the e2e additionally asserts one group in the
restored list.

**The Go importer had the same hole with a different symptom** — a repeated
group document hit `UNIQUE(owner_id, name)` and failed the import outright. It
already had an `ensureGroup` helper doing link-or-create for nested groups; the
document path now goes through it too.

**What the rule is, stated properly:** it belongs to the *group*, not to where
in a file the group appears. Ferien-Vorlagen deliberately keep the `(import)`
suffix instead — two of one name are two different plans, and linking them
would lose one.

Method note: the two mutation proofs of this fix were nearly worthless. The
first pass mutated an **uncommitted** implementation and then reverted it with
`git checkout`, so the second "proof" ran against code that had never had the
fix at all — a red test proving nothing. Commit first, then mutate.

## The Go test suite spent 96 % of its time replaying migrations

**Measured, not guessed.** The CI pipeline was taking 13–22 minutes wall clock,
and the `go` job was its second-largest contributor at ~267 s, of which
`go test -race` was 221 s: `internal/store` 180 s and `internal/api` 158 s,
running in parallel.

The distribution over the 128 store tests was suspiciously flat — about 1.75 s
each regardless of what the test did. `TestDeleteItemImage_IdempotentWhenNoImage`
asserts that deleting a non-existent image is a no-op and took 2.40 s. There are
no sleeps in the suite and no password hashing anywhere in `internal`, so the
cost had to be in the setup every test shares.

It was `Open(":memory:")`, benchmarked both ways:

```
Open(":memory:")   without -race:     55 ms
Open(":memory:")   with    -race:   1658 ms      <- 30x
```

`modernc.org/sqlite` is pure Go (D-001), which is normally invisible — but it
means the race detector instruments the SQLite engine *itself*. Every test was
driving 23 migrations and ~50 KB of DDL through that instrumentation. At
1.66 s x 232 store+api tests, that single line was essentially the whole Go job.

**The fix is to replay the migrations once per process instead of once per
test.** `store.OpenForTest(dir)` builds a fully migrated, empty database the
first time it is called, keeps the file's bytes, and thereafter copies them into
the caller's directory and opens that — where `Open` finds `PRAGMA user_version`
already current and applies nothing:

```
BenchmarkOpenFromTemplate -race:      2.9 ms     <- 570x
```

Result on this machine: `internal/store` 180 s -> 23.5 s, `internal/api`
158 s -> 14.8 s, the whole `-race` suite under 30 s.

**Why the helper is exported from `internal/store` rather than living in a
`storetest` subpackage**, which is where it belongs on taste: seventeen of the
store package's test files are `package store`, and Go forbids a test file of
package P from importing a package that imports P. A subpackage would have been
reachable from `internal/api` and *not* from the suite with the larger problem.
The cost is one exported function compiled into `jitpackd` that nothing in
production calls. It was judged too small a tradeoff for an ADR and is explained
at the declaration instead.

Three points of care that the change is only safe because of:

- **The template must reach the same schema level as a full replay.** That is
  asserted against `Open`'s own result rather than against a hard-coded 23, so
  a new migration cannot quietly fall outside the template.
- **The copy must be a copy.** A shared template handed to two stores would let
  one test read another's rows; the guard was mutation-proved by pointing every
  caller at one shared path and watching it go red.
- **The template must stay empty.** Seeding it once would hand every test rows
  it never inserted.

`concept_migrations_test.go` and `tags_test.go` still open raw `:memory:`
databases and replay migrations deliberately — that replay is their subject.

The remaining CI time is in the `e2e` job, which is a separate change: half of
its 10–20 minutes is `playwright install --with-deps` installing WebKit's ~200
apt dependencies on every run, on a runner where the digest-pinned Playwright
image (already used by the `visual` job, ADR-013) has them baked in.

### The development phase drops DDL migrations (2026-08-19, ADR-018)

Owner decision, taken against the recommendation on the desk: while the schema
is still moving, no migration chain — one always-current `internal/store/schema.sql`.
The recommendation it overrode was about *speed* (squashing the chain buys ~1 s
on top of the test template above, so it does not pay), and the question the
owner actually asked was about *friction*. On that one the history argues for
dropping:

| | |
|---|---|
| Migrations since v0.1.0 (2026-07-10) | 11 in six weeks |
| …in the final week alone | 6 (018–023) |
| Migrations that exist **only** because an earlier file cannot be edited | 4 (013, 014, 015, 018) |

Those four retired features. In SQLite that means the twelve-step table rebuild,
and a rebuild must carry every column the table has grown since — the first
draft of migration 005 was modelled on 004, silently dropped `trips.updated_hlc`,
and broke every master pull of a trip. With one schema file, retiring a column
is deleting a line.

The DDL the chain actually produced is the other half of the argument. Five
tables closed with `, updated_hlc TEXT NOT NULL DEFAULT '');` sharing a line
with the closing paren and four more carried the same column appended mid-list,
`users` had three columns and a stranded `CHECK` after `created_at`, and eight
table names were quoted because a rebuild had requoted them. None of that is
wrong; all of it is unreadable.

**What the mechanism is now.** `Open` reads `PRAGMA user_version`. If it equals
a fingerprint of `schema.sql` (SHA-256 truncated to 31 bits, because SQLite's
user_version is a signed 32-bit integer), the database is used as it is. If the
file is empty, the schema is applied and stamped in one transaction. Anything
else — a migration-era level, or `0` on a file that already has tables — is
refused with `ErrSchemaStale` and an error naming the path and two ways out.
Nothing is recreated and nothing is deleted: the owner chose "error with
instructions" over "recreate", so a database the code refuses is left exactly as
it was.

**Equivalence was proved before the chain was deleted, not asserted.** A
temporary test built one database from the 23 migrations and another from
`schema.sql`, then compared, per table: columns with type, nullability, default
and primary-key position (`table_xinfo`, so the generated `duration_days` column
is included), foreign keys with their delete actions, and index origin and
uniqueness — plus the view. Identical. It was mutation-proved by adding one
column to `schema.sql` and watching it fail, then removed together with the
migrations it compared against.

**What the change cost, stated rather than glossed.** Four tests staged a
database one migration short of a change and asserted the *transformation*
against real rows: 019's packing-record backfill, 021's year derivation from
the end date, and 022's category-to-tag rename with its FR-16.3 collision
handling. Their subject no longer exists. What was assertable as *schema* was
kept and renamed — `concept_migrations_test.go` became `schema_shape_test.go`
with six `TestSchema_*` cases, and `TestSchema_ItemNameIsUniqueOnItsOwn_FR16_3`
preserves what 022's collision test was ultimately about. What was genuinely
about a transformation was not replaced.

**One regression the equivalence test could not see.** `PRAGMA journal_mode = WAL`
was line 18 of migration 001, and a pragma leaves no trace in `sqlite_master` —
so a comparison of schema objects passed while a fresh database came up in
`delete` mode. Found by reading `docs/installation.md`, which claims WAL and its
sidecars, and checking the claim. It now runs in `Open` beside `foreign_keys`
rather than in `schema.sql`: `journal_mode` cannot be changed inside a
transaction, and `applySchema` runs in one. `TestOpen_UsesWriteAheadLogging`
holds it.

`applySchema` takes its DDL as a parameter rather than reading the package's
embedded schema, so "a statement that does not apply leaves nothing behind, and
above all no stamped fingerprint" is drivable directly instead of only through a
deliberately broken build.

Two side effects. `go test -race` over the whole module went from 29.5 s to
20.6 s locally, on top of the 4m19s → 29.5 s the test template had already
bought. And `:memory:` disappeared from the suite entirely — the two files that
opened one did so to replay migrations into it, so every store and api test now
runs against a real file, which is what production uses.

**This reverts at 1.0.** `schema.sql` becomes `migrations/001_schema.sql`,
numbering resumes at `002`, and invariant 2 returns to its previous text. The
trigger is written out in ADR-018 rather than left to memory; the whole decision
rests on the fact that reversing it is an hour's work.

### The e2e job moves into the pinned Playwright image and shards (2026-08-19)

The second half of the CI investigation that produced the Go test template.
Measured on the `e2e` job of PR #111, per step:

| Step | Duration |
|---|---|
| `npx playwright install --with-deps chromium webkit` | **1124 s** |
| `npm run test:e2e` | 615 s |
| everything else (checkout, node, `npm ci`, build, upload) | 37 s |

**63 % of the job was installing browsers**, and the cache was working: the
binaries were cached, the ~200 apt packages WebKit links against are not
cacheable and were reinstalled every run. The `visual` job has not paid that
since ADR-013, because it runs inside `mcr.microsoft.com/playwright`, which has
both baked in. `scripts/e2e.sh` does the same for the behaviour suite, and the
digest moves to `scripts/playwright-image.sh` so the two scripts cannot drift
apart on it. A side benefit: `make e2e` now works on the NixOS host, where a
downloaded Chromium does not run at all.

**The sharding decision was made twice, because the first answer was wrong.**
One CI leg per browser is the obvious split and it is worse on both counts.
Measured locally in the image with 2 workers: Chromium 3.8 min, WebKit
10.6 min. A per-browser split is bounded by WebKit for its entire duration
while the other runner idles for seven minutes — and it puts two WebKit
contexts on a runner where roughly one ran before. That is not free, which the
run proved: E2E-M12-05 failed, twice, at *different lines each time*, which is
the signature of a unit exceeding its budget rather than a broken assertion.
`--shard` instead: 133 tests each, 5.7 min and 10.0 min, both legs carrying
both engines. Still uneven — Playwright shards by file and the heavy files
cluster — but nothing idles.

**What that failure actually exposed.** E2E-M12-05 takes 21.4 s uncontended.
A full WebKit run says 16 of 123 tests take 20 s or more, and the slowest
*passing* one took 31.9 s — against Playwright's 30 s default, which
`playwright.config.ts` had never overridden. Nobody had chosen that number;
the suite had simply been living under it, and the CI run before this one
already carried one WebKit retry. The budget is now set explicitly at 60 s
with the measurement written beside it. It is not a wait-and-hope: a budget
bounds a hang, and this one was set below the work. The §2.4 units build their
world through M7 → M8 → M3 rather than seeding storage, which is exactly what
makes them worth having and exactly what costs the seconds.

**And one genuine test defect, found by running it.** E2E-M3-12 asserted
`visible(page).getByRole('heading', { name: 'Drohne' })` right after the
wizard creates the trip. Both pages are briefly un-hidden during that
transition, so the locator matches the step-4 preview heading *and* the M4 row
heading, and the assertion fails as a strict-mode violation depending on which
frame it lands in — the same shape as the settled-vs-arrived lesson from #89.
It now asserts the row by test id, which is unique and is the stronger claim
anyway. Verified with `--repeat-each=3` on WebKit. `backup-restore.spec.ts:232`
has the same shape and is *not* currently ambiguous (the page being left holds
no template headings); it is recorded here rather than changed on speculation.

**One cost this moves onto us.** The browsers now come from a digest that
Dependabot cannot see, while it does bump `@playwright/test` in the lockfile.
That drift already broke `visual` silently; it would now break `e2e` too, and
its only symptom is Playwright's own "Executable doesn't exist", which names
neither cause nor fix. Both scripts therefore compare the pinned version
against the lockfile before starting the container and fail with the two lines
that fix it. Both branches of that check — mismatch, and an unreadable
lockfile, which must warn rather than block — were proved by mutating a copy.

### The e2e job loses its gate and gains two shards (2026-08-19)

The 2026-08-19 pipeline after the container move measured ~7 min wall clock,
and all of it was one path: `client` (69 s) → `e2e (2)` (5:41). Every other
job finishes under 90 s. Two changes, both to the critical path and neither
to what is tested:

**The `needs: [client]` gate is gone from `e2e`.** The job installs and
builds on its own runner regardless — with a warm npm cache that is ~20 s,
against the ~75 s of `client` the gate serialized in front of the slowest
job in the pipeline. The gate reused nothing; it only made e2e start late.
What the trade costs is runner minutes, not signal: on a commit where
`client` fails lint but builds, the e2e legs now run to completion instead
of being skipped. `visual` keeps its gate — it is off the critical path
either way. One knock-on: the "e2e is not a required check because it needs
client" rationale in CLAUDE.md was rewritten; the check stays non-required
because it is a shard matrix and `dependabot-merge` already waits for it.

**Two shards became four, sized from the run's own reports.** The two
uploaded HTML reports carry every test's duration: ~1020 test-seconds total,
WebKit ~630 s behind Chromium's ~350 s in the test list. With `fullyParallel`
Playwright splits that list into contiguous count-equal chunks, so duration
balance is luck: 2 shards landed 464/557 s, and simulating 4 shards on the
same durations lands 150/315/251/305 s — the worst leg drops from ~4.7 min
of test time to ~2.6, against ~1 min of fixed cost per leg (image pull 36 s,
warm npm ci + build ~25 s). More shards pay that fixed cost again for less
than a minute back. Same tests, same 2 workers per runner, same 60 s budget,
same retry policy — the partitioning moved, nothing else.

Expected wall clock: the pipeline becomes bounded by the heaviest e2e leg
starting at t≈0, roughly 4 min. Measured on this PR's own run — see the PR.

## FR-27.10 — a whole group onto a trip that already exists (2026-08-19)

The last open piece of §3.27 except M21. „Ich möchte auch in den Ferien eine
Gruppe von Pack-Elementen hinzufügen können" — you decide on site that you will
shoot macro this time, and until now the alternative was hand-copying a dozen
positions or regenerating a trip that has already been packed against.

**The surface is FR-25.13's composer verbatim**, which the FR insists on and
which turned out to be the cheap half: `QuickAddItem` gained one opt-in prop
and one emit. What is new visually is that a group is a **card** rather than a
list row like the item suggestions, carrying the FR-27.12 summary and the
resolved position count. That is not decoration — a tap that adds twelve rows
and a tap that adds one item are the same gesture two pixels apart, and the
summary is what lets somebody choose without opening anything.

**The resolution is `generateTripItems`, unchanged.** `domain/groupAdd.ts` is
thin on purpose: it feeds the group in as the single selected template with the
trip's *current* travelers, and everything §3.27 already decided — one level of
includes, the FR-2.3a merge, the per-person fan-out, FR-15.2 conditions,
FR-27.7 tasks — follows without a second implementation. What the module owns
is the one question generation never had to ask: **what is already there.**

Four things settled while building, each visible in the code:

* **Presence is master item first, name second, trip-global.** A generated row
  carries its `source_item_id`; a row typed into the same composer five minutes
  earlier carries none, and „Kamera" typed by hand is the thing the group is
  about to bring. Trip-global rather than per traveler is FR-27.3's stance for
  single items, and for its reason: a per-person fan-out means the item is on
  the trip already, so one more row reads as one more thing to pack.
* **A third outcome the FR did not name.** „Added N, M already there" and „already
  fully on the list" are two; a group whose every position this trip's attributes
  excluded (FR-15.2) is a third, and reporting „hinzugefügt — 0 Positionen" about
  it would be false in both directions. It gets its own sentence.
* **The registration is written even when nothing was placed.** Following a
  group is about what it does *from here on*, not about what it happened to
  contribute today — a group that is already fully present is exactly the one
  whose next change the trip wants to hear about.
* **No ledger rows.** `planRefresh` adopts a row it finds without a ledger
  entry — the path a hand-added row takes — so the first refresh records these
  with no extra mechanism, and writing them here would only be a second way to
  say the same thing.

**No FR-9.1 flag**, which is the one line of this feature that is a product
decision rather than a mechanism: a single ad-hoc add on an active trip is
flagged *Missing* because something was forgotten, and an added group is a plan
that grew. Flagging it would feed M14 a lie and produce „nimm es in die Vorlage
auf" proposals for rows that came *from* a template.

**One gap the PR's own review found:** the group path skipped FR-20.4. A
single quick-add pulls its required companions and M3's generation does too,
so the same camera brought its spare battery when added alone and did not when
it arrived inside „Makro Fotografie". Fixed with one call and a red-first test;
the resolution runs once for the whole group, since it reads the settled list
either way.

**Where the tests had to move.** Two halves of the specified e2e cases — the
absent *Missing* flag, and a past trip registering nothing — need a trip that is
active or archived, and nothing user-facing moves a trip out of *planning* yet
(the same gap the M12 and M14 units hit). Asserted in Playwright they would have
passed on a planning trip whatever the production code did, so they are unit
tests naming the reason, and the e2e ledger records the swap rather than hiding
it. The name dedup **is** e2e-proved, mutation and all: dropping it doubles the
row and reddens exactly the case written for it.

**Three things the PR's second review pass changed**, beyond the FR-20.4 fix
above. The M4 handler held a three-way branch inline in a view with no unit
test — it is now `lib/groupAdditionMessage.ts`, a pure function with a case per
outcome, which promptly added a fourth: the add refuses a trip whose rows are
not on the device, M4 paints before its partition is pulled on a cold load, and
that refusal used to be a silent no-op. A refusal nobody can see is worse than
any of the outcomes the requirement worried about. Second, `previewText` had
become a verbatim copy in two views (`lib/groupPreview.ts` now). Third, and the
one worth remembering: reading the UI-Test-Spec's own sentences against the test
bodies found **two false promises** — the case claimed to assert provenance,
which is invisible on M4, and M4-27's text still said an *active* trip does not
follow its groups, which FR-27.4's revision of 2026-08-18 had already replaced
with *past*. The spec was describing the pre-revision model in a case nobody had
run yet.

Two smaller notes. The composer matches **group names only** — searching the
resolved item names is FR-27.13's decided concept for the M8 picker, and half of
it here would have been a second, quieter rule for the same question. And the
sample seed needed no extension for once: it already carries a group that is
deliberately included nowhere, which is exactly the group this feature is for.

## M21 — Vorlage aus Reise (FR-27.5), 2026-08-19

The closing half of the FR-27.1 round-trip, and the last thing §3.27 owed. M3
instantiates a composed Vorlage into a trip; M21 recognises what the finished
trip was made of and writes it back. The screen exists because the naive "save
as template" copies the trip flat and forks every group it came from — next
year two divergent camera lists.

**The screen was unreachable, and finding that out changed the plan.** Every
M21 entry sits on an *archived* trip. Both archive affordances are gated on
*active*, `activateTrip` existed in the orchestrator with a doc-comment
describing exactly this hole, and **no view called it**. So the first thing the
PR shipped was not M21 at all: one action on M4's app bar and one M2 swipe
option. The owner approved it as a deliberate scope call rather than a quiet
widening — the alternative was M21 landing with three blocked e2e cases, the
same caveat M14 already carries. It also retroactively unblocks the positive
M12-03 and M14-01/-02/-04/-05 cases, which hung on the identical gap; they are
now **owed rather than impossible**, and the e2e ledger says so in those words.
The cost is visible in the pixels: a fifth app-bar icon squeezes M4's title
from "Sameda…" to "S…".

**Recognition is a fact, not a question.** A trip row carries
`source_template_id`; grouping by it produces the recognised groups, and
membership therefore has no per-group opt-out. Two cases the concept never
spelled out came up immediately and are covered by name in
`domain/templateFromTrip.ts`:

- A row generated from the old **Ferien-Vorlage's own** positions carries that
  Vorlage as provenance. FR-27.1 fixes the hierarchy at two levels, so there is
  nothing to reference — the row is *loose*, and says so differently from an
  ad-hoc one ("aus „X“ — als eigene Position übernommen"). It was planned, just
  not by a reusable building block.
- A provenance id this device cannot resolve is loose too. An unresolvable id
  is not a group, and inventing a reference is worse than admitting ignorance
  (the M12 honesty rule).

**„Auf der Reise ergänzt" describes a path the app cannot walk.** The spec —
and the prototype's mock — picture a row added *under a group* while packing.
A quick-add writes `source_template_id = null`, so that row is loose by
construction, and there is no surface anywhere that attaches a trip row to a
group. What actually produces a row whose group no longer contains it is the
**group** changing after generation: a position removed in M8, or an FR-27.4
removal the trip declined. From the group's side the two read identically and
deserve the same offer, so the computation is right; only the sentence blames
the wrong end. Left as-is with a revisit trigger in FR-27.5 rather than
reworded unilaterally — the alternative wording ("Auf dieser Reise dabei, in
der Gruppe nicht") is a product voice decision. The e2e case produces the
deviation the real way: archive first, *then* remove the position, because a
past trip is never asked to follow along.

**No group change history table.** FR-27.5 asks for each fold-back to be
"recorded in the group's change history with its origin". No such table exists,
and FR-27.4 already carries the consequence — the edit is offered to every trip
that still follows the group and lands in *that trip's* applied-changes log. A
per-group ledger for one writer was not invented.

**What the render caught that the stylesheet could not.** Three defects, all
found by looking at the pixels: Ionic truncated both segment labels at 390 px
("UPDATE THE GR…" / "ONLY IN THIS TE…"), so the screen's one real choice could
not be read; the absent line had no plural rule ("Blitz **were** not on this
trip"); and it butted against the blast note, reading as a continuation of the
statement it contradicts.

**And one finding about the visual gate itself.** The ten M4 baselines were
regenerated deliberately (ADR-013) because the new app-bar action changes every
planning-trip shot — but the *old* baselines still **passed** against the new
render. An added 24 px icon plus the title truncation lands under
`maxDiffPixelRatio: 0.002` (658 px of 329 160). The gate is looser than it
reads; whether to tighten it is a decision with a flake cost, so it is recorded
here rather than changed in passing.

**Testing.** 25 domain tests over recognition and the write plan, six e2e cases
(`client/e2e/template-from-trip.spec.ts`) including E2E-M4-43 on the lifecycle
step. Mutation-proved throughout: dropping the `addTemplateInclude` loop,
flipping `DEFAULT_DEVIATION_CHOICE`, ungating the archive action, removing the
`source_item_id` shortcut and relaxing the kind check each felled exactly the
cases that claim them. Two false-green locators found on the way — Ionic marks
the chosen segment button with a *class* rather than `aria-checked`, and
`ion-toggle` **is** the switch rather than containing one.

**No ADR.** FR-27.5 had already weighed the tradeoff and chosen; the
implementation weighed nothing new.
