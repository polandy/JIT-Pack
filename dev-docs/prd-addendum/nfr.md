# Part C — Refined & New Non-Functional Requirements

* **NFR-4.2a (Conflict Resolution Strategy — refines NFR-4.2):** Offline conflicts are resolved with field-level
  Last-Write-Wins based on hybrid logical clocks, with two domain rules taking precedence: (1) terminal states win over
  transient states (*Packed* beats *Packing Now*), and (2) additive operations (comments, tasks, flags) are always
  merged, never overwritten. **A delete takes part in that ordering rather than standing outside it (ADR-052):** it is
  an all-fields decision, so a write only creates a deleted row again if it is strictly newer than the delete. An older
  one — the edit an offline device made before somebody else deleted the row — is refused with `row_deleted` instead of
  quietly undoing the delete, which is the same loss as an overwritten field with nobody told about it. Every automatic
  resolution is written to a conflict log surfaced in the UI so users can audit and manually revert. **The revert is an
  ordinary new mutation with a fresh server HLC, not an undo of the past** (ADR-023, Sync-API §6.1): it wins by being
  newer, it reaches every device through the normal change feed, it is refused where the merge rules of §6 outrank it
  (a `packing_now` restored onto a packed row) or where the row has since been deleted, and the log entry it acts on is
  marked spent rather than erased — the loss happened, and the record of it stays. **There is one log per sync
  partition**, not one per trip: a conflict belongs to the partition its mutation was pushed to, so a trip's own fields
  (name, dates, status) are audited and reverted on the master log rather than inside the trip. **Retention: nothing
  is compacted, and there is no permanent history record.** Archiving a trip touches no log; the entries live exactly
  as long as the trip does, because `conflict_log.trip_id` cascades on delete, and they stay individually actionable
  (which is what the revert above needs them to be). This matches the same absence Sync-API §4 records for
  `change_log` tombstones and the `mutations` memo: deliberate for a single-household instance, where the log is small
  enough that compaction would be machinery with nothing to do, and named here so the gap is a known cost rather than a
  promise the code does not keep. **Revisit trigger:** the log growing large enough that the M-screen listing it needs
  paging, or a second household on the instance.
  * **A database constraint is a merge decision, not a tidiness decision.** Because push is the only
    write path and a constraint violation comes back as a `rejected` mutation — which the client's outbox drops — **a
    CHECK or UNIQUE that can refuse a legitimate offline mutation destroys the user's change to buy an invariant.** So
    each candidate is decided one of three ways: enforce it in the schema (only where no legitimate push can reach it),
    enforce it on the authorization path where it can be a considered refusal with its own sentence, or state the rule
    and enforce nothing. The current answers: enforced in the schema are the one-Owner index (FR-4.5) and the
    instance-wide names of `templates`/`trip_series` (FR-1.6/FR-13.1, whose offline cost is written out there); enforced
    on the authorization path are the FR-27.6 scope guards; and deliberately unenforced are the skip's
    `state`/`quantity` pairing (FR-5.5) and the primary tag's position (FR-24.2), both of which were measured against
    the constraint and found to reject an ordinary push. The one-directional `comments` CHECK belongs to the same
    reasoning: a task must carry a state, because every todo row is rendered as open or resolved, but a *plain* comment
    carrying a leftover `task_state` is noise nothing reads — and the reverse CHECK that would tidy it away would refuse
    a demotion whose whole content is `is_task = 0`.
  * **The clock is a client value, and invariant 3 reaches it too.** Comparison is lexicographic
    (Sync-API §3), so a clock outside the format does not fail to sort — it sorts wherever its bytes fall, and one
    above `f` outranks every clock a device can generate. Stored, it wins that field's LWW for good: nobody, on any
    device, can ever write the field again, and no conflict is logged because nothing lost a comparison. The server
    therefore refuses a mutation whose `hlc` is not exactly what the generator would have written (`malformed_hlc`,
    Sync-API §5), the same way it refuses to take the client's word for who packed a row. It is a client bug rather
    than a user's mistake, so the copy says so, and the rest of the batch still applies.
  * **A conflict entry records a value that was overwritten**, not merely a field that lost the write. A push carries
    fields it did not change — an FR-2.7 date edit writes `start_date` and `end_date` together — and logging every one
    of them would offer entries reading `2026 → 2026` with a revert button for a value already in place, and answer the
    push `merged` rather than `applied`, which the client announces as overwritten fields to someone whose data no one
    touched. The merge compares values as well as clocks (Sync-API §6).
  * **„Field-level" means a clock per field, persisted** (`field_hlcs` beside `updated_hlc`, Sync-API §6, ADR-022):
    compared against the row's single clock, an offline pack would lose to any unrelated later edit of the same row.
    And rule (1) is exactly the pair it names — *Packed* beats *Packing Now*, nothing wider: between a pack made
    offline and a later deliberate unpack or skip (FR-5.5) the later decision stands and the pack is logged; letting
    every incoming *Packed* win regardless of clock would silently reverse later decisions and write no conflict. Each
    conflict entry also names the losing `mutation_id` and the `actor_user_id` who pushed it — the grouping a revert
    needs and the person it belongs to.
