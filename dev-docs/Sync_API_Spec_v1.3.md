# Sync Protocol & API Specification — „JIT-Pack" (v1.3)

**Document Status:** Proposed for Review
**Basis:** ADR-001 v2 (Go + embedded SQLite), Schema v0.3 (`change_log`, `updated_hlc`), NFR-4.1/4.2/4.2a, UI-Spec G-2/G-4/G-5/G-10.
**Revision Note (v1.3):** Adds four RPC endpoints (§8) for the new portable YAML template/trip export-import (Addendum 3.18): `GET`/`POST` pairs for templates and trips, explicitly distinguished from the existing NFR-4.5 CSV/full-JSON export endpoints. Also corrects a stale "Schema v0.2" reference to v0.3. No other changes from v1.2.
**Base URL:** `/api/v1` — JSON only, UTF-8. All timestamps ISO-8601 UTC.

---

## 1. Design Principles

* **P-1 (One read path):** Clients receive data exclusively via the **pull endpoint**. WebSocket events are thin "something changed" pings that trigger a pull — never data carriers. One code path serves initial load, reconnect, offline catch-up, and realtime.
* **P-2 (One write path):** Clients write exclusively via the **push endpoint** from a local outbox — also while online. "Online mode" is just "outbox drains fast" (UI-Spec G-5).
* **P-3 (Partitioned sync):** Two partition types: one per **trip** (trip_items, travelers, containers, comments, conflict_log) and one **master partition per user** (items, categories, templates, template_items, item_dependencies, trip_series, destination_*, trips metadata, trip_members).
* **P-4 (Server is merge authority):** Conflict resolution per NFR-4.2a happens on the server during push. Clients never merge; they apply pulled state verbatim.
* **P-5 (Idempotency everywhere):** Every mutation carries a client-generated `mutation_id` (UUID). Replays return the recorded result.

## 2. Authentication

