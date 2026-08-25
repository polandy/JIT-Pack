# Sync Protocol & API Specification — „JIT-Pack" (v1.3)

**Document Status:** Proposed for Review
**Basis:** ADR-001 v2 (Go + embedded SQLite), Schema v0.3 (`change_log`, `updated_hlc`), NFR-4.1/4.2/4.2a, UI-Spec G-2/G-4/G-5/G-10.
**Revision Note (v1.3):** Added four RPC endpoints (§8) for portable YAML template/trip export-import (Addendum 3.18): `GET`/`POST` pairs for templates and trips, explicitly distinguished from the existing NFR-4.5 CSV/full-JSON export endpoints. **All four were removed again on 2026-08-23 (ADR-025)** — they were a second implementation of a format that already had one on the client, and it had silently fallen behind; see the §8 row. Also corrects a stale "Schema v0.2" reference to v0.3. No other changes from v1.2. **Amended 2026-08-22:** §5 and P-3 spell out that a trip mutation is confined to the trip its endpoint names. The rule was always the intent — it had never been written down, and the server did not enforce it. **Amended again the same day:** §5 now prints the push *response* envelope and names its `outcome` key, and states that a constraint violation is a `rejected` mutation rather than a 5xx. Both were rules the document implied and never spelled out, and both had drifted in the code — the client read a `status` key no server has ever sent, and the trip partition answered 500 where the master partition answered `rejected`. **Amended a third time the same day:** §5 states what `pull_hint` is *for* — a signal that a pull is worth making, never the cursor to make it from. The client had been taking it as the cursor, which stepped over everything another device wrote while it was offline. **Amended a fourth time the same day:** §4 spells out two consequences of "rows are full snapshots" that the document had left to be inferred — a snapshot carries syncable columns only, so a generated one is derived rather than read; and a client's *optimistic* row has to be a full snapshot too, or it blanks what it omits, permanently in Local Mode. **Amended a sixth time the same day:** §5 states what `merged` obliges the client to do — the outcome existed on the wire and was read nowhere, so a user was never told an edit of theirs had been overwritten. **Amended a fifth time the same day:** §8 gains `GET /conflicts/master`. NFR-4.2a's audit had one endpoint and two partitions, so every master-partition loser — a group renamed twice, a trip's own dates — was logged and reachable by nothing. **Amended 2026-08-23 (NFR-4.14, ADR-026):** §9 no longer lists the error codes — `internal/api/wire.go` declares them and the client's copy is generated from it, because the list here had drifted into naming two codes nothing sends and omitting eleven that are sent. The envelopes in §4/§5/§7/§8 are prose about a shape that now has one machine-checked declaration; where the two ever disagree, `wire.go` is what runs. **Amended 2026-08-23:** §6 states that a conflict entry records an *overwrite*, not a lost race — a field the losing push carried along unchanged is neither logged nor counted, and the outcome stays `applied`. The merge had compared clocks and never values, so a whole-group edit filled the log with `2026 → 2026` rows and the client announced overwritten fields to users whose data was untouched. **Amended an eighth time the same day (NFR-4.14):** the paths themselves are declared in `internal/api/wire.go` as well, and the client's builders are generated from that declaration — so a path in this document, like an error code, describes something with one machine-checked source. **Amended 2026-08-24 (NFR-4.14, ADR-027):** every path in this document now names its **scope** first and its resource second — `/trips/{id}/sync` and `/master/sync` in §4/§5, `/master/conflicts` in §8 — and the full export names its format, `/me/export.json`. The shapes had disagreed three ways about the same two ideas (which partition, which format), so a reader who knew two endpoints could not predict the third. The old paths are gone rather than aliased. **Amended 2026-08-24 (NFR-4.14):** every response body listed in §8 is now a type declared in `internal/api/wire.go` and generated into the client, not a map literal at the call site — the admin overview, the notification list and its preference set, the instance config and the auth pair were the four families still outside the contract. No key changed; the shapes are the ones this document already describes, now machine-checked. The *request* body of the preference endpoint stays an untyped map on purpose: an absent key there means the kind stays enabled, which a struct would decode as disabled. **Amended a seventh time the same day:** §6 states what "field-level" LWW requires of the server — a clock *per field*, persisted beside the row — and narrows rule 2 to the two states it names. The server had kept one `updated_hlc` per row and compared every field against it, so a pack made offline lost to any unrelated later edit of the same row; the code had compensated by letting every incoming `packed` win regardless of HLC, which silently undid later deliberate unpacks and skips and logged nothing (ADR-022). **Amended a fifth time the same day:** §8 gains `GET /conflicts/master`. NFR-4.2a's audit had one endpoint and two partitions, so every master-partition loser — a group renamed twice, a trip's own dates — was logged and reachable by nothing. **Amended 2026-08-25 (data-model review):** four corrections, each a place where this document and the code had drifted apart. §4 now says a snapshot carries `updated_hlc` beside the syncable columns — it always described the field and the server never sent it, so the client's §3 clock-advance step had never once run. §4 also states that every foreign-key cascade is tombstoned explicitly, and names the two that were not: a deleted trip's master-partition children, and a deleted trip item's comments. §4's tombstone-retention sentence now admits that nothing compacts anything yet. P-3 stops listing `conflict_log` as a trip-partition table, which it never was, and §8's conflict envelope names the `mutation_id` and `actor_user_id` it has been sending all along. **A sixth correction the same day:** §5 gains the refusal vocabulary. The `error` field beside a `rejected` outcome had been declared since v1.0 and was written only for the two validation errors raised before the store — so an authorization denial, an out-of-partition mutation, a template scope rule, a constraint and a blocked delete were one indivisible word, and the client parked the mutation with nothing to show. §5 now lists the five values and states the rule under the worst of them: a delete other rows still depend on is refused rather than cascaded, because FR-9.2's provenance outlives the Vorlage it names. **A fifth correction the same day, from the review's actor-stamping half:** §5's "Server-stamped fields" bullet described a rule with two holes in it — comment `author_id` was stamped on `insert` alone, so an `upsert` could rewrite an existing comment's author, and the two G-3 claim columns were written only inside the state switch, so a mutation carrying a claim holder and no `state` could forge one. Both columns are stripped from every mutation now and written back only where the server decides them, and the bullet says so.
**Base URL:** `/api/v1` — JSON only, UTF-8. All timestamps ISO-8601 UTC.
**Note on migration numbers:** this document dates several schema facts as "since migration NNN". Those numbers are **history, not files** — the migration chain was retired on 2026-08-19 (ADR-018) in favour of one always-current `internal/store/schema.sql`. The dates still say when a rule started applying; the numbers no longer point at anything to open.

