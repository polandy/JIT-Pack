# Sync Protocol & API Specification — „JIT-Pack" (v1.3)

**Document Status:** Proposed for Review
**Basis:** ADR-001 v2 (Go + embedded SQLite), Schema v0.3 (`change_log`, `updated_hlc`), NFR-4.1/4.2/4.2a, UI-Spec G-2/G-4/G-5/G-10.
**Revision Note (v1.3):** Adds four RPC endpoints (§8) for the new portable YAML template/trip export-import (Addendum 3.18): `GET`/`POST` pairs for templates and trips, explicitly distinguished from the existing NFR-4.5 CSV/full-JSON export endpoints. Also corrects a stale "Schema v0.2" reference to v0.3. No other changes from v1.2.
**Base URL:** `/api/v1` — JSON only, UTF-8. All timestamps ISO-8601 UTC.

---

## 1. Design Principles

* **P-1 (One read path):** Clients receive data exclusively via the **pull endpoint**. WebSocket events are thin "something changed" pings that trigger a pull — never data carriers. One code path serves initial load, reconnect, offline catch-up, and realtime.
* **P-2 (One write path):** Clients write exclusively via the **push endpoint** from a local outbox — also while online. "Online mode" is just "outbox drains fast" (UI-Spec G-5).
* **P-3 (Partitioned sync):** Two partition types: one per **trip** (trip_items, travelers, containers, comments, conflict_log) and one **master partition per user** (items, categories, templates, template_items, trip_series, destination_*, trips metadata, trip_members).
* **P-4 (Server is merge authority):** Conflict resolution per NFR-4.2a happens on the server during push. Clients never merge; they apply pulled state verbatim.
* **P-5 (Idempotency everywhere):** Every mutation carries a client-generated `mutation_id` (UUID). Replays return the recorded result.

## 2. Authentication

* **Flow:** OIDC Authorization Code + PKCE against the configured IdP (Authelia). Native apps use a secure in-app browser (Section 2 of the PRD).
* **Token exchange:** `POST /auth/token` — body `{ "code": "...", "code_verifier": "...", "redirect_uri": "..." }` → `{ "access_token": <JWT>, "refresh_token": "...", "expires_in": 3600 }`. First successful exchange JIT-provisions the user row.
* **Refresh:** `POST /auth/refresh` with the refresh token; refresh tokens are long-lived (configurable, default 90 days) to survive offline periods (NFR-4.4).
* **JWT claims:** `sub` (users.id), `oidc_sub`, `exp`, `iat`. All endpoints below require `Authorization: Bearer <JWT>`; validation is stateless (no IdP round-trip).

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

Same envelope for the user's master partition. `change_log.trip_id` is NULL for master rows (schema note: column becomes nullable in migration 005); visibility is filtered per user (own + published templates, member trips).

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
* Server → client envelope: `{"type": "<event>", "payload": {…}}`.
* Client → server frames: `{"subscribe": ["trip:<id>", "user:<own-id>"]}`, `{"unsubscribe": ["trip:<id>"]}`, and `{"cursor": {"trip_id": "<id>", "seq": <n>}}` — the client reports its pull cursor after each trip pull so the server can recompute `in_sync`. `user:` channels are accepted but carry no events yet (`notification.created` will use them).
* **Event catalog (server → client), all thin:**

| Event | Payload | Client reaction |
|---|---|---|
| `trip.changed` | `{trip_id, seq}` | pull if `seq > local_cursor` |
| `master.changed` | `{seq}` | pull master partition |
| `item.locked` / `item.unlocked` | `{trip_id, item_id, by_user, name}` | render lock overlay (G-3) — ephemeral, not persisted |
| `presence` | `{trip_id, users:[{user_id, device_count, in_sync}]}` | avatars + group-sync badge in M4 header (UI-Spec G-10) |
| `notification.created` | `{notification_id}` | pull + OS notification if app foregrounded |