* **Flow:** OIDC Authorization Code + PKCE against the configured IdP (Authelia). Native apps use a secure in-app browser (Section 2 of the PRD).
* **Token exchange (ADR-007):** `POST /api/v1/auth/token` — body `{ "code": "...", "code_verifier": "...", "redirect_uri": "..." }` → `{ "access_token": <JWT>, "refresh_token": "...", "expires_in": 900 }`. The server brokers the exchange as a **confidential client** (`client_secret_basic`; env: `JITPACK_OIDC_ISSUER`, `JITPACK_OIDC_CLIENT_ID`, `JITPACK_OIDC_CLIENT_SECRET` — all other endpoints via `{issuer}/.well-known/openid-configuration` at startup). It validates the **ID token** (signature via discovered JWKS, `iss`, `aud` = client id), reads identity from the **UserInfo** endpoint (whose `sub` must match the ID token's, OIDC Core §5.3.2), JIT-provisions the user row, and issues **JIT-Pack's own session tokens**: a 15-minute HS256 access token signed with `JITPACK_SESSION_SECRET` (`sub` = `users.id`) plus a single-use rotating refresh token (only its SHA-256 hash is stored). The IdP token set never reaches the client; the IdP refresh token is retained server-side.
* **Refresh:** `POST /api/v1/auth/refresh` with the refresh token. The server replays the stored IdP refresh token against the IdP once per refresh — an IdP **rejection** deletes the session and answers 401 — and a rejection is only an RFC 6749 §5.2 error response (400/401 with a JSON `error` object) whose code is `invalid_grant`; **everything else is an outage** (network error, 5xx, a proxy's error page while the IdP's route is down, or a non-`invalid_grant` OAuth error such as `invalid_client`, which is a broker-side deployment fault) — it answers 502 and leaves the chain untouched — then re-reads UserInfo (re-stamping FR-23.1, best-effort), rotates its own refresh token (a replayed one answers 401), and slides the chain's 90-day absolute expiry (NFR-4.4). Client behavior: the access token is refreshed proactively when it expires within 30 s, and reactively after a 401 (the failed request is retried once with the fresh token); concurrent refreshes coalesce into a single call. A refresh that fails for network reasons (or 502) keeps the current token — offline is normal, not a logout. Only a 401 from this endpoint ends the session: the client clears its tokens and returns to the login page.
* **Client discovery:** `GET /api/v1/auth/config` (unauthenticated) → `{ "authorize_url", "client_id" }` (from the discovery document) so the client needs only the server URL; servers without OIDC answer 501.
* **Session claims:** `sub` **is** `users.id` — identity is established once, by the broker at login/refresh, never per request. `users.email` and the display name are stamped from UserInfo at login and refresh; the verified email (`email_verified`, OIDC Core §5.7), matched case-insensitively against `JITPACK_ADMIN_EMAILS`, drives the declarative instance-admin role (FR-23.1) — both directions, so list removal or lost verification revokes at the next login/refresh. All endpoints below require `Authorization: Bearer <JWT>`; per-request validation is stateless (no IdP round-trip).
* **Deactivated accounts (FR-23.3):** after the subject resolves to a `users` row, a deactivated account is rejected with 403 and the distinct error code `account_deactivated` — on every endpoint including the WebSocket dial. JIT provisioning never resurrects a deactivated account.

## 3. Hybrid Logical Clock (HLC)

* **Format:** `"{physical_ms:013d}-{counter:04x}-{device_id:8}"`, e.g. `1783862400123-0003-a1b2c3d4`. Lexicographic order == causal order.
* **Rules:** On every local mutation the client sets `hlc = max(wall_clock, last_seen_hlc)+tick`. On every pull/push response the client advances `last_seen_hlc` to the maximum observed. `device_id` is random per installation and only breaks ties.
* **Comparison** is plain string comparison; the server never trusts client wall clocks beyond HLC semantics.

## 4. Pull Protocol

### `GET /sync/trips/{tripId}?cursor={seq}&limit={n}`

* `cursor`: last `change_log.seq` the client has applied (0 = full snapshot). `limit` default 500.
* **Response:**

```json
{
  "changes": [
    { "seq": 4711, "table": "trip_items", "id": "…", "deleted": false,
      "row": { "name": "Unterhosen", "quantity": 6, "state": "open", "updated_hlc": "…", "…": "…" } },
    { "seq": 4712, "table": "comments", "id": "…", "deleted": true, "row": null }
  ],
  "next_cursor": 4712,
  "has_more": false
}
```

* Rows are **full snapshots** of the current state (not diffs) — pulling the same entity twice is harmless, which keeps the client applier trivial: `INSERT OR REPLACE` / `DELETE`.
* Tombstones (`deleted: true`) come from `change_log.deleted` and are retained until the trip is archived (Open Decision #2 of Addendum v2.0).
* The server compacts consecutive changes to the same entity within one response (only the latest snapshot is sent).

### `GET /sync/master?cursor={seq}&limit={n}`

Same envelope for the user's master partition. `change_log.trip_id` is NULL for master rows (schema note: column becomes nullable in migration 005); visibility is filtered per user (member trips and their rosters, own series; categories, items and templates are instance-wide per the FR-1.6 MVP simplification).

`item_dependencies` syncs through the master partition since migration 011 (Addendum 3.20, FR-20.1): rows carry `{item_id, depends_on_item_id, mode, quantity}` (plain integer since migration 014; formulas retired 2026-08-08) and are shared like the items they connect — writable and visible to every authenticated user. Deleting an item cascades its relations (both directions) and tombstones them. A duplicate `(item_id, depends_on_item_id)` pair, a self-reference, or an unknown endpoint is `rejected` (UNIQUE/CHECK/FK). Cycle prevention is save-time client validation; the client resolver also tolerates cycles that slip in from another device.

`trip_members` syncs through the master partition since migration 009 (FR-4.5/4.7): rows carry `{trip_id, user_id, role}`, are managed only by Owner/Admin, never carry `role: "owner"` from a client (the creator's server-created row is the only Owner and is immutable — no demotion, no removal), and a duplicate `(trip_id, user_id)` insert is `rejected`. Two server-side feed guarantees make late sharing work: (a) creating a trip also logs the auto-created owner membership row, and (b) applying a membership grant re-logs the `trips` row, because the new member's pull cursor is already past the trip's original change_log entry. Removal delivers a plain tombstone; the removed member's device keeps its local copy until it discards it (lazy, same semantics as trip deletes).

## 5. Push Protocol

### `POST /sync/trips/{tripId}` (and `POST /sync/master`)

```json
{
  "client_hlc": "1783862400123-0003-a1b2c3d4",
  "mutations": [
    { "mutation_id": "uuid-1", "op": "upsert", "table": "trip_items", "id": "…",
      "fields": { "packed_count": 3, "state": "partial" }, "hlc": "1783862399888-0001-a1b2c3d4" },
    { "mutation_id": "uuid-2", "op": "insert", "table": "comments", "id": "…",
      "fields": { "trip_item_id": "…", "body": "Ventil prüfen", "is_task": 1, "task_state": "open" },
      "hlc": "…" },
    { "mutation_id": "uuid-3", "op": "delete", "table": "containers", "id": "…", "hlc": "…" }
  ]
}
```

* Mutations are applied **in order, atomically per mutation** (not per batch): a rejected mutation does not roll back earlier ones.
* **Server-stamped fields.** Before merging, the server overwrites the actor columns from the authenticated pusher, so a client value is never trusted (`stampActor`): comment `author_id` on insert; `packing_now_by`/`packing_now_at` when the state becomes `packing_now`; and `trip_items.packed_by_user_id` — set when the state becomes `packed`, cleared on any other state, and **stripped from every `trip_items` mutation first**, so it cannot be forged on a push that touches no state (FR-25.19). `packer_user_id` is *not* stamped: since FR-25.19 it carries the assignment, which is the client's to choose. `trips.year` (migration 021) is `NOT NULL` — a `trips` insert without it is rejected rather than defaulted, because a trip with no year cannot be placed in time (FR-2.1b); `end_date` is nullable from the same migration. `trip_items.packed_at` (migration 020) is the same record's *when* (FR-25.17) and follows it exactly — written with the record, cleared with it, stripped from every mutation first — with one deliberate difference: a **client-supplied RFC 3339 value is kept**, because packing happens offline and the push can land days after the tap. A clock is not an identity claim, so invariant 3 does not reach it; an unparseable value is replaced by the server's own time rather than stored.
* **Response** per mutation: `applied` | `merged` (some fields lost per conflict rules, `conflicts[]` lists them) | `duplicate` (mutation_id seen before, recorded result returned) | `rejected` (validation/permission, with `error`).
* After processing, the response includes `pull_hint: {next_cursor}` so the client immediately pulls its own (possibly merged) canonical state — closing the loop through the single read path (P-1).

## 6. Server-Side Merge Algorithm (NFR-4.2a)

```
for each mutation m:
  if mutation_id already recorded → return recorded result        (P-5)
  if permission check fails (trip role, FR-4.5) → rejected
  if op == insert and id unknown → apply whole row, log change
  if op == delete → apply tombstone if m.hlc > row.updated_hlc, else merged(no-op)
  if op == upsert:
    for each field f in m.fields:
      rule 1 (additive): comments/tasks/flag_* setting TRUE are always applied
      rule 2 (terminal precedence): state transitions respect the machine:
              packed beats packing_now regardless of HLC;
              packing_now on an already-packed item → merged (dropped)
      rule 3 (field LWW): otherwise apply f iff m.hlc > row.updated_hlc(f-group)
    dropped fields → conflict_log row (losing/winning value), returned in response
  row.updated_hlc = max(row.updated_hlc, m.hlc); append change_log
```

Field groups: `packed_count`+`state` merge as one unit (they are causally coupled per FR-5.4); all other columns are independent fields. **Decided: no further grouping** — `mode` is not grouped with `state`; a procurement-mode change concurrent with a pack-state change is resolved as two independent LWW fields, not a coupled unit.

## 7. WebSocket — `GET /ws` (Upgrade)

* Auth via `?token=` query param (implemented) or first frame `{"auth": "<JWT>"}` (reserved, not implemented).
* **The parameter is omitted entirely when the client has no token** (clarified 2026-08-14). Single-User Mode is offered no OIDC and so has none, and the server promotes any *non-empty* `?token=` value to an `Authorization` header — so a client that sent the absent token anyway (`?token=null`) had the instance reject its own unauthenticated clients with a 403. Absent means absent; a present token is percent-encoded.
* Server → client envelope: `{"type": "<event>", "payload": {…}}`.
* Client → server frames: `{"subscribe": ["trip:<id>", "user:<own-id>"]}`, `{"unsubscribe": ["trip:<id>"]}`, and `{"cursor": {"trip_id": "<id>", "seq": <n>}}` — the client reports its pull cursor after each trip pull so the server can recompute `in_sync`. `user:` frames are accepted but redundant: `notification.created` is delivered to every connection *authenticated* as the target user, so a client can never miss (or steal) the event by (mis)subscribing.
* **Event catalog (server → client), all thin:**

| Event | Payload | Client reaction |
|---|---|---|
| `trip.changed` | `{trip_id, seq}` | pull if `seq > local_cursor` |
| `master.changed` | `{seq}` | pull master partition |
| `item.locked` / `item.unlocked` | `{trip_id, item_id, by_user, name}` | render lock overlay (G-3) — ephemeral, not persisted |
| `presence` | `{trip_id, users:[{user_id, device_count, in_sync}]}` | avatars + group-sync badge in M4 header (UI-Spec G-10) |
| `notification.created` | `{notification_id}` | fetch via `GET /notifications` + toast/OS notification (FR-6.2) |

* Locks (`packing_now`) are **also** persisted via normal mutations; the ephemeral event only lowers latency. Offline devices converge via pull — a stale lock older than 15 min is ignored by clients (timeout rule). **Decided: 15 minutes is the shipped default, configurable via an environment variable** per the declarative-config principle (Section 2), not adjustable from within the UI.
* **Group-sync computation (`presence.users[].in_sync`):** for each WebSocket connection subscribed to `trip:<id>`, the server tracks the connection's last client-reported pull cursor (the `cursor` frame above). `in_sync` is `true` when that cursor is at or beyond the trip's current `change_log` head sequence. This is necessarily best-effort: it reflects only devices currently connected via WebSocket, says nothing about a fully offline device's local outbox, and is advisory UI signal only (UI-Spec G-10) — it never gates any mutation or pull.

## 8. Non-Synced Operations (RPC-style REST)

Server-side computations that must not run on clients. **Decided (Local Mode, Addendum 3.19): trip generation, cloning, and the post-trip review run client-side instead** — quantity/conditions/dedup resolution (FR-15.2/2.3), the FR-12 clone plan, and FR-9.2 proposal generation are pure client logic committed as ordinary push mutations, so Local Mode keeps feature parity without a server. The `POST /trips`, `POST /trips/{id}/clone`, `POST /trips/{id}/archive`, and review rows below are therefore **not implemented as endpoints**:

| Endpoint | Purpose |
|---|---|
| ~~`POST /trips`~~ | superseded: the M3 wizard generates client-side and pushes trips (master partition) + travelers/trip_items (trip partition) |
| ~~`POST /trips/{id}/clone`~~ | superseded: FR-12 clones client-side (`planClone` + ordinary mutations — traveler/container links remapped, quantities carried over unchanged), same cascade as trip generation |
| ~~`POST /trips/{id}/archive`~~ | superseded: archiving is a plain `trips.status` upsert on the master partition. Open server-side follow-up: the NFR-4.2a conflict-log compaction on archive has no trigger yet |
| ~~`GET /trips/{id}/review`~~ / ~~`POST /trips/{id}/review/{proposalId}`~~ | superseded: M14 derives proposals client-side from FR-9.1 flags and current template state (applied cards vanish on recomputation → resumability for free); apply/fork are ordinary master mutations, "Never ask again" is a device-local dismissal store scoped to the item–template pair |
| ~~`POST /import/analyze`~~ · ~~`POST /import/commit`~~ | superseded: the M15 wizard parses/analyzes/commits client-side (FR-19.4 lists the import as Local-Mode parity). CSV only — XLSX deferred (parser dependency vs NFR-4.3; spreadsheets export CSV). NFR-4.7 transactionality is approximated: full pre-validation before enqueue, parents-first ordering, idempotent replay — there is no cross-mutation server transaction |
| `GET /templates/{id}/export` · `POST /templates/import` | Addendum FR-18.2/18.4: portable YAML template export/import |
| `GET /trips/{id}/export.yaml` · `POST /trips/import` | Addendum FR-18.3/18.4: portable YAML trip export/import — distinct from `export.csv` below (NFR-4.5), which is a flat data dump, not round-trippable. Export requires trip membership (403 `forbidden` otherwise), same as `export.csv` and the conflicts endpoint |
| `GET /export/full` · `GET /trips/{id}/export.csv` | NFR-4.5 — implemented: full export is a versioned JSON envelope `{version, exported_at, data:{table:[rows]}}` filtered to the caller's pull visibility (users/avatars excluded); CSV columns `item,category,quantity,packed_count,mode,traveler,container` |
| `GET /me` | Own identity `{user_id, display_name, is_instance_admin}` — the client needs its `users.id` to address the avatar/display-name endpoints (M17 profile; `PUT /users/{id}/avatar` and `PUT /users/{id}/display-name` accept only the caller's own id — 403 `forbidden` for any other, invariant: identity claims in the path are never trusted); the admin flag decides whether M20's entry point renders (FR-23.2, endpoints enforce regardless) |
| `GET /users` | Instance user directory `{users:[{user_id, display_name}]}`, ordered by name, deactivated accounts excluded (FR-23.3) — backs the M3 sharing picker (FR-4.5). Any authenticated user may list; a self-hosted instance's roster is not a secret to its users |
| `GET /items/{id}/image` · `PUT /items/{id}/image` · `DELETE /items/{id}/image` | Addendum FR-22 — implemented: one optional reference photo per master item. GET is public (like avatars, ADR-002), streams `image/jpeg` with `ETag` = `items.image_hash`, 404 when absent. PUT/DELETE need only authentication, **no trip role** (FR-22.6 — items carry no trip association); PUT validates `image/jpeg` and ≤150 KB (FR-22.4, mirrored by the `item_images` CHECK) and stamps `items.image_hash` through the master change-log with a fresh server HLC, so other devices pull the hint on their next master pull. The BLOB lives in `item_images`, outside the sync envelope; `image_hash` is the only synced signal. Local Mode writes the blob to IndexedDB with a client-computed hash instead |
| `GET /admin/users` | FR-23.2 — implemented: instance-admin only (403 `forbidden` otherwise, like every `/admin/` route), all provisioned accounts `{user_id, display_name, email, created_at, is_instance_admin, deactivated_at, trip_count, template_count}` ordered by name |
| `POST /admin/users/{id}/deactivate` · `POST /admin/users/{id}/reactivate` | FR-23.3 — implemented: deactivation revokes access (403 `account_deactivated`), deletes the account's push subscriptions, and suppresses new notifications; data and attributions stay untouched. Deactivating an admin → 409 `admin_undeactivatable` (remove from `JITPACK_ADMIN_EMAILS` first); unknown id → 404. Both idempotent. Reactivation restores access; the client re-registers Web Push on next app start |
| `DELETE /admin/users/{id}/avatar` · `DELETE /admin/users/{id}/display-name` | FR-23.4 profile intervention — implemented: avatar cleared (image + mime); display name reset to `''` and re-stamped from the IdP's claim at the account's next login. Moderation, not a lock — the user may set both again |
| `GET /notifications` | FR-6.2 — implemented: own notifications newest first (`?unread=1` filters, `?limit=` ≤ 200), each `{id, kind, payload, created_at, read_at}`. Kinds: `delegation` (a push set `packer_user_id` to another member), `mention` (`@display-name` in a comment body, case-insensitive, name may contain spaces), `task` (task comment on an item whose packer is another member; a packer who is also mentioned gets only the task). `payload` carries the FR-6.3 deep-link context: `trip_id`, `item_id`, `comment_id`, `actor_id`, `actor_name`, `item_name`, `preview` (comment excerpt ≤ 120 chars). Created server-side during push handling; suppressed per-kind by the target's M17 prefs; never in Single-User Mode (FR-17.3). Notification rows never flow through pull |
| `POST /notifications/{id}/read` | FR-6.2 — implemented: stamp `read_at`; owner-scoped (foreign id → 404), idempotent |
| `GET /me/notification-prefs` · `PUT /me/notification-prefs` | UI-Spec M17 — implemented: per-kind toggles `{"delegation":bool,"mention":bool,"task":bool}`; missing keys default to enabled, unknown keys are dropped. Checked at *creation* time, so a disabled kind produces neither push nor in-app notification |
| `GET /push/vapid-key` · `POST /push/subscriptions` · `DELETE /push/subscriptions` | NFR-4.6 — implemented for Web Push: the server generates its VAPID keypair on first use and persists it next to the data (`server_keys`); `vapid-key` hands the public key to `pushManager.subscribe`, POST registers the browser's `{endpoint, keys:{p256dh, auth}}` (endpoint = identity, re-registering rebinds), DELETE (owner-scoped, `{endpoint}` body) is the M17 opt-out. Sends are RFC 8291 `aes128gcm`, detached from the request; a push service answering 404/410 drops the subscription. Message body: `{notification_id, kind, payload}` — same payload as `GET /notifications`. Operator contact via `JITPACK_PUSH_CONTACT` (VAPID `sub`). UnifiedPush/FCM/APNs remain unimplemented — there is no native mobile build yet; the WebSocket stays the universal in-app fallback |
| ~~`GET /suggestions/trips/{id}`~~ | FR-14.2 quantity suggestions — **superseded**: computed client-side (`src/domain/suggestions.ts`, duration-normalized median of the series' last three trips) from already-synced series trips, like generation/analytics/review, so it works in Local Mode with no round-trip |
| `GET /trips/{id}/conflicts` | Per-trip conflict log for the G-2 view (NFR-4.2a) — read-only: `{conflicts:[{id, entity_table, entity_id, field, losing_value, winning_value, resolved_at}]}`, newest first; conflict rows never flow through pull |

All RPC results materialize as ordinary `change_log` entries — clients see the outcome through the normal pull, never through the RPC response body (P-1). RPC responses return only `{ok, pull_hint}` plus operation-specific metadata (e.g., import summary). **Decided: template changes use lazy discovery** — there is no `template.changed` WebSocket event; a consumer of a shared template sees edits the next time it pulls its own master partition, keeping the event catalog (§7) minimal and the footprint goal (NFR-4.3) intact.

## 9. Error Model & Limits

* Errors: `{ "error": { "code": "trip_not_found" | "forbidden" | "validation" | "conflict" | "rate_limited", "message": "…", "field": "…" } }` with matching HTTP status (404/403/422/409/429).
* Limits: push batch ≤ 200 mutations; pull limit ≤ 1000; request body ≤ 5 MB (import: 20 MB); WebSocket idle timeout 5 min with client ping.
* `GET /health` unauthenticated for container health checks.

## 10. Versioning & Compatibility

* Path-versioned (`/api/v1`). Additive changes (new fields/tables in pull rows) are non-breaking — clients must ignore unknown fields and tables (forward compatibility for staggered app updates).
* The server rejects pushes referencing unknown tables/fields with `validation`, ensuring old servers fail loudly against newer clients.

---

## Decisions (Resolved)

All decisions originally listed as open here have been resolved and are now recorded directly in their owning section: field-group granularity (§6, no `mode`+`state` grouping), lock timeout (§7, 15 min default, env-configurable), and master-partition scope for shared templates (§8, lazy discovery). No open decisions remain in this document.