---

## 1. Design Principles

* **P-1 (One read path):** Clients receive data exclusively via the **pull endpoint**. WebSocket events are thin "something changed" pings that trigger a pull — never data carriers. One code path serves initial load, reconnect, offline catch-up, and realtime.
* **P-2 (One write path):** Clients write exclusively via the **push endpoint** from a local outbox — also while online. "Online mode" is just "outbox drains fast" (UI-Spec G-5).
* **P-3 (Partitioned sync):** Two partition types: one per **trip** (trip_items, travelers, containers, comments, trip_generated_positions) and one **master partition per user** (items, tags, item_tags, templates, template_items, template_includes, template_item_tasks, item_dependencies, trip_series, destination_*, trips metadata, trip_members, trip_template_sources, trip_applied_changes). Three of those are trip-scoped yet travel the master partition — trip_members, and since migration 023 the FR-27.4 registry and applied-changes log. **Partition membership follows who reads a table, not what it is about:** M2 renders its applied-changes chip and M8 its blast-radius note with no trip partition loaded, while the FR-27.4 ledger is only ever read beside the rows it describes and belongs with them. Visibility on the master-partition trip-scoped tables is trip membership (as for trip_members); writes are allowed to any member, since registering a source and logging an applied change are consequences of ordinary editing rather than administration. **A partition is a boundary in both directions:** membership is checked for the trip an endpoint names, so a mutation that reaches past it is refused rather than applied — see §5. `conflict_log` was listed among the trip partition's tables until 2026-08-25 and never belonged there: it carries no HLC columns, is in no partition whitelist, and §8 says in as many words that conflict rows never flow through pull. It is *scoped* by `trip_id` exactly as `change_log` is, and read over its own endpoint.
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

### `GET /trips/{tripId}/sync?cursor={seq}&limit={n}`

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

* **`has_more` is a client obligation, not a hint (clarified 2026-08-25).** A partition is routinely larger than one page — a decade of trips is — and a client that takes the first page and stops holds a fraction of the instance while believing itself synced. The client therefore **pulls in a loop until `has_more` is false**, applying each page and advancing its cursor before asking for the next, so a feed interrupted halfway keeps what it already took. It stops on `next_cursor` failing to advance as well as on `has_more`, because a server that claimed more without moving the cursor would otherwise spin the loop for ever. **The cursor itself is deliberately not kept on the device outside Local Mode**: the pulled rows are not kept either — they live in the client's stores and go with the tab — so a device that remembered how far it had read and not *what* it had read would ask for the changes after that point, receive none, and render an empty app. Measured 2026-08-25: an instance of 717 master rows served a browser only its first 500, and the trips (which sit behind them in `change_log`) never arrived at all; persisting the cursor without the rows turned that into no rows at all. E2E-SYNC-01 holds it.
* Rows are **full snapshots** of the current state (not diffs) — pulling the same entity twice is harmless, which keeps the client applier trivial: `INSERT OR REPLACE` / `DELETE`.
  * A snapshot carries the table's **syncable columns**, plus `updated_hlc` — and nothing else (`syncableColumns`, `internal/store/store.go`). A generated column such as `trips.duration_days` is in neither direction of the protocol. **A client derives such a value from the columns it does receive** rather than reading it off the row — `durationDays()` mirrors the schema's own definition — because reading it leaves every pulled trip without one.
  * **`updated_hlc` is the one column that travels without being writable** (added 2026-08-25). §3 has every client advance its clock to the highest HLC it has observed, and a pull snapshot is the only place a device meets the clock of a write it did not make; the field was described here from the start and was never actually sent, so the client's observe step — which reads exactly this field — had been dead code since it was written. A device whose wall clock lags therefore kept minting HLCs older than writes it had already seen, and lost its own later edits to them. It stays off `syncableColumns`, so it is readable and never settable: P-4 says clients do not merge, and a settable row clock would let one push backdate another device's write out of existence. **A clock that cannot be parsed is ignored, not fatal** (added 2026-08-25, on merging this with the multi-page pull): the server stores an HLC verbatim and never checks its device id, so one buggy producer can put an unparseable value in a shared feed — and since observing is an optimisation for causality rather than a gate on rendering, a throw there would make every *other* row of that partition unreachable on every device for as long as the row exists. The client skips such a value and logs it.
  * *Full snapshot* is also what a client's **optimistic** row has to be: a store applies a change by replacing the row it holds, so an optimistic row built from a partial upsert's fields blanks every column it omits. In Server Mode the next pull repairs that; in Local Mode there is no next pull, and the omitted column is gone. `E2E-M22-08` asserts it on the one that hurts most — `trips.status`, which decides whether the trip appears on M2 at all.
