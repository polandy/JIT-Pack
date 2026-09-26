# UI / End-to-End Test Specification — „JIT-Pack" (v1.0)

**Document Status:** Proposed for Review
**Basis:** UI_Spec_v1.10 (screens M1–M21, patterns G-1–G-15) + PRD_Base + PRD_Addendum_v2.10 (FR/NFR catalogue).
**Purpose:** Define *what* the automated headless-browser test suite must cover so that every requirement with a UI
surface is exercised through the real, built client. This document is the specification; implementation (Playwright
config, fixtures, the tests themselves) follows and is tracked separately.

> This file is authoritative for E2E scope. When a requirement changes, its row in the traceability matrix (§7) must
change with it — same discipline as UI_Spec and Sync_API_Spec.

---

## 1. Scope & Philosophy

### 1.1 Layered coverage (decided)

The client already ships **412 Vitest unit/component tests** and a fully unit-tested pure domain layer (`src/domain/`,
`src/lib/`, `src/local/`, `src/notifications/`). The E2E suite does **not** re-derive that logic. It sits one layer
above:

* **Unit tests own the algorithm** — dedup/instantiation (FR-2.2/2.3/2.3a), analytics math (FR-8.2/10.4/14.3),
  clone/review planning (FR-12/9), spreadsheet & portable parsing (FR-16/18), dependency resolution (FR-20),
  image/avatar geometry (FR-22.2/22.3), HLC + merge (NFR-4.2a). These are proven in isolation and must stay there.
* **E2E owns the journey** — that a real user, in a real browser, driving the real built app, can reach a screen,
  perform the requirement's action, and observe the correct result *including its persistence and (where relevant)
  cross-device propagation*. E2E verifies the wiring: store ↔ outbox ↔ WebSocket ↔ server ↔ DOM.

Every FR/NFR in §7 is tagged **E2E** (a browser case exists), **UNIT** (logic already covered; E2E only touches it
incidentally through a journey), **SERVER** (backend/API concern with no UI surface — covered by Go tests, listed here
for completeness), or **DOC/N-A** (documentation-only or retired).

### 1.2 Tooling (proposed)

**Playwright** (`@playwright/test`), headless Chromium + WebKit. WebKit matters: the Capacitor iOS WebView is WebKit,
and it is the only cross-browser runner with real WebKit. Rationale for choosing it over Cypress/Selenium and the CI
wiring live in §8; the dependency-footprint justification (NFR-4.3 discipline) is recorded there.

### 1.3 Out of scope for E2E

* Pure algorithmic correctness already covered by unit tests (see §1.1) — E2E asserts the *outcome in the UI*, not every
  branch.
* Native Capacitor shells (iOS/Android builds), real push-service delivery (APNs/FCM/UnifiedPush), and real OIDC
  provider integration — replaced by a mock IdP (§2.3).
* Server-internal concerns without a UI surface: resource footprint (NFR-4.3), deployment/exposure guidance (NFR-4.9),
  JWT-vs-Authelia decoupling internals (NFR-4.4) — owned by Go tests and docs.
* Visual-regression / pixel diffing — explicitly deferred (see §9, Future); this suite asserts behaviour and semantic
  DOM state, not appearance. (Theming G-11 is checked structurally: correct theme class + token application, not
  screenshots.)

---

## 2. Test Environments (Run Modes)

All three product run modes are covered (decided), because collaboration requirements (FR-4.x, 6.x, G-3, G-10, M20) have
no meaning without a server and a second identity. Each E2E case is tagged with the mode(s) it runs in.

### 2.1 `local` — Local Mode, no backend
Client only, served by `vite preview`. IndexedDB is the store; enqueue/drain/WebSocket are no-ops. M19 selects "Just on
this device". Covers offline-first, persistence, and the serverless export/import path. **No `jitpackd` process.**

### 2.2 `single` — Single-User Mode
`jitpackd` started with `api.NewSingleUser` (no `JITPACK_JWT_SECRET`/`JWKS_URL`, no OIDC env). No auth, no membership,
collaboration UI hidden (G-8). Boots with zero network to any IdP (NFR-4.8). Covers the full single-writer product
surface against a real server + real sync.

> **Client-side note:** there is no distinct "single" client mode. The client persists `jitpack_mode = 'server'` and
points `jitpack_server_url` at the Single-User `jitpackd`; because that server's `GET /api/v1/auth/config` advertises no
OIDC, `App.vue` skips the login redirect and lands directly on M1 (M19-02). So the `single` vs `server` distinction is
purely a *harness* concern: which `jitpackd` the fixture starts and whether OIDC tokens are seeded — the client build is
identical.

### 2.3 `server` — Server / Collaboration Mode
**Built** (ADR-029). `jitpackd` in OIDC mode against a **mock IdP** fixture — `client/e2e/server/mockIdp.mjs`, an
HTTP server exposing discovery, `/jwks`, `/authorize`, `/token` and `/userinfo`, signing RS256 with a keypair generated
per run. It is a *test fixture*, not a shipped component, so NFR-4.8 is not violated, and the shipped binary carries no
test seam.

The login is **driven, never seeded**: `/authorize` renders an account chooser, the test picks the account, and the app
exchanges the code through the broker (ADR-007) — so the display name every identity assertion reads is the one UserInfo
supplied and the server provisioned. Harness shape: one launcher starts the IdP *before* jitpackd (discovery is resolved
at start-up, so the order is load-bearing), and the project runs its **own** `vite preview`, because the client reaches
its server same-origin and the Single-User instance is a different process with a mutually exclusive configuration.

What it covers today is one unit (`client/e2e/server/multi-user.spec.ts`); `dev-docs/e2e-tests.md` is the ledger,
including what is still owed. Enables:
* **Multi-client**: two (or more) browser contexts authenticated as different users (`alice`, `bob`) against the same
  server, to prove real-time convergence, presence, locks, delegation, and notifications.
* **Membership & roles** (FR-4.5/4.7), **admin** (M20, `JITPACK_ADMIN_EMAILS=alice@…`).

### 2.4 Shared fixtures & conventions
* **`data-testid`** is the required selector strategy for every asserted element — no text/CSS-class selectors (i18n-
  and refactor-stable). Adding missing `data-testid`s to the Vue components is part of implementation.
* **Seed helpers** drive the app *through its own mutation paths* (create item → template → trip via the orchestrator),
  never by injecting DB rows — so tests exercise the same code users do. A thin "fast seed" that posts to the sync API
  directly is allowed only for `server`-mode preconditions that aren't themselves under test.
* **Time control**: HLC/staleness assertions (G-3 15-min lock rule, NFR-4.11 30-day reminder) use injectable clocks /
  Playwright `clock` — never real `sleep`.
* **Offline simulation**: Playwright `context.setOffline(true)` for NFR-4.1 journeys; server-mode reconnection via
  toggling offline then draining.

---

## 3. Global Pattern Test Cases (G-1 – G-15)

Global patterns are asserted once as dedicated cases and then relied upon (not re-asserted) inside screen cases.

| ID | Pattern | Mode | What it proves |
|---|---|---|---|
| E2E-G1-01 | G-1 Navigation | all | Four bottom tabs (Dashboard/Trips/Templates/Items) route correctly; Settings reachable via avatar/gear. In `single`/`local` the top-right control is the plain **gear**, not an avatar. |
| E2E-G2-01 | G-2 Sync indicator | single/server | Glyph reflects synced → offline (queued count) as the network drops and returns to synced once the queue drains; tapping opens the detail, which states the queue and — inside a trip — leads to the conflict log, whose row names the **item, the column and both travelers** — `Seil-x · Assigned to`, `Mia → Andy` — rather than `trip_items · assigned_traveler_id` between two uuids, which a check that both values merely render would accept. Outside a trip the *trip's* log is not offered — it has no subject — but the master partition's is, and clicking it opens the log (see E2E-G2-06). *(The transient `syncing` state is not raced — same reasoning as E2E-M8-14 — and the drain is asserted on the app's next own action (a trip open), because the queue moves on that too; the reconnect is E2E-G2-13/14's.)* |
| E2E-G2-02 | G-2 Local glyph | local | Distinct **device** glyph; tap opens the storage & backup detail (not a conflict log): the sheet titles the state, explains that no server is involved, shows the NFR-4.11 storage section, and offers **no** conflict-log entry. Asserted on a screen with no trip open. |
| E2E-G2-03 | G-2 One-tap backup | local | The detail's **Back up now** downloads `jitpack-backup-YYYY-MM-DD.yaml` holding every trip and template, and the sheet's backup line goes from *Never backed up* to *Last backup today* — the stamp the FR-19.6 reminder reads later. |
| E2E-G2-04 | G-2 Durable queue | single/server | An offline change survives a **reload while still offline** (B2, NFR-4.1): the queue count is back on the glyph, the detail sheet states it and says it is saved on this device, and the change reaches the server on the app's next own action — proven on a device that never saw it. *(No reconnect drain is asserted here — E2E-G2-13/14 own it; the boot replay is what this case proves.)* |
| E2E-G2-07 | G-2 Merge announcement | single/server | A push answered `merged` **announces** itself: one toast naming how many fields were overwritten, and a standing line in the detail sheet for the session. Asserted inside E2E-G2-01's losing-edit case — the one place in the suite where a real server merges a real edit away — **immediately** after the drain and then dismissed by hand, because a toast auto-dismisses on a timer and every later step would otherwise be racing it. *(Mutation-proved: removing the report from the outbox reddens it.)* |
| E2E-G2-06 | G-2 Conflict log (master) | single/server | A conflict on the **trip's own name** — `trips` merges on the master partition, not in the trip's — is readable from outside any trip: one device renames the trip offline, the other renames it later, and after the loser's app start its screen carries the winner's name and the master log names the **trip and the column in words** with both values, decoded — the losing value is asserted with `toHaveText`, since the column stores the JSON of the mutation field and a containment assertion is green against the quoted form too. The same row asserts that the timestamp is in the app's language and not the de-CH device's. *(Two things it depends on: the losing device cannot be navigated to by its own trip name, since the name is exactly what it lost; and the master queue does not move on a trip open — a trip open drains the trip partition — so the drain is the app start the durable outbox gave it (B2).)* |
| E2E-G2-05 | G-2 Parked refusal | single/server | A mutation the server **refuses** leaves the queue and is reported: Mia is removed from the trip on one device while the other is offline holding an edit to her packed row; on reconnect the queue empties, the detail sheet states one refused change and keeps it with its reason. *(The refusal it drives is the trip-confinement one — a partial upsert on a row that is gone names no trip; the **constraint** refusals of the same code path are Go-covered, since no screen can delete a container or lower a quantity below its packed count on another device within one case.)* |
| E2E-G2-11 | G-2 Deleting a group a trip was built from | single | A group is built, a trip is generated from it, and the group is deleted through M7; by FR-24.3 that is a retire, so the delete is **accepted**, the sheet shows **no** parked change (its own explanation line is the positive signal that the sheet is open), and a second device that never saw the delete agrees the group is gone. It runs in `single` because only a real server decides — **and the deleting device is a second context that never opened the trip**, so its own count is 0 and it sends a physical delete the server converts. On the device that had just built the trip it would exercise the client's advisory guess instead (ADR-032). A third device, which saw neither the trip nor the delete, then finds an untouched second group and not this one — the untouched group being the settled signal that the pull landed, since an empty list is equally consistent with a device that has not pulled yet. The `still_referenced` refusal has no UI path — see the note at the end of `e2e-tests.md` for where its client half is asserted instead.
| E2E-G2-12 | G-2 What the retire protects | single | The case asserts what the retire keeps (FR-24.3): after the group is retired, a device that never saw any of it opens the trip and finds its row — read from the server, which a physical delete would have taken with it. It also re-reads the group's absence **after** the drain rather than only optimistically: that is what tells a retire from a refusal, since ADR-031's repair re-logs a refused row and the ordinary pull would put it straight back on the list. Without that line the case is green with `lifecycleTables` mutated to empty. The cascade half of the same mechanism (`relogCascadeChildren`, shared by both paths) is asserted in `TestApplyMasterMutation_RetiringATemplate_KeepsAndRelogsItsPositions_FR24_3` and, rendered, in E2E-M10-14.
| E2E-G2-08 | G-2 Sheet header alignment | local | The sheet's state glyph **starts on the same line as its title**, measured rather than eyeballed (FR-21.12). One head serves nine sheets whose leads are 24, 38 and 44 px, so centring the lead on the title line would be a per-sheet number — the thing the shared head exists to remove; the case asserts that the glyph and the title *start* on the same line. It catches the defect it exists for: a stray `h1` margin pushes the line down and nothing else does (mutation-proved). *(Geometry rather than the baseline beside it on purpose: a baseline reports that a pixel moved, this reports which rule broke.)* |
| E2E-G2-09 | G-2 Empty master log | local | The master conflict log's empty state is **inset from both edges** like every other empty state (G-7). Its sentence names three things and wraps; without the house empty state's `padding` and `text-align` the wrapped line runs from x=0 to the right edge under a centred icon. *(Driven in Local Mode and by URL: the mode answers `[]` without a server, so the case needs neither a backend nor a shared database that happens to be empty — the button that leads here is server-only by design, G-8.)* |
| E2E-G2-10 | G-2 Conflict revert | single/server | A recorded loss can be **taken back**: E2E-G2-06's scenario one step further — B loses the trip rename, reads it in the master log, taps *Revert*, and the name B wanted is what the trip is called again, read back **from M2** rather than from the log page, because that is the half that proves the restore travelled through the change feed rather than being painted locally. The spent entry shows the *Reverted* note and offers no second revert. *(The revert drains the partition it wrote before it resolves, so nothing here waits on a timer; the four refusals the server distinguishes are unit-covered in `ConflictLogPage.spec.ts`, since no reachable screen can provoke them.)* |
| E2E-G2-13 | G-2 A dead socket is dialled again | single | The device's WebSocket is **cut and every redial refused** while another device packs a row; the G-2 sheet says live updates are not connected (and said they were before the cut); then the refusal is lifted and **the client's own backoff timer** brings the socket back, whose open pulls the gap over — the packed row leaves B's list **without a reload and without B writing anything**, and the sheet says live updates are connected again. The gap is held on purpose so the row can only arrive through the reconnect's catch-up pull: no `trip.changed` for it was ever delivered. *(Sync-API P-1/§9. Driven through `routeWebSocket`; two things it settled are in the ledger.)* |
| E2E-G2-14 | G-2 Coming back pulls at once | single | The same gap, still refusing every redial, and the page receives the browser's `online` event: the row arrives **before any socket is back**, because the resume pulls without waiting for one — the frozen-tab story, where the pending backoff may be half a minute away when the user looks. The sheet still says live updates are not connected, which is the positive signal that the socket was not the reason. |
| E2E-G2-15 | G-2 Why it says offline | single | The detail names **the last request that failed** — its method, its path and the status, or that nothing answered — so the state is readable off the screen instead of inferred (FR-19.6). The boot pull is refused with a 503 *before the app starts* — the shape where the glyph says `offline` and there is nothing else to go on. The refusals are **counted**, so the case cannot pass in a world where no request was made at all, and the status and path are asserted untranslated — a diagnostic is copied, not read as screen copy. |
| E2E-G2-16 | G-2 Since when it says synced | single | The detail carries **the time of the last completed sync** (FR-19.6): after a healthy boot the line is present and holds a time; in E2E-G2-15's refused-boot shape it is **absent**, because a sheet must not vouch for a connection the page never made. |
| E2E-G3-01 | G-3 Presence lock | server | Alice triggers *Packing Now*; on Bob's client the row shows "In progress by Alice", avatar + chip, and is non-interactive. *(The identity half runs on the mock-IdP `server` project: the row's holder line and M5's banner both name Alice, and Alice's own row says the claim is hers. The avatar and chip are not asserted yet.)* |
| E2E-G3-02 | G-3 Taking a row over | single (partial) / server | **What runs today (`single`):** where there is no second account the claimed row offers *no* action at all — the takeover surface is absent per G-8, not shown and then refused. **What the `server` project runs:** a claimed row offers exactly one action, *Übernehmen*, which confirms first naming the holder and the row; confirming leaves the row claimed by the *taker* (never free in between) and the previous holder gets an FR-6.2 notification. *(The `lock_events` record is asserted by Go tests, not yet by this case.)* It guards the loser's device rendering the row as its own claim — `myLocks` is a device flag, so the takeover must revoke it, or the notification arrives while the row says "You are packing this". That half cannot run in `single` for a structural reason rather than a missing fixture: both contexts are the same identity, so a takeover there is a takeover of one's own claim, which the server refuses by design — the same wall E2E-G3-01's identity half meets. *(No clock is advanced: FR-5.7 has no lock timeout.)* |
| E2E-G3-03 | G-3 Lock depth | single/server | A row another device is packing is read-only **in M5 too**, not only in M4's list: the sheet carries a banner naming the holder; its skip, note and prep controls are gone, while the packing stepper and the *Details* controls are **disabled rather than removed** — the stepper is where "3/5" is read, and removing it would take the state with it. The row's identity, quantity and state stay readable — G-3's "except viewing". The holder's own sheet is untouched. *(In the `single` project both contexts are the same identity, so what it proves is the mechanism — B never claimed the row, so B treats the claim as foreign — not whose name is rendered; the identity half stays with E2E-G3-01 on the mock-IdP `server` project.)* |
| E2E-G3-04 | G-3 Lock depth reaches membership | server | The for-whom strip (FR-25.28) is **read-only while another account holds a claim on any instance** of the item, and names the holder — a conversion rewrites rows that person is packing right now. The claim is taken on **one** child row and the membership row is asserted read-only in a **different** instance's M5 sheet — an unclaimed row, so the case proves the lock reaches past the row it was taken on, which is the whole point: a conversion rewrites the claimed row too. The positive signal is the same sheet with the claim released, where the row is operable. Needs two identities (ADR-029). `components/trips/__tests__/ForWhomStrip.spec.ts` carries the rule against a stubbed claim. The strip **says whose** claim froze it: every other G-3 surface names the holder, and this one cannot inherit it — M5’s banner is absent on the unclaimed row the sheet is opened from, and the strip is a modal above M5 in any case, so without its own line a frozen sheet would state no reason at all. Alice gives the row back rather than packing it, because the point is that the strip recovers without being reopened; the write that follows — Leonardo’s amount stepping to 2 — is the positive signal, since a frozen strip and a broken one look identical from outside. |
| E2E-G4-01 | G-4 Deep link | all | **Implemented.** Opening `/trips/{id}?item={itemId}&comment={c}` (ADR-046) lands on the item with its thread, scrolls to the referenced message and flashes it. The *landing* reads the query and nothing else, so it is driven in `local`; only the notification that produces the link is server-only, and its delivery is E2E-FLOW-02's. `notifications/format.ts` builds that URL (FR-6.3) and a unit asserts the string; this case is the one that opens it. The flash is a 2.4 s animation, so the sheet reports the outcome instead (`data-flashed-comment`), which is the deterministic seam the assertion needs. ~~expands its comments~~ — the thread is on M5's first level and is never folded (E2E-M5-11). |
| E2E-G5-01 | G-5 Optimistic UI | single | **Implemented.** A mutation renders without server confirmation; a forced failure surfaces only via the sync glyph, never a blocking dialog. "Without confirmation" is established without racing anything: the push carrying the row is **refused every time it is attempted** (counted, so the case cannot pass in a world where nothing was sent), and a row on screen regardless cannot have been waiting for an answer. The refusal is asserted *positively* — the indicator moves to `offline` and counts the pending write — so "no blocking dialog" is read on a screen known to have noticed. Two harness traps are documented in `e2e-tests.md`: an **unresolved route handler wedges the whole run** (no test timeout, no report), and the plain `page` fixture in this project is **unseeded**, so it lands on M19 rather than the app. |
| E2E-G6-02 | G-6 Controls do not navigate | all | On a row that is also a link, the stepper and the checkbox **act** — they never open the item sheet. Ionic wraps such a row in an anchor whose jump is a *default action*, so stopping propagation on the control is not enough; only the row's body opens M5. |
| E2E-G6-01 | G-6 Stepper/checkbox | all | **Implemented.** ~~qty=1 renders a checkbox; qty>1 renders the stepper~~ — both halves are asserted by E2E-M4-56, and the tap by E2E-G6-02; this id carries the **hold**. Holding + packs every unit, holding − takes them all back. The row arms FR-5.5's press-and-hold on *every* pointerdown inside it, so the control column stops the row's **press** as well as its **click** — otherwise a press on the stepper opens the row menu and the stepper's own hold is lost. Guarded in `PackingListPage.vue` (`onRowPress`). A completed row then leaves the list (FR-25.2), so the outcome is read on the trip counter and on the reveal — the hold is waited out through its own result, never a sleep. |
| E2E-G6-03 | G-6 Checkbox target | all | A tap beside a row's checkbox packs the row: once left of the glyph, in the control column, and once just below the checkbox's own box, where a miss would open M5. The click lands off the glyph on purpose — at its centre the case passes without the widened target too. Row-sized checkbox only; M5's large one is its own target. |
| E2E-G7-01 | G-7 Empty states | all | Each list screen (Trips/Templates/Items/Dashboard) shows its empty state with the single primary CTA. **What this id itself asserts is the Dashboard** (`smoke.spec.ts`); the other three are covered where their screens are: Items is **E2E-M9-04**, Templates is `template-list.spec.ts`, and M2 is **E2E-M2-16** — a number of its own rather than a second definition of this id (the gate allows one). M2's empty state carries no CTA of its own, by decision — the rule UI-Spec M7's *States* line records for the same reason: its G-7 CTA is the always-present `trips-new` FAB, on screen either way. The Dashboard half has a second path through it — E2E-M19-01 reaches the same empty state by *choosing* Local Mode rather than by seeding it. |
| E2E-G7-02 | G-7 Empty states | all | Every empty state (U-8) is inset `48px` above and `24px` from each edge, on whichever screen it appears — read from the rendered box on two unrelated screens (the master conflict log and M9) rather than from one. It is the *rendered* half of the rule a vitest gate already keeps in the source: the gate refuses a screen that declares its own `.empty-state`, and what it cannot see is a global stylesheet overriding the shared component from outside. The numbers are named rather than only compared, because an equality between two screens is equally happy with two screens that inset by nothing. E2E-G2-09 stays the case for *why* the inset exists — a sentence that wraps — and this one for its reach. |
| E2E-G8-01 | G-8 Collaboration hidden | single/local | **Implemented: the delegation picker.** Its two siblings are read on their own screens — Share is E2E-M2-06 and the notification section E2E-M17-08 — so this id carries M5's *Zugewiesen an*, absent rather than disabled where there is nobody to hand a row to, asserted from inside a *Details* section demonstrably showing its other rows. ~~no mode banner shown~~ — **kept and named rather than counted**: no banner is painted in any mode at any width, so nothing distinguishes the promise from an empty page. |
| E2E-G9-01 | G-9 Responsive | all | **Covered, under two other ids**: the rail is asserted visible at ≥900px by E2E-G9-09 and hidden below it by E2E-G1-01, which asserts the tab bar in the same breath. ~~+ inline actions~~ / ~~+ FAB~~ — **retired**: neither is width-conditional in the build. The FAB is on M7 and M9 at every width, and the app bar's actions do not change at the breakpoint; what actually differs there is the content column (E2E-G9-16), the wordmark, and M4's header line (E2E-G12-04). (The logo-from-within-a-trip clause is retired by ADR-011 — see E2E-G9-04.) |
| E2E-G9-02 | G-9 Two-pane M4/M5 | single | **Covered by E2E-M5-12**, which sets a desktop viewport, opens a row and asserts the panel — and by E2E-M5-09, which asserts the sheet over the list at phone width. Kept as a pointer rather than renumbered: a reader arriving from an older commit has to land somewhere that says where the promise went. |
| E2E-G9-03 | G-9 One header bar | all | A drill-down renders exactly **one** `ion-header`, carrying `‹ back` and the page title; no screen supplies its own (ADR-011). |
| E2E-G9-04 | G-9 Root vs. drill-down | all | A tab root shows the logo and **no** back control; a drill-down shows back and no logo. |
| E2E-G9-05 | G-9 Back is reachable | all | Back is **clicked**, not merely asserted visible, and lands on the route's declared parent. Occlusion is invisible to `toBeVisible()` — this is the case the pre-ADR-011 build failed. |
| E2E-G9-06 | G-9 Cold-start deep link | all | Opening a nested screen directly, with a one-entry history, still returns to the parent trip on back (Navigation_Concept §7 contract). |
| E2E-G9-18 | G-9 Cold-start deep link, the data half | single | A trip **sub-screen** opened directly — a reload or a shared link onto `/trips/:id/shopping`, never having opened the trip — renders the trip's rows (U-10). The row is the whole assertion, and it is the positive signal for the absence beside it: M6's empty state is that list's `v-else`, so a rendered row is the one thing a screen that did not pull the trip partition itself cannot produce — every sibling of M4 pulls it rather than relying on having been reached through M4. The mode is `single` on purpose — Local Mode hydrates the whole database at startup, so E2E-G9-06 beside it is green either way and cannot see this. ADR-033 is the doctrine: a partition that has not arrived is not an empty one. |
| E2E-G9-19 | G-9 A tab root's head comes from the frame | all | ADR-050. The tab roots are where "every head comes from the registry" could quietly stop being true — a title that simply vanished would redden nothing. Asserted on each, with the **logo** present and no chevron as the positive signal that the head is the frame's rather than a drill-down's; and the import control in the bar's cluster is followed through to the screen it opens, because a control that is present is not yet one that works. On M1 (FR-21.27) the head is asserted carrying the greeting and the subtitle as its meta line, with the screen itself visible, since the frame's head would stand there unchanged if the dashboard rendered nothing. |
| E2E-G9-21 | G-9 / M17 The build names itself once | all | The version string already carries the tag's own `v` — `git describe --tags` and the release workflow's `APP_VERSION=${{ github.ref_name }}` both hand it over with one — so a surface that adds its own prefix reads `vv0.10.0-…`, and a unit asserting the component's template back to itself passes against any prefix. The case asserts the **two surfaces agree**: the string in the app bar is contained in M17's About line. A prefix invented by one of them is then a mismatch rather than a screenshot nobody reads. |
| E2E-G9-07 | G-9 Global group survives | all | Sync glyph (G-2) and settings (G-1) remain present on a drill-down — the reason a per-screen bar was rejected, since the conflict log has no other entry inside a trip. |
| E2E-G9-08 | G-9 List → detail → back | all | The everyday round trip entered through the trip list. Uncaught runtime errors are asserted with **no exemptions**. *(No filter for the known Ionic cross-outlet error: ADR-012 removed the second outlet it came from, and a filter would only hide the next one.)* |
| E2E-G10-01 | G-10 Trip presence | server | Facepile of others on the trip, the **in-sync** badge, and the tap that names one person — plus the two absences that give the pile its meaning: no pile above one person, and none once the second leaves. Per-person state lives on the faces themselves (UI-Spec G-10, FR-4.6); there is no per-person sheet. ~~"the group-sync badge in both states"~~ — this case renders one of them; the other is E2E-G10-02. Its `presence-behind` absence sits after a visible `presence-in-sync` and the two are a `v-if`/`v-else`, so that clause cannot fail on its own; it is kept as documentation of the exclusivity, not counted as coverage of it. The ✕ on the named line is not pressed here — the case dismisses by tapping the face again — and is unit-owned in `PresenceFacepile.spec.ts`, together with the ordering, the overflow and the ring's own rendering. |
| E2E-G10-02 | G-10 Trip presence, lagging | server | **Implemented.** ~~a device is behind only while its reported cursor sits below the trip head, and the client reports one the moment its pull returns, so an e2e case could only race it~~ — that holds only for a device that is *allowed* to pull. `drainTrip` reports the cursor only after the pull **returns**, so a device whose trip-partition requests are blocked keeps the cursor it had and the lagging state stands still — a settled state, not a moment. Bob's pulls are blocked, Alice moves the head, and her screen counts one straggler in the badge's bubble, drops the ✓✓, and names *„Bob · catching up"* on the tap while naming Alice *„up to date"*. Unblocking and moving the head again settles it back, which is what makes it a state rather than a latch. What it adds over the units: `hub_test.go` computes `in_sync` from cursors and `PresenceFacepile.spec.ts` rings whoever a prop says is behind — nothing said the server's answer is that prop. |
| E2E-G10-03 | G-2b roster (FR-4.9) | server | Alice opens the sheet behind the cloud and reads that nobody else is packing; Bob opens the shared trip and her still-open sheet lists *Bob* over the trip's name; Bob goes to his own dashboard and it says nobody again — the socket and the subscription both stay, so only a roster built from the open packing list can pass. |
| E2E-G10-04 | G-2b roster (FR-4.9) | server | With Bob named in Alice's open sheet, she taps his row: the sheet closes and the visible page is that trip's packing list (M4 header) at its path. |
| E2E-G11-01 | G-11 Theming | all | **Covered by E2E-M17-06**: it opens a device with no preference and asserts Nacht *before* touching anything, presses the toggle, reloads, and presses it back — the default, the switch and the persistence, in that order. ~~no flash of wrong theme~~ — **kept and named, not counted**: it is a claim about the frames before first paint, and every assertion available here reads the settled document. |
| E2E-G9-09 | G-9 Navigation repaints | all | A rail entry (≥900px) changes the URL **and** the rendered screen. Asserted against the *visible* page (`.ion-page:not(.ion-page-hidden)`), because the defect this exists for was a route change that never repainted — every URL assertion in the suite stayed green throughout it. |
| E2E-G9-17 | G-9/ADR-012 An interrupted anchor switch | all | Tapping the rail's anchors **without waiting for the transition** — items → trips → templates → items → trips → dashboard → trips — leaves the outlet showing exactly one page, and the screen the URL names still answers a tap (M2's import icon reaches M15). The assertion is a *settled* count read after the URL has arrived, not a race: an interrupted push leaves its extra page there permanently, measured at z-index 101 over 100. E2E-G9-09 makes one settled switch, which is precisely what the defect survives. |
| E2E-G1-06 | G-1/ADR-012 The same rule on the tab bar | all | The bar's half of E2E-G9-17, below the breakpoint. One rule expressed in two templates needs two cases: the bar and the rail render from one anchor list but carry their own markup and their own handler. |
| E2E-G9-10 | G-9 Back lands | all | `‹ back` from M4 renders the trip list, and none of M4's app-bar actions survive the move. Complements E2E-G9-05, which proves back is *reachable*; this one proves it *arrives*. |
| E2E-G1-03 | G-1 Only M4 is full-screen | all | `/trips/new` keeps the tab bar. The wizard shares M4's path shape without being a drill-down, and the rule that hides the anchors on the packing list took them from the screen a first-time user starts on. |
| E2E-G1-02 | G-1 Full-screen packing | all | The tab bar is hidden on M4 (§3.25) and present on every other screen — including immediately after leaving M4, so the trip screen can never be an exit-less one. |
| E2E-G12-02 | G-12 Search follows the screen | all | The magnifier opens the *current* screen's field (trip list, **template list**), and no other screen's field is in the DOM. Guards the pattern rather than one page. The case also asserts that M9 offers **no** search action at all — FR-24.6 keeps the inventory's field out of the magnifier, and that is where the exception is worth reading. |
| E2E-G8-02 | G-8 No dev affordances shipped | all | The dev sample-trip seed is absent from a production build. It is a development convenience, not Demo Mode (retired in Addendum v2.10) coming back. |
| E2E-G11-02 | G-11 The brand marks where you are | all | The anchor you are on is the brand colour and the others are not — asserted in **both** presentations, the mobile tab bar and the desktop rail, because they are one rule in two templates that can drift apart. Compared against the role token rather than a hex, so the case holds in Tag too. |
| E2E-G11-03 | G-11 Brand, action and done stay apart | all | The FAB carries the brand gradient and contains no action colour; a packed checkbox is the done colour. Guards the drift this pattern exists to stop: Ionic paints its own primary on tabs, FABs and checkboxes unless told otherwise, one component at a time. |
| E2E-G11-04 | G-11 The anchors survive the flavour | all | The same role assertions in Tag, whose larch is a different hue entirely (`#9e5a10` vs Nacht's `#f0a44e`) — a rule written against a hex would pass here by accident. Tag's brand is deliberately the deeper one (G-11), which makes the role comparison the only assertion that can hold in both. Asserts the flavour actually switched before asserting anything about it, since the theme seed is device-local and easy to get silently wrong. |
| E2E-G11-05 | G-11 The brand's two forms agree | all | `--jp-brand` and `--jp-brand-rgb` resolve to one colour in both flavours. Each flavour writes the triplet by hand — CSS cannot derive it from a hex — and Ionic's `rgba()` internals are its only consumer, so a stale value shows up as slightly-off ripples and nowhere else. Compared as bytes through a canvas, since `color-mix()` computes to `color(srgb …)` and a plain token to `rgb(…)`. |
| E2E-VIS-01 | Visual The four tab roots | all | Baselines for Dashboard, Trips, Templates and Items at 390 px and desktop. The four surfaces every screen rebuild lands on, so a token change that moves one of them shows up as a diff rather than as something the maintainer happens to notice. |
| E2E-VIS-02 | Visual M4 with rows | all | The product's core screen and the one every token decision was judged against. |
| E2E-VIS-03 | Visual M4 done-hidden and done-revealed | all | The two states FR-25.2 creates. The snackbar is dismissed before the shot rather than waited out — a baseline that sometimes contains a toast fails at random. |
| E2E-VIS-04 | Visual M4 filter sheet | all | A layer over the list, which is where the G-14 plane and elevation rules are most visible. |
| E2E-VIS-05 | Visual M4 in Tag | all | One flavour spot-check rather than a second copy of every state: the flavour is decided in one token block, and one screen using brand, done, both planes and the elevation ink is enough to notice it moving. Doubling the set would double what an image-digest bump rewrites, for coverage of the same block. |
| E2E-VIS-06 | Visual M11 container list | all | The first baseline outside M4. It earns its place on three things no other baseline renders: a load bar whose fill carries an FR-10.3 grade colour, the paired/imbalance line, and the card list itself. The load is real — a master item with a weight, quick-added through its suggestion — because a bar with nothing in it grades nothing. |
| E2E-VIS-07 | Visual M11 container sheet | all | Not a second copy of E2E-VIS-04's plane: this is the M5 sheet grammar applied to a container, and the load line and pairing chips inside it exist on no other surface. |
| E2E-VIS-12 | Visual M1 below the hero | all | FR-21.28. The blocks under M1's hero card — the following trip and the planned lookahead — are photographed because that is where Ionic's card can stand in for ours: another radius, another inset, another shadow, none of which a stylesheet gate can see, because it is not our stylesheet. Three trips, each with a departure date, so which one is the hero is the rule (`byDepartureSoonestFirst`) rather than the fixture. |
| E2E-VIS-13 | Visual M25 — a trip's tasks | all | FR-7.7, FR-7.8, FR-7.14, ADR-075. The shot is taken after a reload so the tag's own snackbar is not part of a layout baseline. It holds the composer card on top with its phase and tag chips, a *Fällig* block holding the preparation due today with its pill and row chip on a second line, rows grouped under M6's `ListGroup` headings, full-width and without ✕, with M6's own `DragGrip`, and the FAB. It is the one place where both kinds of task and both phases stand together: a preparation with the chip of its row under *Vor der Reise*, a chore of the trip under *Während der Reise*, and the section heads' open counts. The task's provenance line is on its own sheet, not in the list. It is photographed because three of its decisions are pixels — the chip beside a seat in one cluster, the grip's own gap to the words, and the third pill above it, which is the row ADR-051 amendment 1 measured. |
| E2E-VIS-14 | Visual M26 — a trip's notes | all | FR-7.13. Two baselines. `m26-thread`: a titled thread's own view — its first note as a card on top with *4711* as a code chip, two replies below it as bubbles in the order written, the reply field fixed at the bottom. `m26-notes`: the list — the notes pill current in the switcher's fourth place, the titled thread's card with its words, the newest reply quoted and *2 replies*, and an untitled thread named by its first line with the rest of its words under it; the FAB. Photographed after a reload, so the thread is read back from storage and no snackbar is in a baseline. Its decisions are pixels: a card that shows its words, the chip, the reading direction, the field's place at the bottom. |
| E2E-VIS-11 | Visual M2 with the hero card | all | The `trips` tab-root baseline is an *empty* state, so the segment carrying the hero (FR-21.15) had no picture of itself. It is the one thing on that screen a stylesheet cannot be read for: a card inside a list of cards, which is exactly the collision G-14 exists for. Captured with a second trip of the same series below it, so the hero *and* the group it was lifted out of are in one frame, and with rows on the trip — a ring reading 0/0 is a picture of the card rather than of what the card says. |
| E2E-VIS-10 | Visual M1 with the hero card | all | The four tab-root baselines are all *empty* states, so this is the picture of the screen every rebuild lands on with data — and the hero (FR-21.13) is exactly what an empty dashboard cannot show. The trip is **started** first: a trip out of the wizard is planned, and M1 lists what is active, which is why the tab-root baseline shows an empty state at all. |
| E2E-VIS-09 | Visual M16 series profile | all | FR-13.3's checklist input can render at **width 0** — Ionic gives `ion-select` `width: 100%`, and as a flex item that is a basis of the whole row. That is the class this gate exists for: every assertion passes, the element is in the DOM with the right computed flex and height, and only the pixel says the box is empty. The row is captured **with content on both sides**, a select carrying a value beside an input carrying text, because an empty row of the same geometry would not show the collapse coming back. |
| E2E-VIS-08 | Visual G-2 detail sheet | all | The one surface reachable from every screen in every mode. It guards the header, the state line and the sheet's own plane — **not** the offset that prompted it: mutating E2E-G2-08's fix back moves 591 px, ratio 0.0018, and this gate allows 0.002, so it stays green. That is the documented consequence of the gate's tolerance — it catches layout changes, not small ones — recorded here as a worked example. The offset is E2E-G2-08's job. |
| E2E-M4-33 | M4 A pack registers, and can be taken back | all | Packing a row hides it *and* raises the snackbar; its undo returns the row to the open list, not merely to the revealed one. Run with `reducedMotion: 'reduce'` so the assertion is the outcome rather than the length of a transition — the production code takes its own no-motion path there, so nothing is being bypassed. |
| E2E-M4-34 | M4 One undo, not a stack | all | Two packs in a row leave exactly one snackbar, naming the second; its undo restores that row and leaves the first packed. It guards against the outgoing snackbar's dismiss handler disarming the *incoming* pack's undo. |
| ~~E2E-M4-35~~ | ~~M4 Un-packing announces nothing~~ | all | Reversed by FR-25.31: un-packing a revealed row is announced and undoable like every other act on the list. The promise is **E2E-M4-120**. |
| E2E-G13-03 | G-13 An icon is a glyph box, not text | all | An empty-state illustration computes to 64 px while body copy stays under 20 px. Guards the reason the two scales are separate at all: sharing one would tie an illustration to whatever body copy does next, and nothing in the token tables would show it. |
| E2E-G13-04 | G-13 The section head renders as its role | all | On M17, a section head computes to the display face, sentence case, above 16 px (FR-21.11). Asserts the **rendered** properties rather than the class list — a class that is applied but overridden looks identical in the markup. Scoped to the visible page, since a route that does not repaint leaves the previous screen's markup in the outlet. |
| E2E-G13-06 | G-13 A row names itself larger than it qualifies itself | all | FR-21.14. On M2 the trip's name is larger than its date line, at least semibold, and **both are the app's sizes rather than Ionic's 16/14 pair** — the last clause is what makes the case falsifiable, since name-larger-than-detail is true of Ionic's own defaults too. Mutation-proved against the one implementation detail that carries the rule: dropping the `[class]` attribute from the selectors puts every row back on Ionic's sizes and turns this red on both browsers, while the stylesheet still reads as correct. |
| E2E-G13-05 | G-13 The count is beside the head, not inside it | all | On M11, the unassigned head's count is its own element: the UI face, smaller than the head, tabular figures. The promise is falsifiable only because the count is a separate element — joined into the label it would render identically to a reader and read as the head's own text to the assertion. |
| E2E-G14-01 | G-14 A card is a plane, not a hairline | all | The M4 group card's painted background differs from the page behind it, and it carries the elevation token and the card radius. This is the defect the pattern exists for: a card painted the page's own plane passes every colour rule while being invisible as a card. Compared as bytes through a canvas, since a `--background` custom property and a computed `background-color` are the same paint in different notations. Also asserts the **list behind the cards** is not painted the card plane: Ionic reads `--ion-item-background` for `ion-list` too, so naming the card plane there would give every card a slab of its own colour to cast its shadow onto — the card/page comparison stays green throughout that. That assertion is also the only coverage of `ion-list:has(.jp-card)`, i.e. of `:has()` resolving alike in Chromium and WebKit; proved red in both. |
| E2E-G14-02 | G-14 Elevation follows the flavour | all | In Tag the card still casts a readable shadow. The assertion is that the shadow's ink is darker than the palette's **darkest surface plane**, not merely darker than the card — the weaker claim passes with Nacht's ink substituted in, which is exactly the regression it guards. Asserts the flavour actually switched first. |
| E2E-G14-04 | G-14 Two sheets present the same way out | all | The close control of the sync sheet and of the M5 item sheet compare equal in size, radius, fill and rim, and the fill is not transparent. Two sheets are compared because a single sheet's rendering is green whether or not the sheets agree. |
| E2E-G14-05 | G-14 A segment with a side margin stays inside its column | all | M7's scope segment ends at or before its parent's right edge, at a 390 px phone and a 1180 px tablet viewport. Ionic sizes `ion-segment` `width: 100%`, so a screen's side margin pushes it past the column by the margin's width and the scroller cuts its right end off straight — on a tablet and on a phone alike. M7 is the screen that gives the segment a margin. |
| E2E-G14-06 | G-14 A row menu is a sheet | all | M4's row menu (an `ion-action-sheet`) and M5's item sheet (`SheetModal`) compare equal as rendered: the top-left corner of the menu's first group against the modal wrapper's (and not `0px`), the two planes as bytes, and the header's font family, size and weight against the sheet's `.jp-sheet-title`. Proved red in both browsers with the theme rules removed (`0px` against `26px`). |
| E2E-G14-03 | G-14 A card bounds the group, not its entries | all | Three trips in one M2 card: the first two draw a seam, the last does not (its seam *is* the card's bottom edge). Measured off the rendered `border-bottom-width` inside `ion-item`'s shadow root — reading `--inner-border-width` on the host instead **passes against `lines="none"`**, the exact defect it guards, because Ionic drives the line from an attribute selector and the custom property is simply unset on a row nobody styled. |
| E2E-G13-01 | G-13 Type reaches the screen | all | The UI face carries an Ionic control (through `--ion-font-family`, not merely inherited from `body`) and the display face carries the page title, **and both faces report `loaded`** — a missing asset leaves the computed style intact and silently paints the fallback. |
| E2E-G13-02 | G-13 Fonts are self-hosted | all | No request to any font CDN during a boot, and every `.woff2` the page did fetch came from the page's own origin (Addendum FR-21.6). The regression it guards is the prototype's Google Fonts link finding its way into the app, which would break Local Mode on a device with no network. |
| E2E-G9-11 | G-9/G-12 Reaching M11 and coming back | all | The luggage entry in M4's bar menu renders the container screen, M4's own actions do not survive the move, and back restores both the packing list and its cluster. The *head* switches (ADR-050) with the screen as well — M11 names itself and puts the trip on its second line, M4 names the trip, and the registry is keyed per path, so a stale entry would leave M11's name standing on the packing list after back. The M11 unit exercises the screen; getting *to* and *from* it is a global pattern and lives here, per the working agreement: a screen suite that is green says nothing about navigation. |
| E2E-G1-04 | G-1/ADR-011 A global action gives back what it was opened from | all | Inside a trip, the gear then `‹` renders the packing list again — not the dashboard, which is the static parent `/tabs/settings` declares. Positive signal is M4's own FAB; the negative one is that the settings control is gone from the document entirely, because a screen left mounted mid-transition is briefly not hidden either. |
| E2E-G1-05 | G-1/ADR-011 A cold start still falls back to the declared parent | all | Opening `/tabs/settings` directly — no origin, the notification-deep-link case ADR-011 exists for — and `‹` renders the dashboard. This is the control that keeps the fix from being "back = history": without it, E2E-G1-04 alone would pass against a build that simply popped the stack. |
| E2E-G1-07 | G-1/ADR-012 The gear leaves one page in the outlet | all | Reaching a trip the way a user does — from M2's list, so the outlet holds two pages — and then tapping the gear. The outlet must show exactly one page afterwards, and M4's FAB must be hidden rather than merely absent, because Ionic keeps a stacked page mounted. E2E-G1-04 taps the same control and cannot see this: it arrives from the wizard, one page deep, which is too shallow for the leak. |
| E2E-G9-12 | G-9/§7 A flow returns to the origin it was entered from | all | M18 opened from M2 returns to the trip list, where the declared parent is `/tabs/settings` (M18 is entered from M2, M7 and Settings). Asserted on the **pathname**: `toHaveURL(/\/tabs\/trips$/)` is false-green, because the URL carries `?from=/tabs/trips` and the regex matches the query's tail. |
| E2E-G9-13 | G-9/§7 The same contract for M15 | all | The spreadsheet import opened from M2 returns to the trip list, where its declared parent is `/tabs/items` (it is entered from M2 and from M9's empty state). |
| E2E-G12-01 | G-12 Actions in the app bar | all | On a detail screen (M4, M6) the app bar carries that screen's icon cluster; navigating away clears it, so the previous screen's search never filters the next one. *(The settings gear stays on a detail screen — ADR-011: the sync glyph and settings are the only route to the conflict log from inside a trip.)* |
| E2E-G12-08 | G-12 A glyph on the trip switcher names itself when held | all | **Implemented** (ADR-051 amendment 3). Holding the shopping glyph on M4 shows *Shopping* in a bubble; the release does **not** navigate — asserted after the bubble has gone on its own, so the packing list still being current is a settled answer rather than an early one — and a plain tap on the same glyph still does. The defect it guards is the click every hold's release still fires. |
| E2E-G12-07 | G-12 The trip's places are named in the page | all | **Implemented.** ~~Shopping (with open-item count), Luggage and Analytics sit on the trip title line and each lands in one tap~~ / ~~**No ⋯ exists**~~ — M4 carries a ⋮ for its once-per-trip actions (UX-13, E2E-M4-57), and the trip's places are pills under the page's name (FR-21.21, ADR-051 and its amendments 1–3): every pill *named*, the current one in a word, the row measured at 360 px in its widest shape — five pills (FR-7.13). *Packliste*, *Einkaufen*, *Aufgaben* and *Notizen* are pills, *Gepäck* and *Auswertung* are words in the bar's ⋮ (asserted absent from the row and present in the sheet), the current view is marked with `aria-current` — including when it is one of the two, which join the row while you stand in them — and every view is reachable from every one — **the luggage and the analytics through the packing list** (ADR-051 amendment 2): M6, M25 and M26 have no ⋮ (asserted on each, on a rendered screen), so shopping → packing → luggage → analytics; M26's back is M4, and a thread's own view (FR-7.13) is named by its thread with M26 as its back. There is no sideways step from M6, M25 or M26 to the luggage or the analytics, by decision. |
| E2E-G12-06 | G-12 Icon-only is still nameable | all | **Implemented.** The subject is smaller than it sounds: the four anchors carry visible labels in both presentations, so the unlabelled icons are the bar's own cluster — M4's destinations are words in its menu (ADR-050), and the case reads search, filter, fold-all and the ⋮ instead. `header-back` and `header-settings` carry a `title` beside their `aria-label`, so a pointer resting on the back arrow or the gear is told the name too. The two names are asserted to agree, and the accessible one is read as a name rather than off the attribute — Ionic relays `aria-label` into its shadow button. **The trip switcher's glyphs are read too** (ADR-051 amendment 3: shopping, tasks and notes, off M4). A plain tap **navigates**. ~~and a long-press shows it as a bubble on touch~~ — **struck by decision**, not to be built: G-12's own ⋮ already answers it on touch, and in words. The one exception, the trip switcher, is E2E-G12-08's. **And the `title` half is narrower than the case makes it look**: measured over the source, only **9 of 62** icon-only buttons carry one, and the rule is **narrowed to the app bar**, where the label is dropped to buy room. This case asserts the bar's names at runtime; the standing guarantee is `iconButtonLabels.spec.ts`, which reads the toolbar and whatever is slotted into it out of `AppHeader.vue` rather than from a list. |
| E2E-G12-03 | G-12 Actions survive the collapsing header | all | **Implemented.** Scrolling M4 down collapses its sub-header, and search and filter still **act** from the collapsed state — the search narrows the list, the filter panel opens. The collapse itself is driven by E2E-M4-45, which asserts what the list does with its offset; this case reaches for the bar afterwards. Tappability is asserted through the outcome, because a button that is present and inert satisfies a visibility check. This is the reason the cluster lives there rather than on the status line. |
| E2E-G12-04 | G-12 The header line | all | **Implemented.** The line states figures alone at every width (ADR-050), and the case measures it at both sides of the G-9 breakpoint. The figures are a ring, a sentence and a track (FR-21.23) — the figure is two lines tall by itself, so the measurement is that nothing is stacked *beside* it, not that the line is one row. ~~the filter chip row appears only when active~~ — reversed by FR-25.11a/b, which made that row the place the grouping is stated, so it is always present (E2E-M4-15). The other clause is the **search field**, absent until it is opened. |
| E2E-G12-05 | G-12 Literal icons | all | **Implemented, read off the trip switcher (FR-21.21) at any width (ADR-051 amendment 3), where a glyph is all a view you are not standing on shows, which makes this case load-bearing rather than decorative. Two of the four are read inside the bar's ⋮ (ADR-051 amendment 1), which is the sharper version of the same rule: a reader who learned a glyph on a pill must not meet a different one in the menu.** Shopping, Luggage, Analytics and the Inventory anchor render four different glyphs — asserted as pairwise distinctness of the icon each button actually carries, including against the rail, because the trip's three neighbours are not the only glyphs the reader is holding in their head. Guards against one generic glyph standing for several destinations, which defeats dropping the labels. |
| E2E-G15-01 | G-15 The mark's slot and ladder | all | **Implemented** (`item-mark.spec.ts`). One item with a mark and one with neither, in the same list: M9 falls back to the **tag initial**, M4 to an **empty slot** and never to a letter, and the two slots measure the same width — which is the alignment promise, asserted on the painted boxes rather than on a class. *(The photo rung is the component unit's — see E2E-M5-15.)* |
| E2E-G15-02 | G-15 The mark is presentational | all | **Implemented** (`item-mark.spec.ts`). A marked row's accessible name is the **item name alone** — the mark carries `aria-hidden` and contributes no text (FR-28.5). Asserted against the row's `ariaSnapshot()`, not the DOM, since the failure mode is a screen reader announcing "tent Zelt". |
| E2E-G20-01 | G-20 A selection wears the app bar | local | `global-nav.spec.ts`. On M6, entering a selection turns the app bar into the selection's bar — *„Nothing selected"*, *„All 1"*, ✕ — with back gone from it, and the first row's top is **measured** equal before, during and after: an in-page bar would push every row down. The field stays in place and is `inert` while selecting. |

---

## 4. Per-Screen Test Cases (M1 – M20)

Each case is **Given / When / Then**, tagged with mode(s) and the requirement(s) it exercises through the UI. IDs are
stable references for the traceability matrix.

### M1 — Dashboard
> **Audit of backlog item 6.** Two of the six ids are implemented (`e2e/dashboard.spec.ts`) and **three describe a
> surface that is not built** — open, deliberately untested. The visual baseline is taken on a fresh Local Mode with no
> trips, and every other spec passes *through* the dashboard on its way somewhere, so these cases are the only ones that
> render a populated M1.

* **E2E-M1-01** `all` (FR-6.1) — **implemented** (`dashboard.spec.ts`), and two of its clauses are not the
  screen's. What is asserted: an **active** trip renders a card, the card counts what is open, previews three rows and
  reports the remainder as "+N more". The card is the hero (FR-21.13), so the counts are read as its two lines — the
  share beside the ring and what is still owed under it — plus the ring's own accessible name, rather than as one
  summary sentence; the preview and the "+N more" line sit *inside* the hero. The empty state's absence is asserted
  beside it, as the positive signal that the trip is active — M1 filters on the status, so a trip nobody started
  renders exactly the screen no trip at all does.
  ~~my open items~~: the dashboard is **not filtered by person**, it aggregates every open row of every active trip.
  FR-6.1's *"assigned to them"* is struck by decision: a filter would empty the screen in Local and Single-User Mode,
  where there is no account to be assigned anything. The *highlight* takes its place — the delegation becomes visible
  without the list becoming personal (E2E-M1-03). The aggregation this case asserts is therefore the screen's settled
  shape, not an interim one. ~~next 3~~: "next" names an ordering **nothing defines** — the preview is the first three
  of the store's own array, whose order after a reload is IndexedDB's over random ids. The case asserts three of four
  rows and the fourth counted, which is the rule the screen actually keeps.
* **E2E-M1-02** `all` (FR-7.3/7.6) — **implemented** (`dashboard.spec.ts`): a row's open preparation is listed in M1's
  **one** *Aufgaben* card, named by the **chip** of the row it prepares, and the card **offers nothing to tick** — M1
  takes no actions, so it carries no checkbox. Resolving the todo in M5, reached through the chip, is what clears the
  card; that is the positive signal that the card reads the todos rather than a copy of them. ~~grouped by item~~ in a
  card of its own (*Prep to do*): FR-7.6 names the row by its chip instead. ~~ticking one resolves it~~: struck, M1
  takes no actions. The hero's own task block of a finished packing is the exception and is worked (FR-7.10,
  E2E-M1-26).
* **E2E-M1-03** `server` (FR-6.1/6.3/4.4) — **implemented** (`server/multi-user.spec.ts`): Alice assigns a
  row and it appears on Bob's dashboard **while he is looking at it**, marked new, without a reload; opening it leads to
  the row; and coming back the same row is listed and not marked as news. Every assertion is scoped to **this case's
  row** rather than to the section, because the instance is shared and a sibling case delegating to the same account
  puts a section on the screen — the reason E2E-FLOW-02 filters its toast by item, the same trap here. Red-proved
  by dropping the join in `domain/dashboardSections.ts`.
* **E2E-M1-04** `all` (FR-6.3/G-4) — **half covered, half unbuilt.** That the card leads into M4 is asserted inside
  E2E-M1-01. ~~at the item~~: the preview rows are plain list items, not links, so M1 has no per-item deep link; the G-4
  landing itself is E2E-G4-01's, from a notification. The clause is retired here rather than left open, because the
  screen answering it would be a *new* affordance and G-4's own case already keeps the promise it names.
* **E2E-M1-05** `all` (G-7) — **implemented** (`trip-creation.spec.ts`, with E2E-M3-10): the empty state offers exactly
  one way forward and it reaches M3.
* **E2E-M1-06** `all` (**FR-5.1**, not FR-5.4) — **implemented** (`dashboard.spec.ts`): a trip departing **today**
  contributes its flagged, still-open rows to a cross-trip section, and only those rows; the section leads to each row.
  "Today" is *computed by the case* rather than waited for, so the clock is an input and not a race — the rule itself
  takes the date as a parameter (`domain/dashboardSections.ts`).
* **E2E-M1-06b** `all` (FR-5.1): the same flagged row on a trip departing **later** produces no
  section at all. The positive signal is the trip card, which is on the screen either way, because an absence read off a
  page that failed to load says nothing.
* **E2E-M1-07** `all` (FR-7.3/7.6): the **chip** on a task opens **that row's** sheet, asserted on the sheet's own
  todo rather than on the trip having opened. UI-Spec M1 promises the jump, and the chip carries it (FR-7.6). The
  section's name is its head and the number its count (FR-21.28), and the block under it carries `.jp-card` — the
  assertion that M1 is drawing the app's card rather than Ionic's, which no screenshot of this screen shows.
* **E2E-M1-09** `all` (FR-21.13): the trip departing **soonest** is the hero; the later one is
  still a list card. The case seeds **two** active trips on purpose — the promise is a singular, and a screen with one
  trip would be green whether the rule said "the one" or "every one". The later trip's visible card is the positive
  signal beside the absence, so "no second hero" reads as a shape rather than as a trip that failed to render. Both
  trips carry a **departure date**, and that is the case rather than the fixture: two dateless trips would make the
  hero an ordering nothing defines — green on Chromium, red on WebKit. The rule lives in the screen
  (`byDepartureSoonestFirst`), not in the assertion.
* **E2E-M1-08** `all` (FR-6.1), with the planned-trips section: a trip left in `planning` by the
  wizard is listed on M1 *as planned*, with its period, and leads to the trip. Three assertions carry it rather than
  one, because each alone passes on a wrong screen: the section could be a screen that stopped filtering by status (so
  the trip must **not** also be an active card), and the absent card could be a screen that shows the trip nowhere (so
  the section must be there). **Starting the trip is the positive signal behind the absence** — the same trip changes
  sides, which is what says the section is keyed on the status rather than listing a leftover. The section carries
  head, count and the card class on the block (FR-21.28), the same way as E2E-M1-07.
* **E2E-M1-10** `all` (FR-7.4) — **implemented** (`dashboard.spec.ts`). Trip
  todos written in M4 are reported on M1's *Aufgaben* card, read-only: the trip's own check (*„1 von 2 erledigt"*), its
  open todo as text and not its resolved one, the card line *„Aufgaben: 1 offen"*, and **no control on the card** (no
  checkbox, field or button). A second active trip without todos is absent from the card — an absence that means
  something only because the first trip is on it. The trip's block leads into the trip, where M4's section is visible.
* **E2E-M1-11** `all` (FR-7.4) — **implemented** (`dashboard.spec.ts`). Packing and tasks are two
  answers, asserted both ways on one trip whose only row is packed. With no trip todo the hero has no second figure;
  with one open (added in M4), the hero's share still reads complete **and** its todo figure reads *„0/1 Aufgaben"* as
  the share's pair — asserted at desktop width (side by side) and at 360 px (stacked); resolving it in M4 turns the
  figure to *„1/1 Aufgaben"* while the share reads the value it read before — the before/after pair on one locator is
  the signal, since „unchanged" alone is green on a card that never rendered the share. The reverse half unpacks the
  row: the share drops, the todo figure stays at *„1/1 Aufgaben"*. The hero shows a figure; E2E-M1-10 keeps the
  one-line check, on a list card.
* **E2E-M1-12** `local` (FR-30.7/30.5) — **implemented** (`dashboard.spec.ts`): a running trip's
  shopping card opens on *At destination* with its *Buy there* packing row, tagged *Packing list*; a planned trip with a
  *Buy before* row has a card titled *„Shopping · Elba 2027"* open on *Before the trip*; a planned trip with nothing to
  buy has **no** card (asserted beside its rendered row); the card's last line leads onto M6, with the switcher's
  *Shopping* pill current.
* **E2E-M1-13** `local` (FR-30.7) — **implemented** (`dashboard.spec.ts`): the card is worked. An
  entry typed there lands on the shown list; checking it off shows the card's undo, and *Undo* brings it back; checking
  the packing row off packs it (FR-3.3) — the hero's share reads *1/1 packed* on the same screen — and M6 then shows the
  entry open and the packing row under its reveal.
* **E2E-M1-03b** `local` (FR-6.1, G-8): Local Mode carries no delegation section, and the
  aggregation below it is still complete. The second half is the point: it is why FR-6.1's personal *filter* is struck
  rather than built.
* **E2E-M1-14** `server` (FR-7.9, FR-7.13) — **implemented**
  (`server/trip-notes.spec.ts`): the *Neue Notizen* card, M1's one deliberate exception to "M1 takes no actions"
  (decision 2). A second member's dashboard lists another's thread by its title, quoting the newest entry they have not
  seen with its writer (*„Alice: 044 555 01 00"*), and the trip's name; ticking it there is the same write M26 offers,
  so the card drops the row — asserted on the card itself, since an emptied card must not stay behind with nothing in
  it. A reply brings the thread back, quoting the reply, and the words open **that thread's own view**, named by its
  title.

### M2 — Trip List
* **E2E-M2-01** `local` (FR-2.1) — **covered, where the rule is actually exercised**: the segments *partition* the list,
  which E2E-M2-13c asserts from the other side (standing on *Archived*, the planned trip is `toHaveCount(0)`) and
  E2E-M2-13d again. The rest of the sentence is retired: ~~archived render muted with final stats~~ — the muting is a
  class the visual baselines own, and there are no *final* stats, an archived row carrying the same `packed/total`
  summary as every other row.
* **E2E-M2-02** `all` (FR-13.1): trips group under series headers with ~~destination +~~ count; tap header → M16. —
  **Implemented.** The header carries the series name and a trip count and **no destination**. The count is asserted
  as the *group's* (a third trip in no series must not be counted into it) and the grouping as containment rather than
  as a heading being present. The built screen's grouping by series is the rule by decision.
* **E2E-M2-03** `local` (FR-2.1/8.1) — **covered in three of its four parts and blocked on the fourth.** The name is
  asserted by every case that addresses `trip-row-<name>`, the dates by E2E-M2-12, the progress ring by E2E-M2-10 (its
  percentage, off a trip the device never opened). **Participant avatars are built** by decision, and this case's fourth
  part is asserted with them: the trip's *travellers* — the roster, not the presence facepile — as two faces and a
  „+N", plus a trip with nobody on it showing no pile at all, against a row that is demonstrably rendered.
* **E2E-M2-04** `local` (FR-12.1) — **covered**: M2's row actions open on a **hold or a right-click** as an action
  sheet (E2E-M2-19), and *Clone* is offered on an archived trip only (unit-owned in `trips.spec.ts`, `tripRowActions`).
  That the clone opens with
  the source's rows is E2E-M2-11 (`single`, ADR-033, the case that found ClonePage summing a partition the device did
  not hold); that ClonePage opens on a year of its own with empty dates is unit-owned in `ClonePage.spec.ts` — a *fresh*
  date is the absence of the source's, which is the shape a rendered case asserts worst.
* **E2E-M2-05** `server` (FR-4.5) — **implemented** (`e2e/server/multi-user.spec.ts`): Bob, an Editor on
  Alice's shared trip, is offered every other row action and not *Delete*; Alice, the owner, is. Her cancel leaves the
  trip where it was — without that half the confirm proves nothing about confirming — and her confirm takes it off her
  list and, after a reload, off Bob's, whose segment count is asserted first so the absence cannot pass against a list
  that has not arrived. `server` because `canDelete` reads the roster for the caller's own role: with one account the
  rule is inert by design, and the negative half exists nowhere else.
* **E2E-M2-06** `local` (G-8/FR-17.3) — **implemented** (`e2e/trip-list.spec.ts`): a device with no session
  is offered no *Share*, asserted against the row's other options so an empty menu cannot satisfy the absence. The
  positive half is E2E-FLOW-01's, on `server`.
* **E2E-M2-07** `local` (FR-18.3) — **implemented** (`e2e/trip-list.spec.ts`): the row menu's *Export trip*
  asks progress-or-clean and the answer reaches the file — the same trip and the same row both times, `packed_count: 1`
  in one and no `packed_count` at all in the other. Both branches, because one alone cannot tell a working choice from a
  constant.
* **E2E-M2-08** `all` (FR-16.2) — **implemented** (`trip-list.spec.ts`): an imported trip carries the chip
  and one made in the app does not. The imported trip is created **through M15**, the only writer of `trips.imported` —
  a fixture setting the column directly would assert the chip against a state the app cannot produce. Red-proved by
  dropping the render.
* **E2E-M2-09** `local` (FR-18.4) — **covered by E2E-G9-12** (`e2e/global-nav.spec.ts`), which reaches M18 from the trip
  list and comes back to it. ~~overflow →~~ the entry is a button in M2's own title row beside M15's, not an overflow
  menu; the sentence described a menu M2 does not have.
* **E2E-M2-17** `all` (FR-21.15): M2's *Active* segment draws the running trip that departs **soonest**
  as a hero card, does not also list it as a row, leaves the later departure a row, opens the rows' menu on a
  right-click (its *Archive* entry shown, then cancelled), and still exports from the card.
  Two running trips, because with one the choice cannot be told from the only trip there was — and the two are ordered
  so that M2's own newest-first list would name the *other* one, which is what makes the shared rule falsifiable
  (mutation-proved: replacing `heroTripOf` with the head of the screen's list turns the case red naming Kreta). The
  export and the menu are the clauses that carry the lift: a card without the row's actions is the cost FR-21.13
  deferred the card over.
* **E2E-M2-19** `local` (FR-4.5/FR-9.1/FR-18.3): **a right-click on a trip row opens its row menu** — the M4/M7
  shape — headed by the trip's name and listing exactly *Export trip*, *Start trip*,
  *Delete trip*, *Cancel* for a planned trip on a device with no second account. Choosing *Start trip* closes the sheet
  and moves the trip off *Planned* (the row is gone, *Active* counts one) while M2 stays on screen — the choice did not
  also navigate. A second row's menu, cancelled, leaves that row a door: a plain tap then renders M4 with that trip's
  name in the page head. `contextmenu` rather than a held pointer, the suite's convention (`helpers/m4.ts`): the 500 ms
  are `useLongPress`'s, and the hold's wiring to it is unit-owned in `TripListPage.spec.ts` with fake timers, as is the
  guard that ignores a tap while the sheet is up.
* **E2E-M2-16** `all` (G-7): M2's empty state states which segment is empty and offers **no CTA of its
  own** — the FAB is the way out, on screen either way (M7's reasoning). Its own number rather than a second definition
  of E2E-G7-01, whose case tests the Dashboard's half: the gate allows one definition per id. Asserted against the state
  going away once there is a trip — an empty state that is always on screen would satisfy the visible half on its own.
* **E2E-M2-15** ~~`all` (M2 ordering): the list renders **flat** — no series section headers — with the
  active trip first, upcoming trips **ascending** by date and archived ones descending, the series a chip on the row
  that opens M16 without also opening the trip.~~ — **struck by decision**: the built screen is the rule.
  `TripListPage` groups by series with a tappable header, sorts every segment strictly newest-first through
  `tripOrderKey`, and renders no series chip. The promise that survives is E2E-M2-02's.
* **E2E-M2-13/13b/13c/13d** `local` (FR-2.8) — **implemented** (`e2e/trip-list.spec.ts`): with no active
  trip and one planned trip, opening M2 lands on **Planned** and renders that trip; with neither active nor planned and
  one archived trip, it lands on **Archived**; with nothing at all it stays on **Active** and shows the G-7 CTA. A third
  leg proves the rule cannot steal a non-empty segment: standing on *Archived* with trips on it, leaving M2 for another
  tab and coming back keeps *Archived* — which is also the only leg that exercises the re-entry hook rather than the
  mount. A fourth: `?status=active` with an empty *Active* still lands there, because the caller outranks the walk.
  `local` throughout, because the walk needs a device whose whole trip world the test built.
* **E2E-M2-14** `single` (FR-2.8, ADR-033) — **implemented** (`e2e/single/opening-segment.spec.ts`): the
  jump waits for a settled list. With the master pull held, M2 shows the segment labels **without counts** and stays on
  *Active*; when the pull completes it decides once. The held pull is the whole case — against an unsettled list the
  rule would send every cold start to *Archived* and, because it decides on entry only, leave it there. Which segment it
  then lands on is deliberately not asserted there — the `single` run shares one database, so other tests' trips are in
  the list too; it asserts that the segment it chose is one that holds trips. The counts as rendered text (`0` on an
  empty segment, nothing while unknown) are E2E-M2-13's, and the settled guard's own failure mode is unit-proved in
  `TripListPage.spec.ts` by flipping the signal after the assertion.
* **E2E-M2-18** `single` (FR-2.8, ADR-033, G-7) — **implemented** (`e2e/single/opening-segment.spec.ts`):
  the *screen* waits too. The same held pull as E2E-M2-14, one layer up: while the master partition is outstanding M2
  shows „Reisen werden geladen …" and **no** `m2-empty`, and once it lands the notice goes and the trip is on its
  segment. Both halves are asserted together on purpose — the absence of the empty state means nothing without a
  positive line saying what the screen is doing instead, and it is the pair that separates "guarded" from "rendered
  nothing at all" — an unguarded screen shows `m2-empty` in exactly that window.
* **E2E-M2-34** `local` (FR-2.7, FR-9.3, G-12) — **implemented** (`trip-list.spec.ts`): the trip's properties and
  lifecycle steps are M2's alone. The row menu's *„Trip properties"* renders M22; *„Start trip"* moves the trip off the
  planned segment; on the running trip's hero *„Finish trip"* renders M4 **in the closing pass** (the banner), with the
  `closing` flag gone from the URL, and the trip is still running — the pass is what archives.

### M3 — Trip Creation Wizard
* **E2E-M3-01** `all` (FR-2.1/2.1a/15.1): step 1 metadata — name, dates auto-compute + display duration, attribute chips
  (season/transport/accommodation) set. The dates are set through the `DateField` picker (G-17, ADR-035) via
  `setDateField`, and the case asserts the field's rendered value is the locale display (`Sep 13, 2026`), never the ISO
  string the state holds.
* **E2E-M3-02** `all` (FR-13.1/13.2): series picker incl. inline "New series…"; picking a series prefills empty
  attribute chips from its defaults.
* **E2E-M3-03** `all` (FR-2.5): step 2 adds travelers **by name**; asserts there is **no** Adult/Child control and no
  type on the created traveler records (FR-25.9).
* **E2E-M3-04** `server` (FR-4.5/4.7): step 2 sharing — user picker (minus self), Editor/Admin role select; grants
  applied on create.
* **E2E-M3-05** `single/local` (FR-17.3/G-8): step 2 sharing/role part hidden; only traveler add/edit remains.
* **E2E-M3-06** `all` (FR-2.2/2.3/15.2): step 3 template checkboxes; live footer shows resulting count, deduped overlaps
  with strategy, and excluded items with reason ("skipped: season ≠ winter").
* **E2E-M3-07** `all` (FR-20.3/20.4): step 3 footer reports auto-pulled companion items; step 4 lists them with their
  main item, dedup notes, and suggested companions as opt-in checkboxes.
* **E2E-M3-08** `all` (FR-14.1/14.2): step 4 rows show the template quantity with a stepper and a one-tap history
  suggestion ("2024: 5 · 2025: 6 → 6").
* **E2E-M3-09** `all` (FR-13.3): step 4 offers the series destination checklist as opt-out extra items.
* **E2E-M3-10** `all` (FR-2.4/NFR-4.1): draft persists across steps offline; "Create trip" commits and opens M4; cancel
  leaves no residue.
* **E2E-M3-11** `all` (FR-27.1/27.2/27.6): step 3 — the list separates *Ferien-Vorlagen* from *Zusätzliche Gruppen* as
  two sections; a Vorlage's row counts what it **resolves** to rather than its own positions (a Vorlage with no own
  positions never reads 0); picking it resolves for real: the footer count matches the deduped set and the merge is
  **named** with both source groups ("Kamera nur 1× — in Makro & Wildlife"), and each group it already brings says so on
  its own row. There is no tab per scope and no "enthält: …" line on the Vorlage row: M3 has no scope segment —
  FR-27.6 asks for "sections/tabs" and a four-step wizard is not a place to add a second navigation control — and the
  "enthält" relation is stated from the other side, on the group rows that name the Vorlage bringing them, which does
  not repeat the same fact twice on one screen.
* **E2E-M3-12** `all` (FR-27.3) — **implemented** (`e2e/trip-composition.spec.ts`): step 3 — single master items joined
  via the inventory search: an item **not** in the resolved set raises the footer count by one; an item already in it is
  reported „bereits enthalten, nicht doppelt" and leaves the count unchanged; added items appear as removable chips, and
  removing one lowers the count again. The case ends on the created trip, where the picked row has to actually be — a
  preview count cannot prove that half.
* **E2E-M3-13** `all` (FR-27.7): step-3 footer reports the preparation tasks the selection carries ("📋 N
  Vorbereitungs-Aufgaben übernommen"); after creation each task exists as an FR-7.3 todo on its generated item, and that
  item stays un-done in M4 until the todo is resolved (blocking itself is covered by the M4 prep cases).
* **E2E-M3-17** `all` (FR-27.12): step 3 — a group row names its first items with a count for the rest, and the chevron
  opens the read-only peek sheet listing the *resolved* content (a Ferien-Vorlage peeks through its composition, a
  shared item appears once). The sheet offers no control that writes; closing it returns to the wizard with the draft
  intact.
* **E2E-M3-18** `all` (FR-2.6): step 4 lets a decision be made before the trip exists — dropping a row lands as FR-5.5
  *skipped* — visible and reversible in the wizard, and on the created trip **not absent but behind the *Erledigte*
  bar**, which is where the case asserts it rather than trusting the wizard's own display.
* **E2E-M3-14** `all` (FR-2.5a): step 2 opens with the household's default travellers from M17, editable there like any
  other traveller.
* **E2E-M3-15** `all` (FR-2.1b): a trip can be created with no dates at all — the year is preselected, so a name is the
  whole gate.
* **E2E-M3-16** `all` (FR-2.1c): step 1's optional fields are folded behind *Mehr Optionen ▾*, and the fold states what
  is set behind it.
* **E2E-M3-20** `all` (FR-2.1d): with a start date already set, the end picker offers no day before
  it. Asserted on the calendar itself — a day before the start is disabled, a day after it is not — because "everything
  is disabled" would pass the first half alone. The picker is **re-opened** rather than opened: one that already holds a
  value opens on that value's month, so the grid under test is the same on any day of any year, while an empty picker
  opens on *today* and the case would rot with the calendar.
* **E2E-M3-21** `local` (FR-2.5b/FR-1.4): a group carrying one trip-global and one per-person
  position, previewed on a trip whose step 2 was walked through without naming anybody: the count states the one row
  placed, and the *„Braucht Reisende"* block names the other position — not the exclusion block, which stays empty
  because no condition kept it out. The case then goes **back to step 2 and adds one traveller**, which takes the
  block away and lifts the count to two: without that half the two assertions above would also pass against a block
  that is always shown.
* **E2E-M3-22** `local` (G-17): the *Reise erstellen* button is pressed twice as fast as a hand can
  make it, and the trip list afterwards holds one trip. The create writes the whole trip synchronously and then leaves
  the screen, so between the write and the repaint the button is still under the finger; an unguarded second press
  writes a second trip with the same name, the same dates and the same positions, and neither screen says so.
* **E2E-M3-23** `local` (FR-7.4) — **implemented** (`trip-composition.spec.ts`). A Vorlage carries
  the trip task *„Pflanzen giessen"* and includes a group carrying the same text and *„Kühlschrank leeren"*; its
  position *Kamera* carries an FR-27.7 task besides. Step 3 reports **two** trip tasks on their own line — not three,
  and not folded into the preparation count, which reads one beside it — and the created trip, once started, lists
  exactly those two open todos on M1. The duplicate is the case: a count of three is what a concatenation without the
  dedup would show. M4's header reading exactly one open preparation is the positive signal that the trip tasks did not
  land on a row.
* **E2E-M3-24** `server` (FR-2.5, FR-4.5) — **implemented** (`server/multi-user.spec.ts`). Alice, in
  step 2, picks Bob from the *account* picker: the row appears named *Bob* with a role control, and after *Create trip*
  the roster lists Bob and Bob's own session opens the trip. The last part is the case — a trip is readable to a
  non-member never, so a wizard that recorded the traveller but skipped the grant fails here and nowhere else.
  Such a row carries no FR-1.9 per-row account picker — its link is the account it was added as.
* **E2E-M3-19** `all` (G-16): Enter in a step's plain field is the step's *Weiter* — nothing happens while the gate
  holds (empty name), the same keypress on the same field advances once it opens, and a step-2 traveller name fires the
  same way; step 3's single-item search is G-16-exempt, so Enter there does not advance — proven live by the button
  click that then does.

### Plain-HTTP instances (NFR-4.2a) — `e2e/insecure-context.spec.ts`

* **E2E-NFR-SEC-01** `local` (NFR-4.2a): with `crypto.randomUUID` removed before boot — the state a self-hosted instance
  served over plain HTTP is actually in — the id source still works, and the case asserts its own premise so it cannot
  pass vacuously.
* **E2E-NFR-SEC-02** `local` (FR-24.5): a new inventory item is created and appears in M9.
* **E2E-NFR-SEC-03** `local` (FR-2.1b): a trip is created through M3 — landing on M4 proves the whole cascade (trip,
  travelers, items) got ids, not only the first insert.
* **E2E-NFR-SEC-04** `local` (FR-27.1): a group is created in M7 and takes a position in M8.

*Why these are their own unit:* the suite serves from `localhost`, which **is** a secure context, so no ordinary case
can reach the broken state — the defect was invisible to a green suite on principle rather than by accident.

### App shell offline (NFR-4.13) — `e2e/pwa-offline.spec.ts`

* **E2E-PWA-01** `local` (NFR-4.13): once the service worker controls the page, a reload with the network cut still
  paints the app — asserted on the rendered chrome (header logo, visible page), never the URL. Settling is the worker's
  own lifecycle (`ready`, `controllerchange`), no timeouts.
* **E2E-PWA-02** `local` (NFR-4.13/NFR-4.2a): the worker never **answers** `/api`, `/ws` or
  `/health`, all three asserted rather than one standing in for the class. The seam is a **planted response**: the case
  puts a marker body for each of those paths into a cache of its own, and `caches.match` searches every cache on the
  origin — so a worker that stopped bypassing would serve the plant. The positive signal beside it is a path the rule
  does *not* cover, which does come back as the plant, so an absence means the bypass rule and not a mechanism that
  never worked. The cache half (`/index.html` held, `/health` never in a shell cache) stays. *Why a plant:* the worker
  writes no runtime cache entries at all, so asserting only that no cache entry appears for `/health` is green against
  a build with the never-cache rule deleted outright — and a **combined** mutation (bypass removed *and* a `cache.put`
  added) hides exactly that, so the red-proof removes the bypass alone.
* **E2E-PWA-03** `local` (NFR-4.13): the install declaration is complete — the manifest link and apple-touch-icon are in
  the document head, the manifest names JIT-Pack with standalone display and a maskable icon, and every declared icon
  URL actually resolves. A typo'd path here ships silently, because nothing else in the app ever fetches these files.
  It also asserts the **`theme-color`** — the one tag of the declaration that is not static, repainted
  by `theme.ts` from the active flavour's `--ct-base` (FR-21), so the case reads the meta and the computed token and
  compares them.

* **E2E-PWA-04** `local` (NFR-4.13, ADR-019) — the update policy: a new
  version installs in the background, is announced, does not touch the running app, and takes over on the next launch.
  Driving it needs a second worker on the origin, and registering a *different script URL on the same scope* is what
  produces one — a registration is keyed by scope, so the browser installs it into the registration the app is already
  holding and its `updatefound` is the app's own signal. Asserted: the new worker is **waiting** while the old one still
  controls the page; the G-2 glyph carries the dot and the sheet the sentence; the running app was neither reloaded (a
  `window` marker no reload survives) nor taken over under (`controllerchange` counted, and the controller re-read); and
  after the last client goes away — a *launch*, not a reload, which is why the case closes its page —
  `navigator.serviceWorker.ready` reports the new script active. **Not asserted:** that the
  relaunched app announces nothing — it registers `/sw.js` again, a *third* script URL in this fixture, which the
  browser installs as a new waiting worker, so the dot comes back a moment later and an absence asserted in that window
  is green only by being early (measured). *(Mutation-proved twice: with `watchForUpdate` unwired the announcement never
  appears, and with `self.skipWaiting()` in the install handler the takeover count reaches 1.)*

* **E2E-PWA-05** `local` (FR-19.7, ADR-044) — **the mirror of PWA-04**: the same waiting worker, applied
  *now* because somebody pressed for it. Shares PWA-04's fixture (a second script URL on the same scope). Asserted: the
  bar is on screen without opening anything, and the G-2 dot beside it; after the press the page is **replaced** — the
  settled state is a `window` marker no reload survives having gone, and `navigator.serviceWorker.controller` on the
  page that came up names the new script. **Deliberately not asserted:** that the bar and the dot
  are gone afterwards. The relaunched app registers `/sw.js` again, which in this fixture is a *third* script URL on the
  scope and installs as a fresh waiting worker, so the announcement returns a moment later; an absence asserted in that
  window is green only by being early (measured). The two cases are the whole policy
  between them and neither covers the other: deleting the `message` handler leaves PWA-04 green, and moving
  `skipWaiting()` into `install` leaves PWA-05 green.
* **E2E-PWA-05b** `local` (FR-19.7): *Später* is its own outcome. The bar goes away, the old worker is **still** the
  controller, and the offer stays where G-2 keeps it — the dot, and the sheet's action behind it. Without
  this the dismissal could be wired to the same handler as the press and every other assertion would stay green.
* **E2E-PWA-06** `local` (FR-19.7, G-19, ADR-060): the announcement arrives without moving the
  page under it. The content box is read before the worker is provoked and again once the bar is on screen, and the two
  are equal — the bar's own visibility is the settled state, so nothing waits on a clock. It is the case the ledger's
  *„a WebKit case lost its click to the FR-19.7 banner"* asked for, written as a property of the layout rather than as a
  hunt for the intermittent: a banner that pushes the page moves the content 64.8 px down and loses the same height.
  **Two more measurements** (ADR-060 amendment 1), both read off the same settled state: the banner starts at or below
  the page head's last pixel, and its box lies inside the content column's. A layer drawn over the head and across the
  full width fails the first by 80 px and the second by 288 px on either side at the default 1280 viewport.

*Chromium only:* Playwright hosts service workers only there; the worker under test is engine-independent and identical
in WebKit.

### M4 — Packing List (core)
* **E2E-M4-01** `all` (FR-8.1/7.3): the single header line shows packed/total, weight and the open-prep count (the
  latter only when todos exist), and stays **unfiltered** while a filter or search narrows the list below it. Analytics
  is reached from the 📊 icon on the trip line, not from the header (the KPI-tile entry is gone, G-12).
* **E2E-M4-29** `all` (trip screen) — **implemented**, and one clause retired. Landing **directly** in M4 from M2 or M1
  is asserted by `expectTripOpen` at every caller in the suite; the archived trip's closing card, *Vorlage aus dieser
  Reise* and the M14 suggestions are E2E-M4-53/54's and E2E-M21-01's. *„No phase tab bar anywhere in the app"* is
  **retired**: it guards a design that was never built, so there is nothing to regress to — an assertion on the absence
  of a screen that does not exist has no positive signal and would stay green through any defect.
* **E2E-M4-02** `all` (FR-8.2): grouping switcher Category/Container/Person/Status; selection persists per user per trip
  (survives reload; a second user/other trip unaffected).
* **E2E-M4-03** `all` (FR-5.1/G-6): item rows show state, stepper/checkbox and the mode, late-packer, traveler and
  packer marks. Each is asserted where it belongs rather than as one omnibus case — the row's two columns in E2E-M4-56,
  the traveler in E2E-M5-19, the packer/assignee edge in E2E-M4-30 — so this entry is a description of the row and not
  a case of its own. **There is no container chip, by decision**: M4 answers *which bag* by grouping (FR-8.2), not by a
  chip, and the right edge stays as FR-25.19 defines it — a fifth mark there is exactly what that requirement keeps off
  the row.
* **E2E-M4-04** `all` (FR-5.6/9.1): inline quick-add with master-item autocomplete; free text creates an ad-hoc item; on
  an active trip new items auto-flag *Missing*; input stays expanded.
* **E2E-M4-05** ~~`all` (FR-5.2): swipe right → *Packing Now*.~~ **Retired**: M4 has no swipe. Press-and-hold carries
  every action the gesture did (backlog item 11); `ion-item-sliding` survives on M2's trip list alone. The claim itself
  lives on in E2E-M4-49.
* **E2E-M4-06** ~~`all` (FR-4.3/5.5): swipe left → assign-to-me or skip.~~ **Retired**, with E2E-M4-05. The behaviour
  it described is covered by the press-and-hold menu: E2E-M4-37 skips, E2E-M4-38 undoes, E2E-M4-39 un-skips, and the
  collapsed *Erledigte* section is E2E-M4-23's.
* **E2E-M4-07** ~~`all` (FR-20.2): skipping cascades co-skip of dependent companions with a reason.~~ **Retired as a
  duplicate**: E2E-M4-40 asserts exactly this sentence — the cascade, the single snackbar naming the companion, the
  reason on the revealed row and the one undo restoring all of it. Two ids for one rendered outcome is how a suite
  grows a case that only ever re-runs another.
* **E2E-M4-08** `all` (FR-7.3) — **implemented** inside E2E-M4-25, which is its lifecycle: open prep todos render a
  count badge on the row (`m4-prep-badge-<name>`), and it is gone once the todo is. **The amber „packed with open prep"
  style is M5's, not M4's, by decision**: on M4 a row with open prep is distinguished by *staying on the list* plus its
  badge, and no amber is asserted here.
* **E2E-M4-25** `all` (FR-7.3/25.2) — **implemented** (`e2e/packing-list-sheet.spec.ts`): the full lifecycle
  in one case — an item packed while a prep todo is open stays **visible** and does **not** count as done (asserted on
  the reveal bar being absent, which is the positive signal for „nothing is done"); **resolving its last todo makes it
  done and it leaves the list**; revealing brings it back without a badge. The regression guard is the point and is
  mutation-proved: handing the view an empty `itemsWithOpenPrep` reddens it. The entry's second direction — *an item
  with a todo but no stored count still shows its badge* — is retired: no count is stored (FR-7.3), so there is no state
  to assert against.
* **E2E-M4-09** ~~`all` (FR-7.2): an item with open tasks refuses completion with an inline hint.~~ **Retired — the
  rule is reversed.** It restates PRD_Base FR-7.2 (*„An item cannot be fully marked as ready until all nested
  tasks are Resolved"*), which the Addendum's FR-7.3 overrides and the Addendum wins: packing such a row is *allowed*
  and produces the „packed with open prep" state, which stays visible and does not count as done (FR-25.2). There is no
  refusal and no hint in the screen, deliberately — refusing the tap would leave a packed rucksack the app says is
  empty. What the id was reaching for is E2E-M4-25.
* **E2E-M4-10** `server` (FR-4.4) — **implemented** (`e2e/server/multi-user.spec.ts`, inside E2E-FLOW-01): a row Alice
  packs reaches Bob's screen **without a reload**, carrying her name — the attribution is the server's own stamp
  (invariant 3), which is what makes it worth two accounts. The *animation* the entry also named is not asserted and
  will not be: motion is spec §3's untestable half, and the suite runs with it reduced.
* **E2E-M4-11** `all` (FR-3.2) — **implemented** (`e2e/packing-list-sheet.spec.ts`): the shopping entry is always
  there — M6 is a screen, not a notification — and carries a **count only when something is to be bought**, since a
  zero is worse than no number at all. The entry is a **word in the bar's ⋮** (ADR-050) and the count rides in the word,
  because an action sheet renders no badge; the case reads the menu's entries. Archiving is E2E-M4-54's (*Fertig*
  archives and lands on M14).
* **E2E-M4-12** `all` (FR-25.8/25.1, FR-25.28) — **implemented** (`e2e/membership.spec.ts`,
  one case): asserted in the same case as E2E-M4-58, whose *two of three at different amounts* is this entry's world
  with the numbers pulled apart; every clause below is a clause of that case, and running both would run one rendered
  outcome twice. The entry: a quick-add with two travelers lit in the composer's for-whom strip produces **one named
  cluster** with exactly two indented child rows, each showing its traveler and its own working control — and **no
  editor opens**: no modal is presented and M5 is absent, while the strip still holds the choice for the next add.
  Asserts there is **no** second top-level row repeating the name — the regression it guards is N separate items, where
  every individual row looks right and only the grouping is wrong, so the assertion must be on the cluster structure
  and the absence of duplicate top-level rows, not merely on "two rows of that name exist".
* **E2E-M4-13** `all` (FR-25.1 flat fallback) — **implemented** (`e2e/membership.spec.ts`, inside E2E-M5-19): a
  per-person item with exactly **one** member renders as an ordinary flat row labelled with that person („Kurze Hosen ·
  Andy“), **not** a one-child cluster — both halves asserted, since a cluster of one would also name Andy in its child.
  The state is reached by a membership of one, not by a quick-add: FR-25.8's mode is **absent** on a trip with one
  traveler (G-8) — which is where E2E-M5-19 already arrives.
* ~~**E2E-M3-13 (v1.0 catalogue, shadowed)** `all` (FR-2.5a): travellers configured in M17 are already in step 2 of the
  next new trip, in order, and removing one there still works.~~ — **retired as a duplicate**: **E2E-M3-14** is the same
  promise, and its test body carries every clause of this one — the M17 configuration, the three names in step 2, the
  **order** (the first is Andy) and the removal that makes them a starting point rather than a rule. The number's live
  meaning is FR-27.7's preparation tasks.
* ~~**E2E-M3-12 (v1.0 catalogue, shadowed)** `all` (FR-2.1c): step 1's optional inputs are **absent** until *Mehr
  Optionen* is opened, and a value set behind the fold is stated on the folded row.~~ — **retired as a duplicate**:
  **E2E-M3-16** is the same promise, implemented in `global-nav.spec.ts`, and it asserts both halves
  including the folded row naming the date it holds. The number's live meaning is FR-27.3's single master items.
* ~~**E2E-M3-11 (v1.0 catalogue, shadowed)** `all` (FR-2.1b): a trip is created with **no date touched at all**, and
  reads by its year in M2 where a date line would be.~~ — **retired as a duplicate**: **E2E-M3-15** is the same
  promise and is implemented in `global-nav.spec.ts`. The number's live meaning is FR-27.1/27.2/27.6's composition
  step, which the suite carries.
* **E2E-M4-20** `all` (FR-25.11b-rev): the filter panel has **no apply button** — asserted as *absent*, not merely
  unused — and a facet value bites while the sheet is still open: the head's outcome line and the list behind it both
  follow the tap. Closing only closes.
* **E2E-M4-15** `all` (FR-25.11a/b): M4 shows a single filter row; tapping it opens the sheet with *Gruppieren nach*
  plus the six facet groups (Person, Kategorie, Beschaffung, Gepäck, Merkmale, Status per FR-25.11l). Selecting a
  person narrows the list, and the selection appears as a removable chip in the collapsed row; tapping the chip's ×
  restores the unfiltered list. Asserts the grouping switcher is **not** present as a second bar in the header.
* **E2E-M4-16** `all` (FR-25.11c) — **implemented** (`domain/__tests__/packingView.spec.ts`: *ORs the values within one
  facet* / *ANDs across facets*): the OR-within / AND-across rule is arithmetic over a row list and is asserted where it
  lives. Building the world it needs through the browser — rows carrying two categories, three travelers and a buy mode
  — would cost a wizard run and three sheets to re-check a decided function. E2E-M4-20 already proves the panel is wired
  to it.
* **E2E-M4-17** `all` (FR-25.11d) — **implemented** (`domain/__tests__/packingView.spec.ts`, four cases): a value counts
  against the *other* active facets but not its own, dead ends are not offered, counts run over open rows only, and a
  selected value stays listed at zero so a filter can always be undone from the panel. Same reasoning as E2E-M4-16.
* **E2E-M4-18** `all` (FR-25.11e): the "Alles erledigt 🎉" state appears **only** when nothing is narrowing the list.
  Four cases, all required: **search** with no match, **filter** with no match, **search + filter** together, and
  genuinely-everything-done. The first three must all show "Keine Treffer" naming what is in force; only the fourth
  may celebrate. The reset offered clears **everything** narrowing — after pressing it, both the search term and the
  filter set are empty and the list is back. Regression guard: searching for a string the list does not contain must
  not announce completion — a check on the filter count alone would.
* **E2E-M4-19** `all` (FR-25.11f) — **implemented**, in two places on purpose. That the shared bucket
  **leads** the Person facet is `packingView.spec.ts`'s (*leads the person facet with the shared bucket rather than
  sorting it in*), because the sort lives there. The **word** is `e2e/packing-list-sheet.spec.ts`'s, because the unit
  deliberately labels only the values it can and leaves UI copy to the caller: three facets address absence with the
  same empty value, and one shared label makes Person read as „keine Kategorie". The case asserts the Person bucket's
  label differs from the Category bucket's and is not a form of *Alle* — the FR's own wrong answer, since the bucket
  means *nobody in particular*, not *everybody*.
* **E2E-M4-85** `all` (FR-25.11l): selecting **Status → Bewusst weggelassen** with *Erledigte* off shows the skipped
  row and hides everything else — proving the override, not just the bucketing (`packingView.spec.ts` already proves
  the arithmetic; this is the panel wiring). Then switching to **Status → Gepackt** shows the packed row instead. The
  chip row names the picked value the same way every other facet's chip does.
* **E2E-M4-87** `all` (FR-25.25) — **implemented** (`e2e/packing-list.spec.ts`): the late-packer
  flag set from the row's own press-and-hold menu. The rendered ⏰ is the evidence the write landed; reopening the
  menu and finding *„Spätpacker aus"* in place of *„ein"* is the evidence the entry states the row rather than a
  constant. Then off again, so neither direction is assumed from the other.
* **E2E-M4-119** `all` (FR-5.9) — **implemented** (`e2e/packing-list.spec.ts`): *Vor Ort kaufen*
  from the row's own menu. The row's *Buy there* badge is the row reading its mode back; M6's *Vor Ort* tab listing it
  is the same write reaching the other screen that reads it. Reopening the menu finds *Doch mitnehmen* in place of the
  entry, and taking it removes the badge again; its snackbar's undo (FR-25.31) brings the badge back.
* **E2E-M4-88** `all` (FR-25.26) — **implemented** (`e2e/membership.spec.ts`): the cluster head's
  fan-out. The menu names its scope („2 rows") before the action, and the flag is asserted **per instance in M5**
  rather than on the head — the head paints its ⏰ when *any* instance carries the flag (FR-25.23), so a head-only
  assertion is green against a fan-out that reached one row of two. The way back off it closes the case.
* **E2E-M4-89** `local` (FR-25.25, G-8) — **implemented** (`e2e/packing-list.spec.ts`): Local Mode
  renders no assignment seat on a row, because there is no second account to hand it to. Deliberately the negative
  half of E2E-M4-90: asserted alone it would also pass against a build where the control was never wired at all.
* **E2E-M4-90** `server` (FR-25.25) — **implemented** (`e2e/server/multi-user.spec.ts`): the row's
  own avatar hands the row to the other account, without M5. The row then **leaves** the list (FR-25.20) with the
  reveal bar naming the assignee — which is both the rule and the settled signal that the write landed — and the same
  control takes the assignment back.
* **E2E-M4-91** `local` (FR-5.8) — **implemented** (`e2e/remove-item.spec.ts`): an untouched row is
  removed from the row menu at once. The entry is the last before *Cancel*; the pack snackbar is the positive signal
  that the no-dialog path ran; the row is gone **and no reveal bar appears**, which is what tells a removal from a skip.
  The undo brings the row back, and a second removal survives a reload — the delete reached IndexedDB.
* **E2E-M4-92** `local` (FR-5.8 with FR-20.2) — **implemented** (`e2e/remove-item.spec.ts`):
  removing a main item with a required companion asks first and the alert names the companion; *Cancel* leaves both
  rows on the list (the positive signal that it was a question). Confirmed, the main item is gone from the done rows
  too while the companion is among them, skipped. Mutation-checked: with `removalNeedsConfirm` forced to `false` the
  case fails at the alert. The alert also says the main item leaves the inventory (ADR-065), and once confirmed M9
  lists *Akku* — its skipped row still uses it — and no *Drohne*. The confirmed removal has an undo (FR-25.31), so M9
  is read once its snackbar has gone.
* **E2E-M4-95** `local` (FR-5.8, G-9) — **implemented** (`e2e/remove-item.spec.ts`): at a desktop
  width, removing the row whose M5 panel is open closes the panel rather than leaving it to report the item as not
  found. Mutation-checked: without the close the panel is still counted.
* ~~**E2E-M4-113 (ADR-065, collided)** `local` (FR-5.8): the removal that takes its unused inventory item along.~~ —
  **renumbered to E2E-M4-115**: the live meaning of E2E-M4-113 is FR-25.30's case (`membership.spec.ts`).
* **E2E-M4-115** `local` (FR-5.8, ADR-065) — **implemented** (`e2e/remove-item.spec.ts`): two rows
  typed into the composer, so two inventory items used nowhere else. Removing *Zelt* announces *„from the inventory
  too"*; undone, and the screen left, M9 still lists *Zelt* — the undo lapsed nothing. Removed again and the snackbar
  left to run out, M9 lists *Schlafsack* and no *Zelt*. Mutation-checked: without the prune the last assertion fails;
  with a prune at removal time instead of at the lapse, the M9 check after the undo does.
* **E2E-M4-116** `local` (FR-5.8 with FR-25.21) — **implemented** (`e2e/remove-item.spec.ts`): a
  per-person item for two travelers, both instances packed; removing one traveler's instance from its own row asks
  first, naming **one** packed unit rather than the cluster's two, and takes only that row. The cluster dissolves into
  the other traveler's row, still packed, and a reload reads the same — taken once the snackbar has gone, since the
  delete is written when its undo lapses (FR-25.31).
* **E2E-M4-120** `local` (FR-25.31) — **implemented** (`e2e/undo-every-act.spec.ts`): a packed row,
  revealed and un-checked, raises the snackbar (*„unpacked"*); its undo packs it again — the reveal bar, gone with the
  last done row, is back and the check is set. Replaces E2E-M4-35's absence.
* **E2E-M4-121** `local` (FR-25.31 with FR-25.24 and FR-5.8) — **implemented**
  (`e2e/undo-every-act.spec.ts`): the amount raised to 2 through the row menu's popover is announced once the popover
  closes, and undone the check is back; a ＋ step (*„1 of 2 packed"*) is undone to *0/2*; and a **confirmed** removal of
  the row carrying that unit is undone to *1/2*, which a reload still reads — the row was never deleted.
* **E2E-M4-122** `local` (FR-25.31 with FR-25.25) — **implemented** (`e2e/undo-every-act.spec.ts`):
  *Late packer on* from the row menu, undone; the menu then offers *on* again and no *off* — the row's own answer.
* **E2E-M4-123** `local` (FR-25.31 with FR-9.3) — **implemented** (`e2e/undo-every-act.spec.ts`):
  in the closing pass one tap on a row's mark raises the snackbar, and its undo leaves the mark unpressed.
* ~~**E2E-M4-124**~~ **struck (FR-7.7): its promise moved to E2E-M25-06**, with the screen the trip's own tasks are
  removed on.
* **E2E-M4-125** `local` (FR-25.31 with FR-5.5 and G-3) — **implemented**
  (`e2e/undo-every-act.spec.ts`): *Doch einpacken* on a skipped row, undone, leaves it skipped again (the reveal bar is
  back); *Packen* (the claim), undone, takes the row's own-claim note away.
* **E2E-M4-129** `local` (FR-21.17) — **implemented** (`packing-list-sheet.spec.ts`): on a 390 px
  phone, a search's few hits overflow their screen by 150 px — past the yield threshold, short of what yielding frees.
  Scrolled to the end, the header line never changes state and the offset stays at the end. Red before the guard: two
  class changes and an offset back near the top.
* **E2E-M4-135** `all` (FR-21.17) — **implemented** (`packing-list-shape.spec.ts`): with the head
  yielded by a reader's own flick, the list carried to its end **and that flick over** — the screen says so, and a
  scroll is only nobody's once it is — a row that has gone off the top is brought back into view the way the browser
  does it, `scrollIntoView`, which nobody asked for. The header line does not change state once (counted, not sampled),
  and the row moves by the scroll and by nothing else. Red before the rule on both engines: one class change, and the
  row 162 px down on a 60 px scroll.
* **E2E-M4-127** `local` (FR-25.2) — **implemented** (`packing-list-sheet.spec.ts`): tapping the words
  of the *Erledigte* switch turns it on and it stays on — the regression it guards is a tick that comes and goes, the
  label forwarding the tap to a checkbox that has already toggled itself. Closing the sheet shows the packed row.
* **E2E-M4-128** `local` (FR-25.32) — **implemented** (`packing-list-sheet.spec.ts`): with a packed
  row and *Erledigte* off, typing its name shows it and the *Gepackte anzeigen* bar is gone; clearing the term puts the
  row away again and brings the bar back. The unit rows (`domain`) cover the other two switches and the facet exemption.
* **E2E-M4-126** `local` (FR-25.31 with FR-25.26) — **implemented** (`membership.spec.ts`): the
  cluster head's *late packer on for everyone* raises *„2 rows changed"*, and its undo clears the head's ⏰ — which the
  head paints while any instance carries the flag, so its absence is every instance.
* **E2E-M4-117** `all` (FR-25.26 widened) — **implemented** (`e2e/membership.spec.ts`): the cluster
  head offers a row's entries. *Menge ändern* from the head, stepped to 3, reads **0/3 on each child**, and *Nicht
  einpacken* takes the whole cluster off the working list — one skipped child of two would have kept it there. The
  snackbar's one undo brings both back at their amount.
* **E2E-M4-118** `all` (FR-25.26, FR-5.8) — **implemented** (`e2e/membership.spec.ts`): the head
  removes every instance of an untouched cluster without asking; no instance is left behind as a lone row, and the
  undo returns the cluster with both children.
* **E2E-M4-132** `local` (FR-5.9 with FR-25.26 and FR-25.31) — **implemented**
  (`e2e/membership.spec.ts`): the cluster head's *Vor Ort kaufen* switches **every instance**, read per child in its
  own M5 (the head draws one instance's mode, so it repaints on a fan-out that reached one child of two). With all
  instances bought there the head offers only *Doch mitnehmen*; its snackbar undo gives each instance its previous
  mode back.
* ~~**E2E-M4-96**~~ **struck (FR-7.7): its promise moved to E2E-M25-01.** The trip's own tasks are not written or
  listed on M4 — its section keeps only the preparations still due before the trip — so the case runs on M25.
* ~~**E2E-M4-133**~~ **struck (FR-7.7): its promise moved to E2E-M25-05**, with the screen the trip's own
  tasks are worked on.
* ~~**E2E-M4-134**~~ **struck (FR-7.7): its promise moved to E2E-M25-03**, which also asserts the *Meine*
  chip's absence — the second thing G-8 takes away on a screen with nobody to name.
* ~~**E2E-M4-105**~~ **struck (FR-7.7): its promise moved to E2E-M25-02.** E2E-M4-106 still holds the same
  rule for a preparation, ticked in M4's own window, so the snackbar's undo stays covered on this screen too.
* **E2E-M4-136** `local` (FR-7.6) — **implemented** (`trip-tasks.spec.ts`): a row's preparation and a
  chore of the trip stand in the one section, counted by the one figure (*„0/2 tasks"*), and the header line does not
  state the preparation a second time. Every clause is a pair, because „both kinds are here" is green on a list that
  renders one of them twice: the preparation carries the chip and the trip's own does not, the ✕ is on the trip's own
  and not on the preparation. Ticking the preparation in the section clears the **row's badge** — one todo read by two
  surfaces — and the figure survives a reload; the chip then opens the row's sheet on that same todo.
* **E2E-M4-137** `local` (FR-7.6 with FR-5.8) — **implemented** (`trip-tasks.spec.ts`): removing the
  packing row takes its preparation out of the trip's tasks — off the list and out of the count — while the trip's own
  task stays, which is what makes the disappearance about the row rather than about the section. The removal is
  **confirmed** rather than immediate precisely because the preparation cascades (`removalNeedsConfirm`), and the
  snackbar's *Rückgängig* brings row and task back together, which a list that lost the task for good would fail.
* **E2E-M4-138** `local` (FR-7.6 with UI-Spec M4) — **implemented** (`trip-tasks.spec.ts`,
  red-proved against a leading-tick build): both kinds of task are ticked at the row's **own end**, past the seat and
  the ✕ on the trip's own and past the chip on a preparation. Measured, not read off the markup — only the rendered
  box says which edge a control reached (invariant 9b) — and every box is read in one frame, because a section still
  unfolding reports edges that were never on screen together. The **packing row is measured in the same frame and
  asserted the same way**, which is what makes the case about the idiom rather than a number: that clause alone would
  stay green the day the packing control moves, and the task clauses would be the ones to fail.
* **E2E-M4-139** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): the whole shape of
  finishing the packing, in one pass. Two rows, one packed; the ⋮ step asks first and the question states *„1 open
  item"*, which is the one row still open rather than the two on the list. Confirmed, the open row leaves the working
  list and the card names the moment and the **1** left behind; the step is then **gone from the ⋮**, since a second
  close would re-decide rows nobody touched. The snackbar's one *Rückgängig* brings the row back **and** takes the
  card away — a close that was undone did not happen — and the ⋮ offers the step again.
* **E2E-M4-140** `local` (FR-5.10, variant P1) — **implemented** (`close-packing.spec.ts`): four of
  six socks are in the bag. Closing shrinks the amount to what travelled rather than skipping the row, so the trip's
  figure reads **4/4** and the row sits under the *Erledigte* reveal as a packed one. The figure is the assertion that
  separates P1 from P2: a skip would have written 0/0 and denied four socks that are in the bag. The quantity above one
  comes from the M18 import, which is the only path to one through the app (§2.4).
* **E2E-M4-141** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): a finished list stays
  workable. The composer opens on a closed list, says *„recorded as packed"* before anything is typed, and the row it
  adds lands packed — it is **not** on the open list, the card still stands (the addition did not reopen the packing)
  and the trip's figure reads *2/2*. Without the last two clauses the case would pass on a build where an addition
  silently revoked the decision, which is the failure the stamp exists to prevent.
* **E2E-M4-142** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): reopening is not the
  undo. Every snackbar is taken off the page first, so nothing the case then asserts can be an undo's doing; the card's
  *Reopen* removes the card and brings the ⋮ step back, **and the rows the close decided stay decided** — the skipped
  row is still off the working list and still counted behind the reveal. That last clause is the case: a reopen that
  restored rows would have to invent the amount variant P1 does not record.
* **E2E-M4-143** `local` (FR-5.10) — **implemented** (`close-packing.spec.ts`): the step is offered where the moment is,
  **and the offer does not take the screen**. With one of two rows packed the bar is **absent** — the negative half,
  without which the case would pass on a build that shows it always — and packing the second raises it, in the empty
  state, with no sheet. The list underneath is then operated (the reveal bar is clicked and answers), which is the
  clause that fails on a build where the offer is a sheet. Taking the offer opens the sheet; *Später* there leaves the
  trip exactly as it was: no card, and the ⋮ still offering the step.
* **E2E-M4-110** `local` (FR-25.29) — **implemented** (`traveler-progress.spec.ts`): a trip for three
  travelers with two shared rows shows three faces in roster order, each *nothing to pack*, and *Shared 0 of 2*. One row
  is given to Andy through the for-whom strip — Andy *0 of 1*, Shared *0 of 1* — and packed: Andy reads *done* while the
  trip line reads *1/2*, the same sum. A tap on *Shared* presses it and puts a person chip in the chip row with the
  shared row still listed; a tap on Andy then presses him **beside** it — two chips, Leonardo unpressed, the shared row
  still listed; the tap adds to the pick rather than replacing it — and a second tap on each releases only that one.
* **E2E-M4-111** `local` (FR-25.29) — **implemented** (`traveler-progress.spec.ts`): a trip for one
  traveler shows no per-person strip, read once the trip line has rendered.
* **E2E-M4-112** `local` (FR-25.29 with FR-9.3) — **implemented** (`traveler-progress.spec.ts`): on a
  running trip for three travelers the per-person strip is shown; opening the closing pass removes it, read once the
  pass banner is on screen, and cancelling the pass brings it back.
* **E2E-M4-113** `local` (FR-25.30) — **implemented** (`membership.spec.ts`): a per-person item for
  Andy (1) and Leonardo (2) is a cluster; a tap on Andy's FR-25.29 ring presses it, and the item becomes a plain row —
  no cluster head, no child row, and no *„Andy"* in its label. Its check is ticked **without the head ever being
  tapped**, the row leaves (FR-25.2) and the trip line reads *1/3*. A second tap on the ring clears the filter and the
  cluster is back, reading *„2 open"* with both faces — the half only M4's wiring can fail, by handing the view builder
  an already-narrowed list instead of the facet.
* **E2E-M4-106** `local` (FR-7.3 with FR-25.2) — **implemented** (`packing-list-sheet.spec.ts`): the same for a
  row's preparation, ticked in the trip's one task section (FR-7.6):
  it drops the row's badge and raises the snackbar; *Rückgängig* brings the badge back, also after a reload.
* **E2E-M4-107** `local` (FR-24.11 in the composer, FR-5.6) — **implemented**
  (`packing-list-adding.spec.ts`): „Zelt" typed while the inventory holds *Zeltheringe* shows the offer **above** the
  partial hit; ✓ opens the *„Neuer Artikel"* sheet on „Zelt" and **no row has appeared** — asserted once the sheet is
  visibly open, so the absence is not read before the write could land. *„Anlegen"* puts a *Zelt* row on the list, the
  composer stays open, and M9 lists *Zelt* — the row and the inventory entry are the same event reaching both places.
* **E2E-M4-108** `local` (FR-24.11, FR-24.7) — **implemented** (`packing-list-adding.spec.ts`): an
  inventory item typed in the other umlaut spelling („guertel" for *Gürtel*) shows no offer, and ✓ adds it directly — no
  sheet. Typed again once it is on the list, the composer says *„‚Gürtel' ist schon drin"* and ✓ is disabled.
* **E2E-M4-114** `local` (FR-25.13j, FR-24.11) — **implemented** (`packing-list-adding.spec.ts`): the
  browse-sheet opens with its search field visible and **not focused**, listing both *Zeltheringe* and *Kocher*; „Zelt"
  narrows it to *Zeltheringe* with the offer **above** it. Enter opens the *„Neuer Artikel"* sheet on „Zelt" and no M4
  row has appeared — asserted once that sheet is visibly open. *„Anlegen"* returns to the browse-sheet with the query
  kept, the offer gone and the *Zelt* line reading *„hinzugefügt"*; after closing, M4 carries the row and M9 lists three
  items.
* **E2E-M4-109** `local` (FR-24.11 with FR-24.3) — **implemented** (`restore-retired.spec.ts`): a
  retired item's name is offered as a restore; taking it puts the row on the list and the item back in M9, and M23 has
  nothing left to restore — no second item.
* **E2E-M4-97** `local` (FR-7.4 visibility) — **implemented** (`trip-tasks.spec.ts`): with no todo the
  section is closed and the header has no todo figure. With two todos, after a reload that no helper has touched, the
  section is open and **above the first row** (bounding boxes), and the header figure reads *„0/2 Aufgaben"* (since
  FR-7.14 *„Beim Packen 0/2"*, which is what it counts) and stands as the share's pair (`expectFiguresPaired`: same
  ring, headlines and tracks level, no sentence clipped — mutation-checked: without the paired layout the tracks sat 6
  px apart). Ticking one keeps it open at *„1/2 Aufgaben"*; ticking the last folds it to *„✓ Alle Aufgaben erledigt"*
  with the list gone and the figure at *„2/2 Aufgaben"* — the status line is the positive signal for the fold. After
  another reload it is still folded, and tapping the header figure unfolds it.
* **E2E-M4-103** `local` (FR-27.16) — **implemented** (`e2e/inventory-names.spec.ts`): two
  inventory items quick-added onto a trip, the ⋮ read without the entry, then both items renamed in M10. The trip still
  shows the old names; the ⋮ offers „Names from the inventory (2)", the sheet counts „2 of 2 selected", one untick and
  „All" put it back and the button reads „Take all 2 over". Applying renames both rows and the snackbar's *Undo* puts
  them back; applied again, both names survive a reload and the ⋮ — read as a populated list — no longer offers the
  entry.
* **E2E-M4-104** `local` (FR-27.16) — **implemented** (`e2e/inventory-names.spec.ts`): archived
  trips too. A trip with one inventory row is started and archived through the closing pass, the item is
  renamed in M10, and the archived trip's ⋮ still offers „Names from the inventory (1)"; applying it renames the row,
  which survives a reload, and the entry is gone from a populated menu.
* **E2E-M4-130** `server` (FR-5.1) — **implemented** (`e2e/server/multi-user.spec.ts`): the
  late-packer flag is trip state, so one account's „pack later" is the other's. Alice flags a row from its menu and
  Bob's open screen shows the ⏰ without a reload, and again after his reload (the server's copy, not a socket frame);
  clearing it reaches him the same way.
* **E2E-M4-93** `local` (FR-25.27) — **implemented** (`e2e/packing-list-shape.spec.ts`): flagging a
  row as late-packer drops it to the end of its group. The order is read **before** the flag as well as after it,
  because an assertion on a list that already stood in that order says nothing — the flag has to be what moved the row.
  A packed row is then revealed, which is what separates the three tiers from two: the flagged row sits above it, not
  with it.
* **E2E-M4-94** `local` (FR-25.27) — **implemented** (`e2e/packing-list-shape.spec.ts`): the
  *Spätpacker* switch. Read as checked before it is touched — the one switch of the three that starts on — then off, and
  the row goes while the reveal bar counts it. Everything else is then packed, and the assertion that the emptied list
  still offers the reset is what proves it did not fall through to *„alles erledigt"* over a row nobody has touched. The
  bar brings it back. It also pins the **order of the bars** — late-packers above packed — which is the rule the rows
  already follow read once more at the foot of the list. A search for the hidden row (FR-25.32) shows it and takes the
  bar away; clearing the term hides the row and brings the bar back.
* **E2E-M4-100** `local` (FR-25.28) — **implemented** (`e2e/membership.spec.ts`): the for-whom seat on a shared row
  unfolds the strip **under the row**, *Gemeinsam* lit and the summary saying so. Lighting one traveler renames the row
  *„… · Andy"* and lighting a second turns it into a cluster — a different element under a different list key — and the
  strip is **still open** after each, without a second tap: it is held by the item, not by the row. The seat then reads
  **2**, M5 and `ion-alert` were never presented, another row's seat **moves** the strip rather than opening a second
  one, and the seat that opened it folds it. A build that animates the old row out beside its replacement has the
  control twice for the length of the collapse, and this case fails on a strict-mode violation — the defect, not a test
  artefact. Read at once as the strip opens, while the rows under it are still sliding down, **nothing paints over the
  strip's foot** — rows drawn across it for 0.3 s look like a background too transparent to hide them; mutation-proved
  by removing the strip's stacking. And at TRIP's three travelers **every name under a face is whole**, not ellipsized —
  the line is laid out for three.
* **E2E-M4-101** `local` (FR-25.28) — **implemented** (`e2e/membership.spec.ts`): the last traveler
  leaving makes the item *gemeinsam* **without a question** — FR-25.28's narrowing of FR-25.21 (iii). The row is given
  progress first (`1/3`), because that is what a silent path could lose: afterwards *Gemeinsam* is lit, no question
  stands in the strip, the row still reads `1/3` and no longer names Leonardo. The lit *Gemeinsam* toggle is the
  positive signal the absent question is read against.
* **E2E-M4-86** `single` (ADR-033, G-7) — **implemented** (`e2e/single/empty-state-hydration.spec.ts`):
  the trip partition's half of E2E-M2-18. Opened straight onto M4 with every trip pull held, the screen shows
  „Packliste wird geladen …" and **no** `packing-empty`; when the pull lands the notice goes and the G-7 state appears
  with the FAB beside it. **It also pins the header figure**: `m4-progress` absent while the pull is held — „0/0
  packed" over a full track would be the same verdict the notice declines to give — and
  *visible* once the rows land, because without that half the guard could be satisfied by a header that never returns.
  `single` because Local Mode hydrates the whole database before the first paint, so the mode
  that cannot have the defect is also the cheapest to test — this is the one that can. The other eight screens in the
  same sweep are unit-proved rather than driven here (one spec each, the guard flipped after the assertion): a held
  pull per screen would buy nine minutes of pipeline for one rule, and the rule is the same one nine times.
* **E2E-M4-21** `all` (UI-Spec M4 group presentation): the group heading's computed size is **larger** than an item
  row's, and a group's rows sit in one block of their own. Asserted on computed style rather than on a class, because
  the defect it guards is purely visual: everything renders, in the wrong order of importance.
* **E2E-M4-22** `all` (FR-25.16): tapping a group header folds that group to **its header line alone**, which then reads
  "‹Gruppe› · N offen" — asserts **no** extra stub line is rendered and that N matches the group's open rows in the
  model. Other groups stay untouched. The app-bar fold-all control collapses every group to headers with **zero item
  rows** and flips its label to *Alle aufklappen*; pressing it again restores the full list. The folded set survives a
  re-render — packing a row must not unfold the rest.
* **E2E-M4-23** `all` (FR-25.16/25.2): a group whose rows are **all** done disappears completely — no header and **no
  stub** — and reappears only when *Erledigte* is switched on. Asserts folding and doneness stay separate concepts: a
  folded group with open items is still on the list, an absent group is not.
* **E2E-M4-24** `all` (FR-25.17) — **implemented**, split by what each mode can reach. The **time**, and that
  un-packing clears the stamp so it never outlives the state it describes, is `e2e/packing-list-sheet.spec.ts`'s: Local
  Mode has no account, so `packed_by_user_id` is null and the stamp reads its time alone. The **name** is E2E-FLOW-01's,
  where the server stamps the column itself. The avatar beside it is E2E-M4-30's.
* **E2E-M4-36** `all` (FR-25.13a) — **implemented** (`e2e/packing-list.spec.ts`): M4's ＋ hides while
  the quick-add composer is open — including after an add, since the composer stays open — and returns when it closes;
  the fab **container** (`#m4-fab-anchor`) survives throughout, because the FR-25.2 undo snackbar is positioned against
  it. The same rule has its own case on M8 (E2E-M8-17) and needs both: each screen writes it in its own template, so one
  keeping it says nothing about the other, and the shared `openQuickAdd` helper deliberately tolerates either state.
* **E2E-M4-37** `all` (FR-5.5) — **implemented** (`e2e/skip-item.spec.ts`): a row's press-and-hold menu offers *Nicht
  einpacken*; choosing it takes the row out of the working list (it is done, FR-25.2), raises the snackbar naming it,
  and the row returns through the *Erledigte* switch **stating that it was left behind on purpose** — the mark is the
  case's point, since a revealed skipped row that says nothing is indistinguishable from a packed one and re-opens the
  very confusion FR-5.5 exists to close. Driven through `contextmenu`, which shares the handler: the 500 ms of the hold
  are unit-tested with fake timers and are not a duration this suite may wait on.
* **E2E-M4-38** `all` (FR-5.5): the snackbar's undo returns the row to the **open** list, not merely to the revealed one
  — asserted by the reveal bar being gone afterwards, which is only true when nothing is done.
* **E2E-M4-39** `all` (FR-5.5): on a skipped row the menu offers *Doch einpacken* **and not** *Nicht einpacken*, and
  taking it back clears the mark. Un-skipping has to read as the opposite of the decision rather than as an "undo" that
  is long gone.
* **E2E-M4-40** `all` (FR-5.5/20.2): with a master dependency built through M10 and the companion pulled onto the trip
  by the quick-add (FR-20.4), skipping the main item removes **both** rows, names the companion in the one snackbar, and
  marks the revealed companion with the decision that took it ("weggelassen: „Drohne“ ist nicht dabei"). The single undo
  restores the whole cascade. `test.slow()`: the case builds its world through M10, M3 and M4 per §2.4 rather than by
  injection.
* **E2E-M4-41** `all` (FR-5.5, UI-Spec M4) — **implemented**: holding a row opens the menu **and not** the detail sheet,
  and cancelling the menu leaves the row's ordinary tap working. The release of a hold usually lands on the overlay
  rather than on the row, so a "swallow the next click" flag goes stale and eats a later, legitimate tap. **Not asserted
  here:** that a G-3-locked row has no menu at all — the guard exists in `PackingListPage.vue`, but a lock needs a
  second user and therefore `server` mode, which this unit does not have. Recorded rather than implied.
* **E2E-M4-42** `all` (FR-5.5, FR-25.1) — **implemented**: the same menu on a **per-person child row** inside a cluster
  — skipping one traveler's row leaves the other traveller's standing, and the revealed child carries the mark. The
  gesture is written into *two* templates, and the ordinary row keeping it says nothing about the child; a family trip
  is mostly child rows. Mutation-proved on its own: removing the child row's handler reddens this case alone.
* **E2E-M5-16** `all` (FR-5.5) — **implemented** (`e2e/skip-item.spec.ts`): the M5 sheet's control reads *Nicht
  einpacken*, skips on tap — the sheet's own state line then says so — and flips to *Doch einpacken*, which takes it
  back. The findable half of the pair; a screen keeping its half says nothing about the other, which is why this is not
  folded into the M4 cases.
* **E2E-M4-30** `server` (FR-25.19) — **implemented** in two layers. The rule — the packing record beats the
  assignment, and a row carries **one** right edge — is `domain/packingView.spec.ts`'s `rowEdgeAvatar` block, five
  cases.
  The rendered half rides on E2E-FLOW-02 (`e2e/server/multi-user.spec.ts`): Bob is responsible, Alice packs, the edge is
  Alice with the packer's tick and there is no second avatar. Two accounts are what the case needs — with one, the two
  columns cannot hold different people and the rule is satisfied by accident. Mutation-proved by inverting the
  precedence. The M5 sheet's read-only packing record is asserted inside E2E-M4-24 (`m5-stamp` carries the time and
  no control). **Not asserted, and
  recorded rather than implied:** the same edge on a per-person *child* row. `rowEdgeAvatar` is called from two
  templates and the rule is one function, so a child cannot disagree with a row about the precedence — but whether
  the child renders the avatar at all is a second template's business, and reaching it costs a cluster, an assignment
  and two accounts at once. It is the same shape as E2E-M4-42's argument for covering the child row's menu separately,

* **E2E-M4-31** `server` (FR-25.20) — **implemented** (`e2e/server/multi-user.spec.ts`, inside E2E-FLOW-02): a row
  assigned to Bob leaves Alice's list, the reveal bar states it and names him, the empty state says so rather than
  blaming a filter nobody set, and one tap shows the row. **The header guard**: the packed/total text
  is read while the row is hidden and asserted after the reveal, so a filtered list can never make the trip look further
  along than it is. The session-persistence clause is `usePackingFilter.spec.ts`'s, with the rest of FR-25.18.
* **E2E-M4-26** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`, two cases): the M4 quick-add lists
  **groups** under *„Ganze Gruppe hinzufügen“* with their resolved position count; typing filters them — asserted in
  both directions against a second group in the world, since "always offers the first group" would satisfy a single
  query. Tapping one adds **only the positions the trip does not already carry**, reports the result ("N Positionen, M
  schon dabei") and materialises the positions' FR-27.7 tasks as prep todos on them. The group's **provenance on the new
  rows** is asserted in `composables/__tests__/groupToTrip.spec.ts` rather than here: `source_template_id` is invisible
  on M4, and its user-visible consequences are a year away (FR-27.5) or belong to another case (the FR-27.4
  registration, M4-27). Asserts the new rows are **not** flagged *Missing* — an added group is a grown plan, not a
  forgotten item, and flagging it would feed M14 a false signal.
* **E2E-M8-20** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`): M8's composer is the
  *same component* with the group offer switched off, so M4 gaining groups could hand them to a screen where FR-27.1
  forbids nesting one. The case asserts the absence beside a **positive signal** — the free-text hint, which is the line
  M4 hides when groups match, so a leaked prop reddens it. Mutation-proved on both browsers.
* **E2E-M8-21** `all` (FR-25.13c) — **implemented**
  (`e2e/template-editor.spec.ts`): the empty composer offers the recent-items chip row; a chosen item is never
  offered again, asserted beside a chip tap that lands an FR-25.7 Standard row without the keyboard ever rising; and
  the trail crosses scopes — a fresh group offers what the last one just used, recency first. There is **no related
  row** ("Passt zu {Tags}"), by decision: it reads as noise, most visibly under the *Diverses* catch-all tag.
* **E2E-M8-22** `all` (FR-25.13d) — **implemented** (`e2e/template-editor.spec.ts`): the empty
  composer's *„Mehr aus dem Inventar…"* line opens the browse-sheet; the tag axis narrows on **any** tag (the two
  matching rows are the positive signal for the absent third); two taps land two positions in a run, each tapped row
  flipping to *„schon drin"* in place while the sheet stays open; the sheet's only input is its search field, unfocused
  (FR-25.13j) — free text is the explicit footer line, which dismisses the sheet
  and focuses the composer's field; the run's rows are on the editor
  with the FR-25.7 defaults. The sheet's own rules (grouping, carried-as-state not tappable, no-match line) are pinned
  in `InventoryBrowseSheet.spec.ts`.
* **E2E-M4-27** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`): tapping a group whose positions are
  all present adds nothing and says so; the row count is unchanged. Second direction: on a trip that still follows its
  groups the added group becomes one of the trip's sources, so a subsequent edit to it reaches the trip as an FR-27.4
  proposal the trip can apply (the applied-changes *log* half stays with E2E-M8-09). On a **past** trip — archived, or
  the end date gone by — nothing is registered: a running trip still follows its groups (FR-27.4), and only the past is
  frozen. **Two halves are asserted in unit tests instead, deliberately:** the *Missing* flag of M4-26
  is only ever set on an **active** trip, and nothing user-facing moves a trip to active yet — an e2e assertion would
  pass on a planning trip whatever the production code did — and the frozen-trip direction of M4-27 needs an
  **archived** trip, which the same gap puts out of reach. Both live in
  `client/src/composables/__tests__/groupToTrip.spec.ts` until the North-Star phase supplies the transition.
* **E2E-M4-28** `all` (FR-25.18): set two facet values and the *Erledigte* switch, leave M4 for M6 and return — the
  filter, the switch and the grouping are still in force **and their chips are visible** (FR-25.11a). Same after a
  reload. A **fresh session starts unfiltered**, and the search term is **not** restored. Regression guard: the chip row
  must appear together with the restored filter — a restored filter with no chip is an invisible filter, the exact
  failure FR-25.11a forbids.
* **E2E-M4-32** `all` (FR-19.2, ADR-011): opening M4 **cold** — a reload or a deep link straight onto the trip — lists
  its rows. Two separate defects read as *lost data* here: app-bar actions teleported into the header's DOM, which Ionic
  relocates, crash Vue mid-patch and abort the render; and a fire-and-forget Local Mode write lets a reload right after
  an add cancel the row's transaction. The case must **wait on the sync indicator returning to its settled state**,
  never on a duration — if there is nothing observable to wait for, that absence is the bug.

* **E2E-M4-14** `all` (FR-25.1/25.2) — **implemented** (`e2e/membership.spec.ts`): packing one instance of a
  two-person cluster keeps the cluster intact — the packed child drops out (FR-25.2), the head still counts over the
  full set (`1/2`), and the remaining instance is still a **child**. The rule is unit-tested twice in
  `packingView.spec.ts`; what this case owns is M4's own wiring, because the screen holds a full set and a hidden-done
  one and handing over the wrong one flattens the survivor the instant its sibling is packed — restructuring the list
  under the finger that is mid-tap.

* **E2E-M4-144** `local` (FR-7.7) — **implemented** (`close-packing.spec.ts`): finishing the packing
  is the moment „before the trip" ends, so the open tasks cross with it. Two preparations on one row, one of them
  already done; the question names *„1 open task"* — the count comes from the same plan the write reads, so it cannot
  say two while one moves, and the resolved one is not in it because its phase says when it *was* done. Confirmed, the
  task is off M4's window and stands in M25's *Während der Reise*. **One undo takes back the rows and the tasks**: the
  record holds a single action at a time, so a second `armUndo` for the tasks would have silently cost the rows their
  way back — the case reads the restored task from M4, where the undo was armed.

* **E2E-M4-145** `local` (FR-25.2 with FR-5.10) — **implemented** (`close-packing.spec.ts`): the
  reveal bar names what it counts, and so does the state above it. One row is packed and one is left behind by the
  close, so the word standing over both has to be true of both: the bar reads *„Show 2 done"*, and *„Hide 2 done"*
  once it is open, while the empty state the finished list shows reads *„All done 🎉"* —
  read before the bar is opened, since revealing the rows takes that state off the screen. **Both
  directions, because the label is built twice** — once per direction in the same template — and the pair can drift
  (a bar reading „Show 3 packed" and then „Hide 5 packed" for the same rows). The case
  ends on the revealed row wearing *deliberately skipped*, which is what makes the count more than arithmetic: without
  it, a bar reading „2 done" over two packed rows would pass just as well.

* **E2E-M4-149** `local` (FR-7.12) — **implemented** (`close-packing.spec.ts`): finishing the packing
  ends *before*. A packing row bought *before departure* and the shopping list's own entry both cross — the second
  travels the kernel contract the composition root binds, so a close that moved only its own rows fails here. The sheet
  counts both (*„2 open purchases"*), the one undo brings both back to *before departure*, and after the second close
  both stand *at the destination* while M6's *Vor der Reise* carries its lock line and no field, and M25's *Vor der
  Reise* is one folded line at the end whose fold holds the lock line, with no *Vor der Reise* chip on the composer
  (FR-7.14). *Wieder öffnen* gives both back and moves nothing. With FR-30.11 (no tabs), M6's *Vor der Abreise* is
  read in `m6-before` before the close and is afterwards the folded line *„Before the trip · closed"*
  at the end, whose fold holds the lock line; the composer stays and writes for *Vor Ort*. Mutation-proved: with the
  module's crossing skipped the case goes red at the own entry.
* **E2E-M4-148** `local` (G-14) — **implemented** (`packing-list-shape.spec.ts`): the header line's
  figures are a card — a non-zero corner radius — whose left and right edges are the tasks card's below it, measured
  on the painted boxes, at desktop width too, where a lone figure must not keep its own width.
* **E2E-M4-147** `local` (FR-25.13d, ADR-075) — **implemented** (`e2e/packing-list-adding.spec.ts`): the
  browse sheet heads its groups with M9's heading — the primary tag's name and the number of lines under it, in the
  shared `ListGroup` rather than a caption of its own. The count is what a caption of its own lacks, so it is what
  says the heading is the shared one.
* **E2E-M4-146** `local` (FR-5.11) — **implemented** (`close-packing.spec.ts`): once the packing is
  closed the composer asks *packed* or *forgotten*. Before the close there is no choice; after it *Eingepackt* is
  selected, and choosing *Vergessen* changes the hint to say what will be recorded. After the add the figure is still
  *1/1* (not packed, not an open job) and the row is absent from the open list; behind the reveal bar it reads
  *„Forgotten to pack"* rather than *deliberately skipped*. The default answer is E2E-M4-141's.

### M5 — Item Detail

**How to read this section.** Six M5 numbers — `E2E-M5-06`, `-07`, `-09`, `-10`, `-11` and `-12` — each carry one
live promise and one shadowed entry from the v1.0 catalogue. **A number means what the suite implements.** The
shadowed entries are struck through in place, each saying where its promise went, and are marked *(v1.0 catalogue,
shadowed)*; two promises with nowhere else to live have their own numbers, `E2E-M5-22` and `E2E-M5-23`. Nothing is
renumbered, so a reader arriving from an older commit can find out what happened to the id it names.

`scripts/case-id-gate.mjs` (in `make ci` and the CI client job) fails when an id has more than one *live* definition,
because a collision is not catchable by eye; a struck entry keeps its number on purpose and is a tombstone, not a
definition. The gate carries one rule and no escape hatch: a collision is resolved, never registered.


* **E2E-M5-09** `all` (UI-Spec M5): tapping a row opens the detail **over** the list — M4 stays on screen — and the ✕
  returns to the trip's own URL.
* **E2E-M5-10** `all` (G-4): a cold boot straight onto an item URL opens the same sheet, since the route is the state.
  Its ✕ leads back to the trip.
* **E2E-M5-11** `all` (UI-Spec M5 rework): packing, preparation and notes are on the first level; every attribute
  control is **absent** until *Details* is opened. The packing block carries its eyebrow label („Einpacken" /
  "Packing"), the same pattern as the prep and notes sections (UX-10).
* **E2E-M5-12** `all` (G-9): at desktop width the same content is a side panel beside the list, not a sheet over it.
  *Beside* is asserted as boxes rather than as a resolved `top` (ADR-064): the pane's right edge is the window's, its
  top is the app bar and its bottom the window's, and the list's right edge is at or left of the pane's. One computed
  style would be satisfied by a pane covering two thirds of the list.
* **E2E-M5-27** `all` (G-9, ADR-064): leaving M4 with the pane open takes the pane with it. The pane is the frame's
  now, so `.ion-page-hidden` — which is all Ionic does to a screen it navigates away from — cannot hide it; without
  its own unmount it would stand over the next screen. Asserted with the shopping view rendered as the positive
  signal that the navigation happened at all.
* **E2E-M5-28** `all` (G-4, ADR-064): a cold boot straight onto an item at desktop width opens the pane and no sheet,
  and the pane reaches the window's edge. E2E-M5-10 covers the same route at phone width; this is the pane's own
  path, and the one that needs the teleport's `defer` — the screen and its pane mount on the same tick, before the
  frame's host exists.
  And the page showing the panel is the same element that showed the list (ADR-046) — asserted by identity, because a
  second M4 mounted on open stands unhidden beside the first for as long as its children take to become ready, a
  failure that shows only intermittently on WebKit and never on an idle machine. Mutation-proved — a page keyed on the
  open item, i.e. a remount on open, reddens it on WebKit.
* **E2E-M5-29** `local` (FR-25.28) — **implemented** (`e2e/membership.spec.ts`): M5 is open on *one*
  instance and its strip acts on all of them, so it can delete the row it stands on. Unlighting a **sibling** leaves the
  sheet open with one avatar fewer lit — the positive signal — and unlighting the traveler the sheet was opened from
  **closes it**, with no *not found* notice ever shown, and M4 carries the item as *„… · Andy"*.
* **E2E-M5-30** `local` (FR-27.16) — **implemented** (`e2e/inventory-names.spec.ts`): M5 on an
  inventory row shows no rename line while the names agree; after the item is renamed in M10 it reads „The inventory
  calls it …", and *Take over* renames the row under the sheet's own title, drops the line and reports in M4's
  snackbar.
* **E2E-M5-31** `local` (FR-7.3) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against
  the leading-tick build): a preparation written in the sheet is ticked at the **end** of its line, flush with it and
  past the words — the edge M4 ticks the same task on (E2E-M4-138). The line is a flex row, so the order in the
  template and the order on the glass are two claims, and this one is measured.
* **E2E-M5-13** `all` (Navigation Concept §7 case 4) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against
  the unguarded build): the **browser's** back with the sheet open closes the sheet and stays on the packing list — the
  replace-based overlay history must not let a pop skip M4 and land on the trip list. The write-side rule is
  unit-specified in `src/router/__tests__/overlayBackGuard.spec.ts`.
* **E2E-M5-14** `all` (G-14/FR-21.8) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against the 26 px build):
  the header's save indicator sits on the ✕'s centre line. Measured on the rendered boxes, both read in one
  frame so the sheet's enter animation cannot fake a difference, and on the painted lamp rather than the cell that
  centres it, since that cell agrees with the ✕ by construction — which is the construction under test.
  **A shared diameter is asserted against**: it would make the indicator read as a second button, so the case requires
  the lamp to be visibly smaller than the ✕. *Equal width and height* is not the property that makes a header look
  crooked — a broken centre line is — and a measurement that over-states what it protects outlives its reason. Because
  the lamp is silent until the sheet writes, the case makes an edit first, which is also the only way it can fail for
  the right reason.
* **E2E-M5-32** `all` (FR-25.15) — **implemented** (`e2e/item-detail.spec.ts`): the indicator's spoken half.
  The live region is in the DOM with `role="status"` before the sheet has written anything, and **empty** — silence
  that is present, not absence — and it carries *„Gespeichert"* once an edit commits, with the lamp appearing beside
  it. The roles and the wording are owned by `SaveIndicator.spec.ts`, mutation-proved by hanging the region back on
  the lamp's `v-if`; what only the built bundle can answer is that the region is **invisible and out of flow**, which
  the case reads as a rendered box of at most 1×1 px. That is the half a scoped-style mistake breaks, and it breaks it
  by printing the word *Saved* in the header beside the item's name. The in-flight wording is deliberately not read
  here — racing a local write is a timing bet, and the unit case already owns it.
* **E2E-M5-17** `all` (FR-9.1) — **implemented** (`e2e/item-detail.spec.ts`): the two trip-feedback flags are controls
  behind *Details ▾* and appear **only once the trip runs** — the same case starts the trip and marks the row *unused*,
  so the absence half has a positive signal beside it rather than passing on a typo. Read back from the glance chip,
  which renders off the stored row.
* ~~**E2E-M5-06** `all` (FR-25.14): opening a **per-person** item shows its total as a **read-only chip** ("0/3") with
  **no** +/− control on it, and one row per traveler each carrying its own check or stepper.~~ — **retired: superseded
  by FR-25.21.** M5 opens on **one instance** and names its traveler and that instance's amount (UI-Spec M5). The `0/3`
  head and the untouched siblings are M4's cluster, where **E2E-M5-18** asserts both, together with FR-25.14's rule that
  a summed total is never a stepper.
* **E2E-M5-07** `all` (FR-25.15) — **implemented.** The sheet has **no Save button** — asserted in E2E-M5-11, beside the
  indicator that stands instead of one — and the indicator says whether *this device* has captured the edit. Its signal
  is `capturePending`, which counts this device's own open writes and nothing else — never `syncStatus.state`, **G-2's
  own state**, which FR-25.15 rules out: that state answers `offline` before `syncing`, so a write still open on a
  device with no network would render as **saved** — the single case the requirement exists for — while a background
  pull on a device with a network would render as *saving*. **Asserted where it can fail:**
  `composables/__tests__/captureState.spec.ts` (five cases, the offline one included) and three under *M5 FR-25.15 save
  indicator*; a browser could only race the transient ●, so no e2e claims it. **And asserted across all four sheets, not
  only this one** — `saveIndicatorWiring.spec.ts` scans every call site, because the defect it guards is one wrong line
  copied into four templates, and a behavioural case on M5 says nothing about M8, M10 or M11. It counts the call sites
  it found before judging them, so a scan that matched nothing cannot pass quietly. The *Details* toggle needs no case
  of its own — it writes nothing, so an assertion that it does not flip the indicator could not fail.
* ~~**E2E-M5-01** `all` (FR-4.2): distinct *Used by* (traveler) vs *Packed by* (user) sections.~~ — **retired: the
  screen has no free-form *Used by* label.** M5 asks *„Wer braucht das?“* (UI-Spec M5): for-whom is per-person
  **membership**, not a caption. FR-4.2's two halves are both asserted,
  apart — the packing record in E2E-M4-24/-30, the traveler in E2E-M5-18/-19.
* **E2E-M5-02** `all` (FR-3.1/10.2) — **implemented, split across three cases**: both controls exist behind
  *Details ▾* per E2E-M5-11, the mode is actually *switched* in `e2e/shopping/shopping.spec.ts` (a row set to *Buy
  before* leaves M4 for M6), and the container is switched in **E2E-M5-22**. This entry describes the fold's contents;
  it is not a case of its own.
* ~~**E2E-M5-03** `all` (FR-9.1): Unused/Missing flags visible only on active trips.~~ — **retired as a
  duplicate**: E2E-M5-17 is the same sentence, implemented, and carries the positive signal beside the absence that this
  one does not ask for. Same disposal as `M4-07 → M4-40`.
* **E2E-M5-18** `all` (FR-25.21; through M5's for-whom strip per FR-25.28): on a shared item, open
  M5, light Andy/Leonardo/Mia in the strip and step them to 2/3/1 on the amount lines under it; the strip's summary
  reads 6. Asserted **in M4 on the rendered cluster**: the item is named **once**, three child rows carry three
  *different* amounts, and the head reads `0/6` — the **sum** of the three, since every fraction on M4 counts units
  (FR-25.22). Deliberately not a row-count assertion — an implementation that creates N unrelated items sharing a name
  satisfies every count (FR-25.8).
* **E2E-M5-19** `all` (FR-25.21, FR-25.28): from a roster of three, unlight — **in M4's own strip, under the cluster
  head** — the traveler whose row has packed progress. The question is asked **in the strip**, in place of its summary
  line, naming the person and the count, and **no `ion-alert` is presented**; *Abbrechen* leaves the avatar lit and the
  child row at `1/2`; the confirming button removes the row and the head reads `0/3` — Andy's two and Mia's one
  (FR-25.22). Then unlight a third whose row carries nothing: that one is written **without** a question, with the strip
  still open over an item that has just gone from a cluster to a lone row. The cancel half is the positive signal that a
  removal is a decision rather than a side effect of tapping an avatar, and the silent half is the positive signal that
  the question is raised by what it would cost and not by the control.
* **E2E-M5-24** `all` (FR-21.16) — **implemented** (`e2e/membership.spec.ts`): with a cluster and a
  plain row both on M4, read the *rendered* type of three names — the cluster head, one of its child rows, and the
  plain row. The head is larger and heavier than its child, and exactly the size of the plain row. Asserted on computed
  style rather than a baseline because that is where the defect lived: every value in both blocks was a legal token
  (invariant 9b), and the component's own comment described the intended order correctly while the stylesheet under it
  did the reverse. Red-proved by giving the head `--jp-text-base`, which fails the first clause.
* **E2E-M5-25** `all` (FR-21.25) — **implemented** (`e2e/item-detail.spec.ts`): the sheet of an item
  with no prep and no notes is shorter than 80 % of the viewport — not a fixed 88 % — and unfolding *Details*
  makes it taller. The second half is what makes the first mean *content-sized*: a sheet that had merely been given a
  smaller fixed height would pass the first clause alone. Measured off the presented state (`data-presented`), never
  off a wait, because Ionic's enter animation is a duration nobody controls — and measured on the **modal**, not on the
  scroll box inside it: the box is only ever as tall as its content, so a case measuring it stays green against the
  very build it is about. Proved by mutation before it was believed.
* **E2E-M5-26** `all` (FR-25.21c; the strip's *Alle* per FR-25.28) — **implemented**
  (`e2e/membership.spec.ts`): the *Alle* toggle, tapped out of a **partial** membership that already carries a chosen
  amount (Leonardo 3). The two missing travelers arrive at 1, Leonardo stays at 3, and the summary reads 5 — a shortcut
  that reset the amounts would pass every count-based clause and fail this one. The toggle's own state is read before
  and after (`aria-pressed` *false*, then *true*), because a select-all that writes without reporting is half the
  control, and the full state is asserted as an *ordinary enabled* toggle — a second tap on it leaves the amounts and
  the summary where they are, which is the positive signal that the no-op is a no-op rather than an unnoticed toggle.
  ~~The case also holds the row layout — both checkboxes right of the stepper and past the sheet's midline~~: the strip
  has no checkbox column to place.
* **E2E-M5-20** `all` (FR-25.21b): collapse back to *Gemeinsam* from M4's strip. The question names **5** — the sum, not
  the largest — before anything is written; after *Zusammenlegen* one row remains at quantity 5, and the preparation
  todo written on the surviving row before the conversion is still on it afterwards. That last clause is the one worth
  having: ADR-036 chose keep-and-repoint over delete-and-recreate precisely so a structural edit cannot destroy the
  content hanging off a row, and this is the only place that claim is asserted where it would actually be lost.
* **E2E-M5-21** `all` (FR-25.21/FR-5.5; on M4's strip per FR-25.28) — **implemented**
  (`e2e/membership.spec.ts`): an item added with FR-25.13f's ✕ (*„zu Hause gelassen"*, quantity 0 and state *skipped*),
  revealed among the done rows, and then given to a traveler from its own seat — whose smallest membership is 1. The
  strip **asks first**, naming the item, and cancelling is the positive signal that the question is a gate: the avatar
  stays unlit. The confirming button reads *„Doch einpacken"* — the verb, never *OK*. After it, the assertion that
  carries the case is that the row is **on the list**, labelled *„Kurze Hosen · Andy"*: `isDone` reads *skipped* as
  done, so without this rule the row would be created and hidden in the same breath, and only a visible row disproves
  that.
* **E2E-M5-22** `all` (FR-10.2) — **implemented** (`e2e/containers.spec.ts`): moving an item from one container to
  another through M5's picker. E2E-M11-06 covers only the *first* assignment, out of the unassigned bucket; changing an
  existing one is possible only here (see E2E-M11-03). The readback is on **M11 and by weight** — the two cards are the
  only surface stating where the thing actually is, and a control repainting its own value would satisfy anything
  asserted inside the sheet. The bucket count is the third assertion: a move that dropped the old assignment without
  writing the new one leaves the item nowhere, and both card assertions would still pass. Red-proved by ignoring a write
  onto a row that already has a container — E2E-M11-06 stays green against exactly that.
* **E2E-M5-23** `all` (FR-20.1/20.4, carrying M5-10's promise) — **implemented**
  (`e2e/item-detail.spec.ts`): the sheet offers the *suggested* companion its item is missing, an unrelated third master
  item is **not** offered, one tap lands the row on M4, and re-opening the sheet the section is **gone**. The last
  clause is what makes it a live derivation of the list rather than a stored hint, and the negative one is the positive
  signal against a section that simply lists everything. FR-20.4's *required* companions join without being asked and
  are E2E-M4-40's; this case owns the asking. Red-proved by treating `suggested` as `required`, which makes the
  companion join on quick-add so the section never renders.
* ~~**E2E-M5-04** `all` (FR-14.1): history sparkline of quantities from previous series trips.~~ — **retired: not
  owed.** M5 has no history or sparkline; FR-14.1's per-item history is offered where the quantity is actually decided,
  in M3's review step (E2E-M3-08).
* **E2E-M5-05** `all` (FR-7.1/7.2) — **implemented** (`e2e/item-detail.spec.ts`): a note typed into the sheet
  appears in its notes section; the note's flag control **moves** it — gone from the notes, open in *Vorbereitung* — and
  once the sheet closes, M4's row carries a prep badge of 1 where it had none. A note and a todo are one record
  (`is_task = 1`), so the promotion is a row changing *collection* rather than a field changing on a row: a case that
  only looked for the todo would pass against a build that rendered it in both sections at once. M4 is the third reader,
  which is what makes the promotion a trip-level fact rather than something the sheet remembers about itself. Red-proved
  by writing `task_state` without `is_task`.
* ~~**E2E-M5-06 (v1.0 catalogue, shadowed)** `all` (FR-7.3): prep-todo section — add/resolve/reopen; resolve restricted
  to assignee/owner.~~ — **the lifecycle is E2E-M4-25**, which drives M5's own todo controls end to end. **The
  restriction clause is struck together with the FR**: FR-7.3 makes todos visible to, and resolvable by, every trip
  member — see the Addendum.
* ~~**E2E-M5-07 (v1.0 catalogue, shadowed)** `server` (FR-6.2): delegate (set Packed by → other user) triggers a
  notification on the recipient.~~ — **implemented under other ids**: E2E-FLOW-02 drives the assignment and the
  notification it fires, and E2E-NOTIFY-01 asserts the language it arrives in.
* **E2E-M5-08** `single/local` (FR-17.3/G-8): Delegate control hidden — **implemented at unit level**,
  `components/trips/__tests__/ItemDetailSheet.spec.ts` (*offers no picker where the only member is me* and *offers no
  picker where there is nobody to assign to (G-8)*). Deliberately not a browser case: the guard is arithmetic over the
  roster, and neither `local` nor `single` can render a second member at all, so a Playwright run would re-execute what
  is decided here and establish nothing further.
* ~~**E2E-M5-09 (v1.0 catalogue, shadowed)** `all` (FR-3.3): "Buy now" on a BUY_BEFORE item flips mode to PACK with an
  undo snackbar.~~ — **retired: the right behaviour on the wrong screen.** FR-3.3 is realised where
  the buying happens, on M6 — the check-off writes `bought_from` and moves the row (FR-25.11j) — and E2E-M6-17 asserts
  it, including the visit to M4 that finds the row afterwards. M5 offers no buy control and is not owed one.
* ~~**E2E-M5-10 (v1.0 catalogue, shadowed)** `all` (FR-20.1/20.4): Companions hint with one-tap Add (chains required
  companions).~~ — **the promise is E2E-M5-23**, the offer on M5. The *required* half is E2E-M4-40's cascade; this half
  is the offer.
* ~~**E2E-M5-11 (v1.0 catalogue, shadowed)** `server` (G-3): item locked by the other user → read-only with lock
  banner.~~ — **implemented under other ids**: the rendered banner in `e2e/server/multi-user.spec.ts` (which names the
  holder) and `e2e/single/server-sync.spec.ts` (both directions, including the banner's disappearance), and the rule
  itself in seven unit cases under *M5 respects the G-3 lock*, which carry this id in the file.
* ~~**E2E-M5-12 (v1.0 catalogue, shadowed)** `all` (FR-22.1): the source master item's photo renders when present.~~ —
  **implemented at component level on purpose**, as E2E-M5-15's entry records: setting a photo through the UI
  needs a camera or a file upload, so the photo rung of the identity slot is asserted where the component is mounted
  directly.
* **E2E-M5-15** `all` (FR-28.4) — **implemented** (`item-mark.spec.ts`): the sheet's identity slot shows the
  mark when there is no photo, an ad-hoc row's sheet shows **no slot at all** (the header has no column to align, so the
  title is the first thing on the line), and the mark is **not editable here** (no picker in the sheet) — it belongs to
  the master item, and M10 owns it (FR-28.7). *The photo rung of the same slot is asserted in the component unit rather
  than here: setting one through the UI needs a camera or a file upload, which is `item-detail.spec.ts`'s subject and
  not the mark's.*

### M6 — Shopping Views

The shopping list is a module of its own (FR-30, ADR-066): entries typed into it are rows of `shopping_entries`, and
the packing list's buy-mode rows are shown beside them. Every case below reaches a packing row the way a person does —
added on M4, its mode chosen in M5 (`addBuyRowOnM4`) — because M6 writes no packing rows; the cases live in
`client/e2e/shopping/`. M6 has no inventory composer, so its composer cases (E2E-M6-21, E2E-M6-25) are retired.

* **E2E-M6-01** `all` (FR-3.2, FR-30.11) — **implemented** (`e2e/shopping/shopping.spec.ts`): the two lists (Before
  departure / At destination) are sections one under the other, no tabs; each head counts the **things to buy** open
  under it rather than rows (FR-25.6) — *„3 open"*, a bare head for none — and the empty *Vor Ort* says so in its own
  line. The rows come from M4 with a buy mode; one entry is typed into M6's own field, for *Vor Ort* through the
  composer's list chip, and is asserted under *„Eingetragen"* (FR-30). A tagged master item's category does not surface
  as a heading: the packing rows are combined under one *„Packing list"* heading, asserted by name, and a per-category
  heading is asserted absent. The clause about the destination list showing **destination-checklist entries
  separated** is **not testable yet**: those are FR-13.3 standing entries, which wait for trip series in the client, and
  would pre-fill entries (FR-30).
* **E2E-M6-02** `all` (FR-3.3) — **implemented inside E2E-M6-17 and E2E-M6-22** rather than as a case of its own: both
  halves of this promise are asserted there — the row leaving the list, and the reveal note naming where it went — so a
  third case would re-run them for an id's sake. M6-17 also asserts that **the packing list is actually visited**,
  because *„on the packing list"* is a string until the screen
  it names has been looked at: check off a BUY_BEFORE item → it transitions to PACK and leaves the list; BUY_LOCAL →
  packed, and it leaves the list too. *„with animation"* is deliberately dropped from the assertion set: a transition
  nobody can observe deterministically is a `waitForTimeout` waiting to be written.
* **E2E-M6-03** `all` (FR-5.6) — **implemented inside E2E-M6-01**: free-text add directly into either list, the list
  chosen with the composer's chip. The free text is an **entry of the list's own** (`shopping_entries`, FR-30.1), not a
  packing row; E2E-M6-26 asserts it reaches no packing figure.
* **E2E-M6-04** `all` (FR-3.2) — **implemented** (`e2e/shopping/shopping.spec.ts`): with both lists empty, M4's ⋮
  keeps the **shopping entry** and drops only its **count** — the destination exists either way, and hiding the entry
  would leave an empty trip unable to reach M6 at all. The entry lives in the menu (ADR-050), so the count is part of
  the word rather than a badge.
* **E2E-M6-05** `all` (FR-25.6) — **implemented** (`shopping/shopping.spec.ts`): a **per-person** item in a
  buy mode appears in the shopping list at all — the regression it guards decides open-ness from the item's own
  `packed`/`quantity`, which a per-person item does not carry. It renders as **one aggregated row** with
  the summed quantity ("6×", from 2 + 3 + 1), the recipients named ("for Andy, Leonardo, Mia") and their avatars —
  **not** one row per traveler. The **tab's own count** is asserted with it: it counts things to buy, so a segment
  reading three over a list showing one is the same lie in the other direction.
* **E2E-M6-06** `all` (FR-25.6/3.3) — **implemented**, and the half that matters: a single aggregated row
  that settles only one instance is worse than three honest ones. Checking off that aggregated row settles **every**
  instance in one act — a BUY_LOCAL per-person item leaves the list fully packed for all recipients, and a BUY_BEFORE
  one moves to PACK for all of them. Asserts no instance is left behind — through the **empty state**, because two
  instances left over would still render a row of their own, and through the undo, which brings the whole amount back.
* **E2E-M6-07** `all` (FR-25.6) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it is.
  A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and the
  composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant 4's
  shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* a per-item note can be added from the row, is shown inline on it, survives a re-render, and can
  be edited and cleared — without leaving M6.
* **E2E-M6-08** `all` (FR-25.10) — **implemented inside E2E-M6-05**: the recipients line carries no control,
  asserted beside a positive count of the row's one checkbox so the absence has something to fail against: the shopping
  row offers **no free-form "for whom" control**; the recipients shown are derived from membership only. Guards against
  reintroducing the attribution FR-25.10 removed.
* **E2E-M6-16** `all` (FR-25.13a) / **E2E-M4-21** `all`: both quick-adds carry a **visible confirm button** in every
  mode, and adding works by tapping it alone — no keyboard involved. Guards the phone case, where relying on Enter
  leaves no reachable way to commit. **M6's half (FR-30):** M6's own field carries the same visible add
  button, and every entry in `shopping/shopping.spec.ts` is committed by tapping it (`addEntry`), never by the keyboard.
* **E2E-M6-12** `all` (FR-25.13a) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* the quick-add offers name, description and a *Zugewiesen an* chip row. Adding with all three set
  produces a row carrying the description inline and the assignee mark. **Enter commits from the description field
  too.** Regression guard: tapping an assignee chip must **not** clear an already-typed description — the failure mode
  of re-rendering the form on selection.
* **E2E-M6-13** `all` (FR-25.13a) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* after an add, the **assignee stays selected** for the next item while name and description are
  cleared. Asserts the carry-over is on the assignee only.
* **E2E-M6-17** `all` (FR-25.11i/j, FR-30.11) — **implemented**: checking off a row hides it; the list's own *gekauft*
  reveal — M4's FR-25.2 shape, not a filter sheet, which M6 does not have — states the count and one tap reveals the
  row in a section of its own, whose checkbox restores it to the open list. Covers the **BUY_BEFORE** case
  specifically, where checking off changes the item's mode and would otherwise make it unreachable from the shopping
  side; the revealed row states where it went ("auf der Packliste"). Default is hidden, and the reveal is **absent**
  while nothing has been bought. The bought packing row empties *Vor der Reise*, so its purchase is counted by the
  list's line at the end (*„Before the trip · nothing open · 1 bought"*), its state read off `aria-expanded` rather
  than a changing label, and putting it back returns the list to its place.
* **E2E-M6-24** `single` (ADR-033, G-7, FR-30.11) — **implemented** (`e2e/single/empty-state-hydration.spec.ts`):
  a screen still loading states no count and no empty list — two answers on one screen, and the empty one is what a
  reader acts on. While every trip pull is held, M6 shows its loading line and no empty state, no list and no section;
  once the partition lands it says *„Nothing to buy"*: the empty answer is deferred, not dropped, because a genuinely
  empty list is worth naming. `single` for E2E-M4-86's reason — only a backend-backed run has the moment.
* ~~**E2E-M6-25** `local` (FR-24.11 in the composer, FR-25.13): an unknown name typed into M6's
  composer goes through the *„Neuer Artikel"* sheet and nothing is written before *„Anlegen"*.~~ — **retired
  (FR-30.2)**: M6's field adds entries, which are no inventory items and need no sheet. The create sheet's rule is
  covered on M4.
* **E2E-M6-26** `local` (FR-30.1) — **implemented** (`shopping/shopping.spec.ts`): an entry typed on
  M6 is on the shopping list only. With one packing row in *Buy there* the trip reads *0/1*; after *„Milch"* is typed
  for *Vor Ort* (the composer's list chip), the entry sits under *„Eingetragen"* before the packing row, that list's
  head counts *„2 open"* and the switcher pill **2**, and M4 still reads *0/1* with no *Milch* row — the positive signal
  that the entry became no packing row.
* **E2E-M6-27** `local` (FR-30.1/FR-25.11j) — **implemented** (`shopping/shopping.spec.ts`): an entry
  is checked off, survives a reload **under the reveal**, is revealed with **no note** (it was never elsewhere), is put
  back by unchecking, and is removed from its sheet (*Remove*; the row has no ✕) — and a second reload shows only the
  entry that was not removed. The list's fold reads *„1 bought"*.
* **E2E-M6-28** `local` (FR-30.2) — **implemented** (`shopping/shopping.spec.ts`): a packing row is on
  the shopping list exactly while its mode says so. A *Buy there* row appears in the *Vor Ort* section; it opens no
  sheet (not a button), so it offers no removal. Set back to *Pack* in M5, it is gone from the section (empty state)
  and from the pill's count — a copied entry would have stayed.
* **E2E-M6-29** `single` (FR-30.4) — **implemented** (`shopping/single/purchase-stamp.spec.ts`): who
  bought it, and when. An entry and a *Buy before* packing row are both checked off; a **second browser context** opens
  M6 fresh from the server and finds two stamps, each *„bought by <the Single-User account> · today …"*. `single`
  because the buyer is stamped by the server (invariant 3) — the `local` cases can only see the time, and do:
  **E2E-M6-17** (the packing row keeps its purchase time although its mode is *pack* again) and **E2E-M6-27** (the
  entry's time survives a reload) each assert *„bought · today"*.
* **E2E-M6-31** `local` (FR-30.9) — **implemented** (`shopping/shopping.spec.ts`): the entry sheet
  (opened by *＋ Tag*) adds *Pasta* with a tag made in its search-or-create mask, and the tag stays selected for the next
  entry typed in the field; unselecting the chip leaves it in place (a tag nobody carries yet must not vanish) and the
  next entry has no tag; the same sheet, opened from an entry's name, is prefilled and renames it and files it under a
  new tag, which A–Z puts first and which empties the *Eingetragen* section. The check-off's bounding box is right of
  the name's — the positive signal for „at the end", which a checkbox left at the start would fail. Buying a tagged
  entry takes it out of its group, the reveal is flat and names the tag in the row, and the tags survive a reload.
  The entries stay on *Vor der Reise*, *Probe* is removed through its sheet, and the fold is that list's (FR-30.11).
* **E2E-M6-32** `local` (FR-30.9) — **implemented** (`shopping/shopping.spec.ts`): several own
  entries, already tagged or not, are retagged in one act. A long press (`contextmenu`, its deterministic seam) on an
  untagged entry enters an inline selection with that entry pre-selected; *„Alle N"* takes an already-tagged one too —
  a reach beyond M9's own selection screen (FR-24.9), which offers no retag. The bulk bar's *Tag
  vergeben* opens the same search-or-create sheet a single entry's does, titled for the batch; choosing a tag files
  both at once, the mode ends with the batch, and the toast's undo puts each back under the tag it carried before.
* **E2E-M6-33** `local` (FR-25.11j) — **implemented** (`shopping/shopping.spec.ts`): a bought row
  leaves the open list smoothly rather than vanishing, and raises its own toast with an undo — M4's shape
  (`presentToast` with a button), not the dashboard card's inline panel, which exists only because several cards share
  that page. The undo puts the row back without the reveal ever being opened.
* **E2E-M6-34** `local` (FR-30.9) — **implemented**
  (`shopping/shopping.spec.ts`): one own entry, lifted by its grip (`useDragToGroup`, FR-7.8's own gesture) and
  dropped onto another own section, is retagged in one act — a batch of one, through the same `bulkSetTag` a
  selection's *Tag vergeben* uses, so its undo diffs against the entry as the drop actually left it rather than the
  pre-drop snapshot. The packing list's combined heading refuses the drop — it never highlights and never takes it —
  since it carries no tag of its own to file under; while a drag is in the air, that heading dims rather than
  sitting inert (an untouched heading reads as broken, not as ineligible), and the packing line's own grip slot
  carries a dashed placeholder rather than standing empty. Also asserts the travelling clone's border, drawn from
  `composables/dragToGroup.css` rather than this screen's own style.
* **E2E-M6-35** `local` (FR-30.10) — **implemented** (`shopping/shopping.spec.ts`): a due day on an
  own entry. On a running trip, *Pasta* gets tomorrow in the entry sheet through the app's date control, written on
  *Save*. On the list it wears *Tomorrow* (the *soon* state) and *Brot* wears nothing; *Pasta* stands in the **Fällig**
  block above both lists, named *„Added here"*, while *Brot* stays alone in its group, and the block's box is above
  *Vor Ort*'s (FR-30.11) — read back after a reload. Then M1: a fresh load
  says *„1 purchase due"* once (Local Mode's stand-in for the push), and the trip's shopping card lists *Pasta* first
  with the same pill. The server's `shopping_due` reminder is held by Go tables (`TestPlanShoppingDue_*`,
  `TestRemindDueTasks_*`), not driven here: its time is a wall clock.
* **E2E-M6-36** `local` (FR-30.11) — **implemented** (`shopping/shopping.spec.ts`): both lists stand
  on one screen, what is due today leads above them, and an entry is removed from its sheet. On a planned trip the
  composer's *Before the trip* chip is pressed; *Brot* goes there, *Milch* goes to *At destination* by its chip with
  *Today* from the day chips. *Milch* stands alone in the **Fällig** block with *Today* and *„Added here"*; *Vor der
  Reise* holds *Brot* under *„1 open"*; *Vor Ort* has no row and is its line at the end, *„At destination · 1 due"*,
  since its one open line is up in the block, not a bare head in place. The boxes read
  block, then before, then local. *Brot*'s row carries no button; removed from its sheet, *Vor der Reise* folds to its
  line at the end, *„Before the trip · nothing open"*
  — and after a reload *Milch* is still in the block and *Brot* gone. Every clause but the removal would fail on a
  tabbed screen, and the missing-button clause on a row that carries a ✕.
* **E2E-M1-25** `local` (FR-5.10 with FR-7.10 on M1) — **implemented** (`close-packing.spec.ts`): a
  trip is packed; while its packing is open the hero's date line names the phase *Packen*. Once the packing is
  finished the hero carries **no packing figure**, **no** *Packen abgeschlossen* line, and the phase reads *Vor Ort*.
  The pair is the case: a card that had merely lost its figure would satisfy half of it.
* **E2E-M1-26** `local` (FR-7.10) — **implemented** (`close-packing.spec.ts`): the hero's task block
  takes a task in its field, lists it, shows the check to the right of the words, and drops the row when it is ticked.
  Folded, the head and the field stay and an added task moves the count without unfolding the block (the count is
  the positive signal for that absence), and the fold survives a reload.
* **E2E-M1-27** `local` (FR-7.10) — **implemented** (`close-packing.spec.ts`): the shopping block adds
  an entry, lists it, and buys it on the right-hand check; the hero contains **no control inside a link**, and
  *Packliste öffnen* is there.
* **E2E-M6-30** `local` (FR-30.8 with FR-5.10, FR-30.11) — **implemented** (`close-packing.spec.ts`): M6 stops
  offering *Vor der Reise* once that moment is past; the rule decides the composer. The trip is still **planning** —
  nobody tapped *Start trip* — and the composer offers the list chips with *Vor der Abreise* pressed; the packing is
  then finished on M4, the chips are gone, and an entry typed lands in *Vor Ort* — the positive signal beside the
  absence. The planning status is what makes the case about FR-30.8 rather than about the trip's phase alone.
* **E2E-M6-22** `all` (FR-3.3/25.11j, FR-30.11) — **implemented**: the destination list's half. A BUY_LOCAL row never
  changes mode — being bought there *is* its packed state — so the record is the only thing that keeps the two lists'
  reveals apart. With *Milch* bought, *Vor Ort* has nothing open and folds to its line at the end, *„At destination ·
  nothing open · 1 bought"*, which holds the one bought row, noting it was packed; *Vor der Reise* keeps its open row
  and has no fold — exactly one fold on the page.
* **E2E-M6-18** `all` (FR-25.11k) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* M6 shows **no search field by default**; the magnifier in the tab row reveals and focuses it,
  typing filters the list, and ✕ **closes** the field rather than merely clearing it. The filter icon sits beside the
  magnifier and carries the active-count badge. Asserts the list regains its full height when the search is closed.
* **E2E-M6-19** `all` (FR-25.13b) — **M6's half retired (FR-30.2):** M6 carries no inventory composer, so it offers
  no suggestions, and an entry has no category to adopt. M4-21 carries the rule: typing at least two characters offers
  master-item suggestions; picking one fills the name **and adopts that item's category**, including a category this
  trip has not used yet. Without a pick the category defaults to *Sonstiges*. Regression guard: choosing a suggestion
  must not clear an already-typed description, and the suggestion strip must redraw **without** re-rendering the
  form.
* **E2E-M6-20** `all` (FR-25.12) — **not implemented; owed by decision**, in its own PR with UI-Spec, e2e and an
  eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy kauft das"* is the
  multi-user case M6 cannot express, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* a row with no assignee shows an **edit glyph**, not a plus.
* ~~**E2E-M6-21** `all` (FR-25.13c/25.13d): what the trip already carries is offered on no shopping
  tab either — not in the composer's autocomplete, and in the browse-sheet only as the *„schon drin"* state.~~ —
  **retired (FR-30.2): M6 carries no inventory composer**, so there is nothing on M6 that offers an inventory item at
  all. The rule itself is the composer's and is covered where the composer is, on M4 and M8.
* **E2E-M6-14** `all` (FR-25.11g) — **REMOVED by decision**: not built; M6 stays the focused procurement checklist it
  is. A shopping list rarely runs to twenty rows, so a filter bar and a search field carry weight M4 already owns; and
  the composer is the *shared* one (FR-25.13), so an M6-only field would be a second template for one rule (invariant
  4's shape, applied to a screen). The id stays because the traceability matrix and FR-25.11/25.13a reference it. *The
  promise as written:* M6 shows the same filter bar as M4; its sheet offers *Zugewiesen an*, *Für wen* and *Kategorie*
  and — unlike M4's — **no grouping section**. Filtering by an assignee narrows the list and shows the removable chip.
  The unassigned bucket reads "niemand zugewiesen" and leads the list. M4's and M6's filters are **independent**:
  setting one must not change the other.
* **E2E-M6-15** `local` (FR-25.11h, FR-30.6) — **implemented** (`shopping/shopping.spec.ts`): with fourteen entries on a
  390 × 700 viewport and the list scrolled to its end, the last row's box does **not** intersect the ＋ (checked red with
  the list's bottom padding removed); the field is then out of view, and one tap on the ＋ brings it into view
  **focused**, ready for the next entry. M4's half is E2E-M4-20's.
* **E2E-M6-09** `all` (FR-25.12) — **not implemented; owed by decision**, in its own PR with UI-Spec, e2e and an
  eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy kauft das"* is the
  multi-user case M6 cannot express, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* tapping a shopping row opens its sheet with *Zugewiesen an* and *Beschreibung*.
  Assigning a buyer shows that person on the **right** of the row with the 🛒 badge, while derived recipients stay on the
  **left** — asserts the two are visually distinct even when the buyer is also a recipient. "niemand" clears the
  assignment.
* **E2E-M6-10** `all` (FR-25.12) — **not implemented; owed by decision**, in its own PR with UI-Spec, e2e and an
  eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy kauft das"* is the
  multi-user case M6 cannot express, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* a description entered in the sheet renders inline on the row, survives closing
  and reopening, and can be cleared. Both buyer and description are optional — a row with neither renders without either
  mark.
* **E2E-M6-11** `all` (FR-25.13, FR-30.2): M6 has **no permanent "add" row** and no native `prompt()`. It carries no
  shared composer; it has one text field of its own, always shown, which adds to the list its chip chooses
  (E2E-M6-26/27); the ＋ FAB is FR-30.6's (E2E-M6-15).

### M7 — Template List

Three of M7's ids describe surfaces the screen deliberately does not have — the my/published split, the name prompt,
the FAB's import menu — and are retired in place with their reason.

* ~~**E2E-M7-01**~~ `all` (FR-1.2/1.6) — **retired**, not unimplemented. Its first half is the FR-1.6 MVP
  simplification itself (one shared list, no my-vs-published split): there is nothing to render and therefore nothing
  to assert — the same supersession as E2E-M7-02. Its second half, *per-row name + item count*, is **E2E-M7-07**, which
  asserts the name on every row it filters by and the count as well. *The promise as written:* one shared
  instance-wide list; per-row name + item count.
* **E2E-M7-02** — **superseded by the FR-1.6 MVP simplification:** no publishing, no forking; every
  template is editable by every account. Returns with the parked FR-1.6 model.
* ~~**E2E-M7-03**~~ `all` (FR-1.2) — **retired: the name prompt is rejected by decision, not left unbuilt.** The
  scope chooser carries the name field in the same sheet, so that no row exists before the name does — a `prompt()`
  cannot say what a Gruppe is while you name one. **E2E-M7-08** and **E2E-M7-09** assert that flow, including the write
  that must *not* happen. *The promise as written:* FAB → name prompt →
  creates template → opens M8.
* **E2E-M7-04** `all` (FR-18.2) — **implemented**: long-press → Export → YAML download.
* **E2E-M7-12** `local` (FR-18.2) — **implemented as three tests**: where the browser can share a file,
  long-press → *Vorlage teilen…* hands the share sheet one file, `Makro.yaml.txt` as `text/plain`, carrying the whole
  portable document of that Gruppe (its kind, name and scope); a share that fails other than by dismissal saves
  `Makro.yaml` instead and a toast says so; where the browser cannot share a file the menu carries *Export* and no share
  entry. The share sheet itself is the operating system's, so the case stubs `navigator.share` and asserts the call.
* **E2E-M7-05** `all` (FR-18.4) — **implemented; the FAB-menu clause is struck by decision.** Import from M7 is a header
  icon beside the page title and reaches M18; the FAB opens the scope chooser. A second door to a function that already
  has one buys nothing, and E2E-M7-06 applies the same reasoning to this screen's empty state — create is the FAB,
  import is the header icon, both already on screen. The case asserts that the icon opens M18 and the way back lands on
  **M7**, which is not M18's declared parent (E2E-G9-12 asserts the same rule for the entrance from M2 and names M7
  without covering it, so this entrance could silently have returned to Settings).
* **E2E-M7-06** `all` (G-7) — **implemented, and its CTA clause is retired.** The empty state carries **no CTA buttons
  of its own**, by the decision in UI-Spec M7's *States* line: create is the FAB and import is the header icon, both
  already on screen. What the case asserts instead is the two empty states the screen really has, which share one
  element and are told apart by their words and by the segment beside them: nothing at all names both scopes and drops
  the segment; nothing *matching* says *„Keine Vorlage gefunden"* and **keeps** it, because there is something to widen
  back to (the same shape as E2E-M9-10). Two rows are seeded rather than one, so the term has something to narrow
  **away**: with a single row, a search that ignores its input is indistinguishable from one that works, and only the
  no-match half would fail.
* **E2E-M7-07** `all` (FR-27.1/27.2/27.6): scope segmentation — *Alle* renders Ferien-Vorlagen and Gruppen as two
  sections (vacation templates first), the *Gruppen*/*Ferien-Vorlagen* tabs filter to one scope, group rows carry the
  *Gruppe* chip; a composed template's row shows its group count, its **resolved** item count (not 0 for a template with
no own positions), and an "enthält: …" line naming the included groups. **The resolved-count clause is asserted** in
  `template-list.spec.ts` rather than in the M8 case that carries the rest: E2E-M8-07 builds a composition out of
  groups that are *empty*, so the raw count and the resolved count are both 0 there and the one arithmetic this row
  exists for is invisible to it. The case gives the group a position and asserts the Vorlage
  that owns none reads *1 item* — with the group's own row as the control, since the same sentence arrived at without
  any resolution is what says the number is a fact about the include.
* **E2E-M7-09** `all` (FR-27.6): the ＋ follows the scope segment — on *Gruppen* the chooser is skipped and the sheet
  opens on the name, and the created template is a Gruppe (proved by the editor shape, which has no Gruppen section); on
  *Alle* both options are still offered.
* **E2E-M7-08** `all` (FR-27.6): FAB opens the two-option scope chooser (Ferien-Vorlage / Gruppe with **one-line
  explanations** — asserted on both cards, because a hint on one of them satisfies a sentence that
  means both, and the explanations are the reason the chooser exists at all: *„Gruppe"* alone does not say what it is
  for); picking a scope marks the card and reveals the name field **in the same sheet**, the commit stays disabled until
  a name exists (no unnamed row is ever written — dismissing the half-finished sheet leaves the list untouched), and
  Enter/Anlegen creates the template of that scope and opens the matching M8 editor shape.
* **E2E-M7-10** `local` (FR-1.6, *implemented as two tests*): a taken name never becomes a write. Typing a
  name a **Gruppe** holds into the create sheet's name field for a **Ferien-Vorlage** — differing only in capitals —
  renders a line naming the group that holds it, disables *Anlegen*, and the **Öffnen** beside it navigates to that
  row's editor; a free name in the same field still creates and opens the new template (the positive signal, without
  which "nothing was created" is also true of a broken button). The rename alert refuses onto a taken name with a toast
  naming the holder, **stays open with the typed name**, and the row keeps the name it had; the same menu with a free
  name renames. Local Mode deliberately, because it is the run mode with no constraint behind the client.

### M8 — Template Editor

Every M8 id carries a test, read clause by clause against it. **E2E-M8-06's ✕ is the one clause most easily taken on
trust**: it is a design decision (the M7 variant pass rejected the swipe panel) written into the UI-Spec and the ledger,
and a clause that arrives as news is not checked the way a clause that arrives as a requirement is — so it has its own
removal assertions. Further clauses of other ids are named on their own entries below.

*Filing note:* **E2E-M8-20, E2E-M8-21 and E2E-M8-22** are defined in the M4 block above,
beside the M4 twins they were written with (FR-27.10, FR-25.13c, FR-25.13d). They are M8's
ids and M8's tests; the entries stay where they are so no id is defined twice.

* **E2E-M8-01** `all` (FR-1.8/G-6): the position sheet's quantity is a numeric stepper (– n +), 0 allowed ("bewusst
  nicht dabei", FR-5.5); no formula input exists (FR-1.3/1.5 retired).
* **E2E-M8-02** `all` (FR-1.4): per-item assignment type Per Person / Trip-Global. *(Both values are asserted, and only
  one of them is clicked — **Trip-Global is the FR-25.7 default**, so E2E-M8-12 asserts it as the state a fresh row is
  in and the glance chip's absence is part of "Standard".)*
* **E2E-M8-03** `all` (FR-2.3/15.2): dedup strategy select; condition chips (season/transport/accommodation). *(The
  three axes come off one `CONDITION_AXES` loop, so a chip on one is the render of all three; what a second axis would
  not add is **FR-15.2's one-value-per-axis rule — the active chip is also the way to clear it**, the only branch of
  `toggleCondition` that deletes. Asserted in the same case, with the per-person chip beside it so a glance that simply
  emptied cannot pass.)*
* **E2E-M8-04** `all` (FR-1.1/25.13): positions are added through the shared quick-add (see M8-13); a free-text name
  creates the master item inline.
* **E2E-M8-05** `all` (FR-2.4/27.4): editing a template a **not-past** trip still follows shows the FR-27.4 blast-radius
  note naming those trips — each is *asked* on its next open, nothing lands silently, and past trips are never touched;
  everyone else sees the change at the next trip generation (FR-2.4). The note is reached through **both** provenance
  paths: the Vorlage's own positions and a group included in it. *(A *running* trip still follows its groups and is
  asked like a planning one; nothing updates immediately.)*
* **E2E-M8-06** `all` (FR-1.2) — **implemented** (`e2e/template-editor.spec.ts`): the only case removing a position —
  `m8-position-remove-*` appears in no other test, and the page has no component test. Positions are written out of
  alphabetical order and render **name-sorted** (`template_items` has no order column — that is why the clause exists,
  and an insertion-ordered list would pass a one-row check); the row's ✕ takes that row and no other, with the surviving
  rows and the section count as the two positive signals; the removal **survives leaving and reopening**, so it is a
  write rather than a view state; and removing the rest reaches `m8-positions-empty`. Removal is the ✕ and there is no
  reorder: a swipe panel breaks out of the card.
* **E2E-M8-07** `all` (FR-27.1/27.6): scope-shaped editor — a **Gruppe** shows only *Positionen* and no group picker; a
  **Ferien-Vorlage** shows the *Gruppen* section whose picker offers **groups only** (never vacation templates, never
  already-included groups) plus "Neue Gruppe anlegen…" inline (created group is immediately included); groups and own
  positions stay visually separate sections.
* **E2E-M8-10** `all` (FR-27.6): guarded scope switch — a Vorlage with included groups refuses demotion to Gruppe (hint:
  remove groups first); a Gruppe included somewhere refuses promotion and the editor names its consumers ("Eingebunden
  in: …"); an unconstrained template switches freely.
* **E2E-M8-11** `all` (FR-27.7): the expanded position form carries the preparation-task list (add via input/Enter,
  remove per row) with the blocking rule stated inline; the collapsed row shows a "📋 N Vorbereitung" count chip;
  adding/removing a task on a group a not-yet-past trip follows is offered to that trip and, once accepted, appears in
  its FR-27.4 applied-changes log *(the log half is covered generically by E2E-M8-09, and the task-specific line by the
  `groupRefresh` unit)*.
* **E2E-M8-12** `all` (FR-25.7): adding a position via the quick-add suggestion is one tap — the row lands **collapsed**
  with the defaults (qty 1, trip-global, Packen, dedup max, no conditions, no Late-Packer), reads "Standard", and
  nothing auto-opens; the position sheet (M8-14) shows only Menge + Vorbereitung before its "Details ▾" toggle; the
  advanced parameters (per-person, procurement, dedup, conditions, Late-Packer) appear only after the toggle and
  collapse again with it. *(**„Nothing auto-opens"** is checked on the add itself, because an editor presenting itself
  after every commit would make the FR-25.7 defaults a suggestion rather than an answer — which is the whole of "one
  tap". **Procurement** is clicked too: the `m8-mode-*` segment, the glance chip and the collapsed row's chip are all
  asserted.)*
* **E2E-M8-14** `all` (FR-25.13/25.7/25.15): tapping a position opens the **M5-pattern bottom sheet** — name header,
  read-only glance-chip row, "Wer braucht das?" wording for the assignment (FR-25.10), the sheet closes without
  committing anything; no inline expanding row form exists. *(The dismissal is one `@did-dismiss` handler and both of
  its user-reachable paths are asserted — the sheet's own ✕ here, Escape in E2E-M8-23; a scrim tap is Ionic's own
  `backdropDismiss` default and nothing of this screen's.)* The ●→✓ **flip is unit-tested** on the shared
  `SaveIndicator` against a controlled state — e2e asserts the indicator's presence and settled tooltip, because racing
  the transient ● would be a forbidden timing dependency.
* **E2E-M8-13** `all` (FR-25.13/25.13a/25.13c/FR-24.11): M8's add is the packing list's quick-add, verbatim — collapsed
  card, ＋ FAB expands it **without focusing it** (FR-25.13c: the empty composer leads with chips, and the raised
  keyboard would cover them — asserted after the confirm has rendered, so the absent focus cannot pass by racing),
  inventory autocomplete from the first character (the composer searches with M9's rule), visible confirm labelled for
  the scope ("Zur Gruppe/Vorlage hinzufügen"), Enter commits, the field stays open and empty for the next position and
  never collapses on blur (FR-25.13a). An already-present name is reported *before* the commit — *„‚{Name}' ist schon
  drin"* under the field, ✓ `aria-disabled`, Enter inert — and not added twice; an unknown name goes through the create
  sheet (E2E-M8-27).
* **E2E-M8-16** `all` (FR-27.14): M8's resolution footer opens the peek sheet on the Vorlage itself; the list is the
  resolved set, flat and alphabetical; a merged row names both contributing groups and an own position reads as one; the
  sheet offers no control that writes, and the editor is still behind it afterwards. *The marks themselves — merge, per
  person, procurement, condition — are asserted in `GroupPeekSheet.spec.ts` rather than here:* reaching a per-person and
  a conditional position through M8's position sheet doubles this case's UI work, and this unit already sits at WebKit's
  test budget (see the ledger). The rendering is covered; only the driving surface differs.
* **E2E-M8-15** `all` (FR-27.13): the group picker's search — the field appears only above six groups; typing an item
  name finds the group that carries it and the row states the reason („über Kamera"); results render as rows with the
  FR-27.12 summary; a matching **already-included** group reports that instead of being absent; no match offers *„Neue
  Gruppe anlegen…"* prefilled with the typed text. *(The case drives the **item-name** hit only, deliberately: matching
  a **group's own name** and the diacritics fold are `searchGroups`' rules and are asserted exhaustively in
  `domain/__tests__/templates.spec.ts`, including the `föhn`/`fohn` pair. UI-Spec M8 states both, and only one of them
  is reachable from a screen assertion at a sensible price.)*
* **E2E-M8-17** `all` (FR-25.13a): the ＋ is present, hides while the quick-add composer is open, and returns when it
  closes; the fab *container* remains throughout, because the screen anchors its toasts to it.
* **E2E-M8-18** `all` (FR-28.8) — **implemented** (`template-editor.spec.ts`): M3 step 3 has *two* pickable columns and
  both carry the slot. The walk crosses a **reload** before the last surface, because a mark is master data and Local
  Mode rebuilds its store from IndexedDB on every navigation. A group's own mark is set from the same picker beside its
  name and then renders wherever that group is offered — the M7 row, M3 step 3, M8's *Gruppen* section and the FR-27.12
  peek sheet header. One assertion per surface, because the field exists precisely so those four stop being hardcoded.
* **E2E-M8-08** `all` (FR-27.2): resolution footer shows the resolved item count over groups + own positions and
  **names** every dedup with its contributing groups ("Kamera nur 1× — in Makro & Wildlife").
* **E2E-M8-09** `all` (FR-27.4) — **implemented** (`e2e/group-refresh.spec.ts`): a group gains a
  position after a trip was generated from it; M2 already carries the „⟳ N Änderungen vorgeschlagen“ chip on a freshly
  booted app (the startup sweep, and the positive half of M8-19's absence assertion); opening the trip shows the
  **proposal card** naming the change while the list has *not* moved (the row's absence at that point is what separates
  "asked" from "asked afterwards"), *Übernehmen* puts the row on the list and clears the card, and M2 then carries the
  „⟳ N Änderungen aus Gruppen übernommen“ chip with the source group and item in its log. Up to ten changes the log is
  written out under the row (the case asserts that state); above ten it folds behind the chip, which the TripListPage
  component test pins from both sides of the threshold. It lives outside `template-editor.spec.ts` because the surface
  under test is M4 and M2.
* **E2E-M8-19** `all` (FR-27.4) — **implemented** (`e2e/group-refresh.spec.ts`): *Nicht übernehmen*
  leaves the trip's list untouched and clears the card; leaving to M2 and coming back proves the refusal was
  **recorded** rather than held in memory — the trip re-derives on every open, so a refusal that wrote nothing would ask
  again right there — and M2 carries no proposal chip.
* **E2E-M8-23** `all` (FR-27.15, *implemented as two tests sharing one world*): group recognition in the Vorlage editor
  — own positions covering a group's complete resolved item set surface the suggestion row („N Positionen entsprechen
  …“) with
  the FR-27.12 peek chevron; *Zusammenfassen* replaces those positions with the include (resolution footer count
  unchanged — the proof nothing was gained or lost) and the snackbar's *Rückgängig* restores the positions, deviations
  included, and drops the include; *Ignorieren* removes the row and it stays away across a reload (device-local memory),
  yet returns after the group's item set changes; a one-item group and an already-included group never suggest; a
  deviated quantity is named on the row before the tap — and so is *any* generation-relevant deviation (FR-27.15's
  first settlement), so the row counts positions rather than amounts.
* **E2E-M8-24** `local` (FR-1.6/FR-27.6, *implemented as two tests*): the inline *„Neue Gruppe anlegen…"*
  meets a name that exists. A **Gruppe** of that name (capitals differing) is **included** rather than created — the
  toast says so, the group appears in the *Gruppen* section, and M7 still lists exactly one row of that name (counted on
  the row title, since the composed row names the group in its *enthält:* line). A **Ferien-Vorlage** holding the
  name is reported as the cross-scope fact it is and nothing is included or created; a free name in the same field then
  does both. The editor's own name field refuses a rename onto a taken name, the toast names the holder, **the field
  itself goes back** to the stored name and the ADR-011 header title with it; a free name saves.
* **E2E-M8-25** `local` (FR-21.24) — **implemented** (`e2e/template-editor.spec.ts`): the editor
  offers the composer once, through its own FAB. A second site of the same rule needs its own case: the rule is a prop
  each caller passes, so M4 keeping it says nothing about M8.

* **E2E-M8-26** `local` (FR-7.4) — **implemented** (`template-editor.spec.ts`, once per scope).
  *Aufgaben für die Reise* takes two tasks in both scopes, keeps them across a reload with the count on the head, and ✕
  removes one while its sibling stays. What a generated trip makes of them — trip todos, and no preparation — is
  E2E-M3-23's.
* **E2E-M8-27** `local` (FR-24.11 in the composer, FR-25.13) — **implemented**
  (`template-editor.spec.ts`): an unknown name in M8's composer opens
  the *„Neuer Artikel"* sheet instead of creating the master item silently; nothing is a position before *„Anlegen"*,
  and after it the name is a position and an inventory item.

### M9 — Item Inventory

Each id's sentence is read against the test body under it — **only that separates a wrong number from a missing test**:
a duplicate-id gate sees one use of each, and a coverage count sees the same total either way.

* **E2E-M9-01** `all` (FR-1.1/24.2/24.4) — **implemented** (`e2e/inventory.spec.ts`): tag-grouped list, **lean by
  default** — per row only primary-tag avatar + name (no tag chips, no weight/price); row thumbnail when a photo exists.
  The case an item on *two* tags is the point: it renders **once**, under its primary tag, and its second tag is not a
  heading. *(Search is E2E-M9-10's.)*
* ~~**E2E-M9-02**~~ `all` (FR-1.1/24.5) — **retired**, not unimplemented: FAB → M10 in **creation mode** is asserted by
  **E2E-M10-07**, which reaches the form by clicking `m9-fab` and then asserts exactly the minimal-mode shape this id
  promised. A second id over one behaviour is a second place for it to read covered.
* **E2E-M9-03** `all` (FR-16.3) — **struck by decision, and not a test gap.** FR-16.3 is *Deduplication on **Import***
  and is discharged where deduplication happens — on import, by M15 (E2E-M15-03/09) and M18 (E2E-M18-03); the cleanup
  clause is not part of UI-Spec M9. The inventory's own duplicate merge is FR-24.15's (E2E-M9-30). **The clause has a
  second reader**: PRD FR-27.5 rejects fuzzy name matching in M21 partly on the grounds that „a duplicate master item is
  visible in M9 **and can be merged**", and PRD FR-27.5 carries a note on that premise.
* **E2E-M9-04** `all` (G-7/NFR-4.7) — **implemented** (`e2e/inventory.spec.ts`): an empty inventory offers
  the spreadsheet import, and the way back lands on M9 rather than on M15's *other* parent, the trip list. Its own
  describe, because every other case here creates an item first and this one must not. It is the one case rendering this
  state: elsewhere `m9-empty` appears only as E2E-G9-13's *absence* assertion, where it stands in for „not the inventory
  screen". The G-7 half is asserted against two positive controls — the tag axis and
  the no-match state are both absent — so „the empty state is up" cannot be satisfied by a list that painted nothing.
* **E2E-M9-05** `all` (FR-24.4) — **implemented** (partially: the reload half is unit-tested in
  `inventoryProperties.spec.ts`, since a device-local reload assertion belongs where the storage seam is): the eye icon
  opens the „Angezeigte Eigenschaften" sheet; enabling Gewicht/Preis/Tags adds exactly those to the rows, the icon shows
  a count badge while anything is enabled, and the preference survives a reload **on this device only** (device-local,
  never synced). *(**Exactly those**: enabling the weight must leave the tags off the row, which is the whole reason
  FR-24.4 is three switches; the **badge** is asserted from both sides, since „the badge reads 1" is equally satisfied
  by a badge that always reads 1.)*
* **E2E-M9-06** `all` (FR-24.2) — **implemented**: the tag control filters on **any** of an item's tags while the
  grouping stays on the primary one — filtering by *Sommer* surfaces the swimsuit filed under *Kleidung*. Asserted on
  rendered rows, since the two rules differ only in what is painted.
* **E2E-M9-07** `all` (FR-28.1/28.4/28.7) — **implemented** (`item-mark.spec.ts`): a mark set in M10 appears
  on the inventory row **and** on the packing row of a trip that took the item from the inventory, without either row
  storing it (FR-28.7 — asserted by changing the mark once and observing both surfaces); an ad-hoc quick-add row shows
  the empty slot. **Both composer paths are exercised on purpose**, because they differ where it matters: the suggestion
  carries `source_item_id` and therefore a mark, the free-text confirm does not. *The photo rung is the component
  unit's, for the reason given at E2E-M5-15.*
* ~~**E2E-M9-08**~~ `all` (UX-4) — **retired**, not unimplemented: it measured the gap between the tag axis and the
  first group heading, and FR-24.8 removed the axis. The promise it stood for — a heading
  that does not read as sliding under the control above it — is **E2E-M9-13**'s, which asserts the heading stacked
  below the sticky tool bar.
* **E2E-M9-11** `all` (FR-24.7) — **implemented** (`e2e/inventory.spec.ts`): the search reaches an umlaut
  name from **both** keyboard spellings („gurtel" and „guertel" → „Gürtel") and reaches an item through a **tag**,
  with the row stating what carried the match and the heading reading *Treffer im Tag*. The ranking arithmetic itself
  is `domain/__tests__/itemSearch.spec.ts`, whose three fold cases are red against a plain
  `name.toLowerCase().includes` rule.
* **E2E-M9-12** `all` (FR-24.7) — **implemented** (`e2e/inventory.spec.ts`): a query under an unrelated tag
  chip („socken" under *Hygiene*) is answered by an empty state that **names the tag**, **counts the hits outside it**
  and offers the way out — and taking it **keeps the query**. A bare „Kein Artikel gefunden" while three socks sit in
  the list is the failure it guards.
* **E2E-M9-13** `all` (FR-24.6) — **implemented** (`e2e/inventory.spec.ts`): the tool bar is in the same
  place after the list has been scrolled to its end, its field still visible, with the first group heading stacked
  **below** it rather than sliding under it. Geometry on settled boxes, like E2E-M9-08, and the scroll offset is read
  back as the positive signal that the list actually moved. **Proven red** against a build with `position: static` on
  the bar.
* **E2E-M9-14** `all` (FR-24.8) — **implemented** (`e2e/inventory.spec.ts`): the axis is **gone from the
  DOM**, the three chips carry their counts, and two tags combine under *alle* — the question a single-select segment
  could not ask. The sheet's own footer count is asserted against the list's, so the two cannot drift into separate
  arithmetic. Its dismissal is read from `data-presented`, because a sheet declared with `:is-open` stays in the DOM.
* **E2E-M9-15** `all` (FR-24.8) — **implemented** (`e2e/inventory.spec.ts`): the group heading opens the
  jump list and the chosen group lands directly under the tool bar, **with every row still in the list** — filtering
  takes rows away, jumping does not. Twelve rows on a 360 px viewport, because the case is only meaningful on a list
  taller than the screen. **The ordering rule it cannot falsify is a unit test**: while an overlay is presented the
  scroll host is locked, and a jump issued in the same breath is clamped (measured at 120 px of a 9 975 px jump on the
  family instance); `ItemInventoryPage.spec.ts` asserts that nothing scrolls until the sheet reports it has dismissed,
  and that a dismissal without a choice scrolls nothing at all.
* **E2E-M9-16** `all` (FR-24.9) — **implemented** (`e2e/inventory.spec.ts`): three rows of a tag group are
  refiled in **one act** — narrow, „Alle 3", give the tag with „als primär", and the group they came from heads
  nothing any more. Two clauses carry the semantics that are easy to get wrong: the old tag is **kept** (the rows
  still answer its filter — refiling is not retagging), and the snackbar's **Rückgängig** puts all three back.
  **Proven red** against a build whose switch appended instead of refiling.
* **E2E-M9-20** `all` (FR-24.3) — **implemented** (`e2e/restore-retired.spec.ts`): M9 names the items it is
  **not** showing and the note is the way to M23. It lives in the M23 unit rather than M9's, because retiring an item
  is the setup and that unit already owns the dance. A second, untouched item stays active throughout — otherwise
  „the note appeared" would be satisfied by an inventory that had emptied itself.
* **E2E-M9-21** `all` (FR-24.11) — **implemented** (`e2e/inventory.spec.ts`): „Zelt" finds *Zeltheringe*
  and the tent is **still offered** above that hit — the missing-name rule rather than the empty-result one. The sheet
  opens on the query as the name with the pegs' tag first among the offers; *„Anlegen"* leaves the list **on the same
  query**, with two hits, the new one marked, and the offer gone — the name now existing is the same event reaching
  both places. The toast is asserted **above the FAB** on its settled box, not covering the button, and the item is read
  back under its tag.
* **E2E-M9-22** `all` (FR-24.11) — **implemented** (`e2e/inventory.spec.ts`): with *Technik* chosen and
  nothing matching, the no-match sentence stands and the offer sits above it; the sheet opens with **Technik already
  assigned**, and *„Anlegen und öffnen"* lands in M10 on the saved item. Back on M9 the query and the chip are still
  set and the new row answers both — the survival of the search is what the feature is for.
* **E2E-M9-23** `all` (FR-24.11) — **implemented** (`e2e/restore-retired.spec.ts`): searching a
  **retired** item's name offers it back; a tap restores it without opening a sheet, the row returns marked, and M23
  is left with nothing to restore. A second item stays active, because an inventory whose only row is retired is an
  empty one and has no search field.
* **E2E-M9-24** `all` (FR-24.9) — **implemented** (`e2e/inventory-cleanup.spec.ts`): *Tag geben*
  creates the tag its search did not find. A different capitalisation of an existing tag is **not** offered (the
  uniqueness fold), a new name is, and taking it files both selected rows under the new heading. The undo is asserted
  twice: the rows go back under their old heading, **and** the tag is gone from the manager — an undo that left the tag
  behind would pass the first clause alone.
* **E2E-M9-25** `all` (FR-24.13) — **implemented** (`e2e/inventory-cleanup.spec.ts`): a tag's mark is set
  from the tag manager's mark control through the item mark's picker, and read where it files something — on the group
  heading, and **lent, muted, to a row without its own** (the `borrowed` slot). The mark is read off the tile that was
  tapped rather than hard-coded, so the case does not pin the mark index's ordering.
* **E2E-M9-26** `all` (FR-24.9 widened, FR-20.1) — **implemented** (`e2e/inventory.spec.ts`): a
  dependency declared for two rows at once from the ⋯ sheet, in the **suggested** mode the sheet was switched to, and
  read back on M10's own list for each of them — M9 paints no edges, so a link that wrote nothing would look exactly
  like one that worked. The companion direction is then asserted on the *other* list, since the stored row is the same
  edge and the end it is read from is all that tells them apart. The undo is taken on the **second** of two companion
  batches, so the absence it leaves is measured against a list that still carries the first row.
* **E2E-M9-27** `server` (FR-1.9 over FR-24.9) — **implemented** (`e2e/server/multi-user.spec.ts`): two
  items created as *„Nobody"*, then assigned to Bob in one act from the ⋯ sheet, and both rows name him in M10
  afterwards. It is a `server` case because the action only exists there (G-8 needs two accounts), and it picks its
  rows **by name** rather than with „Alle N", because master data is instance-wide and the inventory carries every
  other case's items too.
* **E2E-M9-17** `all` (FR-24.10) — **implemented** (`e2e/inventory.spec.ts`): a tag is renamed from the
  manager, and the **inventory's group heading** carries the new name — the only place the write is observable, since
  the sheet would show a renamed row whether or not anything was written. The second clause is the refusal: a name a
  second tag already holds leaves the alert **open**, and the tag keeps its old name on the heading behind it.
* **E2E-M9-18** `all` (FR-24.10, ADR-063) — **implemented** (`e2e/inventory.spec.ts`): deleting a tag items
  carry is **refused**, and the alert offers the merge. The absence needs a positive signal, so the case reads the
  refusal's own sentence *and* the heading that is still there afterwards — a delete that had gone through would take
  the heading with it.
* **E2E-M9-19** `all` (FR-24.10, ADR-063) — **implemented** (`e2e/inventory.spec.ts`): the merge itself,
  through the refusal. The item that carried the source ends up under the **target's** heading and the source's
  heading is gone — which is the whole promise, because a merge that re-pointed the assignment without carrying the
  position over would leave the row under a third heading entirely.
* **E2E-M9-28** `all` (FR-24.14) — **implemented** (`e2e/inventory.spec.ts`): three tags for one idea,
  picked in the manager's selection and merged in one act. One item carries **two** of the sources, which is the case
  a per-pair merge cannot do — it would re-point both of its assignments onto the survivor, and `UNIQUE (item_id,
  tag_id)` refuses the second after the outbox has taken it. What says the plan was made over the whole set is the
  row ending with exactly one tag, under the heading it already had; the manager is reopened afterwards so the
  survivor's count and the two absent rows are read from the screen that owns them.
* **E2E-M9-30** `all` (FR-24.15, ADR-069) — **implemented** (`e2e/inventory.spec.ts`): two duplicates
  merged into one. The loser is built to carry what the survivor lacks — a tag it does not have, a weight it has
  none of, a companion edge pointing at it — because the inventory list after a merge that wrote nothing but the
  delete looks exactly like one that worked; each is read back where it is *rendered* (the heading on M9, the tag
  summary, the companion and the weight in M10). A trip packs the loser first, which is what makes FR-24.3 answer
  its delete by **retiring** it, and the case ends on M23 asserting the row names the survivor — the sentence that
  keeps its restore from being a silent offer to re-create the duplicate. That trip also carries a **remark written
  on the losing row**, read back afterwards in the survivor's FR-27.9 section: the trip row still names the loser,
  so the section is empty unless M10 reads through the alias — the one claim of ADR-069 that the domain's own units
  cannot make, because they never wire the page.
* **E2E-M9-31** `local` (FR-24.9, ADR-075) — **implemented** (`e2e/inventory.spec.ts`): M9 selects
  the way M6 and M25 do. A **real right-click** on a row — the hold's desktop twin, whose own pointerdown must not
  re-arm the hold and eat the next tap — starts the mode with that row picked and leaves M9 on screen; the very next tap
  on
  another row picks it (the count moves to two), a tap on the first unpicks it; leaving through the bar's ✕ gives the
  tap back to opening the item, read on M10's title. The grouped heading still carries its count and is still the jump
  control. The long press itself is `useRowSelection`'s unit (fake timers), not this case's.
* **E2E-M9-32** `local` (FR-24.14, ADR-075) — **implemented** (`e2e/inventory.spec.ts`): the tag
  manager selects like the lists. A real right-click on a tag's **name** — the rename control outside the mode —
  opens the shared bar with that row picked and the merge in the bulk bar dimmed; a tap on another row picks it and
  lights the merge; the bar's ✕ gives the rows their acts back. That a touch hold's release click does not also
  rename is `TagManagerSheet.spec.ts`'s: a right-click sends no click, so the absence would be vacuous here.
* **E2E-M9-33** `local` (FR-24.10, ADR-075) — **implemented** (`e2e/inventory.spec.ts`): a tag is
  moved on the axis by its grip. The pointer lifts *Navigation* by the grip, the gap before *Foto* is marked while it
  hangs there, and after the drop `data-drag` returns to `idle`; the order is read on M9's own headings once the sheet
  is closed — *Navigation* first — not in the sheet that was dragged.
* **E2E-M9-29** `server` (FR-1.9 over FR-24.4/24.7) — **implemented** (`e2e/server/multi-user.spec.ts`):
  the inventory names who an item is usually for and finds it by that name. Three claims in order, each needing the
  one before it: the property is **offered** (a `server` case for E2E-M9-27's G-8 reason), the row carries the name
  once it is switched on, and the account's name typed into the search reaches the same row. A **second item stays
  unassigned throughout**, or „the name is on the row" would be satisfied by a list that printed it on every row.
* **E2E-M10-21** `all` (FR-24.9) — **implemented** (`e2e/inventory.spec.ts`): M10's assigned chip has two
  targets. Tapping the **name** makes that tag primary, and the assertion crosses screens — the inventory files the
  row under the new heading, which is the only place the change is observable. The **✕** still removes the tag
  (E2E-M10-08's target, unchanged), and the primary chip's name is disabled, an act already performed being no offer.
* **E2E-M10-22** `all` (FR-24.9) — **implemented** (`e2e/inventory.spec.ts`): the same chip while
  *creating*, where there is no assignment row to move — the draft's order is what gets written, so only the saved
  item says whether the act worked, and the case reads it off M9's heading. **Proven red** against a creating branch
  that ignores the tap.
* **E2E-M9-09** `single` (FR-21.9) — **implemented** (`e2e/single/instance-currency.spec.ts`): an item price
  is rendered with the currency the instance named. `single` rather than `all`, and that is the feature rather than a
  limitation of the case: the code comes from the server over `GET /api/v1/instance/config`, and Local Mode has none, so
  its amounts stay unit-less by design. The project's backend runs with `JITPACK_CURRENCY=CHF`, so any screen that
  renders an amount without carrying it is a red case rather than a quiet omission. **Two clauses, both asserted:** the
  row contains `CHF`, and it contains `129.50` — naming a currency labels an amount and never converts it, and the
  second assertion is what says so. Mutation-proved: with the `style: currency` option removed the row reads `129.50`
  alone. **M5's context line follows the same rule**, asserted in `ItemDetailSheet.spec.ts` rather than as a second
  `single` case, because what can go wrong there is a bypassed formatter, not the delivery of the code.
* **E2E-M9-10** `all` (FR-1.1) — **implemented** (`e2e/inventory.spec.ts`): the search **filters**. The field is
  permanent (FR-24.6), asserted visible without a magnifier. E2E-G12-02 asserts that the magnifier opens *this* screen's
  field and no other screen's; that typing into it narrows the list is a different promise. A term the inventory matches
  leaves one row and takes the *heading* of the group it emptied with it (the filter runs before the grouping, so a
  heading over nothing would be the visible defect); a term nothing matches raises **`m9-no-match`** and explicitly
  **not** the G-7 empty state, which would offer to import an inventory that already exists.

### M10 — Item Editor

Each id is read against the test carrying its number in `inventory.spec.ts`; the ledger's promise table maps each test
row to the same ids. Two ids over one section (M10-03 and M10-09) are merged into M10-03, and M10-02's delete refusal is
reversed by FR-24.3.

* ~~**E2E-M10-01**~~ `all` (FR-1.1) — **retired**, clause by clause rather than as a summary: the name and the
  inline-created tag are **E2E-M10-08**, the weight behind *Mehr ▾* is **E2E-M10-07**, and the price is asserted where
  it is *read* — **E2E-M9-09**, which is the case that can tell a formatted amount from a bare number. What is left is
  the last clause, *no unit control*, and it has nothing to assert against: FR-1.8 retired units and no unit field
  exists.
* **E2E-M10-08** `all` (FR-24.1) — **implemented** (`e2e/inventory.spec.ts`, two tests): the tag input is a search field
  — typing filters the chips, tapping a match assigns it (the second item finds the tag instead of duplicating it); an
  unmatched name shows the "＋ „X“ neu anlegen" chip, and ＋ creates and assigns the tag in one step, clearing the field
  for the next; unassigning refiles the item in M9. **„Assigned tags stay pinned"** (UI-Spec M10: „so the filter can
  never hide what the item already carries") is asserted with a *non-empty* query — an empty query is the one state that
  cannot tell the rule from its absence. The ＋ chip is the positive signal it rides on, so „the chip is still there"
  cannot be satisfied by a field that filters nothing at all.
* **E2E-M10-10** `all` (FR-24.1/16.3) — **implemented** (`e2e/inventory.spec.ts`): the item's name is its identity
  (`UNIQUE (name)`, ADR-014), so creating a second item with an existing name is **reported in the form** — not left to
  the sync push to reject.
* **E2E-M10-17** `all` (FR-27.8): the item names the groups and Vorlagen holding it, each with its
  position count and its scope chip, and one row leads into that template's editor with the way back landing on the item
  again. The list is **mixed on purpose** — a group *and* a Ferien-Vorlage — because both scopes wear the same chip here
  and a group chip asserted alone would pass on a screen that marks nothing else.
* **E2E-M10-18** `all` (FR-27.9): a remark written on a trip row through M5's own composer is
  readable at the item, with the trip named. The chain is the app's: master item → quick-add → M5 comment → M10.
  Red-proved by dropping the join in `domain/itemHistory.ts`.
* **E2E-M10-19** `all` (FR-24.5/FR-27.8/FR-27.9) — **implemented** (`inventory.spec.ts`): an item nothing has used
  carries **neither** section — absent, not empty. The positive signal is the delete card, which *is* on the screen: a
  page that failed to load satisfies an absence assertion just as well.
* **E2E-M10-07** `all` (FR-24.5) — **implemented** (`e2e/inventory.spec.ts`, two tests): creating an item shows the
  minimal form (name focused, tags, *„Mehr — Gewicht & Preis ▾"*); committing without a name is caught with a hint
  rather than a disabled button; after *„Artikel anlegen"* the full editor appears. The absence of the delete card is
  asserted with the photo's and the dependency section's — the sections whose absence proves the mode. It also asserts
  that the optional fields' placeholders are not numbers (FR-24.5): „0" and „0.00" read as a value rather than an
  absence. The clause tests the *shape* — not a number, and not empty — because the wording is the catalogue's and a
  case pinned to it would go green the moment somebody translates it.
* **E2E-M10-11** `all` (FR-28.2/28.3/28.11) — **implemented** (`item-mark.spec.ts`); removal is its own case,
  **E2E-M10-12**, because it is a separate promise. The picker and its three cases: typing **„Zahnbürste“** puts 🪥 first
  in the suggestion band and one tap sets it; **„Stirnlampe“** suggests 🔦 and the item is saved **unmarked** unless the
  offer is tapped (asserted positively — the stored value stays null, so the case cannot pass by the picker simply being
  slow); **„Zwischenringe“** renders the named empty result and **no** suggestion chips. Then: the search field finds by
  keyword and not by name (typing „regen“ surfaces 🧥 and 🌂 — the index carries the open umbrella, not ☂️), and a facet
  narrows the grid.

* **E2E-M10-12** `all` (FR-28.2): **„Marke entfernen"** clears a set mark back to the empty slot,
  and the action is **absent** on an unmarked item — removal is worded as removal and never offered as "choose the empty
  one".
* **E2E-M10-13** `all` (NFR-4.12): the sections that exist only once the item is saved — photo, *Hängt ab von*, the
  dependency picker, the *Begleitartikel* heading and its add-trigger — are rendered from the catalogue, asserted with
  the app language set to German. English cannot carry this case: a finished English literal and the catalogue lookup
  produce the same pixels.
* **E2E-M10-14** `all` (FR-24.3) (`e2e/lifecycle-delete.spec.ts`): an item a group position holds is deleted from M10's
  delete card. Before the confirm the card states the count and *„Er wird ausgeblendet, nicht entfernt"*; after it the
  row is gone from M9, the quick-add of a *second* group does not offer it, **and the first group still resolves it in
  M8**. The second group is deliberate: the composer already excludes what the open template holds, so asserting the
  autocomplete inside the same group would be green whatever the filter does. The second half is the positive signal the
  first is asserted against — "absent from the inventory" is equally satisfied by the row having been destroyed, which
  is the failure this whole FR exists to prevent.
* **E2E-M10-15** `all` (FR-24.3): an item nothing has ever used is removed outright. A *second*
  item is created and asserted untouched, so "one row fewer" cannot be produced by the list simply failing to paint;
  then the same name is created again, which a retired row holding it would refuse — the rendered proof that the delete
  was physical and that uniqueness ranges over the active rows only.
* **E2E-M10-16** `all` (FR-24.1, UX-14) (`inventory.spec.ts`): with ten unassigned tags and an empty query the form
  offers **eight** chips and a *„N weitere per Suche"* tail naming the two held back; the search reaches a tag past the
  cap; clearing the query (by keys — a programmatic clear is the event-loss path the suite's `fillIonic` exists to
  avoid) returns to the shelf; tapping the tail focuses the search. Runs at phone width and in German, where it also
  measures that the placeholder fits its box — by briefly rendering the text as the value and reading `scrollWidth`,
  because a canvas re-measure can use the wrong font and then cannot fail.
* **E2E-M7-11** `all` (FR-24.3): M7's row menu → *Löschen* on a Vorlage no trip ever used; the
  confirm says it will be removed for good before the tap that does it, and the row goes. The retire branch for a
  Vorlage is covered by the store and the orchestrator units rather than here, because reaching it through the UI means
  generating a whole trip for one sentence.

**M24 — Aufräumen (FR-24.12).** Four cases in `e2e/inventory-cleanup.spec.ts`, all `local`. Every repair is asserted on
**M9's headings after going back** — a finding that leaves M24's list is equally what a screen that wrote nothing and
re-rendered would show. *Lange nicht gebraucht* has no rendered case: its finding needs a trip that ended months ago,
which the wizard cannot date without a clock seam the suite does not have; the rule, its window and the unseen-trips
line are unit-tested (`inventoryHygiene.spec.ts`, `InventoryCleanupPage.spec.ts`).

* **E2E-M24-01** `all` (FR-24.12) — **implemented**: M9's foot sentence counts the one untagged item, is the
  way into M24, and the suggestion carries its reason (*„like ‚Zahnbürste'"*); taking it leaves M24 all tidy and, back
  on M9, **both rows under one heading and the sentence gone** — the same event reaching both screens.
* **E2E-M24-02** `all` (FR-24.12, FR-24.9) — **implemented**: an item with no reason for a suggestion says
  so; *„Tag wählen …"* opens the give sheet **without** the refiling switch, creates the typed tag, and M9 files the
  item under it.
* **E2E-M24-03** `all` (FR-24.12) — **implemented**: *Behalten* on a single-item tag silences the rule
  **across a reload** (device-local), while the rule's card still stands collapsed to *„Nichts zu tun"* — the positive
  signal that the rule runs and was told, rather than having been switched off.
* **E2E-M24-04** `all` (FR-24.12) — **implemented**: M24 is reached from M9's ⋮ word too; switching *Ohne
  Tag* off removes its card, and M9's count agrees — the foot sentence is gone while the untagged row itself is still
  listed.

* **E2E-G9-22** `all` (FR-24.12, ADR-011) — **implemented**, in `e2e/global-nav.spec.ts` for E2E-G9-14's
  reason: M24 is reached from M9's ⋮ word, named only by the app bar, and its back returns to the inventory with the bar
  naming *Inventory* again — the promise a route added without a `titleKey` or a `parent` breaks silently.

**M23 — Hidden items and templates (FR-24.3, the restore).** Four cases in `e2e/restore-retired.spec.ts`, all `local`,
all reached through M17's row rather than a typed URL.

M23-01/02/03 each retire an **item**, and FR-24.3 governs items *and* Vorlagen, which M23 renders from two different row
builders. E2E-M23-01 uses the Vorlagen segment's *emptiness* as a positive control, which only says something if it can
be non-empty; **E2E-M23-04** is the case that fills it and the Vorlage **retire** branch's rendered case (E2E-M7-11
covers the remove branch and says why it stops there).

* **E2E-M23-01** `all` (FR-24.3): an item a group holds is retired, M23 lists it,
  *Wiederherstellen* brings it back and M9 shows it again. Two positive controls the "it came back" assertion is made
  against: a *second*, untouched item is asserted still present, so "the inventory grew by one" cannot be produced by
  the list repainting from nothing; and the *Vorlagen* segment is asserted empty, so the items list being non-empty is a
  fact about the store rather than about the screen rendering anything at all.
* **E2E-M23-02** `all` (FR-24.3, ADR-034), the case the file exists for: after the retire, a *new* item takes the freed
  name, and the restore then collides. The alert names the holder **while the row is still on M23** — that assertion is
  what separates the refusal arriving before the write from a restore that is enqueued, refused by the push and reversed
  by ADR-031's repair, which on screen is a row appearing and vanishing. A replacement name is typed, the input's value
  is **asserted before the button is clicked** (a row restored as "K" still passes every count), and M9 then shows
  *both* rows — the restored one made room for itself rather than taking the name back. Finally the group still resolves
  the row under its new name, which is the retire's own promise surviving the rename.
* **E2E-G9-14** `all` (FR-24.3, ADR-011), in `e2e/global-nav.spec.ts` rather than in M23's own
  file, because getting to a screen and leaving it are global behaviours: Settings → M23, and the assertion that carries
  it is the **app-bar title**, since M23 renders no heading of its own and the header is the only place the user is told
  what they are looking at. Back returns to Settings and the bar is asserted to say *Settings* again rather than keeping
  the title of the screen that was left. Proved red by removing the route's `titleKey` —
  *"expect(locator).toHaveText(expected) failed / Expected: 'Hidden master data' / element(s) not found"*.
* **E2E-G9-15** `all` (G-9), in `e2e/global-nav.spec.ts`: the settings gear is on every screen except M17 itself, where
  it would only reopen the screen it is on (UX-16). Asserted as presence on a tab root plus absence on the rendered
  settings screen — the settings page's own content is the positive signal the absence rides on.
* **E2E-G9-16** `all` (G-9), in `e2e/global-nav.spec.ts`: at 1280 px a settings section heading is far narrower than the
  area it sits in **and centred in it** (equal gutters to within a pixel), and at 400 px it fills the width again. A
  section heading rather than a control, deliberately: a control sits at one edge whatever the layout does, so it cannot
  tell the two states apart — the language `ion-select` passes the cap assertion against an uncapped build. Both halves
  matter: the second is what keeps the column from becoming a margin on the phone the app is built for (UX-17).
* **E2E-G9-20** `all` (G-9, FR-21.26), in `e2e/global-nav.spec.ts`: the same settings screen's `.app-content` is
  measured at a desktop width (1280 px, where it is capped flat), then at an iPad mini's 744 px — wider than the desktop
  measurement by more than 40 px, so the tablet gap is not inert, and still short of the viewport by the same margin, so
  a gutter survives on both sides. A third measurement back at 1280 px matches the first exactly, which a
  `clamp()`-based layout cannot pass: `vw` only rises with the viewport, so a factor steep enough to widen the column on
  an iPad mini also leaves it pinned at its ceiling for every wider desktop window.
* **E2E-M23-05** `single` (ADR-033, G-7) — **implemented** (`e2e/single/opening-segment.spec.ts`): E2E-M6-24's twin one
  partition up, on the held master pull E2E-M2-18 already uses. „Artikel (0)" and „Vorlagen (0)" must not stand above
  „Archiv wird geladen …": this is the screen a user reaches *because* they are looking for something they retired, so
  the count is the claim that matters. Exact text while held; after the pull only that a count is **stated** — the run
  shares one database and other cases retire rows, so the figure itself is not this case's business.
* **E2E-M23-04** `all` (FR-24.3, ADR-032): the other thing FR-24.3 retires. A group a trip was generated from is deleted
  from M7, and the confirm carries the sentence E2E-M7-11's twin does not — *hidden, not removed* — before the tap; the
  row leaves M7, appears on **M23's Vorlagen segment** (with the items segment asserted empty, the mirror of
  E2E-M23-01's control), offers the restore and **no** *Endgültig löschen* while the trip still holds it, and comes back
  to M7 still holding the position it was created with. One trip generation pays for two screens: the Vorlage retire
  branch and the second half of M23. Mutation-proved by pointing M23's template row at `restoreMasterItem` — a plausible
  copy-paste, since the two callbacks have the same shape — which reddens this case and leaves the three item cases
  green.
* **E2E-M23-06** `local` (FR-24.3, ADR-034, ADR-075) — **implemented**
  (`e2e/restore-retired.spec.ts`): M23 selects like the other lists, and a batch restore keeps the single restore's
  collision refusal. Three hidden items; an active item then takes the second one's name. A **real right-click** on
  the first starts the mode — the rows' own buttons step aside — and a tap picks the second. *Wiederherstellen* on the
  bar restores the first with **no alert**, and leaves the colliding row listed **and still selected** (count *one*)
  beside the unpicked third, which is not; the app bar's glyph leaves the mode and the rows' buttons return; the
  inventory then lists the restored item. The batch delete, its one
  confirmation and its refusal of still-used rows are `RetiredMasterPage.spec.ts`'s.
* **E2E-M23-03** `all` (FR-24.3): a retired row does not become undeletable. While the group still
  holds it, M23 offers the restore and **no** *Endgültig löschen* — asserted as an absence beside the restore button's
  presence, so it is a statement about the row and not about an empty page. The group is then deleted, which makes the
  row unreferenced, the button appears, and the confirm carries M10's "removed for good" sentence. The proof it was
  physical is that the name is free again afterwards, which a row still holding it — retired or not — would refuse.
* ~~**E2E-M10-02**~~ `all` (FR-2.4) — **retired**, two clauses with two different fates. *„Delete blocked while
  referenced"* is **reversed** by FR-24.3 (ADR-032): the refusal is a choice, and UI-Spec M10 says so in as many words —
  the delete retires instead of refusing, asserted in **E2E-M10-14** and **E2E-M10-15**. The *usage count* lives in the
  delete card, and both of those cases assert it, from both ends: *1* on a referenced item, *0* on an unreferenced one.
  The split the sentence promised is not built — the card says „An N Stellen verwendet", one number over templates and
  trips together, and no screen names the two separately.
* ~~**E2E-M10-09**~~ `all` (FR-20.1/20.4) — **retired**: it and E2E-M10-03 are two ids over one section, differing only
  in which half they lead with; the section is **E2E-M10-03**'s.
* **E2E-M4-66** `all` (FR-20.4/20.2): quick-adding an item pulls its required companions **and names them**, as
  FR-20.2's *skip* names exactly what it takes along — silent companions would read as an omission rather than as a
  decision. The action returns what it added, and the **screen** says it, the shape `skipItem` has (FR-5.5). An item
  with no companions says nothing: the positive signal against a snackbar that always fires. Carries the third clause of
  the retired E2E-M4-32 under a live number rather than reviving it. Red-proved.
* **E2E-M4-67** `all` (FR-25.4a): a dense M4 row draws the mode glyph only when the mode is worth saying. 🛒 and 📍 are
  drawn; 🧳 is not, because it is what every other row means. The buy row and the pack row are asserted through the same
  `title` on the same icon, so the silence is falsifiable rather than merely unrendered. The mapping lives in
  `lib/modeLabels.ts` and the rule is an option a call site can omit, which is why M4 needs its own case. Red-proved.
* ~~**E2E-M4-32 (v1.0 catalogue, shadowed)** `all` (FR-20.4/20.2): quick-adding an item pulls its **required**
  companions onto the trip and reports it, while *suggested* ones are not added unasked; skipping the item co-skips
  those companions with the reason naming the parent.~~ — **retired, clause by clause.** The required pull and the
  co-skip with its reason are **E2E-M4-40**; that *suggested* companions do not join unasked is **E2E-M5-23**; *and
  reports it* is **E2E-M4-66**.
* **E2E-M10-03** `all` (FR-20.1/20.4) — **implemented** (`inventory.spec.ts`): the rules of the *„Hängt ab von"*
  section. Two other cases drive it as *setup* (E2E-M5-23 and the skip-item cascade both declare a dependency through
  this screen to get a companion onto a trip), and E2E-M10-13 reads its heading for a German word — a heading is not a
  behaviour, and a fixture is not an assertion. Three clauses, all on M10 itself: a new relation is *nötig* until
  someone says otherwise, which is what makes FR-20.4's cascade the default; the **reverse list shows the same mode**
  the declaring side chose; and a dependency that would **close a circle is refused before the write**, naming the hops
  (`Kamera → Ersatzakku → Kamera`) rather than saying *invalid*. The refusal is asserted against a positive signal on
  the same screen: the companion row is still there afterwards, so „no dependency row" cannot be produced by a page that
  rendered nothing. The cycle arithmetic itself stays in `domain/__tests__/dependencies`; what this case adds is that
  the fault reaches a user as a sentence. What the reverse list's rows do is E2E-M10-20's (FR-20.1).
* **E2E-M10-20** `all` (FR-20.1/20.4) — **implemented** (`inventory.spec.ts`): the *Begleitartikel* list writes its
  own end of the relation. A companion is declared from the main item, re-moded and removed there, and **every one of
  those three is asserted on the other item's editor** — the edge is read where it was not declared, which is what
  separates a stored relation from a drawn one. The cycle refusal is asserted from this direction as well, against the
  dependent side still listing exactly one relation: the same edge, so the same answer, whichever end posed it.
* **E2E-M10-23** `all` (FR-20.1/24.11) — **implemented** (`inventory.spec.ts`): a companion the inventory lacks
  is created from the *Begleitartikel* picker. The sheet opens on the query with this item's tag offered first; after
  *„Anlegen"* the editor is still this item's, the picker is closed and the pair is listed — and it is read again from
  the **new item's** editor, with its tag, which is what says both writes were stored rather than drawn. A second
  companion taken with *„Anlegen und öffnen"* lands in its own editor, already naming this item as its main item.
* **E2E-M10-24** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): a retired name in the picker
  is offered back; one tap restores it and declares it, no sheet opens, and M23 is left with nothing to restore.
* **E2E-M10-25** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): the failure path. The item
  in hand already depends on the retired one, so declaring it a companion would close a circle: the refusal names
  the path, and the item **stays retired** — asserted as M23 still listing it, the positive signal a restore that
  ran anyway would remove. Mutation-proved: without the check before the restore, this case goes red.
* **E2E-M10-26** `all` (FR-20.1/24.11) — **implemented** (`inventory.spec.ts`): the *„Hängt ab von"* picker's
  offer. The created item becomes this item's **main item** — asserted as the dependency row here and as this item
  in the new one's *Begleitartikel* list, which is the direction, read from both ends.
* **E2E-M10-27** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): a retired name in the
  dependency picker is restored and depended on without a sheet; M23 is left empty.
* **E2E-M10-28** `all` (FR-20.1/24.11) — **implemented** (`restore-retired.spec.ts`): the failure path from this
  end — the retired item already depends on the one in hand, the refusal names the path, and the item stays retired
  (M23 still lists it). Mutation-proved like E2E-M10-25.
* **E2E-M10-29** `server` (FR-1.9) — **implemented** (`server/multi-user.spec.ts`): Bob is chosen as an item's
  default assignee in M10, Alice records her traveler as Bob's account in M3 step 2, and the review row names Bob and
  is not marked „per person". The choice surviving the create is asserted on the saved item.
* **E2E-M10-30** `local` (FR-1.9, G-8) — **implemented** (`inventory.spec.ts`): Local Mode has no accounts, so the
  editor renders no assignee control; the name field and the „Mehr" row beside it are the positive signal.
* **E2E-M10-31** `local` (FR-20.1) — **implemented** (`inventory.spec.ts`): a dependency's name is a link. From the
  dependent's *„Depends on"* the main item's M10 renders (its name in the head, the dependent in its companions), and
  from there the companion's name leads back.
* **E2E-M10-04** `all` (FR-22.1/22.5) — **implemented** (`inventory.spec.ts`): the reference photo is added, replaced
  and removed, and the one trigger words itself for the state it is in (*Add photo* → *Replace photo*). Two things make
  it more than a screenshot: the two sources differ in **shape**, so the assertion is `naturalWidth` and not the object
  URL, which a rewrite changes whether or not the image did; and the item is left and reopened between the replace and
  the removal, which is what says the bytes were *stored* — the preview is resolved from `image_hash` through the
  device, so a round trip proves the write rather than the picker. **The ≤150 KB cap is deliberately not asserted
  here**: the backoff is measured where it is deterministic, in `lib/__tests__/imageResize.spec.ts`, and enforced again
  at handler, store and CHECK (invariant 6). An e2e that re-measured it through a real canvas would be asserting the
  encoder and would be non-deterministic about the one number it claimed to check.
* ~~**E2E-M10-05**~~ `all` (FR-27.8) — **struck**: the *„Enthalten in"* section's promise is **E2E-M10-17**'s, and its
  absence on an unused item **E2E-M10-19**'s.
* ~~**E2E-M10-06**~~ `all` (FR-27.9) — **struck**: the remarks-from-trips section's promise is **E2E-M10-18**'s, and its
  absence on an unused item **E2E-M10-19**'s.

### M11 — Container Management

Every id is read clause by clause against the built screen; the notes per case say which layer keeps what.

* **FR-10.3's threshold is a fixed 15 %, by decision, and there is nothing here to configure.** `imbalanceThreshold()`
  is the constant `IMBALANCE_THRESHOLD_PERCENT`; no screen writes a per-trip threshold (the M3 wizard writes `season`,
  `transport_mode`, `accommodation` and `tags`; M16 the series' defaults of the same three; M22 name, dates and
  travelers). A percentage field is wanted only by someone who has met a warning they disagree with. **Revisit
  trigger:** a warning that fires wrongly.
* **E2E-M11-01** `all` (FR-10.1) — **implemented across M11-05/06** (`e2e/containers.spec.ts`): create/edit/delete
  containers with name, carrier, max weight. **The carrier is *optional***: M11-05 hands a bag to Andy and reads the
  name off the card, which a chip that could only ever hand it on would satisfy just as well. Taking the carrier off
  again is a write rule, so it is asserted at the write layer — `components/trips/__tests__/ContainerSheet.spec.ts`,
  tapping the active chip calls `updateContainer` with `carrier_traveler_id: null`. Red-proved by making `toggleCarrier`
  always assign.
* **E2E-M11-05** `all` (FR-10.1/25.15/24.5) — **implemented** (`e2e/containers.spec.ts`, mutation-proved: a one-sided
  pair write fails it): the ＋ FAB creates a container and opens its sheet; name and weight limit save on change with no
  Save button. Pairing is set **on both sides at once** and released on both when cleared. (The *deletion* half of that
  rule is asserted by E2E-M11-04, where it is visible; this case's containers are empty, and an empty pair renders
  identically whether or not the survivor was released.) **„No Save button"** is asserted beside the visible indicator,
  the positive signal the absence stands against. Red-proved with a Save button added to the sheet. (The *signal* the
  indicator is handed is `saveIndicatorWiring.spec.ts`'s — a scan over all four call sites, see E2E-M5-07.)
* **E2E-M11-08** `local` (FR-10.2, ADR-075) — **implemented** (`e2e/containers.spec.ts`): the
  unassigned bucket selects like the other lists. Three rows, one container. A **real right-click** on a row starts
  the mode with it picked and opens **no** picker; the next tap on another row picks it (the count reads two) and
  still opens no picker; the bar's *In Gepäckstück …* opens the picker once, its subject line naming the two
  positions, and choosing the container leaves **exactly the unpicked row** in the bucket, the mode ended and the ＋
  FAB back. The app bar's checkbox glyph then arms the mode with nothing picked. The single-tap path is
  E2E-M11-06's, unchanged.
* **E2E-M11-07** `all` (UX-8) — **implemented** (`e2e/containers.spec.ts`): with zero containers and nothing
  unassigned, the unassigned section is **absent** — "everything is assigned to a container" must not stand under "no
  containers yet". Creating the first container brings the section back with its (0) count and hint, which is the
  positive signal the absence is asserted against.
* **E2E-M11-06** `all` (FR-10.2/25.5) — **implemented** (`e2e/containers.spec.ts`; the no-grid assertion counts
  `ion-select`, not `button` — Playwright CSS pierces shadow DOM, where ion-item's own tap surface is a native button):
  the unassigned bucket renders **one row per item** (asserts no per-container button grid); tapping a row opens the
  container picker with each container's current load, and choosing one assigns the item. Deleting a container
  **unassigns** its items — they must still be on the packing list afterwards. The FR-25.5 half of the credit is this
  last clause and nothing more: *„assignment never blocks packing"* is asserted by every M4 case that packs an
  unassigned row, and no case here needs to restate it.
* **E2E-M11-02** `all` (FR-10.3) — **implemented** (`e2e/containers.spec.ts`; the weight arrives through the app's own
  paths, M10 minimal form → quick-add suggestion): weight bar goes amber at ≥90%, red beyond max. The *boundary itself*
  is unit-owned (`budgetLevel` in `domain/__tests__/containers.spec.ts`); what the e2e adds is that the grade reaches
  the painted bar and that the sheet words the overrun — a rule can be right in the domain and never arrive on a pixel
  (G-14).
* **E2E-M11-03** `all` (FR-10.2) — **folded into M11-06, and narrowed to what the screen does**: unassigned bucket;
  assign an item **into** a container; deleting a container unassigns its items first. Moving an item *between*
  containers is deliberately not an M11 gesture — an assigned item leaves the bucket and the cards do not list their
  contents, so the screen offers no path to it. Re-assignment lives in M5's container control (`m5-container`), and is
  **E2E-M5-22**.
* **E2E-M11-04** `all` (FR-10.3) — **implemented** (`e2e/containers.spec.ts`, asserted on both cards of the pair;
  mutation-proved: emptying the delete path's release writes fails it): pairing control shows a live imbalance indicator
  against the threshold, and **deleting one side releases the other** — the survivor stops reporting an imbalance
  instead of weighing itself against a container that no longer exists. The skew is what makes that assertable, which is
  why the rule is asserted here rather than beside the pairing case. **The threshold it is measured against is a fixed
  15 %** — see the note at the top of this block.

### M12 — Analytics

All seven ids are implemented and read clause for clause against the screen. **M12 is a screen of
derived numbers, so most of its promises are kept in `domain/analytics.ts` and only their *rendering* is e2e work** —
the bar order (*heaviest first*), the unweighted row's exclusion from the bars, the slice keys and the trend arithmetic
are all unit-owned, and each case below says which layer answers for what. What e2e alone can establish is that the
number reaches a pixel and that the switcher and the bars actually move it.

* **E2E-M12-01** `all` (FR-8.1/8.2/**10.4**) — **implemented**: two weighted rows, one packed and one not (`5.0 kg / 6.0
  kg`, two different numbers — one packed row would let a KPI printing the planned weight twice pass), one of them in a
  bag
  created through M11's own FAB, and the *Gepäck* view splitting them into the named bag and the absence bucket — two
  slices where *Kategorie* had one, so a dead segment fails on the count alone (`analytics-slice-none` alone is rendered
  by both views for an uncategorized item). This is the case that renders FR-10.4's dimension over a real bag.
  Mutation-proved twice: pointing `dimensionKey`'s container case at the absence bucket, and printing `plannedWeight` on
  both sides of the KPI.
* **E2E-M12-04** `all` (FR-8.2/25.11) — **implemented**: a picked bar lands on M4 **filtered** to that value — asserts
  the facet is set (a row outside the slice is gone), the removable chip names the value, and clearing the chip reveals
  the grouping that came along. Regression guard: setting only the grouping fails every assertion but the last. The
  clause *„clearing every other facet, since the reader picked these numbers"* is **unit-owned**
  (`composables/__tests__/usePackingFilter.spec.ts`, seven cases on `setStoredFacet` including a stale
  facet from a previous mount) — the e2e world has only one facet in force, so an assertion here could not tell a
  replacement from an addition.
* **E2E-M12-08** `all` (FR-8.2/25.11) — **implemented**: bars are picked, not followed. Two of three
  Person bars are picked and land on M4 as **two chips of one facet**, OR'd — both picked rows stay and the third
  person's row is gone, which a single-value handoff cannot produce. On M12 itself: no button while nothing is picked,
  the count follows each pick, a second tap takes one back (`aria-pressed`), and switching the dimension away and back
  drops them.
* **E2E-M12-05** `all` (FR-8.2/25.1) — **implemented**: with rows assigned per traveler, the Person view shows **one
  contribution per traveler** plus the *Shared* bucket and no `undefined` bucket; the Category view sums the same rows
  into a single bucket, so the totals match across dimensions. (The multi-row per-person cluster shape is unit-owned in
  `analytics.spec.ts`, same rule.)
* **E2E-M12-02** `all` (FR-8.2) — **implemented**: an item without weight is counted beside the chart ("＋ n …"), never
  drawn as a zero-width bar; with no weighted rows the bar card states its empty state **and no KPI tile stands under
  it** (UX-11 — the visible empty state and the unweighted counter are the settled positive signal beside the two
  absence assertions). **Which layer keeps which half:** *„never drawn
  as a zero-width bar"* is unit-owned — this case's world has no bars at all, so the interesting arrangement (one
  weighted row *and* one unweighted, one bar not two) exists only in `domain/__tests__/analytics.spec.ts`. What the e2e
  keeps is that the counter and the empty line are painted and the tiles are not.
* **E2E-M12-07** `all` (FR-8.1, UX-11) — **implemented**: the value KPI exists only when something carries
  a value — a priced master item quick-added to the trip renders the tile with the locale-formatted amount, while
  E2E-M12-02's price-less world renders no tile at all. **The amount is unit-less here because the case is `local`** —
  `formatValue` carries (FR-21.9) the instance's currency where one is named, and Local Mode has no
  server to name one. That half is E2E-M9-09's, on the `single` project, and it is the same `formatValue` on both
  screens; a currency assertion added here would assert the absence of a feature the mode cannot have.
* **E2E-M12-03** `all` (FR-14.3) — **implemented, both halves**. The absence half: with a series but no
  archived history the trend section is *absent* rather than empty. The positive half: last year's trip taken through
  the whole lifecycle by hand — a weighted row packed, the trip started, the thing nobody had packed typed in (which is
  where FR-9.1 *missing* comes from), then archived — and this year's trip in the same series draws one trend column
  labelled with last year's year and carrying its **packed** kilos, with "Powerbank · 1× missing" in the flag list
  beside it. The flag is read back off the stored row in M5 before archiving, because an empty flag list would report a
  never-written flag just as quietly. The trip is moved out of *planning* through M4's start action (E2E-M4-43). **A
  third clause (C-3b):** the section heading names the *series*, not the trip — `trip.series_name` is a field no writer
  fills, and falling through to the trip's own name would say „Series Elba 2026 · trend" about a series called Elba.
  Mutation-proved three times — pointing the trend at *active* trips, dropping *missing* from the flag counter, and
  putting the heading back
  on the trip name each redden it.
* **E2E-M12-06** `all` (FR-8.2/25.18) — **implemented** (`e2e/packing-list.spec.ts`): opening a picked slice sets the
  grouping M4 comes back with, asserted after clearing the facet chip the same step set. Crosses the screen boundary on
  purpose: M12 and M4 each hold their own grouping state and each is self-consistent, so no unit can see the handoff
  between them break. ADR-012 leaves one router outlet, so M4 is **not** remounted on the way back
  and a value written only to storage would not be read until the next cold start.
* **Not implemented, and not a test gap — there is no way from M12 to M11.** UI-Spec M11's *Navigation* line says
  *„from the luggage button in M4's toolbar … and from M12"*. `AnalyticsPage.vue` pushes
  exactly one route, `/trips/{id}`: opening a picked *Gepäck* bar sets the container facet and lands on the packing
  list, which is FR-8.2's own action and a different thing from opening the bag's screen. No case id claims the M12→M11
  edge (E2E-G9-11 covers M4↔M11 only), so nothing is red — the sentence describes an affordance the screen does not
  have. **Open decision:** add the edge (the natural place is the *Gepäck* view's header, not the bar, whose tap
  is already spoken for) or strike the clause. UI-Spec M11 says it is not built; no other document leans on it.

### M13 — Repack Mode — **REMOVED (2026-07-17)**
Feature removed from the product (PRD Addendum §3.11); its E2E cases are retired.

### M14 — Post-Trip Review Assistant

The assistant is a **list** whose proposals target **groups** (FR-27.11). Every id is read clause by clause against
the built screen and against `ReviewPage.spec.ts`, which is where most of M14's rules actually live. **M14 is a screen
of derived proposals, so the domain answers for which proposals exist and the component test for what the list does with
them**; what e2e alone establishes is that archiving
arrives here, that the row's controls write, and that the group is read back from M8.

* **The closing card teases the proposals** (UI-Spec M14's *Navigation* line: *„teases the first two proposals and
  links to the full list"*): `ArchivedTripCard`'s `m4-closing-teaser` names them, asserted by E2E-M14-07 and, for a
  trip with nothing to review, E2E-M14-08.

* **E2E-M14-01** `all` (FR-9.1/9.2) — **implemented** (`e2e/review.spec.ts`): archiving a flagged trip
  auto-launches the assistant; a proposal reads correctly (kind chip *ungenutzt*/*fehlte*, the item name, the why line —
  "auf {n} Reisen nicht gebraucht" when the series history says so). **The last clause is the component's:** the why
  line has two branches and this trip is in no series, so `historyCount` returns 1 and only the singular branch is
  reachable here; the *domain* takes the count as a parameter (`flaggedTripCount`, unit-covered) and the function that
  computes it from the series is the page's own. It is asserted in `ReviewPage.spec.ts`, both directions: an archived
  sibling in the same series carrying the same flag makes the line read *2*, and an archived trip in a **different**
  series does not. Not
  e2e, deliberately — the world is E2E-M12-03's two-trip lifecycle staging, which is the suite's most expensive, for one
  sentence.
* **E2E-M14-02** `all` (FR-9.2/1.6) — **implemented**, both halves read back out of M8: Apply writes directly
  to the row's target **group** — shared instance-wide per the FR-1.6 MVP simplification; **no fork prompt exists** —
  which is a statement about FR-1.6's model rather than an assertable behaviour, since there is no fork code in any mode
  for a case to find absent (the clause is kept as the reason apply is one tap, not as coverage). An
  *unused* apply zeroes the position, a *missing* apply adds one (creating the master item first for an ad-hoc name).
* **E2E-M14-03** `all` (FR-9.2) — **implemented for the pair scope and its persistence**: "Never ask again"
  removes that row and only that row, and the dismissal outlives the visit (the assistant is recomputed from current
  state, so this is the only piece of it that is stored). The second clause — *the same item still surfaces for another
  group* — needs the same item flagged twice under two groups, which one trip cannot produce; it stays unit-owned in
  `domain/__tests__/review.spec.ts`, and this sentence is its revisit trigger.
* **E2E-M14-04/04b** `all` (FR-27.11) — **implemented**, split in two cases (`E2E-M14-04` for the targets,
  `E2E-M14-04b` for the blast radius, which needs a second planning trip following the group): every proposal names a
  **group** as its target and the picker offers groups only — never a Ferien-Vorlage (**that half is unit-owned**: this
  case's world contains two groups and no Vorlage, so the absence is of something absent;
  `ReviewPage.spec.ts` and `retargetGroups` in `domain/__tests__/review.spec.ts` both assert it against a world that has
  one); an *unused* row's picker offers only groups that actually carry the item, since zeroing a position that does not
  exist would apply as nothing. An *unused* proposal defaults to the group the row came from; a *missing* ad-hoc row
  defaults to the trip's dominant group (**the dominant-group default is the domain's**, `buildReviewProposals — missing
  flags default to the dominant group`: the e2e reads the picker's *options*, not its current value). Applying writes to
  that group; the row states the FR-27.4 blast radius ("Wirkt auf N geplante Reisen …") when planning trips use the
  target. *(The FR-27.4 applied-change entry on each planning trip is produced by the refresh: M14 writes to the group,
  and the trips following it log the change on their next open — one mechanism, so M14 owes no push of its own.)* **The
  FR-27.12 peek** — the chevron beside the picker, which opens the target group's
  resolved contents before the proposal is written into it — is covered here: the case opens it on the *missing* row,
  reads the group's two positions out of it, asserts the proposed item is **not** among them — which is why there is a
  proposal — and closes it. Red-proved by pointing the trigger at `null`.
* **E2E-M14-05** `all` (FR-27.11, FR-9.4) — **implemented**: the assistant renders as a
  **list with an open count**, not a card stack; applied and skipped rows remain visible and marked rather than
  disappearing, and "nie mehr fragen" removes the row for that item–group pair only. The case also pins (FR-9.4)
  **where** a handled row is: out of *Offen*, into the *Erledigt* block, counted once on each side — and the finished
  state reached by handling both rows rather than by dismissing them.
* **E2E-M14-07** `all` (FR-9.4) — **implemented** (`review.spec.ts`): the archived trip's closing card names the
  proposals it would offer. It lives in the review spec rather than beside the closing pass because **a proposal needs a
  row with provenance** — an ad-hoc row judged *unused* proposes nothing, since there is no position to zero — and that
  world is `review.spec.ts`'s own fixture.
* **E2E-M14-08** `all` (FR-9.4) — **implemented** (`closing-pass.spec.ts`): a trip with nothing to review says so on
  the card. The positive signal is the card itself, on screen either way — listing nothing and *saying* nothing are the
  same pixel otherwise, and the second reads as "not loaded".
* **E2E-M14-06** `all` (FR-9.2) — **implemented**: no flags → archiving
  skips the assistant with a "nothing to review" toast; opened directly, the screen shows the honest empty state;
  applied rows don't reappear on a later visit (resumability). The case archives rather than navigating straight to
  `/review`: it takes the trip through *Reise starten* → the closing pass →
  *Fertig* and asserts that the trip **is** archived and the assistant was **not** opened, read off the archived M4's
  own closing card. **The trap:** `review.nothingToast` and `review.empty` are
  character-identical in both catalogues (*„Nothing to review — no flags were set."*), so a case asserting only the
  toast's text would pass just as well on the screen the clause is about not reaching. The toast is also filtered by
  that text rather than located as *a* toast — *Reise gestartet* is still on screen seconds earlier, and two matches are
  a strict-mode failure that presents as a flake. **The third clause is (a): already asserted elsewhere.** Resumability
  is not stored state — `buildReviewProposals` recomputes from current state, and both halves of "an applied row stops
  appearing" are pinned in `domain/__tests__/review.spec.ts` (*yields nothing when the group position is already
  zeroed*, *skips items the default group already contains*), which is the arithmetic an applied proposal produces.

### M15 — Import Wizard
* **E2E-M15-01** ~~`all` (FR-16.1): upload/paste CSV → grid preview; mark item column, category rows, per-trip
  include/name/date/series.~~ — **retired clause by clause**, because it is six promises in one sentence and they are
  asserted in five different places. *Upload* is **E2E-M15-10** and *paste* is every other case in
  the unit; *category rows* is **E2E-M15-11**; *per-trip include* is **E2E-M15-12**; *name/date*, prefilled from the
  header block, is **E2E-M15-05**. The *grid preview* is **E2E-M15-13** (ADR-041), not
  this number, which a reader arriving from an old commit has to be able to land on. And *mark the item column* is left
  deliberately
  untested: the picker's candidate list is asserted in M15-05 and the same override, on the same control shape, is
  asserted for the category column in M15-07 — what is not covered is a *sheet* whose item column the detector reads
  wrong, and FR-16.1 records that the surrounding inference has no manual override at all.
* **E2E-M15-02** `all` (NFR-4.7) — **implemented** (`spreadsheet-import.spec.ts`): step 2 names the entries
  the sheet marked uncertain and up to three of them by name, step 4 counts the tasks the commit will write, and the
  case follows the chain to the prep badge on the imported row — the positive signal the note stands against. The task
  body is on the catalogue (NFR-4.12), asserted in the *other* locale by `composables/__tests__/import.spec.ts`, because
  a body read through `t()` in the default language is equally satisfied by an English literal. The body is
  `import.wizard.noiseTodo`, rendered with `t()` in `composables/sync/actions/tripCreation.ts`. The rule underneath —
  a trailing `?` becomes an item plus an open task on its trip row; `buildImportPlan` strips it and sets
  `hasOpenTask`, `commitImport` writes the todo — is unit-covered at both levels
  (`domain/__tests__/spreadsheet.spec.ts`, `composables/__tests__/import.spec.ts`, which asserts the todo lands `open`).
* **E2E-M15-03** `all` (FR-16.3) — **implemented** (`e2e/spreadsheet-import.spec.ts`): step 3 is reached only with an
  existing inventory — every other fixture in the unit imports into an empty device, where there is nothing to be a
  duplicate *of*. The inventory is therefore built by an import of its own — M15
  is the screen that turns a sheet into master items — and the second sheet carries one exact repeat and one one-letter
  neighbour. The near one is switched to *keep separate*, the exact one left on the default; the confirm reports *2 new
  items, 1 merged*, and afterwards M9 holds **five** rows. The count is what makes the merge legible: „no second
  *Wanderschuhe* appeared" is equally true of an import that created nothing at all. *(Mutation-proved: with `plan`
  merging every match regardless of the choice, the kept-apart item never arrives.)*
* **E2E-M15-13** `all` (FR-16.1, ADR-041) — **implemented**: step 1 renders the grid the parser read, live while the
  text is being pasted, before anything is derived from it. Asserts the one thing a derived list cannot show — a quoted
  comma kept as **one** cell — plus a short row keeping its shape rather than shifting its neighbours left, the row
  count, and that the wide content scrolls inside its own box. It carries E2E-M15-01's grid clause, which is retired
  there.
* **E2E-M15-04b** `all` (FR-16.1) — **implemented**: the confirm names each trip's target series, and names *„keine
  Serie"* where none was chosen. Asserted from both sides — first with no series to prove the row is not merely silent,
  then after choosing one — because a row that always printed *„keine Serie"* would satisfy half of it.
* **E2E-M15-04** `all` (FR-16.2/NFR-4.7) — **distributed, and one clause an approximation.** *n items* and *n archived
  trips* are asserted on the confirm line by M15-06/08/11 and committed by M15-05/08/11; *pre-validation blocks a bad
  file before commit* is **E2E-M15-12**. The *target series* clause is **E2E-M15-04b**: each confirm row names the
  series its trip will join, and says *„keine Serie"* where none was chosen (`commitImport` writing `series_id` is
  unit-covered in
  `composables/__tests__/import.spec.ts`). And *transactionality* is an
  **approximation, not a rollback**: the plan is validated before a single mutation is enqueued and replay is
  idempotent, but nothing rolls back and there is no progress indicator — UI-Spec M15's *„transactional commit with
  progress; failure rolls back completely"* is not a promise any code keeps.
* **E2E-M15-05** `single` (FR-16.1/16.2, FR-2.1b) — **implemented**: a CSV with a two-row header (year above name) and a
  category column imports through the wizard; the mapping step shows the name and the date it read from the two header
  rows, and both column pickers offer *candidates* rather than every column — a column holding quantities can be neither
  of the two they choose; after the commit the trip is on M2's Archived segment, and **a second browser context that
  never saw the optimistic write finds the trip and its packed rows** — the only assertion that can tell a wire that
  carried the import from a screen that only believed it.
* **E2E-M15-06** `all` (FR-16.1) — **implemented**: a sheet whose category is a *column* has it detected, and the
  confirm step reports the categories it produced. ~~and no item turned into one~~ — **that half cannot fail here**:
  with a category column the analysis claims no category rows at all, so no item is ever a candidate to become one. The
  clause is falsifiable only in the *rows* layout, and it is asserted there by **E2E-M15-11** — where the mutation that
  stops claiming heading rows does turn both headings into items.
* **E2E-M15-07** `all` (FR-16.1) — **implemented**: setting the category-column picker back to *None* is honoured rather
  than re-detected, and the plan then carries no category at all. The override is the escape hatch for a column the
  detector reads wrong — a *Notes* column carrying text and no quantities looks exactly like a category to it.
* **E2E-M15-08** `all` (FR-16.1) — **implemented**: a sheet with no trip column at all passes the mapping step, reports
  *0 archived trips* with its items, and lands on the inventory rather than on the trip list — not refused, and the
  bare list it imports arrives as items, not as categories.
* **E2E-M15-10** `all` (UX-6, G-17, ADR-035) — **implemented**: M15's file control is the app's own catalogue-labelled
  button, not the browser's file chrome, and a file picked through it lands its text on the same path the paste area
  feeds — asserted end to end by the mapping step appearing for the picked CSV.
* **E2E-M15-09** `single` (FR-24.2/16.3) — **implemented**: after an import, a **second browser context** filters M9's
  tag axis to the imported category and finds the item under it, and a name the sheet listed twice is there once. Both
  halves can be refused at the wire while invisible on the importing device: a tag link enqueued before its item, and
  `items` being UNIQUE (name). *(The „there once" half is carried by Playwright's strict mode — a
  second row makes the `getByText` resolve two elements and throw — rather than by a count of its own. It cannot pass
  against a duplicate, so it is coverage; it just does not read like it.)*
* **E2E-M15-11** `local` (FR-16.1/16.2/24.2) — **implemented** (`e2e/spreadsheet-import.spec.ts`): the
  **category-row** layout, which is the one this wizard was built for, end to end — the case that makes
  `analyzeGrid`'s heading-row branch produce a row anybody can see (the other cases carry the category in a *column*,
  and M15-08 imports a sheet with no category rows and no trip at all). Two headings become
  tags and do **not** also become items (three new items out of five named rows), the two trip columns land archived
  under the years that are their only header, and on M9 the heading filters to the two items beneath it and not to the
  third. The write half and the read half are two behaviours: a tag that exists is not a tag on an item (FR-24.2).
  *(Mutation-proved on the `categoryRows` push: the summary then reads „5 new items, 0 categories".)*
* **E2E-M15-12** `local` (FR-16.1, NFR-4.7) — **implemented** (`e2e/spreadsheet-import.spec.ts`): the mapping
  gate, and the include toggle as the way past it. A trip column the sheet **dates but never names** is preselected —
  FR-16.1 leaves out only a column carrying *neither* fact — so the step names what is missing and refuses to advance;
  unticking that column releases it and the confirm then reports **one** archived trip. It is the case that operates
  the per-trip include checkbox and asserts the note's presence (M15-08 asserts its absence). *(Mutation-proved on
  `mappingValid`'s name check.)*

### M16 — Series & Destination Profile

All four ids describe behaviour that is built, every one of them a *write* (the name, the three FR-15.1 defaults, a
destination profile created on first use, its checklist, attach and detach), and all four are implemented in
`client/e2e/series.spec.ts`. A promise here is read against the rendered screen rather than against a stylesheet
(G-14) — see the note below.

* **FR-13.3's checklist field must have a box.** Ionic gives `ion-select` `width: 100%`, which as a flex item is a
  flex-basis of the whole row, so the add-row's `ion-input` — flex-basis 0 — would render at **zero width** beside it;
  the select is therefore content-sized. No DOM query catches a regression: the native input is in the DOM and
  `getByTestId` resolves it, and only Playwright's *visible* check says it has no box. E2E-M16-02 is the standing
  assertion, because it types into that field.
* **E2E-M16-01** `all` (FR-13.1/15.1) — **implemented** (`e2e/series.spec.ts`): the series
  name and the three default selects are editable, and both are read back after leaving the screen
  and returning rather than off the control that wrote them (the defaults are selects). It also
  covers the **rename refusal** UI-Spec M16 states: renaming onto
  another series' name is refused on the client (`trip_series.name` is UNIQUE instance-wide), the
  toast names the holder, and the field goes back to the stored name — with a free rename after it,
  read off the header, which renders from the series and not from the field. **The trap:**
  `toContainText` on an `ion-select` matches its **options**, not its value, so
  `toContainText('Summer')` is true of a season select nobody has ever touched. The untouched second
  series is asserted first for exactly that reason, and the value is read from `.select-text`.
  Red-proved twice (blanking the attribute read, dropping the field's revert).
* **E2E-M16-02** `all` (FR-13.3) — **implemented**: with no destination profile in
  existence the checklist states its own emptiness; typing notes and adding an entry both go through
  `ensureDestinationProfile`, and the read-back after leaving and returning is what proves the row
  it created is real. The entry keeps its procurement mode, and removing it returns the empty state —
  the positive signal the two absence assertions stand against. Red-proved by dropping the write.
* **E2E-M16-03** `all` (FR-13.2) — **implemented**: the history lists the series' trips
  with their packed/total line, a trip in no series is *not* in it, and detach and attach move one
  each way. Detach sits on a row that is itself a link to the trip, so the case asserts M16 is still
  the rendered page afterwards — a `.stop.prevent` that stopped working would otherwise read as a
  pass. The attach is read back on **M2**, whose series header counts the trips: the write is a
  trip's `series_id`, not a list local to this page. Red-proved by making detach re-attach.
* **E2E-M16-04** `all` (FR-13.2/15.1) — **implemented**: *„New trip in series"* opens M3
  carrying the series *and its defaults*, asserted on `wizard-more-summary`, which is where the
  folded FR-2.1c step states what it is holding — and asserted **before** the default exists as well
  as after, so a summary that only ever names the series cannot pass for a prefill. The trends
  shortcut opens M12 on the series' most recent trip, rendered rather than routed. What the shortcut
  is *not*: M12's trend section itself needs archived series history and is E2E-M12-03's, on both
  halves; this case owns the edge, not the section.
* **Checked and deliberately left untested:** a series with no trips at all (its empty history line
  and the absent trends shortcut). It is reachable only by detaching every trip, both halves are one
  `v-if` over the same list this case already moves, and an id invented for it would be the coverage
  inflation this programme exists to avoid. The **clone entry** (FR-12.1, offered when the series has
  an archived trip) is likewise left: it is a router-link to M2-04's screen, which that case owns.
  Neither carries a `data-testid`, deliberately — a hook nothing addresses is the same „kept for
  later" as dead code.

### M17 — Settings & Notifications
* **E2E-M17-01** `server` (FR-6.2) — **implemented**, in `e2e/server/multi-user.spec.ts`. Of the five kinds
  (delegation, mention, task, `lock_taken` with FR-5.7, `note` with FR-7.9) this case drives delegation and mention. Bob
  turns *Delegations* off in his own M17, the choice survives his reload, and Alice's next hand-over produces no toast
  on his screen — while the same
  pair of pages produced one before he touched it, and a **mention** afterwards still arrives. The two positives are
  what make the absence assertable: a toast that has not come yet looks exactly like one that never will, and the
  mention rides the same connection the suppressed delegation would have. It also proves the switch is *per kind* rather
  than a mute. The ends are unit-covered — Go's `TestNotificationPrefs_DisabledKindSuppressesCreation` for the rule,
  `composables/__tests__/settings.spec.ts` for the PUT — and this case is what says the switch the user flips is the
  value the server reads.
* **E2E-M17-02** ~~`server` (NFR-4.6): "Push on this device" registers via the Push API/VAPID (permission mocked);
  support detection hides it where unsupported.~~ — **retired as an e2e case, and covered where it can be.** The browser
  dance is unit-owned end to end in `notifications/__tests__/push.spec.ts`: the VAPID key is fetched and the
  subscription registered, an existing subscription is reused rather than resubscribed, a denied permission
  returns false, an unsupported browser returns false, and the unregister drops it on both sides. The half a rendered
  case would add is *„hides it where unsupported"*, and that branch cannot be produced in either browser the suite runs:
  Chromium and WebKit both carry `PushManager`, so `pushAvailable` is true in every project that exists. The control is
  disabled rather than hidden, and asserting `disabled` on an Ionic toggle is the E2E-M17-05b trap — a bound boolean
  reflects onto no DOM attribute — so the case would be green against the branch being gone. The **round-trip** — the
  subscription the browser dance produces actually reaching the instance — is E2E-NFR-06's. M17-02 stays retired; the
  clause it was retired *for* is
  unreachable.
* **E2E-M17-03** `server` (NFR-4.5) — **implemented**, in `e2e/server/data-export.spec.ts`. `server` rather than `all`,
  for two reasons: in Local Mode this is a
  **different section** — per-trip and per-template YAML written client-side, because there is no server to ask — and in
  `single` there is no token, so the auth header the promise is about is never sent. Both files are read back rather
  than counted: the JSON is parsed and asked for the trip, the CSV for the row. An export is one half of a pair, and the
  half that matters is the one that has to be readable when it is the only copy left.
* **E2E-M17-04** `single` (FR-17.13) — **implemented**, in `e2e/single/settings-profile.spec.ts`: editable
  display name against a real jitpackd. The untouched field shows no rule note whatever name the server handed out;
  emptying it is the first touch and the note appears; a name with a space and a diacritic — which a
  `[A-Za-z0-9._-]` rule would refuse — saves and survives a reload, proving the server accepts it too.
* **E2E-M17-12** `single` (FR-17.13) — **implemented**, in `e2e/single/settings-profile.spec.ts`: the picked
  file opens the crop stage, the stage covers it, the slider scales it, and *Use photo* writes a 256×256 JPEG that the
  profile row then shows where initials were. The size is read back off the endpoint that serves it rather than trusted
  from the canvas call. `setInputFiles` fills a hidden `<input type=file>` with no browser dialog involved; the modal
  carries four ids because a class name is not a seam; and the settled signal is the uploaded picture appearing on the
  row, so nothing here waits on a timeout. The dashboard greeting is not asserted: it is a time-of-day line carrying
  neither a name nor a picture (UI-Spec M17). `server` is not claimed: the branch that project owns is whether the
  control is *offered* to an OIDC account, which is E2E-M17-05; the crop itself is the same component in both. It
  red-proves the
  crop-stage fix — see the log.
* **E2E-M17-05/05b** `server` (FR-17.13) — **implemented**, in `e2e/server/settings-profile.spec.ts`. The profile
  splits: **E2E-M17-05** asserts the picture control
  is offered to an OIDC account — a branch only a project with a real login can reach; **E2E-M17-05b** asserts the
  other half, that the name is the provider's. The name half asserts the *absence
  of the save button* rather than a `readonly` attribute: Ionic reflects a bound boolean onto no DOM attribute, so
  asserting the attribute would pass against an editable field too.
* **E2E-M17-13** `server` (FR-23.7) — **implemented**, in `e2e/server/api-token.spec.ts`: a token created in
  M17 is read out of the reveal and then sent as `Authorization: Bearer` against `/api/v1/me`, which answers with
  **Alice's own display name**. It is the only case in the suite that sends that header, and the only project that could
  carry it — `local` has no server and `single` bypasses authentication, so neither can tell a working credential from
  an ignored one. Two negative halves keep the 200 honest: the same request with **no** header, and one with the last
  character of the token changed, both 401. The token is read from the rendered value rather than from the clipboard on
  purpose — `navigator.clipboard` needs a permission grant under Playwright, and asserting on it would make the case
  about the browser instead of about the promise, which is that the value is shown *to the person*.
* **E2E-M17-13b** `server` (FR-23.7): closing the reveal removes the value from the screen. "Shown exactly once" is a
  promise about the second look, so it needs a case that takes one.
* **E2E-M17-14** `single` (FR-19.8, ADR-045): the whole move on one device. A Local Mode device with a trip that has
  rows opens M17, finds the card, takes the backup from step 1 (the download is captured and kept as the file), confirms
  step 2 with the Single-User instance's URL, and comes back up in Server Mode with **M19 not shown** and the migration
  bar on screen; *Wiederherstellen* opens M18, the captured file goes into the restore branch, the commit lands, the bar
  is **gone** and stays gone across a reload, and the trip **with its rows** is read back from the server through the
  API — the third-device assertion FLOW-07 established, taken here from the server itself. `single` because `local` has
  nothing to switch to and `server` would put a login between step 2 and step 3, which is E2E-M19-02's clause, not this
  one's.
* **E2E-M17-14b** `local` (FR-19.8): the guard. On a device with a write newer than its last backup the switch is
  **disabled and says why**; the card's own backup enables it; one more write (a quick-add on any trip) disables it
  again. Both directions are asserted, because a guard that only ever enables is a delay, not a rule. The card's absence
  in Server Mode is unit-owned (G-8, the `SettingsApiTokens.spec.ts` shape), since `local` cannot render a Server Mode
  M17.
* **E2E-M17-14c** `single` (FR-19.8): *Überspringen* is its own outcome. After the switch, the bar's skip asks once, and
  confirming clears the flag: the bar is gone, it does not return on reload, and **nothing was restored** — the server
  has no trip, asserted through the API, which is the positive signal for the absence. Without this the skip could be
  wired to the restore action and every other assertion would stay green.
* **E2E-M17-15** `single` (FR-19.9) — **implemented**, in `e2e/single/connection-repair.spec.ts`: the
  Connection block names the instance, offers **no** logout where there is no session to end (the reset beside it is the
  positive signal that the block rendered), and its reset — confirmed once — reloads the device onto **M19**. That last
  assertion is the whole case: M19 renders only while no mode is stored, so a screen nobody could reach for the life of
  a device is reachable again, which is what makes a stale mode or a stale server URL repairable at all.
* **E2E-M17-16** `server` (FR-19.9) — **implemented**, in `e2e/server/logout.spec.ts`: an OIDC session is
  ended from M17 and the device lands on the login — and is **still** there after a reload, which is what separates
  tokens dropped from the device from a page that merely navigated. `local` has no server and `single` has no session,
  so this is the only project that can carry it.
* **E2E-M17-17** `single` (FR-23.8, ADR-062) — **implemented**, in `e2e/single/instance-update.spec.ts`:
  an instance nobody asked to check says nothing about releases. `single` rather than `local`, because the **default**
  is what is under test and only a real backend holds it — this project's jitpackd runs without
  `JITPACK_UPDATE_CHECK`, so the endpoint answers `off`. The version line is asserted visible first, as the positive
  signal: without it the three absences below would also pass on a screen that never rendered. The other three states
  need an upstream feed that answers on demand, which no project has; they are covered against the component in
  `views/settings/__tests__/SettingsUpdateCheck.spec.ts` — including the Local Mode case, where the assertion is that
  **no request is made**, read off the recorded fetch calls — and against the endpoint in `internal/api/update_test.go`.
* **E2E-M17-18** `server` (FR-2.5a) — **implemented**, in `e2e/server/multi-user.spec.ts`: an account picked
  from the instance's users as a default traveller comes back in M3's step 2 as that account — the row carries the
  account's name and the role selector a member has. The pick and the wizard share one browser context, because the
  setting is device-local. Bob signs in first: the directory lists only accounts that have, so without him the picker
  would offer nobody and the case would fail on its setup, not on the feature.
* **Not covered here, and deliberately:** that the block is **absent** in Single-User and Local Mode. Neither project
  can render it — `single` has no session and `local` no server — so the two absence cases live in
  `views/settings/__tests__/SettingsApiTokens.spec.ts`, mutation-proved against the removed gate, because a surface that
  must not appear is exactly the kind that ships appearing.
* **E2E-M17-06** `local` (G-11/FR-21.3) — **implemented**, in `e2e/settings.spec.ts`: the Appearance toggle
  switches the flavour, and Tag survives a reload. It exists because **every other theme assertion in the suite seeds
  `jitpack_theme` into `localStorage`** — `colour-anchors`, `surfaces` and `visual` all prove the *palette* and none of
  them the switch. The last click is what proves the reloaded control came back *on*: against a toggle rendering
  stale-off it would turn Tag on a second time and the assertion would fail.
* **E2E-M17-07/07b** `local` (NFR-4.11) — **implemented**, in `e2e/settings.spec.ts`. The clause is **not** *cleared
  after a YAML download*: NFR-4.11 says in as many words that the export the reminder is about is the *whole device* in
  one file —
  the G-2 sheet's one-tap backup (ADR-015). M17's two YAML downloads are a single trip and a single template, and
  stamping the key from them would silence the warning about everything the file does not contain. The case asserts
  that one trip downloads and the warning stays; the device backup clears it. **E2E-M17-07b** covers the age: a stamp
  forty days old is read back and worded, plural included, off a seeded value rather than a mocked clock, because the
  decision itself
  (`reminderState`) is pure and unit-owned. The banner refreshes on entering the screen, because the backup is taken in
  another component.
* **E2E-M17-08** `local` (G-8/FR-17.3) — **implemented**, in `e2e/settings.spec.ts`: a device with no session
  carries no notification section at all, asserted against the sections that *are* there so a screen that failed to
  render cannot satisfy the absence. `local` alone rather than `single/local`: the gate is `mode === 'server' &&
  tokens`, and both halves of that are false in either, so one of them says it.
* **E2E-M17-09** `server` (FR-23.1): Administration row visible only for an instance admin with an OIDC session.
* **E2E-M17-10** `all` (NFR-4.12): the Language row switches the app to German and back — the chrome as well as the
  screen. Asserted on the four anchors in **both** presentations (tab bar and desktop rail — one list, two widths), the
  header bar's route title and M2's own segment labels, because those three must be catalogue keys rather than *stored
  English text* (a nav anchor's `name`, a route's `meta.title`), which no language choice could reach. It
  asserts the English words first, so „the German word is there“ cannot pass on a build that rendered neither, and
  re-asserts after a reload (device-local, FR-21.3's pattern).
* **E2E-M17-11** `all` (NFR-4.12): **M17 itself** follows the switch — profile, appearance, data, conflict log and
  about, each asserted in English first so the German cannot pass vacuously. It is the screen the language setting
  *lives on*, which is where a half-translated section is most visible: the user changes the setting and half the page
  ignores them. **Not covered here, and deliberately:** the notification section exists only on a multi-user instance
  (`server` mode *and* a session), which neither Playwright project reaches — `local` has no server, `single` has no
  tokens. It is covered by `views/settings/__tests__/SettingsPage.spec.ts`, which mounts the screen with a session and
  asserts the row labels in both languages. A module-level constant holding its labels would escape the switch,
  so that half needs the test most.

### M18 — Portable Import Preview
* **E2E-M18-01** `all` (FR-18.4/18.5) — **implemented** (`e2e/backup-restore.spec.ts`): template YAML →
  summary header (name, kind, item count, `schema_version`) + per-item state (new/near-duplicate/matched, each on its
  own row, and **only the near row carries a choice** — a decided state offers none); Import creates the template,
  landed whole, with its three positions on M8. This is the rendered coverage of the screen's *preview* branch: the two
  `packing-list.spec.ts` cases that come through M18 use it as a **fixture** for a trip with quantities and click
  straight past the preview. The template is **shared instance-wide** (FR-1.6 MVP), never „private owned“ —
  `templates.owner_id` is creator metadata the server stamps; and the ADR-030 name-collision clause is asserted by
  **E2E-M18-11** at the screen (`findExistingSubject` is one function for all three document kinds, so the trip case
  covers the template's
  branch of it) and by `composables/__tests__/portableImport.spec.ts` at the rule. *(Mutation-proved: with the state
  chip reading `matched` for every row, the *new* assertion falls.)*
* **E2E-M18-02** `all` (FR-18.4, ADR-024) — **implemented** (`e2e/backup-restore.spec.ts`): a trip arrives in **the
  status the file carries**, and *planning* only when it carries none. **E2E-M18-09 covers the restore list**, and
  ADR-024 explicitly rejected honouring the status *only* there, on the grounds that the same file would otherwise
  behave differently depending on which button opened it — so the **preview** branch is the
  half that rejection is about. The case imports an archived trip document through the preview, finds it on M2's
  *Archived* segment and asserts it is **not** on *Planned*, where a constant status would land it.
  *„Travelers/containers remapped by name“* stays unit-owned (`composables/__tests__/portableImport.spec.ts`): the remap
  is invisible on any screen this case can reach without a container view of its own. *(Mutation-proved on `{ status:
  doc.status ?? undefined }`.)*
* **E2E-M18-03** `all` (FR-16.3) — **implemented** (`e2e/backup-restore.spec.ts`). **There is no shared dedup
  component**: M15 Step 3 and M18's preview each render their own list and hold
  their own `mergeChoices` map; what they share is the *rule* (`domain/spreadsheet.ts`'s `findDuplicates`, which
  `matchPortableItems` wraps) and two catalogue keys. The case drives the choice to where it becomes visible — the
  inventory: two near-duplicates in one document, one left on the default (*merge*), one switched to *keep separate*;
  afterwards M9 holds a new item for
  the one kept apart, none for the merged one, and **three rows in total**. The count is what makes the absence mean
  something: „no second item appeared“ is equally green against an import that created nothing at all.
  *(Mutation-proved: with `commit()` merging every match regardless of the choice, the kept-apart item never arrives.)*
* **E2E-M18-05** `all` (NFR-4.11/FR-19.6/FR-18.4, ADR-015) — **implemented** (`e2e/backup-restore.spec.ts`): the round
  trip. A backup taken through the G-2 detail on a device carrying a group and a packed trip restores onto a **second
  browser context** — a device that has never seen the data, which is what stops the case passing against an importer
  that does nothing. The multi-document file lists its documents (template and trip named as such) rather than opening
  the merge preview; after *Import all* both partitions are present and the trip keeps its packing progress. The list is
  **already on the Planned segment**, asserted without tapping it — restored trips are *planning*, and landing on Active
  would show „No active trips“ after a restore that worked. Asserted on `trip-row-<name>`, never on the trip's name as
  text: the pasted YAML is still in the textarea, so a bare text match reads the *input* and hides a missing
  `/tabs/trips` redirect.
* **E2E-M18-06** `all` (ADR-015) — **implemented**: a file whose middle document is unreadable lists all three, marks
  the damaged one *skipped* with its reason **in its place**, and still imports the intact ones. A document silently
  missing from a restore is data loss nobody is told about.
* **E2E-M18-07** `local` (FR-27.1/27.7, ADR-017) — **implemented** (`e2e/backup-restore.spec.ts`): a backup taken with a
  composed Ferien-Vorlage restores onto a device that has never seen the group — M8 still shows the group under the
  Vorlage and the FR-27.2 footer resolves through it, and the template list holds **one** group of that name — the
  backup carries it both nested and as its own document, so a restore that took both at face value would leave a second,
  suffixed copy included by nothing. Asserted on the *second* device, and after a positive check that the group is
  absent there, so an importer that did nothing could not pass.
* **E2E-M18-08** `local` (FR-27.4, NFR-4.11, ADR-015) — **implemented** (`e2e/backup-restore.spec.ts`): a trip that
  follows a group is answered twice — one change accepted, one refused — and then restored onto a second browser
  context. The restore list names the trip as *following 1 group*, M2's applied chip and log keep the accepted change
  with its original timestamp, the refused position is not on the list and is not offered again, and a **new** group
  position added on the restored device is proposed on its own. That last step is the positive signal the two absence
  assertions need: without the restored sources nothing would be proposed, without the restored ledger the refused
  position would be proposed beside it.
* **E2E-M18-09** `local` (FR-2.2, FR-18.4, ADR-024) — **implemented** (`e2e/backup-restore.spec.ts`): a backup gives
  back the **status** it saved. A trip is taken planning → active → archived through the app's own path, backed up, and
  restored onto a device that has never seen it: it comes back archived, and the restore lands on M2's *Archived*
  segment rather than a constant *Planned*. The negative companion is asserted too — the trip is **not** on
  Planned. *(The device needs a template as well as the
  trip: a single-document file is M18's merge preview, not the restore branch. The marks-and-tags half of ADR-024 is
  unit-covered end to end — `buildBackup` → `commitPortableRestore` on a fresh store — rather than here, because
  building a tagged, marked inventory item through M10 doubles this case's length to assert what the unit already
  asserts at the same boundary.)*
* **E2E-M2-10** `single` (FR-2.3, ADR-033) — **implemented** (`e2e/single/server-sync.spec.ts`): a trip the device has
  **never opened** still shows its progress on the list. One context builds a trip with two items and packs one; a
  **second** context — a device that has never been inside that trip — opens M2 and its row reads `1/2 packed` with
  nothing clicked, and the trip-partition request count is asserted beside it, so the number cannot have come from
  somewhere else. The second context is the whole point: on the device that built the trip the rows are already in the
  store and the case would pass against a screen that loads nothing. *(Mutation-proved: with the row's
  request removed the summary stays on „Loading items …" — it does not fall back to `0/0`, because the two halves of
  ADR-033 are independent.)*
* **E2E-M2-11** `single` (FR-12.1, ADR-033) — **implemented** (`e2e/single/server-sync.spec.ts`): cloning a trip the
  device has **never opened** carries its items. Without the guard, ClonePage sums a partition that is not on the
  device: the preview reads `0 items, 0 travellers` and the clone is created exactly that empty, with no error anywhere.
  A second context opens the source's clone page directly, the preview settles on the real counts (the loading line
  stands in until the partition arrives, and the button stays locked with a name typed — both unit-tested in
  `ClonePage.spec.ts`), and the created clone opens with both source rows visible. `cloneTrip` itself refuses an
  unloaded source (`clone.spec.ts`). *(UX-1.)*
* **E2E-M2-12** `all` (FR-2.1, UX-5) — **implemented** (`e2e/trip-list.spec.ts`): a dated trip's temporal
  line is the locale-formatted range (`Aug 22 – Sep 5, 2026` in the suite's English), never interpolated ISO strings.
  Intl collapses the shared year, so a hand-written `start – end` fails the assertion too. The German shapes,
  *until/from* and the year-only line are unit-owned per locale in `lib/__tests__/format.spec.ts`; the greeting buckets
  (UX-15) in `lib/__tests__/greeting.spec.ts`.
* **E2E-SYNC-01** `single` (Sync-API §4) — **implemented** (`e2e/single/server-sync.spec.ts`): a master partition
  **larger than one page** arrives whole. 520 items are pushed straight at the API (this case is about the size of a
  partition, not about clicking five hundred times), then a browser that has never talked to the instance boots and the
  **last** row of the feed is asserted on M9. The request count is asserted beside it — more than one pull, or the seed
  no longer exceeds a page and the case would be proving nothing. *(A truncated first page otherwise passes silently: M2
  reads „Keine archivierten Reisen" with the G-2 glyph green. Mutation-proved: with the loop taken out, the last row is
  never
  found.)* §4's paging rule has **two callers** — `SyncOutbox.drain`, which every browser runs and this case covers,
  and the FR-18.7/18.8 command line's own pull (`sync/partition.ts`), which nothing here reaches. The rule, including
  the progress guard (*stop when `next_cursor` does not advance*, or a server claiming more without moving the cursor
  makes `jitpack import` spin for ever), is named once (`client/src/sync/pullProtocol.ts`) and both callers ask it. Its
  twin, §3's observe step, is asserted on the drain in `useSyncOutbox.spec.ts`. No new e2e id: both are rules below the
  screen, and a second paged-partition case would re-drive the loop E2E-SYNC-01 already drives.
* **E2E-M18-10** `local` (FR-18.4, ADR-030) — **implemented** (`e2e/backup-restore.spec.ts`): the same backup, restored
  **twice** onto one device, carrying all three document kinds — a group, a Ferien-Vorlage and a trip. The first run
  lands them and the restore list shows no *Schon vorhanden* mark; the second run marks **every** row before the button
  is pressed, raises the toast that counts what it left alone, and leaves **exactly one** trip, **one** group and
  **one** Vorlage, with no `(import)` suffix anywhere. The count is the point: an assertion that no second row appeared
  would be just as green against a restore that deleted the first. *(Mutation-proved: with the
  identity check reading an empty trip list, the second restore produces two rows and the case fails on that count.)*
* **E2E-M18-11** `local` (FR-18.4, ADR-030) — **implemented** (`e2e/backup-restore.spec.ts`): the **single-document**
  half of the same rule, which is a different branch of M18 — the merge preview, not the restore list. A device with one
  trip and no template backs itself up (one document by construction, so the year stays out of the fixture) and the file
  is pasted back on that same device: the preview carries the note **before** the button, *Import* opens the trip that
  was already there rather than a copy, the toast says so, and M2 still lists it once. *(Mutation-proved on
  `findExistingSubject`.)*
* **E2E-M18-12** `local` (FR-25.11j, NFR-4.11) — **implemented** (`e2e/backup-restore.spec.ts`): a backup gives back
  **where a row was bought from**. A BUY_BEFORE row is bought on M6, which moves it to the packing list (FR-3.3) and
  leaves `bought_from` as the only record M6's reveal can find it by; the device backs itself up and the file is
  restored onto a second, empty context. On the restored device the row is an open row on M4 **and** M6's bought bar
  counts it, the reveal names it with *on the packing list*, and it is on no open shopping row. The bar is the positive
  signal: a portable format carrying the mode and the count but not the record leaves the restored row on the packing
  list with the shopping side knowing nothing — neither an open row nor a bought one, and no bar at all.
  *(Mutation-proved: with `serializeTrip` writing no `bought_from`, the case fails on the bar.)*
* **E2E-M18-04** `all` (FR-18.5) — **implemented** (`e2e/backup-restore.spec.ts`): a newer `schema_version`
  shows a warning but imports best-effort — an unrecognised key and all — and a malformed file is refused **at this
  screen's own picker step**, with the parser's reason, no preview opened and the pasted text still in the field to
  correct. The picker **is** M18's first state, and the refusal happening here is the point — refusing somewhere else
  would leave nothing to fix. The parser's rules are exhaustively unit-covered (`domain/__tests__/portable.spec.ts`);
  this case is what renders either message, and a rule nobody paints is a rule the user never hears. *(Mutation-proved
  twice — `newerSchema` forced false, and the parse error's own string dropped.)*

### M19 — First-Launch Mode Selection
> M19 is the screen every other spec **bypasses**: `seedMode` writes `jitpack_mode` into localStorage before boot, so
> only the cases below *make* the choice this screen exists for. The two ids that describe the connect path are half
> unbuilt by decision, and the unbuilt half is the same clause twice.

* **E2E-M19-01** `local` (FR-19.1, NFR-4.11) — **implemented** (`smoke.spec.ts`): the two cards, and in the same
  case *"Just on this device"* lands on M1's empty
  state (G-7), the device asks the browser to keep what is now its only copy, and a reload does not ask again. The
  persistence request is asserted through a stubbed `navigator.storage` whose `persisted()` answers false, so the
  request is actually made and the case does not depend on whether *this* browser grants it. It happens on the boot
  after the choice rather than in the click handler — `connect()` asks, once the mode is persisted — which is what
  NFR-4.11's *"on first launch"* means in a client that re-inits by reloading.
* **E2E-M19-02** `server/single` (FR-19.1) — **the two destinations are covered; the validation in front of them is not
  built.** The `server` destination is asserted by `loginAs` (`e2e/server/fixtures.ts`) in every multi-identity case: no
  session + an instance that offers OIDC → the login screen, and through it the real broker. The `single` destination is
  **E2E-M19-02's own case** (`e2e/single/mode-discovery.spec.ts`) — it asserts the 501 from
  `/auth/config` beside the rendered dashboard, because "no login screen" is equally green on a device that never asked,
  and because invariant 5's whole Single-User distinction is that one response. ~~validates the URL against the health
  endpoint~~ — **not built**: `ModeSelectionPage.vue` validates the URL's *syntax* (parses, and `http:`/`https:`),
  stores it and reloads; nothing requests `/health`. **Struck by decision: the check is not buildable as specified.**
  The API sets no CORS headers, deliberately, so a cross-origin probe cannot tell an unreachable host from a reachable
  one that will not answer a scripted request — the promised
  inline error would lie to whoever's instance is healthy. That is a contradiction between two decisions, not a test
  gap, and no amount of test-writing resolves it. The app learns the truth at the login attempt, where the server
  answers for itself. The field arrives **pre-filled with the page's own origin**
  (E2E-M19-04), which is the correct answer for every self-hosted instance.
* **E2E-M19-03** ~~`local` (FR-19.1): unreachable server URL → inline error, stays on the screen.~~ — **struck by
  decision, together with E2E-M19-02's validation clause: there is no connectivity check and none is owed.** There is no
  connectivity check, so there is no failure to report: an unreachable URL is accepted, the app reloads into the shell,
  and the G-2 indicator says offline from there on. The inline error that *does* exist is the
  syntax one (`firstRun.serverUrlInvalid`), which is a different promise.
* **E2E-M19-04** `local` (FR-19.1) — **implemented** (`smoke.spec.ts`): the field carries the page's origin and Connect
  is reachable without typing. Asserted on the inner `button`, since `toBeEnabled()` on an `ion-button` host is
  false-green.
* **E2E-M19-05** `local` (FR-19.1, Sync-API §2) — **implemented** (`login-screen.spec.ts`): a `server`-mode device on
  the login screen whose `/auth/config` comes back as a gateway failure is told the server did not answer, is *not* told
  the server requires no login, and keeps the sign-in. The 501 is the only answer that means no login is needed; a
  bare `!resp.ok` check would read both non-answers as that flag. The default project is the fixture here — it runs no
  backend behind its preview, so the failure is real rather than routed. The second non-answer, a fetch that never
  lands, is a unit case in `LoginPage.spec.ts`: a preview server cannot be asked to produce a rejected fetch, and
  routing one would assert against the route.

### M20 — User Administration
* **E2E-M20-01** `server` (FR-23.2) — **implemented**, in `e2e/server/admin.spec.ts`. Avatar, name, e-mail, provisioning
  date (in the *app's* language), usage counts, admin chip and the "you" marker are each asserted. One clause the screen
  answers differently: there is **no „active" chip**. A row's
  status is the deactivated chip *or nothing*, plus the dimming UI-Spec M20 names under States — so ~~status chip
  (active / deactivated)~~ is one chip and an absence, and the case pins what exists. The deactivated half is asserted
  by E2E-M20-02 and E2E-M20-06. **The dimming is deliberately asserted nowhere**: it restates the chip in colour, and
  the only way to assert it in Playwright is a class or an opacity, which is an assertion about the stylesheet rather
  than about the pixel (G-14's lesson in reverse).
* **E2E-M20-02** `server` (FR-23.3) — **implemented**. The confirmation's four sentences, the deactivated
  chip, the target's *own screen* falling back to the login, and the way back. Two notes.
  **The clause *„no Deactivate on admins"* is proved on the one row that is admin *and* own**, because the fixture
  instance has exactly one admin, so which of the two exemptions fired is not separable on screen —
  `domain/__tests__/admin.spec.ts` separates them. And FR-23.3's other sentence — *„open JIT provisioning does not
  resurrect a deactivated account"* — is **E2E-M20-06**.
* **E2E-M20-07** `server` (FR-23.3, ADR-047) — **implemented** (U-10): a deactivation reaches the *other*
  screens of the same session. Alice opens the FR-4.5 sharing picker on a trip of her own and Dave is offered; she
  deactivates him on M20; she opens the same picker again and he is not. **Every step is in-app** — a `page.goto`
  reboots the document, and a rebooted app re-fetches the directory whatever the store does, so a navigating-by-URL
  version of this case cannot fail. Bob is the standing control: the roster renders its picker only while a candidate
  exists, so *„Dave is not offered"* alone would be satisfied by a control that disappeared.
  The directory is fetched once per session, not on every screen's mount, so freshness is what the four identity
  writers owe. This is the one of those four with a surface a person can see.
* **E2E-M20-03** `server` (FR-23.4): Remove avatar / **Reset display name** — the name half only, and that is what the
  case asserts (the row falls back to the account id, pinned beside the list still holding the same number of rows). The
  avatar half is **E2E-M20-03b**.
* **E2E-M20-03b** `server` (FR-23.4/23.4a) — **implemented**, in `e2e/server/admin.spec.ts`: a picture is put
  on Dave's account through the app's own `self`-guarded endpoint, M20's row shows it laid over his initials, and
  *Remove avatar* takes it away leaving *DA*. (The admin cases use an account no other file logs in as — see
  `e2e-tests.md`, *„Two files, one account, two workers"*.) **The removal must show on M20**: the row is keyed by user
  id, so without FR-17.13's cache-busting query (which M17 carries too) a reload hands the same `<img>` the same `src`
  and the browser never asks again, and the avatar response carries `max-age=3600` so it would not be told anything if
  it did. Red-proved against a line without the query. The upload does not go through M17's control on purpose: the
  crop modal renders into a canvas with no settled signal, and this case is about M20's row.
* **E2E-M20-04** `server` (FR-23.5/23.1) — **implemented**: the per-row sheet is the only place an action
  could hide, and its buttons are **counted**, so a fourth cannot arrive unnoticed.
* **E2E-M20-05** `server` (FR-23.1/G-8) — **implemented** for the half that can be red-proved: a non-admin
  OIDC account is offered no entry in M17 *and* is served `admin-unavailable` at `/admin`. The clause ~~hidden entirely
  in `single`/`local`~~ **is not coverage and cannot be made into any**: the gate is `collaborative
  && me?.is_instance_admin`, and in both of those projects there is no `me` at all — so deleting the `collaborative`
  half leaves the row just as hidden, and a case asserting the absence there would be green against the rule being gone
  (the tautology shape). It stays hidden by construction; the assertion that can fail is the one this case makes.
* **E2E-M20-06** `server` (FR-23.3/23.6) — **implemented**, in `e2e/server/admin.spec.ts`: a deactivated
  account signs in again through the real broker, and the screen **names the reason**. FR-23.6 keeps provisioning open,
  so the IdP goes on vouching for the account; FR-23.3's answer is that this does not bring it back, *„otherwise
  deactivation would be meaningless"*. The store proves the login does not clear `deactivated_at` and `issueSession`
  refuses the exchange; the screen must not answer with *„The server rejected the login."*, the same sentence a
  replayed code gets — a permanent state read as a glitch, and a person told nothing. The callback narrows on the
  `account_deactivated` code exactly as `client.ts` does, and the case asserts the sentence rather than the refusal — a
  regex matching the generic one would pass against a build without the narrowing.

### M21 — Vorlage aus Reise (new screen, §3.27)

The ids are read against the screen: none describes a removed surface and none sits on the wrong test. Two clauses
need a world that can fail them — `checked` needs a loose row's checkbox operated (E2E-M21-04), and the blast line
needs a trip that follows the group (E2E-M21-03c).

* **E2E-M21-01** `all` (FR-27.5): entry from the closing card at the top of M4 on an **archived** trip (an active trip
  shows no such card); the screen lists every recognised group with its on-trip item count and a "wird wiederverwendet"
  marker, and the loose ad-hoc rows (all pre-checked) under "Eigene Artikel".
* **E2E-M21-02** `all` (FR-27.5): a group with on-trip deviations names them ("Während der Reise ergänzt: Gimbal") and
  offers **Gruppe aktualisieren** (default) vs. **nur in diese Vorlage**; group positions absent from the trip are
  reported with the explicit "Gruppe bleibt unverändert" note. **The blast-radius line's own clause is E2E-M21-03c's**:
  this case asserts the note *visible*, and its world has no trip following the group, so the note can only say *„no
  trip follows it right now"* — a line that never counted anything would be green here. Where the note is checked is
  where a trip does follow.
* **E2E-M21-03** `all` (FR-27.5/27.1/27.4): creating with defaults yields a composed template that **references** the
  recognised groups (not copies), carries the checked loose rows as own positions, and — where *aktualisieren* was
  chosen — the deviation lands in the group itself. It does *not* surface as an applied change on the trips using that
  group: a group edit is **offered** (FR-27.4) at each trip that still follows it, and becomes an applied change only
  once that trip accepts — so what a still-planned trip shows afterwards is the proposal. Asserted as **E2E-M21-03c**.
  The "Als neue Gruppe speichern"
  toggle bundles the loose rows into a fresh group instead. **The word *checked* is asserted by E2E-M21-04**: this case
  and every other one in the unit leave the pre-checked state alone, so a create that simply took every loose row, or a
  checkbox wired to nothing, would be green here. The *own* branch of the deviation choice is deliberately **not** an
  e2e case: `planTemplateFromTrip` and `createTemplateFromTrip` both assert it (the group is left untouched, the
  deviation becomes an own position), and this
  case proves the choices object reaches the write.
* **E2E-M21-02b** `all` (FR-27.5): a group position the trip did not carry is *reported*
  with the "Gruppe bleibt unverändert" note and offers **no** choice — reported is not the same as offered.
* **E2E-M21-03c** `all` (FR-27.5/27.4): the reach the blast line promises, end to end — a trip
  generated from the group *after* it lost the position is offered that position back once M21 folds it in. The scenario
  order is load-bearing: generating both trips first makes the fold-back a net no-op and the case would assert a
  proposal nobody owes. **It also asserts the blast line itself** — *„1 trip will be asked"* before the
  fold — because this is the one world in the unit where the note's two branches differ (see E2E-M21-02).
  Mutation-proved: a `blastText` that always returns the *none* wording reddens this case and leaves M21-02 and M21-02b
  green.
* **E2E-M21-03b** `all` (FR-27.5): the "Als neue Gruppe speichern" half of M21-03, asserted
  where it shows — the new group is a second include on the resulting Vorlage, and the loose row is *not* an own
  position. A row bearing the group's name cannot carry *„a second include"* alone, since M8 renders an include and an
  own position as the same element — so the case also asserts the Vorlage has **no** own positions
  at all, which is what separates the two readings.
* **E2E-M21-04** `all` (FR-27.5): two loose rows, one unchecked before creating. The *„n von m"*
  head reads `1 of 2` afterwards — an assertion that could not have been true before the tap, since the case asserted `2
  of 2` first — and on the resulting Vorlage the checked row is an own position while the unchecked one is nowhere. Both
  directions, because the kept row is the positive control the dropped one is read against. Mutation-proved by passing
  every loose id to the write instead of the checked set: this case reddens, the other eight stay green.
* **E2E-M21-05** `all` (FR-27.5/FR-1.6): M21's name refusal, which UI-Spec M21 promises and which the view's unit spec
  cannot render — its orchestrator double returns *no collision* and so only ever paints the accepting branch. A name a
  Gruppe holds, differing only in capitals, renders the note naming the holder and disables *Vorlage erstellen*; a free
  name lifts both, which is what makes the disabled
  state a fact about the name. The bundle field is then held to **two** rules — the same taken rule, and the one that
  exists nowhere else in the app: the two names this one screen writes must differ from each other, refused with its own
  sentence because nothing holds that name yet. Mutation-proved twice, once per clause of `canCreate`.
* **E2E-M4-44** `all` (UI-Spec M4 / G-9, ADR-050): the trip is named **exactly once**, in the **page head**, and the
  width decides nothing; the app bar names no page. The case asserts the head at 390 px and again at 1280 px, that M4's
  header line does *not* repeat the name at either width, and that the name **resolves** to the display face — on the
  computed family, not on the class attribute, which would pass against a role that was never defined. It also walks
  to a sub-screen and back, where the head states „Shopping" over the trip's name on its second line.
* **E2E-M4-56** `all` (UX-9): item names form a straight column
  and the controls end in one — a checkbox row and a stepper row start their names at the same x and their `.row-lead`
  boxes have the same width, while their `.row-control` boxes have *different* widths and the same right edge. Both
  halves, because the lead column holds the names and the container edge holds the controls, and either assertion alone
  would pass on a row that had lost the other. Asserted on rendered bounding boxes with exact equality (no tolerance);
  the case first proves both control variants are
  actually on screen, so the equality cannot pass vacuously against a world of identical rows.
* **E2E-M4-68** `all` (FR-25.2): a packed row sinks to the end of its group once revealed —
  three rows, the middle one packed, and the revealed order is first, last, packed. The pack is proved by the row
  leaving the working list before anything is revealed, and the untouched middle row is what says the sink did not
  simply reorder the group. Rendered order, because the domain unit can only say what the view model holds.
  Mutation-proved: disabling the partition in `packingView` reddens it with the un-sunk order.
* **E2E-M4-69** `all` (FR-25.22) — **implemented** (`e2e/packing-list-sheet.spec.ts`): the reveal bar
  and the filter sheet's *Erledigte* switch label the same set, so they must read the same number. Two rows packed, the
  bar reads 2 and so does the switch; with a search for one of them the switch reads 1, not the trip's 2. Both
  count done rows passing the filter, not the trip's packed **units**. The bar is absent while a term is typed
  (FR-25.32), so the search does not separate the two through the bar; the searched row appearing is the positive
  signal that the narrowing landed before the switch is read.
* **E2E-M4-70** `all` (FR-21.17) — **implemented** (`e2e/packing-list-shape.spec.ts`): the G-9 page head
  yields to the list on a downward scroll, together with M4's own header line, and both come back on an upward one. Read
  as rendered height, not as a class alone: the standing head is measured first, so "gone" is a change rather than an
  element that never had a size. The bottom of the list is where the case earns its keep — the head's own collapse
  shortens the scrollable range, the browser clamps `scrollTop`, and that clamp reads as an upward scroll. The order
  matters and is written into the case: reaching the bottom with the head **already** down changes no height and stays
  green against the unguarded build. Heights are **polled** rather than read once — the collapse travels over a
  transition, and a single read lands on whatever frame it finds (mid-flight heights such as 28 px or 53 px). The rule
  itself also has a unit (`lib/__tests__/headScroll.spec.ts`), which is where the one-pixel tolerance around the bottom
  is pinned.
* **E2E-M4-71** `all` (FR-21.26) — **implemented**
  (`e2e/packing-list-shape.spec.ts`): on a 1280 px window the content column is narrower than the room it is given, a
  row sits inside it, and the width does not change when the reader steps to a sibling view of the trip (Luggage) or off
  the trip entirely (Settings) and back.
* **E2E-M4-72** `all` (FR-21.19) — **implemented** (`e2e/packing-list-shape.spec.ts`): a lone per-person
  instance — one traveler checked, so no cluster and the person folded into the label — starts its name at the same x as
  a plain row in the same list, and its lead column is the same width. Both are asserted, since a name that lines up by
  some other accident would pass the first alone. The case first proves the row *is* the lone-instance shape (no
  cluster, and the label still names the person), or the equality would be satisfied by a row that had simply lost its
  traveler. This is the lead column's third shape: E2E-M4-56 compares a checkbox row with a stepper row and the unit
  case uses `traveler: null`, so this is the case that tests the rule against the lone-instance row.
* **E2E-M4-73** `all` (FR-21.20) — **implemented** (`e2e/packing-list-shape.spec.ts`): a per-person
  cluster's head starts its name at the same x as a plain item row in the same list, and its travelers start theirs
  further right. Both halves, because the equality alone would pass on a build that had flattened the children with the
  head, and the step alone on one that had left the head inset. The cluster is proved to have more than one person under
  it first, or neither assertion is about a cluster at all.
* **E2E-M4-74** `all` (FR-21.22) — **implemented** (`e2e/packing-list-shape.spec.ts`): M4's reveal bar
  for the done rows wears a **solid** edge and carries `aria-expanded`, which flips with the rows it governs. Both,
  and in that order: the edge is the visible claim (a dashed outline is this app's mark for a place where something is
  *not yet*, and the bar counts rows that exist), and the attribute is what a reader who cannot see the caret is told
  instead. The case ends by revealing the row it counted, so a bar that had merely stopped being dashed would not pass.
  It reads the label whole (*„Show 1 done"*), which is also where the **singular** case of FR-25.2's bar is
  asserted — E2E-M4-145 has the plural, and the German pair is a unit case (`i18n.spec.ts`), since the suite runs in
  English.
* **E2E-M4-75** `all` (FR-21.23) — **implemented** (`e2e/packing-list-shape.spec.ts`): the header line's
  ring, sentence and track are read before and after one row of four is packed — 0 %, *0/4*, a track of zero width, then
  25 %, *1/4*, and a track a quarter of its own container. All three against the same pack, because the point of the
  figure is that they cannot disagree; the track is asserted as a **ratio** of two rendered boxes, so the case states
  neither a viewport nor a rounding — a pixel string goes red on WebKit at 19.0625 px against a `clientWidth` rounded
  to 19.
* **E2E-M4-76** `all` (FR-21.24) — **implemented** (`e2e/packing-list-shape.spec.ts`): the composer is
  offered once. The collapsed pill is absent **and** the composer is closed, then the FAB opens it — the absence alone
  would stay green on a screen that had lost both doors, which is the failure the case is guarding against.
* **E2E-M4-77** `all` (FR-24.2) — **implemented** (`e2e/packing-list-shape.spec.ts`): a row generated
  from a group is filed under the master item's primary tag. An item tagged in M9, added as a position, followed into a
  trip — M4's default grouping heads it with the tag, while an untagged position beside it stays in the leftover bucket.
  That second row is the positive signal: one heading for everything would satisfy the first assertion on its own, and
  the bucket is also where the whole list would fall without the tag.
* **E2E-M4-57** `all` (G-12/UX-13): the bar keeps *Suchen*, *Filter* and
  *Zuklappen* and carries the rest behind the ⋮, which **names** packing's entries in words — *Luggage*, *Analytics*,
  *Finish packing* — and not the trip-wide ones (*Trip properties*, *Start trip*: M2's, E2E-M2-34).
  Picking *„Luggage"* lands on the rendered M11, reached by role as well as by id. The last step is what separates the
  menu from a decoration: an entry that opens nothing would satisfy every assertion above it.
* **E2E-M4-45** `all` (UI-Spec M4 / ADR-012's overlay, ADR-046): M4
  scrolled mid-list, an item opened and closed again — the list is at the same offset **and** the header line is still
  folded, which is the other half of the position. Asserted on the rendered scroll offset of `ion-content`, never on the
  URL, and read once the sheet is gone: the list's page is never replaced — `?item=` is a state of it — so there is no
  restore and no signal to wait on. The row it opens is chosen for being wholly
  inside the content's box: Playwright scrolls whatever it is told to click into view, and a row sitting under the app
  bar is on the page without being on screen — asking for that one scrolls the list back to the top on WebKit and makes
  the case measure nothing. Runs with motion reduced, deliberately: the header's max-height transition also
  changes the height of the scrolled content, so with it animating the screen spends a few hundred ms in a layout
  nothing can measure, and the app honours the preference itself. Mutation-proved — a remount on open reddens it on
  WebKit.
* **E2E-M4-58** `all` (FR-25.8) — **implemented** (`e2e/membership.spec.ts`, with E2E-M4-12): a
  quick-add for two of three travelers, then stepped to different amounts on M5's amount lines, produces **one** cluster
  with two children at `0/2` and `0/3`, not two items sharing a name. The ad-hoc rows have no `source_item_id`, so this
  is the case that proves the folded-name cluster key — for the add and for M5's strip, which finds its siblings by the
  same key.
* **E2E-M4-64** `all` (FR-25.28/G-8) — **implemented** (`e2e/membership.spec.ts`): on a trip with a
  single traveler the quick-add's for-whom strip is **absent**, not disabled — there is no membership to distribute, and
  a control that can only say one thing is worse than no control. The composer itself is asserted present in the same
  breath, so „absent“ cannot be satisfied by a composer that failed to open. The same case holds the list's half
  (FR-25.28): a row added on that solo trip carries **no for-whom seat**.
* ~~**E2E-M4-65** `all` (FR-25.8/FR-25.13d): a *Pro Person* add made from the browse-sheet closes the sheet before the
  membership editor opens.~~ **Retired with the promise it held** (FR-25.28): no editor follows an add, so there is
  nothing for the sheet to make way for. The opposite rule is **E2E-M4-102**.
* **E2E-M4-102** `local` (FR-25.28, in place of the retired E2E-M4-65) — **implemented**
  (`e2e/membership.spec.ts`): a browse-sheet add is **deaf to the composer's strip** and the sheet **stays up**. With a
  traveler lit in the strip, a plain add from the sheet writes a **shared** row: the sheet's lines answer *for whom*
  themselves (FR-25.13g/h), and a tap there that obeyed a control the sheet is covering would be a decision nobody can
  see being made. The visible shared row is the positive signal; the absent *„· Andy"* and the absent cluster are read
  against it.
* **E2E-M4-46** `all` (FR-25.13c) — **implemented** (`e2e/packing-list.spec.ts`): what the trip
  already carries is not suggested again. The chip/suggestion rule itself is E2E-M8-21's; this case pins only M4's
  **wiring** — the trip passing its contents into `excludeItemIds`, which no shared-component test can see dropped. The
  absent suggestion's positive signal is the free-text hint, rendered exactly when nothing is offered. Mutation-proved —
  dropping the prop reddens it.
* **E2E-M4-47** `all` (FR-25.13d) — **implemented** (`e2e/packing-list.spec.ts`): like E2E-M4-46, a
  wiring case — the trip's contents reach the browse-sheet as the *„schon drin"* state (the carried row is asserted by
  name), and a sheet tap lands as a trip row after the sheet closes. The row is added via the suggestion first, so it
  carries the master-item provenance the carried state matches on.
* **E2E-M4-59** `all` (FR-25.13e) — **implemented** (`e2e/packing-list.spec.ts`): the browse-sheet's
  *„schon drin ausblenden“* switch. The count line reads the carried number and flips to the hidden one, the carried row
  leaves the list — and the assertion the case exists for is the **positive** one: a row tapped while the switch is on
  is **still on screen**, marked *hinzugefügt*, with the count unchanged. Re-opening the sheet is asserted as its own
  pass: the previous run's add is hidden with the rest and the count has grown, which is what makes the per-opening
  snapshot visible rather than merely written down.
* **E2E-M4-60/61/62/63** `all` (FR-25.13f) — **implemented** (`e2e/packing-list.spec.ts`): the
  browse-sheet's two one-tap verbs. **60** ✓ on a free line adds the row *already packed* — asserted on M4 afterwards,
  not only on the line, because a line that says „packed" over a row that landed open is exactly the half-write the
  single-mutation rule forbids. **61** ✕ on a free line lands the row as FR-5.5 *skipped*, revealed and named as a
  decision rather than as a forgotten row. **62** the verbs reach a line the trip already carries — a second pass over
  the same inventory packs it without the sheet closing. **63** the line's own *„Rückgängig"* takes the whole write
  back: the line is an offer again and no row is left behind, on the working list
  or behind the reveal bar.
* **E2E-M4-78/79** `all` (FR-25.13g) — **implemented** (`e2e/membership.spec.ts`): the browse-sheet's third verb, 👥 *für
  alle*. **78** one tap on a free line with TRIP's three travelers — the boundary FR-25.13h also uses — so the write is
  the same one an
  avatar tap makes: the sheet is **still visible**, no membership editor was presented over it (the run posture, which
  is E2E-M4-65's rule the other way round), the line reports who it reached by name in roster order, and every avatar
  it just selected stays visible and selected — a bare count, or an `acted` line with no avatars left to deselect, is
  the defect (FR-25.13h's addendum note). After the sheet closes M4 renders the
  item as **one** cluster with a child per traveler — three rows sharing a name is the shape FR-25.8 forbids. **79**
  the same verb on a **carried** line, which has no avatar buttons and keeps FR-25.13g's bulk shape: the
  sheet is closed and reopened first, because within one run a line the run itself added offers the way back and
  nothing else, and afterwards the shared row is gone *as a row of its own* — it became one of the three (ADR-036)
  rather than being left beside them.
* **E2E-M4-80/81** `all` (FR-25.13h) —
  **implemented** (`e2e/membership.spec.ts`): assigning a free line to one or more named travelers instead of
  everybody, multi-select in both shapes. **80** at three travelers (the boundary), an avatar button per traveler
  sits beside 👥; tapping one writes the row assigned to exactly that traveler and the row stays `browse-row-free`
  rather than moving to `carried`, a second avatar joins the same row instead of starting a second one (asserted as
  *„Leonardo, Mia"*), and tapping the first again removes just that traveler, leaving one — after closing the sheet
  M4 renders **one** row rather than a cluster, the shape that tells this apart from FR-25.13g's spread. 👥 itself is
  asserted present and unchanged throughout. **81** at four travelers the line keeps FR-25.13g's shape with no
  avatar buttons, and a `contextmenu` dispatch on 👥 (the same seam E2E-M7-04 drives, standing in for a real long
  press per `useLongPress`) opens a menu naming each traveler; picking one writes the assignment, a second
  long-press-and-pick adds a second traveler to the same row (asserted as *„Theo, Mia"*), and a plain tap on 👥 on a
  second line still means *für alle*, unconditionally.
* **E2E-M4-83/84** `all` (FR-25.13i) — **implemented** (`e2e/packing-list.spec.ts`): the settled
  line's way back, and the filter that finds it. **83** is written **across a close and a reopen** on purpose: that is
  the boundary FR-25.13f's line-local *„Rückgängig"* cannot cross, and the whole reason the settled line needed a
  control of its own. An item skipped from the sheet is reopened as a settled line that states *„staying home"*, shows
  **no** `browse-undo` (the positive signal that the run's ledger really did die with the modal) and carries
  *„zurücksetzen"*; one tap turns it into an ordinary carried line with both verbs back, and on M4 afterwards the row
  is on the **working list**, not behind the reveal bar and not reading as skipped — which is what separates a reset
  from a line that merely stopped saying it. **84** packs one item and skips another, reopens, and asserts the count
  (*„2 decided"*), that the filter leaves the *undecided* line out, and that FR-25.13e's switch is gone while it is on;
  resetting both leaves **both lines in place** reading *„schon drin"* — the snapshot rule, without which the first
  reset would reflow the second row into the finger — with the live count at *„0 decided"*, switching the filter off
  brings the undecided line back, and M4 reads `0/2` with both rows present: two resets, both landed, neither
  restoring a state the other wrote. The *„nothing decided here"* sentence is reached by the tag axis instead and is
  pinned in the component's unit tests, there being no tagged inventory in this case.
* **E2E-M4-82** `all` (FR-25.23) — **implemented** (`e2e/membership.spec.ts`): the cluster fold. A
  per-person item with Andy 2 and Leonardo 3 renders **shut**: `aria-expanded="false"`, neither child row present, and
  the head answering for both of them — two faces in roster order (asserted by their `aria-label`, since a face shows
  initials) and „5 offen", the open count in **units** (FR-25.22). Tapping opens it: the children appear with their own
  `0/2` and `0/3`, the faces leave the head and the head returns to `0/5` — the positive signal that nothing states the
  same thing twice. Tapping again shuts it, because a one-way control is a reveal and not a fold.

  **Both halves are asserted in one case on purpose:** either one alone is what a half-built fold looks like —
  children gone with nothing in their place, or a head summarising rows it never hid. And it is an e2e case rather
  than a unit because the fold is state on the *screen*: `ClusterHead` renders whatever `collapsed` it is handed, and
  a unit of it cannot tell whether M4 hands back the value its own click asked for.

  **The suite around it opens the cluster first.** Every case that reaches for a `m4-child-…` row opens it through
  `openCluster` in `e2e/helpers/m4.ts`, and cases that read `done/total` read it open. No Vitest unit operates a child
  row, so this case is what goes red when the children are hidden.
* **E2E-M4-48** `all` (FR-28.4/FR-25.1) — **implemented** (`e2e/item-mark.spec.ts`): a per-person
  position generated for two travelers renders as one cluster, and the **cluster head** — the line that names the item
  once — carries the item's mark (the same `packing` ladder as a single row); the traveler children carry none. Without
  it 🧥 would leave the list exactly when the jacket belongs to three people.
* **E2E-M4-49** `all` (G-3) — **implemented** (`e2e/lock-claim.spec.ts`): claiming a row says so **on
  the row**, and releasing it takes that back. The note matters precisely because my own claim locks nothing for me: the
  one device that cannot see the padlock is the one holding it. The release is asserted by the note disappearing *and*
  the row still being there — a note that vanishes with its row would satisfy the first alone. Mutation-proved.
* **E2E-M4-50** `all` (G-3) — **implemented**: a claimed row's menu offers the release **and nothing
  that contradicts it** — asserted as a count as well as by name, so a third option added later is not silent. Skipping
  a row you are mid-way through packing is the option this excludes.
* **E2E-M4-51** `all` (FR-9.3) — **implemented** (`e2e/closing-pass.spec.ts`): a row is marked
  *ungenutzt* from its press-and-hold menu, the row shows the mark, and the same entry — now reading *Ungenutzt
  aufheben* — takes it back. Both halves are asserted, because a judgement that cannot be revoked is a stamp, and FR-9.1
  promised a judgement.
* **E2E-M4-52** `all` (FR-9.3) — **implemented**: the *unused* window stays open on the **archived**
  trip, where M14 runs — and *missing* does not, because it is stamped by the quick-add and a thing bought afterwards
  was never missing. The negative half is asserted on the M5 control an active trip shows beside it, so "no control at
  all" cannot pass for it.
* **E2E-M4-53** `all` (FR-9.3) — **implemented**: *Reise abschliessen* opens the pass and archives
  **nothing** until it is finished; cancelling leaves the trip active. The positive signal is the archived trip's own
  closing card being absent *and* the archive action still on offer — a pass that quietly archived would satisfy
  neither.
* **E2E-M4-54** `all` (FR-9.3) — **implemented**: the pass lists what was **packed** — a never-packed
  row and an FR-5.5-skipped row are both absent — one tap marks, and *Fertig* archives and lands on M14. The mark is
  read back **on the row afterwards**, not from the control that made it: the control's own state would prove nothing
  about what was written.
* **E2E-M4-55** `all` (FR-9.3) — **implemented**: inside the pass the row's press-and-hold is inert
  and the tap does not open M5. It carries its own **positive control** — the same gesture, on the same row, opening the
  menu one moment earlier — because "no action sheet appeared" is otherwise true of a broken list as well as of a quiet
  one. The control runs *before* the row is packed: a packed row leaves the list (FR-25.2), and a gesture asserted
  against a row that is not there is a different fact.
* **E2E-M4-43** `all` (FR-27.5 prerequisite): a planning trip offers *Reise starten* and no archive
  action; starting it swaps the pair; archiving leads to the closing card. The step exists because M21 — and the
  positive M12/M14 cases — need an archived trip, and this is the path that produces one.

### M22 — Trip properties (new screen, FR-2.7)

Every id below is implemented and read against the screen. The trip's series is edited on M16, not here (see
below, and UI-Spec M22).

* **E2E-M22-01** `all` (FR-2.7): M4's G-12 cluster opens the editor, and a new name commits on blur and comes back
  through the store — asserted on the repainted M4, never on the URL. It also sets the (G-17, ADR-035)
  start date through the `DateField` picker and asserts the locale display (`Oct 3, 2026`) both optimistically and after
  a round trip back through M4.
* **E2E-M22-02** `all` (FR-2.7, FR-27.4): a traveller added to an existing trip extends the
  per-person positions **immediately**, and the screen reports what it did. The report is also the settled state the
  case waits on, so no clock is involved. The report is asserted as the sentence, not the digit `1` — which is
  equally true of *„1 item removed"* — so the screen cannot report the wrong half of FR-27.4's outcome.
* **E2E-M22-03** `all` (FR-2.7/FR-25.1): a traveller removed takes **their** row and never a sibling's. Three things
  this case needs in order to be able to fail, each learned by watching it pass when it should not have: the surviving
  row is **part**-packed rather than packed, because a fully packed row leaves the list through the FR-25.2 pack-out and
  takes the signal with it; its `1/2` is asserted *after* the removal, because a count and a name also pass against a
  removal that took both rows and a re-resolution that generated one back; and the case waits on the roster losing the
  row before it navigates, because navigating first races the removal and fails against correct code. Mutation-proved
  — detaching by position instead of by traveller reddens it.
* **E2E-M22-05** `all` (FR-2.7): a traveller whose own row is part-packed is removed **with** it — the confirmation
  offers the choice, states how many rows it concerns, and *Alles entfernen* deletes rather than unassigns. The
  sibling's untouched share stays hers, which is what proves the choice widens *what* leaves and not *whose* rows are
  considered. *„Deletes rather than unassigns"* is asserted as the number of Regenhose rows left: an unassigned row
  carries neither Zoe's name nor a child test id, so it satisfies *„Zoe's row is not there"* just as well.
* **E2E-M22-06** `all` (UI-Spec M22 / G-9/G-12, in `global-nav.spec.ts`): reaching the editor from the trip's menu —
  M2's row menu (G-12) — and getting the trip back from its chevron. It lives with the global patterns rather than in
  the M22 unit because the navigation defects it guards are global ones — a route that changes without repainting, and
  a back that leaves the previous screen on the display. Asserted on the painted page, and the return is checked against
  M4's own actions rather than against the absence of the editor alone. The return also asserts that the page head names
  the trip at every width (ADR-050).
* **E2E-M22-04** `all` (FR-2.7): a trip that has started keeps its roster and offers **no** removal control — the ✕ is
  gone, the reason is rendered under the list, and adding still works — not an `aria-disabled` control left on screen
  (see UI-Spec M22). Two traps this case pays for: the absence of an ability needs a positive signal, which is the note;
  and `[data-testid^="traveler-remove-"]` also matches `traveler-remove-note`, so a prefix locator counts the
  explanation as a button and can never reach zero — the locator is scoped to `ion-button`.
* **E2E-M22-08** `all` (FR-2.7): after an edit the trip is **still on M2**. The editor writes a partial upsert on
  purpose (field-level merge), but the optimistic row it applies locally replaces the whole row — so a save that drops
  `status` takes the trip off *every* M2 segment (M2 lists by status), with no pull in Local Mode to bring it back.
  Asserted on M2's planned list rather than on the trip screen, which the defect leaves looking perfectly correct.
  Mutation-proved.
* **E2E-M22-09** `all` (FR-9.4): a bottom toast is presented **above** the tab bar, asserted as
  geometry — the toast's bottom edge against the bar's top edge — because the question a screenshot cannot answer is
  whether a live overlay is covered or merely translucent. Two guards make the comparison mean something: the viewport
  is set to a phone (above 900 px G-9 hides the bar, and a `display: none` element measures as a zero-height box at the
  origin, against which every overlap assertion resolves in both directions), and both boxes are asserted to have height
  before they are compared.
* **E2E-M22-07** `all` (FR-2.7): the positive half — a **planning** trip renders one ✕ per traveller and no note.
  Without it, "no ✕ on a started trip" would pass just as well against a screen that never renders one at all.
* **E2E-M22-10** `all` (FR-2.7/FR-27.4): the archived trip's editor. UI-Spec M22's *States* line promises that *„on an
  archived one the whole screen is read-only"*; `TripEditPage.spec.ts` pins the two `DateField`s, and this case covers
  the name, the roster inputs and the add row. All four are asserted, against a roster that is demonstrably rendered so
  the absences are not read off a screen that failed to load. **Open decision:** `traveler-remove-note` is gated on the
  trip *not* having started, so an archived trip loses the ✕, the add row **and** the sentence together — nothing on the
  screen says why it answers no tap, the shape E2E-M22-04 rules out for the started trip. Build a sentence for the
  archived state, or accept the silence; the case asserts today's absence and is what has to change either way.
  Mutation-proved by dropping the name field's `readonly` binding.
* **E2E-M22-12** `all` (FR-2.1b/FR-2.7): the year is corrected on M22 and the trip moves in M2's
  list. Read back through the **list**, not through the field: a select repainting its own value satisfies an assertion
  on itself, and placing the trip is the year's whole job. Then re-opened from M2, because a value that only lives in
  the form's ref reads identically until something reloads. Red-proved by dropping the mutation.
* **E2E-M22-11** `all` (FR-2.7): the third roster affordance. UI-Spec M22 names *rename in place*,
  ＋ and ✕ per row; ＋ and ✕ have their own cases and this one operates the rename. What it
  asserts is the rule underneath rather than the new string: a rename is a rename, never a removal plus an addition, so
  the renamed traveller's **part-packed** share is still there with its `1/2` after a reload, and there are still two
  shares rather than three. The composable pins that on the mutation; the screen's blur handler reads the value off the
  Ionic host and no unit test sees it.

* **E2E-M22-13** `server` (FR-2.5, ADR-058): the roster's account picker. It has to be a
  multi-identity case rather than an `all` one: the picker offers `trip_members` and a trip with a single member
  renders no control, so `local` and `single` can only assert its absence — which `TripEditPage.spec.ts` does, beside
  the membership filter, both cheaper as rows than as a second browser. Alice shares the trip with Bob, records the
  traveller as Bob's account, and the value survives a **reload**: the write is optimistic like every other row edit,
  so the value standing straight after the tap says only that the screen painted it. Asserted on
  `ion-select .select-text`, the rendered value — an `ion-select`'s own text content is its whole option list, which
  stays green against a link the server refused (see the ledger's section on it).
  Red-proved by linking a non-member: `not_a_trip_member`, rolled back, the select back to *„Kein Konto"*.

* **E2E-M22-14** `server` (FR-2.5): the *add* row's account picker. A second
  case rather than a clause on E2E-M22-13, because it drives a different write: the traveller does not exist yet, so
  the account has to survive being created with them. Alice picks Bob before typing the name, presses ＋, and the new
  row reads Bob's name after a **reload**. It also asserts the picker returning to *„Kein Konto"* — a sticky value
  would silently make the next person the same account. What it cannot see is the ordering the write depends on (the
  link is a second mutation *after* FR-27.4's rows, so the account is not notified once per generated row); that is
  asserted on the queued mutations in `tripLifecycle.seam.spec.ts`, because the only browser-visible symptom would be
  a notification count on a third device.

**Two fields at the edge of M22's scope** (read against the template):

* **The trip's year is edited here.** FR-2.1b makes the year the one required temporal fact and `TripEdit` carries it;
  FR-2.7's own scope is *name, dates and travellers*, so the field is UI-Spec M22's addition rather than the PRD's.
  E2E-M22-12 asserts it.
* **The series a trip belongs to is edited on M16, not here.** `setTripSeries` has exactly one caller and it is
  `SeriesPage.vue`, whose *detach/attach trips* action UI-Spec M16 describes. Coverage of the attach/detach path is
  M16's question.

**One deterministic seam in the unit:** every `page.goto` in `trip-properties.spec.ts` waits on the G-2 indicator
returning to *on this device* first. A case that fills, blurs and navigates otherwise fails under load against
**correct code** — the reload discards the optimistic store, and the trip is on no M2 segment because the rename has
not reached IndexedDB yet. The screen's own repaint is not that signal: it is satisfied by the optimistic row alone.
The same shape as E2E-M22-03's note, in the other five cases that reload after a write.

---

### M25 — Aufgaben (a trip's tasks, FR-7.7)

The screen that holds every task of a trip, in the two phases a trip has. Three ids below **live here, not on M4**:
their promise is M4's original one, made by this screen, so the M4 entries are struck in place and say where each
went.

* **E2E-M25-01** `local` (FR-7.7, was E2E-M4-96) — **implemented** (`trip-tasks.spec.ts`): the trip's own tasks are
  written, ticked, reopened and removed here, each state read back **after a reload** because a list that only repaints
  proves the component and not the write. What the id gained with the move is the phase: a task written into *Während
  der Reise* stands in that section and **not** in the other one — a task in both would be a task filed twice, which is
  the defect „one list, two windows" exists to prevent. The one composer's phase chip decides the section (FR-7.14),
  and the removal is made from the task's sheet. The removal keeps the other section's task as its positive signal, and
  waits for the snackbar to lapse before reloading, since that is when the delete is written (FR-25.31). The rest line:
  with its one task done, *Vor der Reise* is the line *„Before the trip · nothing open · 1
  done"* at the end, which opens onto the task directly; unticked, the phase is back in its place and the line gone.
* **E2E-M25-02** `local` (FR-7.7/FR-25.2, was E2E-M4-105) — **implemented** (`trip-tasks.spec.ts`): ticking a task off
  offers the snackbar's undo, like a pack. The tick makes the task leave the open list, so the mistap has no evidence
  left to tap again; the undo brings it back and the reopened state is read after a reload. The *„N erledigt"* fold is
  asserted **absent** afterwards, which is the positive signal that the undo reached the store rather than the paint.
* **E2E-M25-03** `local` (FR-7.5/G-8, was E2E-M4-134) — **implemented** (`trip-tasks.spec.ts`): Local Mode has nobody
  to hand a task to, so the task carries no seat **and** the screen offers no *Meine* chip — absent, not an empty
  picker over an empty list. The task's grip is the positive signal beside the two absences; the seat itself is
  E2E-M25-05's. The row carries no ✕ either (FR-7.14), and the case asserts that absence too.
* **E2E-M25-07** `local` (FR-7.8) — **implemented** (`trip-tasks.spec.ts`): a task is tagged from
  its own sheet, and the heading it lands under appears with it. The tag is **created** rather than picked, because
  that is the first run every instance has: the list starts empty, and a word that is not in it is the next tag. The
  grouping is read back after a reload — a heading that only repainted proves the component and not the write — and
  the tag is then taken off again — by the ✕ on the chosen chip in M6's search-or-create mask,
  whose summary line first reads *„Filed under: Apotheke"* — which puts the task back under *Ohne Tag* and takes the
  now-empty heading away with it.
* **E2E-M25-08** `local` (FR-7.8) — **implemented** (`trip-tasks.spec.ts`): the
  drag. A task is lifted by its grip, carried into another tag's group and let go. Three clauses, each a way the
  gesture fails on its own: **`data-drag` is the signal** and the case waits for `idle`, which arrives only once the
  write has resolved — waiting on the animation is what E2E-M4-135 paid for; **the group under the pointer says so**
  while the task is in the air, or the drop is made blind; and **the list's scroll position is read before the lift
  and after it**, because a list that grew a drop target under the finger would have shifted every row below it
  (ADR-060). Run in both browsers. Also asserts the travelling clone's border, which comes from
  `composables/dragToGroup.css`, shared with M6's.
* **E2E-M25-09** `local` (FR-7.8) — **implemented** (`trip-tasks.spec.ts`): a heading that would
  not be true of the task in hand neither lights up nor takes it — *Aus Packliste* under a chore of the trip. The
  refusal is asserted with its positive half beside it: the gesture still reaches `idle`, because a refused drop is
  not a hung one, and the task is still where it was.
* **E2E-M25-12** `local` (FR-7.8/ADR-075) — **implemented** (`trip-tasks.spec.ts`): several tasks in
  one act, M6's selection on M25. **A hold selects and does not lift** — the right-click is the hold's deterministic
  twin, and `data-drag` staying `idle` is the positive signal that nothing was picked up; the grip and the composer step
  aside while choosing (the one composer stays in place, `inert`, G-20). *„Alle N"* takes both tasks, the batch sheet
  creates a tag, and both then stand under its heading while the mode has ended. A second selection sends both to
  *Während der Reise*, read back after a reload. The second round is not decoration: it guards `SheetModal`'s
  moved-modal insert failure (implementation log).
* **E2E-M25-13** `local` (FR-7.11/FR-7.14) — **implemented** (`trip-tasks.spec.ts`): a due
  day. It is set on the task's own sheet through the calendar behind *Datum…*, and the sheet stays up with the day as
  its chip. On the list the line wears *Tomorrow* (the *soon* state) and the undated task wears nothing; the
  dated task stands in the *Fällig* block and **not** in its section — read back after a reload, since a line that
  only repainted proves the component. Then Local Mode's stand-in for the push: with the trip running, a fresh load of
  M1 says *„1 task due"* once. The server's reminder itself is not driven here — its time is a wall clock — and is held
  by `TestRemindDueTasks_FR7_11_OnceADayFromTheConfiguredTime` against an injected one.
* **E2E-M25-14** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): a task is filed as it is
  typed. The composer on top takes the words and *Heute*; *＋ Tag* then opens **M6's entry sheet**,
  titled *New task*, which carries the words and the day typed so far, creates the tag through the search-or-create mask
  (its summary says *„Filed under: Apotheke"*) and adds; the task lands with all three: it stands in the *Fällig* block
  wearing *Today* and its tag's name, it is not in its section, and the tag's group is not drawn because nothing else is
  in it. The tag stays chosen for the next task and the day does not. Read back after a reload; then the FAB focuses the
  field.
* **E2E-M25-15** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): the sheet's first two
  acts. A task's words are corrected in the sheet's title field, Enter commits, the list shows the new words and the
  snackbar's undo brings the old ones back; corrected again, the words survive a reload. *Erledigt* then finishes the
  task, the sheet closes, and the task is in its phase's one *erledigt* fold.
* **E2E-M25-16** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): the selection's own
  acts. Two tasks are dated *Morgen* from the bar's *Fällig* sheet and both lead the screen; selected again from the
  *Fällig* block they are ticked off with the bar's *Erledigt*, which empties the block, and both are in the fold. A
  third is deleted with *Löschen* and the one undo brings it back — read after a reload.
* **E2E-M25-17** `local` (FR-7.14) — **implemented** (`trip-tasks.spec.ts`): a trip whose first
  day was two days ago. The composer is on screen and names no phase; a task typed there lands under *Während der
  Reise*, and after a reload it is still there and not under *Vor der Reise*.
* ~~**E2E-M25-10**~~ `local` (FR-7.9) — **moved to E2E-M26-01** (FR-7.13): the notes are a view of
  their own; the write, the sheet's `tel:` rule and the delete are asserted there.
* ~~**E2E-M25-11**~~ `server` (FR-7.9) — **moved to E2E-M26-03** (FR-7.13): "new for another member", the
  count and the sheet naming the ticker are asserted on M26, the count on the notes pill.

* **E2E-M25-06** `local` (FR-25.31 with FR-7.7, was E2E-M4-124) — **implemented** (`e2e/undo-every-act.spec.ts`): a task
  removed (from its sheet, FR-7.14) leaves the list and its undo brings it back; removed again and left alone, it
  is gone after a reload once the snackbar has gone — the lapse is the delete. **The snackbar's disappearance is the
  signal waited on**, because the lapse changes nothing on screen, and the composer's field is asserted after the reload
  as the positive half: without it, „the task is gone" is also what an empty screen says.
* **E2E-M25-05** `server` (FR-7.5/FR-7.7, was E2E-M4-133) — **implemented** (`e2e/server/multi-user.spec.ts`): a
  task's empty seat opens the row's picker, which offers the current user as well — the one difference from a row's —
  and picking the other account fills the seat with them. That account is told (the toast names the task and who
  handed it over), sees itself on the task on its own open screen without a reload, and finds its name after the task
  on M1's *Aufgaben* card. Both halves happen on M25, which is where the trip's own tasks are worked.
* **E2E-M25-04** `local` (FR-7.7) — **implemented** (`trip-tasks.spec.ts`): the salve. A preparation
  that will not happen before departure is moved to *Während der Reise* from the task's own sheet, and the move is
  what takes it **off the packing list** — the consequence that makes a stored phase worth its column. Both halves are
  asserted on both screens, because either alone is green on a build that moved the task in one list and copied it in
  the other. The sheet's own promise rides along: it names the row the task prepares and who wrote it, which is what
  the line has no room for. The undo is asserted too, and it returns the task to M4's window rather than to „no phase
  at all".

### M26 — Notizen (a trip's notes as threads, FR-7.13)

* **E2E-M26-01** `local` (FR-7.13) — **implemented**
  (`trip-notes.spec.ts`): the notes are a view of their own. M25 is asserted one list with no segment, on a rendered
  screen; the notes pill leads to M26, marked current, with its empty state. Two notes written from the FAB's sheet: a
  quick one is named by its first line and a titled one by its title, the newer first, and **each card shows its words**
  — the titled one's in full, the quick one's after its first line. The writer's own threads carry no checkbox (FR-7.9
  decision 4, and G-8's Local Mode). The titled thread's view makes *4711* a code chip; the quick one's links its spaced
  phone number as `tel:` with the digits alone as the href. Deleting that first note from its menu leaves its view for
  the list, and after a reload the other thread is still there.
* **E2E-M26-02** `local` (FR-7.13) — **implemented**
  (`trip-notes.spec.ts`): a thread reads top to bottom on one writer. Two replies sent from the bottom field land in the
  order written, **under** the first note; the view offers exactly one reply field (one level). The author's *Edit*,
  from the first note's menu, edits title and words in place. Back on the list the thread has moved above a newer one
  (question 1), says *2 replies* and quotes the newest reply; after a reload it is named by the new title and the entry
  says *edited*. Deleting the first note names its two replies on the menu's button and, after a reload, takes them.
* **E2E-M26-03** `server` (FR-7.9/FR-7.13, was E2E-M25-11) — **implemented**
  (`server/trip-notes.spec.ts`): a thread is new for a second member — marked *New* on the card and counted *1* on the
  notes pill's badge — and never new, nor offered *Read*, on its writer's screen (decision 4). *Read* in the thread
  clears itself, the mark and the badge; the thread's first note then says *Seen by* the reader, and only the reader
  (decision 3). A third reader's "new" surviving a second reader's tick is `noteThreads`'s unit coverage and
  `TestStampActor_NoteAckUpsertCannotStealAnotherUsersRow`, both reading only the acting reader's own row.
* **E2E-M26-04** `server` (FR-7.13) — **implemented**
  (`server/trip-notes.spec.ts`): Bob reads Alice's thread; its first note's menu offers him *Copy* and no *Edit*, his
  own reply's offers *Edit* (question 2). Alice sees his reply as new in her own thread, answers, and is offered no
  *Read* — replying is not ticking, but what she answered is behind her. Bob's pill then counts *1*, his thread is *New*
  again, the entries read *Code 4711*, *Danke!*, *Parkplatz 12* top to bottom, exactly one of them — Alice's newer reply
  — carries the unseen mark, and the divider *New since your last visit* stands right above it (question 3's rule,
  applied to a reply). Who a reply *notifies* is `TestPlanNotifications_NoteReply_ReachesTheParticipantsOnly_FR7_13`'s,
  a rule over participants a browser cannot see.

## 5. Cross-Screen Flow Tests

These are full end-to-end journeys spanning several screens — the highest-value, lowest-count tests. They mirror UI_Spec
§3.

* **E2E-FLOW-01 Happy-path packing** `server`: Alice M1 → M4 → swipe *Packing Now* → check → Bob's device reflects it in
  real time (locks, actor attribution, presence). (FR-5.x, 4.4, G-3, G-10) *(Runs for the convergence, membership and
  attribution halves — Alice shares the trip with Bob and the row Bob sees names Alice as its packer,
  which is the server's stamp per invariant 3. Presence (G-10) is still owed.)*
* **E2E-FLOW-01b The other direction** `server` (FR-4.4, Sync-API P-1): Bob, the member, packs, and **Alice's** open
  screen reflects it, the stamp naming Bob. The same server code serves both directions, yet a sync can be
  one-directional — the owner's tab having lost its socket while the member's has not — and a suite that only packs on
  the owner's device cannot see it. The socket-level cause is E2E-G2-13's; this case is the promise as the user states
  it.
* **E2E-FLOW-01c The header follows** `server` (FR-4.4, Sync-API P-1): Bob packs both of Alice's
  items while her packing list stays open and untouched; her progress figure goes `0/2` → `1/2` → `2/2` and the ring's
  label `0%` → `50%` → `100%`. The figure is derived from rows, so this is a second claim beside E2E-FLOW-01b's row
  arriving: it fails if the header were read from a value cached at open.
* **E2E-FLOW-02 Delegation** `server`: M4 → M5 → set packer (Bob) → Bob receives push/in-app notification → taps →
  deep-links into M4/M5. (FR-4.3, 6.2, 6.3, G-4) — **implemented** (`e2e/server/multi-user.spec.ts`), through FR-25.19's
  *Zugewiesen an* picker, the writer of `packer_user_id` that produces the delegation notification. The case asserts the
  whole chain rather than its pieces — the assignment, the FR-6.2 toast naming Alice and the item, the FR-6.3 deep link
  asserted on the **rendered sheet**, and FR-25.20's filter, which hides the row from Alice's list afterwards and names
  Bob in the reveal bar. The **OS half of the notification is still uncovered**: this is the in-app channel, which is
  the universal fallback (NFR-4.6), and Web Push needs a browser permission this harness does not grant. Mutation-proved
  — with the picker's write disabled the case reddens.
* **E2E-NOTIFY-01 The notification's language** `server` (NFR-4.12, ADR-037) — **implemented**
  (`e2e/server/multi-user.spec.ts`): the notification is written in the *recipient's* language. Bob's device is German
  and Alice's is not, and hers is the one that fires the delegation; the assertion is the whole German sentence rather
  than the name and the item, which the English wording would satisfy too. Producing a notification at all needs two
  accounts (ADR-029). *(Mutation-proved: with `describeNotification` put back on its literal for
  `delegation`, this is the only one of the eleven `server` cases that reddens.)*
* **E2E-FLOW-03 Purchase transition** `local`: M6 Before-departure → check item → appears in M4 as
  PACK/Open. (FR-3.3) — **implemented, and not as a case of its own**: the whole journey is inside
  **E2E-M6-17**, which buys the row on the before-departure tab, watches it leave the list and then *opens M4 to look at
  it*, because the revealed row's „on the packing list" is a string until the screen it names has been read. The mode is
  `local` — nothing here needs a backend.
  **The clause that had no assertion is the state**: *PACK/**Open***. Bought is not packed, and buying flips only the
  mode, so M4's progress reading `0/1` is what says the row arrived as work rather than as a record. A journey that is
  one screen's case plus one hop is left where its helpers are; a second file staging the same trip would be a second
  definition of it.
* **E2E-FLOW-04 Feedback loop** `local`: M4 flag *Missing* → archive → M14 proposes adding it to a group
  (FR-27.11) → apply → next M3 run of a template including that group carries the item. (FR-9.1, 9.2, 2.2) —
  **implemented** (`e2e/review.spec.ts`, beside M14's own world so the trip is staged once), and **the last
  clause is the one only this case asks**. Every M14 case stops at M8: E2E-M14-02 asserts the *write* — the group holds
  the new item, the unused position reads `0×` — and whether next year's trip is any different for it is a question
  only generation answers. `applyReviewProposal` must write the harvested item with its scope explicitly, like every
  other writer (M8's editor, M21's fold): `addTemplateItem`'s default is **`per_person`**, the one field that decides
  *how many* rows generation makes, so a shared item harvested from a trip would come back as one row per traveler,
  and on a trip with no travelers as nothing at all. A unit assertion beside the quantity one holds it too. The case
  also carries
  the other half of FR-9.2's harvest: the *unused* position is zeroed, not deleted, generation turns a 0 into FR-5.5's
  *skipped* row, and FR-25.2 keeps it off the list — so the knowledge survives while the row does not.
* **E2E-FLOW-05 Migration** `single` — **implemented** (`single/server-sync.spec.ts`): two spreadsheet years
  are imported into one series, M2's Archived segment holds them, and M3 step 4 offers their median as a one-tap default
  — **read on a second device**, which is the half that can break. The hint is the only feature that reads *other*
  trips' rows, and those rows live in each trip's own partition, pulled only when the trip is opened (ADR-033), so
  unless the hint asks for them a decade of migrated history is worth nothing on any device but the one that typed it
  in. Silently, because an unpulled partition reads as a trip that packed none of it rather than as one that is not here
  yet. The importing device is not evidence — its optimistic rows are already in the store. (FR-16.x, 14.2)
* **E2E-FLOW-06 Offline round-trip** `single`: go offline → make edits (G-5 optimistic) → glyph shows queued → go online
  → silent sync, edits persist. (NFR-4.1, 4.2, G-2, G-5)
* **E2E-FLOW-07 Local→Server migration** `local`→`server`: back the Local Mode device up (G-2, NFR-4.11) → restore that
  file on a server device via M18 → the templates, the trips **and the trips' own rows** are on a *third* device that
  only ever talked to the server. (FR-19.5, FR-18.4/18.6) — **implemented** (`e2e/single/server-sync.spec.ts`). The
  third device is the case: on the importing one every restored row is in the store optimistically, so its screen is
  right whether or not anything left the outbox. The file is the **device backup**, not a per-document YAML — a
  single-document file opens M18's merge preview, not the restore branch, and could not carry a device at all. The
  migration here is device-to-device (a second device or a reinstall); the move on one device is M17's (FR-19.8,
  E2E-M17-14/14b/14c walk it), and this case keeps the third-device assertion, which is the only witness that a restore
  reached the server. The restore must drain **every** partition, not the master one alone: a trip's rows are their own
  partition (ADR-033), and a packing list left queued on the importing device looks there like a migration that worked
  (unit: `composables/__tests__/portableImport.spec.ts`). And G-2 `synced` means no push is in flight, not that the
  queue is empty, so the case asserts the *absence* of the sheet's queue line instead.
* **E2E-FLOW-08 Concurrent-edit convergence** `server`: Alice and Bob edit the same trip offline simultaneously → both
  reconnect → field-level merge converges; a real conflict appears in the G-2 conflict log. (NFR-4.2a, G-2)
* **E2E-FLOW-09 Template round-trip over a year** `local`: M3 creates a trip from a composed template whose two groups
  share an item (deduped, both named in the preview) → items added ad-hoc during the trip → archive → M21 creates next
  year's template: **both** groups recognised from provenance and *referenced*, the deviation folded back into its group
  → the fold-back reaches a still-planning trip that follows the group **as the FR-27.4 question**, and never the
  archived source trip → a new M3 run from the new template contains the full learned set, including a position added to
  the group after that template was written. (FR-27.1–27.5, FR-2.3a) — **implemented**
  (`e2e/template-from-trip.spec.ts`). The mode is `local`: everything in this chain runs client-side on one device
  (invariant 4); and the fold-back is *asked* on the planning trip, not applied (FR-27.4), which E2E-M21-03c already
  asserts. **The archived trip is the half that needs care**: written the obvious way it cannot fail — the fold-back
  makes the group match the trip it was harvested from, so that trip is owed no proposal whatever the rule says, and
  deleting the archived guard from `followsGroups` stays green. The world therefore grows the group a position
  **neither** trip carries, and the mutation turns it red.
* **E2E-FLOW-10 The pull cursor only comes from a pull** `single`: A is caught up → A goes offline and edits → B writes
  a row A has never seen → A reconnects and drains. Every `cursor` A sends must be one a *pull* returned (0 until one
  has); the push's `pull_hint` is a signal, not a cursor. The defect is asserted on the wire, not on the screen: several
  drains overlap on a reconnect and one of them repairs the skip by accident, so a screen assertion alone is green
  against it. The screen is still checked (B's row arrives), as the positive signal that the pulls carried anything at
  all. (NFR-4.1, NFR-4.2a, Sync-API §4/§5)

---

## 6. Non-Functional Journeys

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

---

## 7. Requirement Traceability Matrix

Coverage tags: **E2E** = a browser case above exercises it through the UI · **UNIT** = algorithm proven by existing
Vitest/domain tests; the E2E journey only touches it incidentally · **SERVER** = backend/API concern, no UI surface
(owned by Go tests) · **DOC/N-A** = documentation-only or retired.

| Req | Coverage | E2E case(s) / note |
|---|---|---|
| FR-1.1 | E2E | M9-01 (grouped list), M9-10 (search), M10-07 (creation mode — the assertion the retired M9-02 and M10-01 both duplicated), M8-04 |
| FR-1.2 | E2E | M7-07 (the list and what a row says), M7-08/09 (creating one, and its scope), M8-06 (add **and** remove). **M7-01 and M7-03 are retired** — the shared list is FR-1.6's simplification with nothing to render, and the name prompt is rejected by the variant pass. |
| FR-1.3 | DOC/N-A | retired — plain integer quantities (M8-01 covers the stepper) |
| FR-1.4 | E2E | M8-02; M3-21 for the case the fan-out has nobody to expand over (FR-2.5b, ADR-053) |
| FR-1.5 | DOC/N-A | retired with FR-1.3 |
| FR-1.6 | E2E+UNIT | M14-02 (direct write), M18-01 (an imported template is shared instance-wide like every other — no template is private) — MVP shared model; M7-10 + M8-24 + M21-05 (the name is the instance-wide key: create, rename, M8's picker adopting the group that holds it, and M21's two writers — including the rule that exists nowhere else, that the Vorlage and the bundle group it writes in one pass must differ from each other); `domain/nameCollision.ts` (the matching rule), `composables/__tests__/nameCollision.spec.ts` (the orchestrator refuses the write, Local Mode included); publish/fork cases parked with the FR-1.6 stub |
| FR-1.7 | DOC/N-A | retired by decision — consumable flag and per-day unit removed |
| FR-1.8 | DOC/N-A | retired — no units, everything counts in pieces |
| FR-1.9 | E2E+UNIT+GO | M10-29 (server: set in M10, lands on the linked traveler in M3), M10-30 (Local Mode offers no control); `domain/__tests__/instantiate.spec.ts` (the rule and its failure paths), `TestMasterPush_ItemDefaultAssignee_…` (round trip, unknown account refused) |
| FR-2.1 / 2.1a | E2E | M3-01, M2-01/03 (all four parts, the traveller faces included) |
| FR-2.2 | E2E+UNIT | M3-06, M18-02 + M18-09 (an imported trip carries the status its file names, ADR-024 — the preview branch and the restore branch), FLOW-04 (a group edited between two runs generates differently); instantiate.ts |
| FR-2.3 / 2.3a | E2E+UNIT | M3-06, M8-03; instantiate.ts |
| FR-2.4 | E2E | M3-10, M8-05 (the note's wording, in the FR-27.4 model); the M10 usage count is asserted in M10-14/15 (M10-02 retired — its „delete blocked" half is reversed by FR-24.3) |
| FR-2.5 | E2E | M3-03 |
| FR-2.5b | E2E+UNIT | M3-21 (the preview names what an empty roster cannot place, and one traveller takes the block away); `domain/__tests__/instantiate.spec.ts` (the report, its falsifier and the two filters), `domain/__tests__/groupAdd.spec.ts` + `lib/__tests__/groupAdditionMessage.spec.ts` (FR-27.10's sixth outcome) |
| FR-2.7 | E2E+UNIT | M22-01 (name and dates), M22-02/03/05/11 (the roster's three affordances and what each does to the per-person rows), M22-04/07 (removal ends at departure), M22-08 (a partial edit is still a whole row), M22-10 (an archived trip's editor is read-only throughout **and says so**), M22-12 (the year, corrected and read back through M2); `TripEditPage.spec.ts` (the FR-2.1d date bound) and `composables/__tests__/tripProperties.spec.ts` (the mutations). **The year is on the screen** (M22-12, by decision — it has a reader everywhere and would otherwise have a writer only at creation), and the **series** is edited on M16 instead, as PRD FR-2.7's opening paragraph says; M2-34 (reached from M2's row menu) |
| FR-3.1 | E2E | M5-02 (the control), shopping/shopping.spec.ts (the write, `addBuyRowOnM4`) |
| FR-3.2 | E2E | M6-01/04, M4-11 |
| FR-3.3 | E2E | M6-02, M6-17, M6-22, FLOW-03 (M5-09 retired — the buy lives on M6) |
| FR-4.1 | E2E | M3-04 (share on create) |
| FR-4.2 | E2E | M4-24, M4-30 (the record), M5-18, M5-19 (for whom) — M5-01 retired |
| FR-4.3 | E2E | FLOW-02, M4-30, M4-31 (M4-06 and the shadowed M5-07 are both retired) |
| FR-4.4 | E2E | M4-10, FLOW-01, **M1-03** (the delegation reaches the dashboard live, no reload) |
| FR-4.5 | E2E | M2-05, M3-04, TripMembers |
| FR-4.6 | E2E | G10-01, G10-02 (FR-4.6 is the presence indicator; `members.ts`'s role model is FR-4.5/4.7's) |
| FR-4.7 | E2E | M3-04 (role select) |
| FR-5.1 | E2E | M1-06 (the departure-day section), M1-06b (and no other day); `domain/__tests__/dashboardSections.spec.ts` (the rule, with the date as a parameter) |
| FR-5.2 | E2E | M4-05 |
| FR-5.3 | E2E | G3-01, FLOW-01 |
| FR-5.4 | E2E | M4-56 (both control variants rendered), G6-01 (the rule itself, still unimplemented) — ~~M1-06~~ is not this row's: the Late-Packer flag is FR-5.1, and M1-06 is that section |
| FR-5.5 | E2E | M4-06 |
| FR-5.6 | E2E | M4-04, M6-03 (an entry of the list's own, FR-30.1) |
| FR-5.7 | E2E | G3-02 (mode gate), M4-49/50 |
| FR-5.8 | E2E | M4-91 (untouched: at once, undo, reload), M4-92 (asks, names the companion, co-skips it), M4-95 (the open panel closes), M4-113 (the unused item goes once final, ADR-065); `domain/__tests__/rowRemoval.spec.ts` (when it asks, which item is left unused), `composables/__tests__/removalPrune.spec.ts` (Local deletes, a server device asks after the removal) |
| FR-6.1 | E2E | M1-01 (the aggregation, deliberately unfiltered), M1-03 (the delegation *section* beside it), M1-03b (absent where there is no account), M1-08 (the planned-trips section); `domain/__tests__/dashboardSections.spec.ts`, `local/__tests__/delegationSeen.spec.ts` |
| FR-6.2 | E2E | FLOW-02, NOTIFY-01, M17-01 |
| FR-6.3 | E2E | G4-01, FLOW-02 (M1-04's *at the item* is retired — M1 has no per-item link) |
| FR-7.1 | E2E | M5-05 |
| FR-7.2 | E2E | M5-05 (M4-09 retired — FR-7.3 overrides its refusal) |
| FR-7.3 | E2E | M1-02 (listing only; in the one task card with its chip, FR-7.6), M1-07 (the chip opens the row), M4-08, M4-25 (M5-06's shadowed half; the resolution restriction is struck), M4-106 (ticked in the task section) |
| FR-7.4 | E2E+UNIT | M4-96 (add, tick, reopen, remove), M4-97 (above the list, open while owed, header figure), M1-10 (reported read-only), M1-11 (independent of packing), M3-23 (template tasks, dedup, no prep), M8-26 (the template editor, both scopes); `tripTodos.spec.ts` (the store's own bucket), `instantiate.spec.ts` (dedup), `portable.spec.ts` (`trip_tasks`) |
| FR-7.5 | E2E+UNIT | M4-133 (the seat hands a todo over, the assignee is told and sees it on M4 and M1), M4-134 (no seat without a second account); `TripTodoList.spec.ts` (seat, read-only avatar, resolved), `comments.seam.spec.ts` (one field on the wire), `notificationrules_test.go` (who is told) |
| FR-7.6 | E2E+UNIT | M4-136 (both kinds in one list and one figure, the chip leads to the row, the header stops saying the prep count), M4-137 (the task goes with the row, and comes back with it), M1-02 (one card on M1), M1-07 (the chip is the way into the row); `tripTodos.spec.ts` (`tripTasks`: order, the chip's facts, a preparation whose row is gone), `TripTodoList.spec.ts` (chip vs. seat and ✕, one toggle for both kinds) |
| FR-7.9 | E2E+UNIT | M26-01 (write, `tel:` link, delete — was M25-10), M26-03 (new for another, the tick, who ticked — was M25-11), M1-14 (M1's card); `tripNotes.spec.ts`, `stamp_actor_test.go` |
| FR-7.13 | E2E+UNIT+SERVER | M26-01 (a view of its own, M25 one list, cards that show their words, the code chip), M26-02 (a thread read top to bottom, a reply lifts it, one level, the author's edit from the menu, the delete naming its replies), M26-03 (the pill's *neu* badge, *Read*, *Seen by*), M26-04 (a reply re-opens a read thread with the divider, *Edit* for the author only), M1-14 (newest unseen entry, opens the thread's view), G12-06/07 (the fourth pill, the thread view's back); `tripNotes.spec.ts` (threads, order, `seen_through`, own entries, edits, divider, menu), `noteText.spec.ts` (tel and code), `TripNotesPage.spec.ts`, `TripNoteThreadPage.spec.ts`, `notethreads_test.go` (one level, parent once, title dropped, author-only edit, cascade), `TestPlanNotifications_NoteReply_ReachesTheParticipantsOnly_FR7_13` |
| FR-7.11 | E2E+UNIT | M25-13 (set on the sheet, the pill, the order, a reload, Local Mode's hint on M1); `taskDue.spec.ts` (the four states, `byDue`, `pressingFirst`, the hint's count), `tripTodos.spec.ts` (groups, M4's window, M1's block), `TripTaskSheet.spec.ts`, `TripTodoList.spec.ts`, `useDueTaskHint.spec.ts`, `taskdue_internal_test.go` (schedule, recipients, once a day), `taskdue_test.go` (the store's reads and the claim), `config_test.go` (`JITPACK_TASK_REMINDER_TIME`), `SettingsPage.spec.ts` (the row, and Single-User's section) |
| FR-7.12 | E2E+UNIT | M4-149 (both kinds of purchase cross under one undo, both *before* places locked, reopening lifts it); `closePacking.spec.ts` (`rowsCrossingToLocal`, `phaseForNewTask`), `tripLifecycle.seam.spec.ts` (the close's write and its undo), `comments.seam.spec.ts` (every writer of a new task), `sync.spec.ts` in `shopping/` (the module's crossing), `PackingClosed.spec.ts` (the sheet's line, the undo), `TripTasksPage.spec.ts`, `ShoppingPage.spec.ts`, `ItemDetailSheet.spec.ts` |
| FR-8.1 | E2E | M4-01, M12-01 (packed and planned as two different numbers), M12-07 (the value tile) |
| FR-8.2 | E2E+UNIT | M12-01 (all three dimensions, Gepäck over a real bag), M12-02/04/05, M12-06 (grouping handoff); analytics.ts (slice keys, bar order) |
| FR-9.1 | E2E | M5-17, M4-04, FLOW-04 (M5-03 retired as its duplicate) |
| FR-9.2 | E2E+UNIT | M14-01/02/03, M14-06 (the archive that *skips* the assistant), **FLOW-04** (the harvest read back where it is supposed to arrive — the next trip generated from the group); review.ts (resumability — an applied proposal is not recomputed), ReviewPage.spec.ts (the series-history why line, both directions) |
| FR-9.3 | E2E | M4-51…55 (the closing pass and its *unused* marks, `closing-pass.spec.ts`), M14-08; M2-34 (its one door, M2's *Reise abschliessen*) |
| FR-10.1 | E2E+UNIT | M11-01 (via M11-05/06); ContainerSheet.spec.ts (the carrier is optional — clearing it) |
| FR-10.2 | E2E | M11-06 (03 folded in, first assignment), M5-22 (re-assignment) |
| FR-10.3 | E2E+UNIT | M11-02/04; containers.ts — **the threshold is a fixed 15 %**, with no per-trip override (see the M11 block) |
| FR-10.4 | UNIT+E2E | analytics.ts (container weight); **surfaced M12-01**, which renders the Gepäck dimension over a real bag |
| FR-11.1–11.3 | — | removed (no Repack feature, Addendum §3.11) |
| FR-12.1 | E2E | M2-04 |
| FR-12.2 | E2E+UNIT | ClonePage toggles; clone.ts |
| FR-13.1 | E2E+UNIT | M2-02 (the grouping it describes is what the screen does, by decision; see E2E-M2-15), M16-01 (name, defaults, **and the rename refusal**), M16-03 (history, detach/attach); `composables/__tests__/nameCollision.spec.ts` (the rule: a taken series name is refused before the mutation — M3's wizard note still has no e2e case, named in `e2e-tests.md`) |
| FR-13.2 | E2E | M16-03 (history + attach/detach) and M16-04 (both shortcuts); M3-02 |
| FR-13.3 | E2E | M16-02 (**the only test of the checklist editor**, which also guards the field it types into rendering with a width), M3-09 (the wizard's offer, still unwritten), M6-01 |
| FR-14.1 | E2E | M3-08 (M5-04 retired — no history on M5, and none owed) |
| FR-14.2 | E2E+UNIT | M3-08, FLOW-05; suggestions.ts, TripWizardPage.spec.ts |
| FR-14.3 | E2E+UNIT | M12-03 (absence half; positive half blocked on an archive path, see M12-03); analytics.ts |
| FR-15.1 | E2E | M3-01, M16-01 (the defaults are stored), M16-04 (they reach M3 — the prefill chain) |
| FR-15.2 | E2E+UNIT | M3-06, M8-03 (chips set **and** clear, one value per axis); instantiate.ts |
| FR-15.3 | DOC/N-A | void — retired with FR-1.3/1.5 |
| FR-16.1 | E2E | M15-05, M15-06, M15-07, M15-08, M15-11 (the category-*row* layout), M15-12 (the mapping gate and the include toggle). **M15-01 is retired** — six promises in one sentence, distributed over those cases; its *grid preview* clause is unbuilt and an open decision. |
| FR-16.2 | E2E | M2-08 (the *„Importiert"* chip, `trips.imported`'s reader), M15-05, M15-11 (archived trips with their original quantities, landed and read back in Local Mode); `domain/trips.ts` (`calendarDate` — the header date is a day that exists, shared with FR-18.4). **M15-04's *target series* half is unbuilt** — the picker is on step 2 and the commit writes `series_id`, but the confirm never names it; open decision. |
| FR-16.3 | E2E+UNIT | M15-03 (both branches of the choice at M15's own step 3), M15-09, M18-03 (both branches of the choice); spreadsheet.ts — **one rule, two lists**: `findDuplicates` serves M15's step 3 and, through `matchPortableItems`, M18's preview; there is no shared component. **M9-03 is not coverage of this row** — the FR is deduplication *on import*, which the three cases beside it discharge; M9's multi-select merge is a UI-Spec clause nothing built (see M9-03). |
| FR-17.1/17.2 | E2E | G1-01, G8-01 (Single-User surface) |
| FR-17.3 | E2E+UNIT | M2-06, M3-05, M17-08; M5-08 in ItemDetailSheet.spec.ts |
| FR-17.4/17.5 | E2E | M17 profile (single-user bootstrap) |
| FR-17.6–17.10/17.12 | DOC/N-A | Demo Mode — removed in v2.10 |
| FR-17.11 | E2E | G8-01 (feature inert in Single-User) |
| FR-17.13 | E2E+UNIT | M17-04, M17-12; avatarCrop.ts / imageResize.ts |
| FR-18.1 | UNIT | portable.ts wire types; surfaced via 18.2/18.4 |
| FR-18.2 | E2E | M7-04, M7-12, M2-07 |
| FR-18.3 | E2E | M2-07 |
| FR-2.3 | E2E | M2-10 (ADR-033: progress on a trip this device never opened) |
| Sync-API §4 (paging) | E2E | SYNC-01 (a partition larger than one page arrives whole) |
| FR-18.4 | E2E | M18-01 (the template preview, and Import landing it) + M18-02 (a trip in the status the file carries, ADR-024, on the **preview** branch — M18-09 is the restore branch's half), M2-09, M7-05 (the header icon that is the built half — the FAB menu it names is not, open decision), M18-08 (the FR-27.4 sections), M18-10 + M18-11 (ADR-030: what is already here is not imported twice — restore list and merge preview); travelers/containers remapped by name is unit-owned in `composables/__tests__/portableImport.spec.ts` |
| FR-18.5 | E2E+UNIT | M18-04 (both ends rendered: the refusal with its reason, and the newer-schema warning followed by a best-effort import), M18-01 (the header names the `schema_version`); `domain/__tests__/portable.spec.ts` holds the parser's own rules |
| FR-18.6 | E2E | M18-05 + M18-09 (a *multi-document* file is the restore branch, not the per-document merge preview — the two are what FR-18.6 keeps apart), M18-01 (the single-document preview); ~~FLOW-07~~ is not this row's; it evidences FR-19.5: it carries a **device backup**, which is the format FR-18.6 says the portable one is not |
| FR-19.1 | E2E | M19-01 (full), M19-02 (both destinations; the health check in front of them is not built), M19-04 — ~~M19-03~~ has nothing to report until that check exists |
| FR-19.2 | E2E | NFR-01 (local load path), **M4-32** (a write must have landed before a reload, not merely been applied) |
| FR-19.3 | E2E | G8-01 (collab UI gated in Local) |
| FR-19.4 | E2E | G2-02 (local glyph/state) |
| FR-19.5 | E2E | FLOW-07 (backup → restore on a server device → a third device that only ever talked to the server); the *first* step, leaving Local Mode on the same device, is FR-19.8's (M17-14) |
| FR-19.6 | E2E | G2-02, NFR-03 |
| FR-19.8 | E2E+UNIT | M17-14 (the move, end to end, read back from the server), M17-14b (the guard, both directions), M17-14c (skip is not restore); the guard's rule and the card's absence outside Local Mode are unit-owned |
| FR-20.1 | E2E+UNIT | M10-03 (the default mode, the read-only reverse list, and the cycle refused in words), M5-23; dependencies.ts; M10-31 (a name in either list leads to that item) |
| FR-20.2 | E2E+UNIT | M4-07; dependencies.ts (incl. the anchor rule: a per-person twin or a second main item keeps a companion) |
| FR-20.3 | E2E+UNIT | M3-07; dependencies.ts |
| FR-20.4 | E2E+UNIT | M3-07, M4-40 (required), M5-23 (suggested); dependencies.ts (a suggestion carries the item's own fields, so accepting one writes the category and the quantity it names — `ItemDetailSheet.spec.ts` asserts the chip passes both) |
| FR-21.1/21.2 | E2E+UNIT | G11-01 (Nacht default); palette.css (every rgb twin agrees with its hex, in both flavours) |
| FR-21.3 | E2E | M17-06 |
| FR-21.4 | E2E | G11-01 (no flash before paint) |
| FR-21.5 | E2E+UNIT+GATE | G13-01 (both faces reach the screen), G13-03 (icons are their own scale), G13-04 (the section label renders as its role); typography.css (six icon steps, the 3xs step the views needed, the eyebrow named once, no screen restating it or claiming the class without it); `scripts/design-tokens-gate.mjs` (no raw `font-size`/`font-weight`/`font-family`/`letter-spacing` anywhere in `client/src`) |
| FR-21.6 | E2E+UNIT | G13-02 (no font CDN, every woff2 same-origin); typography.css (no remote `src`, both subsets present) |
| FR-21.7 | E2E+UNIT | G11-02, G11-03, G11-04, G11-05 (brand on identity, done on progress); palette.css (roles named once, primary stays the action hue, no hex outside the table) |
| FR-25.2 | E2E+UNIT | M4-33, M4-34, M4-35 (the pack registers, one undo, none on un-pack); `usePackUndo` (the snapshot is taken before the pack, replaces rather than stacks, undoes once, no-ops when unarmed) |
| FR-21.8 | E2E+UNIT+GATE | G14-01, G14-02, G14-03 (the card is a plane, casts a flavour-correct shadow, and bounds the group rather than its entries); surfaces.css (planes differ, `.jp-card` built from tokens, five radius steps, each cast written once); `scripts/design-tokens-gate.mjs` (no raw colour, radius or shadow anywhere in `client/src`) |
| FR-21.17 | E2E+UNIT | M4-70 (the head yields with the line and holds at the bottom), M4-129 (a list too short to survive the yield keeps its head), M4-135 (a scroll nobody made moves neither the head nor the rows); `headScroll.spec.ts` (the direction, the jitter, the clamp, the short list, the scroll nobody made, and which inputs count as one) |
| FR-22.1 | E2E+UNIT | M10-04 (add/replace/remove, rendered and read back), M9-01; the M5 rung in the ItemMark component unit (M5-12 retired) |
| FR-22.2/22.3 | E2E+UNIT | M10-04 asserts the aspect ratio survives the re-encode; the backoff itself is `imageResize.ts` |
| FR-22.4 | UNIT+SERVER | the 150 KB cap is `imageResize.spec.ts` and the three server layers (invariant 6) — deliberately **not** M10-04, which would be asserting the encoder through a canvas |
| FR-22.5 | SERVER | 150 KB / JPEG enforced server-side; edge asserted M10-04 |
| FR-22.6 | SERVER | item image shared, no trip-role gate (Go test) |
| FR-23.1 | E2E | M17-09, M20-05 |
| FR-23.2 | E2E | M20-01 (no „active" chip exists — status is the deactivated chip or its absence) |
| FR-23.3 | E2E | M20-02, M20-06 (the JIT-provisioning clause); admin-vs-own exemption split in `domain/admin.ts`'s unit |
| FR-23.4 | E2E | M20-03 (name), M20-03b (avatar) |
| FR-23.5 | E2E | M20-04 |
| FR-23.6 | SERVER | deactivation side-effects (push purge, notif suppress) — Go test; access-revocation asserted M20-02, and that a re-login does not undo it by M20-06 |
| FR-23.8 | E2E+UNIT | M17-17 (`single`: an instance that was not asked to check says nothing, with the version line as the positive signal). The other three states need a release feed that answers on demand, which no project has: `views/settings/__tests__/SettingsUpdateCheck.spec.ts` renders all four plus Local Mode, where the assertion is that **no request is made**, and `internal/api/update_test.go` drives the endpoint — the day-long interval and the failed-check rules on an injected clock, the link hardening, and the check outliving the request that triggered it |
| FR-24.1 | E2E | M10-08 (filter-or-create tag capture); grouping/filtering M9-01/24.2 |
| FR-24.3 | E2E+UNIT | M10-14 (a referenced item is hidden and still resolves in its group), M10-15 (an unreferenced one is really gone, and its name is free again), M7-11 (the Vorlage confirm states which deletion it is), **M23-01/02/03/04** (the restore, the collision and its rename, that a retired row can still be removed for good, and the Vorlage half — retired by a trip, listed on its own segment, restored); `domain/masterDeletion` + `domain/masterRestore` and `composables/lifecycleDelete` + `composables/lifecycleRestore` (both rules, both branches, and that resolution/export keep seeing retired rows); store-side both branches **and the restore** in Go, including a colliding restore rejected as `constraint_violated` with the row left retired |
| FR-24.11 | E2E+UNIT | M9-21 (missing name beside partial hits, list survives), M9-22 (filter tag assigned, create-and-open returns to the search), M9-23 (a retired name is restored, not re-created); the composer: M4-107 (offer, sheet, row + inventory), M4-108 (exact match adds directly, already-in rests), M4-109 (retired name restored and added), M6-25, M8-27; `domain/itemSearch` `searchOffer` + `domain/search` `searchEquals`, `CreateItemSheet.spec.ts` (the write), `ItemInventoryPage.spec.ts` (when the offer appears), `QuickAddItem.spec.ts` (the composer's offer, commit and add) |
| FR-24.4 | E2E | M9-01 (lean default), M9-05 (property sheet, device-local) |
| FR-24.5 | E2E | M10-07 (minimal creation; photo, dependency and delete sections absent), M11-05 (placeholder-name container) |
| FR-25.1 | E2E+UNIT | M4-12/13/14; packingView.ts (clustering, flat fallback, full-set decision) |
| FR-25.2 | E2E+UNIT | M4-14; M4-74 and M4-145 (the reveal bar's word and its two directions, singular and plural); packingView.ts (isDone, hidden counts, full-set headers) |
| FR-25.4 | E2E+UNIT | mode glyph rules M4-15/16; packingView.ts — the pill strip itself is replaced by FR-25.11 |
| FR-25.8 | E2E | M4-12/M4-58 (per-person quick-add is one cluster, not N items), M4-13 (the lone member is a flat row), M4-64 (absent where there is nobody to distribute over); ~~M4-65~~ retired with the editor it made way for |
| FR-25.6 | E2E | M6-05 (aggregated row), M6-06 (settles all instances), M6-07 (notes) |
| FR-25.10 | E2E | M6-08 (no free-form "for whom"); M5 membership control — closed by FR-25.21 |
| FR-25.21 | E2E | M5-18, M5-19, M5-20, M5-21 (the state follows the numbers), G3-04 (M6-05/06 carry the FR-25.6 half) |
| FR-25.30 | E2E+UNIT | M4-113 (filtered to one traveler, the instance is a plain row ticked without opening; the cluster returns with the filter); packingView.ts (only the person facet shapes, the label drops the one filtered name) |
| FR-25.28 | E2E | M4-100 (the seat, and a strip that follows its item from row to cluster), M4-101 (the last traveler leaves silently), M4-102 (a browse-sheet add is deaf to the strip), M5-29 (the sheet closes with the row it stood on); M5-18/-19/-20/-21/-26 and M4-12/-58/-64 run through the strip; G3-04 is its lock |
| FR-25.12 | E2E | M6-09 (buyer, kept distinct from recipients), M6-10 (description) |
| FR-25.13 | E2E | M6-11; M4-04; M8-13 (same quick-add on all three screens, and the two-character autocomplete gate); M8-14 (same edit sheet) |
| FR-25.13a | E2E | M6-12 (all three at add time, no wipe on chip tap), M6-13 (assignee carries over), M6-16/M4-21 (visible confirm, no keyboard) |
| FR-25.13c | E2E | M8-21 (chip rows, recents across scopes); M4-46 (M4 wiring) |
| FR-25.13d | E2E | M8-22 (browse-sheet: tag axis, run, free-text handover); M4-47/M6-21 (wiring); sheet rules also in `InventoryBrowseSheet.spec.ts` |
| FR-25.11 | E2E | M4-15 (panel), M4-16 (OR/AND), M4-17 (counts), M4-18 (empty states), M4-19 (Gemeinsam) |
| FR-25.11g | E2E | M6-14 (same panel, shop facets, independent state) |
| FR-25.11h | E2E | M4-20, M6-15 (last row clears the FAB) |
| FR-25.11i | E2E | M6-17; M4-14 (reveal, dimmed, still interactive) |
| FR-25.11j | E2E | M6-17 (BUY_BEFORE leaves the list and comes back), M6-22 (the destination tab's own reveal) |
| FR-25.11k | E2E | M6-18, G12-01/04 (collapsed search, filter icon with badge, one header line) |
| FR-25.11l | E2E+UNIT | M4-85 (panel wiring, override); `packingView.spec.ts` (bucketing, whole-set counts) |
| G-12 | E2E | G12-01…06 (app-bar placement, two clusters + no overflow, survives collapse, one line, literal icons, nameable glyphs); G12-08 (a held switcher glyph names itself and goes nowhere); G12-07 and M4-57 (a ⋮ holds its own context — none on M6/M25, no trip-wide entries on M4) |
| G-18 | E2E+UNIT | M3-22 (two presses of *Reise erstellen*, one trip — red-proved against the unlatched build); `TripWizardPage.spec.ts` (the button reports itself spent), `ClonePage.spec.ts` (the second press is ignored, and the clone that wrote nothing leaves the screen usable) |
| G-20 | E2E+UNIT | G20-01 (M6: the app bar carries the selection and the first row stays put, measured); `AppHeader.spec.ts` (what the bar shows and hides while selecting), each list page's spec (the selection it registers) |
| FR-25.16 | E2E | M4-22 (fold one / fold all), M4-23 (folding vs doneness stay separate) |
| FR-25.17 | E2E | M4-24 (packed-by stamp, cleared on un-pack); M6-05 for the buying counterpart |
| FR-25.18 | E2E | M4-28 (filter/switch/grouping survive navigation + reload, fresh session unfiltered, chips visible) |
| FR-25.19 | E2E | M4-30 (responsibility vs. record, single right-edge avatar, record not editable) |
| FR-25.20 | E2E | M4-31 (others' rows hidden by default, reveal bar names count + people, header unfiltered) |
| FR-25.14 | E2E | M5-18 (the aggregate is M4's cluster head, FR-25.21; M5-06 retired) |
| FR-25.15 | UNIT+E2E | M5-07 → captureState.spec.ts + ItemDetailSheet.spec.ts (distinct from G-2); M5-11, M11-05 (no save button). Each of these reads the indicator **after** an edit, with its absence before asserted beside it: the lamp is silent until the sheet writes, which is what makes the presence clauses falsifiable. The spoken half is M5-32 + SaveIndicator.spec.ts's second describe (permanent live region, empty until written, lamp `aria-hidden`) |
| FR-25.13b | E2E | M6-19 (autocomplete adopts the category; manual fallback) |
| FR-27.1 | E2E+UNIT | M8-07 (two-level include rules), M7-07, M21-03; `domain/templates.ts` (one-level expansion, dedup by master item), `internal/portable` + `domain/portable.ts` (the `scope` field round-trips, an unknown scope is rejected, a scope on a trip document is an error) |
| FR-27.2 | E2E+UNIT | M3-11, M8-08; instantiate.ts (include expansion + named merge) |
| NFR-4.2a (id minting) | E2E+UNIT | E2E-NFR-SEC-01…04; `lib/__tests__/ids.spec.ts` (v4 shape, insecure-context fallback, version/variant bits, no-randomness refusal, and the guard that `crypto.randomUUID` is called in one file only) |
| FR-27.14 | E2E+UNIT | M8-16 (footer opens the list, provenance, marks, read-only); `domain/__tests__/templates.spec.ts` (sources, merged, per-person, mode, conditions), `GroupPeekSheet.spec.ts` (provenance only where a composition can differ) |
| FR-27.12 | E2E+UNIT | M3-17 (row summary + peek sheet), M14-04 (the peek on a proposal's target group — **the sheet's M14 surface**); `domain/templates.ts` (`resolvedLines` ordering/dropping, `previewLines` truncation), `GroupPeekSheet.spec.ts` (resolved list, read-only, empty state) |
| FR-27.3 | E2E+UNIT | M3-12 (offered, counted, reported, removable, and on the trip); `domain/instantiate.ts` (single items resolve *after* the templates: already-there is reported, a per-person fan-out counts as present, a condition-excluded item is overridden, a double pick is one pick, a stale id is ignored); `views/trips/TripWizardPage.spec.ts` (the picker's chips, the report, the draft's null provenance) |
| FR-27.4 | E2E+UNIT | M8-05 (warning wording), M8-09 (offered → applied → M2 log), M8-19 (refused, and not asked again), M18-08 (both answers survive a device restore), M21-03, FLOW-09; `domain/trips.ts` (`followsGroups` past/not-past), `domain/refresh.ts` (`declinePlan` per position, `proposedChangeCount` excludes bookkeeping), `composables/groupRefresh` (propose writes nothing, accept, decline), `views/trips/TripListPage.spec.ts` (both chips), `components/trips/GroupChangesProposal.spec.ts` (names every change, fold, decline note, and the lead counted in groups rather than in changes) |
| FR-27.5 | E2E | M21-01/02/02b/03/03b/03c, M21-04 (only the *checked* loose rows are carried) and M21-05 (the two names M21 writes, FR-1.6), M4-43, FLOW-09 |
| FR-27.6 | E2E+UNIT | M7-07 (scope tabs/sections), M7-08 (create chooser), M8-07 (scope-shaped editor), M8-10 (guarded switch), M8-24 (the inline creation meets a taken name), M3-11 (wizard sections); `domain/templates.ts` (`scopeSwitchBlock`: both guards, both free directions) |
| FR-27.7 | E2E | M8-11 (task list + count chip + propagation log), M3-13 (preview count, todo on the generated item); blocking = existing FR-7.3/25.2 M4 cases |
| FR-27.8 | E2E | M10-17 (the list, its scope chips and the way into a template), M10-19 (absent on an unused item); `domain/__tests__/itemHistory.spec.ts` (own positions only — the list answers the same question as FR-2.4's count) — **built** |
| FR-27.9 | E2E | M10-18 (a trip's remark read at the item), M10-19 (absent when there is none); `domain/__tests__/itemHistory.spec.ts` (the foreign-key join, the trip-level comment that belongs to no item, the ad-hoc row that reaches none, an undated comment sorting last) — **built** |
| FR-27.10 | E2E | M4-26 (group add: dedup, provenance, tasks, no Missing flag), M4-27 (fully-present group, planning-trip propagation) |
| FR-27.11 | E2E+UNIT | M14-04 (group targets, blast radius), M14-05 (list not card stack, marked rows, per-pair dismissal), FLOW-04 (the shape the write gives the position); review.ts, ReviewPage.spec.ts — the applied-change log is owed with the §3.27 refresh package |
| FR-27.16 | E2E+UNIT | M4-103 (the ⋮ entry, „Alle", apply, undo, gone after a reload), M4-104 (an archived trip is offered it too), M5-30 (the one-row line); `domain/__tests__/inventoryNames.spec.ts` (which rows, per-person as one choice, deliberate, ledger follows, undo), `composables/sync/__tests__/inventoryNames.seam.spec.ts` (the row keeps following its group, the FR-27.4 card keeps its own renames), `components/trips/__tests__/InventoryNamesSheet.spec.ts` (pre-selection, „Alle") |
| FR-25.7 | E2E | M8-12 (one-tap add, "Standard" row, nothing auto-opening on top of it, Mehr-Optionen disclosure) |
| FR-28.1 | E2E+UNIT | M9-07, G15-01 (mark set, mark absent — absence is a normal row, not an empty state); Go: the column is nullable and capped, and nothing else |
| FR-28.2 | E2E+UNIT | M10-11 (keyword search, facets), M10-12 (explicit removal, and its absence on an unmarked item), M8-18 (the *same* picker on a template); `MarkPicker.spec.ts` |
| FR-28.3 | E2E+UNIT | M10-11 (hit / skewed hit / empty, offer never auto-applied); `domain/itemMarks.ts` — compound splitting **only** against the index vocabulary, scoring order, and the empty result as a returned state rather than an exception |
| FR-28.4 | E2E | G15-01 (both ladders, slot width), M9-07, M5-15 |
| FR-28.5 | E2E+UNIT | G15-02 (accessible name excludes the mark); `markRendering.spec.ts` — no view outside `ItemMark.vue`/`MarkPicker.vue` applies the mark face or renders an `icon` value, mirroring the FR-21.7 hex-in-`client/src` test that keeps colours in one table |
| FR-28.6 | UNIT+GATE | `scripts/mark-font-gate.mjs` (in `make client` and the CI client job): the subset's `unicode-range` covers exactly the curated index and nothing else, and the file stays under its size ceiling — a mark that would render as tofu is a build failure, not a support ticket. Measured: **103 code points, 80 KB** (NFR-4.3, ADR-021). `typography.spec.ts` pins the self-hosted `@font-face`; `sampleMaster.spec.ts` pins that the dev seed uses no glyph outside the index |
| FR-28.7 | E2E | M9-07 (one edit, both surfaces; and both composer paths, since only the suggestion carries `source_item_id`), M5-15 (the sheet reads the master item and offers no picker) |
| FR-28.8 | E2E | M8-18 (template mark on all four offering surfaces) |
| FR-28.9 | SERVER+UNIT | Go: `capMark` rejects an over-long value and touches nothing else (`itemmark_test.go`); `schema_shape_test.go` pins the column on both tables and on the sync whitelist; merge is ordinary LWW (no special case) |
| FR-28.10 | UNIT | `internal/portable` and `internal/store` round-trip with and without `icon` on all three levels (document, group, item); the client's `domain/portable.ts` and `commitPortableImport` likewise; an export from before the field imports unmarked (FR-18.4 tolerance) |
| FR-28.11 | E2E | M10-11 runs in `local` — the picker, the search and the suggestion work with no server present |
| FR-30.1 | E2E+UNIT | M6-26 (reaches no packing figure), M6-27 (buy, reveal, put back, remove, reload), M6-01/03 (one entry per tab); `shopping/__tests__/ShoppingPage.spec.ts`, `sync.spec.ts` (routing, trip cascade, restart); Go: `shopping_entries_test.go` |
| FR-30.10 | E2E+UNIT | M6-35 (set in the sheet, the pill, the order, a reload, M1's card and Local Mode's hint); `shopping/__tests__/list.spec.ts` (due order, pressing sections first), `ShoppingPage.spec.ts` (pill, sheet), `ShoppingDashboardCard.spec.ts` (pressing lead on card and block), `sync.spec.ts` (the field's writes, the count), `useDueTaskHint.spec.ts`; Go: `TestDueShoppingEntries_*`, `TestPlanShoppingDue_*`, `TestRemindDueTasks_*` |
| FR-30.9 | E2E+UNIT | M6-31 (the entry sheet with name and search-or-create tag, grouped open list, flat reveal with the tag, check-off at the end, reload); `shopping/__tests__/ShoppingPage.spec.ts` (grouping order, chips, sheet, source lines offer none); Go: `shopping_entries_test.go` (push path, per-field merge, 1–40 bound) |
| FR-30.2 | E2E+UNIT | M6-28 (on the list exactly while the mode says so), M6-17/22/05/06 (packing rows through the contract); `composables/__tests__/packingShoppingSource.spec.ts`, `domain/__tests__/buyRows.spec.ts` |
| FR-30.3 | GATE+UNIT | `scripts/module-boundary-gate.mjs` (both directions, in `make client`); `sync/__tests__/routing.spec.ts` (a feature table routes to a feature store) |
| FR-30.4 | E2E+UNIT | M6-29 (`single`: the buyer named, read fresh from the server), M6-17/27 (`local`: the time alone); Go: `purchaserecord_test.go` (stamping), `purchaserecord_push_test.go` (through the push); `rowFacts.spec.ts`, `ShoppingPage.spec.ts` |
| FR-30.5 | E2E | M1-12 (the card's way onto M6) |
| FR-30.6 | E2E+UNIT | M6-15 (the ＋ leads to the field, the last row clear of it); `ShoppingPage.spec.ts` |
| FR-30.7 | E2E+UNIT | M1-12 (the list that is now, the planned rule), M1-13 (check off, undo, add; M4/M6 agree); `ShoppingDashboardCard.spec.ts` |
| NFR-4.1 | E2E | NFR-01, FLOW-06 |
| NFR-4.2 | E2E | FLOW-06 (silent background sync) |
| NFR-4.2a | E2E+UNIT | FLOW-08, NFR-04; sync merge tests |
| NFR-4.3 | SERVER | resource footprint — docker/Go, no UI |
| NFR-4.4 | SERVER | JWT decoupling — Go/api; offline-token touched by FLOW-06 |
| NFR-4.5 | E2E | M17-03, NFR-05 |
| NFR-4.6 | E2E | NFR-06 (the registration round-trip against a real session); M17-02 is retired — the branch it kept is unreachable in a suite whose browsers all support Push |
| NFR-4.7 | E2E+UNIT | M15-12 (the pre-validation half of M15-04), NFR-07, M9-04 (the entry from an empty inventory, and the return to it); spreadsheet.ts + `composables/__tests__/import.spec.ts` carry the `?` rule at both levels. The wizard's inline noise notice is built and M15-02 asserts it. One clause is deliberately unbuilt: **the commit is an approximation rather than a transaction** — no rollback, no progress — so NFR-07 asserts the clause that *is* built, that a blocked mapping writes nothing. |
| NFR-4.8 | E2E | NFR-02 |
| NFR-4.9 | DOC/N-A | operator documentation only |
| NFR-4.10 | DOC/N-A | retired (demo rate-limit) |
| NFR-4.11 | E2E | M17-07, M18-05/06/07/08, M19-01; **NFR-03/03b** carry the request itself — the one clause the sheet cannot show. |
| NFR-4.12 | E2E+UNIT | M17-10; `i18n/__tests__/i18n.spec.ts` (catalogue key, placeholder and plural-form parity), `lib/__tests__/roleLabels.spec.ts` |

**No requirement with a UI surface is left uncovered.** Rows tagged SERVER or DOC/N-A are intentionally outside the
browser suite, with the reason stated.

---

## 8. CI Integration (proposed)

* **New CI job `e2e`** in `.github/workflows/ci.yml`, `needs`-gated after `client` and `go` build so it runs on a proven
  client + server.
* **Fixtures**: build the `jitpackd` binary (already built for `docker-build`); a shared harness starts it in `single`
  or `server` mode per test project. Playwright `webServer` starts `vite preview`.
* **Browsers**: Chromium + WebKit; Playwright browser binaries cached via `actions/cache` keyed on the Playwright
  version.
* **Artifacts**: on failure, upload `playwright-report/` (HTML report + trace + video) via `actions/upload-artifact`.
* **Supply-chain (invariant 8)**: the Playwright dep is pinned in `package-lock.json` (sha512);
  any new Action in the job is pinned by full commit SHA; `playwright install` pinned to the package version.
  Dependabot's npm/actions ecosystems keep them fresh.
* **Dependency-footprint justification (NFR-4.3 discipline)**: Playwright is a **dev-only** dependency; it ships nothing
  to the container or client bundle and pulls no runtime code. Its browser binaries live only in the CI cache. This
  keeps the runtime footprint unchanged, satisfying the standard-library-first / minimal-footprint working agreement for
  production while accepting a heavier *test* toolchain.
* **Flakiness budget**: E2E stays journey-focused (this spec is deliberately ~90 cases, not ~400) so the suite is fast
  and stable; retries limited to 1; no arbitrary sleeps (clock injection only, §2.4).

---

## 9. Out of Scope / Future

* **Visual regression** (screenshot diffing of G-11 themes, layouts) — deferred; would layer on Playwright's
  `toHaveScreenshot` if desired later.
* **Native shell E2E** (Capacitor iOS/Android via Appium/Detox) — the web build is the coverage vehicle; the native
  WebView is approximated by WebKit.
* **Real IdP / real push-service delivery** — mocked (§2.3, §6); a smoke test against a real Authelia/UnifiedPush stack
  is a separate, manual pre-release check.
* **Load/perf** — not part of functional E2E.

---

## 10. Implementation Order (proposed, when we start building)

1. Playwright scaffold + `data-testid` pass on shared components, one smoke test per mode (M19 mode selection, M1
   loads).
2. Global patterns (§3) — they underpin everything.
3. Single-User screen cases (largest surface, simplest infra).
4. Local Mode delta (persistence, mode selection, serverless export).
5. Mock-IdP harness + Server/collaboration multi-client cases (FLOW-01/02/08, presence, locks, notifications, admin).
6. Cross-screen flows + non-functional journeys.
7. Wire the `e2e` CI job; make it required once green and stable.