* **NFR-4.5 (Export & Backup):** The system provides a full instance export (all templates, items, trips, history) as
  versioned JSON via UI and CLI, plus a per-trip CSV export of the packing list. The deployment documentation includes a
  reference backup strategy suitable for home-lab operation.
* **NFR-4.6 (Self-Hosted Notification Architecture):** Push notifications (FR-6.2) must function without mandatory
  dependence on third-party cloud services. Web clients use standards-based Web Push with self-generated VAPID keys.
  Native mobile clients prefer UnifiedPush; FCM/APNs support is an optional, explicitly opt-in build configuration.
  In-app notifications over the existing WebSocket channel (FR-4.4) serve as the universal fallback. Not applicable in
  Single-User Mode (FR-17.3) — the detection does not run there at all, whatever the pushed rows say, because the mode
  and not the data is what decides it. A Web Push send is detached from the request that earned it but not from the
  process: shutdown drains the sends still in flight within its existing deadline, since the clients this reaches are
  by definition the ones the WebSocket fallback cannot (ADR-055).
* **NFR-4.7 (Import Robustness):** The import wizard (3.16) must tolerate real-world spreadsheet noise: merged category
  header rows, empty columns, trailing question marks in item names (imported as an attached open task per FR-7.2), and
  mixed-language labels. Imports are transactional: a failed import leaves no partial data behind. The trailing
  question mark becomes an item plus an open task on the trip row, and the wizard says so inline (UI-Spec M15 Step 2,
  E2E-M15-02). **The commit is an approximation of a transaction, not a transaction** (E2E-M15-04): the plan is
  validated in full before a single mutation is enqueued, parents precede children in the queues and replay is
  idempotent, but nothing rolls back and there is no progress indicator — there is no server-side transaction across a
  push batch to build one on, and Local Mode has no server at all. The approximation is the deliberate design and is
  recorded in `commitImport`'s own doc comment.
* **NFR-4.8 (Single-User Mode Independence):** Single-User Mode (3.17) must not require network access to an identity
  provider under any circumstance, including first boot — it is fully self-contained and works on a fresh, offline
  deployment.
* **NFR-4.9 (Public Exposure Guidance):** Because Single-User Mode performs no per-request authentication, the
  deployment documentation must state explicitly that such an instance must only be exposed to a network the operator
  trusts (e.g., home LAN, VPN/Tailscale) or protected by an additional layer — reverse-proxy Basic Auth or IP
  allowlisting — before being reachable from the public internet. The documentation must include at least one concrete,
  copy-pasteable example (e.g., a Caddy or Traefik Basic-Auth snippet) so operators are not left to work this out
  themselves.
* ~~**NFR-4.10** (demo rate limiting)~~ — retired with Demo Mode (see 3.17). The generic `rate_limited` error path in
  Sync-API Spec §9 remains available but is mandatory nowhere. The number must not be reused.
* **NFR-4.11 (Local Storage Durability):** Browser-managed storage is evictable under storage pressure. In Local Mode
  (3.19) the client must request persistent storage (`navigator.storage.persist()`) on first launch and surface a
  visible, non-blocking warning in the G-2 storage detail (FR-19.6) whenever persistence is not granted. Because there
  is no server copy, the storage detail must always offer a one-tap portable YAML export (FR-18.2/18.3) as backup, and
  the app shows an unobtrusive, dismissible export reminder when the last export is older than 30 days (configurable).
  That export is the *whole device* in one file, and the restore side is part of the requirement — a backup the app
  itself cannot read back is not a backup, which is why FR-18.4 accepts a multi-document file. The file also carries
  the FR-27.4 refresh state of every trip (see FR-18.3), so a restored device does not keep its Vorlagen and trips and
  start following them from zero. The storage figures are reported honestly: a browser that does not answer the
  Storage API produces "unknown", never a reassuring zero, and the eviction warning fires only where the browser *was*
  asked and said no. On native Capacitor builds, storage is app-scoped and durable; the persistence warning does not
  apply there, but the export reminder does. **What resets the reminder is the whole-device backup, and only that**
  (ADR-015, E2E-M17-07): M17's per-trip and per-template YAML downloads do not stamp `jitpack_last_export`, because
  exporting one trip must not clear the warning about everything the file does not hold. The banner is recomputed on
  entering M17 rather than by the export that clears it: the backup is taken on the G-2 sheet, another component, so a
  value read once at setup would go on warning for the rest of the session about a backup the user had just made.
