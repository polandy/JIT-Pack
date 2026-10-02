# 6. Non-Functional Journeys

| ID | NFR | Mode | Assertion |
|---|---|---|---|
| E2E-NFR-01 | NFR-4.1 Offline-first | local (+ `single`) | Every read/write works with the network offline; nothing blocks. |
| E2E-NFR-02 | NFR-4.8 Single-User independence | single | Instance boots and is fully usable with no OIDC configured. |
| E2E-NFR-03 | NFR-4.11 Persistence | local | Persistent storage requested; storage estimate/persisted surfaced in the G-2 detail. |
| E2E-NFR-04 | NFR-4.2a Conflict resolution | server | See E2E-FLOW-08 — merge + conflict-log UI. |
| E2E-NFR-05 | NFR-4.5 Export | server | JSON full + per-trip CSV download and are well-formed. |
| E2E-NFR-06 | NFR-4.6 Push | server | Web-Push registration round-trip (browser Push API mocked). |
| E2E-NFR-07 | NFR-4.7 Import transactionality | local | A pre-validation failure aborts the import with no partial rows. |

**All seven are implemented.** Each mode above is the one the case's request needs, not the one the screen's section
suggests.

* **E2E-NFR-01** (`e2e/pwa-offline.spec.ts`): the Local Mode half *writes* with the network down —
  E2E-PWA-01 reloads and asserts the shell, and the `single` half (E2E-FLOW-06, E2E-G2-04) queues
  against a server that comes back. Here nothing
  comes back, because in Local Mode there is nothing to come back: a trip is created, an item is
  added and packed, and the reload is what separates a rendered optimistic store from data the
  device kept. Dropping the service-worker wait turns the case red, which is what says the
  network is genuinely down rather than merely flagged.
* **E2E-NFR-02** (`e2e/single/mode-discovery.spec.ts`, with E2E-M19-02): *„network to any IdP
  blocked"* is struck rather than tested. A Single-User instance names no issuer, so there is no
  host to block and blocking one would assert against a request the app never makes; the
  assertable promise is the 501 on `/auth/config` and the dashboard behind it.
* **E2E-NFR-03/03b** (`e2e/storage-durability.spec.ts`): the three rendered states of the storage
  block are unit-covered; the clause no screen can show is that `navigator.storage.persist()` is
  *asked* at all. The Storage API is replaced rather than driven — a real browser's answer is a
  policy decision and the case would assert whatever the profile happened to be — and the ask is
  counted, so a refusal that was never requested is distinguishable from one that was. The
  granted branch is the pair's positive half and also covers the guard that does not ask twice.
* **E2E-NFR-05** (`e2e/server/data-export.spec.ts`, with E2E-M17-03): `server`. In
  Local Mode this is a different section entirely (per-trip YAML written client-side), and in
  `single` there is no token, so the auth header the promise is about is never sent.
* **E2E-NFR-06** (`e2e/server/push.spec.ts`): the push *service* is replaced and nothing else is:
  `subscribe()` would otherwise have to reach a real endpoint no CI run can. What the case buys
  over the unit is the half only an integration can establish — the subscription reaches the real
  instance and is accepted against this account, and the opt-out both tells the server and
  cancels the browser subscription. Delivery from there is `internal/api/push_test.go`.
* **E2E-NFR-07** (`e2e/spreadsheet-import.spec.ts`): `local`, and the sentence narrows to what
  is built. NFR-4.7's *„transactional"* is an approximation and says so — the plan is
  validated in full before the first mutation is enqueued and nothing rolls back — so the
  assertable clause is that a blocked mapping leaves the device untouched. E2E-M15-12 stops one
  step short of it, asserting the refusal and never the state behind it. The absence is worth
  something only because the second half commits the identical sheet through the answered gate:
  what the refusal withheld is exactly what it then delivers.
