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
**Built 2026-08-24** (ADR-029). `jitpackd` in OIDC mode against a **mock IdP** fixture —
`client/e2e/server/mockIdp.mjs`, an HTTP server exposing discovery, `/jwks`, `/authorize`, `/token` and `/userinfo`,
signing RS256 with a keypair generated per run. It is a *test fixture*, not a shipped component, so NFR-4.8 is not
violated, and the shipped binary carries no test seam.

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
| E2E-G2-01 | G-2 Sync indicator | single/server | Glyph reflects synced → offline (queued count) as the network drops and returns to synced once the queue drains; tapping opens the detail, which states the queue and — inside a trip — leads to the conflict log, whose row names the **item, the column and both travelers** — `Seil-x · Assigned to`, `Mia → Andy` — rather than `trip_items · assigned_traveler_id` between two uuids (widened 2026-08-24; the assertion it replaces was "both values render as something", which a pair of raw ids satisfies). Outside a trip the *trip's* log is not offered — it has no subject — but the master partition's is, and clicking it opens the log (revised 2026-08-22 with E2E-G2-06; the sentence it replaces, "it says where the log lives", was a hint that named a log the user could reach and one they could not). *(Revised 2026-08-20 with the implementation: the transient `syncing` state is not raced — same reasoning as E2E-M8-14's 2026-08-15 revision note — and the drain is asserted on the app's next own action (a trip open), because no reconnect loop existed then; the reconnect exists since 2026-09-01 and E2E-G2-13/14 are its cases — this one is unchanged, because the queue still moves on the app's next own action too.)* |
| E2E-G2-02 | G-2 Local glyph | local | Distinct **device** glyph; tap opens the storage & backup detail (not a conflict log): the sheet titles the state, explains that no server is involved, shows the NFR-4.11 storage section, and offers **no** conflict-log entry. Asserted on a screen with no trip open — where the glyph used to do nothing at all. |
| E2E-G2-03 | G-2 One-tap backup | local | The detail's **Back up now** downloads `jitpack-backup-YYYY-MM-DD.yaml` holding every trip and template, and the sheet's backup line goes from *Never backed up* to *Last backup today* — the stamp the FR-19.6 reminder reads later. |
| E2E-G2-04 | G-2 Durable queue | single/server | An offline change survives a **reload while still offline** (B2, NFR-4.1): the queue count is back on the glyph, the detail sheet states it and says it is saved on this device, and the change reaches the server on the app's next own action — proven on a device that never saw it. *(Added 2026-08-21 with the durable outbox. No reconnect drain is asserted here — none existed then, and since 2026-09-01 E2E-G2-13/14 own it; the boot replay is what this case proves.)* |
| E2E-G2-07 | G-2 Merge announcement | single/server | A push answered `merged` **announces** itself: one toast naming how many fields were overwritten, and a standing line in the detail sheet for the session. Asserted inside E2E-G2-01's losing-edit case — the one place in the suite where a real server merges a real edit away — **immediately** after the drain and then dismissed by hand, because a toast auto-dismisses on a timer and every later step would otherwise be racing it. *(Added 2026-08-22. Mutation-proved: removing the report from the outbox reddens it.)* |
| E2E-G2-06 | G-2 Conflict log (master) | single/server | A conflict on the **trip's own name** — `trips` merges on the master partition, not in the trip's — is readable from outside any trip: one device renames the trip offline, the other renames it later, and after the loser's app start its screen carries the winner's name and the master log names the **trip and the column in words** with both values, decoded — the losing value is asserted with `toHaveText`, since the column stores the JSON of the mutation field and a containment assertion is green against the quoted form too (widened 2026-08-24). The same row asserts that the timestamp is in the app's language and not the de-CH device's. *(Added 2026-08-22. Two things it had to learn: the losing device cannot be navigated to by its own trip name, since the name is exactly what it lost; and the master queue does not move on a trip open — a trip open drains the trip partition — so the drain is the app start the durable outbox gave it (B2).)* |
| E2E-G2-05 | G-2 Parked refusal | single/server | A mutation the server **refuses** leaves the queue and is reported: Mia is removed from the trip on one device while the other is offline holding an edit to her packed row; on reconnect the queue empties, the detail sheet states one refused change and keeps it with its reason. *(Added 2026-08-22. The refusal it drives is the trip-confinement one — a partial upsert on a row that is gone names no trip; the **constraint** refusals of the same code path are Go-covered, since no screen can delete a container or lower a quantity below its packed count on another device within one case.)* |
| E2E-G2-11 | G-2 The delete a trip's provenance used to forbid | single | **Retargeted 2026-08-25 by FR-24.3.** As written, it drove `still_referenced` through M7: a group is built, a trip is generated from it, deleting the group is refused, and the detail sheet states one refused change *and* the reason. FR-24.3 turned that refusal into a retire, so the case now asserts what the same tap produces — the delete is **accepted**, the sheet shows **no** parked change (its own explanation line is the positive signal that the sheet is open), and a second device that never saw the delete agrees the group is gone. It still runs in `single` because only a real server decides — **and the deleting device is a second context that never opened the trip**, so its own count is 0 and it sends a physical delete the server converts. Doing it on the device that had just built the trip would have exercised the client's advisory guess instead, which is what the first draft did (ADR-032). A third device, which saw neither the trip nor the delete, then finds an untouched second group and not this one — the untouched group being the settled signal that the pull landed, since an empty list is equally consistent with a device that has not pulled yet. The refusal itself no longer has any UI path — see the note at the end of `e2e-tests.md` for where its client half is asserted instead.
| E2E-G2-12 | G-2 What the retire protects | single | **Retargeted 2026-08-25 by FR-24.3.** As written, it drove ADR-031's repair: the refused delete's row came back in M7 *with its position*, because the client mirrors the cascade optimistically and only rendering it showed the first repair returned the Vorlage empty. With the refusal gone from the UI, the case asserts the thing that repair existed to protect and that the retire now keeps: after the group is retired, a device that never saw any of it opens the trip and finds its row — read from the server, which a physical delete would have taken with it and a refusal would have prevented. It also re-reads the group's absence **after** the drain rather than only optimistically: that is what tells a retire from the refusal it replaced, since ADR-031's repair re-logs a refused row and the ordinary pull would put it straight back on the list. Without that line the case is green against the unfixed build — found by mutating `lifecycleTables` to empty and watching it pass. The cascade half of the same mechanism (`relogCascadeChildren`, now shared by both paths) is asserted in `TestApplyMasterMutation_RetiringATemplate_KeepsAndRelogsItsPositions_FR24_3` and, rendered, in E2E-M10-14.
| E2E-G2-08 | G-2 Sheet header alignment | local | The sheet's state glyph is **centred on its title**, measured rather than eyeballed: the distance between the circle's centre and the title line's centre is at most 1 px. It was 14.5 px — `.head` aligned the circle to the top of the title *block* while the `h1` inside carried a 20 px top margin nothing had asked for, `.jp-sheet-title` naming a type role and no spacing at all. *(Added 2026-08-23. Geometry rather than the baseline beside it on purpose: a baseline reports that a pixel moved, this reports which rule broke. Variant A — resetting the margin alone — was measured too and rejected at +5.5 px: a 38 px circle and a 29 px line flush at the top cannot centre on each other, and the residual would move again with the title's size.)* |
| E2E-G2-09 | G-2 Empty master log | local | The master conflict log's empty state is **inset from both edges** like every other empty state (G-7). Its sentence names three things and wraps; the page had copied the house empty state without its `padding` and `text-align`, so the wrapped line ran from x=0 to the right edge under a centred icon. *(Added 2026-08-23. Driven in Local Mode and by URL: the mode answers `[]` without a server, so the case needs neither a backend nor a shared database that happens to be empty — the button that leads here is server-only by design, G-8.)* |
| E2E-G2-10 | G-2 Conflict revert | single/server | A recorded loss can be **taken back**: E2E-G2-06's scenario one step further — B loses the trip rename, reads it in the master log, taps *Revert*, and the name B wanted is what the trip is called again, read back **from M2** rather than from the log page, because that is the half that proves the restore travelled through the change feed rather than being painted locally. The spent entry shows the *Reverted* note and offers no second revert. *(Added 2026-08-22. The revert drains the partition it wrote before it resolves, so nothing here waits on a timer; the four refusals the server distinguishes are unit-covered in `ConflictLogPage.spec.ts`, since no reachable screen can provoke them.)* |
| E2E-G2-13 | G-2 A dead socket is dialled again | single | The device's WebSocket is **cut and every redial refused** while another device packs a row; the G-2 sheet says live updates are not connected (and said they were before the cut); then the refusal is lifted and **the client's own backoff timer** brings the socket back, whose open pulls the gap over — the packed row leaves B's list **without a reload and without B writing anything**, and the sheet says live updates are connected again. The gap is held on purpose so the row can only arrive through the reconnect's catch-up pull: no `trip.changed` for it was ever delivered. *(Added 2026-09-01 with the reconnect, Sync-API P-1/§9. Driven through `routeWebSocket`; two things it settled are in the ledger.)* |
| E2E-G2-14 | G-2 Coming back pulls at once | single | The same gap, still refusing every redial, and the page receives the browser's `online` event: the row arrives **before any socket is back**, because the resume pulls without waiting for one — the frozen-tab story, where the pending backoff may be half a minute away when the user looks. The sheet still says live updates are not connected, which is the positive signal that the socket was not the reason. *(Added 2026-09-01.)* |
| E2E-G3-01 | G-3 Presence lock | server | Alice triggers *Packing Now*; on Bob's client the row shows "In progress by Alice", avatar + chip, and is non-interactive. *(The identity half runs since 2026-08-24 on the mock-IdP `server` project: the row's holder line and M5's banner both name Alice, and Alice's own row says the claim is hers. The avatar and chip are not asserted yet.)* |
| E2E-G3-02 | G-3 Taking a row over | single (partial) / server | **What runs today (`single`):** where there is no second account the claimed row offers *no* action at all — the takeover surface is absent per G-8, not shown and then refused. **What the `server` project runs since 2026-08-24:** a claimed row offers exactly one action, *Übernehmen*, which confirms first naming the holder and the row; confirming leaves the row claimed by the *taker* (never free in between) and the previous holder gets an FR-6.2 notification. *(The `lock_events` record is asserted by Go tests, not yet by this case.)* Building it found the defect it existed to find: the loser's device went on rendering the row as its own claim — `myLocks` is a device flag and nothing revoked it — so the notification arrived while the row said "You are packing this". That half cannot run in `single` for a structural reason rather than a missing fixture: both contexts are the same identity, so a takeover there is a takeover of one's own claim, which the server refuses by design — the same wall E2E-G3-01's identity half meets. *(Rewritten 2026-08-24: this case used to advance the clock past `JITPACK_LOCK_TIMEOUT` and assert that the row stopped being locked. FR-5.7 removed the window, and the clock-advancing went with it.)* |
| E2E-G3-03 | G-3 Lock depth | single/server | A row another device is packing is read-only **in M5 too**, not only in M4's list: the sheet carries a banner naming the holder; its skip, note and prep controls are gone, while the packing stepper and the *Details* controls are **disabled rather than removed** — the stepper is where "3/5" is read, and removing it would take the state with it. The row's identity, quantity and state stay readable — G-3's "except viewing". The holder's own sheet is untouched. *(Added 2026-08-22. In the `single` project both contexts are the same identity, so what it proves is the mechanism — B never claimed the row, so B treats the claim as foreign — not whose name is rendered; the identity half stays with E2E-G3-01 on the future mock-IdP `server` project.)* |
| E2E-G3-04 | G-3 Lock depth reaches membership | server | The membership row (FR-25.21) is **read-only while another account holds a claim on any instance** of the item, and names the holder — a conversion rewrites rows that person is packing right now. The claim is taken on **one** child row and the membership row is asserted read-only in a **different** instance's M5 sheet — an unclaimed row, so the case proves the lock reaches past the row it was taken on, which is the whole point: a conversion rewrites the claimed row too. The positive signal is the same sheet with the claim released, where the row is operable. Needs two identities (ADR-029). **The rule itself was only written on 2026-08-29** — until then the lock was computed from the row the editor was opened from, so this case would have failed for the reason it exists; `components/trips/__tests__/MembershipSheet.spec.ts` carries it against a stubbed claim. **The two-identity half runs since 2026-08-30**, and building it added what nothing had built: the editor **says whose** claim froze it. Every other G-3 surface names the holder and this one could not inherit it — M5’s banner is absent on the unclaimed row the sheet is opened from, and the editor is a modal above M5 in any case, so a frozen sheet stated no reason at all. Alice gives the row back rather than packing it, because the point is that the editor recovers without being reopened; the write that follows — Leonardo’s amount stepping to 2 — is the positive signal, since a frozen editor and a broken one look identical from outside. |
| E2E-G4-01 | G-4 Deep link | ~~server~~ all | **Implemented 2026-08-31** (backlog item 6, the cross-cutting pass). Opening `/trips/{id}?item={itemId}&comment={c}` (the shape since ADR-046) lands on the item with its thread, scrolls to the referenced message and flashes it. The scope is corrected against the screen: the *landing* reads the query and nothing else, so it is driven in `local`; only the notification that produces the link is server-only, and its delivery is E2E-FLOW-02's. `notifications/format.ts` had built that URL since FR-6.3 and a unit asserted the string — **no test had ever opened one.** The flash is a 2.4 s animation, so the sheet reports the outcome instead (`data-flashed-comment`), which is the deterministic seam the assertion needs. ~~expands its comments~~ — the thread is on M5's first level and is never folded (E2E-M5-11). |
| E2E-G5-01 | G-5 Optimistic UI | single | **Implemented 2026-08-31.** A mutation renders without server confirmation; a forced failure surfaces only via the sync glyph, never a blocking dialog. "Without confirmation" is established without racing anything: the push carrying the row is **refused every time it is attempted** (counted, so the case cannot pass in a world where nothing was sent), and a row on screen regardless cannot have been waiting for an answer. The refusal is asserted *positively* — the indicator moves to `offline` and counts the pending write — so "no blocking dialog" is read on a screen known to have noticed. Two harness traps paid for while writing it, both recorded in `e2e-tests.md`: an **unresolved route handler wedges the whole run** (no test timeout, no report), and the plain `page` fixture in this project is **unseeded**, so it lands on M19 rather than the app. |
| E2E-G6-02 | G-6 Controls do not navigate | all | On a row that is also a link, the stepper and the checkbox **act** — they never open the item sheet. Ionic wraps such a row in an anchor whose jump is a *default action*, so stopping propagation on the control is not enough; only the row's body opens M5. |
| E2E-G6-01 | G-6 Stepper/checkbox | all | **Implemented 2026-08-31, and it found the gesture was unreachable.** ~~qty=1 renders a checkbox; qty>1 renders the stepper~~ — both halves are asserted by E2E-M4-56, and the tap by E2E-G6-02; what no test had ever performed is the **hold**, which is what this id now carries. Holding + packs every unit, holding − takes them all back. On M4 neither worked: the row arms FR-5.5's press-and-hold on *every* pointerdown inside it, so a press on the stepper opened the row menu while the stepper's own hold was lost. The row's **click** had been stopped at the control column since the stepper shipped; its **press** never was. Guarded in `PackingListPage.vue` (`onRowPress`). A completed row then leaves the list (FR-25.2), so the outcome is read on the trip counter and on the reveal that now has something to reveal — the hold is waited out through its own result, never a sleep. |
| E2E-G7-01 | G-7 Empty states | all | Each list screen (Trips/Templates/Items/Dashboard) shows its empty state with the single primary CTA. **What this id itself asserts is the Dashboard** (`smoke.spec.ts`); the other three are covered where their screens are, and were counted here as if one case did all four. Items is **E2E-M9-04** (new 2026-08-30, and the first time that state was ever rendered); Templates is `template-list.spec.ts`. ~~**M2's empty state is the one still unasserted**~~ — **written 2026-08-31 as E2E-M2-16**, a number of its own rather than a second definition of this id (the gate allows one, and a shared id is what the M5 audit spent a day undoing). Until then it carried no test id at all, and its G-7 CTA is the always-present `trips-new` FAB rather than anything the empty state itself offers. Owed to M2's next pass, not to this row — **re-checked 2026-08-30 from the M1 side and left there**: what M2 needs is a `data-testid` on its own empty state. The question standing in front of that is answered: **2026-08-31, owner — M2's empty state carries no CTA of its own**, which is the ruling UI-Spec M7's *States* line already records for the same reason (create is the FAB, and it is on screen either way). So exactly one thing is owed here and it is a test id, on M2's screen; nothing about it is answerable from the Dashboard. The Dashboard half meanwhile has a second path through it — E2E-M19-01 now reaches the same empty state by *choosing* Local Mode rather than by seeding it. |
| E2E-G7-02 | G-7 Empty states | all | **New 2026-09-03 (U-8).** Every empty state is inset `48px` above and `24px` from each edge, on whichever screen it appears — read from the rendered box on two unrelated screens (the master conflict log and M9) rather than from one. It is the *rendered* half of the rule a vitest gate already keeps in the source: the gate refuses a screen that declares its own `.empty-state`, and what it cannot see is a global stylesheet overriding the shared component from outside. The numbers are named rather than only compared, because an equality between two screens is equally happy with two screens that inset by nothing. E2E-G2-09 stays the case for *why* the inset exists — a sentence that wraps — and this one for its reach. |
| E2E-G8-01 | G-8 Collaboration hidden | single/local | **Implemented 2026-08-31 as the one clause nothing asserted: the delegation picker.** Its two siblings were already read on their own screens — Share is E2E-M2-06 and the notification section E2E-M17-08 — so what this id now carries is M5's *Zugewiesen an*, absent rather than disabled where there is nobody to hand a row to, asserted from inside a *Details* section demonstrably showing its other rows. ~~no mode banner shown~~ — **kept and named rather than counted**: no banner is painted in any mode at any width, so nothing distinguishes the promise from an empty page. |
| E2E-G9-01 | G-9 Responsive | all | **Covered, under two other ids** (read 2026-08-31): the rail is asserted visible at ≥900px by E2E-G9-09 and hidden below it by E2E-G1-01, which asserts the tab bar in the same breath. ~~+ inline actions~~ / ~~+ FAB~~ — **retired**: neither is width-conditional in the build. The FAB is on M7 and M9 at every width, and the app bar's actions do not change at the breakpoint; what actually differs there is the content column (E2E-G9-16), the wordmark, and M4's header line (E2E-G12-04). (The logo-from-within-a-trip clause is retired by ADR-011 — see E2E-G9-04.) |
| E2E-G9-02 | G-9 Two-pane M4/M5 | single | **Covered by E2E-M5-12** (read 2026-08-31), which sets a desktop viewport, opens a row and asserts the panel — and by E2E-M5-09, which asserts the sheet over the list at phone width. Kept as a pointer rather than renumbered: a reader arriving from an older commit has to land somewhere that says where the promise went. |
| E2E-G9-03 | G-9 One header bar | all | A drill-down renders exactly **one** `ion-header`, carrying `‹ back` and the page title; no screen supplies its own (ADR-011). |
| E2E-G9-04 | G-9 Root vs. drill-down | all | A tab root shows the logo and **no** back control; a drill-down shows back and no logo. |
| E2E-G9-05 | G-9 Back is reachable | all | Back is **clicked**, not merely asserted visible, and lands on the route's declared parent. Occlusion is invisible to `toBeVisible()` — this is the case the pre-ADR-011 build failed. |
| E2E-G9-06 | G-9 Cold-start deep link | all | Opening a nested screen directly, with a one-entry history, still returns to the parent trip on back (Navigation_Concept §7 contract). |
| E2E-G9-07 | G-9 Global group survives | all | Sync glyph (G-2) and settings (G-1) remain present on a drill-down — the reason a per-screen bar was rejected, since the conflict log has no other entry inside a trip. |
| E2E-G9-08 | G-9 List → detail → back | all | The everyday round trip entered through the trip list. Uncaught runtime errors are asserted with **no exemptions**. *(The known Ionic cross-outlet error the case used to filter is gone with ADR-012, which removed the second outlet; keeping the filter would only hide the next one.)* |
| E2E-G10-01 | G-10 Trip presence | server | Facepile of others on the trip, the **in-sync** badge, and the tap that names one person — plus the two absences that give the pile its meaning: no pile above one person, and none once the second leaves. **Revised 2026-08-28**: the per-person *sheet* this case once demanded was **replaced** by state on the faces themselves (UI-Spec G-10, FR-4.6) — it is not an unbuilt promise, and the ledger said so until 2026-08-30. ~~"the group-sync badge in both states"~~ — this case only ever renders one of them; the other is E2E-G10-02. Its `presence-behind` absence sits after a visible `presence-in-sync` and the two are a `v-if`/`v-else`, so that clause cannot fail on its own; it is kept as documentation of the exclusivity, not counted as coverage of it. The ✕ on the named line is not pressed here — the case dismisses by tapping the face again — and is unit-owned in `PresenceFacepile.spec.ts`, together with the ordering, the overflow and the ring's own rendering. |
| E2E-G10-02 | G-10 Trip presence, lagging | server | **Implemented 2026-08-30** (backlog item 6, the M20/G-10 audit), and it retires this row's predecessor sentence: ~~a device is behind only while its reported cursor sits below the trip head, and the client reports one the moment its pull returns, so an e2e case could only race it~~. That holds for a device that is *allowed* to pull. `drainTrip` reports the cursor only after the pull **returns**, so a device whose trip-partition requests are blocked keeps the cursor it had and the lagging state stands still — a settled state, not a moment. Bob's pulls are blocked, Alice moves the head, and her screen counts one straggler in the badge's bubble, drops the ✓✓, and names *„Bob · catching up"* on the tap while naming Alice *„up to date"*. Unblocking and moving the head again settles it back, which is what makes it a state rather than a latch. What it adds over the units: `hub_test.go` computes `in_sync` from cursors and `PresenceFacepile.spec.ts` rings whoever a prop says is behind — nothing said the server's answer is that prop. |
| E2E-G11-01 | G-11 Theming | all | **Covered by E2E-M17-06** (read 2026-08-31): it opens a device with no preference and asserts Mocha *before* touching anything, presses the toggle, reloads, and presses it back — the default, the switch and the persistence, in that order. ~~no flash of wrong theme~~ — **kept and named, not counted**: it is a claim about the frames before first paint, and every assertion available here reads the settled document. |
| E2E-G9-09 | G-9 Navigation repaints | all | A rail entry (≥900px) changes the URL **and** the rendered screen. Asserted against the *visible* page (`.ion-page:not(.ion-page-hidden)`), because the defect this exists for was a route change that never repainted — every URL assertion in the suite stayed green throughout it. |
| E2E-G9-17 | G-9/ADR-012 An interrupted anchor switch | all | Tapping the rail's anchors **without waiting for the transition** — items → trips → templates → items → trips → dashboard → trips — leaves the outlet showing exactly one page, and the screen the URL names still answers a tap (M2's import icon reaches M15). New 2026-08-31. The assertion is a *settled* count read after the URL has arrived, not a race: an interrupted push leaves its extra page there permanently, measured at z-index 101 over 100. E2E-G9-09 makes one settled switch, which is precisely what the defect survives. |
| E2E-G1-06 | G-1/ADR-012 The same rule on the tab bar | all | The bar's half of E2E-G9-17, below the breakpoint. One rule expressed in two templates needs two cases: the bar and the rail render from one anchor list but carry their own markup and their own handler. New 2026-08-31. |
| E2E-G9-10 | G-9 Back lands | all | `‹ back` from M4 renders the trip list, and none of M4's app-bar actions survive the move. Complements E2E-G9-05, which proves back is *reachable*; this one proves it *arrives*. |
| E2E-G1-03 | G-1 Only M4 is full-screen | all | `/trips/new` keeps the tab bar. The wizard shares M4's path shape without being a drill-down, and the rule that hides the anchors on the packing list took them from the screen a first-time user starts on. |
| E2E-G1-02 | G-1 Full-screen packing | all | The tab bar is hidden on M4 (§3.25) and present on every other screen — including immediately after leaving M4, so the trip screen can never be an exit-less one. |
| E2E-G12-02 | G-12 Search follows the screen | all | The magnifier opens the *current* screen's field (trip list, item inventory), and no other screen's field is in the DOM. Guards the pattern rather than one page. |
| E2E-G8-02 | G-8 No dev affordances shipped | all | The dev sample-trip seed is absent from a production build. It is a development convenience, not Demo Mode (retired in Addendum v2.10) coming back. |
| E2E-G11-02 | G-11 The brand marks where you are | all | The anchor you are on is the brand colour and the others are not — asserted in **both** presentations, the mobile tab bar and the desktop rail, because they are one rule that has drifted apart before. Compared against the role token rather than a hex, so the case holds in Latte too. |
| E2E-G11-03 | G-11 Brand, action and done stay apart | all | The FAB carries the brand gradient and contains no action colour; a packed checkbox is the done colour. Guards the drift this pattern exists to stop: Ionic paints its own primary on tabs, FABs and checkboxes unless told otherwise, one component at a time. |
| E2E-G11-04 | G-11 The anchors survive the flavour | all | The same role assertions in Latte, whose peach is a different hue entirely (`#fe640b` vs Mocha's `#fab387`) — a rule written against a hex would pass here by accident. Latte deepens the brand deliberately (G-11), which makes the role comparison the only assertion that can hold in both. Asserts the flavour actually switched before asserting anything about it, since the theme seed is device-local and easy to get silently wrong. |
| E2E-G11-05 | G-11 The brand's two forms agree | all | `--jp-brand` and `--jp-brand-rgb` resolve to one colour in both flavours. Latte writes the triplet by hand — CSS cannot derive it from a `color-mix()` — and Ionic's `rgba()` internals are its only consumer, so a stale value shows up as slightly-off ripples and nowhere else. Compared as bytes through a canvas, since `color-mix()` computes to `color(srgb …)` and a plain token to `rgb(…)`. |
| E2E-VIS-01 | Visual The four tab roots | all | Baselines for Dashboard, Trips, Templates and Items at 390 px and desktop. The four surfaces every screen rebuild lands on, so a token change that moves one of them shows up as a diff rather than as something the maintainer happens to notice. |
| E2E-VIS-02 | Visual M4 with rows | all | The product's core screen and the one every token decision was judged against. |
| E2E-VIS-03 | Visual M4 done-hidden and done-revealed | all | The two states FR-25.2 creates. The snackbar is dismissed before the shot rather than waited out — a baseline that sometimes contains a toast fails at random. |
| E2E-VIS-04 | Visual M4 filter sheet | all | A layer over the list, which is where the G-14 plane and elevation rules are most visible. |
| E2E-VIS-05 | Visual M4 in Latte | all | One flavour spot-check rather than a second copy of every state: the flavour is decided in one token block, and one screen using brand, done, both planes and the elevation ink is enough to notice it moving. Doubling the set would double what an image-digest bump rewrites, for coverage of the same block. |
| E2E-VIS-06 | Visual M11 container list | all | The first baseline outside M4, added on the owner's decision of 2026-08-16 when M11 was eyeballed. It earns its place on three things no other baseline renders: a load bar whose fill carries an FR-10.3 grade colour, the paired/imbalance line, and the card list itself. The load is real — a master item with a weight, quick-added through its suggestion — because a bar with nothing in it grades nothing. |
| E2E-VIS-07 | Visual M11 container sheet | all | Not a second copy of E2E-VIS-04's plane: this is the M5 sheet grammar applied to a container, and the load line and pairing chips inside it exist on no other surface. |
| E2E-VIS-09 | Visual M16 series profile | all | **New 2026-08-31.** The screen that had no coverage at any layer until 2026-08-30, and whose first render found FR-13.3's checklist input at **width 0** — Ionic gives `ion-select` `width: 100%`, and as a flex item that is a basis of the whole row. That is the class this gate exists for: every assertion passed, the element was in the DOM with the right computed flex and height, and only the pixel said the box was empty. The row is captured **with content on both sides**, a select carrying a value beside an input carrying text, because an empty row of the same geometry would not show the collapse coming back. |
| E2E-VIS-08 | Visual G-2 detail sheet | all | The one surface reachable from every screen in every mode, and covered by no baseline at all until 2026-08-23. It guards the header, the state line and the sheet's own plane — **not** the offset that prompted it: mutating E2E-G2-08's fix back moves 591 px, ratio 0.0018, and this gate allows 0.002, so it stays green. That is the documented consequence of the tolerance the owner fixed on 2026-08-19 (*"this gate catches layout changes, not small ones"*), recorded here as a second worked example rather than discovered again. The offset is E2E-G2-08's job. |
| E2E-M4-33 | M4 A pack registers, and can be taken back | all | Packing a row hides it *and* raises the snackbar; its undo returns the row to the open list, not merely to the revealed one. Run with `reducedMotion: 'reduce'` so the assertion is the outcome rather than the length of a transition — the production code takes its own no-motion path there, so nothing is being bypassed. |
| E2E-M4-34 | M4 One undo, not a stack | all | Two packs in a row leave exactly one snackbar, naming the second; its undo restores that row and leaves the first packed. Caught a real defect on first run: the outgoing snackbar's dismiss handler disarmed the *incoming* pack's undo. |
| E2E-M4-35 | M4 Un-packing announces nothing | all | Un-checking a revealed done row raises no snackbar — its result is already visible, and offering to undo it would be offering to undo an undo. Asserted against a **counter of announcements** rendered by the page, not against "no toast on screen": the snackbar is created asynchronously, so a bare absence check arrives first and passes on a page that was about to show one. It did exactly that until the counter replaced it. |
| E2E-G13-03 | G-13 An icon is a glyph box, not text | all | An empty-state illustration computes to 64 px while body copy stays under 20 px. Guards the reason the two scales are separate at all: sharing one would tie an illustration to whatever body copy does next, and nothing in the token tables would show it. |
| E2E-G13-04 | G-13 The section label renders as its role | all | On M17, a `.section-title` computes to uppercase, 12 px, the UI face, with tracking. Asserts the **rendered** properties rather than the class list — a class that is applied but overridden looks identical in the markup. Scoped to the visible page, since a route that does not repaint leaves the previous screen's markup in the outlet. |
| E2E-G14-01 | G-14 A card is a plane, not a hairline | all | The M4 group card's painted background differs from the page behind it, and it carries the elevation token and the card radius. This is the defect the pattern exists for: before it, both were `--ct-mantle` and this assertion compared *equal* — a card that passed every colour rule while being invisible as a card. Compared as bytes through a canvas, since a `--background` custom property and a computed `background-color` are the same paint in different notations. Also asserts the **list behind the cards** is not painted the card plane: Ionic reads `--ion-item-background` for `ion-list` too, so naming the card plane there gave every card a slab of its own colour to cast its shadow onto — the card/page comparison stays green throughout that. That assertion is also the only coverage of `ion-list:has(.jp-card)`, i.e. of `:has()` resolving alike in Chromium and WebKit; proved red in both. |
| E2E-G14-02 | G-14 Elevation follows the flavour | all | In Latte the card still casts a readable shadow. The assertion is that the shadow's ink is darker than the palette's **darkest surface plane**, not merely darker than the card — the first version made the weaker claim and passed with Mocha's ink substituted in, which is exactly the regression it was written to catch. Asserts the flavour actually switched first. |
| E2E-G14-03 | G-14 A card bounds the group, not its entries | all | Three trips in one M2 card: the first two draw a seam, the last does not (its seam *is* the card's bottom edge). Measured off the rendered `border-bottom-width` inside `ion-item`'s shadow root — the first version read `--inner-border-width` on the host and **passed against `lines="none"`**, the exact defect it was written for, because Ionic drives the line from an attribute selector and the custom property is simply unset on a row nobody styled. |
| E2E-G13-01 | G-13 Type reaches the screen | all | The UI face carries an Ionic control (through `--ion-font-family`, not merely inherited from `body`) and the display face carries the page title, **and both faces report `loaded`** — a missing asset leaves the computed style intact and silently paints the fallback. |
| E2E-G13-02 | G-13 Fonts are self-hosted | all | No request to any font CDN during a boot, and every `.woff2` the page did fetch came from the page's own origin (Addendum FR-21.6). The regression it guards is the prototype's Google Fonts link finding its way into the app, which would break Local Mode on a device with no network. |
| E2E-G9-11 | G-9/G-12 Reaching M11 and coming back | all | The luggage button in M4's app-bar cluster renders the container screen, M4's own actions do not survive the move, and back restores both the packing list and its cluster. **Extended 2026-08-19:** the *title* slot switches with the screen as well — M11 has a title, M4 registers none, and the registry is keyed per path, so a stale entry would leave M11's title standing on a screen that gave its own up. The M11 unit exercises the screen; getting *to* and *from* it is a global pattern and lives here — the rule the working agreement added after four navigation defects that both green screen suites had missed. |
| E2E-G1-04 | G-1/ADR-011 A global action gives back what it was opened from | all | Inside a trip, the gear then `‹` renders the packing list again — not the dashboard, which is the static parent `/tabs/settings` declares and the symptom the owner reported (2026-08-21). Positive signal is M4's own FAB; the negative one is that the settings control is gone from the document entirely, because a screen left mounted mid-transition is briefly not hidden either. |
| E2E-G1-05 | G-1/ADR-011 A cold start still falls back to the declared parent | all | Opening `/tabs/settings` directly — no origin, the notification-deep-link case ADR-011 exists for — and `‹` renders the dashboard. This is the control that keeps the fix from being "back = history": without it, E2E-G1-04 alone would pass against a build that simply popped the stack. |
| E2E-G9-12 | G-9/§7 A flow returns to the origin it was entered from | all | M18 opened from M2 returns to the trip list, where the declared parent is `/tabs/settings` (M18 is entered from M2, M7 and Settings). §7's *flows* row promised this behaviour and nothing implemented it. Asserted on the **pathname**: the first version compared `toHaveURL(/\/tabs\/trips$/)` and was false-green against the unfixed build, because the URL now carries `?from=/tabs/trips` and the regex matched the query's tail. |
| E2E-G9-13 | G-9/§7 The same contract for M15 | all | The spreadsheet import opened from M2 returns to the trip list, where its declared parent is `/tabs/items` (it is entered from M2 and from M9's empty state). Added 2026-08-23 with M15's first e2e coverage of any kind — until then nothing would have noticed the flow class regressing on this screen. |
| E2E-G12-01 | G-12 Actions in the app bar | all | On a detail screen (M4, M6) the app bar carries that screen's icon cluster; navigating away clears it, so the previous screen's search never filters the next one. *(Corrected 2026-08-13: the original clause also demanded the settings gear be hidden on a detail screen. ADR-011 decided the opposite and gave its reason — the sync glyph and settings are the only route to the conflict log from inside a trip — so the gear stays.)* |
| E2E-G12-07 | G-12 The trip's places are one tap each | all | **Implemented 2026-08-31, with its closing clause corrected.** Shopping (with open-item count), Luggage and Analytics sit on the trip title line and each lands in one tap. ~~**No ⋯ exists**~~ — reversed on 2026-08-25 by UX-13: M4 *does* carry a ⋮, holding the once-per-trip actions as words (E2E-M4-57), and M4's own cluster is search + filter + fold-all rather than two. What the clause protected is untouched and is what the case pins: none of the three **places** within the trip sits behind a menu. M6's app-bar cluster is search + filter. |
| E2E-G12-06 | G-12 Icon-only is still nameable | all | **Implemented 2026-08-31, and it found two icons with no name.** Read against the screen the subject is smaller than it sounds: the four anchors carry visible labels in both presentations, so the unlabelled icons are the app bar's and M4's three destinations. `header-back` and `header-settings` carried `aria-label` and **no `title`**, so a pointer resting on the back arrow or the gear was told nothing; fixed with the case. The two names are asserted to agree, and the accessible one is read as a name rather than off the attribute — Ionic relays `aria-label` into its shadow button. A plain tap **navigates**. ~~and a long-press shows it as a bubble on touch~~ — **struck by the owner 2026-08-31**, not built and not to be: G-12's own ⋮ already answers it on touch, and in words. **And the `title` half is narrower than the case makes it look**: measured over the source, only **9 of 62** icon-only buttons carry one, and the owner **narrowed the rule to the app bar** the same day, where the label was dropped to buy room. This case asserts the bar's names at runtime; the standing guarantee is `iconButtonLabels.spec.ts`, which reads the toolbar and whatever is slotted into it out of `AppHeader.vue` rather than from a list. |
| E2E-G12-03 | G-12 Actions survive the collapsing header | all | **Implemented 2026-08-31.** Scrolling M4 down collapses its sub-header, and search and filter still **act** from the collapsed state — the search narrows the list, the filter panel opens. The collapse itself was already driven by E2E-M4-45, which asserts what the list does with its offset; nothing had ever reached for the bar afterwards. Tappability is asserted through the outcome, because a button that is present and inert satisfies a visibility check. This is the reason the cluster lives there rather than on the status line. |
| E2E-G12-04 | G-12 The header line | all | **Implemented 2026-08-31, with two clauses corrected against the screen.** ~~renders a single line~~ — it is **two rows on a phone** (name + destinations, then progress + presence) and becomes one only above the G-9 breakpoint, where ADR-011's app bar has already taken the trip name off it; the case asserts both widths. ~~the filter chip row appears only when active~~ — reversed by FR-25.11a/b, which made that row the place the grouping is stated, so it is always present (E2E-M4-15). The clause that survives unchanged is the **search field**, absent until it is opened, and that is what nothing asserted. |
| E2E-G12-05 | G-12 Literal icons | all | **Implemented 2026-08-31.** Shopping, Luggage, Analytics and the Inventory anchor render four different glyphs — asserted as pairwise distinctness of the icon each button actually carries, including against the rail, because the trip's three neighbours are not the only glyphs the reader is holding in their head. Guards the regression where one generic glyph stood for several destinations, which defeats dropping the labels. |
| E2E-G15-01 | G-15 The mark's slot and ladder | all | **Implemented 2026-08-22** (`item-mark.spec.ts`). One item with a mark and one with neither, in the same list: M9 falls back to the **tag initial**, M4 to an **empty slot** and never to a letter, and the two slots measure the same width — which is the alignment promise, asserted on the painted boxes rather than on a class. *(The photo rung is the component unit's — see E2E-M5-15.)* |
| E2E-G15-02 | G-15 The mark is presentational | all | **Implemented 2026-08-22** (`item-mark.spec.ts`). A marked row's accessible name is the **item name alone** — the mark carries `aria-hidden` and contributes no text (FR-28.5). Asserted against the row's `ariaSnapshot()`, not the DOM, since the failure mode is a screen reader announcing "tent Zelt". |

---

## 4. Per-Screen Test Cases (M1 – M20)

Each case is **Given / When / Then**, tagged with mode(s) and the requirement(s) it exercises through the UI. IDs are
stable references for the traceability matrix.

### M1 — Dashboard
> **Read 2026-08-30, audit of backlog item 6.** Until that day **no test had
> ever rendered a populated M1**: the screen carried three `data-testid`s and
> all three were in its empty state, the visual baseline is taken on a fresh
> Local Mode with no trips, and every other spec passes *through* the
> dashboard on its way somewhere. Two of the six ids are now implemented
> (`e2e/dashboard.spec.ts`) and **three describe a surface that is not
> built** — open with the owner, deliberately untested.

* **E2E-M1-01** `all` (FR-6.1) — **implemented 2026-08-30** (`dashboard.spec.ts`), and two of its clauses are not the
  screen's. What is asserted: an **active** trip renders a card, the card counts what is open, previews three rows and
  reports the remainder as "+N more". The empty state's absence is asserted beside it, as the positive signal that the
  trip is active — M1 filters on the status, so a trip nobody started renders exactly the screen no trip at all does.
  ~~my open items~~: the dashboard is **not filtered by person**, it aggregates every open row of every active trip.
  FR-6.1's *"assigned to them"* has never been implemented, and **it is struck 2026-08-31 (owner decision)**: a filter
  would empty the screen in Local and Single-User Mode, where there is no account to be assigned anything. What the
  owner chose instead is the *highlight* — the delegation becomes visible without the list becoming personal
  (E2E-M1-03). The aggregation this case asserts is therefore the screen's settled shape, not an interim one. ~~next
  3~~: "next" names an ordering **nothing defines** — the preview is the first three of the store's own array, whose
  order after a reload is IndexedDB's over random ids. The case asserts three of four rows and the fourth counted, which
  is the rule the screen actually keeps; it flaked once on the wording before it did.
* **E2E-M1-02** `all` (FR-7.3) — **implemented 2026-08-30** (`dashboard.spec.ts`) for the two clauses that are built:
  the card lists open preparation todos **grouped by item** across active trips, and ticking one resolves it. The
  resolution is followed back into the trip — M4's prep badge, which counts open preparation off the todos themselves —
  because a card that merely stops listing the todo looks identical to a toggle that wrote nothing. ~~tapping the item
  name navigates to M5~~ — **not built**: the item name is a `<p>` with no handler and no link. UI-Spec M1 promises it
  too; owner decision.
* **E2E-M1-03** `server` (FR-6.1/6.3/4.4) — **implemented 2026-08-31** (`server/multi-user.spec.ts`): Alice assigns a
  row and it appears on Bob's dashboard **while he is looking at it**, marked new, without a reload; opening it leads to
  the row; and coming back the same row is listed and no longer news. Every assertion is scoped to **this case's row**
  rather than to the section, because the instance is shared and a sibling case delegating to the same account puts a
  section on the screen — the reason E2E-FLOW-02 filters its toast by item, arriving here as the same trap. Red-proved
  by dropping the join in `domain/dashboardSections.ts`.
* **E2E-M1-04** `all` (FR-6.3/G-4) — **half covered, half unbuilt.** That the card leads into M4 is asserted inside
  E2E-M1-01. ~~at the item~~: the preview rows are plain list items, not links, so M1 has no per-item deep link; the G-4
  landing itself is E2E-G4-01's, from a notification. The clause is retired here rather than left open, because the
  screen answering it would be a *new* affordance and G-4's own case already keeps the promise it names.
* **E2E-M1-05** `all` (G-7) — **implemented** (`trip-creation.spec.ts`, with E2E-M3-10): the empty state offers exactly
  one way forward and it reaches M3.
* **E2E-M1-06** `all` (**FR-5.1**, not FR-5.4 — the sentence cited the wrong requirement until 2026-08-30) —
  **implemented 2026-08-31** (`dashboard.spec.ts`): a trip departing **today** contributes its flagged, still-open rows
  to a cross-trip section, and only those rows; the section leads to each row. "Today" is *computed by the case* rather
  than waited for, so the clock is an input and not a race — the rule itself takes the date as a parameter
  (`domain/dashboardSections.ts`).
* **E2E-M1-06b** `all` (FR-5.1) — **new 2026-08-31**: the same flagged row on a trip departing **later** produces no
  section at all. The positive signal is the trip card, which is on the screen either way, because an absence read off a
  page that failed to load says nothing.
* **E2E-M1-07** `all` (FR-7.3) — **new 2026-08-31**: the prep card's item name opens **that row's** sheet, asserted on
  the sheet's own todo rather than on the trip having opened. UI-Spec M1 had promised the jump since the screen shipped
  and the name was a `<p>` with no handler.
* **E2E-M1-08** `all` (FR-6.1) — **new 2026-09-02**, with the planned-trips section: a trip left in `planning` by the
  wizard is listed on M1 *as planned*, with its period, and leads to the trip. Three assertions carry it rather than
  one, because each alone passes on a wrong screen: the section could be a screen that stopped filtering by status (so
  the trip must **not** also be an active card), and the absent card could be the screen this case was written against,
  which showed the trip nowhere (so the section must be there). **Starting the trip is the positive signal behind the
  absence** — the same trip changes sides, which is what says the section is keyed on the status rather than listing a
  leftover.
* **E2E-M1-03b** `local` (FR-6.1, G-8) — **new 2026-08-31**: Local Mode carries no delegation section, and the
  aggregation below it is still complete. The second half is the point: it is why FR-6.1's personal *filter* was struck
  rather than built.

### M2 — Trip List
* **E2E-M2-01** `local` (FR-2.1) — **covered, where the rule is actually exercised**: the segments *partition* the list,
  which E2E-M2-13c asserts from the other side (standing on *Archived*, the planned trip is `toHaveCount(0)`) and
  E2E-M2-13d again. The rest of the sentence is retired: ~~archived render muted with final stats~~ — the muting is a
  class the visual baselines own, and there are no *final* stats, an archived row carrying the same `packed/total`
  summary as every other row.
* **E2E-M2-02** `all` (FR-13.1): trips group under series headers with ~~destination +~~ count; tap header → M16. —
  **Written 2026-08-31**, and one clause corrected while writing it: the header carries the series name and a trip count
  and **no destination**. The count is asserted as the *group's* (a third trip in no series must not be counted into it)
  and the grouping as containment rather than as a heading being present. Previously: **writable since 2026-08-31 and
  still unwritten.** The screen groups by series and the header leads to M16. That was the option the 2026-08-08 concept
  review rejected, which is why this id stood unclaimed — **the owner ruled on 2026-08-31 that the built screen wins**,
  so the two documents saying *not grouped by series* are corrected to it and this case now describes behaviour that
  exists. It is not written here: writing it is a screen's work rather than a ruling's, and it goes to M2's next pass
  together with the empty state's missing test id (E2E-G7-01).
* **E2E-M2-03** `local` (FR-2.1/8.1) — **covered in three of its four parts and blocked on the fourth.** The name is
  asserted by every case that addresses `trip-row-<name>`, the dates by E2E-M2-12, the progress ring by E2E-M2-10 (its
  percentage, off a trip the device never opened). **Participant avatars are built since 2026-08-31** (owner decision),
  and this case's fourth part is asserted with them: the trip's *travellers* — the roster, not the presence facepile —
  as two faces and a „+N", plus a trip with nobody on it showing no pile at all, against a row that is demonstrably
  rendered. Until then: UI-Spec M2 removed the presence facepile on 2026-08-28 and left the words *„and participant
  avatars"* standing beside it; whether the trip's travellers belong on the row is an owner decision, not a test that is
  missing.
* **E2E-M2-04** `local` (FR-12.1) — **covered, and the gesture in this sentence never existed**: ~~long-press → context
  menu~~ — M2's row actions are a **slide**, and *Clone* is offered on an archived trip only. That the clone opens with
  the source's rows is E2E-M2-11 (`single`, ADR-033, the case that found ClonePage summing a partition the device did
  not hold); that ClonePage opens on a year of its own with empty dates is unit-owned in `ClonePage.spec.ts` — a *fresh*
  date is the absence of the source's, which is the shape a rendered case asserts worst.
* **E2E-M2-05** `server` (FR-4.5) — **implemented** (`e2e/server/multi-user.spec.ts`, 2026-08-30): Bob, an Editor on
  Alice's shared trip, is offered every other row action and not *Delete*; Alice, the owner, is. Her cancel leaves the
  trip where it was — without that half the confirm proves nothing about confirming — and her confirm takes it off her
  list and, after a reload, off Bob's, whose segment count is asserted first so the absence cannot pass against a list
  that has not arrived. `server` because `canDelete` reads the roster for the caller's own role: with one account the
  rule is inert by design, and the negative half exists nowhere else.
* **E2E-M2-06** `local` (G-8/FR-17.3) — **implemented** (`e2e/trip-list.spec.ts`, 2026-08-30): a device with no session
  is offered no *Share*, asserted against the row's other options so an empty menu cannot satisfy the absence. The
  positive half is E2E-FLOW-01's, on `server`.
* **E2E-M2-07** `local` (FR-18.3) — **implemented** (`e2e/trip-list.spec.ts`, 2026-08-30): the slide's *Export trip*
  asks progress-or-clean and the answer reaches the file — the same trip and the same row both times, `packed_count: 1`
  in one and no `packed_count` at all in the other. Both branches, because one alone cannot tell a working choice from a
  constant.
* **E2E-M2-08** `all` (FR-16.2) — **implemented 2026-08-31** (`trip-list.spec.ts`): an imported trip carries the chip
  and one made in the app does not. The imported trip is created **through M15**, the only writer of `trips.imported` —
  a fixture setting the column directly would assert the chip against a state the app cannot produce. Red-proved by
  dropping the render. *(Until then:* `trips.imported` is written by M15's migration, carried through the store into
  `Trip.imported`, and read by nothing: M2 renders no such chip. A column with a writer and no reader — the exact mirror
  of FR-25.19's `packer_user_id`, which had a reader and no writer.)*
* **E2E-M2-09** `local` (FR-18.4) — **covered by E2E-G9-12** (`e2e/global-nav.spec.ts`), which reaches M18 from the trip
  list and comes back to it. ~~overflow →~~ the entry is a button in M2's own title row beside M15's, not an overflow
  menu; the sentence described a menu M2 does not have.
* **E2E-M2-16** `all` (G-7, new 2026-08-31): M2's empty state states which segment is empty and offers **no CTA of its
  own** — the FAB is the way out, on screen either way (owner, 2026-08-31, M7's reasoning). Its own number rather than a
  second definition of E2E-G7-01, whose case tests the Dashboard's half: the gate allows one definition per id, and a
  shared id is the failure the M5 audit spent a day undoing. The state had **no test id at all** until this case, which
  is why nothing could assert it from anywhere. Asserted against the state going away once there is a trip — an empty
  state that is always on screen would satisfy the visible half on its own.
* **E2E-M2-15** ~~`all` (M2 ordering, 2026-08-08): the list renders **flat** — no series section headers — with the
  active trip first, upcoming trips **ascending** by date and archived ones descending, the series a chip on the row
  that opens M16 without also opening the trip.~~ — **renumbered from a second E2E-M2-06 (2026-08-30), and struck
  2026-08-31 (owner decision).** None of it is built: `TripListPage` groups by series with a tappable header, sorts
  every segment strictly newest-first through `tripOrderKey`, and renders no series chip. The case and the UI-Spec
  agreed with each other and disagreed with the screen for a year — **and the screen is what the owner kept**. The flat
  list, the ascending upcoming segment and the row chip are withdrawn; the promise that survives is E2E-M2-02's, which
  stops being a case nobody may write. Recorded rather than deleted, because the 2026-08-08 review that chose the flat
  list was a real decision — reversed here on a year of using the built one.
* **E2E-M2-13/13b/13c/13d** `local` (FR-2.8) — **implemented** (`e2e/trip-list.spec.ts`, 2026-08-29): with no active
  trip and one planned trip, opening M2 lands on **Planned** and renders that trip; with neither active nor planned and
  one archived trip, it lands on **Archived**; with nothing at all it stays on **Active** and shows the G-7 CTA. A third
  leg proves the rule cannot steal a non-empty segment: standing on *Archived* with trips on it, leaving M2 for another
  tab and coming back keeps *Archived* — which is also the only leg that exercises the re-entry hook rather than the
  mount. A fourth: `?status=active` with an empty *Active* still lands there, because the caller outranks the walk.
  `local` throughout, because the walk needs a device whose whole trip world the test built.
* **E2E-M2-14** `single` (FR-2.8, ADR-033) — **implemented** (`e2e/single/opening-segment.spec.ts`, 2026-08-29): the
  jump waits for a settled list. With the master pull held, M2 shows the segment labels **without counts** and stays on
  *Active*; when the pull completes it decides once. The held pull is the whole case — against an unsettled list the
  rule would send every cold start to *Archived* and, because it decides on entry only, leave it there. Which segment it
  then lands on is deliberately not asserted there — the `single` run shares one database, so other tests' trips are in
  the list too; it asserts that the segment it chose is one that holds trips. The counts as rendered text (`0` on an
  empty segment, nothing while unknown) are E2E-M2-13's, and the settled guard's own failure mode is unit-proved in
  `TripListPage.spec.ts` by flipping the signal after the assertion.

### M3 — Trip Creation Wizard
* **E2E-M3-01** `all` (FR-2.1/2.1a/15.1): step 1 metadata — name, dates auto-compute + display duration, attribute chips
  (season/transport/accommodation) set. Since 2026-08-26 (G-17, ADR-035) the dates are set through the `DateField`
  picker via `setDateField`, and the case asserts the field's rendered value is the locale display (`Sep 13, 2026`),
  never the ISO string the state holds.
* **E2E-M3-02** `all` (FR-13.1/13.2): series picker incl. inline "New series…"; picking a series prefills empty
  attribute chips from its defaults.
* **E2E-M3-03** `all` (FR-2.5): step 2 adds travelers **by name**; asserts there is **no** Adult/Child control and no
  type on the created traveler records (removed 2026-08-08 with FR-25.9).
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
  its own row. *Revised 2026-08-16 when the case was built:* the original text also promised a tab per scope and an
  "enthält: …" line on the Vorlage row, both carried over from M7-07. M3 has no scope segment — FR-27.6 asks for
  "sections/tabs" and a four-step wizard is not a place to add a second navigation control — and the "enthält" relation
  is stated from the other side, on the group rows that name the Vorlage bringing them, which does not repeat the same
  fact twice on one screen.
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
* **E2E-M3-20** `all` (FR-2.1d) — **new 2026-08-27**: with a start date already set, the end picker offers no day before
  it. Asserted on the calendar itself — a day before the start is disabled, a day after it is not — because "everything
  is disabled" would pass the first half alone. The picker is **re-opened** rather than opened: one that already holds a
  value opens on that value's month, so the grid under test is the same on any day of any year, while an empty picker
  opens on *today* and the case would rot with the calendar.
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
> **Read 2026-09-01, audit of backlog item 6 (the PWA row).** Three ids, all implemented, and the reading was clause by
clause against NFR-4.13's own sentence. Two products: **E2E-PWA-02's absence assertion could not fail against the rule
it named** — the worker caches nothing at runtime, so „no cache entry for `/health`" stayed green with `bypassed()`'s
whole body replaced by `return false` (measured) — and **the requirement's entire *Update policy* paragraph had no case
of any kind**, on any of the three ids.


* **E2E-PWA-01** `local` (NFR-4.13): once the service worker controls the page, a reload with the network cut still
  paints the app — asserted on the rendered chrome (header logo, visible page), never the URL. Settling is the worker's
  own lifecycle (`ready`, `controllerchange`), no timeouts.
* **E2E-PWA-02** `local` (NFR-4.13/NFR-4.2a) — **rewritten 2026-09-01**: the worker never **answers** `/api`, `/ws` or
  `/health`, all three asserted rather than one standing in for the class. The seam is a **planted response**: the case
  puts a marker body for each of those paths into a cache of its own, and `caches.match` searches every cache on the
  origin — so a worker that stopped bypassing would serve the plant. The positive signal beside it is a path the rule
  does *not* cover, which does come back as the plant, so an absence means the bypass rule and not a mechanism that
  never worked. The cache half (`/index.html` held, `/health` never in a shell cache) stays. *Why it changed:* the
  previous version asserted only that no cache entry appeared for `/health` — and the worker writes no runtime cache
  entries at all, so that assertion was green against a build with the never-cache rule deleted outright. It had been
  red-proved once, but by a **combined** mutation (bypass removed *and* a `cache.put` added), which is exactly what hid
  it.
* **E2E-PWA-03** `local` (NFR-4.13): the install declaration is complete — the manifest link and apple-touch-icon are in
  the document head, the manifest names JIT-Pack with standalone display and a maskable icon, and every declared icon
  URL actually resolves. A typo'd path here ships silently, because nothing else in the app ever fetches these files.
  **Since 2026-09-01 it also asserts the `theme-color`** — the one tag of the declaration that is not static, repainted
  by `theme.ts` from the active flavour's `--ct-base` (FR-21), so the case reads the meta and the computed token and
  compares them.

* **E2E-PWA-04** `local` (NFR-4.13, ADR-019) — **new 2026-09-01, the update policy's first case of any kind**: a new
  version installs in the background, is announced, does not touch the running app, and takes over on the next launch.
  Driving it needs a second worker on the origin, and registering a *different script URL on the same scope* is what
  produces one — a registration is keyed by scope, so the browser installs it into the registration the app is already
  holding and its `updatefound` is the app's own signal. Asserted: the new worker is **waiting** while the old one still
  controls the page; the G-2 glyph carries the dot and the sheet the sentence; the running app was neither reloaded (a
  `window` marker no reload survives) nor taken over under (`controllerchange` counted, and the controller re-read); and
  after the last client goes away — a *launch*, not a reload, which is why the case closes its page —
  `navigator.serviceWorker.ready` reports the new script active. **Not asserted (corrected 2026-09-02):** that the
  relaunched app announces nothing — it registers `/sw.js` again, a *third* script URL in this fixture, which the
  browser installs as a new waiting worker, so the dot comes back a moment later and an absence asserted in that window
  is green only by being early (measured). *(Mutation-proved twice: with `watchForUpdate` unwired the announcement never
  appears, and with `self.skipWaiting()` in the install handler the takeover count reaches 1.)*

* **E2E-PWA-05** `local` (FR-19.7, ADR-044) — **new 2026-09-02, the mirror of PWA-04**: the same waiting worker, applied
  *now* because somebody pressed for it. Shares PWA-04's fixture (a second script URL on the same scope). Asserted: the
  bar is on screen without opening anything, and the G-2 dot beside it; after the press the page is **replaced** — the
  settled state is a `window` marker no reload survives having gone, and `navigator.serviceWorker.controller` on the
  page that came up names the new script. **Deliberately not asserted (corrected 2026-09-02):** that the bar and the dot
  are gone afterwards. The relaunched app registers `/sw.js` again, which in this fixture is a *third* script URL on the
  scope and installs as a fresh waiting worker, so the announcement returns a moment later; the first draft asserted the
  absence in that window and was green only by being early (measured 2026-09-02). The two cases are the whole policy
  between them and neither covers the other: deleting the `message` handler leaves PWA-04 green, and moving
  `skipWaiting()` into `install` leaves PWA-05 green.
* **E2E-PWA-05b** `local` (FR-19.7): *Später* is its own outcome. The bar goes away, the old worker is **still** the
  controller, and the offer is still where it was before FR-19.7 — the dot, and the sheet's action behind it. Without
  this the dismissal could be wired to the same handler as the press and every other assertion would stay green.

*Chromium only:* Playwright hosts service workers only there; the worker under test is engine-independent and identical
in WebKit.

### M4 — Packing List (core)
* **E2E-M4-01** `all` (FR-8.1/7.3): the single header line shows packed/total, weight and the open-prep count (the
  latter only when todos exist), and stays **unfiltered** while a filter or search narrows the list below it. Analytics
  is reached from the 📊 icon on the trip line, not from the header (the KPI-tile entry is gone, G-12).
* **E2E-M4-29** `all` (trip screen, decided 2026-08-08) — **implemented**, and one clause retired. Landing **directly**
  in M4 from M2 or M1 is asserted by `expectTripOpen` at every caller in the suite; the archived trip's closing card,
  *Vorlage aus dieser Reise* and the M14 suggestions are E2E-M4-53/54's and E2E-M21-01's. *„No phase tab bar anywhere in
  the app"* is **retired 2026-08-30**: it guards a design rejected before anything was built, so there is nothing to
  regress to — an assertion on the absence of a screen that never existed has no positive signal and would stay green
  through any defect.
* **E2E-M4-02** `all` (FR-8.2): grouping switcher Category/Container/Person/Status; selection persists per user per trip
  (survives reload; a second user/other trip unaffected).
* **E2E-M4-03** `all` (FR-5.1/G-6) — **corrected 2026-08-30, audit of item 6**: item rows show state, stepper/checkbox
  and the mode, late-packer, traveler and packer marks. Each is asserted where it belongs rather than as one omnibus
  case — the control column in E2E-M4-56, the traveler in E2E-M5-19, the packer/assignee edge in E2E-M4-30 — so this
  entry is a description of the row and not a case of its own. **The container chip it also promised does not exist**:
  M4 answers *which bag* by grouping (FR-8.2), not by a chip, and a fifth mark on the right edge is exactly what
  FR-25.19 kept off it. **Struck 2026-08-31 (owner decision): the chip is not owed.** M4 answers *which bag* by
  grouping, and the right edge stays as FR-25.19 left it — a fifth mark there is exactly what that requirement kept off
  the row.
* **E2E-M4-04** `all` (FR-5.6/9.1): inline quick-add with master-item autocomplete; free text creates an ad-hoc item; on
  an active trip new items auto-flag *Missing*; input stays expanded.
* **E2E-M4-05** ~~`all` (FR-5.2): swipe right → *Packing Now*.~~ **Retired 2026-08-30**: M4 has no swipe. FR-5.5's work
  removed the gesture rather than repairing it (backlog item 11) and press-and-hold took over every action it carried;
  `ion-item-sliding` survives on M2's trip list alone. The claim itself lives on in E2E-M4-49.
* **E2E-M4-06** ~~`all` (FR-4.3/5.5): swipe left → assign-to-me or skip.~~ **Retired 2026-08-30**, with E2E-M4-05. The
  behaviour it described is covered by the menu that replaced the gesture: E2E-M4-37 skips, E2E-M4-38 undoes, E2E-M4-39
  un-skips, and the collapsed *Erledigte* section is E2E-M4-23's.
* **E2E-M4-07** ~~`all` (FR-20.2): skipping cascades co-skip of dependent companions with a reason.~~ **Retired
  2026-08-30 as a duplicate**: E2E-M4-40 asserts exactly this sentence — the cascade, the single snackbar naming the
  companion, the reason on the revealed row and the one undo restoring all of it — and has since 2026-08-18. Two ids for
  one rendered outcome is how a suite grows a case that only ever re-runs another.
* **E2E-M4-08** `all` (FR-7.3) — **implemented 2026-08-30** inside E2E-M4-25, which is its lifecycle: open prep todos
  render a count badge on the row (`m4-prep-badge-<name>`), and it is gone once the todo is. **The amber „packed with
  open prep" style is M5's, not M4's**: the Addendum realises it there (2026-07-18), and on M4 a row with open prep is
  distinguished by *staying on the list* plus its badge. **Struck 2026-08-31 (owner decision): the amber stays M5's.**
  On M4 such a row is distinguished by staying on the list plus its badge, and the sentence is removed rather than
  asserted.
* **E2E-M4-25** `all` (FR-7.3/25.2) — **implemented 2026-08-30** (`e2e/packing-list.spec.ts`): the full lifecycle in one
  case — an item packed while a prep todo is open stays **visible** and does **not** count as done (asserted on the
  reveal bar being absent, which is the positive signal for „nothing is done"); **resolving its last todo makes it done
  and it leaves the list**; revealing brings it back without a badge. The regression guard is the point and is
  mutation-proved: handing the view an empty `itemsWithOpenPrep` reddens it. The entry's second direction — *an item
  with a todo but no stored count still shows its badge* — is retired with the count it describes: nothing stores one
  any more (FR-7.3's 2026-08-08 clarification), so there is no state to assert against.
* **E2E-M4-09** ~~`all` (FR-7.2): an item with open tasks refuses completion with an inline hint.~~ **Retired 2026-08-30
  — the rule is reversed.** It restates PRD_Base FR-7.2 (*„An item cannot be fully marked as ready until all nested
  tasks are Resolved"*), which the Addendum's FR-7.3 overrides and the Addendum wins: packing such a row is *allowed*
  and produces the „packed with open prep" state, which stays visible and does not count as done (FR-25.2). There is no
  refusal and no hint in the screen, deliberately — refusing the tap would leave a packed rucksack the app says is
  empty. What the id was reaching for is E2E-M4-25.
* **E2E-M4-10** `server` (FR-4.4) — **implemented** (`e2e/server/multi-user.spec.ts`, inside E2E-FLOW-01): a row Alice
  packs reaches Bob's screen **without a reload**, carrying her name — the attribution is the server's own stamp
  (invariant 3), which is what makes it worth two accounts. The *animation* the entry also named is not asserted and
  will not be: motion is spec §3's untestable half, and the suite runs with it reduced.
* **E2E-M4-11** `all` (FR-3.2) — **implemented 2026-08-30** (`e2e/packing-list.spec.ts`): the toolbar's shopping entry
  is always there — M6 is a screen, not a notification — and carries a **count only when something is to be bought**,
  since a badge rendering a zero is worse than none. The archive half of the original sentence is E2E-M4-54's (*Fertig*
  archives and lands on M14).
* **E2E-M4-12** `all` (FR-25.8/25.1) — **implemented** (`e2e/membership.spec.ts`, one case): asserted in the same case
  as E2E-M4-58, whose *two of three at different amounts* is this entry's world with the numbers pulled apart; every
  clause below is a clause of that case, and running both would run one rendered outcome twice. As written: quick-add in
  *per person* mode for two travelers produces **one named cluster** "Jacke" with a `0/2` sub-header and exactly two
  indented child rows, each showing its traveler and its own check control. Asserts there is **no** second top-level row
  repeating the name — the regression found on 2026-08-07 was N separate items, where every individual row looked right
  and only the grouping was wrong, so the assertion must be on the cluster structure and the absence of duplicate
  top-level rows, not merely on "two rows named Jacke exist".
* **E2E-M4-13** `all` (FR-25.1 flat fallback) — **implemented** (`e2e/membership.spec.ts`, inside E2E-M5-19): a
  per-person item with exactly **one** member renders as an ordinary flat row labelled with that person („Kurze Hosen ·
  Andy“), **not** a one-child cluster — both halves asserted, since a cluster of one would also name Andy in its child.
  **Its original premise is gone** (2026-08-29): it read *„the same quick-add for a single traveler“*, and FR-25.8's
  mode is **absent** on a trip with one traveler (G-8), so the state is reached by a membership of one instead — which
  is where E2E-M5-19 already arrives.
* ~~**E2E-M3-13 (v1.0 catalogue, shadowed)** `all` (FR-2.5a): travellers configured in M17 are already in step 2 of the
  next new trip, in order, and removing one there still works.~~ — **retired 2026-08-30 as a duplicate**: **E2E-M3-14**
  is the same promise, and its test body carries every clause of this one — the M17 configuration, the three names in
  step 2, the **order** (the first is Andy) and the removal that makes them a starting point rather than a rule. Read
  clause by clause before retiring: a summary sentence elsewhere is not automatically the same set of promises. The
  number's live meaning is FR-27.7's preparation tasks.
* ~~**E2E-M3-12 (v1.0 catalogue, shadowed)** `all` (FR-2.1c): step 1's optional inputs are **absent** until *Mehr
  Optionen* is opened, and a value set behind the fold is stated on the folded row.~~ — **retired 2026-08-30 as a
  duplicate**: **E2E-M3-16** is the same promise, implemented in `global-nav.spec.ts`, and it asserts both halves
  including the folded row naming the date it holds. The number's live meaning is FR-27.3's single master items.
* ~~**E2E-M3-11 (v1.0 catalogue, shadowed)** `all` (FR-2.1b): a trip is created with **no date touched at all**, and
  reads by its year in M2 where a date line would be.~~ — **retired 2026-08-30 as a duplicate** (audit of the id
  collisions): **E2E-M3-15** is the same promise and is implemented in `global-nav.spec.ts`. The number's live meaning
  is FR-27.1/27.2/27.6's composition step, which the suite carries.
* **E2E-M4-20** `all` (FR-25.11b-rev): the filter panel has **no apply button** — asserted as *absent*, not merely
  unused — and a facet value bites while the sheet is still open: the head's outcome line and the list behind it both
  follow the tap. Closing only closes.
* **E2E-M4-15** `all` (FR-25.11a/b): M4 shows a single filter row; tapping it opens the sheet with *Gruppieren nach*
  plus the five facet groups (Person, Kategorie, Beschaffung, Gepäck, Merkmale). Selecting a person narrows the list,
  and the selection appears as a removable chip in the collapsed row; tapping the chip's × restores the unfiltered list.
  Asserts the grouping switcher is **not** present as a second bar in the header.
* **E2E-M4-16** `all` (FR-25.11c) — **implemented** (`domain/__tests__/packingView.spec.ts`: *ORs the values within one
  facet* / *ANDs across facets*): the OR-within / AND-across rule is arithmetic over a row list and is asserted where it
  lives. Building the world it needs through the browser — rows carrying two categories, three travelers and a buy mode
  — would cost a wizard run and three sheets to re-check a decided function. E2E-M4-20 already proves the panel is wired
  to it.
* **E2E-M4-17** `all` (FR-25.11d) — **implemented** (`domain/__tests__/packingView.spec.ts`, four cases): a value counts
  against the *other* active facets but not its own, dead ends are not offered, counts run over open rows only, and a
  selected value stays listed at zero so a filter can always be undone from the panel. Same reasoning as E2E-M4-16.
* **E2E-M4-18** `all` (FR-25.11e): the "Alles gepackt 🎉" state appears **only** when nothing is narrowing the list. Four
  cases, all required: **search** with no match, **filter** with no match, **search + filter** together, and
  genuinely-everything-packed. The first three must all show "Keine Treffer" naming what is in force; only the fourth
  may celebrate. The reset offered clears **everything** narrowing — after pressing it, both the search term and the
  filter set are empty and the list is back. Regression guard: searching for a string the list does not contain
  announced completion, because the check looked at the filter count only.
* **E2E-M4-19** `all` (FR-25.11f) — **implemented 2026-08-30**, in two places on purpose. That the shared bucket
  **leads** the Person facet is `packingView.spec.ts`'s (*leads the person facet with the shared bucket rather than
  sorting it in*), because the sort lives there. The **word** is `e2e/packing-list.spec.ts`'s, because the unit
  deliberately labels only the values it can and leaves UI copy to the caller: three facets address absence with the
  same empty value, and one shared label makes Person read as „keine Kategorie". The case asserts the Person bucket's
  label differs from the Category bucket's and is not a form of *Alle* — the FR's own wrong answer, since the bucket
  means *nobody in particular*, not *everybody*.
* **E2E-M4-21** `all` (UI-Spec M4 group presentation): the group heading's computed size is **larger** than an item
  row's, and a group's rows sit in one block of their own. Asserted on computed style rather than on a class, because
  the defect was purely visual: everything rendered, in the wrong order of importance.
* **E2E-M4-22** `all` (FR-25.16): tapping a group header folds that group to **its header line alone**, which then reads
  "‹Gruppe› · N offen" — asserts **no** extra stub line is rendered and that N matches the group's open rows in the
  model. Other groups stay untouched. The app-bar fold-all control collapses every group to headers with **zero item
  rows** and flips its label to *Alle aufklappen*; pressing it again restores the full list. The folded set survives a
  re-render — packing a row must not unfold the rest.
* **E2E-M4-23** `all` (FR-25.16/25.2): a group whose rows are **all** done disappears completely — no header and **no
  stub** — and reappears only when *Erledigte* is switched on. Asserts folding and doneness stay separate concepts: a
  folded group with open items is still on the list, an absent group is not.
* **E2E-M4-24** `all` (FR-25.17) — **implemented 2026-08-30**, split by what each mode can reach. The **time**, and that
  un-packing clears the stamp so it never outlives the state it describes, is `e2e/packing-list.spec.ts`'s: Local Mode
  has no account, so `packed_by_user_id` is null and the stamp reads its time alone. The **name** is E2E-FLOW-01's,
  where the server stamps the column itself. The avatar beside it is E2E-M4-30's.
* **E2E-M4-36** `all` (FR-25.13a, revised 2026-08-17) — **implemented** (`e2e/packing-list.spec.ts`): M4's ＋ hides while
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
  and cancelling the menu leaves the row's ordinary tap working. M7 paid for this once: the release of a hold usually
  lands on the overlay rather than on the row, so a "swallow the next click" flag goes stale and eats a later,
  legitimate tap. **Not asserted here:** that a G-3-locked row has no menu at all — the guard exists in
  `PackingListPage.vue`, but a lock needs a second user and therefore `server` mode, which this unit does not have.
  Recorded rather than implied.
* **E2E-M4-42** `all` (FR-5.5, FR-25.1) — **implemented**: the same menu on a **per-person child row** inside a cluster
  — skipping one traveler's row leaves the other traveller's standing, and the revealed child carries the mark. The
  gesture is written into *two* templates, and the ordinary row keeping it says nothing about the child; a family trip
  is mostly child rows. Mutation-proved on its own: removing the child row's handler reddens this case alone.
* **E2E-M5-16** `all` (FR-5.5) — **implemented** (`e2e/skip-item.spec.ts`): the M5 sheet's control reads *Nicht
  einpacken*, skips on tap — the sheet's own state line then says so — and flips to *Doch einpacken*, which takes it
  back. The findable half of the pair; a screen keeping its half says nothing about the other, which is why this is not
  folded into the M4 cases.
* **E2E-M4-30** `server` (FR-25.19) — **implemented 2026-08-30** in two layers. The rule — the packing record beats the
  assignment, and a row carries **one** right edge — is `domain/packingView.spec.ts`'s `rowEdgeAvatar` block, five
  cases; it moved out of `PackingListPage.vue` to get them, having been unreachable by any test since the concept round.
  The rendered half rides on E2E-FLOW-02 (`e2e/server/multi-user.spec.ts`): Bob is responsible, Alice packs, the edge is
  Alice with the packer's tick and there is no second avatar. Two accounts are what the case needs — with one, the two
  columns cannot hold different people and the rule is satisfied by accident. Mutation-proved by inverting the
  precedence. The M5 sheet's read-only packing record is asserted inside E2E-M4-24 since 2026-08-30 (`m5-stamp` carries
  the time and no control) — it had been called an M5 case without an id, and nothing drove it. **Not asserted, and
  recorded rather than implied:** the same edge on a per-person *child* row. `rowEdgeAvatar` is called from two
  templates and the rule is now one function, so a child cannot disagree with a row about the precedence — but whether
  the child renders the avatar at all is a second template's business, and reaching it costs a cluster, an assignment
  and two accounts at once. It is the same shape as E2E-M4-42's argument for covering the child row's menu separately,
  and it predates this PR.
* **E2E-M4-31** `server` (FR-25.20) — **implemented** (`e2e/server/multi-user.spec.ts`, inside E2E-FLOW-02): a row
  assigned to Bob leaves Alice's list, the reveal bar states it and names him, the empty state says so rather than
  blaming a filter nobody set, and one tap shows the row. **The header guard landed 2026-08-30**: the packed/total text
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
* **E2E-M8-20** `all` (FR-27.10, added 2026-08-19) — **implemented** (`e2e/group-to-trip.spec.ts`): M8's composer is the
  *same component* with the group offer switched off, so M4 gaining groups could hand them to a screen where FR-27.1
  forbids nesting one. The case asserts the absence beside a **positive signal** — the free-text hint, which is the line
  M4 hides when groups match, so a leaked prop reddens it. Mutation-proved on both browsers.
* **E2E-M8-21** `all` (FR-25.13c, added 2026-08-21) — **implemented** (`e2e/template-editor.spec.ts`): the empty
  composer offers the chip rows — the related row headed by the contributing tag ("Passt zu Hygiene"), fed by the
  group's own contents; a chosen item is offered in **no** row, asserted beside the rendered chip that proves the row
  exists; a chip tap lands an FR-25.7 Standard row without the keyboard ever rising; and the recents trail crosses
  scopes — a fresh group offers what the last one just used, recency first. Tagged inventory is built through M10's own
  path, because the related row keys on primary tags and nothing else.
* **E2E-M8-22** `all` (FR-25.13d, added 2026-08-22) — **implemented** (`e2e/template-editor.spec.ts`): the empty
  composer's *„Mehr aus dem Inventar…"* line opens the browse-sheet; the tag axis narrows on **any** tag (the two
  matching rows are the positive signal for the absent third); two taps land two positions in a run, each tapped row
  flipping to *„schon drin"* in place while the sheet stays open; the sheet contains **no input** — free text is the
  explicit footer line, which dismisses the sheet and focuses the composer's field; the run's rows are on the editor
  with the FR-25.7 defaults. The sheet's own rules (grouping, carried-as-state not tappable, no-match line) are pinned
  in `InventoryBrowseSheet.spec.ts`.
* **E2E-M4-27** `all` (FR-27.10) — **implemented** (`e2e/group-to-trip.spec.ts`): tapping a group whose positions are
  all present adds nothing and says so; the row count is unchanged. Second direction: on a trip that still follows its
  groups the added group becomes one of the trip's sources, so a subsequent edit to it reaches the trip as an FR-27.4
  proposal the trip can apply (the applied-changes *log* half stays with E2E-M8-09). On a **past** trip — archived, or
  the end date gone by — nothing is registered. *Corrected 2026-08-19:* this entry said "on an active trip it does not —
  the trip is frozen", which predates FR-27.4's revision of the same day: a running trip still follows its groups, and
  only the past is frozen. **Two halves are asserted in unit tests instead, deliberately:** the *Missing* flag of M4-26
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
  its rows. Two separate defects hid here and both read as *lost data* rather than as what they were: the app-bar
  actions were teleported into the header's DOM, which Ionic relocates, so Vue crashed mid-patch and aborted the render;
  and the Local Mode write was fire-and-forget, so a row added and immediately followed by a reload went into a
  transaction the navigation cancelled. The case must **wait on the sync indicator returning to its settled state**,
  never on a duration — if there is nothing observable to wait for, that absence is the bug.

* **E2E-M4-14** `all` (FR-25.1/25.2) — **implemented 2026-08-30** (`e2e/membership.spec.ts`): packing one instance of a
  two-person cluster keeps the cluster intact — the packed child drops out (FR-25.2), the head still counts over the
  full set (`1/2`), and the remaining instance is still a **child**. The rule is unit-tested twice in
  `packingView.spec.ts`; what this case owns is M4's own wiring, because the screen holds a full set and a hidden-done
  one and handing over the wrong one flattens the survivor the instant its sibling is packed — restructuring the list
  under the finger that is mid-tap.

### M5 — Item Detail

**How to read this section (2026-08-30, audit of backlog item 6).** M5's
catalogue had grown two blocks that never met, and **six numbers meant two
different things**: `E2E-M5-06`, `-07`, `-09`, `-10`, `-11` and `-12` each
carried one promise from the original v1.0 list and a second from the §3.25
rebuild. The suite implements the rebuild's meaning of `-09`…`-12`, so four
green tests read as coverage of four promises nothing asserted, and §7
pointed FR-3.3, FR-4.3, FR-6.2, FR-7.3, FR-20.1, FR-20.4 and FR-22.1 at the
invisible half. It came about in two steps: `19d9826` (2026-08-09) defined
`-06` and `-07` twice **inside one commit**, and `dd560d4` (2026-08-14, the
M4/M5 rebuild) appended `-09`…`-12` on top of an existing `-09`…`-12`.

The rule that resolved it: **a number means what the suite implements.** The
shadowed entries are struck through in place, each saying where its promise
actually went, and are marked *(v1.0 catalogue, shadowed)* so no number is
ever ambiguous again. The two promises that survived and had nowhere to live
got fresh numbers at the end — `E2E-M5-22` and `E2E-M5-23`. Nothing was
renumbered, because a reader arriving from an older commit has to be able to
find out what happened to the id it names.

**And it is a gate now, because it was never catchable by eye.**
`scripts/case-id-gate.mjs` (in `make ci` and the CI client job) fails when an
id has more than one *live* definition; a struck entry keeps its number on
purpose and is a tombstone, not a definition. Writing it turned up **four more
collisions on other screens** — `E2E-M3-11`, `-12`, `-13` and `E2E-M4-32`, each
a live pair carrying two different promises. They were held in the gate as a
shrink-only debt register and **resolved on the same day** — three were
duplicates of ids implemented under their own number, and the fourth left one
clause the quick-add has never kept. The register is gone with them: the gate
now carries one rule and no escape hatch, so a collision has to be resolved
rather than registered.


* **E2E-M5-09** `all` (UI-Spec M5): tapping a row opens the detail **over** the list — M4 stays on screen — and the ✕
  returns to the trip's own URL.
* **E2E-M5-10** `all` (G-4): a cold boot straight onto an item URL opens the same sheet, since the route is the state.
  Its ✕ leads back to the trip.
* **E2E-M5-11** `all` (UI-Spec M5 rework): packing, preparation and notes are on the first level; every attribute
  control is **absent** until *Details* is opened. **Extended 2026-08-27 (UX-10):** the packing block carries its
  eyebrow label („Einpacken" / "Packing"), the same pattern as the prep and notes sections.
* **E2E-M5-12** `all` (G-9): at desktop width the same content is a side panel beside the list, not a sheet over it.
  **Revised 2026-09-05 (ADR-046):** and the page showing the panel is the same element that showed the list — asserted
  by identity, because the path-parameter build mounted a second M4 on every open, which stood unhidden beside the first
  for as long as its children took to become ready: three red WebKit runs in a day, never reproducible on an idle
  machine. Mutation-proved — a page keyed on the open item, i.e. a remount on open, reddens it on WebKit.
* **E2E-M5-13** `all` (Navigation Concept §7 case 4) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against
  the unguarded build): the **browser's** back with the sheet open closes the sheet and stays on the packing list — the
  replace-based overlay history must not let a pop skip M4 and land on the trip list. The write-side rule is
  unit-specified in `src/router/__tests__/overlayBackGuard.spec.ts`.
* **E2E-M5-14** `all` (G-14/FR-21.8) — **implemented** (`e2e/item-detail.spec.ts`, red-proved against the 26 px build):
  the header's save indicator and ✕ share a diameter and a centre line. Measured on the rendered boxes, both read in one
  frame so the sheet's enter animation cannot fake a difference.
* **E2E-M5-17** `all` (FR-9.1) — **implemented** (`e2e/item-detail.spec.ts`): the two trip-feedback flags are controls
  behind *Details ▾* and appear **only once the trip runs** — the same case starts the trip and marks the row *unused*,
  so the absence half has a positive signal beside it rather than passing on a typo. Read back from the glance chip,
  which renders off the stored row.
* ~~**E2E-M5-06** `all` (FR-25.14): opening a **per-person** item shows its total as a **read-only chip** ("0/3") with
  **no** +/− control on it, and one row per traveler each carrying its own check or stepper.~~ — **retired 2026-08-30
  (owner): superseded by FR-25.21.** M5 no longer shows the whole set — it opens on **one instance** and names its
  traveler and that instance's amount (UI-Spec M5, 2026-08-29). The `0/3` head and the untouched siblings moved to M4's
  cluster, where **E2E-M5-18** asserts both. FR-25.14's actual rule, that a summed total is never a stepper, survives
  there.
* **E2E-M5-07** `all` (FR-25.15) — **implemented 2026-08-30, and the audit's load-bearing finding.** The sheet has **no
  Save button** — asserted in E2E-M5-11, beside the indicator that stands instead of one — and the indicator says
  whether *this device* has captured the edit. It did not. All four sheets that carry it handed it `syncStatus.state`,
  **G-2's own state**, which is the one thing FR-25.15 says it must never be; and that state answers `offline` before
  `syncing`, so a write still open on a device with no network rendered as **saved** — the single case the requirement
  exists for — while a background pull on a device with a network rendered as *saving*. The signal is now
  `capturePending`, which counts this device's own open writes and nothing else. **Asserted where it can fail:**
  `composables/__tests__/captureState.spec.ts` (five cases, the offline one included) and three under *M5 FR-25.15 save
  indicator*; a browser could only race the transient ●, so no e2e claims it. **And asserted across all four sheets, not
  only this one** — `saveIndicatorWiring.spec.ts` scans every call site, because the defect was one wrong line copied
  into four templates and a behavioural case on M5 says nothing about M8, M10 or M11. It counts the call sites it found
  before judging them, so a scan that matched nothing cannot pass quietly. The *Details* toggle needs no case of its own
  — it writes nothing, so an assertion that it does not flip the indicator could not fail.
* ~~**E2E-M5-01** `all` (FR-4.2): distinct *Used by* (traveler) vs *Packed by* (user) sections.~~ — **retired 2026-08-30
  (owner), the screen reversed it.** The free-form *Used by* label was dropped on 2026-07-18 (UI-Spec M5) and replaced
  by *„Wer braucht das?“*: for-whom is per-person **membership**, not a caption. FR-4.2's two halves are both asserted,
  apart — the packing record in E2E-M4-24/-30, the traveler in E2E-M5-18/-19.
* **E2E-M5-02** `all` (FR-3.1/10.2) — **implemented, split across three cases** (2026-08-30): both controls exist behind
  *Details ▾* per E2E-M5-11, the mode is actually *switched* in `e2e/shopping.spec.ts` (a row set to *Buy before* leaves
  M4 for M6), and the container is switched in **E2E-M5-22**. This entry describes the fold's contents; it is not a case
  of its own.
* ~~**E2E-M5-03** `all` (FR-9.1): Unused/Missing flags visible only on active trips.~~ — **retired 2026-08-30 as a
  duplicate**: E2E-M5-17 is the same sentence, implemented, and carries the positive signal beside the absence that this
  one does not ask for. Same disposal as `M4-07 → M4-40`.
* **E2E-M5-18** `all` (FR-25.21, added 2026-08-29): on a shared item, open *Wer braucht das?*, switch to *Pro Person*,
  check Andy/Leonardo/Mia and set 2/3/1. Asserted **in M4 on the rendered cluster**: the item is named **once**, three
  child rows carry three *different* amounts, and the head reads `0/3`. Deliberately not a row-count assertion —
  FR-25.8's own history records an implementation that created N unrelated items sharing a name and satisfied every
  count.
* **E2E-M5-19** `all` (FR-25.21): from a roster of three, remove the traveler whose row has packed progress. The confirm
  names the count; *Abbrechen* leaves all three standing; confirming leaves exactly two and the head reads `0/2`. Then
  remove a third whose row carries nothing: that one is written **without** a question. The cancel half is the positive
  signal that a removal is a decision rather than a side effect of tapping a checkbox, and the silent half is the
  positive signal that the question is raised by what it would cost and not by the control.
* **E2E-M5-20** `all` (FR-25.21b): collapse back to *Gemeinsam*. One row remains at quantity **5** — the sum, not the
  largest — and the preparation todo written on the surviving row before the conversion is still on it afterwards. That
  last clause is the one worth having: ADR-036 chose keep-and-repoint over delete-and-recreate precisely so a structural
  edit cannot destroy the content hanging off a row, and this is the only place that claim is asserted where it would
  actually be lost.
* **E2E-M5-21** `all` (FR-25.21/FR-5.5, added 2026-08-30) — **implemented** (`e2e/membership.spec.ts`): an item added
  with FR-25.13f's ✕ (*„zu Hause gelassen"*, quantity 0 and state *skipped*) and then split per person, whose smallest
  membership is 1. The conversion **asks first**, naming the item, and cancelling is the positive signal that the
  question is a gate — the amount does not appear. After confirming, the assertion that carries the case is that the row
  is **on the list**, labelled *„Kurze Hosen · Andy"*: `isDone` reads *skipped* as done, so before this rule the row was
  created and hidden in the same breath, and only a visible row disproves that.
* **E2E-M5-22** `all` (FR-10.2, new 2026-08-30) — **implemented** (`e2e/containers.spec.ts`): moving an item from one
  container to another through M5's picker. E2E-M11-06 covers only the *first* assignment, out of the unassigned bucket;
  changing an existing one has only ever been possible here, and E2E-M11-03 said so in writing without the case ever
  following. The readback is on **M11 and by weight** — the two cards are the only surface stating where the thing
  actually is, and a control repainting its own value would satisfy anything asserted inside the sheet. The bucket count
  is the third assertion: a move that dropped the old assignment without writing the new one leaves the item nowhere,
  and both card assertions would still pass. Red-proved by ignoring a write onto a row that already has a container —
  E2E-M11-06 stays green against exactly that.
* **E2E-M5-23** `all` (FR-20.1/20.4, new 2026-08-30, carrying M5-10's promise) — **implemented**
  (`e2e/item-detail.spec.ts`): the sheet offers the *suggested* companion its item is missing, an unrelated third master
  item is **not** offered, one tap lands the row on M4, and re-opening the sheet the section is **gone**. The last
  clause is what makes it a live derivation of the list rather than a stored hint, and the negative one is the positive
  signal against a section that simply lists everything. FR-20.4's *required* companions join without being asked and
  are E2E-M4-40's; this case owns the asking. Red-proved by treating `suggested` as `required`, which makes the
  companion join on quick-add so the section never renders.
* ~~**E2E-M5-04** `all` (FR-14.1): history sparkline of quantities from previous series trips.~~ — **retired 2026-08-30
  (owner): never built, and not owed.** No history or sparkline component exists on M5; FR-14.1's per-item history is
  offered where the quantity is actually decided, in M3's review step (E2E-M3-08). Writing this case would have been
  building a feature, not covering one.
* **E2E-M5-05** `all` (FR-7.1/7.2) — **implemented 2026-08-30** (`e2e/item-detail.spec.ts`): a note typed into the sheet
  appears in its notes section; the note's flag control **moves** it — gone from the notes, open in *Vorbereitung* — and
  once the sheet closes, M4's row carries a prep badge of 1 where it had none. A note and a todo are one record
  (`is_task = 1`), so the promotion is a row changing *collection* rather than a field changing on a row: a case that
  only looked for the todo would pass against a build that rendered it in both sections at once. M4 is the third reader,
  which is what makes the promotion a trip-level fact rather than something the sheet remembers about itself. Red-proved
  by writing `task_state` without `is_task`.
* ~~**E2E-M5-06 (v1.0 catalogue, shadowed)** `all` (FR-7.3): prep-todo section — add/resolve/reopen; resolve restricted
  to assignee/owner.~~ — **the lifecycle is E2E-M4-25**, which drives M5's own todo controls end to end. **The
  restriction clause is struck together with the FR** (2026-08-30, owner): nothing enforced it in the client or the
  server, and it contradicted FR-7.3's own promise two sentences earlier that todos are visible to every trip member —
  see the Addendum.
* ~~**E2E-M5-07 (v1.0 catalogue, shadowed)** `server` (FR-6.2): delegate (set Packed by → other user) triggers a
  notification on the recipient.~~ — **implemented under other ids**: E2E-FLOW-02 drives the assignment and the
  notification it fires, and E2E-NOTIFY-01 asserts the language it arrives in.
* **E2E-M5-08** `single/local` (FR-17.3/G-8): Delegate control hidden — **implemented at unit level**,
  `components/trips/__tests__/ItemDetailSheet.spec.ts` (*offers no picker where the only member is me* and *offers no
  picker where there is nobody to assign to (G-8)*). Deliberately not a browser case: the guard is arithmetic over the
  roster, and neither `local` nor `single` can render a second member at all, so a Playwright run would re-execute what
  is decided here and establish nothing further. Recorded 2026-08-30 — the ledger had reported this unwritten while both
  cases stood.
* ~~**E2E-M5-09 (v1.0 catalogue, shadowed)** `all` (FR-3.3): "Buy now" on a BUY_BEFORE item flips mode to PACK with an
  undo snackbar.~~ — **retired 2026-08-30 (owner): the right behaviour on the wrong screen.** FR-3.3 is realised where
  the buying happens, on M6 — the check-off writes `bought_from` and moves the row (FR-25.11j) — and E2E-M6-17 asserts
  it, including the visit to M4 that finds the row afterwards. M5 offers no buy control and is not owed one.
* ~~**E2E-M5-10 (v1.0 catalogue, shadowed)** `all` (FR-20.1/20.4): Companions hint with one-tap Add (chains required
  companions).~~ — **the promise survived and is now E2E-M5-23.** It was the one shadowed entry describing something
  built, visible and asserted nowhere: the section had been on M5 since the rebuild with no `data-testid` anywhere in
  it. The *required* half is E2E-M4-40's cascade; this half is the offer.
* ~~**E2E-M5-11 (v1.0 catalogue, shadowed)** `server` (G-3): item locked by the other user → read-only with lock
  banner.~~ — **implemented under other ids**: the rendered banner in `e2e/server/multi-user.spec.ts` (which names the
  holder) and `e2e/single/server-sync.spec.ts` (both directions, including the banner's disappearance), and the rule
  itself in seven unit cases under *M5 respects the G-3 lock*, which now carry this id in the file.
* ~~**E2E-M5-12 (v1.0 catalogue, shadowed)** `all` (FR-22.1): the source master item's photo renders when present.~~ —
  **implemented at component level on purpose**, as E2E-M5-15's entry already records: setting a photo through the UI
  needs a camera or a file upload, so the photo rung of the identity slot is asserted where the component is mounted
  directly.
* **E2E-M5-15** `all` (FR-28.4) — **implemented 2026-08-22** (`item-mark.spec.ts`): the sheet's identity slot shows the
  mark when there is no photo, an ad-hoc row's sheet shows **no slot at all** (the header has no column to align, so the
  title is the first thing on the line), and the mark is **not editable here** (no picker in the sheet) — it belongs to
  the master item, and M10 owns it (FR-28.7). *The photo rung of the same slot is asserted in the component unit rather
  than here: setting one through the UI needs a camera or a file upload, which is `item-detail.spec.ts`'s subject and
  not the mark's.*

### M6 — Shopping Views
* **E2E-M6-01** `all` (FR-3.2) — **implemented 2026-08-30** (`e2e/shopping.spec.ts`): two tabs (Before departure / At
  destination), rows grouped by category, each tab's label counting the **things to buy** rather than rows (FR-25.6).
  The clause about the destination tab showing **destination-checklist entries separated** is **not testable yet and
  never was**: those are FR-13.3 standing entries, which wait for trip series in the client — `ShoppingPage.vue` says so
  in its own header.
* **E2E-M6-02** `all` (FR-3.3) — **implemented 2026-08-30, inside E2E-M6-17 and E2E-M6-22** rather than as a case of its
  own: both halves of this promise were already asserted there — the row leaving the list, and the reveal note naming
  where it went — so a third case would have re-run them for an id's sake. What was genuinely missing is one assertion,
  added to M6-17: **the packing list is actually visited**, because *„on the packing list"* is a string until the screen
  it names has been looked at: check off a BUY_BEFORE item → it transitions to PACK and leaves the list; BUY_LOCAL →
  packed, and it leaves the list too. *„with animation"* is deliberately dropped from the assertion set: a transition
  nobody can observe deterministically is a `waitForTimeout` waiting to be written.
* **E2E-M6-03** `all` (FR-5.6) — **implemented 2026-08-30, inside E2E-M6-01**: the case adds free text on both tabs and
  asserts each landed in its own list, which is this promise in full: free-text add directly into either list.
* **E2E-M6-04** `all` (FR-3.2) — **implemented 2026-08-30** (`e2e/shopping.spec.ts`): with both lists empty, M4's
  toolbar keeps the **shopping entry** and drops only its **badge** — corrected 2026-08-30 against the screen, which
  states the reason where the count is computed: the destination exists either way, and G-12's bar has no overflow to
  hide it in. The original wording (*„entry/badge hidden"*) would have made an empty trip unable to reach M6 at all.
* **E2E-M6-05** `all` (FR-25.6) — **implemented 2026-08-29** (`shopping.spec.ts`): a **per-person** item in a buy mode
  appears in the shopping list at all — the regression was that it did not, because open-ness was decided from the
  item's own `packed`/`quantity`, which a per-person item does not carry. It renders as **one aggregated row** with the
  summed quantity ("6×", from 2 + 3 + 1), the recipients named ("for Andy, Leonardo, Mia") and their avatars — **not**
  one row per traveler. The **tab's own count** is asserted with it: it counts things to buy, so a segment reading three
  over a list showing one is the same lie in the other direction.
* **E2E-M6-06** `all` (FR-25.6/3.3) — **implemented 2026-08-29**, and the half that matters: a single aggregated row
  that settles only one instance is worse than three honest ones. Checking off that aggregated row settles **every**
  instance in one act — a BUY_LOCAL per-person item leaves the list fully packed for all recipients, and a BUY_BEFORE
  one moves to PACK for all of them. Asserts no instance is left behind — through the **empty state**, because two
  instances left over would still render a row of their own, and through the undo, which brings the whole amount back.
* **E2E-M6-07** `all` (FR-25.6) — **REMOVED (owner decision 2026-08-30)**: the surface was never built, and M6 stays the
  focused procurement checklist it is. The reasoning is one sentence per feature — a shopping list rarely runs to twenty
  rows, so a filter bar and a search field carry weight M4 already owns; and the composer has been the *shared* one
  since FR-25.13, so an M6-only field would be a second template for one rule (invariant 4's shape, applied to a
  screen). Kept as struck-through history rather than deleted, because the id is referenced from the traceability matrix
  and from FR-25.11/25.13a. *The promise as written:* a per-item note can be added from the row, is shown inline on it,
  survives a re-render, and can be edited and cleared — without leaving M6.
* **E2E-M6-08** `all` (FR-25.10) — **implemented 2026-08-30, inside E2E-M6-05**: the recipients line carries no control,
  asserted beside a positive count of the row's one checkbox so the absence has something to fail against: the shopping
  row offers **no free-form "for whom" control**; the recipients shown are derived from membership only. Guards against
  reintroducing the attribution FR-25.10 removed.
* **E2E-M6-16** `all` (FR-25.13a) / **E2E-M4-21** `all`: both quick-adds carry a **visible confirm button** in every
  mode, and adding works by tapping it alone — no keyboard involved. Guards the phone case, where relying on Enter
  leaves no reachable way to commit.
* **E2E-M6-12** `all` (FR-25.13a) — **REMOVED (owner decision 2026-08-30)**: the surface was never built, and M6 stays
  the focused procurement checklist it is. The reasoning is one sentence per feature — a shopping list rarely runs to
  twenty rows, so a filter bar and a search field carry weight M4 already owns; and the composer has been the *shared*
  one since FR-25.13, so an M6-only field would be a second template for one rule (invariant 4's shape, applied to a
  screen). Kept as struck-through history rather than deleted, because the id is referenced from the traceability matrix
  and from FR-25.11/25.13a. *The promise as written:* the quick-add offers name, description and a *Zugewiesen an* chip
  row. Adding with all three set produces a row carrying the description inline and the assignee mark. **Enter commits
  from the description field too.** Regression guard: tapping an assignee chip must **not** clear an already-typed
  description — the failure mode of re-rendering the form on selection.
* **E2E-M6-13** `all` (FR-25.13a) — **REMOVED (owner decision 2026-08-30)**: the surface was never built, and M6 stays
  the focused procurement checklist it is. The reasoning is one sentence per feature — a shopping list rarely runs to
  twenty rows, so a filter bar and a search field carry weight M4 already owns; and the composer has been the *shared*
  one since FR-25.13, so an M6-only field would be a second template for one rule (invariant 4's shape, applied to a
  screen). Kept as struck-through history rather than deleted, because the id is referenced from the traceability matrix
  and from FR-25.11/25.13a. *The promise as written:* after an add, the **assignee stays selected** for the next item
  while name and description are cleared. Asserts the carry-over is on the assignee only.
* **E2E-M6-17** `all` (FR-25.11i/j) — **written and running since 2026-08-25**: checking off a row hides it; a **reveal
  bar under the list** — M4's FR-25.2 shape, not a filter sheet, which M6 does not have — states the count and one tap
  reveals the row, whose checkbox restores it to the open list. Covers the **BUY_BEFORE** case specifically, where
  checking off changes the item's mode and would otherwise make it unreachable from the shopping side; the revealed row
  states where it went ("auf der Packliste"). Default is hidden, and the bar is **absent** while nothing has been
  bought. *(The dimmed-and-still-interactive row of the original wording described the filter-sheet design; the built
  affordance reveals the row in a section of its own.)*
* **E2E-M6-22** `all` (FR-3.3/25.11j) — **new 2026-08-25**: the destination tab's half. A BUY_LOCAL row never changes
  mode — being bought there *is* its packed state — so the record is the only thing that keeps the two tabs' reveals
  apart: the row is revealed on its own tab, noting that it was packed, and the other tab's reveal stays absent with its
  own row still open.
* **E2E-M6-18** `all` (FR-25.11k) — **REMOVED (owner decision 2026-08-30)**: the surface was never built, and M6 stays
  the focused procurement checklist it is. The reasoning is one sentence per feature — a shopping list rarely runs to
  twenty rows, so a filter bar and a search field carry weight M4 already owns; and the composer has been the *shared*
  one since FR-25.13, so an M6-only field would be a second template for one rule (invariant 4's shape, applied to a
  screen). Kept as struck-through history rather than deleted, because the id is referenced from the traceability matrix
  and from FR-25.11/25.13a. *The promise as written:* M6 shows **no search field by default**; the magnifier in the tab
  row reveals and focuses it, typing filters the list, and ✕ **closes** the field rather than merely clearing it. The
  filter icon sits beside the magnifier and carries the active-count badge. Asserts the list regains its full height
  when the search is closed.
* **E2E-M6-19** `all` (FR-25.13b) — **M6's half implemented 2026-08-30, inside E2E-M6-01**, which commits every
  free-text add by tapping `quick-add-confirm` and never touches the keyboard; M4-21 carries M4's half: typing at least
  two characters offers master-item suggestions; picking one fills the name **and adopts that item's category**,
  including a category this trip has not used yet. Without a pick the category defaults to *Sonstiges* and can be set
  manually. The clause *„and can be set manually"* describes a category control M6 does not have (2026-08-30).
  Regression guard: choosing a suggestion must not clear an already-typed description, and the suggestion strip must
  redraw **without** re-rendering the form.
* **E2E-M6-20** `all` (FR-25.12) — **not implemented; the owner decided 2026-08-30 that it gets built**, in its own PR
  with UI-Spec, e2e and an eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy
  kauft das"* is the multi-user case M6 cannot express today, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* a row with no assignee shows an **edit glyph**, not a plus.
* **E2E-M6-21** `all` (FR-25.13c/25.13d, added 2026-08-22) — **implemented** (`e2e/shopping.spec.ts`) — **implemented
  2026-08-30, inside E2E-M6-01**: the suggestion-added row lands under its master item's tag and the free-text row under
  *Uncategorized*, which is both remaining clauses: what the trip already carries — added on M4 with master-item
  provenance — is offered on no shopping tab either: the autocomplete declines (the free-text hint is the positive
  signal for the absent suggestion) and the browse-sheet shows the item only as the *„schon drin"* state. Pins M6's
  *wiring* of the shared composer, which excluded nothing here before FR-25.13d because the screen passed nothing.
* **E2E-M6-14** `all` (FR-25.11g) — **REMOVED (owner decision 2026-08-30)**: the surface was never built, and M6 stays
  the focused procurement checklist it is. The reasoning is one sentence per feature — a shopping list rarely runs to
  twenty rows, so a filter bar and a search field carry weight M4 already owns; and the composer has been the *shared*
  one since FR-25.13, so an M6-only field would be a second template for one rule (invariant 4's shape, applied to a
  screen). Kept as struck-through history rather than deleted, because the id is referenced from the traceability matrix
  and from FR-25.11/25.13a. *The promise as written:* M6 shows the same filter bar as M4; its sheet offers *Zugewiesen
  an*, *Für wen* and *Kategorie* and — unlike M4's — **no grouping section**. Filtering by an assignee narrows the list
  and shows the removable chip. The unassigned bucket reads "niemand zugewiesen" and leads the list. M4's and M6's
  filters are **independent**: setting one must not change the other.
* **E2E-M6-15** `all` (FR-25.11h) / **E2E-M4-20** `all`: scrolled to the bottom of the list, the last row's bounding box
  does **not** intersect the ＋ FAB. **M4's half is implemented and carries the rule; M6's half is moot** — corrected
  2026-08-30: M6 has no FAB for a row to collide with. If M6 ever gains one, this id is where the case goes.
* **E2E-M6-09** `all` (FR-25.12) — **not implemented; the owner decided 2026-08-30 that it gets built**, in its own PR
  with UI-Spec, e2e and an eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy
  kauft das"* is the multi-user case M6 cannot express today, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* tapping a shopping row opens its sheet with *Zugewiesen an* and *Beschreibung*.
  Assigning a buyer shows that person on the **right** of the row with the 🛒 badge, while derived recipients stay on the
  **left** — asserts the two are visually distinct even when the buyer is also a recipient. "niemand" clears the
  assignment.
* **E2E-M6-10** `all` (FR-25.12) — **not implemented; the owner decided 2026-08-30 that it gets built**, in its own PR
  with UI-Spec, e2e and an eyeball pass. It is the one of M6's unbuilt promises with a use nothing else covers: *„Andy
  kauft das"* is the multi-user case M6 cannot express today, and the description is where *„die grüne Dose, nicht die
  rote"* goes. *The promise as written:* a description entered in the sheet renders inline on the row, survives closing
  and reopening, and can be cleared. Both buyer and description are optional — a row with neither renders without either
  mark.
* **E2E-M6-11** `all` (FR-25.13): M6 has **no permanent "add" row** and no native `prompt()`; the composer is the shared
  one, collapsed to its own trigger above the list, and Enter adds to the **currently open tab**. Three clauses of the
  original wording are gone, each superseded rather than untested — corrected 2026-08-30: M6 has **no ＋ FAB** (M4 has
  one, M6's composer carries its own trigger), the composer is **not focused** on opening (FR-25.13c, so the chips are
  not covered by the keyboard), and it **does not collapse on blur** (FR-25.13a as revised 2026-08-13 — collapsing
  reflows the list under the next tap).

### M7 — Template List

**The ids were read against the screen on 2026-08-30** (backlog item 6). M7's catalogue was
written before the 2026-08-15 variant pass rebuilt the screen, and three of its ids still
describe surfaces that pass deliberately removed or never built — the my/published split, the
name prompt, the FAB's import menu. Two that read as *implemented* were missing a clause each,
and one of those clauses is the arithmetic the row exists for.

* ~~**E2E-M7-01**~~ `all` (FR-1.2/1.6) — **retired 2026-08-30**, not unimplemented. Its first
  half is the FR-1.6 MVP simplification itself (one shared list, no my-vs-published split): there
  is nothing to render and therefore nothing to assert — the same supersession that struck
  E2E-M7-02, arrived at from the other side. Its second half, *per-row name + item count*, is
  **E2E-M7-07**, which asserts the name on every row it filters by and, since 2026-08-30, the
  count as well. *The promise as written:* one shared instance-wide list; per-row name + item count.
* **E2E-M7-02** — **superseded by the FR-1.6 MVP simplification (2026-08-08):** no publishing, no forking; every
  template is editable by every account. Returns with the parked FR-1.6 model.
* ~~**E2E-M7-03**~~ `all` (FR-1.2) — **retired 2026-08-30: the name prompt was rejected, not
  left unbuilt.** The create-then-rename flow it describes is the prototype's, and the owner
  decision of 2026-08-15 replaced it with the scope chooser carrying the name field in the same
  sheet, precisely so that no row exists before the name does — a `prompt()` cannot say what a
  Gruppe is while you name one. **E2E-M7-08** and **E2E-M7-09** assert the flow that replaced it,
  including the write that must *not* happen. *The promise as written:* FAB → name prompt →
  creates template → opens M8.
* **E2E-M7-04** `all` (FR-18.2) — **implemented**: long-press → Export → YAML download.
* **E2E-M7-05** `all` (FR-18.4) — **the promise is half built, and the half that is has a case
  since 2026-08-30.** Import from M7 exists and reaches M18; the **FAB "+" menu** it is promised in does not, and the
  FAB opens the scope chooser instead. Import is a header icon beside the page title, recorded as *still owed* in this
  spec's 2026-08-15 revision note and, until this audit, contradicted by UI-Spec M7's own *Actions* line, which
  described the menu as built (corrected the same day). **Struck 2026-08-31 (owner decision): the header icon is the
  entrance and the clause goes.** A second door to a function that already has one buys nothing, and E2E-M7-06 settled
  the same question for this screen's empty state on the same reasoning — create is the FAB, import is the header icon,
  both already on screen. The case now asserts what runs — the icon opens M18 and the way back lands on **M7**, which is
  not M18's declared parent (E2E-G9-12 asserts the same rule for the entrance from M2 and names M7 without covering it,
  so this entrance could silently have returned to Settings).
* **E2E-M7-06** `all` (G-7) — **implemented, and its CTA clause is retired.** The empty state
  carries **no CTA buttons of its own**, by the decision recorded in UI-Spec M7's *States* line:
  create is the FAB and import is the header icon, both already on screen. What the case asserts
  instead is the two empty states the screen really has, which share one element and are told
  apart by their words and by the segment beside them: nothing at all names both scopes and drops
  the segment; nothing *matching* says *„Keine Vorlage gefunden"* and **keeps** it, because there
  is something to widen back to. The second half is new on 2026-08-30 — the States line had
  promised it since the rebuild and nothing had typed into M7's search (the same shape as
  E2E-M9-10, found on the neighbouring screen the same day). Two rows are seeded rather than
  one, so the term has something to narrow **away**: with a single row, a search that ignores
  its input is indistinguishable from one that works, and only the no-match half would fail.
* **E2E-M7-07** `all` (FR-27.1/27.2/27.6): scope segmentation — *Alle* renders Ferien-Vorlagen and Gruppen as two
  sections (vacation templates first), the *Gruppen*/*Ferien-Vorlagen* tabs filter to one scope, group rows carry the
  *Gruppe* chip; a composed template's row shows its group count, its **resolved** item count (not 0 for a template with
  no own positions), and an "enthält: …" line naming the included groups. **The resolved-count clause got its assertion
  on 2026-08-30**, in `template-list.spec.ts` rather than in the M8 case that carries the rest: E2E-M8-07 builds a
  composition out of groups that are *empty*, so the raw count and the resolved count are both 0 there and the one
  arithmetic this row exists for is invisible to it. The new case gives the group a position and asserts the Vorlage
  that owns none reads *1 item* — with the group's own row as the control, since the same sentence arrived at without
  any resolution is what says the number is a fact about the include.
* **E2E-M7-09** `all` (FR-27.6): the ＋ follows the scope segment — on *Gruppen* the chooser is skipped and the sheet
  opens on the name, and the created template is a Gruppe (proved by the editor shape, which has no Gruppen section); on
  *Alle* both options are still offered.
* **E2E-M7-08** `all` (FR-27.6): FAB opens the two-option scope chooser (Ferien-Vorlage / Gruppe with **one-line
  explanations** — asserted on both cards since 2026-08-30, because a hint on one of them satisfies a sentence that
  means both, and the explanations are the reason the chooser exists at all: *„Gruppe"* alone does not say what it is
  for); picking a scope marks the card and reveals the name field **in the same sheet**, the commit stays disabled until
  a name exists (no unnamed row is ever written — dismissing the half-finished sheet leaves the list untouched), and
  Enter/Anlegen creates the template of that scope and opens the matching M8 editor shape.
* **E2E-M7-10** `local` (FR-1.6, *implemented 2026-08-25 as two tests*): a taken name never becomes a write. Typing a
  name a **Gruppe** holds into the create sheet's name field for a **Ferien-Vorlage** — differing only in capitals —
  renders a line naming the group that holds it, disables *Anlegen*, and the **Öffnen** beside it navigates to that
  row's editor; a free name in the same field still creates and opens the new template (the positive signal, without
  which "nothing was created" is also true of a broken button). The rename alert refuses onto a taken name with a toast
  naming the holder, **stays open with the typed name**, and the row keeps the name it had; the same menu with a free
  name renames. Local Mode deliberately, because it is the run mode with no constraint behind the client.

### M8 — Template Editor

**The ids and the tests were read against each other on 2026-08-30** (backlog item 6). Every M8 id already carried a
test, so the read was clause by clause rather than id by id, and that is where the one real hole was: **E2E-M8-06 has
read *implemented* since the M8 rebuild (`8dc89d8`, 2026-08-15) with nothing in the suite ever removing a position.**
The row's ✕ was a *decision* that commit made — the M7 variant pass had just rejected the swipe panel — so it was
written into the UI-Spec, into this entry's revision note and into the ledger on the same day, and the revision note is
what everyone then read. A clause that arrives as news is not checked the way a clause that arrives as a requirement is.
Four further clauses of other ids were unasserted and went in with it; they are named on their own entries below.

*Filing note:* **E2E-M8-20, E2E-M8-21 and E2E-M8-22** are defined in the M4 block above,
beside the M4 twins they were written with (FR-27.10, FR-25.13c, FR-25.13d). They are M8's
ids and M8's tests; the entries stay where they are so no id is defined twice.

* **E2E-M8-01** `all` (FR-1.8/G-6): the position sheet's quantity is a numeric stepper (– n +), 0 allowed ("bewusst
  nicht dabei", FR-5.5); no formula input exists (FR-1.3/1.5 retired 2026-08-08).
* **E2E-M8-02** `all` (FR-1.4): per-item assignment type Per Person / Trip-Global. *(Read 2026-08-30: both values are
  asserted, and only one of them is clicked — **Trip-Global is the FR-25.7 default**, so E2E-M8-12 asserts it as the
  state a fresh row is in and the glance chip's absence is part of "Standard". Nothing further owed.)*
* **E2E-M8-03** `all` (FR-2.3/15.2): dedup strategy select; condition chips (season/transport/accommodation). *(The
  three axes come off one `CONDITION_AXES` loop, so a chip on one is the render of all three; what a second axis would
  not have added, and what was genuinely untested, is **FR-15.2's one-value-per-axis rule — the active chip is also the
  way to clear it**, the only branch of `toggleCondition` that deletes. Asserted since 2026-08-30 in the same case, with
  the per-person chip beside it so a glance that simply emptied cannot pass.)*
* **E2E-M8-04** `all` (FR-1.1/25.13): positions are added through the shared quick-add (see M8-13); a free-text name
  creates the master item inline.
* **E2E-M8-05** `all` (FR-2.4/27.4): editing a template a **not-past** trip still follows shows the FR-27.4 blast-radius
  note naming those trips — each is *asked* on its next open, nothing lands silently, and past trips are never touched;
  everyone else sees the change at the next trip generation (FR-2.4). The note is reached through **both** provenance
  paths: the Vorlage's own positions and a group included in it. *(**Sentence corrected 2026-08-30.** It read "those
  trips update immediately … running/past trips never", which is the model FR-27.4 replaced on 2026-08-18 — a *running*
  trip still follows its groups and is asked like a planning one, and nothing has updated immediately since. The test
  had asserted the built wording all along; only this entry still described the retired behaviour, which is the shape
  where a case sentence would have specified the bug had anyone written the case from it.)*
* **E2E-M8-06** `all` (FR-1.2) — **implemented 2026-08-30** (`e2e/template-editor.spec.ts`), and it had been reading
  *implemented* since `8dc89d8` with **nothing in the suite or the units ever removing a position**:
  `m8-position-remove-*` appeared in no test, and the page has no component test. Positions are written out of
  alphabetical order and render **name-sorted** (`template_items` has no order column — that is why the clause exists,
  and an insertion-ordered list would have passed a one-row check); the row's ✕ takes that row and no other, with the
  surviving rows and the section count as the two positive signals; the removal **survives leaving and reopening**, so
  it is a write rather than a view state; and removing the rest reaches `m8-positions-empty`, which nothing had rendered
  before. (Revised 2026-08-15: the M7 variant pass showed a swipe panel breaking out of the card, so removal is the ✕
  and there is no reorder.)
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
  its FR-27.4 applied-changes log *(the refresh landed 2026-08-18; the log half is covered generically by E2E-M8-09, and
  the task-specific line by the `groupRefresh` unit)*.
* **E2E-M8-12** `all` (FR-25.7): adding a position via the quick-add suggestion is one tap — the row lands **collapsed**
  with the defaults (qty 1, trip-global, Packen, dedup max, no conditions, no Late-Packer), reads "Standard", and
  nothing auto-opens; the position sheet (M8-14) shows only Menge + Vorbereitung before its "Details ▾" toggle; the
  advanced parameters (per-person, procurement, dedup, conditions, Late-Packer) appear only after the toggle and
  collapse again with it. *(**„nothing auto-opens" was the one clause of this sentence nothing asserted** until
  2026-08-30; it is now checked on the add itself, because an editor presenting itself after every commit would make the
  FR-25.7 defaults a suggestion rather than an answer — which is the whole of "one tap". **Procurement** was the second:
  it is named in this sentence beside the other four advanced parameters, and no test had ever clicked `m8-mode-*` — the
  segment, the glance chip and the collapsed row's chip are asserted since 2026-09-02.)*
* **E2E-M8-14** `all` (FR-25.13/25.7/25.15): tapping a position opens the **M5-pattern bottom sheet** — name header,
  read-only glance-chip row, "Wer braucht das?" wording for the assignment (FR-25.10), the sheet closes without
  committing anything; no inline expanding row form exists. *(**„scrim tap" left this sentence 2026-08-30.** The
  dismissal is one `@did-dismiss` handler and both of its user-reachable paths are asserted — the sheet's own ✕ here,
  Escape in E2E-M8-23 — so what the clause named as a third case was Ionic's own `backdropDismiss` default and nothing
  of this screen's.)* (Revised 2026-08-15: the ●→✓ **flip is unit-tested** on the shared `SaveIndicator` against a
  controlled state — e2e asserts the indicator's presence and settled tooltip, because racing the transient ● would be a
  forbidden timing dependency.)
* **E2E-M8-13** `all` (FR-25.13/25.13a/25.13c): M8's add is the packing list's quick-add, verbatim — collapsed card, ＋
  FAB expands it **without focusing it** (FR-25.13c turned the original "and focuses" around: the empty composer leads
  with chips, and the raised keyboard would cover them — asserted after the confirm has rendered, so the removed focus
  cannot pass by racing), inventory autocomplete after two characters, visible confirm labelled for the scope ("Zur
  Gruppe/Vorlage hinzufügen"), Enter commits, the field stays open and empty for the next position and never collapses
  on blur (FR-25.13a as revised 2026-08-13); an already-present name is reported ("schon drin — nicht doppelt") and not
  added twice; an unknown name creates the master item and the position in one step. *(**„after two characters" was
  asserted nowhere** — not here, not on M4, not in `QuickAddItem.spec.ts` — until 2026-08-30: `MIN_SEARCH_LENGTH` is
  shared with M3 step 3 and nothing would have gone red on a change to it. The gate is now pinned on M8, where the
  shared composer's rules live (the FR-25.13c/d division of labour), with the **free-text hint absent alongside the
  suggestions**: that hint renders exactly when a long-enough query matches nothing, so its absence is what separates
  the gate from an empty result.)*
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
  `domain/__tests__/templates.spec.ts`, including the `föhn`/`fohn` pair. Confirmed 2026-08-30 rather than assumed —
  UI-Spec M8 states both, and only one of them is reachable from a screen assertion at a sensible price.)*
* **E2E-M8-17** `all` (FR-25.13a): the ＋ is present, hides while the quick-add composer is open, and returns when it
  closes; the fab *container* remains throughout, because the screen anchors its toasts to it.
* **E2E-M8-18** `all` (FR-28.8) — **implemented 2026-08-22** (`template-editor.spec.ts`), and it found a real gap on its
  first run: M3 step 3 has *two* pickable columns and only the Vorlagen one had been given the slot. The walk also
  crosses a **reload** before the last surface, because a mark is master data and Local Mode rebuilds its store from
  IndexedDB on every navigation. A group's own mark is set from the same picker beside its name and then renders
  wherever that group is offered — the M7 row, M3 step 3, M8's *Gruppen* section and the FR-27.12 peek sheet header. One
  assertion per surface, because the field exists precisely so those four stop being hardcoded.
* **E2E-M8-08** `all` (FR-27.2): resolution footer shows the resolved item count over groups + own positions and
  **names** every dedup with its contributing groups ("Kamera nur 1× — in Makro & Wildlife").
* **E2E-M8-09** `all` (FR-27.4, revised 2026-08-18) — **implemented** (`e2e/group-refresh.spec.ts`): a group gains a
  position after a trip was generated from it; M2 already carries the „⟳ N Änderungen vorgeschlagen“ chip on a freshly
  booted app (the startup sweep, and the positive half of M8-19's absence assertion); opening the trip shows the
  **proposal card** naming the change while the list has *not* moved (the row's absence at that point is what separates
  "asked" from "asked afterwards"), *Übernehmen* puts the row on the list and clears the card, and M2 then carries the
  „⟳ N Änderungen aus Gruppen übernommen“ chip with the source group and item in its log. Up to ten changes the log is
  written out under the row (the case asserts that state); above ten it folds behind the chip, which the TripListPage
  component test pins from both sides of the threshold. Moved out of `template-editor.spec.ts` with the model change —
  the surface under test is M4 and M2.
* **E2E-M8-19** `all` (FR-27.4, new 2026-08-18) — **implemented** (`e2e/group-refresh.spec.ts`): *Nicht übernehmen*
  leaves the trip's list untouched and clears the card; leaving to M2 and coming back proves the refusal was
  **recorded** rather than held in memory — the trip re-derives on every open, so a refusal that wrote nothing would ask
  again right there — and M2 carries no proposal chip.
* **E2E-M8-23** `all` (FR-27.15, *implemented 2026-08-22 as two tests sharing one world*; renumbered from E2E-M8-21 on
  2026-08-22, which the implemented FR-25.13c case had already taken): group recognition in the Vorlage editor — own
  positions covering a group's complete resolved item set surface the suggestion row („N Positionen entsprechen …“) with
  the FR-27.12 peek chevron; *Zusammenfassen* replaces those positions with the include (resolution footer count
  unchanged — the proof nothing was gained or lost) and the snackbar's *Rückgängig* restores the positions, deviations
  included, and drops the include; *Ignorieren* removes the row and it stays away across a reload (device-local memory),
  yet returns after the group's item set changes; a one-item group and an already-included group never suggest; a
  deviated quantity is named on the row before the tap — and since the build, *any* generation-relevant deviation is
  (FR-27.15's first settlement), so the row counts positions rather than amounts.
* **E2E-M8-24** `local` (FR-1.6/FR-27.6, *implemented 2026-08-25 as two tests*): the inline *„Neue Gruppe anlegen…"*
  meets a name that exists. A **Gruppe** of that name (capitals differing) is **included** rather than created — the
  toast says so, the group appears in the *Gruppen* section, and M7 still lists exactly one row of that name (counted on
  the row title, since the composed row now names the group in its *enthält:* line). A **Ferien-Vorlage** holding the
  name is reported as the cross-scope fact it is and nothing is included or created; a free name in the same field then
  does both. The editor's own name field refuses a rename onto a taken name, the toast names the holder, **the field
  itself goes back** to the stored name and the ADR-011 header title with it; a free name saves.

### M9 — Item Inventory

**The ids and the tests were read against each other on 2026-08-30** (backlog item 6), which is
what found the swap below. Both halves had shipped in the same commit (`6ea6577`, the §3.24
rebuild): the two tests it wrote carried the ids **E2E-M9-02** and **E2E-M9-03**, whose entries
here describe entirely different promises, while the entries the tests actually implement —
M9-05 and M9-06 — read *implemented* on their strength. Two ids therefore looked covered and
were not. Nothing would have caught it: a duplicate-id gate sees one use of each, and a
coverage count sees the same total either way. **Only reading each id's sentence against the
test body under it separates a wrong number from a missing test.**

* **E2E-M9-01** `all` (FR-1.1/24.2/24.4) — **implemented** (`e2e/inventory.spec.ts`): tag-grouped list, **lean by
  default** — per row only primary-tag avatar + name (no tag chips, no weight/price); row thumbnail when a photo exists.
  The case an item on *two* tags is the point: it renders **once**, under its primary tag, and its second tag is not a
  heading. *(The word „searchable" left this sentence on 2026-08-30 and became E2E-M9-10, which is the assertion it
  never had.)*
* ~~**E2E-M9-02**~~ `all` (FR-1.1/24.5) — **retired 2026-08-30**, not unimplemented: FAB → M10 in **creation mode** is
  asserted by **E2E-M10-07**, which reaches the form by clicking `m9-fab` and then asserts exactly the minimal-mode
  shape this id promised. Twenty e2e cases enter the editor through that FAB. A second id over one behaviour is a second
  place for it to read covered.
* **E2E-M9-03** `all` (FR-16.3) — **not implemented, and not a test gap: the screen has no multi-select and no merge.**
  Written 2026-07 from the UI-Spec's *Actions* line; FR-16.3 itself is *Deduplication on **Import*** and is discharged
  by M15 (E2E-M15-03/09) and M18 (E2E-M18-03). Nothing in M9 ever offered the cleanup. **Struck 2026-08-31 (owner
  decision): the clause is dropped from UI-Spec M9 rather than built.** FR-16.3 is discharged where deduplication
  actually happens — on import, by M15 and M18 — and a second cleanup surface in the inventory would be a feature nobody
  asked for. **The clause has a second reader**, which is why it is worth deciding rather than quietly deleting: PRD
  FR-27.5 rejects fuzzy name matching in M21 partly on the grounds that „a duplicate master item is visible in M9 **and
  can be merged**" — the asymmetry that argument rests on is thinner than it was written to be. **PRD FR-27.5 carries a
  note since 2026-08-31 saying that premise is withdrawn**: an argument resting on a feature that will not be built has
  to say so, or the next reader re-derives a conclusion from a false step.
* **E2E-M9-04** `all` (G-7/NFR-4.7) — **implemented 2026-08-30** (`e2e/inventory.spec.ts`): an empty inventory offers
  the spreadsheet import, and the way back lands on M9 rather than on M15's *other* parent, the trip list. Its own
  describe, because every other case here creates an item first and this one must not. **Nothing had rendered this state
  before**: `m9-empty` appears once in the whole suite prior to this case, as E2E-G9-13's *absence* assertion, where it
  stands in for „not the inventory screen". The G-7 half is asserted against two positive controls — the tag axis and
  the no-match state are both absent — so „the empty state is up" cannot be satisfied by a list that painted nothing.
* **E2E-M9-05** `all` (FR-24.4) — **implemented** (partially: the reload half is unit-tested in
  `inventoryProperties.spec.ts`, since a device-local reload assertion belongs where the storage seam is): the eye icon
  opens the „Angezeigte Eigenschaften" sheet; enabling Gewicht/Preis/Tags adds exactly those to the rows, the icon shows
  a count badge while anything is enabled, and the preference survives a reload **on this device only** (device-local,
  never synced). *(Ran under the id E2E-M9-03 until 2026-08-30. Two of its clauses were unasserted and were added with
  the renumbering: **exactly those** — enabling the weight must leave the tags off the row, which is the whole reason
  FR-24.4 is three switches — and the **badge**, asserted from both sides, since „the badge reads 1" is equally
  satisfied by a badge that always reads 1.)*
* **E2E-M9-06** `all` (FR-24.2) — **implemented**: the tag chip axis filters on **any** of an item's tags while the
  grouping stays on the primary one — filtering by *Sommer* surfaces the swimsuit filed under *Kleidung*. Asserted on
  rendered rows, since the two rules differ only in what is painted. *(Ran under the id E2E-M9-02 until 2026-08-30.)*
* **E2E-M9-07** `all` (FR-28.1/28.4/28.7) — **implemented 2026-08-22** (`item-mark.spec.ts`): a mark set in M10 appears
  on the inventory row **and** on the packing row of a trip that took the item from the inventory, without either row
  storing it (FR-28.7 — asserted by changing the mark once and observing both surfaces); an ad-hoc quick-add row shows
  the empty slot. **Both composer paths are exercised on purpose**, because they differ where it matters: the suggestion
  carries `source_item_id` and therefore a mark, the free-text confirm does not. *The photo rung is the component
  unit's, for the reason given at E2E-M5-15.*
* **E2E-M9-08** `all` (UX review 2026-08-25, UX-4) — **implemented** (`e2e/inventory.spec.ts`): the first group heading
  clears the tag axis by a visible gap. Asserted as geometry (bounding boxes on settled elements, not pixels): at a 0px
  gap the active chip's underline sits flush against the heading and reads as the heading sliding under the bar.
* **E2E-M9-09** `single` (FR-21.9) — **implemented 2026-08-30** (`e2e/single/instance-currency.spec.ts`): an item price
  is rendered with the currency the instance named. `single` rather than `all`, and that is the feature rather than a
  limitation of the case: the code comes from the server over `GET /api/v1/instance/config`, and Local Mode has none, so
  its amounts stay unit-less by design. The project's backend runs with `JITPACK_CURRENCY=CHF`, so any screen that
  renders an amount without carrying it is a red case rather than a quiet omission. **Two clauses, both asserted:** the
  row contains `CHF`, and it contains `129.50` — naming a currency labels an amount and never converts it, and the
  second assertion is what says so. Mutation-proved: with the `style: currency` option removed the row reads `129.50`
  alone, which is exactly the pre-FR-21.9 rendering.
* **E2E-M9-10** `all` (FR-1.1) — **new 2026-08-30** (`e2e/inventory.spec.ts`): the search **filters**. E2E-G12-02
  asserts that the magnifier opens *this* screen's field and no other screen's; that typing into it narrows the list is
  a different promise, and it had no assertion anywhere — M9-01's sentence carried the word and nothing more. A term the
  inventory matches leaves one row and takes the *heading* of the group it emptied with it (the filter runs before the
  grouping, so a heading over nothing would be the visible defect); a term nothing matches raises **`m9-no-match`** and
  explicitly **not** the G-7 empty state, which would offer to import an inventory that already exists.

### M10 — Item Editor

**The ids and the tests were read against each other on 2026-08-30** (backlog item 6), the
audit after M9's. The same commit that closed §3.24 (`6ea6577`) is the origin here too, and
it made the larger version of the same mistake: it marked **M10-07, M10-08 and M10-10**
*implemented* while writing those five tests under the numbers **M10-01 … M10-05**, which
were live entries describing five different promises. So five ids read as unwritten while a
green test carried each of their numbers, and three ids read as implemented with no test
carrying theirs. The ledger's promise table had it right the whole time — it maps each test
row to 07/08/10 — which is worth saying, because *nothing else did*, and a reader checking
one document against the suite would have believed the suite. Renumbered here and in
`inventory.spec.ts`; the count of tests is identical before and after, which is why nothing
caught it.

**What the reading also found:** two ids over one section (M10-03 and M10-09), one id whose
behaviour the FR-24.3 rebuild reversed (M10-02), and **two sections that were specified in
July, are read as built by three other documents, and do not exist in the code** —
„Enthalten in" (FR-27.8) and „Kommentare aus Reisen" (FR-27.9). Those two are an owner
decision, not a test gap.
* ~~**E2E-M10-01**~~ `all` (FR-1.1) — **retired 2026-08-30**, clause by clause rather than as a summary: the name and
  the inline-created tag are **E2E-M10-08**, the weight behind *Mehr ▾* is **E2E-M10-07**, and the price is asserted
  where it is *read* — **E2E-M9-09**, which is the case that can tell a formatted amount from a bare number. What is
  left is the last clause, *no unit control*, and it has nothing to assert against: FR-1.8 retired units in 2026-08 and
  no unit field was ever built, so the absence is of a control that never existed. (Until this audit the id also sat on
  a test — the minimal-creation case, now E2E-M10-07.)
* **E2E-M10-08** `all` (FR-24.1) — **implemented** (`e2e/inventory.spec.ts`, two tests): the tag input is a search field
  — typing filters the chips, tapping a match assigns it (the second item finds the tag instead of duplicating it); an
  unmatched name shows the "＋ „X“ neu anlegen" chip, and ＋ creates and assigns the tag in one step, clearing the field
  for the next; unassigning refiles the item in M9. *(Ran under the ids E2E-M10-04 and E2E-M10-05 until 2026-08-30.)*
  **„Assigned tags stay pinned" was added as an assertion on 2026-08-30** — it is stated twice, here and in UI-Spec M10
  („so the filter can never hide what the item already carries"), and was asserted nowhere: every case read the assigned
  chip with an *empty* query, which is the one state that cannot tell the rule from its absence. The ＋ chip is the
  positive signal it now rides on, so „the chip is still there" cannot be satisfied by a field that filters nothing at
  all.
* **E2E-M10-10** `all` (FR-24.1/16.3) — **implemented** (`e2e/inventory.spec.ts`): since the item's name became its
  identity (`UNIQUE (name)`, ADR-014), creating a second item with an existing name is **reported in the form** — not
  left to the sync push to reject. *(Ran under the id E2E-M10-03 until 2026-08-30.)*
* **E2E-M10-17** `all` (FR-27.8) — **new 2026-08-31**: the item names the groups and Vorlagen holding it, each with its
  position count and its scope chip, and one row leads into that template's editor with the way back landing on the item
  again. The list is **mixed on purpose** — a group *and* a Ferien-Vorlage — because both scopes wear the same chip here
  and a group chip asserted alone would pass on a screen that marks nothing else.
* **E2E-M10-18** `all` (FR-27.9) — **new 2026-08-31**: a remark written on a trip row through M5's own composer is
  readable at the item, with the trip named. The chain is the app's: master item → quick-add → M5 comment → M10.
  Red-proved by dropping the join in `domain/itemHistory.ts`.
* **E2E-M10-19** `all` (FR-24.5/FR-27.8/FR-27.9) — **new 2026-08-31**: an item nothing has used carries **neither**
  section — absent, not empty. The positive signal is the delete card, which *is* on the screen: a page that failed to
  load satisfies an absence assertion just as well, which is the shape this suite has been caught by before.
* **E2E-M10-07** `all` (FR-24.5) — **implemented** (`e2e/inventory.spec.ts`, two tests): creating an item shows the
  minimal form (name focused, tags, *„Mehr — Gewicht & Preis ▾"*); committing without a name is caught with a hint
  rather than a disabled button; after *„Artikel anlegen"* the full editor appears. *(Ran under the ids E2E-M10-01 and
  E2E-M10-02 until 2026-08-30.)* The sentence used to name **three** sections whose absence proves the mode — *„keine
  Enthalten-in/Kommentare/Löschen-Abschnitte"* — and only the third of them exists: the delete card's absence is now
  asserted with the photo's and the dependency section's, and the other two names are gone, because an absence assertion
  over a section that renders in *neither* mode reads as coverage and is a tautology (see E2E-M10-05).
* **E2E-M10-11** `all` (FR-28.2/28.3/28.11) — **implemented 2026-08-22** (`item-mark.spec.ts`); removal moved to its own
  case, **E2E-M10-12**, because it is a separate promise and the picker case was already long. The picker and its three
  cases, which is the whole point of building it: typing **„Zahnbürste“** puts 🪥 first in the suggestion band and one
  tap sets it; **„Stirnlampe“** suggests 🔦 and the item is saved **unmarked** unless the offer is tapped (asserted
  positively — the stored value stays null, so the case cannot pass by the picker simply being slow);
  **„Zwischenringe“** renders the named empty result and **no** suggestion chips. Then: the search field finds by
  keyword and not by name (typing „regen“ surfaces 🧥 and ☂️), and a facet narrows the grid. *(„regen" reaches 🧥 and 🌂 —
  the spec's ☂️ was the wrong code point; the index carries the open umbrella.)*

* **E2E-M10-12** `all` (FR-28.2) — **new 2026-08-22**: **„Marke entfernen"** clears a set mark back to the empty slot,
  and the action is **absent** on an unmarked item — removal is worded as removal and never offered as "choose the empty
  one".
* **E2E-M10-13** `all` (NFR-4.12) — **new 2026-08-22**: the sections that exist only once the item is saved — photo,
  *Hängt ab von*, the dependency picker — are rendered from the catalogue, asserted with the app language set to German.
  English cannot carry this case: the finished English literal and the catalogue lookup that replaced it produce the
  same pixels, which is precisely how M10's half stayed untranslated through a migration that reported itself complete.
* **E2E-M10-14** `all` (FR-24.3) — **new 2026-08-25** (`e2e/lifecycle-delete.spec.ts`): an item a group position holds
  is deleted from M10's delete card. Before the confirm the card states the count and *„Er wird ausgeblendet, nicht
  entfernt"*; after it the row is gone from M9, the quick-add of a *second* group no longer offers it, **and the first
  group still resolves it in M8**. The second group is deliberate: the composer already excludes what the open template
  holds, so asserting the autocomplete inside the same group would be green whatever the filter does — found by mutating
  the filter and watching the first draft stay green. The second half is the positive signal the first is asserted
  against — "absent from the inventory" is equally satisfied by the row having been destroyed, which is the failure this
  whole FR exists to prevent.
* **E2E-M10-15** `all` (FR-24.3) — **new 2026-08-25**: an item nothing has ever used is removed outright. A *second*
  item is created and asserted untouched, so "one row fewer" cannot be produced by the list simply failing to paint;
  then the same name is created again, which a retired row holding it would refuse — the rendered proof that the delete
  was physical and that uniqueness ranges over the active rows only.
* **E2E-M10-16** `all` (FR-24.1, UX-14) — **new 2026-08-27** (`inventory.spec.ts`): with ten unassigned tags and an
  empty query the form offers **eight** chips and a *„N weitere per Suche"* tail naming the two held back; the search
  reaches a tag past the cap; clearing the query (by keys — a programmatic clear is the event-loss path the suite's
  `fillIonic` exists to avoid) returns to the shelf; tapping the tail focuses the search. Runs at phone width and in
  German, where it also measures that the placeholder fits its box — by briefly rendering the text as the value and
  reading `scrollWidth`, because a canvas re-measure quietly used the wrong font and could not fail.
* **E2E-M7-11** `all` (FR-24.3) — **new 2026-08-25**: M7's row menu → *Löschen* on a Vorlage no trip ever used; the
  confirm says it will be removed for good before the tap that does it, and the row goes. The retire branch for a
  Vorlage is covered by the store and the orchestrator units rather than here, because reaching it through the UI means
  generating a whole trip for one sentence.

**M23 — Hidden items and templates (FR-24.3, the restore).** Four cases in `e2e/restore-retired.spec.ts`, all `local`,
all reached through M17's row rather than a typed URL.

**Read clause by clause on 2026-08-30** (backlog item 6). M23-01/02/03 keep every promise their
sentences make — this screen was written with its cases and they did not drift. What the reading
found is what all three have in common: each of them retires an **item**, and FR-24.3 governs
items *and* Vorlagen, which M23 renders from two different row builders. The Vorlagen segment had
never held a row in any test — E2E-M23-01 uses its *emptiness* as a positive control, which only
says something if it can ever be non-empty — and the Vorlage **retire** branch had no rendered
case anywhere either (E2E-M7-11 covers the remove branch and says why it stops there). That is
E2E-M23-04.

* **E2E-M23-01** `all` (FR-24.3) — **new 2026-08-25**: an item a group holds is retired, M23 lists it,
  *Wiederherstellen* brings it back and M9 shows it again. Two positive controls the "it came back" assertion is made
  against: a *second*, untouched item is asserted still present, so "the inventory grew by one" cannot be produced by
  the list repainting from nothing; and the *Vorlagen* segment is asserted empty, so the items list being non-empty is a
  fact about the store rather than about the screen rendering anything at all.
* **E2E-M23-02** `all` (FR-24.3, ADR-034) — **new 2026-08-25**, and the case the file exists for: after the retire, a
  *new* item takes the freed name, and the restore then collides. The alert names the holder **while the row is still on
  M23** — that assertion is what separates the refusal arriving before the write from a restore that is enqueued,
  refused by the push and reversed by ADR-031's repair, which on screen is a row appearing and vanishing. A replacement
  name is typed, the input's value is **asserted before the button is clicked** (the first run restored a row named "K"
  and every count still passed), and M9 then shows *both* rows — the restored one made room for itself rather than
  taking the name back. Finally the group still resolves the row under its new name, which is the retire's own promise
  surviving the rename.
* **E2E-G9-14** `all` (FR-24.3, ADR-011) — **new 2026-08-25**, in `e2e/global-nav.spec.ts` rather than in M23's own
  file, because getting to a screen and leaving it are global behaviours: Settings → M23, and the assertion that carries
  it is the **app-bar title**, since M23 renders no heading of its own and the header is the only place the user is told
  what they are looking at. Back returns to Settings and the bar is asserted to say *Settings* again rather than keeping
  the title of the screen that was left. Proved red by removing the route's `titleKey` —
  *"expect(locator).toHaveText(expected) failed / Expected: 'Hidden master data' / element(s) not found"*.
* **E2E-G9-15** `all` (G-9) — **new 2026-08-26**, in `e2e/global-nav.spec.ts`: the settings gear is on every screen
  except M17 itself, where it would only reopen the screen it is on (UX review 2026-08-25, UX-16). Asserted as presence
  on a tab root plus absence on the rendered settings screen — the settings page's own content is the positive signal
  the absence rides on.
* **E2E-G9-16** `all` (G-9) — **new 2026-08-27**, in `e2e/global-nav.spec.ts`: at 1280 px a settings section heading is
  far narrower than the area it sits in **and centred in it** (equal gutters to within a pixel), and at 400 px it fills
  the width again. A section heading rather than a control, deliberately: a control sits at one edge whatever the layout
  does, so it could not tell the two states apart — the first draft measured the language `ion-select` and passed the
  cap assertion against the unfixed build. Both halves matter: the second is what keeps the column from becoming a
  margin on the phone the app is built for (UX-17).
* **E2E-M23-04** `all` (FR-24.3, ADR-032) — **new 2026-08-30**: the other thing FR-24.3 retires. A group a trip was
  generated from is deleted from M7, and the confirm carries the sentence E2E-M7-11's twin does not — *hidden, not
  removed* — before the tap; the row leaves M7, appears on **M23's Vorlagen segment** (with the items segment asserted
  empty, the mirror of E2E-M23-01's control), offers the restore and **no** *Endgültig löschen* while the trip still
  holds it, and comes back to M7 still holding the position it was created with. One trip generation pays for two
  screens: the Vorlage retire branch and the second half of M23. Mutation-proved by pointing M23's template row at
  `restoreMasterItem` — a plausible copy-paste, since the two callbacks have the same shape — which reddens this case
  and leaves the three item cases green.
* **E2E-M23-03** `all` (FR-24.3) — **new 2026-08-25**: a retired row does not become undeletable. While the group still
  holds it, M23 offers the restore and **no** *Endgültig löschen* — asserted as an absence beside the restore button's
  presence, so it is a statement about the row and not about an empty page. The group is then deleted, which makes the
  row unreferenced, the button appears, and the confirm carries M10's "removed for good" sentence. The proof it was
  physical is that the name is free again afterwards, which a row still holding it — retired or not — would refuse.
* ~~**E2E-M10-02**~~ `all` (FR-2.4) — **retired 2026-08-30**, two clauses with two different fates. *„Delete blocked
  while referenced"* was **reversed** by FR-24.3 (ADR-032, 2026-08-25): the refusal became a choice, and UI-Spec M10
  says so in as many words — the delete now retires instead of refusing, asserted in **E2E-M10-14** and **E2E-M10-15**.
  The *usage count* survived the rebuild into the delete card, and both of those cases already assert it, from both
  ends: *1* on a referenced item, *0* on an unreferenced one. What did **not** survive is the split the sentence
  promised — the card says „An N Stellen verwendet", one number over templates and trips together, and no screen has
  ever named the two separately.
* ~~**E2E-M10-09**~~ `all` (FR-20.1/20.4) — **retired 2026-08-30**: it and E2E-M10-03 are two ids over one section,
  written eight weeks apart and differing only in which half they lead with. Its own clause — the reverse list offers no
  editing — is now asserted inside **E2E-M10-03**, on the row rather than on the section, because „read-only" is a
  statement about what a row does *not* carry and needs the row to be found first.
* **E2E-M4-66** `all` (FR-20.4/20.2) — **new 2026-08-31**: quick-adding an item pulls its required companions **and
  names them**. `addRequiredCompanions` returned nothing and no caller raised anything, so the companions simply
  appeared on the list, while FR-20.2's *skip* names exactly what it took along — and it is that contrast which made the
  silence read as an omission rather than as a decision. The action returns what it added, and the **screen** says it,
  which is the shape `skipItem` has had since FR-5.5. An item with no companions says nothing: the positive signal
  against a snackbar that always fires. Carries the third clause of the retired E2E-M4-32 under a live number rather
  than reviving it. Red-proved.
* **E2E-M4-67** `all` (FR-25.4a) — **new 2026-09-02**: a dense M4 row draws the mode glyph only when the mode is worth
  saying. 🛒 and 📍 are drawn; 🧳 is not, because it is what every other row means. The buy row and the pack row are
  asserted through the same `title` on the same icon, so the silence is falsifiable rather than merely unrendered.
  Written when the mapping moved into `lib/modeLabels.ts` and the rule became an option a call site can omit — which M4
  promptly did, and no test saw it. Red-proved.
* ~~**E2E-M4-32 (v1.0 catalogue, shadowed)** `all` (FR-20.4/20.2): quick-adding an item pulls its **required**
  companions onto the trip and reports it, while *suggested* ones are not added unasked; skipping the item co-skips
  those companions with the reason naming the parent.~~ — **retired 2026-08-30, read clause by clause, and one clause is
  an open owner decision.** The required pull and the co-skip with its reason are **E2E-M4-40**. That *suggested*
  companions do not join unasked became covered only on 2026-08-30, by **E2E-M5-23** — before that it was genuinely
  unasserted and invisible, because this id read as implemented while the suite carried the FR-19.2 cold-open meaning
  instead. **The remaining clause was never built**: the quick-add pulls required companions silently —
  `addRequiredCompanions` returns nothing and no caller raises a snackbar — so *and reports it* describes a report that
  does not exist. FR-20.2's skip, by contrast, *does* name what it took along. **Owner decision 2026-08-31: it is owed,
  and it is E2E-M4-66.**
* **E2E-M10-03** `all` (FR-20.1/20.4) — **new 2026-08-30** (`inventory.spec.ts`), and the hole this audit was for: the
  *„Hängt ab von"* section has been built since §3.20 and **nothing had ever asserted a rule of it**. Two other cases
  drive it as *setup* (E2E-M5-23 and the skip-item cascade both declare a dependency through this screen to get a
  companion onto a trip), and E2E-M10-13 reads its heading for a German word — a heading is not a behaviour, and a
  fixture is not an assertion. Three clauses, all on M10 itself: a new relation is *nötig* until someone says otherwise,
  which is what makes FR-20.4's cascade the default; the **reverse list only reads** — the companion row carries the
  mode as text and offers neither the select nor the removal the declaring side has, since the relation is owned by the
  item that needs the companion; and a dependency that would **close a circle is refused before the write**, naming the
  hops (`Kamera → Ersatzakku → Kamera`) rather than saying *invalid*. The refusal is asserted against a positive signal
  on the same screen: the companion row is still there afterwards, so „no dependency row" cannot be produced by a page
  that rendered nothing. The cycle arithmetic itself stays in `domain/__tests__/dependencies`; what is new here is that
  the fault reaches a user as a sentence.
* **E2E-M10-04** `all` (FR-22.1/22.5) — **new 2026-08-30** (`inventory.spec.ts`): the reference photo is added, replaced
  and removed, and the one trigger words itself for the state it is in (*Add photo* → *Replace photo*). Like the
  dependency section above it, this had no `data-testid` anywhere — the signature of a screen no test has rendered. Two
  things make it more than a screenshot: the two sources differ in **shape**, so the assertion is `naturalWidth` and not
  the object URL, which a rewrite changes whether or not the image did; and the item is left and reopened between the
  replace and the removal, which is what says the bytes were *stored* — the preview is resolved from `image_hash`
  through the device, so a round trip proves the write rather than the picker. **The ≤150 KB cap is deliberately not
  asserted here** (the id's original sentence promised it): the backoff is measured where it is deterministic, in
  `lib/__tests__/imageResize.spec.ts`, and enforced again at handler, store and CHECK (invariant 6). An e2e that
  re-measured it through a real canvas would be asserting the encoder and would be non-deterministic about the one
  number it claimed to check.
* **E2E-M10-05** `all` (FR-27.8) — **not implemented, and not a test gap: the section does not exist.** M10 has no
  *„Enthalten in"*, in either mode: the editor's saved-item half is photo, *Hängt ab von*, the delete card and
  *Begleitartikel*, and nothing lists the groups that hold the item. It was built in the **prototype** (Addendum §3.27,
  „fourth round") and never in the app. **Owner decision owed** — build it, or strike the clause. Deliberately left
  untested either way. **Three other documents read it as built**, which is why this is worth deciding rather than
  quietly deleting: PRD FR-24.5 names it first among „the existing-item sections … absent, not emptied" (it is absent in
  *both* modes, so that sentence describes nothing); FR-27.8 calls it „the navigable counterpart to the FR-2.4 usage
  counts", an argument whose other half — the count — is the only part that shipped; and E2E-M10-07's own sentence
  asserted its absence during creation, which is unfalsifiable against a section that never renders. All three are
  corrected as of this audit; the feature is not.
* **E2E-M10-06** `all` (FR-27.9) — **not implemented, and not a test gap: the section does not exist.** The same finding
  as M10-05 and it travels with it — FR-27.9 sits directly under FR-27.8 in the Addendum, was mocked in the same
  prototype round, and is likewise absent from `ItemEditorPage.vue`. **Owner decision owed**, and it is the more
  consequential of the two: FR-27.9 is the one that carries the owner's stated loop, improving the list from trip to
  trip, and the aggregation it needs (`comments` joined through `trip_items.source_item_id`) is client-side over data
  the device already holds. Nothing blocks it; it was simply never built.

### M11 — Container Management

**Audited 2026-08-30** (backlog item 6): every id read clause by clause against the built screen. All seven were already
implemented, so the audit's product was not new cases but two unasserted clauses, one unbuilt promise, and a note per
case saying which layer keeps what.

* **FR-10.3's threshold is a fixed 15 %, and there was never anything here to test.** `imbalanceThreshold()` read
  `attributes.imbalance_threshold` and defaulted to 15 %; both container surfaces called it and
  `domain/__tests__/containers.spec.ts` pinned that an override is honoured. **Nothing in the app ever wrote that key**:
  the M3 wizard writes `season`, `transport_mode`, `accommodation` and `tags`; M16 writes the series' defaults of the
  same three; M22 edits name, dates and travelers and touches `attributes` not at all. So every imbalance the app has
  ever rendered was measured against the default — the shape FR-25.19's `packer_user_id` and `trips.imported` had, a
  reader with no writer. **Struck 2026-08-31 (owner decision): FR-10.3 goes to a fixed 15 %, and the reader goes with
  the clause.** A percentage field is wanted only by someone who has met a warning they disagree with, and nobody has;
  keeping the read while nothing writes it made the requirement configurable in the document and fixed in the product.
  `imbalanceThreshold()` is now the constant `IMBALANCE_THRESHOLD_PERCENT` — the attribute branch was code kept for
  later, which CODING_PRINCIPLES §4a does not allow. Reversible the day a warning fires wrongly.
* **E2E-M11-01** `all` (FR-10.1) — **implemented across M11-05/06** (`e2e/containers.spec.ts`): create/edit/delete
  containers with name, carrier, max weight. **The clause that had no assertion anywhere is that the carrier is
  *optional*** (2026-08-30): M11-05 hands a bag to Andy and reads the name off the card, which a chip that could only
  ever hand it on would satisfy just as well. Taking the carrier off again is a write rule, so it is asserted at the
  write layer — `components/trips/__tests__/ContainerSheet.spec.ts`, tapping the active chip calls `updateContainer`
  with `carrier_traveler_id: null`. Red-proved by making `toggleCarrier` always assign.
* **E2E-M11-05** `all` (FR-10.1/25.15/24.5) — **implemented** (`e2e/containers.spec.ts`, mutation-proved: a one-sided
  pair write fails it): the ＋ FAB creates a container and opens its sheet; name and weight limit save on change with no
  Save button. Pairing is set **on both sides at once** and released on both when cleared. (The *deletion* half of that
  rule is asserted by E2E-M11-04, where it is visible; this case's containers are empty, and an empty pair renders
  identically whether or not the survivor was released.) **The „no Save button" clause was asserted on 2026-08-30** —
  the FR-25.15 row of the matrix had credited this case with it since the rebuild while the case asserted only that the
  indicator is *there*. The visible indicator is the positive signal the absence stands against, which is why the two
  assertions sit on the same line of the case. Red-proved with a Save button added to the sheet. (What FR-25.15 actually
  got wrong on this sheet was the *signal* the indicator is handed, and that is `saveIndicatorWiring.spec.ts`'s — a scan
  over all four call sites, see E2E-M5-07.)
* **E2E-M11-07** `all` (UX-8, 2026-08-27) — **implemented** (`e2e/containers.spec.ts`): with zero containers and nothing
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
  contents, so the screen offers no path to it. Re-assignment lives in M5's container control (`m5-container`), and
  belongs to that screen's cases — **written 2026-08-30 as E2E-M5-22**, which is where this sentence had been pointing
  for months with nothing at the other end.
* **E2E-M11-04** `all` (FR-10.3) — **implemented** (`e2e/containers.spec.ts`, asserted on both cards of the pair;
  mutation-proved: emptying the delete path's release writes fails it): pairing control shows a live imbalance indicator
  against the threshold, and **deleting one side releases the other** — the survivor stops reporting an imbalance
  instead of weighing itself against a container that no longer exists. The skew is what makes that assertable, which is
  why the rule is asserted here rather than beside the pairing case. **The threshold it is measured against is a fixed
  15 %** — the per-trip override was struck 2026-08-31, see the note at the top of this block.

### M12 — Analytics

**Audited 2026-08-30** (backlog item 6). All seven ids were implemented, and six of them hold clause for clause; the one
that did not is the reason this screen was worth reading. The general note the audit leaves behind: **M12 is a screen of
derived numbers, so most of its promises are kept in `domain/analytics.ts` and only their *rendering* is e2e work** —
the bar order (*heaviest first*), the unweighted row's exclusion from the bars, the slice keys and the trend arithmetic
are all unit-owned, and each case below says which layer answers for what. What e2e alone can establish is that the
number reaches a pixel and that the switcher and the bars actually move it.

* **E2E-M12-01** `all` (FR-8.1/8.2/**10.4**) — **implemented, and rewritten 2026-08-30 because two of its clauses could
  not fail.** The trip held one weighted item and it was packed, so *„packed / planned"* read `5.0 kg / 5.0 kg` and a
  KPI printing the planned weight twice satisfied it; and the switch to *Gepäck* asserted `analytics-slice-none`, the
  very locator the *Kategorie* view it started on already rendered for the same uncategorized item — the same element
  was visible before and after the click, so a segment that changed nothing passed. Under the second sat FR-10.4,
  credited to this case since the rebuild: **no test had ever put an item in a bag and looked at this screen**, so the
  dimension whose data source containers *are* had never been rendered with one. Now: two weighted rows, one packed and
  one not (`5.0 kg / 6.0 kg`, two different numbers), one of them in a bag created through M11's own FAB, and the
  *Gepäck* view splitting them into the named bag and the absence bucket — two slices where *Kategorie* had one, so a
  dead segment fails on the count alone. Mutation-proved twice: pointing `dimensionKey`'s container case at the absence
  bucket, and printing `plannedWeight` on both sides of the KPI.
* **E2E-M12-04** `all` (FR-8.2/25.11) — **implemented**: tapping a bar lands on M4 **filtered** to that value — asserts
  the facet is set (a row outside the slice is gone), the removable chip names the value, and clearing the chip reveals
  the grouping that came along. Regression guard: setting only the grouping (the pre-2026-08-08 behaviour) fails every
  assertion but the last. The clause *„clearing every other facet, since the reader tapped one number"* is
  **unit-owned** (`composables/__tests__/usePackingFilter.spec.ts`, six cases on `setStoredFacet` including a stale
  facet from a previous mount) — the e2e world has only one facet in force, so an assertion here could not tell a
  replacement from an addition.
* **E2E-M12-05** `all` (FR-8.2/25.1) — **implemented**: with rows assigned per traveler, the Person view shows **one
  contribution per traveler** plus the *Shared* bucket and no `undefined` bucket; the Category view sums the same rows
  into a single bucket, so the totals match across dimensions. (The multi-row per-person cluster shape is unit-owned in
  `analytics.spec.ts`, same rule.)
* **E2E-M12-02** `all` (FR-8.2) — **implemented**: an item without weight is counted beside the chart ("＋ n …"), never
  drawn as a zero-width bar; with no weighted rows the bar card states its empty state **and no KPI tile stands under
  it** (extended 2026-08-26, UX review UX-11 — the visible empty state and the unweighted counter are the settled
  positive signal beside the two absence assertions). **Which layer keeps which half** (read 2026-08-30): *„never drawn
  as a zero-width bar"* is unit-owned — this case's world has no bars at all, so the interesting arrangement (one
  weighted row *and* one unweighted, one bar not two) exists only in `domain/__tests__/analytics.spec.ts`. What the e2e
  keeps is that the counter and the empty line are painted and the tiles are not.
* **E2E-M12-07** `all` (FR-8.1, UX-11) — **implemented** (2026-08-26): the value KPI exists only when something carries
  a value — a priced master item quick-added to the trip renders the tile with the locale-formatted amount, while
  E2E-M12-02's price-less world renders no tile at all. **The amount is unit-less here because the case is `local`** —
  since FR-21.9 (2026-08-30) `formatValue` carries the instance's currency where one is named, and Local Mode has no
  server to name one. That half is E2E-M9-09's, on the `single` project, and it is the same `formatValue` on both
  screens; a currency assertion added here would assert the absence of a feature the mode cannot have.
* **E2E-M12-03** `all` (FR-14.3) — **complete since 2026-08-21, both halves**. The absence half: with a series but no
  archived history the trend section is *absent* rather than empty. The positive half: last year's trip taken through
  the whole lifecycle by hand — a weighted row packed, the trip started, the thing nobody had packed typed in (which is
  where FR-9.1 *missing* comes from), then archived — and this year's trip in the same series draws one trend column
  labelled with last year's year and carrying its **packed** kilos, with "Powerbank · 1× missing" in the flag list
  beside it. The flag is read back off the stored row in M5 before archiving, because an empty flag list would report a
  never-written flag just as quietly. The positive half was blocked until 2026-08-19, and it was a *product* gap rather
  than a test gap: nothing user-facing moved a trip out of *planning*, so §2.4 left no way to build the precondition;
  M4's start action (E2E-M4-43) is what unblocked it. **A third clause since 2026-09-04 (C-3b):** the section heading
  names the *series*, not the trip — it read `trip.series_name`, a field no writer has ever filled, so it fell through
  to the trip's own name and the line said „Series Elba 2026 · trend" about a series called Elba. Mutation-proved three
  times — pointing the trend at *active* trips, dropping *missing* from the flag counter, and putting the heading back
  on the trip name each redden it.
* **E2E-M12-06** `all` (FR-8.2/25.18) — **implemented** (`e2e/packing-list.spec.ts`): tapping a slice sets the grouping
  M4 comes back with, asserted after clearing the facet chip the same tap set. Crosses the screen boundary on purpose:
  M12 and M4 each held their own grouping state and each was self-consistent, so no unit could see that the handoff
  between them had stopped working. ADR-012 leaves one router outlet, so M4 is **not** remounted on the way back and a
  value written only to storage would not be read until the next cold start.
* **Not implemented, and not a test gap — there is no way from M12 to M11.** UI-Spec M11's *Navigation* line has said
  *„from the luggage button in M4's toolbar … and from M12"* since before the rebuild. `AnalyticsPage.vue` pushes
  exactly one route, `/trips/{id}`: tapping a *Gepäck* bar sets the container facet and lands on the packing list, which
  is FR-8.2's own action and a different thing from opening the bag's screen. No case id claims the M12→M11 edge
  (E2E-G9-11 covers M4↔M11 only), so nothing is red — the sentence simply describes an affordance the screen has never
  had. **Owner decision:** add the edge (the natural place is the *Gepäck* view's header, not the bar, whose tap is
  already spoken for) or strike the clause. UI-Spec M11 is corrected to say it is not built; no other document leans on
  it.

### M13 — Repack Mode — **REMOVED (2026-07-17)**
Feature removed from the product (PRD Addendum §3.11); its E2E cases are retired.

### M14 — Post-Trip Review Assistant

*(Reconciled 2026-08-16 with the FR-27.11 concept round: the assistant is a **list** whose
proposals target **groups**. The card-stack and template-target wording of the earlier
cases is superseded; the duplicate id the section carried is resolved by renaming the
no-flags case to E2E-M14-06.)*

**Audited 2026-08-30** (backlog item 6): every id read clause by clause against the built screen
and against `ReviewPage.spec.ts`, which is where most of M14's rules actually live. All six were
implemented and none is retired, so the product is three unasserted clauses — two of them clauses
that *could not fail* where they stood — and one unbuilt promise. The general note the audit leaves:
**M14 is a screen of derived proposals, so the domain answers for which proposals exist and the
component test for what the list does with them**; what e2e alone establishes is that archiving
arrives here, that the row's controls write, and that the group is read back from M8.

* **Not implemented, and not a test gap — the closing card does not tease the first two proposals.**
  UI-Spec M14's *Navigation* line has said since the rebuild that the archived trip's closing card
  *„teases the first two proposals and links to the full list"*. It links: `PackingListPage`'s
  `closing-card` renders a heading, a hint and two buttons (*Vorlage aus dieser Reise*, *Vorschläge
  ansehen*), and nothing that reads a proposal. No case id claims the teaser — E2E-M4-53 asserts the
  card's presence and E2E-M4-29 points the M14 half at M4-53/54 — so nothing is red; the sentence
  simply describes a surface the card has never had. **Owner decision:** build the teaser or strike
  the clause. UI-Spec M14 is corrected to say it is not built; no other document leans on it.

* **E2E-M14-01** `all` (FR-9.1/9.2) — **implemented 2026-08-20** (`e2e/review.spec.ts`): archiving a flagged trip
  auto-launches the assistant; a proposal reads correctly (kind chip *ungenutzt*/*fehlte*, the item name, the why line —
  "auf {n} Reisen nicht gebraucht" when the series history says so). **The last clause could not fail where it stood**
  (2026-08-30): the why line has two branches and this trip is in no series, so `historyCount` returns 1 and only the
  singular branch is reachable — the plural one had been rendered by nothing at any layer, because the *domain* takes
  the count as a parameter (`flaggedTripCount`, unit-covered) and the function that computes it from the series is the
  page's own. It is asserted since 2026-08-30 in `ReviewPage.spec.ts`, both directions: an archived sibling in the same
  series carrying the same flag makes the line read *2*, and an archived trip in a **different** series does not. Not
  e2e, deliberately — the world is E2E-M12-03's two-trip lifecycle staging, which is the suite's most expensive, for one
  sentence.
* **E2E-M14-02** `all` (FR-9.2/1.6) — **implemented 2026-08-20**, both halves read back out of M8: Apply writes directly
  to the row's target **group** — shared instance-wide per the FR-1.6 MVP simplification; **no fork prompt exists** —
  which is a statement about FR-1.6's model rather than an assertable behaviour, since there is no fork code in any mode
  for a case to find absent (checked 2026-08-30; the clause is kept as the reason apply is one tap, not as coverage). An
  *unused* apply zeroes the position, a *missing* apply adds one (creating the master item first for an ad-hoc name).
* **E2E-M14-03** `all` (FR-9.2) — **implemented 2026-08-20 for the pair scope and its persistence**: "Never ask again"
  removes that row and only that row, and the dismissal outlives the visit (the assistant is recomputed from current
  state, so this is the only piece of it that is stored). The second clause — *the same item still surfaces for another
  group* — needs the same item flagged twice under two groups, which one trip cannot produce; it stays unit-owned in
  `domain/__tests__/review.spec.ts`, and this sentence is its revisit trigger.
* **E2E-M14-04/04b** `all` (FR-27.11) — **implemented 2026-08-20**, split in two cases (`E2E-M14-04` for the targets,
  `E2E-M14-04b` for the blast radius, which needs a second planning trip following the group): every proposal names a
  **group** as its target and the picker offers groups only — never a Ferien-Vorlage (**that half is unit-owned**, read
  2026-08-30: this case's world contains two groups and no Vorlage, so the absence is of something absent;
  `ReviewPage.spec.ts` and `retargetGroups` in `domain/__tests__/review.spec.ts` both assert it against a world that has
  one); an *unused* row's picker offers only groups that actually carry the item, since zeroing a position that does not
  exist would apply as nothing. An *unused* proposal defaults to the group the row came from; a *missing* ad-hoc row
  defaults to the trip's dominant group (**the dominant-group default is the domain's**, `buildReviewProposals — missing
  flags default to the dominant group`: the e2e reads the picker's *options*, not its current value). Applying writes to
  that group; the row states the FR-27.4 blast radius ("Wirkt auf N geplante Reisen …") when planning trips use the
  target. *(The FR-27.4 applied-change entry on each planning trip is produced by the refresh, which landed 2026-08-18:
  M14 writes to the group, and the trips following it log the change on their next open — one mechanism, so M14 owes no
  push of its own.)* **Extended 2026-08-30 with the FR-27.12 peek** — the chevron beside the picker, which opens the
  target group's resolved contents before the proposal is written into it. It had coverage at no layer and no id claimed
  it: `m14-peek-*` occurred in no test and in no spec sentence, on a screen whose every other control was covered. The
  case now opens it on the *missing* row, reads the group's two positions out of it, asserts the proposed item is
  **not** among them — which is why there is a proposal — and closes it. Red-proved by pointing the trigger at `null`.
* **E2E-M14-05** `all` (FR-27.11, FR-9.4) — **implemented 2026-08-20, rewritten 2026-08-24**: the assistant renders as a
  **list with an open count**, not a card stack; applied and skipped rows remain visible and marked rather than
  disappearing, and "nie mehr fragen" removes the row for that item–group pair only. Since FR-9.4 the case also pins
  **where** a handled row is: out of *Offen*, into the *Erledigt* block, counted once on each side — and the finished
  state reached by handling both rows rather than by dismissing them. *(What it asserted before was the defect: that the
  empty state must not appear while decided rows exist.)*
* **E2E-M14-07** `all` (FR-9.4) — **new 2026-08-31** (`review.spec.ts`): the archived trip's closing card names the
  proposals it would offer. It lives in the review spec rather than beside the closing pass because **a proposal needs a
  row with provenance** — an ad-hoc row judged *unused* proposes nothing, since there is no position to zero — and that
  world is `review.spec.ts`'s own fixture. The clause had stood in UI-Spec M14 since the screen shipped with no id
  claiming it, so nothing was ever red.
* **E2E-M14-08** `all` (FR-9.4) — **new 2026-08-31** (`closing-pass.spec.ts`): a trip with nothing to review says so on
  the card. The positive signal is the card itself, on screen either way — listing nothing and *saying* nothing are the
  same pixel otherwise, and the second reads as "not loaded".
* **E2E-M14-06** `all` (FR-9.2) — **implemented, and the first clause was written 2026-08-30**: no flags → archiving
  skips the assistant with a "nothing to review" toast; opened directly, the screen shows the honest empty state;
  applied rows don't reappear on a later visit (resumability). The case had asserted only the middle clause — it
  navigated straight to `/review` and never archived. It now takes the trip through *Reise starten* → the closing pass →
  *Fertig* and asserts that the trip **is** archived and the assistant was **not** opened, read off the archived M4's
  own closing card. **The trap that made this worth doing:** `review.nothingToast` and `review.empty` are
  character-identical in both catalogues (*„Nothing to review — no flags were set."*), so a case asserting only the
  toast's text would pass just as well on the screen the clause is about not reaching. The toast is also filtered by
  that text rather than located as *a* toast — *Reise gestartet* is still on screen seconds earlier, and two matches are
  a strict-mode failure that presents as a flake. **The third clause is (a): already asserted elsewhere.** Resumability
  is not stored state — `buildReviewProposals` recomputes from current state, and both halves of "an applied row stops
  appearing" are pinned in `domain/__tests__/review.spec.ts` (*yields nothing when the group position is already
  zeroed*, *skips items the default group already contains*), which is the arithmetic an applied proposal produces.

### M15 — Import Wizard
* **E2E-M15-01** ~~`all` (FR-16.1): upload/paste CSV → grid preview; mark item column, category rows, per-trip
  include/name/date/series.~~ — **retired clause by clause 2026-08-30** (backlog item 6), because it is six promises in
  one sentence and they landed in five different places. *Upload* is **E2E-M15-10** and *paste* is every other case in
  the unit; *category rows* is **E2E-M15-11**; *per-trip include* is **E2E-M15-12**; *name/date*, prefilled from the
  header block, is **E2E-M15-05**. Two clauses do not survive the reading. **The grid preview did not exist** — step 1
  was a file button, a paste box and *Analyze*, and step 2 showed lists derived from the grid, never the grid. **Built
  2026-08-31 on the owner's ruling (ADR-041), and its promise moved to E2E-M15-13** rather than back onto this number,
  which a reader arriving from an old commit has to be able to land on. And *mark the item column* is left deliberately
  untested: the picker's candidate list is asserted in M15-05 and the same override, on the same control shape, is
  asserted for the category column in M15-07 — what is not covered is a *sheet* whose item column the detector reads
  wrong, and FR-16.1 already records that the surrounding inference has no manual override at all.
* **E2E-M15-02** `all` (NFR-4.7) — **implemented 2026-08-31** (`spreadsheet-import.spec.ts`): step 2 names the entries
  the sheet marked uncertain and up to three of them by name, step 4 counts the tasks the commit will write, and the
  case follows the chain to the prep badge on the imported row — the positive signal the note stands against. The task
  body is on the catalogue (NFR-4.12), asserted in the *other* locale by `composables/__tests__/import.spec.ts`, because
  a body read through `t()` in the default language is equally satisfied by the literal it replaced. *(Until then: the
  rule was built and unit-covered at both levels and no surface said so.* A trailing `?` becomes an item plus an open
  task on its trip row — `buildImportPlan` strips it and sets `hasOpenTask`, `commitImport` writes the todo, and both
  halves are unit-covered (`domain/__tests__/spreadsheet.spec.ts`, `composables/__tests__/import.spec.ts`, which asserts
  the todo lands `open`). What no surface does is *show it inline*: neither the mapping list nor the confirm summary
  mentions a question mark or the tasks the commit is about to create, so the user meets them first inside the trip.
  **Not implemented, and not a test gap — owner decision.** Documents leaning on the clause: UI-Spec M15 Step 2, which
  even supplies the example wording. Recorded with it, because it is the same sentence: **the task's body is a
  hard-coded English string** in `commitImport` (`Imported with '?' — clarify: …`), which NFR-4.12 would put on the
  catalogue like the notification bodies (ADR-037).
* **E2E-M15-03** `all` (FR-16.3) — **implemented 2026-08-30** (`e2e/spreadsheet-import.spec.ts`): step 3 had existed
  since the wizard was built and **no test had ever opened it**, because every fixture in the unit imports into an empty
  device, where there is nothing to be a duplicate *of*. The inventory is therefore built by an import of its own — M15
  is the screen that turns a sheet into master items — and the second sheet carries one exact repeat and one one-letter
  neighbour. The near one is switched to *keep separate*, the exact one left on the default; the confirm reports *2 new
  items, 1 merged*, and afterwards M9 holds **five** rows. The count is what makes the merge legible: „no second
  *Wanderschuhe* appeared" is equally true of an import that created nothing at all. *(Mutation-proved: with `plan`
  merging every match regardless of the choice, the kept-apart item never arrives.)*
* **E2E-M15-13** `all` (FR-16.1, ADR-041) — **new 2026-08-31**: step 1 renders the grid the parser read, live while the
  text is being pasted, before anything is derived from it. Asserts the one thing a derived list cannot show — a quoted
  comma kept as **one** cell — plus a short row keeping its shape rather than shifting its neighbours left, the row
  count, and that the wide content scrolls inside its own box. It carries E2E-M15-01's grid clause, which is retired
  there rather than revived.
* **E2E-M15-04b** `all` (FR-16.1) — **new 2026-08-31**: the confirm names each trip's target series, and names *„keine
  Serie"* where none was chosen. Asserted from both sides — first with no series to prove the row is not merely silent,
  then after choosing one — because a row that always printed *„keine Serie"* would satisfy half of it.
* **E2E-M15-04** `all` (FR-16.2/NFR-4.7) — **two clauses covered, one unbuilt, one wrong.** *n items* and *n archived
  trips* are asserted on the confirm line by M15-06/08/11 and committed by M15-05/08/11; *pre-validation blocks a bad
  file before commit* is **E2E-M15-12**. The *target series* clause is **E2E-M15-04b** since 2026-08-31: each confirm
  row names the series its trip will join, and says *„keine Serie"* where none was chosen. Until then the picker was on
  step 2 and `commitImport` wrote `series_id` (unit-covered in `composables/__tests__/import.spec.ts`) while step 4
  printed trips, items, merges and categories and nothing about where they land. And *transactionality* is an
  **approximation, not a rollback**: the plan is validated before a single mutation is enqueued and replay is
  idempotent, but nothing rolls back and there is no progress indicator — UI-Spec M15's *„transactional commit with
  progress; failure rolls back completely"* is corrected with this entry rather than left as a promise no code keeps.
* **E2E-M15-05** `single` (FR-16.1/16.2, FR-2.1b) — **implemented**: a CSV with a two-row header (year above name) and a
  category column imports through the wizard; the mapping step shows the name and the date it read from the two header
  rows, and both column pickers offer *candidates* rather than every column — a column holding quantities can be neither
  of the two they choose; after the commit the trip is on M2's Archived segment, and **a second browser context that
  never saw the optimistic write finds the trip and its packed rows** — the only assertion that can tell a wire that
  carried the import from a screen that only believed it. Cases 01–04 remain written and unimplemented.
* **E2E-M15-06** `all` (FR-16.1) — **implemented**: a sheet whose category is a *column* has it detected, and the
  confirm step reports the categories it produced. ~~and no item turned into one~~ — **that half cannot fail here**
  (found 2026-08-30): with a category column the analysis claims no category rows at all, so no item was ever a
  candidate to become one. The clause is falsifiable only in the *rows* layout, and it is asserted there by
  **E2E-M15-11** — where the mutation that stops claiming heading rows does turn both headings into items.
* **E2E-M15-07** `all` (FR-16.1) — **implemented**: setting the category-column picker back to *None* is honoured rather
  than re-detected, and the plan then carries no category at all. The override is the escape hatch for a column the
  detector reads wrong — a *Notes* column carrying text and no quantities looks exactly like a category to it.
* **E2E-M15-08** `all` (FR-16.1) — **implemented**: a sheet with no trip column at all passes the mapping step, reports
  *0 archived trips* with its items, and lands on the inventory rather than on the trip list. It used to be refused
  outright, and the bare list it imports would have arrived as categories and no items.
* **E2E-M15-10** `all` (UX-6, G-17, ADR-035) — **implemented**: M15's file control is the app's own catalogue-labelled
  button, not the browser's file chrome, and a file picked through it lands its text on the same path the paste area
  feeds — asserted end to end by the mapping step appearing for the picked CSV.
* **E2E-M15-09** `single` (FR-24.2/16.3) — **implemented**: after an import, a **second browser context** filters M9's
  tag axis to the imported category and finds the item under it, and a name the sheet listed twice is there once. Both
  halves were refused at the wire and invisible on the importing device: the tag link was enqueued before its item, and
  `items` is UNIQUE (name). *(Honesty note, 2026-08-30: the „there once" half is carried by Playwright's strict mode — a
  second row makes the `getByText` resolve two elements and throw — rather than by a count of its own. It cannot pass
  against a duplicate, so it is coverage; it just does not read like it.)*
* **E2E-M15-11** `local` (FR-16.1/16.2/24.2) — **implemented 2026-08-30** (`e2e/spreadsheet-import.spec.ts`): the
  **category-row** layout, which is the one this wizard was built for, end to end. Everything the unit drove until now
  had its category in a *column*, and the one case that commits (M15-08) imports a sheet with no category rows and no
  trip at all — so `analyzeGrid`'s heading-row branch had never produced a row anybody could see. Two headings become
  tags and do **not** also become items (three new items out of five named rows), the two trip columns land archived
  under the years that are their only header, and on M9 the heading filters to the two items beneath it and not to the
  third. The write half and the read half are two behaviours: a tag that exists is not a tag on an item (FR-24.2).
  *(Mutation-proved on the `categoryRows` push: the summary then reads „5 new items, 0 categories".)*
* **E2E-M15-12** `local` (FR-16.1, NFR-4.7) — **implemented 2026-08-30** (`e2e/spreadsheet-import.spec.ts`): the mapping
  gate, and the include toggle as the way past it. A trip column the sheet **dates but never names** is preselected —
  FR-16.1 leaves out only a column carrying *neither* fact — so the step names what is missing and refuses to advance;
  unticking that column releases it and the confirm then reports **one** archived trip. Both controls were unasserted:
  the note existed in the suite only as M15-08's *absence*, and nothing had ever clicked the per-trip include checkbox.
  *(Mutation-proved on `mappingValid`'s name check.)*

### M16 — Series & Destination Profile

**Audited 2026-08-30** (backlog item 6), and it is the first screen the programme met with **no
coverage at any layer**: four unwritten ids, no `client/e2e/series.spec.ts`, no component test, and
not one `data-testid` in `SeriesPage.vue` — the signature the M20 pass named. Nothing here was
retired: all four ids describe behaviour that is built, every one of them a *write* (the name, the
three FR-15.1 defaults, a destination profile created on first use, its checklist, attach and
detach), so all four are written. **Rendering the screen for the first time found a control that
did not work at all** — see the note below — which is the whole argument for reading a promise
against a screen rather than against a stylesheet (G-14).

* **Fixed while auditing, not a test finding — FR-13.3's checklist could not be typed into.** The
  add-row's `ion-input` rendered at **zero width**: Ionic gives `ion-select` `width: 100%`, which as
  a flex item is a flex-basis of the whole row, so the free space beside it is already negative and
  the input — flex-basis 0 — grows by nothing and shrinks to nothing. The `＋` and the mode picker
  were on screen and the field was not, so the editor UI-Spec M16 promises was unreachable. No test
  could have caught it: the native input is in the DOM, `getByTestId` resolves it, and only
  Playwright's *visible* check (and the screenshot beside it) says it has no box. The select is
  content-sized now; E2E-M16-02 is the standing assertion, because it types into that field.
* **E2E-M16-01** `all` (FR-13.1/15.1) — **implemented 2026-08-30** (`e2e/series.spec.ts`): the series
  name and the three default selects are editable, and both are read back after leaving the screen
  and returning rather than off the control that wrote them. The sentence used to say *chips*; the
  screen has selects and always has, so the wording is corrected here and in UI-Spec M16. It also
  covers the **rename refusal** UI-Spec M16 states and no test had ever exercised: renaming onto
  another series' name is refused on the client (`trip_series.name` is UNIQUE instance-wide), the
  toast names the holder, and the field goes back to the stored name — with a free rename after it,
  read off the header, which renders from the series and not from the field. **The trap it found:**
  `toContainText` on an `ion-select` matches its **options**, not its value, so
  `toContainText('Summer')` is true of a season select nobody has ever touched. The untouched second
  series is asserted first for exactly that reason, and the value is read from `.select-text`.
  Red-proved twice (blanking the attribute read, dropping the field's revert).
* **E2E-M16-02** `all` (FR-13.3) — **implemented 2026-08-30**: with no destination profile in
  existence the checklist states its own emptiness; typing notes and adding an entry both go through
  `ensureDestinationProfile`, and the read-back after leaving and returning is what proves the row
  it created is real. The entry keeps its procurement mode, and removing it returns the empty state —
  the positive signal the two absence assertions stand against. Red-proved by dropping the write.
* **E2E-M16-03** `all` (FR-13.2) — **implemented 2026-08-30**: the history lists the series' trips
  with their packed/total line, a trip in no series is *not* in it, and detach and attach move one
  each way. Detach sits on a row that is itself a link to the trip, so the case asserts M16 is still
  the rendered page afterwards — a `.stop.prevent` that stopped working would otherwise read as a
  pass. The attach is read back on **M2**, whose series header counts the trips: the write is a
  trip's `series_id`, not a list local to this page. Red-proved by making detach re-attach.
* **E2E-M16-04** `all` (FR-13.2/15.1) — **implemented 2026-08-30**: *„New trip in series"* opens M3
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
  later" as dead code, and the sentence above is the record instead.

### M17 — Settings & Notifications
* **E2E-M17-01** `server` (FR-6.2) — **implemented 2026-08-30**, in `e2e/server/multi-user.spec.ts`. Four kinds rather
  than the three this sentence used to name: `lock_taken` joined them with FR-5.7. Bob turns *Delegations* off in his
  own M17, the choice survives his reload, and Alice's next hand-over produces no toast on his screen — while the same
  pair of pages produced one before he touched it, and a **mention** afterwards still arrives. The two positives are
  what make the absence assertable: a toast that has not come yet looks exactly like one that never will, and the
  mention rides the same connection the suppressed delegation would have. It also proves the switch is *per kind* rather
  than a mute. The ends were covered and the wire between them was not — Go's
  `TestNotificationPrefs_DisabledKindSuppressesCreation` for the rule, `composables/__tests__/settings.spec.ts` for the
  PUT, and nothing saying the switch the user flips is the value the server reads.
* **E2E-M17-02** ~~`server` (NFR-4.6): "Push on this device" registers via the Push API/VAPID (permission mocked);
  support detection hides it where unsupported.~~ — **retired as an e2e case (2026-08-30), and covered where it can
  be.** The browser dance is unit-owned end to end in `notifications/__tests__/push.spec.ts`: the VAPID key is fetched
  and the subscription registered, an existing subscription is reused rather than resubscribed, a denied permission
  returns false, an unsupported browser returns false, and the unregister drops it on both sides. The half a rendered
  case would add is *„hides it where unsupported"*, and that branch cannot be produced in either browser the suite runs:
  Chromium and WebKit both carry `PushManager`, so `pushAvailable` is true in every project that exists. The control is
  disabled rather than hidden, and asserting `disabled` on an Ionic toggle is the E2E-M17-05b trap — a bound boolean
  reflects onto no DOM attribute — so the case would have been green against the branch being gone. **Revised
  2026-09-01:** the retirement's reasoning was one half short. It weighed the *unsupported* branch and concluded a
  rendered case adds nothing — but the half neither layer had was the **round-trip**, the subscription the browser dance
  produces actually reaching the instance. That is E2E-NFR-06, and it also found the toggle had no `data-testid` at all.
  M17-02 stays retired; the clause it was retired *for* is still unreachable.
* **E2E-M17-03** `server` (NFR-4.5) — **implemented 2026-08-30**, in `e2e/server/data-export.spec.ts`. `server` rather
  than the `all` it used to claim, for two reasons found by reading it against the screen: in Local Mode this is a
  **different section** — per-trip and per-template YAML written client-side, because there is no server to ask — and in
  `single` there is no token, so the auth header the promise is about is never sent. Both files are read back rather
  than counted: the JSON is parsed and asked for the trip, the CSV for the row. An export is one half of a pair, and the
  half that matters is the one that has to be readable when it is the only copy left.
* **E2E-M17-04** `single` (FR-17.13) — **implemented 2026-08-26**, in `e2e/single/settings-profile.spec.ts`: editable
  display name against a real jitpackd. The untouched field shows no rule note whatever name the server handed out;
  emptying it is the first touch and the note appears; a name with a space and a diacritic — what the pre-revision
  `[A-Za-z0-9._-]` rule refused — saves and survives a reload, proving the server accepts it too.
* **E2E-M17-12** `single` (FR-17.13) — **implemented 2026-09-01**, in `e2e/single/settings-profile.spec.ts`: the picked
  file opens the crop stage, the stage covers it, the slider scales it, and *Use photo* writes a 256×256 JPEG that the
  profile row then shows where initials were. The size is read back off the endpoint that serves it rather than trusted
  from the canvas call. **Both halves of the blocker this entry carried since 2026-08-22 were wrong**, which is why it
  stood open for ten days: `setInputFiles` fills a hidden `<input type=file>` with no browser dialog involved, so a
  missing `data-testid` was never the obstacle — the modal's own markup is addressable, and it carries four ids now
  because a class name is not a seam; and the canvas does offer a settled signal, namely the uploaded picture appearing
  on the row, so nothing here waits on a timeout. The entry also promised the result *reflected in the dashboard
  greeting*, and **the greeting is a time-of-day line carrying neither a name nor a picture** — corrected against the
  screen, in UI-Spec M17 as well. `server` is not claimed: the branch that project owns is whether the control is
  *offered* to an OIDC account, which is E2E-M17-05; the crop itself is the same component in both. It is the case that
  reproduced the owner's 2026-09-01 report and the one that red-proves the fix — see the log.
* **E2E-M17-05/05b** `server` (FR-17.13) — **implemented 2026-08-29**, in `e2e/server/settings-profile.spec.ts`. Its
  promise was rewritten with the requirement, because the old one ("profile read-only with an IdP note, no editable
  name/avatar") described behaviour the revision removed. The profile splits: **E2E-M17-05** asserts the picture control
  is offered to an OIDC account — the branch that changed, and one only a project with a real login can reach;
  **E2E-M17-05b** asserts the other half held, that the name is still the provider's. The name half asserts the *absence
  of the save button* rather than a `readonly` attribute: Ionic reflects a bound boolean onto no DOM attribute, so
  asserting the attribute would pass against an editable field too.
* **E2E-M17-13** `server` (FR-23.7) — **implemented 2026-08-30**, in `e2e/server/api-token.spec.ts`: a token created in
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
* **Not covered here, and deliberately:** that the block is **absent** in Single-User and Local Mode. Neither project
  can render it — `single` has no session and `local` no server — so the two absence cases live in
  `views/settings/__tests__/SettingsApiTokens.spec.ts`, mutation-proved against the removed gate, because a surface that
  must not appear is exactly the kind that ships appearing.
* **E2E-M17-06** `local` (G-11/FR-21.3) — **implemented 2026-08-30**, in `e2e/settings.spec.ts`: the Appearance toggle
  switches the flavour, and Latte survives a reload. Written because **every other theme assertion in the suite seeds
  `jitpack_theme` into `localStorage`** — `colour-anchors`, `surfaces` and `visual` all prove the *palette* and none of
  them the switch. The last click is what proves the reloaded control came back *on*: against a toggle rendering
  stale-off it would turn Latte on a second time and the assertion would fail.
* **E2E-M17-07/07b** `local` (NFR-4.11) — **implemented 2026-08-30**, in `e2e/settings.spec.ts`, and the clause
  ~~cleared after a YAML download~~ **was the defect's own description**. NFR-4.11 says in as many words that the export
  the reminder is about is the *whole device* in one file — the G-2 sheet's one-tap backup. M17's two YAML downloads are
  a single trip and a single template, and they stamped the same key: exporting one trip silenced the warning about
  everything the file did not contain. They were written when M17's YAML *was* the only export and the device backup
  (ADR-015) arrived beside them without anyone revisiting it. The case now asserts the opposite — one trip downloads and
  the warning stays; the device backup clears it. **E2E-M17-07b** covers the age: a stamp forty days old is read back
  and worded, plural included, off a seeded value rather than a mocked clock, because the decision itself
  (`reminderState`) is pure and unit-owned. The fix's tail: the banner was only ever recomputed by the exports that
  should not have counted, so it now refreshes on entering the screen — the backup is taken in another component.
* **E2E-M17-08** `local` (G-8/FR-17.3) — **implemented 2026-08-30**, in `e2e/settings.spec.ts`: a device with no session
  carries no notification section at all, asserted against the sections that *are* there so a screen that failed to
  render cannot satisfy the absence. `local` alone rather than `single/local`: the gate is `mode === 'server' &&
  tokens`, and both halves of that are false in either, so one of them says it.
* **E2E-M17-09** `server` (FR-23.1): Administration row visible only for an instance admin with an OIDC session.
* **E2E-M17-10** `all` (NFR-4.12): the Language row switches the app to German and back — the chrome as well as the
  screen. Asserted on the four anchors in **both** presentations (tab bar and desktop rail — one list, two widths), the
  header bar's route title and M2's own segment labels, because those three used to be *stored English text* rather than
  catalogue keys: a nav anchor kept `name`, a route kept `meta.title`, and no language choice could reach either. It
  asserts the English words first, so „the German word is there“ cannot pass on a build that rendered neither, and
  re-asserts after a reload (device-local, FR-21.3's pattern).
* **E2E-M17-11** `all` (NFR-4.12): **M17 itself** follows the switch — profile, appearance, data, conflict log and
  about, each asserted in English first so the German cannot pass vacuously. It is the screen the language setting
  *lives on*, which is where a half-translated section is most visible: the user changes the setting and half the page
  ignores them. **Not covered here, and deliberately:** the notification section exists only on a multi-user instance
  (`server` mode *and* a session), which neither Playwright project reaches — `local` has no server, `single` has no
  tokens. It is covered by `views/settings/__tests__/SettingsPage.spec.ts`, which mounts the screen with a session and
  asserts the row labels in both languages. That section is the one that carried its labels in a module-level constant,
  so it is the half that most needed a test.

### M18 — Portable Import Preview
* **E2E-M18-01** `all` (FR-18.4/18.5) — **implemented 2026-08-30** (`e2e/backup-restore.spec.ts`): template YAML →
  summary header (name, kind, item count, `schema_version`) + per-item state (new/near-duplicate/matched, each on its
  own row, and **only the near row carries a choice** — a decided state offers none); Import creates the template,
  landed whole, with its three positions on M8. The screen's *preview* branch had no rendered coverage at all until this
  case: the two `packing-list.spec.ts` cases that come through M18 use it as a **fixture** for a trip with quantities
  and click straight past the preview. Two clauses corrected against the code: the template is **shared instance-wide**
  (FR-1.6 MVP), never „private owned“ — `templates.owner_id` is creator metadata the server stamps, and the word had
  also reached two production doc-comments; and the ADR-030 name-collision clause is asserted by **E2E-M18-11** at the
  screen (`findExistingSubject` is one function for all three document kinds, so the trip case covers the template's
  branch of it) and by `composables/__tests__/portableImport.spec.ts` at the rule. *(Mutation-proved: with the state
  chip reading `matched` for every row, the *new* assertion falls.)*
* **E2E-M18-02** `all` (FR-18.4, ADR-024) — **the sentence was itself the defect, and the corrected promise was a real
  gap; implemented 2026-08-30** (`e2e/backup-restore.spec.ts`). *„Creates a trip in **planning** status“* has been false
  since ADR-024 (2026-08-23): a trip arrives in **the status the file carries**, and *planning* only when it carries
  none. The stale wording had spread — UI-Spec M18's *Actions* line, its restore-branch paragraph,
  `importPortableDocument`'s doc-comment and the inline comment three lines above the code that reads `doc.status`; all
  four are corrected with this case. What the corrected promise then exposed is the branch nobody drove: **E2E-M18-09
  covers the restore list**, and ADR-024 explicitly rejected honouring the status *only* there, on the grounds that the
  same file would otherwise behave differently depending on which button opened it — so the **preview** branch is the
  half that rejection is about. The case imports an archived trip document through the preview, finds it on M2's
  *Archived* segment and asserts it is **not** on *Planned*, which is exactly where it used to land.
  *„Travelers/containers remapped by name“* stays unit-owned (`composables/__tests__/portableImport.spec.ts`): the remap
  is invisible on any screen this case can reach without a container view of its own. *(Mutation-proved on `{ status:
  doc.status ?? undefined }`.)*
* **E2E-M18-03** `all` (FR-16.3) — **implemented 2026-08-30** (`e2e/backup-restore.spec.ts`), and the parenthetical
  corrected: **there is no shared dedup component**. M15 Step 3 and M18's preview each render their own list and hold
  their own `mergeChoices` map; what they share is the *rule* (`domain/spreadsheet.ts`'s `findDuplicates`, which
  `matchPortableItems` wraps) and two catalogue keys. Reading the clause as written would have sent somebody looking for
  a component to change. The case drives the choice to where it becomes visible — the inventory: two near-duplicates in
  one document, one left on the default (*merge*), one switched to *keep separate*; afterwards M9 holds a new item for
  the one kept apart, none for the merged one, and **three rows in total**. The count is what makes the absence mean
  something: „no second item appeared“ is equally green against an import that created nothing at all.
  *(Mutation-proved: with `commit()` merging every match regardless of the choice, the kept-apart item never arrives.)*
* **E2E-M18-05** `all` (NFR-4.11/FR-19.6/FR-18.4, ADR-015) — **implemented** (`e2e/backup-restore.spec.ts`): the round
  trip. A backup taken through the G-2 detail on a device carrying a group and a packed trip restores onto a **second
  browser context** — a device that has never seen the data, which is what stops the case passing against an importer
  that does nothing. The multi-document file lists its documents (template and trip named as such) rather than opening
  the merge preview; after *Import all* both partitions are present and the trip keeps its packing progress. The list is
  **already on the Planned segment**, asserted without tapping it — restored trips are *planning*, and landing on Active
  showed „No active trips“ after a restore that had worked. Asserted on `trip-row-<name>`, never on the trip's name as
  text: the pasted YAML is still in the textarea, so a bare text match reads the *input* — which is how the missing
  `/tabs/trips` redirect this case found had stayed invisible.
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
  segment rather than the constant *Planned* it used to. The negative companion is asserted too — the trip is **not** on
  Planned, which is exactly where it used to appear. *(Added 2026-08-23. The device needs a template as well as the
  trip: a single-document file is M18's merge preview, not the restore branch. The marks-and-tags half of ADR-024 is
  unit-covered end to end — `buildBackup` → `commitPortableRestore` on a fresh store — rather than here, because
  building a tagged, marked inventory item through M10 doubles this case's length to assert what the unit already
  asserts at the same boundary.)*
* **E2E-M2-10** `single` (FR-2.3, ADR-033) — **implemented** (`e2e/single/server-sync.spec.ts`): a trip the device has
  **never opened** still shows its progress on the list. One context builds a trip with two items and packs one; a
  **second** context — a device that has never been inside that trip — opens M2 and its row reads `1/2 packed` with
  nothing clicked, and the trip-partition request count is asserted beside it, so the number cannot have come from
  somewhere else. The second context is the whole point: on the device that built the trip the rows are already in the
  store and the case would pass against a screen that loads nothing. *(Added 2026-08-25. Mutation-proved: with the row's
  request removed the summary stays on „Loading items …" — it does not fall back to `0/0`, because the two halves of
  ADR-033 are independent.)*
* **E2E-M2-11** `single` (FR-12.1, ADR-033) — **implemented** (`e2e/single/server-sync.spec.ts`): cloning a trip the
  device has **never opened** carries its items. Before the guard, ClonePage summed a partition that was not on the
  device: the preview read `0 items, 0 travellers` and the clone was created exactly that empty, with no error anywhere.
  A second context opens the source's clone page directly, the preview settles on the real counts (the loading line
  stands in until the partition arrives, and the button stays locked with a name typed — both unit-tested in
  `ClonePage.spec.ts`), and the created clone opens with both source rows visible. `cloneTrip` itself refuses an
  unloaded source (`clone.spec.ts`). *(Added 2026-08-26, from the 2026-08-25 UX review's UX-1.)*
* **E2E-M2-12** `all` (FR-2.1, UX-5) — **implemented** (`e2e/trip-list.spec.ts`, 2026-08-26): a dated trip's temporal
  line is the locale-formatted range (`Aug 22 – Sep 5, 2026` in the suite's English), never interpolated ISO strings.
  Intl collapses the shared year, so a hand-written `start – end` fails the assertion too. The German shapes,
  *until/from* and the year-only line are unit-owned per locale in `lib/__tests__/format.spec.ts`; the greeting buckets
  (UX-15) in `lib/__tests__/greeting.spec.ts`.
* **E2E-SYNC-01** `single` (Sync-API §4) — **implemented** (`e2e/single/server-sync.spec.ts`): a master partition
  **larger than one page** arrives whole. 520 items are pushed straight at the API (this case is about the size of a
  partition, not about clicking five hundred times), then a browser that has never talked to the instance boots and the
  **last** row of the feed is asserted on M9. The request count is asserted beside it — more than one pull, or the seed
  no longer exceeds a page and the case would be proving nothing. *(Added 2026-08-25 after the family instance served a
  device 500 of its 717 master rows and said nothing: M2 read „Keine archivierten Reisen" with the G-2 glyph green.
  Mutation-proved: with the loop taken out, the last row is never found.)* **Read 2026-09-01 (audit of backlog item 6,
  the SYNC row), and what it found is not an e2e gap:** §4's paging rule had **two implementations** —
  `SyncOutbox.drain`, which every browser runs and this case covers, and `usePull.pullMasterAll`/`pullTripAll`, which
  the FR-18.7/18.8 command line runs and nothing here reaches. They had drifted exactly where the log said they would:
  the progress guard (*stop when `next_cursor` does not advance*) was the drain's alone, so a server claiming more
  without moving the cursor made `jitpack import` spin for ever. The rule is named once now
  (`client/src/sync/pullProtocol.ts`) and both callers ask it. Its twin, §3's observe step, was the same story upside
  down — asserted **only** on the command line's copy, so the drain every browser runs had no case for it at all; it has
  two now (`useSyncOutbox.spec.ts`). No new e2e id: both are rules below the screen, and a second paged-partition case
  would re-drive the loop E2E-SYNC-01 already drives.
* **E2E-M18-10** `local` (FR-18.4, ADR-030) — **implemented** (`e2e/backup-restore.spec.ts`): the same backup, restored
  **twice** onto one device, carrying all three document kinds — a group, a Ferien-Vorlage and a trip. The first run
  lands them and the restore list shows no *Schon vorhanden* mark; the second run marks **every** row before the button
  is pressed, raises the toast that counts what it left alone, and leaves **exactly one** trip, **one** group and
  **one** Vorlage, with no `(import)` suffix anywhere. The count is the point: an assertion that no second row appeared
  would be just as green against a restore that deleted the first. *(Added 2026-08-24. Mutation-proved: with the
  identity check reading an empty trip list, the second restore produces two rows and the case fails on that count.)*
* **E2E-M18-11** `local` (FR-18.4, ADR-030) — **implemented** (`e2e/backup-restore.spec.ts`): the **single-document**
  half of the same rule, which is a different branch of M18 — the merge preview, not the restore list. A device with one
  trip and no template backs itself up (one document by construction, so the year stays out of the fixture) and the file
  is pasted back on that same device: the preview carries the note **before** the button, *Import* opens the trip that
  was already there rather than a copy, the toast says so, and M2 still lists it once. *(Added 2026-08-25 during the
  PR's own review, which found the preview's note and toast written into a template nothing ran. Mutation-proved on
  `findExistingSubject`.)*
* **E2E-M18-12** `local` (FR-25.11j, NFR-4.11) — **implemented** (`e2e/backup-restore.spec.ts`): a backup gives back
  **where a row was bought from**. A BUY_BEFORE row is bought on M6, which moves it to the packing list (FR-3.3) and
  leaves `bought_from` as the only record M6's reveal can find it by; the device backs itself up and the file is
  restored onto a second, empty context. On the restored device the row is an open row on M4 **and** M6's bought bar
  counts it, the reveal names it with *on the packing list*, and it is on no open shopping row. The bar is the positive
  signal: before the fix the portable format carried the mode and the count and not the record, so the restored row was
  on the packing list with the shopping side knowing nothing — neither an open row nor a bought one, and no bar at all.
  *(Added 2026-09-02. Mutation-proved: with `serializeTrip` writing no `bought_from`, the case fails on the bar.)*
* **E2E-M18-04** `all` (FR-18.5) — **implemented 2026-08-30** (`e2e/backup-restore.spec.ts`): a newer `schema_version`
  shows a warning but imports best-effort — an unrecognised key and all — and a malformed file is refused **at this
  screen's own picker step**, with the parser's reason, no preview opened and the pasted text still in the field to
  correct. The parenthetical *„never reaches this screen“* is struck: the picker **is** M18's first state, and the
  refusal happening here is the point — refusing somewhere else would leave nothing to fix. Written because the parser's
  rules are exhaustively unit-covered (`domain/__tests__/portable.spec.ts`) and **nothing rendered either message**; a
  rule nobody paints is a rule the user never hears. *(Mutation-proved twice — `newerSchema` forced false, and the parse
  error's own string dropped.)*

### M19 — First-Launch Mode Selection
> **Read 2026-08-30, audit of backlog item 6.** M19 is the screen every
> other spec **bypasses**: `seedMode` writes `jitpack_mode` into
> localStorage before boot, so until this pass no test had ever *made* the
> choice this screen exists for — its two cards were asserted visible and
> neither had been clicked. The two ids that describe the connect path are
> half unbuilt, and the unbuilt half is the same clause twice.

* **E2E-M19-01** `local` (FR-19.1, NFR-4.11) — **implemented 2026-08-30**, no longer *partial* (`smoke.spec.ts`). The
  two cards were already asserted; the rest of the sentence is now one case: *"Just on this device"* lands on M1's empty
  state (G-7), the device asks the browser to keep what is now its only copy, and a reload does not ask again. The
  persistence request is asserted through a stubbed `navigator.storage` whose `persisted()` answers false, so the
  request is actually made and the case does not depend on whether *this* browser grants it. It happens on the boot
  after the choice rather than in the click handler — `connect()` asks, once the mode is persisted — which is what
  NFR-4.11's *"on first launch"* means in a client that re-inits by reloading.
* **E2E-M19-02** `server/single` (FR-19.1) — **the two destinations are covered; the validation in front of them is not
  built.** The `server` destination is asserted by `loginAs` (`e2e/server/fixtures.ts`) in every multi-identity case: no
  session + an instance that offers OIDC → the login screen, and through it the real broker. The `single` destination is
  **E2E-M19-02's own case** (`e2e/single/mode-discovery.spec.ts`, new 2026-08-30) — it asserts the 501 from
  `/auth/config` beside the rendered dashboard, because "no login screen" is equally green on a device that never asked,
  and because invariant 5's whole Single-User distinction is that one response. ~~validates the URL against the health
  endpoint~~ — **not built**: `ModeSelectionPage.vue` validates the URL's *syntax* (parses, and `http:`/`https:`),
  stores it and reloads; nothing requests `/health`. **Struck 2026-08-31 (owner decision): the check is not buildable as
  specified, so the clause goes rather than the code.** The API sets no CORS headers, deliberately, so a cross-origin
  probe cannot tell an unreachable host from a reachable one that will not answer a scripted request — the promised
  inline error would lie to whoever's instance is healthy. That is a contradiction between two decisions, not a test
  gap, and no amount of test-writing resolves it. The app learns the truth at the login attempt, where the server
  answers for itself. It has never been missed because the field arrives **pre-filled with the page's own origin**
  (E2E-M19-04), which is the correct answer for every self-hosted instance.
* **E2E-M19-03** ~~`local` (FR-19.1): unreachable server URL → inline error, stays on the screen.~~ — **struck
  2026-08-31 (owner decision), together with E2E-M19-02's validation clause: there is no connectivity check and none is
  owed.** There is no connectivity check, so there is no failure to report: an unreachable URL is accepted, the app
  reloads into the shell, and the G-2 indicator says offline from there on. The inline error that *does* exist is the
  syntax one (`firstRun.serverUrlInvalid`), which is a different promise. Open with the owner as one question with
  M19-02.
* **E2E-M19-04** `local` (FR-19.1) — **implemented** (`smoke.spec.ts`): the field carries the page's origin and Connect
  is reachable without typing. Asserted on the inner `button`, since `toBeEnabled()` on an `ion-button` host is
  false-green.

### M20 — User Administration
* **E2E-M20-01** `server` (FR-23.2) — **implemented 2026-08-28**, in `e2e/server/admin.spec.ts`, and re-read clause by
  clause on 2026-08-30. Avatar, name, e-mail, provisioning date (in the *app's* language), usage counts, admin chip and
  the "you" marker are each asserted. One clause the screen answers differently: there is **no „active" chip**. A row's
  status is the deactivated chip *or nothing*, plus the dimming UI-Spec M20 names under States — so ~~status chip
  (active / deactivated)~~ is one chip and an absence, and the case pins what exists. The deactivated half is asserted
  by E2E-M20-02 and E2E-M20-06. **The dimming is deliberately asserted nowhere**: it restates the chip in colour, and
  the only way to assert it in Playwright is a class or an opacity, which is an assertion about the stylesheet rather
  than about the pixel (G-14's lesson in reverse).
* **E2E-M20-02** `server` (FR-23.3) — **implemented 2026-08-28**. The confirmation's four sentences, the deactivated
  chip, the target's *own screen* falling back to the login, and the way back. Two notes from the 2026-08-30 re-read.
  **The clause *„no Deactivate on admins"* is proved on the one row that is admin *and* own**, because the fixture
  instance has exactly one admin, so which of the two exemptions fired is not separable on screen —
  `domain/__tests__/admin.spec.ts` separates them. And FR-23.3's other sentence — *„open JIT provisioning does not
  resurrect a deactivated account"* — was in **no** case at all; it is **E2E-M20-06** now.
* **E2E-M20-03** `server` (FR-23.4): Remove avatar / **Reset display name** — the name half only, and that is what the
  case asserts (the row falls back to the account id, pinned beside the list still holding the same number of rows). The
  avatar half is **E2E-M20-03b**.
* **E2E-M20-03b** `server` (FR-23.4/23.4a) — **implemented 2026-08-30**, in `e2e/server/admin.spec.ts`: a picture is put
  on Dave's account through the app's own `self`-guarded endpoint, M20's row shows it laid over his initials, and
  *Remove avatar* takes it away leaving *DA*. (The account was Carol's until 2026-09-02, when the admin cases were given
  one that no other file logs in as — see `e2e-tests.md`, *„Two files, one account, two workers"*.) The ledger's reason
  for the gap — no fixture account has an avatar — was true and was not the whole reason. **The removal changed nothing
  on M20 even when there was one**: the row is keyed by user id, so a reload hands the same `<img>` the same `src` and
  the browser never asks again, and the avatar response carries `max-age=3600` so it would not be told anything if it
  did. M17 has carried FR-17.13's cache-busting query since the profile picture shipped; M20 was written without it.
  Fixed with the case, and red-proved against the unfixed line. The upload does not go through M17's control on purpose:
  the crop modal renders into a canvas with no settled signal (the blocker E2E-M17-12 was thought to be waiting on —
  wrongly, as that case's implementation on 2026-09-01 showed), and this case is about M20's row.
* **E2E-M20-04** `server` (FR-23.5/23.1) — **implemented 2026-08-28**: the per-row sheet is the only place an action
  could hide, and its buttons are **counted**, so a fourth cannot arrive unnoticed.
* **E2E-M20-05** `server` (FR-23.1/G-8) — **implemented 2026-08-28** for the half that can be red-proved: a non-admin
  OIDC account is offered no entry in M17 *and* is served `admin-unavailable` at `/admin`. The clause ~~hidden entirely
  in `single`/`local`~~ **is not coverage and cannot be made into any** (re-read 2026-08-30): the gate is `collaborative
  && me?.is_instance_admin`, and in both of those projects there is no `me` at all — so deleting the `collaborative`
  half leaves the row just as hidden, and a case asserting the absence there would be green against the rule being gone
  (the tautology shape). It stays hidden by construction; the assertion that can fail is the one this case makes.
* **E2E-M20-06** `server` (FR-23.3/23.6) — **implemented 2026-08-30**, in `e2e/server/admin.spec.ts`: a deactivated
  account signs in again through the real broker, and the screen **names the reason**. FR-23.6 keeps provisioning open,
  so the IdP goes on vouching for the account; FR-23.3's answer is that this does not bring it back, *„otherwise
  deactivation would be meaningless"*. The store proves the login does not clear `deactivated_at` and `issueSession`
  refuses the exchange — and the app answered *„The server rejected the login."*, the same sentence a replayed code
  gets. That is the login-screen twin of the defect FR-23.3's own 2026-08-28 revision fixed inside the app: a permanent
  state read as a glitch, and a person told nothing. The callback now narrows on the `account_deactivated` code exactly
  as `client.ts` does, and the case asserts the sentence rather than the refusal — a regex matching the generic one
  would pass against the build this was written for.

### M21 — Vorlage aus Reise (new screen, §3.27)

**The ids were read against the screen on 2026-08-30** (backlog item 6). M21's catalogue was
written *with* its implementation, so nothing here describes a removed surface and no id sits on
the wrong test. What the reading found is two clauses whose assertion could not fail — one because
the word it turns on had never been operated (`checked`), one because the only world it runs in
can produce a single branch — and one whole rule, added to the screen four days after its cases
landed, that no test has ever rendered.

* **E2E-M21-01** `all` (FR-27.5): entry from the closing card at the top of M4 on an **archived** trip (an active trip
  shows no such card); the screen lists every recognised group with its on-trip item count and a "wird wiederverwendet"
  marker, and the loose ad-hoc rows (all pre-checked) under "Eigene Artikel".
* **E2E-M21-02** `all` (FR-27.5): a group with on-trip deviations names them ("Während der Reise ergänzt: Gimbal") and
  offers **Gruppe aktualisieren** (default) vs. **nur in diese Vorlage**; group positions absent from the trip are
  reported with the explicit "Gruppe bleibt unverändert" note. **The blast-radius line's own clause moved to E2E-M21-03c
  on 2026-08-30**: this case asserts the note *visible*, and its world has no trip following the group, so the note can
  only say *„no trip follows it right now"* — a line that never counted anything would be green here for as long as the
  case has existed. Where the note is checked is where a trip does follow.
* **E2E-M21-03** `all` (FR-27.5/27.1/27.4): creating with defaults yields a composed template that **references** the
  recognised groups (not copies), carries the checked loose rows as own positions, and — where *aktualisieren* was
  chosen — the deviation lands in the group itself. **Corrected 2026-08-19 while implementing:** it does *not* surface
  as an applied change on the trips using that group. Since the FR-27.4 revision of 2026-08-18 a group edit is
  **offered** at each trip that still follows it, and becomes an applied change only once that trip accepts — so what a
  still-planned trip shows afterwards is the proposal. Asserted as **E2E-M21-03c**. The "Als neue Gruppe speichern"
  toggle bundles the loose rows into a fresh group instead. **The word *checked* got its assertion on 2026-08-30, as
  E2E-M21-04**: this case and every other one in the unit leave the pre-checked state alone, so no test had ever
  operated a loose row's checkbox — a create that simply took every loose row, or a checkbox wired to nothing, was green
  throughout. The *own* branch of the deviation choice is deliberately **not** an e2e case: `planTemplateFromTrip` and
  `createTemplateFromTrip` both assert it (the group is left untouched, the deviation becomes an own position), and this
  case proves the choices object reaches the write.
* **E2E-M21-02b** `all` (FR-27.5, split out at implementation): a group position the trip did not carry is *reported*
  with the "Gruppe bleibt unverändert" note and offers **no** choice — reported is not the same as offered.
* **E2E-M21-03c** `all` (FR-27.5/27.4, added at implementation): the reach the blast line promises, end to end — a trip
  generated from the group *after* it lost the position is offered that position back once M21 folds it in. The scenario
  order is load-bearing: generating both trips first makes the fold-back a net no-op and the case would assert a
  proposal nobody owes. **Since 2026-08-30 it also asserts the blast line itself** — *„1 trip will be asked"* before the
  fold — because this is the one world in the unit where the note's two branches differ (see E2E-M21-02).
  Mutation-proved: a `blastText` that always returns the *none* wording reddens this case and leaves M21-02 and M21-02b
  green, which is the finding stated as a run.
* **E2E-M21-03b** `all` (FR-27.5, split out at implementation): the "Als neue Gruppe speichern" half of M21-03, asserted
  where it shows — the new group is a second include on the resulting Vorlage, and the loose row is *not* an own
  position. **Tightened 2026-08-30:** *„a second include"* was carried by a row bearing the group's name, and M8 renders
  an include and an own position as the same element — so the case now also asserts the Vorlage has **no** own positions
  at all, which is what separates the two readings.
* **E2E-M21-04** `all` (FR-27.5) — **new 2026-08-30**: two loose rows, one unchecked before creating. The *„n von m"*
  head reads `1 of 2` afterwards — an assertion that could not have been true before the tap, since the case asserted `2
  of 2` first — and on the resulting Vorlage the checked row is an own position while the unchecked one is nowhere. Both
  directions, because the kept row is the positive control the dropped one is read against. Mutation-proved by passing
  every loose id to the write instead of the checked set: this case reddens, the other eight stay green.
* **E2E-M21-05** `all` (FR-27.5/FR-1.6) — **new 2026-08-30**: M21's name refusal, which UI-Spec M21 has promised since
  2026-08-25 and which nothing rendered — not e2e, not the view's unit spec, whose orchestrator double returns *no
  collision* and so only ever paints the accepting branch. A name a Gruppe holds, differing only in capitals, renders
  the note naming the holder and disables *Vorlage erstellen*; a free name lifts both, which is what makes the disabled
  state a fact about the name. The bundle field is then held to **two** rules — the same taken rule, and the one that
  exists nowhere else in the app: the two names this one screen writes must differ from each other, refused with its own
  sentence because nothing holds that name yet. Mutation-proved twice, once per clause of `canCreate`.
* **E2E-M4-44** `all` (UI-Spec M4 / G-9, added 2026-08-19): the trip is named **exactly once**, and the width decides
  where. At 390 px the name is in M4's header line and the app bar carries **no title element** — beside six icons it
  rendered as "S…"; resized to 1280 px the two swap, the bar holding the title and the header line no longer carrying
  the name. The absence needs a positive signal, so the case also asserts the chevron is rendered and that the
  neighbouring screen (M6) *does* get a title from the same locator: a header that failed to mount would otherwise
  satisfy it. The header-line name is also asserted to *resolve* to the display face, since it is the app bar's title
  moved down and has to read as one — on the computed family, not on the class attribute, which would pass against a
  role that was never defined. Mutation-proved — restoring the unconditional `ion-title` reddens it on both engines.
* **E2E-M4-56** `all` (UX-9, added 2026-08-27): the packing control column holds one width whatever it carries, so item
  names form a straight column — a checkbox row and a stepper row start their names at the same x, and their
  `.row-start` boxes have the same width. Asserted on rendered bounding boxes with exact equality (no tolerance); the
  case first proves both control variants are actually on screen, so the equality cannot pass vacuously against a world
  of identical rows.
* **E2E-M4-57** `all` (G-12/UX-13, added 2026-08-27): the bar keeps *Suchen*, *Filter* and *Zuklappen* and carries the
  rest behind the ⋮ — `m4-edit` and `m4-start` are gone as glyphs, the menu **names** both in words, and picking
  *„Reise-Eigenschaften"* lands on the rendered M22 edit screen. The last step is what separates the menu from a
  decoration: an entry that opens nothing would satisfy every assertion above it.
* **E2E-M4-45** `all` (UI-Spec M4 / ADR-012's overlay revision, added 2026-08-21, revised 2026-09-05 by ADR-046): M4
  scrolled mid-list, an item opened and closed again — the list is at the same offset **and** the header line is still
  folded, which is the other half of the position. Asserted on the rendered scroll offset of `ion-content`, never on the
  URL, and read once the sheet is gone: the list's page is never replaced — `?item=` is a state of it — so there is no
  restore and no signal to wait on. Was: the item path remounted the list and `lib/scrollMemory` put the offset back,
  reported through a `data-scroll-restored` attribute the case waited on. The row it opens is chosen for being wholly
  inside the content's box: Playwright scrolls whatever it is told to click into view, and a row sitting under the app
  bar is on the page without being on screen — asking for that one scrolled the list back to the top on WebKit and would
  have made the case measure nothing. Runs with motion reduced, deliberately: the header's max-height transition also
  changes the height of the scrolled content, so with it animating the screen spends a few hundred ms in a layout
  nothing can measure, and the app honours the preference itself. Mutation-proved — a remount on open reddens it on
  WebKit (was: removing the restore while keeping the signal).
* **E2E-M4-58** `all` (FR-25.8, added 2026-08-29) — **implemented** (`e2e/membership.spec.ts`, with E2E-M4-12):
  quick-add in *Pro Person* mode with two of three travelers checked at different amounts produces **one** cluster with
  two children, not two items sharing a name. The ad-hoc rows have no `source_item_id`, so this is the case that proves
  the folded-name cluster key.
* **E2E-M4-64** `all` (FR-25.8/G-8, added 2026-08-29) — **implemented** (`e2e/membership.spec.ts`): on a trip with a
  single traveler the quick-add's *Pro Person* control is **absent**, not disabled — there is no membership to
  distribute, and a control that can only say one thing is worse than no control. The composer itself is asserted
  present in the same breath, so „absent“ cannot be satisfied by a composer that failed to open.
* **E2E-M4-65** `all` (FR-25.8/FR-25.13d, added 2026-08-29) — **implemented** (`e2e/membership.spec.ts`): a *Pro Person*
  add made from the **browse-sheet** closes the sheet before the membership editor opens. The editor is a modal, and one
  presented while the sheet is still up renders *behind* it — greyed and unreachable — so the assertion is that the
  checkbox can be **operated**, not that the editor is visible: a visibility-only check passes against the broken build.
  Found by rendering the interaction, not by reading it.
* **E2E-M4-46** `all` (FR-25.13c, added 2026-08-21) — **implemented** (`e2e/packing-list.spec.ts`): what the trip
  already carries is not suggested again. The chip/suggestion rule itself is E2E-M8-21's; this case pins only M4's
  **wiring** — the trip passing its contents into `excludeItemIds`, which no shared-component test can see dropped. The
  absent suggestion's positive signal is the free-text hint, rendered exactly when nothing is offered. Mutation-proved —
  dropping the prop reddens it.
* **E2E-M4-47** `all` (FR-25.13d, added 2026-08-22) — **implemented** (`e2e/packing-list.spec.ts`): like E2E-M4-46, a
  wiring case — the trip's contents reach the browse-sheet as the *„schon drin"* state (the carried row is asserted by
  name), and a sheet tap lands as a trip row after the sheet closes. The row is added via the suggestion first, so it
  carries the master-item provenance the carried state matches on.
* **E2E-M4-59** `all` (FR-25.13e, added 2026-08-29) — **implemented** (`e2e/packing-list.spec.ts`): the browse-sheet's
  *„schon drin ausblenden“* switch. The count line reads the carried number and flips to the hidden one, the carried row
  leaves the list — and the assertion the case exists for is the **positive** one: a row tapped while the switch is on
  is **still on screen**, marked *hinzugefügt*, with the count unchanged. Re-opening the sheet is asserted as its own
  pass: the previous run's add is hidden with the rest and the count has grown, which is what makes the per-opening
  snapshot visible rather than merely written down.
* **E2E-M4-60/61/62/63** `all` (FR-25.13f, added 2026-08-29) — **implemented** (`e2e/packing-list.spec.ts`): the
  browse-sheet's two one-tap verbs. **60** ✓ on a free line adds the row *already packed* — asserted on M4 afterwards,
  not only on the line, because a line that says „packed" over a row that landed open is exactly the half-write the
  single-mutation rule forbids. **61** ✕ on a free line lands the row as FR-5.5 *skipped*, revealed and named as a
  decision rather than as a forgotten row. **62** the verbs reach a line the trip already carries, which was inert
  before — a second pass over the same inventory packs it without the sheet closing. **63** the line's own
  *„Rückgängig"* takes the whole write back: the line is an offer again and no row is left behind, on the working list
  or behind the reveal bar.
* **E2E-M4-48** `all` (FR-28.4/FR-25.1, added 2026-08-22) — **implemented** (`e2e/item-mark.spec.ts`): a per-person
  position generated for two travelers renders as one cluster, and the **cluster head** — the line that names the item
  once — carries the item's mark (the same `packing` ladder as a single row); the traveler children carry none. Found on
  the owner's eyeball of §3.28: without it 🧥 left the list exactly when the jacket belonged to three people.
* **E2E-M4-49** `all` (G-3, added 2026-08-23) — **implemented** (`e2e/lock-claim.spec.ts`): claiming a row says so **on
  the row**, and releasing it takes that back. The note matters precisely because my own claim locks nothing for me: the
  one device that cannot see the padlock is the one holding it. The release is asserted by the note disappearing *and*
  the row still being there — a note that vanishes with its row would satisfy the first alone. Mutation-proved.
* **E2E-M4-50** `all` (G-3, added 2026-08-23) — **implemented**: a claimed row's menu offers the release **and nothing
  that contradicts it** — asserted as a count as well as by name, so a third option added later is not silent. Skipping
  a row you are mid-way through packing is the option this excludes.
* **E2E-M4-51** `all` (FR-9.3, added 2026-08-24) — **implemented** (`e2e/closing-pass.spec.ts`): a row is marked
  *ungenutzt* from its press-and-hold menu, the row shows the mark, and the same entry — now reading *Ungenutzt
  aufheben* — takes it back. Both halves are asserted, because a judgement that cannot be revoked is a stamp, and FR-9.1
  promised a judgement.
* **E2E-M4-52** `all` (FR-9.3, added 2026-08-24) — **implemented**: the *unused* window stays open on the **archived**
  trip, where M14 runs — and *missing* does not, because it is stamped by the quick-add and a thing bought afterwards
  was never missing. The negative half is asserted on the M5 control that used to be there beside it, so "no control at
  all" cannot pass for it.
* **E2E-M4-53** `all` (FR-9.3, added 2026-08-24) — **implemented**: *Reise abschliessen* opens the pass and archives
  **nothing** until it is finished; cancelling leaves the trip active. The positive signal is the archived trip's own
  closing card being absent *and* the archive action still on offer — a pass that quietly archived would satisfy
  neither.
* **E2E-M4-54** `all` (FR-9.3, added 2026-08-24) — **implemented**: the pass lists what was **packed** — a never-packed
  row and an FR-5.5-skipped row are both absent — one tap marks, and *Fertig* archives and lands on M14. The mark is
  read back **on the row afterwards**, not from the control that made it: the control's own state would prove nothing
  about what was written.
* **E2E-M4-55** `all` (FR-9.3, added 2026-08-24) — **implemented**: inside the pass the row's press-and-hold is inert
  and the tap does not open M5. It carries its own **positive control** — the same gesture, on the same row, opening the
  menu one moment earlier — because "no action sheet appeared" is otherwise true of a broken list as well as of a quiet
  one. The control runs *before* the row is packed: a packed row leaves the list (FR-25.2), and a gesture asserted
  against a row that is not there is a different fact.
* **E2E-M4-43** `all` (FR-27.5 prerequisite, added 2026-08-19): a planning trip offers *Reise starten* and no archive
  action; starting it swaps the pair; archiving leads to the closing card. The step exists because M21 — and the
  positive M12/M14 cases — need an archived trip, and no path produced one.

### M22 — Trip properties (new screen, FR-2.7)

**The ids were read against the screen on 2026-08-30** (backlog item 6). Every written id is
implemented and none of them drifted; two clauses could not fail as they stood, one whole state
had never been rendered, one of the screen's three roster affordances had never been operated —
and **UI-Spec M22's element list names two fields the screen does not have**, one of them built on
a different screen and one built nowhere (see below, and UI-Spec M22).

* **E2E-M22-01** `all` (FR-2.7): M4's G-12 cluster opens the editor, and a new name commits on blur and comes back
  through the store — asserted on the repainted M4, never on the URL. Since 2026-08-26 (G-17, ADR-035) it also sets the
  start date through the `DateField` picker and asserts the locale display (`Oct 3, 2026`) both optimistically and after
  a round trip back through M4.
* **E2E-M22-02** `all` (FR-2.7, FR-27.4's 2026-08-21 revision): a traveller added to an existing trip extends the
  per-person positions **immediately**, and the screen reports what it did. The report is also the settled state the
  case waits on, so no clock is involved. **Tightened 2026-08-30:** the report was asserted as the digit `1`, which is
  equally true of *„1 item removed"* — it is asserted as the sentence now, so the screen cannot report the wrong half of
  FR-27.4's outcome.
* **E2E-M22-03** `all` (FR-2.7/FR-25.1): a traveller removed takes **their** row and never a sibling's. Three things
  this case needs in order to be able to fail, each learned by watching it pass when it should not have: the surviving
  row is **part**-packed rather than packed, because a fully packed row leaves the list through the FR-25.2 pack-out and
  takes the signal with it; its `1/2` is asserted *after* the removal, because a count and a name also pass against a
  removal that took both rows and a re-resolution that generated one back; and the case waits on the roster losing the
  row before it navigates, because the first version raced the removal and failed against correct code. Mutation-proved
  — detaching by position instead of by traveller reddens it.
* **E2E-M22-05** `all` (FR-2.7): a traveller whose own row is part-packed is removed **with** it — the confirmation
  offers the choice, states how many rows it concerns, and *Alles entfernen* deletes rather than unassigns. The
  sibling's untouched share stays hers, which is what proves the choice widens *what* leaves and not *whose* rows are
  considered. **Tightened 2026-08-30:** *„deletes rather than unassigns"* had no assertion that could tell the two apart
  — an unassigned row carries neither Zoe's name nor a child test id, so it satisfies *„Zoe's row is not there"* just as
  well. The number of Regenhose rows left is asserted now.
* **E2E-M22-06** `all` (UI-Spec M22 / G-9/G-12, in `global-nav.spec.ts`): reaching the editor from M4's cluster and
  getting the trip back from its chevron. It lives with the global patterns rather than in the M22 unit because that is
  where the four navigation defects of 2026-08-13 were missed — a route that changes without repainting, and a back that
  leaves the previous screen on the display. Asserted on the painted page, and the return is checked against M4's own
  actions rather than against the absence of the editor alone.
* **E2E-M22-04** `all` (FR-2.7): a trip that has started keeps its roster and offers **no** removal control — the ✕ is
  gone, the reason is rendered under the list, and adding still works. *(Revised 2026-08-21: the case first asserted
  `aria-disabled` on a control that stayed on screen; the owner overruled that in the hand — see UI-Spec M22.)* Two
  traps this case pays for: the absence of an ability needs a positive signal, which is the note; and
  `[data-testid^="traveler-remove-"]` also matches `traveler-remove-note`, so a prefix locator counts the explanation as
  a button and can never reach zero — the locator is scoped to `ion-button`.
* **E2E-M22-08** `all` (FR-2.7): after an edit the trip is **still on M2**. The editor writes a partial upsert on
  purpose (field-level merge), but the optimistic row it applies locally replaces the whole row — so saving a name used
  to drop `status`, and M2 lists by status, which took the trip off *every* segment with no pull in Local Mode to bring
  it back. Asserted on M2's planned list rather than on the trip screen, which the defect leaves looking perfectly
  correct. Mutation-proved.
* **E2E-M22-09** `all` (FR-9.4) — **new 2026-08-23**: a bottom toast is presented **above** the tab bar, asserted as
  geometry — the toast's bottom edge against the bar's top edge — because the question a screenshot cannot answer is
  whether a live overlay is covered or merely translucent. Two guards make the comparison mean something: the viewport
  is set to a phone (above 900 px G-9 hides the bar, and a `display: none` element measures as a zero-height box at the
  origin, against which every overlap assertion resolves in both directions), and both boxes are asserted to have height
  before they are compared. The case first failed for exactly that wrong reason.
* **E2E-M22-07** `all` (FR-2.7): the positive half — a **planning** trip renders one ✕ per traveller and no note.
  Without it, "no ✕ on a started trip" would pass just as well against a screen that never renders one at all.
* **E2E-M22-10** `all` (FR-2.7/FR-27.4) — **new 2026-08-30**: the archived trip's editor, which nothing had ever opened.
  UI-Spec M22's *States* line has promised since the screen shipped that *„on an archived one the whole screen is
  read-only"*; `TripEditPage.spec.ts` pins the two `DateField`s and nothing covered the name, the roster inputs or the
  add row. All four are asserted, against a roster that is demonstrably rendered so the absences are not read off a
  screen that failed to load. **The case also records a finding, which is an owner decision:** `traveler-remove-note` is
  gated on the trip *not* having started, so an archived trip loses the ✕, the add row **and** the sentence together —
  nothing on the screen says why it answers no tap, which is the exact shape the owner ruled against on 2026-08-21 for
  the started trip. Build a sentence for the archived state, or accept the silence; the case asserts today's absence and
  is what has to change either way. Mutation-proved by dropping the name field's `readonly` binding.
* **E2E-M22-12** `all` (FR-2.1b/FR-2.7) — **new 2026-08-31**: the year is corrected on M22 and the trip moves in M2's
  list. Read back through the **list**, not through the field: a select repainting its own value satisfies an assertion
  on itself, and placing the trip is the year's whole job. Then re-opened from M2, because a value that only lives in
  the form's ref reads identically until something reloads. Red-proved by dropping the mutation.
* **E2E-M22-11** `all` (FR-2.7) — **new 2026-08-30**: the third roster affordance. UI-Spec M22 names *rename in place*,
  ＋ and ✕ per row; ＋ and ✕ have had cases since 2026-08-21 and the rename had never been operated in a browser. What it
  asserts is the rule underneath rather than the new string: a rename is a rename, never a removal plus an addition, so
  the renamed traveller's **part-packed** share is still there with its `1/2` after a reload, and there are still two
  shares rather than three. The composable pins that on the mutation; the screen's blur handler reads the value off the
  Ionic host and no unit test sees it.

**Two elements UI-Spec M22 lists and M22 does not render** (found 2026-08-30 by reading the
element list against the template — neither is a test gap, and neither may be tested until it is
decided):

* **The trip's year is not editable anywhere in the app.** FR-2.1b makes the year the one required
  temporal fact, `TripEdit` carries it, and the only writers are M3's wizard and the clone form —
  so a trip created in the wrong year keeps it for good. FR-2.7's own scope is *name, dates and
  travellers*, so the clause was UI-Spec M22's addition rather than the PRD's. **Owner decision:**
  add the field, or strike the clause. Documents leaning on it: UI-Spec M22's *Elements* line
  (corrected the same day to say so), PRD FR-2.7 (which now records the scope explicitly), and this
  section, which had no id for it either.
* **The series a trip belongs to is edited on M16, not here.** UI-Spec M22 lists it among this
  screen's elements; `setTripSeries` has exactly one caller and it is `SeriesPage.vue`, whose
  *detach/attach trips* action UI-Spec M16 already describes. Not an owner decision — the function
  has a door — the sentence is simply on the wrong screen, and is corrected there. Coverage of the
  attach/detach path stays M16's question.

**One deterministic seam added to the unit** (2026-08-30): every `page.goto` in
`trip-properties.spec.ts` now waits on the G-2 indicator returning to *on this device* first.
E2E-M22-08 filled the name, blurred and navigated, and under load it failed against **correct
code** — the reload discards the optimistic store, and the trip was on no M2 segment because the
rename had not reached IndexedDB yet. The screen's own repaint is not that signal: it is satisfied
by the optimistic row alone. The same shape E2E-M22-03's note already paid for once, in the other
five cases that reload after a write.

---

## 5. Cross-Screen Flow Tests

These are full end-to-end journeys spanning several screens — the highest-value, lowest-count tests. They mirror UI_Spec
§3.

* **E2E-FLOW-01 Happy-path packing** `server`: Alice M1 → M4 → swipe *Packing Now* → check → Bob's device reflects it in
  real time (locks, actor attribution, presence). (FR-5.x, 4.4, G-3, G-10) *(Runs since 2026-08-24 for the convergence,
  membership and attribution halves — Alice shares the trip with Bob and the row Bob sees names Alice as its packer,
  which is the server's stamp per invariant 3. Presence (G-10) is still owed.)*
* **E2E-FLOW-01b The other direction** `server` (FR-4.4, Sync-API P-1) — **added 2026-09-01**: Bob, the member, packs,
  and **Alice's** open screen reflects it, the stamp naming Bob. The same server code serves both directions and it was
  still this one that failed on the family instance: the owner's tab had lost its socket and the member's had not, so
  the sync was one-directional — and a suite that only ever packed on the owner's device could not have seen it. The
  socket-level cause is E2E-G2-13's; this case is the promise as the user states it.
* **E2E-FLOW-02 Delegation** `server`: M4 → M5 → set packer (Bob) → Bob receives push/in-app notification → taps →
  deep-links into M4/M5. (FR-4.3, 6.2, 6.3, G-4) — **implemented 2026-08-25** (`e2e/server/multi-user.spec.ts`), and it
  needed a control that did not exist: `packer_user_id` was written once when a row was generated and never again, so
  the delegation notification the server has always fired could not be produced by using the app (FR-25.19's *Zugewiesen
  an* picker is the writer). The case asserts the whole chain rather than its pieces — the assignment, the FR-6.2 toast
  naming Alice and the item, the FR-6.3 deep link asserted on the **rendered sheet**, and FR-25.20's filter, which hides
  the row from Alice's list afterwards and names Bob in the reveal bar. The **OS half of the notification is still
  uncovered**: this is the in-app channel, which is the universal fallback (NFR-4.6), and Web Push needs a browser
  permission this harness does not grant. Mutation-proved — with the picker's write disabled the case reddens.
* **E2E-NOTIFY-01 The notification's language** `server` (NFR-4.12, ADR-037) — **implemented 2026-08-29**
  (`e2e/server/multi-user.spec.ts`): the notification is written in the *recipient's* language. Bob's device is German
  and Alice's is not, and hers is the one that fires the delegation; the assertion is the whole German sentence rather
  than the name and the item, which the English wording would satisfy too. Producing a notification at all needs two
  accounts, which is why no project could reach this wording before ADR-029 — the reason it survived the whole i18n
  migration as an English literal. *(Mutation-proved: with `describeNotification` put back on its literal for
  `delegation`, this is the only one of the eleven `server` cases that reddens.)*
* **E2E-FLOW-03 Purchase transition** ~~`single`~~ `local`: M6 Before-departure → check item → appears in M4 as
  PACK/Open. (FR-3.3) — **implemented, and not as a case of its own** (2026-08-31): the whole journey is inside
  **E2E-M6-17**, which buys the row on the before-departure tab, watches it leave the list and then *opens M4 to look at
  it*, because the revealed row's „on the packing list" is a string until the screen it names has been read. The mode is
  corrected against the screen — nothing here needs a backend, and the case has run in `local` since it was written.
  **The clause that had no assertion is the state**: *PACK/**Open***. Bought is not packed, and buying flips only the
  mode, so M4's progress reading `0/1` is what says the row arrived as work rather than as a record. A journey that is
  one screen's case plus one hop is left where its helpers are; a second file staging the same trip would be a second
  definition of it.
* **E2E-FLOW-04 Feedback loop** ~~`single`~~ `local`: M4 flag *Missing* → archive → M14 proposes adding it to a group
  (FR-27.11) → apply → next M3 run of a template including that group carries the item. (FR-9.1, 9.2, 2.2) —
  **implemented 2026-08-31** (`e2e/review.spec.ts`, beside M14's own world so the trip is staged once), and **the last
  clause was the one that was false**. Every M14 case stops at M8: E2E-M14-02 asserts the *write* — the group holds the
  new item, the unused position reads `0×` — and whether next year's trip is any different for it is a question only
  generation answers, which nothing had asked. It was not: `applyReviewProposal` took `addTemplateItem`'s default and
  wrote the harvested item as **`per_person`**, the one field that decides *how many* rows generation makes. Every other
  writer in the app — M8's editor, M21's fold — passes `trip_global` explicitly; M14 was the only caller living off the
  default, so a shared item harvested from a trip came back as one row per traveler, and on a trip with no travelers as
  nothing at all. Fixed here, with the unit assertion that was missing beside the quantity one. The case also carries
  the other half of FR-9.2's harvest: the *unused* position is zeroed, not deleted, generation turns a 0 into FR-5.5's
  *skipped* row, and FR-25.2 keeps it off the list — so the knowledge survives while the row does not.
* **E2E-FLOW-05 Migration** `single` — **implemented 2026-08-31** (`single/server-sync.spec.ts`): two spreadsheet years
  are imported into one series, M2's Archived segment holds them, and M3 step 4 offers their median as a one-tap default
  — **read on a second device**, which is the half that was broken. The hint is the only feature that reads *other*
  trips' rows, and it read them without asking: those rows live in each trip's own partition, pulled only when the trip
  is opened (ADR-033), so a decade of migrated history was worth nothing on any device but the one that typed it in.
  Silently, because an unpulled partition reads as a trip that packed none of it rather than as one that is not here
  yet. The importing device is not evidence — its optimistic rows are already in the store. (FR-16.x, 14.2)
* **E2E-FLOW-06 Offline round-trip** `single`: go offline → make edits (G-5 optimistic) → glyph shows queued → go online
  → silent sync, edits persist. (NFR-4.1, 4.2, G-2, G-5)
* **E2E-FLOW-07 Local→Server migration** `local`→`server`: back the Local Mode device up (G-2, NFR-4.11) → restore that
  file on a server device via M18 → the templates, the trips **and the trips' own rows** are on a *third* device that
  only ever talked to the server. (FR-19.5, FR-18.4/18.6) — **implemented 2026-08-31**
  (`e2e/single/server-sync.spec.ts`). The third device is the case: on the importing one every restored row is in the
  store optimistically, so its screen is right whether or not anything left the outbox. Two clauses were corrected
  against the app while writing it. The file is the **device backup**, not a per-document YAML — a single-document file
  opens M18's merge preview, not the restore branch, so the flow as first worded could not carry a device at all. And
  the arrow itself is **not in the app**: `jitpack_mode` is written only by M19's first-launch choice and M17 merely
  states the mode, so the migration is device-to-device (a second device or a reinstall), which is what the case walks.
  **Ruled 2026-09-02 (owner): M17 grows the move — FR-19.8, E2E-M17-14/14b/14c walk the first step on one device; this
  case keeps the third-device assertion, which is the only witness that a restore reached the server.** **And it found a
  defect**: the restore drained the *master* partition alone, so every packing list in the file stayed queued on the
  importing device — a trip's rows are their own partition (ADR-033) — while that device's own screen looked like a
  migration that had worked. Fixed with the case, driven by a unit in `composables/__tests__/portableImport.spec.ts`. A
  second clause moved with it: G-2 `synced` means no push is in flight, not that the queue is empty, so the case asserts
  the *absence* of the sheet's queue line instead.
* **E2E-FLOW-08 Concurrent-edit convergence** `server`: Alice and Bob edit the same trip offline simultaneously → both
  reconnect → field-level merge converges; a real conflict appears in the G-2 conflict log. (NFR-4.2a, G-2)
* **E2E-FLOW-09 Template round-trip over a year** `local`: M3 creates a trip from a composed template whose two groups
  share an item (deduped, both named in the preview) → items added ad-hoc during the trip → archive → M21 creates next
  year's template: **both** groups recognised from provenance and *referenced*, the deviation folded back into its group
  → the fold-back reaches a still-planning trip that follows the group **as the FR-27.4 question**, and never the
  archived source trip → a new M3 run from the new template contains the full learned set, including a position added to
  the group after that template was written. (FR-27.1–27.5, FR-2.3a) — **implemented 2026-08-31**
  (`e2e/template-from-trip.spec.ts`). Two clauses were corrected against the app while writing it: the mode was
  `single`, and everything in this chain runs client-side on one device (invariant 4); and *„appears as an applied
  change"* describes the model FR-27.4 had until 2026-08-18 — it is asked, which E2E-M21-03c already asserts. **The half
  nothing had ever asserted is the archived trip**, and written the obvious way it cannot fail: the fold-back makes the
  group match the trip it was harvested from, so that trip is owed no proposal whatever the rule says, and deleting the
  archived guard from `followsGroups` left the case green. The world now grows the group a position **neither** trip
  carries, and the mutation turns it red.
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

**All seven are implemented as of 2026-09-01**, and four of the seven sentences above were
corrected against the app while writing them — the modes in particular, each of which had been
read off the screen's section rather than off the request the case has to make.

* **E2E-NFR-01** (`e2e/pwa-offline.spec.ts`): the Local Mode half is the new one. Nothing had
  ever *written* with the network down — E2E-PWA-01 reloads and asserts the shell, and the
  `single` half (E2E-FLOW-06, E2E-G2-04) queues against a server that comes back. Here nothing
  comes back, because in Local Mode there is nothing to come back: a trip is created, an item is
  added and packed, and the reload is what separates a rendered optimistic store from data the
  device kept. Dropping the service-worker wait turns the case red, which is what says the
  network is genuinely down rather than merely flagged.
* **E2E-NFR-02** (`e2e/single/mode-discovery.spec.ts`, with E2E-M19-02): *„network to any IdP
  blocked"* is struck rather than tested. A Single-User instance names no issuer, so there is no
  host to block and blocking one would assert against a request the app never makes; the
  assertable promise is the 501 on `/auth/config` and the dashboard behind it.
* **E2E-NFR-03/03b** (`e2e/storage-durability.spec.ts`): the three rendered states of the storage
  block were unit-covered; the clause no screen can show is that `navigator.storage.persist()` is
  *asked* at all. The Storage API is replaced rather than driven — a real browser's answer is a
  policy decision and the case would assert whatever the profile happened to be — and the ask is
  counted, so a refusal that was never requested is distinguishable from one that was. The
  granted branch is the pair's positive half and also covers the guard that does not ask twice.
* **E2E-NFR-05** (`e2e/server/data-export.spec.ts`, with E2E-M17-03): `single` → `server`. In
  Local Mode this is a different section entirely (per-trip YAML written client-side), and in
  `single` there is no token, so the auth header the promise is about is never sent.
* **E2E-NFR-06** (`e2e/server/push.spec.ts`): **the toggle had no `data-testid`** — the signature
  of a control no test has ever operated. The push *service* is replaced and nothing else is:
  `subscribe()` would otherwise have to reach a real endpoint no CI run can. What the case buys
  over the unit is the half only an integration can establish — the subscription reaches the real
  instance and is accepted against this account, and the opt-out both tells the server and
  cancels the browser subscription. Delivery from there is `internal/api/push_test.go`.
* **E2E-NFR-07** (`e2e/spreadsheet-import.spec.ts`): `single` → `local`, and the sentence narrows
  to what is built. NFR-4.7's *„transactional"* is an approximation and says so — the plan is
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
| FR-1.2 | E2E | M7-07 (the list and what a row says), M7-08/09 (creating one, and its scope), M8-06 (add **and** remove — the remove half only since 2026-08-30). **M7-01 and M7-03 are retired 2026-08-30** — the shared list is FR-1.6's simplification with nothing to render, and the name prompt was rejected in 2026-08-15's variant pass. |
| FR-1.3 | DOC/N-A | retired 2026-08-08 — plain integer quantities (M8-01 covers the stepper) |
| FR-1.4 | E2E | M8-02 |
| FR-1.5 | DOC/N-A | retired 2026-08-08 with FR-1.3 |
| FR-1.6 | E2E+UNIT | M14-02 (direct write), M18-01 (an imported template is shared instance-wide like every other — the word „private" in this row's earlier wording was never a property of any template) — MVP shared model; M7-10 + M8-24 + M21-05 (the name is the instance-wide key: create, rename, M8's picker adopting the group that holds it, and M21's two writers — including the rule that exists nowhere else, that the Vorlage and the bundle group it writes in one pass must differ from each other); `domain/nameCollision.ts` (the matching rule), `composables/__tests__/nameCollision.spec.ts` (the orchestrator refuses the write, Local Mode included); publish/fork cases parked with the FR-1.6 stub |
| FR-1.7 | DOC/N-A | retired 2026-08-08 (owner decision) — consumable flag and per-day unit removed |
| FR-1.8 | DOC/N-A | retired 2026-08-08 — no units, everything counts in pieces |
| FR-2.1 / 2.1a | E2E | M3-01, M2-01/03 (all four parts — the traveller faces were built 2026-08-31) |
| FR-2.2 | E2E+UNIT | M3-06, M18-02 + M18-09 (an imported trip carries the status its file names, ADR-024 — the preview branch and the restore branch), FLOW-04 (a group edited between two runs generates differently); instantiate.ts |
| FR-2.3 / 2.3a | E2E+UNIT | M3-06, M8-03; instantiate.ts |
| FR-2.4 | E2E | M3-10, M8-05 (the note's wording, corrected to the FR-27.4 model 2026-08-30); the M10 usage count is asserted in M10-14/15 (M10-02 retired 2026-08-30 — its „delete blocked" half was reversed by FR-24.3) |
| FR-2.5 | E2E | M3-03 |
| FR-2.7 | E2E+UNIT | M22-01 (name and dates), M22-02/03/05/11 (the roster's three affordances and what each does to the per-person rows), M22-04/07 (removal ends at departure), M22-08 (a partial edit is still a whole row), M22-10 (an archived trip's editor is read-only throughout **and says so**), M22-12 (the year, corrected and read back through M2); `TripEditPage.spec.ts` (the FR-2.1d date bound) and `composables/__tests__/tripProperties.spec.ts` (the mutations). **The year is on the screen since 2026-08-31** (M22-12, owner decision — it had a reader everywhere and a writer only at creation), and the **series** is edited on M16 instead, which is what PRD FR-2.7's opening paragraph already said. |
| FR-3.1 | E2E | M5-02 (the control), shopping.spec.ts (the write) |
| FR-3.2 | E2E | M6-01/04, M4-11 |
| FR-3.3 | E2E | M6-02, M6-17, M6-22, FLOW-03 (M5-09 retired — the buy lives on M6) |
| FR-4.1 | E2E | M3-04 (share on create) |
| FR-4.2 | E2E | M4-24, M4-30 (the record), M5-18, M5-19 (for whom) — M5-01 retired |
| FR-4.3 | E2E | FLOW-02, M4-30, M4-31 (M4-06 and the shadowed M5-07 are both retired) |
| FR-4.4 | E2E | M4-10, FLOW-01, **M1-03** (the delegation reaches the dashboard live, no reload — the badge FR-4.4 had nothing to update until 2026-08-31) |
| FR-4.5 | E2E | M2-05, M3-04, TripMembers |
| FR-4.6 | E2E | G10-01, G10-02 (corrected 2026-08-30: this row named `members.ts`'s role model, which is FR-4.5/4.7 — FR-4.6 is the presence indicator, and it read as covered by a unit test about something else) |
| FR-4.7 | E2E | M3-04 (role select) |
| FR-5.1 | E2E | M1-06 (the departure-day section), M1-06b (and no other day); `domain/__tests__/dashboardSections.spec.ts` (the rule, with the date as a parameter) |
| FR-5.2 | E2E | M4-05 |
| FR-5.3 | E2E | G3-01, FLOW-01 |
| FR-5.4 | E2E | M4-56 (both control variants rendered), G6-01 (the rule itself, still unimplemented) — ~~M1-06~~ was a mis-citation: the Late-Packer flag is FR-5.1, and M1-06 is that section, built 2026-08-31 |
| FR-5.5 | E2E | M4-06 |
| FR-5.6 | E2E | M4-04, M6-03 |
| FR-5.7 | E2E | G3-02 (mode gate), M4-49/50 |
| FR-6.1 | E2E | M1-01 (the aggregation, deliberately unfiltered), M1-03 (the delegation *section* beside it, built 2026-08-31), M1-03b (absent where there is no account), M1-08 (the planned-trips section, built 2026-09-02); `domain/__tests__/dashboardSections.spec.ts`, `local/__tests__/delegationSeen.spec.ts` |
| FR-6.2 | E2E | FLOW-02, NOTIFY-01, M17-01 |
| FR-6.3 | E2E | G4-01, FLOW-02 (M1-04's *at the item* is retired — M1 has no per-item link, 2026-08-30) |
| FR-7.1 | E2E | M5-05 |
| FR-7.2 | E2E | M5-05 (M4-09 retired — FR-7.3 overrides its refusal) |
| FR-7.3 | E2E | M1-02, M4-08, M4-25 (M5-06's shadowed half; the resolution restriction is struck) |
| FR-8.1 | E2E | M4-01, M12-01 (packed and planned as two different numbers since 2026-08-30), M12-07 (the value tile) |
| FR-8.2 | E2E+UNIT | M12-01 (all three dimensions, Gepäck over a real bag), M12-02/04/05, M12-06 (grouping handoff); analytics.ts (slice keys, bar order) |
| FR-9.1 | E2E | M5-17, M4-04, FLOW-04 (M5-03 retired as its duplicate) |
| FR-9.2 | E2E+UNIT | M14-01/02/03, M14-06 (the archive that *skips* the assistant, asserted since 2026-08-30), **FLOW-04** (the harvest read back where it is supposed to arrive — the next trip generated from the group); review.ts (resumability — an applied proposal is not recomputed), ReviewPage.spec.ts (the series-history why line, both directions) |
| FR-10.1 | E2E+UNIT | M11-01 (via M11-05/06); ContainerSheet.spec.ts (the carrier is optional — clearing it) |
| FR-10.2 | E2E | M11-06 (03 folded in, first assignment), M5-22 (re-assignment) |
| FR-10.3 | E2E+UNIT | M11-02/04; containers.ts — **the threshold is a fixed 15 % since 2026-08-31**, the per-trip override struck together with its dead reader (see the M11 block) |
| FR-10.4 | UNIT+E2E | analytics.ts (container weight); **surfaced M12-01 since 2026-08-30** — before that the credit was aspirational, no test had rendered the Gepäck dimension over a real bag |
| FR-11.1–11.3 | — | removed (Repack feature dropped, Addendum §3.11) |
| FR-12.1 | E2E | M2-04 |
| FR-12.2 | E2E+UNIT | ClonePage toggles; clone.ts |
| FR-13.1 | E2E+UNIT | M2-02 (**writable since 2026-08-31 and unwritten** — the grouping it describes is what the screen does, and the owner kept it; see E2E-M2-15), M16-01 (name, defaults, **and the rename refusal, written 2026-08-30**), M16-03 (history, detach/attach); `composables/__tests__/nameCollision.spec.ts` (the rule: a taken series name is refused before the mutation — M3's wizard note still has no e2e case, named in `e2e-tests.md`) |
| FR-13.2 | E2E | M16-03 (history + attach/detach) and M16-04 (both shortcuts), **written 2026-08-30 — before that the row credited two unwritten ids**; M3-02 |
| FR-13.3 | E2E | M16-02 (**the only test of the checklist editor, written 2026-08-30 — and the field it types into rendered at zero width until that day**), M3-09 (the wizard's offer, still unwritten), M6-01 |
| FR-14.1 | E2E | M3-08 (M5-04 retired — no history on M5, and none owed) |
| FR-14.2 | E2E+UNIT | M3-08, FLOW-05; suggestions.ts, TripWizardPage.spec.ts |
| FR-14.3 | E2E+UNIT | M12-03 (absence half; positive half blocked on an archive path, see M12-03); analytics.ts |
| FR-15.1 | E2E | M3-01, M16-01 (the defaults are stored), M16-04 (they reach M3 — the prefill chain, written 2026-08-30) |
| FR-15.2 | E2E+UNIT | M3-06, M8-03 (chips set **and** clear, one value per axis); instantiate.ts |
| FR-15.3 | DOC/N-A | void — retired with FR-1.3/1.5 (2026-08-08) |
| FR-16.1 | E2E | M15-05, M15-06, M15-07, M15-08, M15-11 (the category-*row* layout, 2026-08-30), M15-12 (the mapping gate and the include toggle). **M15-01 is retired** — six promises in one sentence, distributed over those cases; its *grid preview* clause is unbuilt and open with the owner. |
| FR-16.2 | E2E | M2-08 (the *„Importiert"* chip, built 2026-08-31 — `trips.imported` had a writer and no reader until then), M15-05, M15-11 (archived trips with their original quantities, landed and read back in Local Mode). **M15-04's *target series* half is unbuilt** — the picker is on step 2 and the commit writes `series_id`, but the confirm never names it; owner decision. |
| FR-16.3 | E2E+UNIT | M15-03 (both branches of the choice at M15's own step 3, 2026-08-30 — until then the step had never been opened by a test), M15-09, M18-03 (both branches of the choice, 2026-08-30); spreadsheet.ts — **one rule, two lists**: `findDuplicates` serves M15's step 3 and, through `matchPortableItems`, M18's preview; there is no shared component. **M9-03 is not coverage of this row and never was** — the FR is deduplication *on import*, which the three cases beside it discharge; M9's multi-select merge is a UI-Spec clause nothing built (see M9-03). |
| FR-17.1/17.2 | E2E | G1-01, G8-01 (Single-User surface) |
| FR-17.3 | E2E+UNIT | M2-06, M3-05, M17-08; M5-08 in ItemDetailSheet.spec.ts |
| FR-17.4/17.5 | E2E | M17 profile (single-user bootstrap) |
| FR-17.6–17.10/17.12 | DOC/N-A | Demo Mode — removed in v2.10 |
| FR-17.11 | E2E | G8-01 (feature inert in Single-User) |
| FR-17.13 | E2E+UNIT | M17-04, M17-12; avatarCrop.ts / imageResize.ts |
| FR-18.1 | UNIT | portable.ts wire types; surfaced via 18.2/18.4 |
| FR-18.2 | E2E | M7-04, M2-07 |
| FR-18.3 | E2E | M2-07 |
| FR-2.3 | E2E | M2-10 (ADR-033: progress on a trip this device never opened) |
| Sync-API §4 (paging) | E2E | SYNC-01 (a partition larger than one page arrives whole) |
| FR-18.4 | E2E | M18-01 (the template preview, and Import landing it) + M18-02 (a trip in the status the file carries, ADR-024, on the **preview** branch — M18-09 is the restore branch's half), M2-09, M7-05 (the header icon that is the built half — the FAB menu it names is not, owner decision open), M18-08 (the FR-27.4 sections), M18-10 + M18-11 (ADR-030: what is already here is not imported twice — restore list and merge preview); travelers/containers remapped by name is unit-owned in `composables/__tests__/portableImport.spec.ts` |
| FR-18.5 | E2E+UNIT | M18-04 (both ends rendered: the refusal with its reason, and the newer-schema warning followed by a best-effort import), M18-01 (the header names the `schema_version`); `domain/__tests__/portable.spec.ts` holds the parser's own rules |
| FR-18.6 | E2E | M18-05 + M18-09 (a *multi-document* file is the restore branch, not the per-document merge preview — the two are what FR-18.6 keeps apart), M18-01 (the single-document preview); ~~FLOW-07~~ was cited here until 2026-08-31 and evidences FR-19.5: it carries a **device backup**, which is the format FR-18.6 says the portable one is not |
| FR-19.1 | E2E | M19-01 (full since 2026-08-30), M19-02 (both destinations; the health check in front of them is not built), M19-04 — ~~M19-03~~ has nothing to report until that check exists |
| FR-19.2 | E2E | NFR-01 (local load path), **M4-32** (a write must have landed before a reload, not merely been applied) |
| FR-19.3 | E2E | G8-01 (collab UI gated in Local) |
| FR-19.4 | E2E | G2-02 (local glyph/state) |
| FR-19.5 | E2E | FLOW-07 (backup → restore on a server device → a third device that only ever talked to the server); the *first* step, leaving Local Mode on the same device, is FR-19.8's (M17-14) since 2026-09-02 |
| FR-19.6 | E2E | G2-02, NFR-03 |
| FR-19.8 | E2E+UNIT | M17-14 (the move, end to end, read back from the server), M17-14b (the guard, both directions), M17-14c (skip is not restore); the guard's rule and the card's absence outside Local Mode are unit-owned |
| FR-20.1 | E2E+UNIT | M10-03 (the default mode, the read-only reverse list, and the cycle refused in words — written 2026-08-30), M5-23; dependencies.ts |
| FR-20.2 | E2E+UNIT | M4-07; dependencies.ts |
| FR-20.3 | E2E+UNIT | M3-07; dependencies.ts |
| FR-20.4 | E2E+UNIT | M3-07, M4-40 (required), M5-23 (suggested); dependencies.ts |
| FR-21.1/21.2 | E2E | G11-01 (Mocha default) |
| FR-21.3 | E2E | M17-06 |
| FR-21.4 | E2E | G11-01 (no flash before paint) |
| FR-21.5 | E2E+UNIT+GATE | G13-01 (both faces reach the screen), G13-03 (icons are their own scale), G13-04 (the section label renders as its role); typography.css (six icon steps, the 3xs step the views needed, the eyebrow named once, no screen restating it or claiming the class without it); `scripts/design-tokens-gate.mjs` (no raw `font-size`/`font-weight`/`font-family`/`letter-spacing` anywhere in `client/src`) |
| FR-21.6 | E2E+UNIT | G13-02 (no font CDN, every woff2 same-origin); typography.css (no remote `src`, both subsets present) |
| FR-21.7 | E2E+UNIT | G11-02, G11-03, G11-04, G11-05 (brand on identity, done on progress); catppuccin.css (roles named once, primary stays blue, no hex outside the table) |
| FR-25.2 | E2E+UNIT | M4-33, M4-34, M4-35 (the pack registers, one undo, none on un-pack); `usePackUndo` (the snapshot is taken before the pack, replaces rather than stacks, undoes once, no-ops when unarmed) |
| FR-21.8 | E2E+UNIT+GATE | G14-01, G14-02, G14-03 (the card is a plane, casts a flavour-correct shadow, and bounds the group rather than its entries); surfaces.css (planes differ, `.jp-card` built from tokens, five radius steps, each cast written once); `scripts/design-tokens-gate.mjs` (no raw colour, radius or shadow anywhere in `client/src`) |
| FR-22.1 | E2E+UNIT | M10-04 (add/replace/remove, rendered and read back — written 2026-08-30), M9-01; the M5 rung in the ItemMark component unit (M5-12 retired) |
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
| FR-24.1 | E2E | M10-08 (filter-or-create tag capture); grouping/filtering M9-01/24.2 |
| FR-24.3 | E2E+UNIT | M10-14 (a referenced item is hidden and still resolves in its group), M10-15 (an unreferenced one is really gone, and its name is free again), M7-11 (the Vorlage confirm states which deletion it is), **M23-01/02/03/04** (the restore, the collision and its rename, that a retired row can still be removed for good, and the Vorlage half — retired by a trip, listed on its own segment, restored); `domain/masterDeletion` + `domain/masterRestore` and `composables/lifecycleDelete` + `composables/lifecycleRestore` (both rules, both branches, and that resolution/export keep seeing retired rows); store-side both branches **and the restore** in Go, including a colliding restore rejected as `constraint_violated` with the row left retired |
| FR-24.4 | E2E | M9-01 (lean default), M9-05 (property sheet, device-local) |
| FR-24.5 | E2E | M10-07 (minimal creation; photo, dependency and delete sections absent), M11-05 (placeholder-name container) |
| FR-25.1 | E2E+UNIT | M4-12/13/14; packingView.ts (clustering, flat fallback, full-set decision) |
| FR-25.2 | E2E+UNIT | M4-14; packingView.ts (isDone, hidden counts, full-set headers) |
| FR-25.4 | E2E+UNIT | mode glyph rules M4-15/16; packingView.ts — the pill strip itself is superseded by FR-25.11 |
| FR-25.8 | E2E | M4-12/M4-58 (per-person quick-add is one cluster, not N items), M4-13 (the lone member is a flat row), M4-64 (absent where there is nobody to distribute over), M4-65 (the browse-sheet path) |
| FR-25.6 | E2E | M6-05 (aggregated row), M6-06 (settles all instances), M6-07 (notes) |
| FR-25.10 | E2E | M6-08 (no free-form "for whom"); M5 membership control — closed by FR-25.21 |
| FR-25.21 | E2E | M5-18, M5-19, M5-20, M5-21 (the state follows the numbers), G3-04 (M6-05/06 carry the FR-25.6 half) |
| FR-25.12 | E2E | M6-09 (buyer, kept distinct from recipients), M6-10 (description) |
| FR-25.13 | E2E | M6-11; M4-04; M8-13 (same quick-add on all three screens, and the two-character autocomplete gate); M8-14 (same edit sheet) |
| FR-25.13a | E2E | M6-12 (all three at add time, no wipe on chip tap), M6-13 (assignee carries over), M6-16/M4-21 (visible confirm, no keyboard) |
| FR-25.13c | E2E | M8-21 (chip rows, recents across scopes); M4-46 (M4 wiring) — row added 2026-08-22, owed since the cases landed |
| FR-25.13d | E2E | M8-22 (browse-sheet: tag axis, run, free-text handover); M4-47/M6-21 (wiring); sheet rules also in `InventoryBrowseSheet.spec.ts` |
| FR-25.11 | E2E | M4-15 (panel), M4-16 (OR/AND), M4-17 (counts), M4-18 (empty states), M4-19 (Gemeinsam) |
| FR-25.11g | E2E | M6-14 (same panel, shop facets, independent state) |
| FR-25.11h | E2E | M4-20, M6-15 (last row clears the FAB) |
| FR-25.11i | E2E | M6-17; M4-14 (reveal, dimmed, still interactive) |
| FR-25.11j | E2E | M6-17 (BUY_BEFORE leaves the list and comes back), M6-22 (the destination tab's own reveal) |
| FR-25.11k | E2E | M6-18, G12-01/04 (collapsed search, filter icon with badge, one header line) |
| G-12 | E2E | G12-01…06 (app-bar placement, two clusters + no overflow, survives collapse, one line, literal icons, nameable glyphs) |
| FR-25.16 | E2E | M4-22 (fold one / fold all), M4-23 (folding vs doneness stay separate) |
| FR-25.17 | E2E | M4-24 (packed-by stamp, cleared on un-pack); M6-05 for the buying counterpart |
| FR-25.18 | E2E | M4-28 (filter/switch/grouping survive navigation + reload, fresh session unfiltered, chips visible) |
| FR-25.19 | E2E | M4-30 (responsibility vs. record, single right-edge avatar, record not editable) |
| FR-25.20 | E2E | M4-31 (others' rows hidden by default, reveal bar names count + people, header unfiltered) |
| FR-25.14 | E2E | M5-18 (the aggregate is M4's cluster head since FR-25.21; M5-06 retired) |
| FR-25.15 | UNIT+E2E | M5-07 → captureState.spec.ts + ItemDetailSheet.spec.ts (distinct from G-2); M5-11, M11-05 (no save button — asserted since 2026-08-30; the credit stood for months on a case that asserted only the indicator's presence) |
| FR-25.13b | E2E | M6-19 (autocomplete adopts the category; manual fallback) |
| FR-27.1 | E2E+UNIT | M8-07 (two-level include rules), M7-07, M21-03; `domain/templates.ts` (one-level expansion, dedup by master item), `internal/portable` + `domain/portable.ts` (the `scope` field round-trips, an unknown scope is rejected, a scope on a trip document is an error) |
| FR-27.2 | E2E+UNIT | M3-11, M8-08; instantiate.ts (include expansion + named merge) |
| NFR-4.2a (id minting) | E2E+UNIT | E2E-NFR-SEC-01…04; `lib/__tests__/ids.spec.ts` (v4 shape, insecure-context fallback, version/variant bits, no-randomness refusal, and the guard that `crypto.randomUUID` is called in one file only) |
| FR-27.14 | E2E+UNIT | M8-16 (footer opens the list, provenance, marks, read-only); `domain/__tests__/templates.spec.ts` (sources, merged, per-person, mode, conditions), `GroupPeekSheet.spec.ts` (provenance only where a composition can differ) |
| FR-27.12 | E2E+UNIT | M3-17 (row summary + peek sheet), M14-04 (the peek on a proposal's target group — **the sheet's M14 surface, unclaimed by any id until 2026-08-30**); `domain/templates.ts` (`resolvedLines` ordering/dropping, `previewLines` truncation), `GroupPeekSheet.spec.ts` (resolved list, read-only, empty state) |
| FR-27.3 | E2E+UNIT | M3-12 (offered, counted, reported, removable, and on the trip); `domain/instantiate.ts` (single items resolve *after* the templates: already-there is reported, a per-person fan-out counts as present, a condition-excluded item is overridden, a double pick is one pick, a stale id is ignored); `views/trips/TripWizardPage.spec.ts` (the picker's chips, the report, the draft's null provenance) |
| FR-27.4 | E2E+UNIT | M8-05 (warning wording), M8-09 (offered → applied → M2 log), M8-19 (refused, and not asked again), M18-08 (both answers survive a device restore), M21-03, FLOW-09; `domain/trips.ts` (`followsGroups` past/not-past), `domain/refresh.ts` (`declinePlan` per position, `proposedChangeCount` excludes bookkeeping), `composables/groupRefresh` (propose writes nothing, accept, decline), `views/trips/TripListPage.spec.ts` (both chips), `components/trips/GroupChangesProposal.spec.ts` (names every change, fold, decline note) |
| FR-27.5 | E2E | M21-01/02/02b/03/03b/03c, M21-04 (only the *checked* loose rows are carried) and M21-05 (the two names M21 writes, FR-1.6) since 2026-08-30, M4-43, FLOW-09 |
| FR-27.6 | E2E+UNIT | M7-07 (scope tabs/sections), M7-08 (create chooser), M8-07 (scope-shaped editor), M8-10 (guarded switch), M8-24 (the inline creation meets a taken name), M3-11 (wizard sections); `domain/templates.ts` (`scopeSwitchBlock`: both guards, both free directions) |
| FR-27.7 | E2E | M8-11 (task list + count chip + propagation log), M3-13 (preview count, todo on the generated item); blocking = existing FR-7.3/25.2 M4 cases |
| FR-27.8 | E2E | M10-17 (the list, its scope chips and the way into a template), M10-19 (absent on an unused item); `domain/__tests__/itemHistory.spec.ts` (own positions only — the list answers the same question as FR-2.4's count) — **built 2026-08-31** |
| FR-27.9 | E2E | M10-18 (a trip's remark read at the item), M10-19 (absent when there is none); `domain/__tests__/itemHistory.spec.ts` (the foreign-key join, the trip-level comment that belongs to no item, the ad-hoc row that reaches none, an undated comment sorting last) — **built 2026-08-31** |
| FR-27.10 | E2E | M4-26 (group add: dedup, provenance, tasks, no Missing flag), M4-27 (fully-present group, planning-trip propagation) |
| FR-27.11 | E2E+UNIT | M14-04 (group targets, blast radius), M14-05 (list not card stack, marked rows, per-pair dismissal), FLOW-04 (the shape the write gives the position); review.ts, ReviewPage.spec.ts — the applied-change log is owed with the §3.27 refresh package |
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
| NFR-4.1 | E2E | NFR-01, FLOW-06 |
| NFR-4.2 | E2E | FLOW-06 (silent background sync) |
| NFR-4.2a | E2E+UNIT | FLOW-08, NFR-04; sync merge tests |
| NFR-4.3 | SERVER | resource footprint — docker/Go, no UI |
| NFR-4.4 | SERVER | JWT decoupling — Go/api; offline-token touched by FLOW-06 |
| NFR-4.5 | E2E | M17-03, NFR-05 |
| NFR-4.6 | E2E | NFR-06 (the registration round-trip against a real session, 2026-09-01); M17-02 is retired — the branch it kept is unreachable in a suite whose browsers all support Push |
| NFR-4.7 | E2E+UNIT | M15-12 (the pre-validation half of M15-04, 2026-08-30), NFR-07, M9-04 (the entry from an empty inventory, and the return to it); spreadsheet.ts + `composables/__tests__/import.spec.ts` carry the `?` rule at both levels. The wizard's inline noise notice was the first of two clauses this row carried as unbuilt; it was ruled *build it* on 2026-08-31 and M15-02 asserts it. The second stands and is deliberate: **the commit is an approximation rather than a transaction** — no rollback, no progress — so NFR-07 asserts the clause that *is* built, that a blocked mapping writes nothing. |
| NFR-4.8 | E2E | NFR-02 |
| NFR-4.9 | DOC/N-A | operator documentation only |
| NFR-4.10 | DOC/N-A | retired (demo rate-limit) |
| NFR-4.11 | E2E | M17-07, M18-05/06/07/08, M19-01; **NFR-03/03b** carry the request itself (2026-09-01) — the one clause the sheet cannot show. (This row was written twice, the second copy a subset of the first; merged 2026-09-01.) |
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
* **Supply-chain (per the 2026-07-11 pinning agreement)**: the Playwright dep is pinned in `package-lock.json` (sha512);
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