* **NFR-4.12 (Internationalization, *accepted*):** The UI is fully localizable; no user-facing string is hard-coded.
  The shipped locales are **English and German**, with **English as the primary/default** and **German fully
  supported** — both ship in the MVP, neither is a stub. English-primary matches the code base, which is written in
  English, and makes German an addition rather than a rewrite. Locale is user-selectable and persisted device-local
  (like the theme, FR-21), defaulting to the browser locale when that is German and to English otherwise. Scope note:
  this is UI-string localization plus locale-aware date/number formatting; it does **not** imply localizing user
  *content* (item names, template names, comments stay as the user typed them). Additional locales are additive later.
  * **Dates and numbers follow the device's region, not its language.** The language is the app's; the date order,
    the clock and the separators are the region's — an English phone in Zurich writes *„Sun, 4.10."*, *14:32* and
    *1'234.50*, not *10/4*, *2:32 PM* and *1,234.50*. A browser names its region only through its time zone
    (`navigator.languages` is the device's *language*, `en-US` on most English phones), so the zone's country decides
    (`client/src/i18n/zoneRegions.ts`, generated from the tz database's `zone.tab` by `scripts/zone-regions.mjs`); a
    zone it does not know falls back to the browser's regional variant of the language, then to the bare language.
    Every formatting call goes through `intlLocale()`. The specs run in Zurich (`deviceRegion.setup.ts`, the e2e
    suite's `de-CH` / `Europe/Zurich`), so an expectation is a Swiss format on every machine.
  * **Notifications are localized too (ADR-037)** — both the in-app toast and the OS notification the service worker
    shows, which cannot import modules and cannot read `localStorage`. The wording is in the catalogue like every
    other string:
    `notifications/messages.ts` owns the *choice* — which body a kind renders with, and that a mention is about its
    preview while everything else is about its item — and `format.ts` renders it with `t()`. The worker's half is
    answered by an **IndexedDB mirror**: the app writes the finished templates for the active language into
    `jitpack-sw`/`meta`/`notifications` on boot and on every language change (one `watchEffect` in `App.vue`,
    deliberately not a call beside each `setLocale`), and `public/sw.js` reads them there, picks a body and fills its
    slots.
    Three costs taken on purpose:
    **The selection is written twice and the vocabulary is not.** A classic worker cannot import a module, so the four
    lines that pick a body exist in both files — but no sentence does, and `notifications/__tests__/workerBody.spec.ts`
    loads the worker source and drives both renderers over every kind in both languages, so a divergence is a red test
    rather than a comment nobody reads. The same spec refuses any notification wording reappearing in the worker.
    **One English sentence stays in the worker** — *„You have a new notification"* — for a device whose storage is
    denied or that receives a push before the app has ever run. It deliberately says nothing about *what* happened: a
    detail in a language nobody chose is worse than no detail, and the app says it correctly on open.
    **The actor fallback is a word, so it is translated too.** *„Someone mentioned you"* inside a German sentence is
    exactly the half-translated state this NFR exists to prevent, which is why `notify.actorUnknown` is a catalogue key
    rather than a literal default.
  * **No i18n dependency.** Localization is a small in-house module rather than
    `vue-i18n`. Justification per NFR-4.3 (footprint is first-class, standard library first): two locales need only key
    lookup, `{placeholder}` interpolation and a one/other plural rule, while locale-aware date/number formatting is
    `Intl`, built into every target browser — none of that warrants a dependency, and the same reasoning already
    rejected an XLSX parser (§3.16). The call shape is kept **`vue-i18n`-compatible** (`t('key', { n })`) so adopting
    the library later stays a swap of the module rather than a rewrite of every call site. **Revisit trigger:** a locale
    whose pluralization needs more than one/other forms, or a need for message-format features (gender, select, nested
    formats).
  * **Where the requirement stops: a product statement is localized, a technical diagnosis is not.** *„No
    user-facing string is hard-coded" is about the sentences the product speaks* — labels, hints, confirmations,
    notifications. It does not cover a diagnosis about a broken input, which is written for whoever has to fix the
    file and stays English. The ten parse errors of `client/src/domain/portable.ts`, rendered raw by M18, are the
    standing example. The boundary is also the cheap answer: `domain/` may not import `i18n/` (invariant 4,
    `scripts/domain-purity-gate.mjs`), so translating one of those errors means first turning it into a code the view
    resolves to a key — the `rejectionReasonKey` shape in `SyncDetailSheet.vue`. Two further texts are deliberately
    English for their own reasons, recorded above and in ADR-037: the worker's `FALLBACK_BODY`, and
    `manifest.webmanifest`'s description, which a static manifest cannot localize at all. M17's example server URL is
    a literal in a production template; its own label is a key.
* **NFR-4.1a (Durable Outbox — refines NFR-4.1, *accepted*):** In Server Mode the queue of mutations that have
  not reached the server is kept **on the device** (IndexedDB), not in the open document: it is written per mutation,
  removed when the server acknowledges it, and replayed at the next app start **before the first pull**, so a change
  made offline is never overwritten by the server's older copy of the same row. Replay is safe by the Sync-API's
  `mutation_id` memo (P-5), which the client serves by minting the id once, at enqueue, and storing it with the
  mutation. Two consequences the user sees, both in G-2: the queued-changes count belongs to the *queue* and survives a
  reload, and a change the server **permanently refuses** is taken out of the queue and kept as evidence rather than
  retried forever — one bad row must not stop a whole partition from syncing. A network failure and a server error are
  not refusals. What this deliberately does **not** add is a reconnect drain: the queue moves on the app's next own
  action or its next start, not on the browser's `online` event. Local Mode is unaffected — it has no outbox.
* **NFR-4.14 (One Checked Contract Between Client and Server, *built*):**
  The backend's HTTP surface is a **contract**, not a convention, and the frontend consumes it: it
  is described in one machine-readable place, the client's types are **derived from that
  description rather than written a second time by hand**, its error vocabulary is a shared
  enumeration rather than a string literal at each end, and its route shapes are predictable.
  **A contract that is not checked by the build is a comment**, so the acceptance test is a CI
  gate, not a document: a wire change that the client has not followed fails the pipeline rather
  than the next hand-test.

  **Why.** Types written twice and checked nowhere drift in exactly the shape both sides' test
  suites cannot see — a client reading a key no server sends, a pull cursor taken from the wrong
  field, one partition answering `500` where the other answers `rejected` — because a fake that
  agrees with its author agrees with the wrong thing just as happily. An error code spelled as a
  literal at both ends is kept in step by discipline, not by construction; per CODING_PRINCIPLES
  §4a a value compared against belongs in one named place, and the documented "serialization
  keys" carve-out covers the *keys*, not a vocabulary the client branches on. The error
  *envelope* — `writeError(status, code, message)` producing `{"error":{"code","message"}}`, parsed
  by `APIRequestError` on the client — is uniform and is kept as it is.

  **Scope boundary, stated because the phrase invites the other reading:** this is about the
  *contract*, not about moving work to the server. Invariant 4 stands — generation, dependency
  resolution, quantities, analytics, the review assistant, cloning and import stay in
  `client/src/domain`, because **Local Mode has no server** and moving any of them server-side
  silently removes a feature from a supported mode. Whether a particular rule belongs on the
  server is a separate question, to be asked per rule with that price written out, and this NFR
  does not open it.

  **The Go declaration is the source (ADR-026).** `internal/api/wire.go` is the one declaration of
  the sync envelopes, the WebSocket frame, the conflict-log shapes, every response body and the
  error vocabulary; `cmd/wiregen` writes `client/src/api/types.ts` from it, `make wire`
  regenerates, and `scripts/wire-contract-gate.sh` — in `make ci` and in the CI `go` job — fails
  the build when the checked-in file does not match. The error codes are `ErrorCode` constants in
  Go and a generated union plus a frozen `ERROR_CODE` object in TypeScript, so `writeError` cannot
  invent a code the client does not know and the screen that branches on one is checked rather
  than disciplined. OpenAPI was weighed and rejected: the failure being fixed *is* a hand-kept
  file that drifts, and adding a third artefact to keep in agreement is not an answer to it.
  Sync-API-Spec v1.3 stays the prose account of *why* the protocol behaves as it does; `wire.go` is
  the machine-checkable shape beside it. The generated types are also the truthful ones — a nil Go
  map or pointer marshals to `null`, so `row`, the WebSocket `payload` and a notification's
  `payload` are nullable, and the compiler holds every reader to a check.

  **The route shapes (ADR-027).** One rule, and it has no exception: **the path names the scope
  first, then the resource**; the master partition belongs to no trip, so its scope segment is the
  literal `master`; and **an export names its format** as the path's extension. So
  `GET/POST /trips/{id}/sync` and `/master/sync`, `GET /master/conflicts` beside
  `GET /trips/{id}/conflicts`, and `GET /me/export.json` beside `GET /trips/{id}/export.csv` — the
  full export lives under `/me` because it is filtered to what the caller may pull, which makes it
  the caller's export rather than the instance's. The sync endpoints follow the rule too: leaving
  the busiest pair as the one exception would keep the surface unpredictable in exactly the place
  it is read most. A path outside the rule **404s rather than aliasing** — with two spellings
  serving, nothing could tell whether the client had followed.

  **The paths are part of the contract.** `wire.go` declares every path as a `Route*` constant and
  every path variable as a `Path*` constant; the mux registers from them, and `cmd/wiregen` writes
  `client/src/api/routes.ts` from the same declaration, so the drift gate that holds the envelopes
  holds the paths. A path with no placeholder generates a string, one with placeholders a function
  whose parameters *are* the placeholder names — so an id cannot be forgotten and the two
  spellings of a path variable cannot come apart. Four AST rules hold the Go side: a declared route
  the mux does not serve, a route or a path variable taken from a literal instead of the
  declaration, and a placeholder no constant names. The version prefix stays spelled out on every
  line on purpose — the block is a table, and `/api/v2` is one pass over it.

  **Every response body is a declared type**, the admin overview, the notification list and its
  preference set, the instance config and the auth pair included; the client's copies are aliases
  of the generated ones. Two tests keep it closed, and the second exists because the first has a
  blind spot. `TestEveryResponseBodyIsADeclaredType` reads `internal/api`'s own AST and fails on a
  map literal handed to `writeJSON` or an encoder, so the next response cannot be added untyped —
  but it cannot see a map held in a *variable*, which is exactly what the preference handler does.
  `TestWire_NotificationPrefsNamesEveryKindTheStoreKnows` therefore holds the wire struct against
  `store.NotificationKinds()`: a notification kind added to the store fails the build instead of
  being persisted, honoured server-side and invisible on the wire. **A gate that overstates its
  reach is worse than one that names its limit**, so the limit is written in the test itself. The
  *request* body of the preference endpoint stays an untyped map on purpose: a missing key there
  means *leave that kind enabled*, and a struct would decode it as `false` and switch the kind off.

* **NFR-4.13 (Installable PWA & App Shell, *accepted*):** The web client is installable to the home screen
  (manifest with the Packed Backpack icon set incl. a maskable variant, `display: standalone`, the Apple tag set, a
  `theme-color` that follows the FR-21 flavour) and, once opened online, **starts without a network**: a service worker
  — the same script that carries NFR-4.6's push handlers — precaches the built bundle and answers navigations with the
  cached shell when the network is gone. The shell cache carries the *bundle only*, never data: `/api`, `/ws` and
  `/health` are never answered or cached by the worker, because sync consistency belongs to NFR-4.2a and `/health` must
  always tell the truth about the server. Registration happens unconditionally at app start (not only when push is
  enabled); on an insecure origin there is no service worker and no install offer, and the app runs as an ordinary
  website — plain-HTTP LAN instances stay supported. **Update policy:** a new version installs in the background and
  takes over on the next launch — never an **unprompted** reload; the running app announces it through the G-2
  indicator (dot on the glyph, sentence in the detail sheet), and the announcement carries an action that applies the
  waiting version immediately (FR-19.7, ADR-044). Nothing reloads on its own, and the worker's `install` handler never
  calls `skipWaiting()`; the only thing that shortens the wait is a press. Mechanism and tradeoff (hand-rolled worker
  vs. `vite-plugin-pwa`) are ADR-019. Applies to all three run modes; in Local Mode it means the app itself, not only
  its *data*, works without the network.