* Tombstones (`deleted: true`) come from `change_log.deleted`. Open Decision #2 of Addendum v2.0 says they are retained until the trip is archived; **nothing compacts them today** — archiving a trip touches no log, and the `mutations` idempotency memo grows without bound beside them. Both are deliberate for a single-household instance and are named here so the absence is a known cost rather than a claim the code does not keep.
* **Every foreign-key cascade is tombstoned explicitly** (stated 2026-08-25). SQLite deletes child rows inside the engine, where no change feed can observe them, so a cascade without tombstones leaves those rows on every other device forever. `cascadeChildren` collects the children before the parent is deleted and appends a tombstone for each: templates → their positions, position tasks, includes and trip sources; items → tags and dependencies; tags → their assignments; series → profile and checklist; **trips → trip_members, trip_template_sources and trip_applied_changes**; and, the trip partition's only one, **trip_items → their comments**. A trip's remaining children need no tombstones for the opposite reason: `change_log.trip_id` cascades too, so the trip partition's whole feed is deleted with the trip, and the master feed is what carries the news.
* The server compacts consecutive changes to the same entity within one response (only the latest snapshot is sent).

### `GET /master/sync?cursor={seq}&limit={n}`

Same envelope for the user's master partition. `change_log.trip_id` is NULL for master rows (schema note: column becomes nullable in migration 005); visibility is filtered per user (member trips and their rosters, own series; tags, item_tags, items and templates are instance-wide per the FR-1.6 MVP simplification).

`item_dependencies` syncs through the master partition since migration 011 (Addendum 3.20, FR-20.1): rows carry `{item_id, depends_on_item_id, mode, quantity}` (plain integer since migration 014; formulas retired 2026-08-08) and are shared like the items they connect — writable and visible to every authenticated user. Deleting an item cascades its relations (both directions) and tombstones them. A duplicate `(item_id, depends_on_item_id)` pair, a self-reference, or an unknown endpoint is `rejected` (UNIQUE/CHECK/FK). Cycle prevention is save-time client validation; the client resolver also tolerates cycles that slip in from another device.

`template_includes` and `template_item_tasks` sync through the master partition since migration 016 (§3.27, FR-27.1/27.7). An include row carries `{template_id, included_template_id}` and is the reference that makes a Ferien-Vorlage composed rather than copied; the scope rule (parent a Ferien-Vorlage, child a Gruppe) is enforced in the store so a violation is an ordinary `rejected` mutation rather than an opaque trigger abort, and a duplicate pair or a self-reference is `rejected` by UNIQUE/CHECK. Deleting either side cascades and tombstones the row. A task row carries `{template_item_id, task}` — one row per task rather than a JSON column on `template_items`, because field-level LWW (§6) would treat a blob as one field and lose concurrent edits. **Ordering is not guaranteed:** a pull can deliver an include before the group it points at, so the client resolver drops an unresolvable include rather than inventing a phantom group.

`items.icon` and `templates.icon` (§3.28, FR-28.1/28.8/28.9 — **built 2026-08-22**, ADR-021) are ordinary synced columns carrying one emoji, resolved by field-level LWW like `name`. They are deliberately **not** given the `image_hash` treatment beside them: that split exists because BLOBs bloat every pull envelope (ADR-002), and a mark is a handful of bytes. The server validates a length cap only (`capMark`, mirrored by a CHECK on both tables) and otherwise treats the value as opaque text — it does not try to decide whether a string "is an emoji", since Unicode grows every year and such a check would reject next year's valid input on a purely cosmetic field. A trip row carries no mark of its own (FR-28.7): the client resolves it through `trip_items.source_item_id`, so no trip partition changes.

