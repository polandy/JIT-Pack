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

**Single-User Mode could never open its WebSocket.** The dial interpolated
the token straight into the URL, and a mode with no OIDC has no token, so
it sent `?token=null`. `wsAuth` promotes any non-empty `?token=` to an
`Authorization` header, and `"null"` is non-empty — the server rejected
its own unauthenticated clients with a 403. No token now means no
parameter, and a token that is present is encoded. Filed here because it
had been visible since the first deployment and never written down.

**One grouping state, not two.** M12's slice tap called
`tripStore.setGroupBy`, which the M4 rebuild stopped reading — M4 takes
its grouping from `usePackingFilter`. The tap navigated and the grouping
silently stayed put. The store's copy (`groupByPrefs`, `getGroupBy`,
`setGroupBy`, `groupedItems`) had no other reader and is gone;
`setStoredGroupBy` is the one way for a departing screen to set what M4
mounts with, and it writes the stored value rather than a ref because the
composable's watcher flushes into a page that is already leaving.

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