* Locks (`packing_now`) are **also** persisted via normal mutations; the ephemeral event only lowers latency. Offline devices converge via pull — a stale lock older than 15 min is ignored by clients (timeout rule). **Decided: 15 minutes is the shipped default, configurable via an environment variable** per the declarative-config principle (Section 2), not adjustable from within the UI.
* **Group-sync computation (`presence.users[].in_sync`):** for each WebSocket connection subscribed to `trip:<id>`, the server tracks the connection's last client-reported pull cursor (the `cursor` frame above). `in_sync` is `true` when that cursor is at or beyond the trip's current `change_log` head sequence. This is necessarily best-effort: it reflects only devices currently connected via WebSocket, says nothing about a fully offline device's local outbox, and is advisory UI signal only (UI-Spec G-10) — it never gates any mutation or pull.

## 8. Non-Synced Operations (RPC-style REST)

Server-side computations that must not run on clients:

| Endpoint | Purpose |
|---|---|
| `POST /trips` | Create trip **and** generate items from templates: body carries template_ids, travelers, attributes; server evaluates formulas (FR-1.3/1.5), conditions (FR-15.2), dedup (FR-2.3) |
| `POST /trips/{id}/clone` | FR-12.1/12.2 with carry-over options |
| `POST /trips/{id}/repack` | FR-11.1/11.2: bulk reset, returns affected count |
| `POST /trips/{id}/archive` | Archive + compute review proposals (FR-9.2) |
| `GET /trips/{id}/review` / `POST /trips/{id}/review/{proposalId}` | Fetch / apply-skip-never review cards |
| `POST /import/analyze` · `POST /import/commit` | FR-16.x wizard: multipart upload → mapping preview → transactional commit |
| `GET /templates/{id}/export` · `POST /templates/import` | Addendum FR-18.2/18.4: portable YAML template export/import |
| `GET /trips/{id}/export.yaml` · `POST /trips/import` | Addendum FR-18.3/18.4: portable YAML trip export/import — distinct from `export.csv` below (NFR-4.5), which is a flat data dump, not round-trippable |
| `GET /export/full` · `GET /trips/{id}/export.csv` | NFR-4.5 |
| `POST /push/subscriptions` | Register Web-Push/UnifiedPush endpoint (NFR-4.6) |
| `GET /suggestions/trips/{id}` | FR-14.2 quantity suggestions (duration-normalized median) |

All RPC results materialize as ordinary `change_log` entries — clients see the outcome through the normal pull, never through the RPC response body (P-1). RPC responses return only `{ok, pull_hint}` plus operation-specific metadata (e.g., import summary). **Decided: published-template changes use lazy discovery** — there is no `template.changed` WebSocket event; a consumer of a published template sees edits the next time it pulls its own master partition, keeping the event catalog (§7) minimal and the footprint goal (NFR-4.3) intact.

## 9. Error Model & Limits

* Errors: `{ "error": { "code": "trip_not_found" | "forbidden" | "validation" | "conflict" | "rate_limited", "message": "…", "field": "…" } }` with matching HTTP status (404/403/422/409/429).
* Limits: push batch ≤ 200 mutations; pull limit ≤ 1000; request body ≤ 5 MB (import: 20 MB); WebSocket idle timeout 5 min with client ping.
* `GET /health` unauthenticated for container health checks.

## 10. Versioning & Compatibility

* Path-versioned (`/api/v1`). Additive changes (new fields/tables in pull rows) are non-breaking — clients must ignore unknown fields and tables (forward compatibility for staggered app updates).
* The server rejects pushes referencing unknown tables/fields with `validation`, ensuring old servers fail loudly against newer clients.

---

## Decisions (Resolved)

All decisions originally listed as open here have been resolved and are now recorded directly in their owning section: field-group granularity (§6, no `mode`+`state` grouping), lock timeout (§7, 15 min default, env-configurable), and master-partition scope for published templates (§8, lazy discovery). No open decisions remain in this document.