`trip_members` syncs through the master partition since migration 009 (FR-4.5/4.7): rows carry `{trip_id, user_id, role}`, are managed only by Owner/Admin, never carry `role: "owner"` from a client (the creator's server-created row is the only Owner and is immutable — no demotion, no removal), and a duplicate `(trip_id, user_id)` insert is `rejected`. Two server-side feed guarantees make late sharing work: (a) creating a trip also logs the auto-created owner membership row, and (b) applying a membership grant re-logs the `trips` row, because the new member's pull cursor is already past the trip's original change_log entry. Removal delivers a plain tombstone; the removed member's device keeps its local copy until it discards it (lazy, same semantics as trip deletes).

## 5. Push Protocol

### `POST /trips/{tripId}/sync` (and `POST /master/sync`)

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
* **Server-stamped fields.** Before merging, the server overwrites the actor columns from the authenticated pusher, so a client value is never trusted (`stampActor`). Comment `author_id` is stamped on **insert** and **stripped from every other op** (corrected 2026-08-25): authorship is decided once, when the comment comes into being, and re-stamping a later op would be the opposite forgery — flagging a foreign comment as an FR-7.2 task is an `upsert`, and would transfer its authorship. An `upsert` that would *create* a comment therefore carries no author, meets the `NOT NULL` column and comes back as an ordinary `rejected` mutation rather than attributed to whoever pushed it. On `trip_items`, the two claim columns `packing_now_by`/`packing_now_at` (FR-5.3) and the two record columns `packed_by_user_id`/`packed_at` (FR-25.17/FR-25.19) are **stripped from every mutation first** and written back only by the `state` the mutation carries: `packing_now` names the pusher as the G-3 claim holder and clears the record, `packed` records the pusher as the packer and clears the claim, and **every** other state — `open`, `partial`, `skipped` — clears both. A mutation carrying no `state` at all therefore changes neither, which is the point of the strip: without it a push that touches no state could name any claim holder it liked, and the FR-5.7 takeover and M4's row read that holder as authoritative. Ending a claim is the server's job for the same reason starting one is — the release used to be the client sending `packing_now_by: null`, and a released claim may not depend on the client saying so. The FR-5.7 **takeover** does not travel this path at all: it has its own endpoint (§8) and is stamped there. `packer_user_id` is *not* stamped: since FR-25.19 it carries the assignment, which is the client's to choose. `trips.year` (migration 021) is `NOT NULL` — a `trips` insert without it is rejected rather than defaulted, because a trip with no year cannot be placed in time (FR-2.1b); `end_date` is nullable from the same migration. `trip_items.packed_at` (migration 020) is the same record's *when* (FR-25.17) and follows it exactly — written with the record, cleared with it, stripped from every mutation first — with one deliberate difference: a **client-supplied RFC 3339 value is kept**, because packing happens offline and the push can land days after the tap. A clock is not an identity claim, so invariant 3 does not reach it; an unparseable value is replaced by the server's own time rather than stored. `packing_now_at` follows the claim on exactly those terms.
* **Response** per mutation, under the key **`outcome`**: `applied` | `merged` (some fields lost per conflict rules, `conflicts[]` lists them) | `duplicate` (mutation_id seen before, recorded result returned) | `rejected` (validation/permission, with `error`). The envelope, written out because naming only the *values* was how the client came to read a key the server has never sent:

```json
{
  "results": [
    { "mutation_id": "uuid-1", "outcome": "applied" },
    { "mutation_id": "uuid-2", "outcome": "merged",
      "conflicts": [ { "field": "quantity", "losing_value": 9, "winning_value": 5 } ] },
    { "mutation_id": "uuid-3", "outcome": "rejected",
      "error": "column not syncable: trip_items.nope" }
  ],
  "pull_hint": { "next_cursor": 4712 }
}
```

  **`merged` is an outcome the client has to act on, not a quieter `applied`.** The mutation *did* apply, so it leaves the queue like any other — but `conflicts[]` names fields of this device's change that the server dropped, and until 2026-08-22 the client read that array in no code path at all. It now counts them per push and reports one signal per push (never per conflict — a reconnect drains a whole queue), which G-2 turns into a toast leading to the partition's conflict log and a standing line in its detail sheet. The count is this session's; the durable record is the log.

  `internal/api/testdata/push_response.json` holds exactly this document, and both sides are tested against that file rather than against their own idea of it (`TestPushResponse_MatchesTheSharedWireFixture` and `client/src/composables/__tests__/pushContract.spec.ts`).
* **A `rejected` mutation names its reason** (added 2026-08-25). The `error` field beside the outcome was declared from the start and written only for the two validation errors the handler raises before the store is reached, so every *store-side* refusal — an authorization denial, a mutation aimed outside its partition, a structural template rule, a constraint, a delete other rows still depend on — reached the client as the bare word `rejected`. Per P-5 any outcome is an acknowledgement, so the client's outbox drops the mutation: the user's change was gone, their screen still showed it as done, and nothing anywhere could say why. The refusals now carry one of a **closed vocabulary**, declared once as `store.RejectReason` and sent verbatim in `error`:

  | value | means |
  |---|---|
  | `not_authorized` | a rule about the person (FR-4.5/4.7): they may not touch this row |
  | `out_of_scope` | the mutation named a trip other than the endpoint's (P-3) |
  | `still_referenced` | a delete other rows still depend on — see the bullet below |
  | `template_scope` | the FR-27.1 two-level rule, or an FR-27.6 scope switch that would break it |
  | `constraint_violated` | the schema itself refused: a foreign key, a `UNIQUE`, a `CHECK` |

  It is a vocabulary rather than a sentence because the sentence belongs to whoever renders it, in a language the server does not know. Values outside the set — the validation errors, or an older server saying nothing — are diagnostics, and the client deliberately does not render them as copy. G-2's detail sheet names the most recent refusal beside the parked count.
* **A delete the data still depends on is refused, not cascaded** (stated 2026-08-25). `trip_items.source_template_id` carries no `ON DELETE` clause on purpose: FR-9.2 has an archived trip keep naming the Vorlage its rows came from, so a Vorlage that ever generated a trip item can no longer be deleted, and the push answers `still_referenced`. The same holds for the other deliberately restricting references — a master item a template position or a trip item names, a series a trip names, a traveler or container a trip item names. The refusal is asked for before the delete is attempted (the driver's constraint message is not a contract to branch on), and it is the conservative half of a tradeoff: `ON DELETE SET NULL` would silently strip provenance from finished trips, and cascading across the partition boundary would need one master mutation to write tombstones into N trip partitions. **Whether the permissive behaviour is wanted instead is an owner decision**, not a defect.
* **A constraint the database refuses is `rejected`, never a 5xx.** A foreign key whose target another device deleted, a quantity merged below what is already packed, a partial upsert whose row is gone: the statement fails, the transaction survives, and the mutation is answered as the refusal it is. Returning an error instead would make the whole batch a 500 — and per §5.1 a 5xx is the one answer the client keeps retrying, so the bad row would sit at the head of its queue and hold every mutation behind it for that partition indefinitely.
* After processing, the response includes `pull_hint: {next_cursor}` so the client immediately pulls its own (possibly merged) canonical state — closing the loop through the single read path (P-1). **It is a signal that a pull is worth making, never the cursor to make it from.** Its value is the highest `seq` *this push* wrote, which is later than anything another device wrote while this one was away; since a pull cursor is an exclusive lower bound (§4) and only ever moves forward, adopting the hint steps over that whole session and never offers it again — silently, the client having no way to learn what it skipped. **The client pulls from the last `next_cursor` a *pull* returned**, and 0 until one has. `E2E-FLOW-10` asserts it on the wire.

### 5.1 The client-side outbox is durable (B2, NFR-4.1)

The queue of unpushed mutations lives in IndexedDB (`jitpack-outbox`, one
record per mutation), not in the page. Three rules follow, and they are the
client's half of this protocol rather than a server change — the envelope is
untouched:

* **A mutation is written before it is pushed and removed when it is
  acknowledged.** Any per-mutation outcome counts as an acknowledgement,
  `duplicate` included.
* **A boot replays what is left, before the first pull.** Replaying is safe
  because of the `mutation_id` memo in P-5 — the second push returns
  `duplicate` and appends nothing to the change log — and because a mutation
  carries absolute field values rather than deltas. The `mutation_id` is
  minted once, at enqueue time, and stored with the mutation: a replay that
  re-minted it would be a second write, not a retry. Replaying *before* the
  pull is what keeps a local change that never left the device from being
  silently overwritten by the server's older copy of the same row.
* **A trip mutation is confined to the trip in its URL.** Authorization
  checks membership for that trip and nothing else, while every statement
  addresses its row by primary key — so the endpoint has to establish that
  the row is the trip's own, or the partition reaches into every other trip.
  A mutation is `rejected` when the row it names already belongs to another
  trip, when its own fields name another trip (both an injected insert and a
  row moved out of its trip), and when it would create a row without naming
  any trip at all. A delete of a row that no longer exists stays accepted:
  that is the ordinary idempotent retry, and it writes nothing. Without the
  rule the damage is not only a write — the `change_log` entry lands under
  the *pusher's* trip, so the next pull hands them the foreign row's whole
  snapshot while the trip that owns it is never told anything changed.
* **A refusal is parked, never retried.** A mutation answered `rejected`, and
  a whole batch refused with a 4xx that a retry cannot fix (anything but
  401/408/425/429), is moved out of the queue and kept on the device with the
  server's own reason. Keeping it queued would take every mutation behind it
  hostage — the whole partition would stop syncing because of one bad row.
  A network failure and a 5xx are *not* refusals: the batch stays queued.
  G-2 states how many are parked; **no screen lists them individually yet**
  — revisit when the first one is seen in the field, or when the trip-scoped
  conflict log grows a device-scoped sibling.

## 6. Server-Side Merge Algorithm (NFR-4.2a)

```
for each mutation m:
  if mutation_id already recorded → return recorded result        (P-5)
  if permission check fails (trip role, FR-4.5) → rejected
  if op == insert and id unknown → apply whole row, log change;
                                   every column's clock := m.hlc
  if op == delete → apply tombstone if m.hlc > row.updated_hlc, else merged(no-op)
  if op == upsert:
    for each field f in m.fields:
      rule 1 (additive): comments/tasks/flag_* setting TRUE are always applied
      rule 2 (terminal precedence), state group only, exactly these two pairs:
              incoming packed      on a packing_now row → applied regardless of HLC;
              incoming packing_now on a packed      row → merged (dropped) regardless of HLC;
              any other pair of states → rule 3
      rule 3 (field LWW): apply f iff m.hlc > clock(f-group)
    applied fields: clock(f) := m.hlc; dropped fields keep their clock
    dropped fields whose value differs from the row's
                   → conflict_log row (losing/winning value, mutation_id,
                     actor_user_id), returned in response
    a push whose every dropped field already held the incoming value
                   → applied: it lost the write and overwrote nothing
  row.updated_hlc = max(row.updated_hlc, m.hlc); append change_log
```

**The clock is per field, and it is stored.** "Field-level LWW" is only true if a field is compared against the write that last set *it*: every synced table carries `field_hlcs`, a JSON object `{field: hlc}` written by the merge and read by nothing else (it is not a synced column — clients never merge, P-4 — and does not travel in pull snapshots). A field with no entry is as old as the row (`updated_hlc`), which is the only safe reading of a row a non-merging path wrote; an insert stamps every column, because a default taken at insert time was written then. Without the per-field record, one `updated_hlc` per row made every older incoming field lose to *any* newer write of the row — a pack made offline at 10:00 was displaced by a container assigned at 10:30 — and that was masked for exactly one case by letting `packed` always win (ADR-022).

**Rule 2 is as narrow as it reads.** *Packed* beats *packing now* because the lock is transient and the pack is the fact it was waiting for; *packing now* never displaces *packed* for the same reason. Between two deliberate state decisions — a pack made offline against a later unpack or FR-5.5 skip — the later one stands and the earlier one is logged, because a person made both and only the clock can say which was the last word. The previous code let every incoming `packed` win regardless of HLC, which was silent data loss: the later decision was overwritten and, the group having applied, no conflict was written.

Field groups: `packed_count`+`state` merge as one unit (they are causally coupled per FR-5.4) and share one clock, the newer of the two; all other columns are independent fields. **Decided: no further grouping** — `mode` is not grouped with `state`; a procurement-mode change concurrent with a pack-state change is resolved as two independent LWW fields, not a coupled unit.

**A conflict is an overwrite, not a lost race** (corrected 2026-08-23). Losing the write and having a value overwritten are two different things, and only the second one is worth a log row: a field the push carried along unchanged — `end_date` riding with the `start_date` an FR-2.7 edit moved, the `name` beside a changed quantity — leaves the row holding exactly what that push wanted. Logging it anyway produced entries reading `2026 → 2026`, each with a revert button that restores what is already there, and made the outcome `merged` rather than `applied`, so the client announced overwritten fields to a user whose data no one had touched. The comparison is deliberately across types: a mutation's fields are decoded from the envelope's JSON and the row's are read from SQLite, so one quantity of 5 arrives as a `float64` and the other as an `int64`, and a boolean field is `true` on one side and `1` on the other. A value of a shape neither numeric, textual nor null is treated as different, so an unforeseen type logs a conflict rather than swallowing one.

**What the conflict log names.** Each dropped field is one row: entity, field, losing and winning value, and — since 2026-08-22 — the `mutation_id` that lost it and the `actor_user_id` who pushed it, both server-stamped. The mutation id groups the fields one push lost so a revert restores `state` and `packed_count` together; the actor is the person that revert belongs to and the one to tell (NFR-4.2a: audit **and** manual revert; the revert and the telling are the client's half and follow).

### 6.1 Manual revert (NFR-4.2a's second half) — implemented 2026-08-22

NFR-4.2a promises the log so users can audit **and manually revert**. A
revert is **an ordinary upsert with a fresh server HLC, resolved by the
algorithm above** — never a rewrite of the past (ADR-023). The server
builds it from the log entry itself (`entity_table`, `entity_id`, `field`,
`losing_value`) **plus every field the same `mutation_id` lost that merges
with it as one unit**, folds the row's current HLC into its own generator so a
device with a fast clock cannot leave the revert stale, stamps
`hlc.Next()`, and runs it through `Merge` -> persist -> `change_log`.

Four consequences follow, and all four are deliberate:

* **It wins by being newer, not by being special.** Every device pulls it
  through the normal feed; an offline device that pushes afterwards
  carries an older HLC and loses, as it should. A *later* edit by anyone
  beats the revert, exactly as it beats any other write.
* **The rules of §6 apply to it.** Rule 2 can refuse a revert: restoring
  `packing_now` onto a row that is now `packed` is the write the merge
  exists to drop, and it is answered `409 revert_refused` rather than
  silently swallowed. A deleted row is `409 row_deleted` — one logged
  field cannot rebuild a row.
* **A coupled field group is restored as a whole** (corrected 2026-08-23,
  found in review). `state` and `packed_count` are one fact (§6, FR-5.4),
  so restoring one without the other writes a row the state machine cannot
  describe — `state = packed` beside `packed_count = 0` on a quantity of
  five. The revert therefore carries the whole group: the tapped entry's
  field plus the sibling entries of the *same push* whose fields merge with
  it, all of them marked spent together. Independent fields stay
  independently revertable, because they are independent decisions — the
  log lists them apart for that reason. `sync.GroupedWith` is the one place
  the coupling is defined, shared with the merge itself so the two cannot
  drift.
* **The entry is spent, not erased.** `conflict_log.reverted` is set in
  the same transaction as the write, by a single guarded statement
  (`... WHERE id = ? AND reverted = 0`), so two devices cannot both
  restore one entry and any refusal below rolls the flag back with it. The
  loss itself stays in the log; a revert is a fact *about* the entry.

The `losing_value`/`winning_value` columns are what makes this possible at
all, and they were already there — as was the unused `reverted` flag. No
schema change was owed.


## 7. WebSocket — `GET /ws` (Upgrade)

* Auth via `?token=` query param (implemented) or first frame `{"auth": "<JWT>"}` (reserved, not implemented).
* **The parameter is omitted entirely when the client has no token** (clarified 2026-08-14). `wsAuth` promotes any *non-empty* `?token=` value to an `Authorization` header, so a client that interpolated an absent token anyway (`?token=null`) sent `Bearer null` — and a multi-user instance answered `401 invalid token` where the truth was `401 missing bearer token`. Absent means absent; a present token is percent-encoded. (Single-User Mode bypasses `authed` altogether, so it upgraded either way — the cost was the misleading diagnosis, not a refused connection.)
* **The handshake is same-origin, and the port is part of the origin** (recorded 2026-08-23 after the shipped stack failed it). `websocket.Accept` runs with the library's default options: an `Origin` header is authorized only when its host — *port included* — equals the request's `Host`, and anything else is answered `403`. Nothing else on the wire is checked this way, so a reverse proxy that rewrites `Host` breaks the socket alone while all of §§3–8 keep working. `scripts/proxy-host-gate.mjs` holds every nginx sample in the repository to `$http_host` for that reason; `$host` drops the port.
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

* Locks (`packing_now`) are **also** persisted via normal mutations; the ephemeral event only lowers latency, and offline devices converge via pull. **A claim has no lifetime** (FR-5.7, ADR-028, 2026-08-24): it ends by the row being packed, by the holder **releasing** it, or by another member **taking it over**, and never by ageing. The row keeps `packing_now` until one of those three writes over it, so age carries no information and no client reads `packing_now_at` to decide whether a claim still counts. **What this replaced:** a 15-minute staleness window that every client applied and the server did not, published per instance on `GET /api/v1/config` from `JITPACK_LOCK_TIMEOUT`. The window, the variable and the endpoint are all gone; `GET /api/v1/config` served nothing else, so it went with them.
* **The takeover is the one part of the lock the server owns.** Everything else about G-3 is a client rendering rule, but a takeover has to be stamped with *who* took over (invariant 3) and has to notify another account, neither of which a client can do for itself — so it is an RPC endpoint (§8) rather than a mutation. Local Mode has no server and Single-User Mode has one account: in both there is nobody to take a row from, so the surface is absent rather than inert, and the *release* stays in all three modes.
* **The lock is still advisory where a genuine collision is concerned.** No push is refused because a row is claimed: a claim is an ordinary `packing_now` mutation that merges like any other field (§6). Refusal would mean a permanent rejection in front of an offline device that packed a row somebody claimed after it went offline, which the durable outbox has no answer for. G-3 is collision *avoidance*; the correctness net under a genuine collision is the field-level merge and the conflict log.
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
| `GET /me/export.json` · `GET /trips/{id}/export.csv` | NFR-4.5 — implemented: full export is a versioned JSON envelope `{version, exported_at, data:{table:[rows]}}` filtered to the caller's pull visibility (users/avatars excluded); CSV columns `item,category,quantity,packed_count,mode,traveler,container` |
| ~~`GET`/`POST /templates/import`~~ · ~~`GET`/`POST /trips/import`~~ · ~~`GET /trips/{id}/export.yaml`~~ | **removed 2026-08-23 (ADR-025): portable YAML has no endpoint at all.** Reading *and* writing the format live once, in `client/src/domain/portable.ts`. The server had a second implementation of both directions that no product surface used and that had fallen behind the format — its export omitted trip status, ordered tags, marks and `from_inventory`; its import discarded the same fields and wrote nothing to the change log, so what it imported reached no device. Files are written by the app (M17/M21/NFR-4.11) and read by the app or the FR-18.7 command; both land through `POST /sync/master` and `POST /sync/trips/{id}` like every other write |
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
| `GET /trips/{id}/conflicts` | Per-trip conflict log for the G-2 view (NFR-4.2a): `{conflicts:[{id, entity_table, entity_id, field, losing_value, winning_value, mutation_id, actor_user_id, resolved_at, reverted}]}`, newest first; conflict rows never flow through pull. `mutation_id` and `actor_user_id` are what §6.1's revert needs — the first groups the entries one revert restores together, the second names the person to tell — and were sent but undocumented until 2026-08-25. `reverted` says the losing value has already been restored, so the client offers the control once |
| `POST /trips/{id}/conflicts/{conflictId}/revert` | NFR-4.2a's manual revert, trip partition — implemented: restores the entry's `losing_value` as an ordinary upsert with a fresh server HLC (§6.1, ADR-023) and marks the entry `reverted`. Membership only, like the list beside it. Answers `{ok, pull_hint:{next_cursor}}`; the restored value arrives through the normal pull (P-1), and `trip.changed` is broadcast. Refusals carry their own codes: `404 conflict_not_found` (unknown, or the other partition's), `409 already_reverted`, `409 row_deleted`, `409 revert_refused` (§6 rule 2 outranks it) |
| `POST /trips/{id}/items/{itemId}/takeover` | FR-5.7's takeover, and the one part of G-3's lock the server owns — implemented: moves a `packing_now` claim from its holder to the caller in one transaction, so the row is never unclaimed in between. Membership only. The write is an ordinary upsert with a fresh server HLC (like the revert beside it), so the other devices converge through the normal pull; `trip.changed` and `item.locked` are broadcast. Answers `{ok, previous_holder, pull_hint:{next_cursor}}` — the holder's id is what the confirmation named beforehand and the snackbar names after. It also records the takeover in `lock_events` and sends the previous holder an FR-6.2 notification of kind `lock_taken`, neither of which a client could do for itself (invariant 3). Refusals carry their own codes: `404 not_found` (no such row on this trip — an item of another trip answers the same, so nothing foreign is confirmed), `409 claim_not_held` (nobody is packing it), `409 claim_is_own` (releasing is the action for that). A refusal writes nothing and notifies nobody |
| `GET /trips/{id}/lock-events` | The trip's takeover record: `{lock_events:[{id, trip_item_id, item_name, from_user_id, to_user_id, created_at}]}`, newest first. Membership only, like the conflict log — and deliberately *not* part of it (ADR-028): that log holds merge losers, and one list carrying two unrelated kinds of event stops being readable. `item_name` is stored on the event rather than joined, so the record stays readable after the row it names is deleted |
| `GET /master/conflicts` | The **master partition's** conflict log, same envelope. There is one log per partition because a conflict belongs to the partition its mutation was pushed to, and `conflict_log.trip_id` tells them apart exactly as `change_log.trip_id` does — NULL for the master partition. It therefore takes no trip id, and needs its own endpoint: the per-trip query filters on `trip_id` and these rows have none, so before this endpoint they were written and read by nothing. Authenticated but not membership-scoped; each row is filtered through the same `masterVisible` rule as a master pull, because a conflict entry names an entity and naming one the user may not see would leak it. **`trips` is the case that matters**: a trip's own fields (name, dates, year, status) merge on the master partition, so a conflict on them appears here rather than in that trip's log |
| `POST /master/conflicts/{conflictId}/revert` | The same revert, master partition — implemented: authenticated but not membership-scoped, filtered through the same `masterVisible` rule the list is (an entry the caller may not see answers `404`, not `403`, so nothing is named), then authorized for the *write* by the same per-row ownership rules as a master push (`403 forbidden` where the caller may read the row but not write it). Broadcasts `master.changed` to the actor's own devices, like a master push |

All RPC results materialize as ordinary `change_log` entries — clients see the outcome through the normal pull, never through the RPC response body (P-1). RPC responses return only `{ok, pull_hint}` plus operation-specific metadata (e.g., import summary). **Decided: template changes use lazy discovery** — there is no `template.changed` WebSocket event; a consumer of a shared template sees edits the next time it pulls its own master partition, keeping the event catalog (§7) minimal and the footprint goal (NFR-4.3) intact.

## 9. Error Model & Limits

* Errors: `{ "error": { "code": …, "message": "…", "field": "…" } }` with matching HTTP status (404/403/422/409). **The list of codes is not in this document** (amended 2026-08-23, NFR-4.14/ADR-026): it is `ErrorCode` in `internal/api/wire.go`, generated into the client as a union and a frozen `ERROR_CODE` object, so a code exists once and both sides are checked against it. The list that stood here had drifted into fiction — it named `conflict`, which no handler has ever sent, and `rate_limited`, retired with Demo Mode in Addendum v2.10, while omitting eleven codes that are sent daily. Prose about *why* an error is raised stays here; the vocabulary is generated.
* Limits: push batch ≤ 200 mutations; pull limit ≤ 1000; request body ≤ 5 MB (import: 20 MB); WebSocket idle timeout 5 min with client ping.
* `GET /health` unauthenticated for container health checks.

## 10. Versioning & Compatibility

* Path-versioned (`/api/v1`). Additive changes (new fields/tables in pull rows) are non-breaking — clients must ignore unknown fields and tables (forward compatibility for staggered app updates).
* The server rejects pushes referencing unknown tables/fields with `validation`, ensuring old servers fail loudly against newer clients.

---

## Decisions (Resolved)

All decisions originally listed as open here have been resolved and are now recorded directly in their owning section: field-group granularity (§6, no `mode`+`state` grouping), the end of a claim (§7: by a person, never by a clock — ADR-028), and master-partition scope for shared templates (§8, lazy discovery). No open decisions remain in this document.
