# E2E coverage ledger

Which cases from [`UI_Test_Spec_v1.0.md`](UI_Test_Spec_v1.0.md) are actually implemented, and where. The spec says what *should* be covered; this file says what *is*. When the two disagree, this file is the one that is right.

The implementation lives in [`client/e2e/`](../client/e2e/), whose README holds the running instructions and selector conventions.

## The rule that comes before the units

**A UI change ships a *passing* Playwright case in the same PR — and the
global patterns count.** Stated by the owner on 2026-08-13 after four
navigation defects were found by hand while both the M3 and M4 units were
green: the rail did nothing, mobile had no navigation at all, `‹ back`
did nothing, and a screen's search icon went on filtering that screen
after the user had left it. A per-screen suite proves the screen and says
nothing about getting to it or leaving it.

Two consequences worth stating as rules of their own, because each was
paid for by one of those defects:

- **Assert what is rendered, never only the URL.** Every one of those
  failures kept `expect(page).toHaveURL(...)` green — the address moved
  and the screen did not. Scope assertions to
  `ion-router-outlet > .ion-page:not(.ion-page-hidden)`.
- **Never wait for a duration.** Where nothing observable exists to wait
  on, that absence is the defect: the G-2 indicator now reports an
  in-flight Local Mode write because E2E-M4-32 needed to know when the
  data was actually on disk.

## Working rule: one unit per PR

A "unit" is one spec file covering one screen or one flow. A feature PR that adds UI adds its unit in the same PR — never as a follow-up.

Keeping it to one unit per PR is not a style preference: two PRs that each add cases tend to collide on the same `data-testid` names and the same shared fixture, and git merges both cleanly while the suite breaks. **After merging `main` into a long-lived branch, re-check that the testids and helper names you added are still unique.**

## Status

| Unit | Spec cases | Mode | File |
|---|---|---|---|
| Harness smoke | E2E-M19-01 (partial), E2E-M19-04, E2E-G7-01 | `local` | [`smoke.spec.ts`](../client/e2e/smoke.spec.ts) |
| Navigation / one header bar | E2E-G9-03 … E2E-G9-08 | `local` | [`navigation.spec.ts`](../client/e2e/navigation.spec.ts) |
| M3 trip creation | E2E-M3-01, E2E-M3-03, E2E-M3-14 (incl. the FR-25.9 absence check), E2E-M3-05, E2E-M3-10, E2E-M3-19, E2E-M1-05, E2E-M3-20 (FR-2.1d date bound) | `local` | [`trip-creation.spec.ts`](../client/e2e/trip-creation.spec.ts) |
| Global navigation & app bar | E2E-G9-09, E2E-G9-10, E2E-G9-11, E2E-G9-12, E2E-G9-13, E2E-G9-14, E2E-G9-15, E2E-G9-16 (UX-17 content column), E2E-G1-01 (partial), E2E-G1-02, E2E-G1-03, E2E-G1-04, E2E-G1-05, E2E-G12-01 (partial), E2E-G12-02, E2E-G8-02, E2E-G2-02, E2E-G2-03, E2E-G2-08, E2E-G2-09, E2E-M3-15, E2E-M3-16, E2E-M4-32 | `local` | [`global-nav.spec.ts`](../client/e2e/global-nav.spec.ts) |
| M5 item detail | E2E-M5-09 … E2E-M5-14, E2E-M5-17, E2E-M5-05 (a note becomes a task), E2E-M5-23 (the companion offer) | `local` | [`item-detail.spec.ts`](../client/e2e/item-detail.spec.ts) |
| M4 packing list | E2E-M12-06, E2E-M4-01, E2E-M4-04, E2E-M4-36, E2E-G6-02, E2E-M4-18 (both directions), E2E-M4-20, E2E-M4-21, E2E-M4-22, E2E-M4-23, E2E-M4-44, E2E-M4-45, E2E-M4-46, E2E-M4-47, E2E-M4-15 (partial), E2E-M4-02 (partial), E2E-M4-28 (partial), E2E-M4-56 (UX-9 name column), E2E-M4-57 (UX-13 bar overflow), E2E-M4-59 (FR-25.13e hide-carried), E2E-M4-60 … E2E-M4-63 (FR-25.13f: the browse-sheet's two verbs, on a free line and a carried one, and the line's own undo), E2E-M4-25 (+ E2E-M4-08, the prep lifecycle), E2E-M4-24 (the stamp's time, and that it clears), E2E-M4-11 (the shopping count), E2E-M4-19 (the shared bucket's word) | `local` | [`packing-list.spec.ts`](../client/e2e/packing-list.spec.ts) |
| FR-25.21 membership · FR-25.8 per-person quick-add | E2E-M5-18, E2E-M5-19, E2E-M5-20, E2E-M5-21 (the state follows the numbers — implemented since 2026-08-30 and missing from this row until the M5 audit), E2E-M4-12/E2E-M4-58 (one cluster, not N items), E2E-M4-14 (packing one instance does not flatten the other), E2E-M4-64 (G-8: the mode is absent), E2E-M4-65 (the browse-sheet path) | `local` | [`membership.spec.ts`](../client/e2e/membership.spec.ts) |
| G-3 packing claim | E2E-M4-49, E2E-M4-50 | `local` | [`lock-claim.spec.ts`](../client/e2e/lock-claim.spec.ts) |
| FR-9.3 judging a trip | E2E-M4-51 … E2E-M4-55 | `local` | [`closing-pass.spec.ts`](../client/e2e/closing-pass.spec.ts) |
| Typography | E2E-G13-01, E2E-G13-02, E2E-G13-03, E2E-G13-04 | `local` | [`typography.spec.ts`](../client/e2e/typography.spec.ts) |
| Colour anchors | E2E-G11-02, E2E-G11-03, E2E-G11-04, E2E-G11-05 | `local` | [`colour-anchors.spec.ts`](../client/e2e/colour-anchors.spec.ts) |
| Visual baselines | E2E-VIS-01 … E2E-VIS-08 | `local` | [`visual.spec.ts`](../client/e2e/visual.spec.ts) |
| Pack-out & undo | E2E-M4-33, E2E-M4-34, E2E-M4-35 | `local` | [`pack-out.spec.ts`](../client/e2e/pack-out.spec.ts) |
| Deliberately not packed | E2E-M4-37 … E2E-M4-42, E2E-M5-16 | `local` | [`skip-item.spec.ts`](../client/e2e/skip-item.spec.ts) |
| Surfaces | E2E-G14-01, E2E-G14-02, E2E-G14-03 | `local` | [`surfaces.spec.ts`](../client/e2e/surfaces.spec.ts) |
| M7 template scopes | E2E-M7-04, E2E-M7-06 (partial), E2E-M7-07 (completed by the M8 unit), E2E-M7-08, E2E-M7-09, E2E-M7-10 (two tests) | `local` | [`template-list.spec.ts`](../client/e2e/template-list.spec.ts) |
| M8 template editor | E2E-M8-01, E2E-M8-02, E2E-M8-03, E2E-M8-04, E2E-M8-05, E2E-M8-06 (as amended), E2E-M8-07 (incl. E2E-M7-07's include half), E2E-M8-08, E2E-M8-10, E2E-M8-11 (editor half), E2E-M8-12, E2E-M8-13, E2E-M8-14, E2E-M8-15, E2E-M8-16, E2E-M8-17, E2E-M8-21, E2E-M8-22, E2E-M8-23 (two tests), E2E-M8-18, E2E-M8-24 (two tests) | `local` | [`template-editor.spec.ts`](../client/e2e/template-editor.spec.ts) |
| M6 shopping (composer wiring, FR-25.11j reveal, FR-25.6 aggregation) | E2E-M6-21, E2E-M6-17, E2E-M6-22, E2E-M6-05, E2E-M6-06 | `local` | [`shopping.spec.ts`](../client/e2e/shopping.spec.ts) |
| M9/M10 inventory & item editor | E2E-M9-01, E2E-M9-06, E2E-M9-05, E2E-M9-08 (tag-axis clearance, UX-4), E2E-M9-10 (search filters), E2E-M9-04 (empty state → M15), E2E-M10-01 … E2E-M10-05 (this row was owed since the unit landed), E2E-M10-13 (German-seeded) | `local` | [`inventory.spec.ts`](../client/e2e/inventory.spec.ts) |
| FR-24.3 lifecycle delete | E2E-M10-14, E2E-M10-15, E2E-M7-11 | `local` | [`lifecycle-delete.spec.ts`](../client/e2e/lifecycle-delete.spec.ts) |
| FR-24.3 restore (M23) | E2E-M23-01, E2E-M23-02, E2E-M23-03 | `local` | [`restore-retired.spec.ts`](../client/e2e/restore-retired.spec.ts) |
| §3.28 the item mark | E2E-M10-11, E2E-M10-12, E2E-M9-07, E2E-M4-48, E2E-G15-01, E2E-G15-02, E2E-M5-15 | `local` | [`item-mark.spec.ts`](../client/e2e/item-mark.spec.ts) |
| M11 containers | E2E-M11-02, E2E-M11-04, E2E-M11-05 (incl. M11-01's create/edit), E2E-M11-06 (incl. M11-01's delete, M11-03 folded in), E2E-M5-22 (M5 moves an item between two of them), E2E-M11-07 (UX-8 empty state) | `local` | [`containers.spec.ts`](../client/e2e/containers.spec.ts) |
| M12 analytics | E2E-M12-01, E2E-M12-02 (incl. the UX-11 tile absences), E2E-M12-03 (both halves since 2026-08-21), E2E-M12-04, E2E-M12-05, E2E-M12-07 | `local` | [`analytics.spec.ts`](../client/e2e/analytics.spec.ts) |
| M2 trip list rows | E2E-M2-12 (locale dates, UX-5) | `local` | [`trip-list.spec.ts`](../client/e2e/trip-list.spec.ts) |
| M2 row actions (the slide menu) | E2E-M2-06 (no Share without a session), E2E-M2-07 (export, both branches) | `local` | [`trip-list.spec.ts`](../client/e2e/trip-list.spec.ts) |
| M2 opening segment (FR-2.8) | E2E-M2-13, E2E-M2-13b, E2E-M2-13c, E2E-M2-13d | `local` | [`trip-list.spec.ts`](../client/e2e/trip-list.spec.ts) |
| FR-27.4 group changes | E2E-M8-09, E2E-M8-19 | `local` | [`group-refresh.spec.ts`](../client/e2e/group-refresh.spec.ts) |
| M3 composed templates | E2E-M3-11, E2E-M3-13, E2E-M3-18 | `local` | [`trip-composition.spec.ts`](../client/e2e/trip-composition.spec.ts) |
| FR-27.10 group into a running trip | E2E-M4-26 (two cases), E2E-M4-27, E2E-M8-20 | `local` | [`group-to-trip.spec.ts`](../client/e2e/group-to-trip.spec.ts) |
| M15 spreadsheet import | E2E-M15-06, E2E-M15-07, E2E-M15-08, E2E-M15-10 (G-17 file trigger) | `local` | [`spreadsheet-import.spec.ts`](../client/e2e/spreadsheet-import.spec.ts) |
| M2 trip progress | E2E-M2-10 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Clone without opening the source | E2E-M2-11 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Sync paging | E2E-SYNC-01 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| M2 opening segment, settled guard | E2E-M2-14 | `single` | [`single/opening-segment.spec.ts`](../client/e2e/single/opening-segment.spec.ts) |
| Editable display name and profile circle (FR-17.13, FR-23.4a) | E2E-M17-04 | `single` | [`single/settings-profile.spec.ts`](../client/e2e/single/settings-profile.spec.ts) |
| Profile under an OIDC session: picture editable, name not (FR-17.13, revised 2026-08-29) | E2E-M17-05, E2E-M17-05b | `server` | [`server/settings-profile.spec.ts`](../client/e2e/server/settings-profile.spec.ts) |
| M18 backup & restore | E2E-M18-05, E2E-M18-06, E2E-M18-07, E2E-M18-08, E2E-M18-09, E2E-M18-10, E2E-M18-11 | `local` | [`backup-restore.spec.ts`](../client/e2e/backup-restore.spec.ts) |
| M14 review | E2E-M14-01, E2E-M14-02, E2E-M14-03 (pair scope), E2E-M14-04 (+04b), E2E-M14-05, E2E-M14-06 + a G-9 back case | `local` | [`review.spec.ts`](../client/e2e/review.spec.ts) |
| M21 template from trip | E2E-M21-01, E2E-M21-02 (+02b), E2E-M21-03 (+03b, +03c), E2E-M4-43 | `local` | [`template-from-trip.spec.ts`](../client/e2e/template-from-trip.spec.ts) |
| M22 trip properties | E2E-M22-01, E2E-M22-02, E2E-M22-03, E2E-M22-04, E2E-M22-05, E2E-M22-07, E2E-M22-08, E2E-M22-09 (toast geometry), E2E-M22-06 (in `global-nav.spec.ts`) | `local` | [`trip-properties.spec.ts`](../client/e2e/trip-properties.spec.ts) |
| App shell offline (NFR-4.13) | E2E-PWA-01, E2E-PWA-02, E2E-PWA-03 | `local` | [`pwa-offline.spec.ts`](../client/e2e/pwa-offline.spec.ts) |
| Two accounts on one instance | E2E-FLOW-01 (server half: convergence, membership, attribution), E2E-G3-01 (identity half) + E2E-G3-03 (identity half), E2E-G3-02 (takeover half), E2E-G3-04 (membership lock), E2E-FLOW-02 (delegation, and with it E2E-M4-30 + E2E-M4-31's header guard), E2E-M4-10 / E2E-M4-24 (attribution, inside FLOW-01), E2E-M2-05 (delete is the owner's alone), E2E-M17-01 (a preference silences one kind) | `server` | [`server/multi-user.spec.ts`](../client/e2e/server/multi-user.spec.ts) |
| Notifications speak the recipient's language (NFR-4.12) | E2E-NOTIFY-01 | `server` | [`server/multi-user.spec.ts`](../client/e2e/server/multi-user.spec.ts) |
| M17 API tokens (FR-23.7) | E2E-M17-13, E2E-M17-13b | `server` | [`server/api-token.spec.ts`](../client/e2e/server/api-token.spec.ts) |
| M20 instance administration | E2E-M17-09, E2E-M20-01, E2E-M20-02, E2E-M20-03 (name half), E2E-M20-04, E2E-M20-05 | `server` | [`server/admin.spec.ts`](../client/e2e/server/admin.spec.ts) |
| G-10 trip presence | E2E-G10-01 (facepile and badge; the per-person list is unbuilt) | `server` | [`server/presence.spec.ts`](../client/e2e/server/presence.spec.ts) |
| Instance currency | E2E-M9-09 | `single` | [`single/instance-currency.spec.ts`](../client/e2e/single/instance-currency.spec.ts) |
| Single-User backend sync | E2E-FLOW-01 (partial), E2E-FLOW-06, E2E-G2-01, E2E-FLOW-08 / E2E-NFR-04 (partial), E2E-G2-04, E2E-G2-05, E2E-G2-06, E2E-G2-07, E2E-G2-10, E2E-G2-11, E2E-G2-12, E2E-FLOW-10, E2E-G3-01 (partial) + E2E-G3-03, E2E-G3-02 (mode gate only), E2E-M15-05, E2E-M15-09 | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |

**E2E-M15-05 — the spreadsheet import, added 2026-08-23, and M15's first
case of any kind.** Until it, M15 had **no** e2e coverage — four written
cases, none implemented — and its unit tests ran against fakes with no
schema. What that combination hid: `createImportedTrip` never wrote `year`,
which `trips` declares NOT NULL, so the server refused every trip the wizard
imported. Nothing on the importing device could notice, because the
optimistic row was already in its own store and M2 rendered the migration
that had not happened. The case therefore asserts from a **second browser
context**, which never saw the optimistic write; the assertion on page A
alone is green against the defect. Rebuild before mutating (`npm run build`)
— Playwright drives the built bundle, so a source-only revert proves nothing.

Two smaller things the case had to learn about the screen it drives: an
`ion-checkbox` contributes a hidden `input` to its row, so the two IonInputs
are addressed as `ion-input` and not as `input`; and FR-16.2 imports rows
already packed, so on M4 they are behind the done bar rather than in the list.

**E2E-G2-04 — the durable outbox (B2, NFR-4.1), added 2026-08-21.** A new
case in the `single` unit: pack a row offline, reload the page *while still
offline*, and the queue is still there — count on the glyph, sentence in the
G-2 sheet — then drains when the trip is opened with a network again, and a
device that never saw the change reads it back. The app shell for that
offline reload is the PWA's (E2E-PWA-01); the case asserts the back button
rather than E2E-PWA-01's logo, because inside a trip the app bar carries no
logo. **Proved red against the unfixed build**: with the outbox store
unwired the count is simply absent after the reload.

**E2E-G2-05 — a refused mutation is parked, added 2026-08-22.** The first case
that ever drove the parked surface against a real `jitpackd`. It could not
have existed before: the client read the rejection under `status`, a key no
server has ever sent, so `parkedCount` stayed 0 whatever the server answered
— and both unit suites agreed with it, because their fakes answered `status`
too. Proved by mutation: pointing the client back at `.status` makes
`sync-detail-parked` not exist at all.

Two honesty notes. **The refusal it drives is the trip-confinement one**
(a partial upsert on a row deleted elsewhere names no trip), not a database
constraint; the constraint refusals of the same code path are covered in Go
(`store/trip_constraint_test.go`, `api/push_refusal_test.go`), because no
screen can delete a container or cut a quantity below its packed count on a
second device inside one case. **The removal has to pack the row first**: a
traveller leaving takes only her *packed* rows with her — an untouched row is
detached, not deleted — which is the detail the first draft of this case got
wrong and the run corrected. The destructive alert button is located by its
Ionic role class rather than its label, so the case does not depend on which
catalogue the alert renders in.

**E2E-M4-49/50 — a claim can be given back, added 2026-08-23.** The G-3
claim has worked for a long time; what it could not do was *end*. Nothing
released it but packing the row or the §7 window passing, so a tap made by
mistake held the row against everyone else for a quarter of an hour.

**The note is asserted because my own claim locks nothing for me.** That is
the whole asymmetry: the device holding the row is the one device that sees
no padlock, so it is the one that has to be told in words. The release is
then asserted twice over — the note gone *and* the row still present — since
a note that disappeared together with its row would satisfy the first half
on its own.

The menu case counts its buttons rather than only naming one, so an option
added later cannot slip in unnoticed; what it excludes is *skip*, which on a
row you are mid-way through packing is not a thing anyone means. Both
mutation-proved by making the menu blind to its own claim.

**E2E-G2-07 — a merge announces itself, added 2026-08-22.** `merged` is an
outcome the wire has always carried and the client read in no code path: a
mutation that lost a field left the queue exactly like one that applied
cleanly, so nothing ever told the user. The assertion lives inside the
existing losing-edit case because that is the one place in the suite where a
real server merges a real edit away — building a second world to produce one
would buy nothing.

**The toast is asserted first and dismissed by hand.** It auto-dismisses on
a timer, so asserting it after the case's M5 steps would race that timer —
the first draft did exactly that. Nothing after the dismissal depends on it;
what the later steps assert is the sheet's standing line, which has no
timer.

**E2E-M18-09 — the status survives the round trip, added 2026-08-23.** The
backup's read half gained the thing it had been quietly dropping: every
restored trip was `planning` (FR-18.4), so a device of archived history came
back as plans. The case takes a trip through the app's own lifecycle, backs it
up, and restores it onto a second context — and asserts both halves, that it is
on *Archived* **and** that it is not on *Planned*, because Planned is exactly
where it used to be and an assertion that only checked Archived would have
passed against a segment picked for it rather than derived from it.

Two things it had to learn, both cheap and both invisible from the source:

- **A single-document backup never reaches the restore branch.** A device with
  one trip and no template produces one document, and M18 then shows the
  per-item merge preview instead — `portable-restore-commit` never appears. The
  case builds a template as well, which is what a real device has anyway.
- **`segment-button-after-checked` contains the word "checked".** The regex
  guards the full `segment-button-checked`, and a looser one would have matched
  the *neighbour* of the selected segment.

**What is deliberately not here:** the marks-and-tags half of ADR-024. It is
unit-covered at the same boundary this case crosses — `buildBackup` into
`commitPortableRestore` on a fresh store — and building a tagged, marked
inventory item through M10 would double this case to assert what is already
asserted. Recorded rather than assumed, so nobody reads the id list as a claim
that the whole ADR is e2e-covered.

**E2E-G2-08 and E2E-G2-09 — what the eyeball found, added 2026-08-23.** Both
came out of rendering PR #160 rather than out of reading its diff, and both are
the same shape: a rule that held everywhere it was written down, and a rendered
result that was still wrong.

The sheet's state glyph sat **14.5 px above its title**. `.head` aligned the
38 px circle to the top of the *title block*, and the `h1` inside carried a
20 px top margin nothing had asked for — `.jp-sheet-title` names a type role
and no spacing at all, so those pixels were an inherited user-agent default the
component never reset. Two fixes were built and measured against each other
before either was chosen: resetting the margin alone lands at **+5.5 px**,
because a 38 px circle and a 29 px line flush at the top cannot centre on each
other and the residual moves again with the title's size; giving the glyph and
the title their own centred row lands at **+0.9 px** and has nothing to re-tune.
The second was chosen at a visible cost — the ✕ comes down onto the title's
line, and the explanation, no longer squeezed beside it, wraps one word later.

The master log's empty state **ran from edge to edge**, because the page had
copied the house empty state without its `padding` and `text-align`. Nothing
noticed while the only sentence it held fit one line: a shrink-to-fit flex item
looks centred. The master log's names three things, wraps, and the wrapped
paragraph then started at x=0 under a centred icon. The new string exposed a
defect that had been there all along.

**The G-2 sheet was in no visual baseline either**, though it is the one
surface reachable from every screen in every mode. E2E-VIS-08 closes that and
cost no existing baseline. But it is **not** the guard for this defect, and the
review had to correct a first draft that said it was: mutating the fix back
leaves the new baseline **green** at 591 differing pixels, ratio 0.0018, under
the 0.002 the gate allows. That tolerance is the owner's deliberate 2026-08-19
setting — *"this gate catches layout changes, not small ones"* — so the offset
is the geometry case's job and the baseline guards the sheet around it.

**E2E-G2-06 — the master partition's conflict log, added 2026-08-22.** The
audit NFR-4.2a promises had one endpoint and two partitions: every
master-partition loser — a group renamed twice, a trip's own dates — was
written with `trip_id NULL` and read by a query that filters on `trip_id`.
The case renames one trip on two devices and reads the loss from **outside**
any trip, which is the part that could not work before.

**Two things it had to learn.** The losing device cannot be navigated to by
its own trip name — the name is exactly what it lost, so `reopenTrip` looked
for a row that no longer existed and the case timed out against correct
code. And the master queue does not move on a trip open: a trip open drains
the *trip* partition, and this rename is queued on the master one. The drain
here is the app start the durable outbox gave it (B2) — a reload, not a
navigation. Mutation-proved by pointing the query back at `trip_id`.

**Widened 2026-08-24 — the row is read, so it is asserted as read.** Both
G-2 log cases were asserting that the row said *something*, and both were
green while it said the wrong thing.

- **E2E-G2-01** asserted `trip_items · assigned_traveler_id` and then, of
  the two values, only that neither was empty — with the comment that
  *which* string they were was not the case's business. They were two raw
  uuids. It now pins `Seil-x · Assigned to` with `Mia → Andy`.
- **E2E-G2-06** used `toContainText` for the losing and winning names. The
  column stores the JSON of a mutation field, and `"Engadin 7 B"` *contains*
  `Engadin 7 B`: the assertion was green against exactly the quoted form it
  looked like it was catching. It is `toHaveText` now.
- The same row asserts the **timestamp is in the app's language**. The suite
  runs a de-CH device with the app pinned to English, so the unfixed
  `toLocaleString()` rendered `24.8.2026, 00:42:54` — measured, not assumed.

Each of the three was mutation-proved separately, because the first two live
in one test and the earlier failure hides the later assertion.

**E2E-G2-10 — the loss can be taken back, added 2026-08-22.** NFR-4.2a
promises audit *and* manual revert in one sentence; only the audit existed,
so the page named a value it could do nothing about. The case is
E2E-G2-06's scenario carried one step further: B loses the rename, reads it
in the master log, taps *Revert*, and the name B wanted is what the trip is
called again — read back **from M2**, not from the log page, because that
is the half that proves the restore travelled. B's own copy was holding A's
name a moment earlier and only the pull changed it.

**What it costs nothing to wait for.** There is no timer and no drain to
hope for: `revertConflict` drains the partition it wrote before it
resolves, so the assertion lands on a repainted screen. **The negative half
is a positive signal** — the button is asserted *gone* only beside an
assertion that the *Reverted* note is there, because a row that failed to
render at all would satisfy the absence on its own. The refusals the server
distinguishes (`already_reverted`, `row_deleted`, `revert_refused`) stay
where they can be stated exhaustively, in `store/conflict_revert_test.go`
and `api/conflict_revert_test.go`: no screen can delete a row on a second
device or pack an item mid-revert inside one case.

**The first run failed, and the reason is a rule for every later case
here.** The row was located by `trips · name`, the way E2E-G2-06 does —
and found two, then three. **The master partition is shared for the whole
run** (one database, named in this unit's harness notes), so every case
that loses a rename leaves a row that matches. E2E-G2-06 was passing only
because it ran first; both cases now filter by the value *their own* trip
lost, which the per-test `uniq()` suffix makes unique. A conflict-log
assertion in this unit must never identify its row by table and field
alone.

**The second failure was the scoping rule read backwards.** Getting out of
the log used `visiblePage(page).getByTestId('header-back')` — and the one
header bar lives *outside* the router outlet (ADR-011), so the scoped
locator waits forever on a control that is on screen. The rule is "assert
what is rendered, scoped to the visible page"; the header is the standing
exception, and every other case in this file already addresses it
unscoped.

**Testids added with it**, per the ledger's own selector rule:
`conflict-revert` (the control), `conflict-reverted` (the note that
replaces it), `conflict-revert-error` (the per-row refusal sentence) and
`conflict-revert-hint` (the line saying a revert is a new change).


**E2E-M22-08 — an edited trip is still on M2, added 2026-08-22.** The trip
editor sends a partial upsert on purpose — an upsert of the whole row would
hand back a value another device changed meanwhile, which the field-level
merge exists to avoid. The *optimistic* row applied locally was built from the
same fields, and a store applies a change by replacing the row it has: saving
a name therefore dropped `status`. M2 lists by status, so the trip left every
segment at once, and Local Mode has no pull to bring it back.

**Where the assertion goes is the whole case.** M4 still shows the trip, its
name correctly changed, and E2E-M22-01 — which reopens exactly that screen —
stays green against the defect. Only M2 can see it. The vitest sibling in
`tripProperties.spec.ts` had the matching blind spot in a second way worth
remembering: it asserted `year === 2026` under the comment *"untouched fields
stay"*, and `rowToTrip` defaults a missing year to the current one, so the
assertion held while the field was being dropped. It reads `2031` now.

**E2E-FLOW-10 — the pull cursor only comes from a pull, added 2026-08-22.**
The push response's `pull_hint.next_cursor` names the seq *that push* wrote;
the client was adopting it as its pull cursor, which — the cursor being an
exclusive lower bound that only moves forward — stepped over everything
another device had written while this one was offline, permanently and with
no symptom.

**This case asserts the request, not the screen, and that is the finding.**
The first draft asserted the obvious thing: B's row must appear on A. It
passed against the unfixed build. Logging A's traffic explained why — three
drains overlap on a reconnect, and each reads the cursor when it *starts*, so
one of them was still holding the pre-push value and pulled the gap by
accident. The rows arrive; the bug is real; the screen cannot see it. The
wire can: every `cursor` A sends must be one a pull returned, and a `5` after
the server has only ever answered `3` is the whole defect in one number.
The screen is still asserted — B's row does arrive — as the positive signal that the pulls carried anything at all, so the cursor check is not passing over a dead connection. Proved 3/3 red without the fix and 3/3 green with it.

Two traps the harness itself carried. **A `page.route` observer has to be
installed before the first request it judges**, or a cursor served earlier
reads as invented — the first version failed on a perfectly legal `3`. And
**`route.fetch()` runs outside the browser context, so it sails straight
through `setOffline`**: the handler has to honour the flag itself, otherwise
the device never goes offline and the case tests nothing.

Two things this unit still does *not* cover, both by decision:

- **No reconnect drain exists**, so none is tested. The queue moves on the
  app's next own action — a mutation, a trip open, a WS ping — or on the next
  app start, which is what the durable outbox added. An `online`-event drain
  was deliberately left out of Track C.
- **A parked mutation has no e2e.** Provoking one needs a push the server
  refuses permanently, which the app has no way to produce through its own
  UI (it only ever sends columns the server knows). The parking rules are
  covered in `client/src/composables/__tests__/useSyncOutbox.spec.ts`
  instead, and G-2's rendering of them in the SyncDetailSheet component test.
| Two accounts on one instance | E2E-FLOW-01 (server half: convergence, membership, attribution), E2E-G3-01 (identity half) + E2E-G3-03 (identity half), E2E-G3-02 (takeover half) | `server` | [`server/multi-user.spec.ts`](../client/e2e/server/multi-user.spec.ts) |
| Single-User backend sync | E2E-FLOW-01 (partial), E2E-FLOW-06, E2E-G2-01, E2E-FLOW-08 / E2E-NFR-04 (partial) | `single` | [`single/server-sync.spec.ts`](../client/e2e/single/server-sync.spec.ts) |
| Language choice (NFR-4.12) | E2E-M17-10, E2E-M17-11 | `local` | [`i18n.spec.ts`](../client/e2e/i18n.spec.ts) |
| M17 device settings (theme, backup reminder, G-8) | E2E-M17-06, E2E-M17-07, E2E-M17-07b, E2E-M17-08 | `local` | [`settings.spec.ts`](../client/e2e/settings.spec.ts) |
| M17 data export under a session (NFR-4.5) | E2E-M17-03 | `server` | [`server/data-export.spec.ts`](../client/e2e/server/data-export.spec.ts) |

**Why E2E-M7-06 is partial.** The case asks for an empty-state *CTA*
(create / import). The screen has neither as a button: create is the FAB and
import is the header icon, both already on screen. The case asserts what the
empty state does say and that the segment is absent; the UI-Spec now records
the missing CTAs as a decision rather than an omission.

**E2E-M7-07 is complete since the M8 unit.** Its include-dependent half — the
*"N Gruppen ·"* prefix and the *enthält: …* line — needed a Ferien-Vorlage
that actually includes a group, a write only the M8 rebuild could make; the
M8-07 case now builds that composition through the app and asserts both lines
on the M7 row. The resolution arithmetic stays covered where it lives, in
`client/src/domain/__tests__/templates.spec.ts`. One M7 case stays
unimplemented because the surface does not exist: **E2E-M7-05** (Import from
the FAB menu; import is a header icon).

**How E2E-M7-04 is split, and why.** The e2e case drives the menu through
`contextmenu` — the same handler the touch hold fires into — and asserts the
guard both ways: a row click is inert while the menu lives (the sheet staying
up is the positive signal), and the next tap after dismiss opens the row.
The 500 ms themselves are unit-tested in
`client/src/composables/__tests__/useLongPress.spec.ts` with fake timers,
**not** e2e-tested: a real-time hold is a forbidden timing dependency, and
`page.clock` turned out unable to drive Ionic's overlay presentation
deterministically on a warm app (the sheet nondeterministically failed to
attach under the faked clock — observed on chromium repeat runs and, wedged
differently, on webkit, where an infinite spinner animation also defeats any
`getAnimations()`-based settle). What this leaves untested is the one-line
wiring from the row's `pointerdown` to the composable — accepted and stated
here rather than covered by a wait-and-hope. The guard's first version was
in fact wrong (a stale one-shot swallow-next-click flag that ate the next
legitimate tap because the hold's release click usually lands on the
overlay, not the row); the red case that caught it is the dismissed-then-tap
assertion that survives in the contextmenu case.

**The visual unit is the only one that asserts appearance, and it is not
part of `npm run test:e2e`.** It is a separate Playwright project, run by
`make visual` and by its own CI job. Both it and the behaviour suite execute
inside the digest-pinned Playwright image (ADR-013) — the behaviour suite
joined it on 2026-08-19, so the image is no longer what distinguishes the
two; the project selection is. For the baselines the image is load-bearing,
because outside it the images mean nothing; for the behaviour suite it is
only how the browsers get there. The behaviour suite is additionally split
across four CI legs by Playwright's own sharding, so it reports as
`e2e (1)` through `e2e (4)`; the browser is in the test name, not the job
name. What it does *not* cover: the
dev gallery, which is `import.meta.env.DEV`-only and therefore absent from
the bundle these baselines drive, so component states are guarded by nobody.
That is a deliberate trade — the alternative was shipping a developer
surface into every self-hosted instance to make it screenshottable.

Two things had to be made deterministic before any of it was worth having,
and both are recorded at the top of the spec: ids are stubbed (Ionic paints
avatar colours from a hash of a `crypto.randomUUID()` seed, so every run
would otherwise differ), and the clock is **not** frozen — freezing it stops
a pack from reaching the store, which no baseline needed and one state could
not survive.

**What the surfaces unit does *not* prove, and the one thing only it
could.** It proves a card is painted a different plane than its page and
that its shadow survives the flavour switch. It does not prove the *depth
is right* — that a card looks lifted rather than floating — which stays an
eyeball matter until the baselines land. What makes it worth having is the
opposite direction: this defect was **invisible to the stylesheet**. The
card asked for `--ct-mantle`, a real palette token, and passed the colour
invariant and its unit suite while being the same colour as the page. A
rendered pixel was the only witness.

**What the colour unit does *not* prove.** That the palette is *pleasant* —
only that each role landed on the component it belongs to and that the three
stay apart. It also asserts nothing about contrast: the ratios *were*
measured while choosing Latte's brand (they are in
`design-foundation-plan.md`), but nothing re-checks them when a token
moves. Making that a gate belongs to the baselines step.

**What the typography unit does *not* prove.** That the type is *right* —
only that both faces reach the screen and that neither is fetched from
somebody else's server. Appearance is untestable here by design (spec §3);
the baselines that make "looks right" assertable are the fifth step of
`design-foundation-plan.md`, and until they land the eyeball pass is the
gate.

**What the M4 unit deliberately leaves out, and why — rewritten
2026-08-30.** The paragraph that stood here said the facet cases
E2E-M4-16/-17/-19 were waiting for a screen that could produce
categorised, assigned rows, and that -24/-30/-31 were waiting for a
second account. Both waits ended without anybody noticing, in two
different ways, and the audit of item 6 is what found it.

The facet cases had **already been written** — as unit tests in
`domain/__tests__/packingView.spec.ts`, where the arithmetic lives.
OR-within/AND-across, the counts taken against the other facets, the
dead-end rule, the selected-at-zero rule, the shared bucket leading its
facet: all nine of them, none carrying an E2E id, so the ledger went on
reporting a gap that a `git grep` of the id could confirm and a reading
of the suite could not. **The blocked entry outlived its blocker and
nothing connected them**, which is a different failure from the one
recorded under E2E-M4-12/-13 — there, the case unblocked and had to be
re-read; here, it was covered and had to be re-*found*.

The second-account cases were genuinely blocked and are now written
(ADR-029's `server` project). E2E-M4-24 split rather than moved: its
*name* half is FLOW-01's, its *time and clearing* half needs no account
at all and is Local Mode's. E2E-M4-30 needed the rule to leave
`PackingListPage.vue` first — see the entry below. E2E-M4-26/-27 landed
with FR-27.10 in 2026-08-19.

What is left out of the M4 unit on purpose is now one line: the
`server`-only cases, which live in `e2e/server/`. **E2E-M4-12/-13 arrived 2026-08-29**
with FR-25.8's per-person quick-add, and neither landed where it was
waiting: -12 is one case with -58, because the two entries describe one
rendered outcome and the second would only re-run it, and -13's premise —
*„the same quick-add for a single traveler"* — no longer exists, since
G-8 makes the mode absent on a trip with one traveler. The state it
promised is reached by a membership of one, which E2E-M5-19 already walks
through, so the case is one assertion added there rather than a trip
built to reach it. A blocked case is worth re-reading when it unblocks:
what unblocks it is often not the thing it was written against.

E2E-M4-28 covers the *session* half of FR-25.18 by leaving M4 and coming
back; the *fresh session* half is a unit test on `usePackingFilter`,
because reaching it in the browser needs a reload — see the finding
below.

**Corrected 2026-08-13.** An earlier version of this file reported that
Local Mode loses a trip's items on reload. That diagnosis was wrong, and
the way it was wrong is the useful part: the rows were written *and*
loaded correctly, but the packing list crashed while rendering them (its
app-bar actions were teleported into DOM that Ionic relocates), so an
empty screen read as lost data. A second, real defect sat underneath —
the Local Mode write was fire-and-forget, so a reload immediately after
adding a row cancelled the transaction. Both are fixed and both are
covered by **E2E-M4-32**, which waits on the sync indicator settling
rather than on a duration.

## M21 — template from trip (`e2e/template-from-trip.spec.ts`, 2026-08-19)

Six cases, Local Mode, landed with the M21 screen (FR-27.5). Notes worth
carrying forward:

1. **The unit had to build the lifecycle step it needed.** Every M21 case
   starts from an *archived* trip, and no path in the app produced one —
   the same gap recorded above under M12-03 and M14. E2E-M4-43 covers the
   step itself: a planning trip offers *start* and not *archive*, an
   active one the reverse.
2. **The deviation is produced the way it actually happens.** The spec
   pictures a row "added on the trip under a group", which the app cannot
   write — a quick-add row carries no provenance. What produces a real
   deviation is the *group* changing after generation, so E2E-M21-02
   archives first and then removes the position, since a past trip is
   never asked to follow along (FR-27.4).
3. **Two false-green locators were found and are worth remembering.**
   Ionic marks the chosen segment button with a *class*
   (`segment-button-checked`), not with `aria-checked` — asserting the
   attribute passes against nothing. And `ion-toggle` **is** the switch:
   `getByTestId(...).getByRole('switch')` looks for a descendant and finds
   none.
4. **Getting there and leaving are both asserted**, inside this unit rather
   than in `global-nav.spec.ts`: reaching M21 needs an archived trip, which
   costs a group, a wizard run and two lifecycle taps to build, and the
   global unit would have to carry all of it for one chevron. The rule the
   working agreement is protecting — that leaving a screen is a behaviour,
   asserted on the rendered page and never on the URL — is kept; only the
   file differs, and this note is why.
5. **One spec sentence was wrong and was corrected, not tested around.**
   E2E-M21-03's text promised the fold-back "surfaces as an applied change
   on planning trips using that group". Since the FR-27.4 revision of
   2026-08-18 it does not: the edit is *offered* at each following trip and
   becomes an applied change only on acceptance. The UI-Test-Spec sentence
   now says that, and E2E-M21-03c asserts the proposal.
6. **Mutation-proved**, as the standing rule requires: dropping the
   `addTemplateInclude` loop, flipping `DEFAULT_DEVIATION_CHOICE` and
   ungating the archive action each felled exactly the cases that claim
   them.

**Not yet covered:** everything else in spec §3 (global patterns G-1–G-15), §4 (M1–M21 beyond the above), §5 (cross-screen flows) and §6 (non-functional journeys). The `single` mode has its first unit since 2026-08-20 (the harness and its four cases, see below) — everything screen-shaped in `single` beyond it is still open. The `server` mode (mock IdP, multiple identities) has no coverage at all (spec §10 step 5).

This is a small fraction of the specified suite. Do not read a green `e2e` job as "the UI is verified".

## What the suite costs, measured

Numbers from 2026-08-19, taken inside the pinned image on the maintainer's
machine with 2 workers, because the sharding decision needed them:

| | Chromium | WebKit |
|---|---|---|
| Tests | 123 | 123 |
| Wall clock | 3.8 min | 10.6 min |

WebKit is where the budget matters. **16 of its 123 tests take 20 s or more**,
and the slowest passing one took 31.9 s — against Playwright's 30 s default,
which the config had never overridden. That is the cost of §2.4: a unit that
builds its world through M7 → M8 → M3 is worth far more than one that seeds
storage directly, and on WebKit it costs real seconds. The budget is now set
explicitly at 60 s in `playwright.config.ts` with that measurement written
beside it.

Two consequences worth keeping in mind when adding a unit: a new §2.4 unit is
not free, and a WebKit failure reading *"Test timeout of 60000ms exceeded"* at
a different line on each attempt is a unit that outgrew its budget, not a
broken assertion.

**What the FR-27.4 unit covers since 2026-08-18.** E2E-M8-09 runs the whole
question: a group edited after the trip was generated shows up as M2's proposal chip on
a freshly booted app and is *offered* on the trip's next open — the card names the change while the list has not moved —
accepting puts the row on the list, and M2 then carries the "⟳ N Änderungen"
chip naming the group and the item. E2E-M8-19 runs the refusal, and its real
assertion is the return trip: the trip re-derives on every open, so a refusal
held only in memory would ask again the moment you come back. Both were
mutation-proved — restoring the old apply-on-open behaviour turns M8-09 red at
the "offered, not applied" assertion, and a decline that applies the plan
instead of its ledger half turns M8-19 red. The unit moved out of
`template-editor.spec.ts` with the model change: the surface under test is M4
and M2, not the editor.

One thing it does *not* prove: that a **past** trip is never asked. Reaching
one in the browser needs either the planning→active transition no UI ships or
a trip whose end date has gone by, and the wizard's dates are the user's, not
the clock's — so the boundary lives where it can be stood on from both sides,
in the `followsGroups` unit with an injected `today`. E2E-M8-11's
propagation-log half is covered generically by M8-09; the task-specific line
lives in the `groupRefresh` unit. E2E-M8-05 covers the warning surface
that exists today, in both directions (the Vorlage names the trip, and the
group reaches it through the include), plus the absence case *before* the trip
exists — a positive-signal pairing, not a lone not-there assertion. The sheet's
FR-25.15 ●→✓ flip is unit-tested on `SaveIndicator` against a controlled
state; e2e asserts presence and the settled tooltip — racing the transient
● would be a forbidden timing dependency (M8-14 amendment 2026-08-15).

## Order of attack

Following spec §10, adjusted for what is now built:

1. ~~Playwright scaffold + smoke per mode~~ — done.
2. ~~A data-producing unit, so later units have a trip to work with~~ — done (M3; `createTripViaWizard` in `fixtures.ts` is the seed helper).
3. ~~M4 packing list~~ — done; the `data-testid` pass on `PackingListPage.vue` landed with it. **Superseded by the screen audits** (2026-08-30): this list was written when the work was "write the missing cases", and it has been overtaken by reading each screen's promises against the screen — M6, then M4, then M5. The sentence that stood here, *„Next: M5, which both completes its own cases and unlocks the M4 facet cases parked above"*, was wrong in both halves by the time anyone read it again: the M4 facet cases turned out to have been covered as unit tests all along, and M5 had been worked on repeatedly without its catalogue ever being read. **An order of attack goes stale silently** — nothing fails when it does.
4. Global patterns (§3) — they underpin every screen.
5. Local Mode delta: persistence across reload, serverless export, M19 switching.
6. ~~`jitpackd` harness~~ → Single-User cases (largest surface, simplest
   infra). The harness is built (the `single` project, 2026-08-20 — see the
   unit at the end of this file); the per-screen `single` cases remain.
7. Mock IdP → Server/collaboration multi-client cases.
8. Cross-screen flows + non-functional journeys.

## Conventions that matter

- **`data-testid` only.** Never text or CSS-class selectors. Adding the missing testids to a component is part of writing the case, and the attribute is the contract — renaming one is a breaking change to the suite.
- **Ionic inputs need `.locator('input')`.** `getByTestId('x')` finds the `<ion-input>` host; the fillable element is the `<input>` inside it.
- **Seed through the app, not around it** (spec §2.4). Use `createTripViaWizard` and friends. A fast-path that writes rows directly is allowed only for `server`-mode preconditions that are not themselves under test.
- **No sleeps, ever.** Playwright's `expect` retries on its own; assert the outcome, never wait a fixed time for it. If a case can only pass by waiting and hoping, the fault is in the production code — give it a deterministic seam. This is the same rule the Go suite follows and it is not negotiable in either.
- **Tags:** `@smoke`, `@local`, `@single`, `@server`, plus `@mNN` per screen. Run a slice with `npm run test:e2e -- --grep @local`.
- **A `row-*` locator is always scoped** (2026-08-30). `QuantityStepper` renders `row-check`/`row-minus`/`row-plus` and is used by M4's rows, M5's packing block and M8 alike — the ids name the *control*, not the screen, which is right, and a rename would be a breaking change across three units. While M5 is open the list behind it is still painted, so an unscoped `getByTestId('row-check')` is genuinely ambiguous. Scope to `m5-sheet` or to `m4-row-<name>`, never to the page. The suite has always done this; it was a habit rather than a rule until the M5 audit found no line saying so.
- **A uuid in a DOM `id` is not always a missing testid** (2026-08-30). `ItemDetailSheet`'s note articles carry `id="comment-<uuid>"` because that is production's own scroll target for the G-4 `?comment=` deep link. It stays, and the addressable handle sits beside it as `m5-note-<body>`. Recorded so the next audit does not re-file it as the pattern the M4 audit named.
- **An archived trip takes two clicks, not one** (FR-9.3, 2026-08-24). `m4-archive` no longer archives: it opens the closing pass, and **`m4-pass-finish` is what archives**. Every case that needs an archived trip — M14's, M21's, M12's trend, the backup unit — goes `m4-start` → `m4-archive` → `m4-pass-finish`. Skipping the pass without marking anything is a supported path, so a case that only wants the archived state needs no extra staging. This is written here because it is the kind of change that breaks *other* people's units: three specs kept clicking the one control and failed across three shards, and the `server` cases that were still owed when this was written — delegation, presence, M20, all landed since — will all reach for an archived trip eventually.

## M9/M10 — inventory and item editor (`e2e/inventory.spec.ts`, 2026-08-16)

Ten cases, Local Mode; eight landed with the §3.24 tag rebuild and two with the 2026-08-30 audit. What they cover
is deliberately what a unit test cannot: the *painted* result of the two
grouping rules, and the shape of the creation form.

| Case | Spec id | What it pins |
|---|---|---|
| an item on two tags renders once, under its primary tag | E2E-M9-01 | FR-24.2's whole guarantee. A naive "file under every tag" passes every unit test of the store and fails this. |
| the tag axis filters on any tag, not only the primary one | E2E-M9-06 | The axis filters *wider* than the list groups — the two rules differ only in what is rendered. |
| the list is lean until the properties sheet says otherwise | E2E-M9-05 | FR-24.4 end to end: the weight exists on the item, is absent from the row, and appears after the toggle. Asserted on the row, not on `localStorage`. |
| creating hides the sections an item cannot have yet | E2E-M10-07 | FR-24.5 "absent, not emptied", plus the "Mehr ▾" fold. |
| a missing name is answered with a hint, not a dead button | E2E-M10-07 | The button stays live and says why — the failure mode a disabled control hides. |
| a duplicate name is reported before it reaches the push | E2E-M10-10 | The consequence of `UNIQUE(name)` (ADR-014) reaching the user as a sentence rather than a failed sync. |
| an unmatched tag name is created and assigned in one step | E2E-M10-08 | Filter-or-create, including the *second* item finding the tag instead of duplicating it. |
| unassigning a tag refiles the item | E2E-M10-08 | The store's cascade mirroring, seen from the list. |
| an empty tag query offers a capped shelf, and search reaches past it | E2E-M10-16 | UX-14: eight chips plus a tail naming the rest, the cap lifted by a query, the tail handing focus to the search — and, at phone width in German, that the placeholder fits its box, measured by rendering it as the value (`scrollWidth`), not by a canvas re-measure that used the wrong font and could not fail. |
| the search filters the list and says so when nothing matches | E2E-M9-10 | **New 2026-08-30.** M9-01's sentence carried the word „searchable" and no assertion; G12-02 opens the field on this screen but never types. Also pins that the emptied group's *heading* goes with its rows, and that a miss is the no-match state rather than G-7's empty one. |
| an empty inventory offers the spreadsheet import | E2E-M9-04 | **New 2026-08-30**, and the first time this state was ever rendered by a test — `m9-empty` existed in the suite only as E2E-G9-13's *absence* assertion. G-7 plus NFR-4.7's return path, which lands on M9 rather than on M15's other parent. |
| the sections an existing item owns follow the app language | E2E-M10-13 | NFR-4.12 on the half of M10 that only exists after the save. **Seeded in German, and that is the case**: the suite's app language is English, and against English a catalogue lookup and the hard-coded word it replaced render identically — so an English assertion here could not fail. Its negative counterpart above moved off the headings' words onto test ids for the same reason. |

**Two of these tests carried the wrong id until 2026-08-30.** The table above
has always named E2E-M9-05 and E2E-M9-06 correctly; the *test names* in the
spec file said `E2E-M9-02` and `E2E-M9-03`, which are two entirely different
promises (the FAB's creation mode, and multi-select merge). Both halves
shipped in the §3.24 rebuild commit, so this was never drift — it was wrong
from the first day, and for a year two ids read as covered while their
behaviours had no test at all. Nothing mechanical could have caught it: each
id is used exactly once, so a duplicate-id gate is green, and the totals are
identical either way. **The only check that finds a swap is reading the id's
sentence against the body of the test under it.**

**Not covered here, on purpose:** the device-local *reload* half of FR-24.4
is unit-tested in `composables/__tests__/inventoryProperties.spec.ts`, where
the storage seam actually is — an e2e reload assertion would test the browser
more than the preference. The ordering arithmetic behind the grouping lives
in `domain/__tests__/tags.spec.ts`, mutation-proven: filing an item under
every tag instead of its primary one drops two of those cases.

**Four traps this suite paid for, all in one sitting.**

1. The first run was green-looking nonsense: `npm run build` ran from the
   wrong directory, failed silently, and Playwright drove the *previous*
   bundle. Missing testids read exactly like broken selectors. Rebuild from
   `client/`, and check the build actually said so.
2. The ledger's own "`data-testid` only" rule earned its keep — the first
   draft asserted on `.group-head` and on a chip's visible text, which would
   have broken on any restyle and on the German catalogue respectively.
3. **A rendered assertion must not encode a styling decision.** Group
   headings wear `.jp-eyebrow`, which uppercases in CSS, so `allInnerTexts()`
   returns "KLEIDUNG". The helper lower-cases: the casing is the type role's
   business, the word is the test's.
4. **Scope every locator to the painted page, including the FAB.** An
   unscoped `getByTestId('m9-fab')` resolves the *outgoing* page's button
   during a transition, and a button that is still animating never becomes
   stable — which surfaces as a 30 s click timeout, not as a wrong-element
   error. The `visible()` helper exists for exactly this and has to be used
   everywhere, not only where an assertion looked ambiguous.
5. **`fill()` on an Ionic input can lose its event, and the damage shows up
   nowhere near the cause.** `fill()` dispatches a single DOM `input` event
   that the component must re-emit as `ionInput` for Vue to see. On WebKit
   that one event is occasionally lost: the field shows the text while the
   bound ref stays empty. On M10's tag search that means *neither* a match
   chip nor a create chip renders — both are derived from the query — and it
   surfaces 30 s later as "element not found", on a screen that looks
   correctly filled in. Waiting for Ionic's own `hydrated` class was not
   enough: it still failed once in fourteen runs. The helper now types with
   `pressSequentially`, which gives the component one event per character;
   losing all of them is not a race that exists. 14 consecutive clean runs
   across both engines, past the run at which the hydration-only version
   broke. The lesson generalises: **when a test depends on an Ionic input's
   *bound state* rather than its displayed value, type it.**
6. **A settle wait belongs in a helper, not inline.** Committing the
   creation form does a `router.replace`, and going back immediately
   overlaps two outlet transitions — after which `ion-router-outlet`
   intercepts pointer events and the *next* tap never lands, 30 s later,
   with nothing resembling a navigation error. One case created its item
   inline and so missed the wait the shared helper already had; the two
   cases were byte-for-byte identical in navigation and differed only in
   that. It is now `commitNewItem()`, used by both, so the omission cannot
   recur silently. That comparison is also what found it: E2E-M10-03 passes
   the identical sequence, which ruled the navigation itself out.

## M11 — containers (`e2e/containers.spec.ts`, 2026-08-16)

Four cases, Local Mode, landing with the M11 rebuild. The pairing *write
semantics* (both sides at once, exclusive, released on delete) are unit
territory — `src/domain/__tests__/containers.spec.ts` — so the e2e cases
assert only what the user can see of them: the pair set in one sheet and
read back as selected in the *other* container's sheet, and cleared on both.
That cross-sheet read is mutation-proved — reverting `pairContainer` to the
pre-rebuild one-sided write fails E2E-M11-05.

What the unit cost to learn:

1. **Playwright CSS pierces shadow DOM.** The "no button grid" assertion of
   E2E-M11-06 counted `button` inside the unassigned rows and found one —
   `ion-item`'s own tap surface is a native button *in its shadow root*. The
   rejected design was one `ion-select` per row, so that is what the
   assertion counts.
2. **An overlay's dismissal is part of the interaction.** A tap that arrives
   while the previous sheet is still animating out lands on the backdrop and
   is swallowed. `closeSheet()` therefore waits for `ion-modal.show-modal`
   to be gone, not merely for the sheet's content to detach — the same
   settled-not-arrived rule the M7 unit paid for, one layer down.
3. **A spec sentence is a list of promises, and each one needs its own
   assertion.** The unit landed marking E2E-M11-05 implemented while its text
   promised the pairing is released "when cleared **or when one side is
   deleted**" — only the first half was asserted. The second was moved to
   E2E-M11-04, because that is where it is *visible*: with both containers
   empty a released and an un-released survivor render identically, so the
   assertion would have passed either way. Found by reading the spec text
   against the test body, which `/pr-review` now requires.
4. **Playwright drives `dist/`, so a mutation proof needs a rebuild.** The
   first attempt at proving the delete-release assertion edited the
   orchestrator and re-ran the case, which stayed green — not because the
   assertion was weak but because `npm run preview` was still serving the
   previous bundle. Test-side edits need no rebuild; production-side edits
   always do, and forgetting it turns every mutation proof into a
   rubber stamp.
5. **Real weights come through the app's own paths** (spec §2.4): the master
   item is created in M10's minimal form with a weight, and the trip row
   inherits it by picking the quick-add *suggestion* — which got its
   `data-testid` with this unit; free-text quick-add creates weightless
   items and would have made the FR-10.3 grades untestable.

## E2E-M5-13 — browser back with the sheet open (2026-08-16)

Joined the M5 unit with the `overlayBackGuard` fix (Navigation Concept §7
case 4). Two things the case had to get right:

1. **The history must be built in-SPA.** A `page.goto` per step creates a
   *document* per step, and back across documents reboots the app instead of
   reaching the router — the unfixed build then "fails" for a reason the fix
   cannot address. The case walks list → trip → sheet through the UI, which
   is also exactly the owner's repro.
2. **Back must wait for the sheet's presentation to settle.** A pop during
   the enter animation races Ionic's transition queue and loses regardless
   of the guard — a real, documented gap (see the concept doc), accepted
   because a human back needs a visible sheet first. The wait is on
   observables (the modal's `show-modal` class and running animations
   excluding spinners), not a duration.

## M12 — analytics (`e2e/analytics.spec.ts`, 2026-08-16)

Landed with the M12 rebuild. What the unit had to get right:

1. **The facet handoff is asserted by what disappears.** E2E-M12-04's chip
   assertion alone would pass with a chip that filters nothing; the case
   also asserts that a row outside the tapped slice is gone from M4, which
   is the regression the 2026-08-08 concept round found (grouping set, list
   unfiltered, the tapped number nowhere on screen).
2. **E2E-M12-03 covers only the absence half — the positive half is
   blocked, and the block is a product gap, not a test gap.** The trend
   needs an archived trip in the trip's series, and no UI path can produce
   one: the wizard creates *planning* trips, and both archive affordances
   (M2's swipe action, M4's app-bar entry) are gated on *active* — a status
   only `activateTrip` assigns, which nothing user-facing calls (the parked
   North-Star Plan/During phases own that transition). Until that lands,
   `seriesWeightTrend`/`seriesTopFlagged` are unit-owned and the e2e case
   asserts the section is *absent, not empty* without history. When an
   activate path ships, the positive M12-03 case is owed alongside it.
   **That path shipped on 2026-08-19** with M21 (see below): M4's app bar
   and M2's swipe both offer *start* on a planning trip. The positive half
   was written on **2026-08-21** and the debt is closed; what it needed
   beyond the lifecycle step is recorded under "M12 — the positive trend
   half" below.
3. **Weighted rows come through the app's own paths** (spec §2.4), reusing
   the M11 unit's route: master item with weight in M10's minimal form,
   quick-add via the *suggestion*. Traveler assignment goes through M5's
   popover select — the app's one way of making a row somebody's — driven
   by clicking the option inside `ion-select-popover`, since the select
   itself swallows synthetic `ionChange` events.
4. **The wizard grew a series seed** (`fixtures.ts`): `TripSeed.series`
   drives the "New series…" popover path (testids `wizard-series`,
   `wizard-series-name` added for it) and reuses an existing series of the
   same name on later seeds — needed by E2E-M12-03 and by every future
   series-scoped case (M16).

## M14 — review assistant (`e2e/review.spec.ts`, 2026-08-16)

Landed with the M14 rebuild (FR-27.11: a list targeting groups). Two cases,
Local Mode — deliberately few, and the honesty about why matters more than
the count:

1. **Every positive M14 case is blocked by the same product gap as
   E2E-M12-03's history half.** A proposal needs an FR-9.1 flag; the only
   flag writer the UI has is the quick-add's auto-*Missing*, which stamps
   only on an *active* trip — and nothing user-facing moves a trip from
   planning to active. So E2E-M14-01 (auto-launch on archive),
   -02 (apply writes to the group), -04 (targets, blast radius) and
   -05 (marked rows) cannot be built through the app today (spec §2.4
   forbids injecting the rows). When a planning→active path ships, those
   cases are owed alongside it, exactly like the positive M12-03.
   **Unblocked 2026-08-19** by the lifecycle step M21 needed (E2E-M4-43):
   an archived trip — and with it an FR-9.1 flag — is now reachable
   through the app. M14-01/-02/-04/-05 are owed rather than impossible.
2. **The list semantics are pinned in a component test instead** —
   `src/views/trips/__tests__/ReviewPage.spec.ts`: one row per proposal
   with the open count, the groups-only picker (and the unused-row
   restriction to groups that carry the item), apply/skip marking rows in
   place, pair-scoped "never ask again", the FR-27.4 blast-radius line,
   and the empty state. The proposal arithmetic itself is domain-owned
   (`domain/__tests__/review.spec.ts`).
3. What the e2e unit *does* pin: the screen renders as a list with an
   open count even when that count is 0 (the empty state is framed, not
   blank), and `‹ back` renders the packing list again (G-9) — asserted
   on the visible page, not the URL.

## M14 — the positive half, and the two blocks that hid a defect (2026-08-20)

The section above recorded M14's positive cases as *unblocked but unwritten*
since M21 shipped the lifecycle step. Writing them found a **second** block
nobody had recorded, and then a defect underneath it:

1. **`unused` had no writer anywhere in the app.** *Missing* is stamped by the
   quick-add on an active trip; *unused* was a read-only note in M5's Details
   block. FR-9.2's assistant is written around overpacking, so its main input
   was unreachable and M14 had only ever been exercised by the dev fixture. The
   control is built in this PR (E2E-M5-17), which is what made every case here
   possible. **The lesson generalises: "unblocked" was checked against one
   half of the precondition.** M21 proved *archived* was reachable; nobody
   asked whether the *flags* were.
2. **An ordinary M5 edit erased the row's provenance.** The optimistic update
   carries a whole row and both the store and IndexedDB *replace* rather than
   patch, so the hand-maintained projection (`itemRow`) silently dropped
   `source_template_id`, `packed_by_user_id`, `packed_at` and
   `packing_now_at`. Flagging a generated row detached it from its group —
   permanently in Local Mode — and the *unused* proposal it should have
   produced never appeared. Found because the first run of E2E-M14-01 showed
   one proposal instead of two. The guard is written against the whole
   `TripItem` type rather than the four columns
   (`composables/__tests__/masterActions.spec.ts`), so the next column added is
   covered the day it is added. Mutation-proved: removing the one line turns
   E2E-M14-01 and -02 red.
3. **The retarget picker listed groups in storage order.** Chromium and the
   second run disagreed, which is the same class of finding as FR-27.2's
   include order: an order that comes from the storage layer is no order at
   all. `retargetGroups` sorts by name now, with a domain case behind it —
   the e2e assertion was the symptom, the domain rule is the fix.
4. **The picker is dismissed by choosing the value it already has**, not by
   Escape: dismissal is then Ionic's own path and the wait is on a state the
   app reaches by itself. Escape left the popover up often enough to be seen
   in a repeat run.
5. **What is still not e2e-covered, deliberately:** E2E-M14-03's second clause
   — the same item surfacing for *another* group — needs one item flagged
   twice under two groups, which a single trip cannot produce. It stays
   unit-owned, and the UI-Test-Spec sentence says so rather than claiming the
   id is fully covered.

## M3 — composed templates (`e2e/trip-composition.spec.ts`, 2026-08-16)

Landed with the §3.27 generation package. Two cases, Local Mode — the mode
without a server is where a missing client-side rule shows, and include
expansion, the merge report and task materialisation are all client-side
(invariant 4). Both build their composition through M7/M8 rather than
injecting rows (spec §2.4), which is why the M7/M8 helpers moved into
`fixtures.ts` instead of being copied a third time.

1. **E2E-M3-11** — the two scopes as separate sections, a Vorlage counted by
   what it *resolves* to (3, where its own positions are 0), the deduped
   footer count, and the merge named with both groups. **E2E-M3-13** — the
   preview's task count, and the task arriving on the generated row as an
   FR-7.3 todo that M4 counts in its header and lists in the prep section.
2. **The unit immediately found a real defect, and it was WebKit-only by
   accident rather than by browser.** The merge read „in Wildlife & Makro"
   there and „in Makro & Wildlife" on Chromium, from identical data:
   `template_includes` carries no sort order, so the rows arrive in whatever
   order storage produced. That order is not cosmetic — it decides a merged
   item's *first contributor*, and therefore which group's attributes and
   `source_template_id` the generated row carries, which is exactly what
   FR-27.5 and FR-27.11 read back a year later. Fixed in the domain
   (`includedTemplatesOf`, ordering by group name with the include id as
   tie-break) and pinned by unit cases that feed the include rows in both
   orders. The superseded `templates.spec.ts` case asserting "the order they
   were included" was rewritten: that order does not exist in the data.
   *A rendered run found it; neither the component tests nor the previously
   green domain suite could have.*

## FR-27.12 — looking inside a group (2026-08-16)

Rides in the M3 composition unit as **E2E-M3-17** rather than as a unit of its
own: the peek is one behaviour offered on three screens, and the wizard is the
screen where its absence hurt most (leaving for M8 costs the draft).

The case asserts both halves — the row's summary and the sheet's resolved list
— plus the two things that make it a *look*: the sheet's only button closes it,
and step 3 is still standing behind it afterwards. The sheet's own semantics
(resolved through a Vorlage's composition, empty state, read-only) are pinned
in `src/components/templates/__tests__/GroupPeekSheet.spec.ts`, the way M11's
container sheet is — a sheet is testable directly, and driving it through a
page's modal would test Ionic rather than the sheet.

**One existing assertion had to be tightened, not adjusted.** E2E-M3-11 checked
scope separation with `not.toContainText('Makro')` on the Ferien-Vorlagen
section. Since a Vorlage's row now *names its items*, "Makro-Objektiv" appears
there legitimately, and the substring check would have read that as a stray
group row. It now asserts the row titles. The lesson is the recurring one: an
assertion that happens to pass for the wrong reason fails the moment the screen
says more than it used to.

## Plain-HTTP instances (`e2e/insecure-context.spec.ts`, 2026-08-16)

The owner opened the app from an iPad on `http://192.168.1.35:3000` and could
not create anything: **`crypto.randomUUID is not a function`**. That function
exists only in a *secure context*, and every id the client mints came from it —
so on a self-hosted plain-HTTP instance, which is a first-class deployment for
this product, item creation, trip creation, tags and templates were all dead.

**The suite could never have caught it, and that is the interesting part.**
Playwright serves from `localhost`, which *is* a secure context. Every case in
the suite ran in the one environment where the bug does not exist. Four cases
now remove `randomUUID` before the app boots — the LAN situation, reproduced
deterministically — and E2E-NFR-SEC-01 asserts that premise, so the unit cannot
quietly go back to testing nothing if a browser ever changes.

Red-proved by reverting `newId()` to `crypto.randomUUID()` and rebuilding:
SEC-02/03/04 fail, SEC-01 (the premise) still passes, which is exactly the
signature a real reproduction should have.

Two lessons, both paid for here: **the toast came first.** The button had no
feedback, so the failure looked like a dead control for two sessions; the
moment it reported, the message named the cause in one line. And **the run mode
that matters is the one the owner uses** — localhost is not it.

## FR-27.14 — a Vorlage's resulting items (2026-08-17)

**E2E-M8-16** joins the M8 unit rather than starting one: the footer that opens
the list is part of that editor, and the sheet behind it is FR-27.12's, already
covered as a component. The case asserts the three things the number could not
say — the items themselves, where each came from, and the marks — plus the two
that make it a look: one button, and the editor still standing behind it.

**Both M8 describes had to declare `test.slow()`.** Adding a fifth
composition-building case pushed WebKit past the 30 s default and *four* cases
failed, three of them untouched by the change — the same arithmetic the M3
composition unit hit on 2026-08-16, and the same misleading signature: failures
land wherever the clock runs out, so one slow addition reads as several
unrelated bugs. Two consecutive 20/20 runs after declaring the budget.

## E2E-M5-14 — the sheet header's two round controls (2026-08-16)

Owner-flagged from a rendered phone: the FR-25.15 save indicator was 26 px
next to the ✕'s 34 px, both hung from the same top edge, so their centres sat
4 px apart. Two things this case had to get right:

1. **It measures geometry, not CSS.** The gap is invisible in a stylesheet —
   both circles are correct in isolation — and obvious once rendered, which
   is the same lesson G-14 was written for. The assertion reads the two
   boxes' sizes and centre lines.
2. **Both boxes are read in one frame.** Two separate `boundingBox()` calls
   land in different frames of the sheet's enter animation and reported a
   5 px difference on an *aligned* header — a false red the first draft
   produced under parallel load. One in-page `evaluate` returns both rects
   from the same frame, so the shared transform cancels out and the
   comparison is exact whenever it runs. Red-proved against the 26 px build.

## G-2 — the sync detail (2026-08-17)

**E2E-G2-02** and **E2E-G2-03** are live, in `global-nav.spec.ts` because G-2 is a
global pattern and the bug it guards was "the glyph does nothing on the screens
that are not a trip" — a per-screen suite is exactly what could not see it.
G2-02 opens the detail from the trip list (no trip open, the silent case) and
asserts the Local Mode half including the *absence* of the conflict-log entry;
G2-03 drives the one-tap backup and asserts the download plus the backup line
moving from *Never backed up* to *Last backup today*.

**E2E-G2-01 is live since 2026-08-20** in the `single` unit (see below): the
queue, its drain, the conflict log behind the sheet's button, and the
outside-a-trip hint are all driven against a real `jitpackd`. What the
component test alone used to carry is now also rendered coverage.

## M18 — the restore half of the backup (2026-08-17)

Written as a coverage audit of the day's merged PRs, not as a feature. #101
shipped the backup with unit cases for `commitPortableRestore` and an e2e for
the *download*; the restore branch of M18 — the screen a user actually restores
through — had nothing driving it. In Local Mode the file is the only copy, so a
backup that cannot be read back is not a backup, which put this above the other
gaps the audit found.

**E2E-M18-05** takes a real backup through the G-2 detail and restores it in a
**second browser context** — a device that has never seen the data. That is the
load-bearing part of the design: restoring onto the device that wrote the file
would pass against an importer that does nothing, because every assertion would
already be satisfied by what is on screen. The file has to hold *two* documents
to reach the restore branch at all (a single document is the ordinary merge
preview), so the case builds a group and a trip through the app's own paths.

**It found a real defect on its first run.** `commitRestore` replaced to
`/trips`, which is not a route — only `/trips/new` and `/trips/:tripId` are — so
the restore happened and the user was left on the import form with the file
still pasted into it. Nothing said anything had been imported. Fixed to
`/tabs/trips` in the same PR.

Two traps paid for while writing it, both worth repeating:

1. **A bare text match read the textarea.** `getByText('Samedan 2026')` was
   green *because* the pasted YAML was still on screen — the exact failure the
   redirect defect caused. Asserting on `trip-row-<name>` is what made the case
   able to see it. A test that reads the input it just filled proves nothing.
2. **A restored trip is *planning*.** M2 opens on *Active*, so the case selects
   the Planned segment. Noted rather than designed around: a restore currently
   ends on a screen that says "No active trips", which is an owner call.

**E2E-M18-06** is the failure path ADR-015 promises — one damaged document is
reported in its place, marked *skipped*, and the intact ones still import.
Red-proved by making `preview()` filter unreadable documents out: the count
assertion falls to 2.

**E2E-M18-08** (2026-08-21, FR-27.4) is the second half of "a backup is
complete": the file has to carry *how* a trip follows its groups, not only what
is on it. The case answers the group twice on the first device — once *yes*
(which writes the applied-changes log) and once *no* (which lives **only** in
the ledger; a refused position leaves no row and no other record) — then
restores onto a fresh context and asserts that both answers survived.

The design problem here was that everything this case proves is an *absence*:
no proposal, no refused row. Three positive signals carry it instead.

1. The restore list itself says the trip *follows 1 group* — rendered proof
   that the section reached the file, before anything is imported.
2. M2's applied chip and log name the change that was accepted, with the
   timestamp it originally had.
3. The load-bearing one: after the restore, a **new** position is added to the
   group on the restored device, and the proposal that appears names it and
   only it. Without the restored sources nothing would be proposed at all;
   without the restored ledger the refused position would be proposed beside
   it. That single assertion is what makes the two "not offered" assertions
   mean something.

Red-proved against the unfixed build, where the trip restores with no
`follows:` at all: the restore-list assertion falls first, and with it dropped,
the refused position is offered again.

## FR-5.5 — deliberately not packed (`e2e/skip-item.spec.ts`, 2026-08-18)

Five cases, and the reason there are five rather than two is that the
feature is two paths and one cascade, and each of them can break without
the others noticing.

* **The gesture is driven through `contextmenu`, not a held pointer.** Both
  reach the same handler; the 500 ms themselves are unit-tested with fake
  timers in `useLongPress`, and a suite that waited out a real hold would
  be depending on a duration.
* **The mark is asserted, not the disappearance.** A skipped row leaving the
  list proves only FR-25.2, which was already true of a packed one. What
  E2E-M4-37 is actually for is the revealed row *saying* it was left behind
  on purpose — the distinction the requirement exists to keep. This was a
  real gap when the work started: M4 rendered nothing there, though the
  backlog note claimed it badged the row.
* **The undo is checked against the reveal bar's absence**, which is a
  positive signal: the bar exists only while something is done, so its
  absence proves the row came back *open* rather than into the done section.
* **The cascade case builds its dependency through M10** (§2.4) and picks the
  quick-add *suggestion* rather than typing free text — a row with no master
  item behind it has no dependencies at all, and the case would have passed
  by proving nothing. That mis-step is why the helper carries a comment.
* **The gesture lives in two templates**, the ordinary row and the per-person
  child row, so it has two cases (E2E-M4-37 and E2E-M4-42). The second was
  missing on the first pass and the review's own file-by-file table is what
  found it — the child-row half would have shipped untested.
* **Two testids were added to M10 for it** (`m10-add-dependency`,
  `m10-dependency-main-<name>`); the dependency editor had none.

**Mutation-proved, both halves, rebuilding between runs** (Playwright drives
the built bundle, so a source-only edit proves nothing): removing the menu's
*Nicht einpacken* entry reddens all four M4 cases and leaves E2E-M5-16
green; removing the M5 control reddens E2E-M5-16 alone; removing the child
row's handler reddens E2E-M4-42 alone. That split is the
point — two paths that can fail independently, and did not share a test.

## FR-27.10 — a whole group onto a running trip (`e2e/group-to-trip.spec.ts`, 2026-08-19)

Three cases for one tap, because the tap has three outcomes and two of them
are reports rather than rows.

* **The dedup case types the row by hand** rather than picking the quick-add
  suggestion, and that is the whole point of it: a picked suggestion carries
  the master item's id, which the group would have matched on anyway. Only a
  free-text row forces the name match — the rule that would silently double
  „Kamera" if it broke. **Mutation-proved:** dropping the name half of the
  presence test doubles the row and reddens exactly this case.
* **The repeat-add case reloads between the two adds.** Two toasts live at
  once otherwise, and `ion-toast` then resolves to two elements — a strict-mode
  violation that is really a race against the first toast's three seconds. A
  fresh document leaves no overlay behind, so the second assertion reads its
  own report.
* **Two halves are unit tests, on purpose.** The added rows carrying no FR-9.1
  *Missing* flag, and a past trip registering no source, both need a trip that
  is **active** or **archived** — and nothing user-facing moves a trip out of
  *planning* yet. Asserted here they would pass on a planning trip whatever the
  production code did, which is the definition of false green; they live in
  `client/src/composables/__tests__/groupToTrip.spec.ts` and move back when the
  North-Star phase supplies the transition.
* **The fourth case guards the other screen.** `QuickAddItem` is one
  component with a prop, and M8 reuses it — so M4 gaining groups could hand
  them to the editor, where FR-27.1 forbids nesting a group at all. The
  absence is asserted beside a positive signal (the free-text hint, which M4
  hides when groups match), and mutation-proved by switching the prop on in
  M8: both browsers redden.
* **A distractor group is part of the world.** „Typing filters them" cannot be
  asserted with one group on the device: any query that offers it offers
  everything there is, and „always offers the first group" would pass. The
  second group is what makes the claim falsifiable, and both directions are
  asserted.
* **The FR-27.4 tail is deliberate.** The last case does not stop at „nothing
  was added": it edits the group afterwards and watches the change arrive at
  the trip as a proposal. The registration is invisible on the screen that
  writes it, so the only honest assertion of it is the effect it has later.

## App shell offline (`e2e/pwa-offline.spec.ts`, 2026-08-20)

The NFR-4.13 shell cache, driven in Local Mode because that is the mode where
"the data was offline-first but the app needed the network to boot" was an
actual gap. **Chromium only**: Playwright hosts service workers only there;
the worker is identical in every engine.

* **E2E-PWA-01** waits on the worker's own lifecycle (`ready`, then
  `controllerchange` if the page is not yet controlled — real events, no
  timeouts), cuts the network, reloads, and asserts the *rendered* chrome.
  Red-proved by unregistering the worker's fetch handler: the offline reload
  paints nothing and the case fails.
* **E2E-PWA-02** guards the never-cache rule (`/api`, `/ws`, `/health`) at its
  observable edge: it fetches `/health` with the worker in control and asserts
  no cache entry appears — beside the positive signal that the same cache,
  read the same way, does hold `/index.html`. Red-proved with a
  runtime-cache-everything mutation (bypass removed, `cache.put` on fetch).
* **E2E-PWA-03** asserts the install declaration end to end: head tags,
  manifest content (name, standalone, maskable purpose) and that every
  declared icon URL resolves. Red-proved by pointing the manifest link at a
  file that does not exist.

One platform lesson recorded in `sw.js` itself: static servers answer assets
with `Vary: Origin`, and Vite's `crossorigin` module scripts request them
*with* an Origin header while install-time `addAll` fetched without one — so
strict cache matching missed every asset and the offline reload painted a
blank page. The worker matches with `ignoreVary: true`; correct here because
every shell file is content-hashed and has exactly one representation.

## Single-User backend sync (`e2e/single/server-sync.spec.ts`, 2026-08-20)

The first backend-backed unit: a real `jitpackd` in Single-User
configuration (spec §2.2), the client in its `server` mode. Four cases —
the two-context convergence smoke (E2E-FLOW-01, partial), the offline
queue round-trip (E2E-FLOW-06 + E2E-G2-01's queue half), the losing-edit
conflict (E2E-FLOW-08/E2E-NFR-04, partial, + E2E-G2-01's conflict-log
half), the G-2 sheet outside a trip, the master-partition log (E2E-G2-06)
and its revert (E2E-G2-10).

**The harness, for the units that will extend it** (Track C's durable
outbox is the named next tenant):

* The `single` Playwright project and a second `webServer` entry exist only
  under `E2E_BACKEND=1` (`playwright.config.ts`) — they need the CGO-free
  binary prebuilt at the repo root, a prerequisite the default run and the
  four shard legs deliberately do not have. `make e2e-single` builds and
  runs the whole thing; CI has its own `e2e-single` job in the same pinned
  image.
* **One jitpackd per run, not per worker — decided, not defaulted.** The
  API is same-origin-only (no CORS, like every real deployment), so every
  context reaches it through the `vite preview` proxy (`vite.config.ts`),
  whose target port is fixed when the config loads; and the multi-context
  cases need one shared server anyway. The database is a fresh temp file
  per run, the project runs serially, and each test builds its world under
  unique names — the master partition is shared state here, unlike in the
  `local` units, and a repeated item name would trip ADR-014's
  `UNIQUE(name)` on the second test.
* Chromium only, deliberately: the surface under test is the sync wire, not
  the engine; the screens keep their WebKit coverage in the `local` units.

**Honest limits, named rather than implied:**

* **Both contexts are the same Single-User identity.** Convergence over the
  wire is proven; locks, attribution and membership (G-3, G-10, FLOW-01's
  full text) wait for the mock-IdP `server` project.
* **There is no reconnect drain, and the case says so.** The queue moves
  only on the app's next own action — a mutation, a trip open, a WS ping —
  so the offline case drives the user path (re-opening the trip) rather
  than asserting an automatic drain that does not exist. The durable outbox
  and the reconnect story are Track C's; when it lands, this case grows the
  reload-survival half.
* **The WS subscription is waited on, not hoped for.** The hub answers a
  subscribe with a `presence` broadcast that reaches the subscriber itself,
  so the smoke case waits for that frame before the other context packs —
  without it, a pack racing the subscription would be a flake by design.
* **The conflict is ordered by construction.** The offline context edits
  the field *first* (strictly older HLC), the online one after — and the
  server holding the winner is proven by a read-back from a third context
  before the loser drains, because "A's push probably arrived" is exactly
  the kind of hope this suite forbids. The merge's direction rules
  (packed-beats, additive flags) stay covered where they live, in
  `internal/sync`.
* **`ConflictLogPage` got its testids with this unit** (`conflict-row`,
  `conflict-field`, `conflict-losing`, `conflict-winning`,
  `conflict-empty`) — it had none, and the ledger's own selector rule makes
  adding them part of writing the case.

## M4 — the scroll position across the M5 overlay (2026-08-21)

E2E-M4-45, in `packing-list.spec.ts` under its own describe. It pays off
ADR-012's overlay amendment, which recorded losing M4's scroll position as a
carried cost and named the repair without building it. Four things came out of
writing it, and each one is a rule the next scroll-shaped case will need:

1. **A `<script setup>` top-level binding is per *instance*, not per module.**
   The first implementation kept the remembered offset in a `Map` declared at
   the top of `PackingListPage.vue` — which the replace re-creates along with
   everything else, so the memory was always empty by the time anything read
   it. The map lives in `lib/scrollMemory.ts` now, with its own unit tests.
2. **The position is an offset *and* a header state.** M4's header line holds
   84 px of the scrolled content, so restoring the number under a re-opened
   line lands on different rows. Both halves travel together, and the header
   state is applied during setup so the first painted frame is already right.
3. **The list's own re-render reports its way back from the top**, and those
   scroll events read as the user's: they re-open the header and overwrite the
   offset about to be re-applied. The screen stops listening to itself between
   opening the sheet and finishing the restore.
4. **Two engine-specific traps, both of which made the case measure nothing
   while passing its earlier assertions.** Playwright scrolls whatever it is
   told to click into view, so the row the case opens has to be *wholly inside
   the content's box* — a row under the app bar is on the page without being
   on screen, and asking for that one scrolled WebKit's list back to the top.
   And the header's max-height transition changes the height of the scrolled
   content, which the browser answers with a scroll adjustment that the screen
   then reads as an upward scroll: the line flipped open and shut for as long
   as anyone watched. `overflow-anchor: none` on the scroll part removes the
   adjustment, and the case runs with motion reduced — the app's own instant
   path, honoured now in `prefers-reduced-motion`, rather than a test that
   switches off the thing it is watching.

Mutation-proved: dropping the `scrollToPoint` while keeping the signal reddens
it on both engines.

## M12 — the positive trend half (2026-08-21)

E2E-M12-03's second case, owed since the lifecycle step landed on 2026-08-19
and written now. It builds a whole past trip by hand — quick-add from a
weighted master item, *Reise starten*, pack the row, type the thing that was
missing, archive — and then a second trip in the same series, whose M12 draws
one column for last year.

Three things worth carrying forward:

1. **The trend counts what was *carried*, so the row has to be packed.** A
   generated row alone puts a 0 kg column on the chart, which would have passed
   a "the section exists" assertion and asserted nothing. The case names the
   kilos and the year.
2. **The flag is read back before it is relied on.** `seriesTopFlagged` reports
   an empty list for "nothing was flagged" and for "the flag was never
   written" alike, so the case opens M5 on the ad-hoc row and asserts the
   *Missing* chip first. Without that it would have been an absence dressed as
   a positive.
3. **M14 is not the signal it looks like.** The first version asserted the
   assistant's open count after archiving, which read `0` — a *missing*
   proposal needs a group to target and this world has no templates at all.
   The review assistant's own coverage lives in `review.spec.ts`, which builds
   those groups; M12's case has no business depending on them.

Mutation-proved twice: pointing `seriesWeightTrend` at *active* trips, and
dropping *missing* from `seriesTopFlagged`, each redden it.

## NFR-4.12 — the language actually changes the app (`e2e/i18n.spec.ts`, 2026-08-21)

One case, and it exists because two of the strings the i18n migration had to
move were **not on any screen**: a nav anchor stored its finished English label
(`NAV_ANCHORS[].name`) and a route stored its finished English title
(`meta.title`). Both fed the chrome — the four anchors and the one header bar —
so no language choice could reach either, on any screen, in either mode. A unit
test cannot see that: the defect lives in the wiring between the route table,
the chrome and the catalogue, and each of the three was individually fine.

The case switches M17's Language row to German and asserts, on the *visible*
page, the anchor labels — **both presentations**, since the tab bar and the
desktop rail read one list and only one of them exists at a given width — the
header bar's route title and M2's own segment words; then reloads and asserts the same, because the choice is device-local
(FR-21.3's pattern). It asserts the **English** words first — without that,
"the German word is there" would pass on a build that had rendered neither.

**Two things the run taught, both already-known lessons paid for again.**

*The viewport decides which presentation of the anchors exists.* The `chromium`
project runs at desktop width, where G-9 hides the tab bar and the rail carries
the anchors — and `toHaveText` does not require visibility, so the first two
assertions passed against an element `display: none` while the click on the
same element hung for the full 60 s budget. The case pins a mobile viewport and
opens with `toBeVisible()`, so the thing asserted is the thing on screen.

*Overlay dismissal is part of the interaction.* `ion-select-popover` goes hidden
a frame before Ionic tears down the popover host and its backdrop, and until it
does, nothing behind them is clickable. Waiting on the inner element was not
enough; the wait is on the host's absence, which is a state the app reaches by
itself.

Mutation-proved: with `nav.trips` set to `Trips` in the German catalogue the
case fails on the rendered label, twice, including the retry.

**One surface stays out of e2e reach, and is covered instead** (2026-08-22):
the avatar crop modal (FR-17.13) opens only after the browser's own file
picker, which Playwright cannot drive through the app. Its shell — placement,
the canvas crop, the object-URL release on both exits, and its four catalogue
labels — is pinned in
[`src/components/settings/__tests__/AvatarCropModal.spec.ts`](../client/src/components/settings/__tests__/AvatarCropModal.spec.ts).
Named here rather than left silent: the ledger's job is to say what *is not*
covered by a run as much as what is.

## M22 — a trip's properties and its travellers (`e2e/trip-properties.spec.ts`, 2026-08-21)

Four cases, Local Mode, landed with the M22 screen (FR-2.7). The whole
consequence rule runs client-side (invariant 4), so a broken rule shows up here
rather than behind a round trip.

**E2E-M22-03 is the case this file exists for, and it was green for the wrong
reason three times.** Each version is worth knowing, because each mistake is
available to the next screen that owns sibling rows:

1. *Count plus surviving name.* An over-broad removal detaches every row of the
   position, and the FR-27.4 refresh then re-resolves and **generates the
   sibling's row again** — same name, same count, different row, and everything
   done to it gone. The mutation (detach by position instead of by traveller)
   left the case green.
2. *Pack the sibling to prove identity.* A fully packed row leaves the list
   through the FR-25.2 pack-out, so the signal walked off screen. The seeded
   position now carries **quantity 2** and the row is packed **once**: a
   part-packed row keeps its place, and its `1/2` is what has to survive.
3. *Navigate straight after confirming.* `page.goto` outran the removal and the
   case failed against correct code. It now waits on the roster losing the row
   — rendered, settled state.

Two smaller traps, both costing a run each. A template position is
**trip-global by default**, so a per-person case has to set the assignment in
M8 or it silently tests one unassigned row. And a traveller row is addressed by
its **name** through a `data-testid`, because Ionic sets an input's value as a
property rather than an attribute — `input[value="Zoe"]` never matches.

E2E-M22-04 asserts an absence (removal is refused on a started trip), so it
leans on the positive signals the screen renders anyway: the control is present
and `aria-disabled`, and the reason is a visible note.

## Fixed: the losing-offline-edit case was never flaky (2026-08-22)

`a losing offline edit converges and lands in the conflict log` was recorded
here on 2026-08-21 as flaky — failing its first attempt, passing on the retry,
measured on `main` as well as on the branch that reported it. CI stayed green
only because the retry saved it.

**It was not flaky; it was deterministic, and the retry hid that.** Run with
`--retries=0` it fails on *every* attempt, three out of three. The retry
passed because the first attempt had meanwhile warmed the master partition of
the run's shared database — the second attempt was answering a question the
first had already paid for.

The cause was the one guessed here a day earlier, and the note stands: a page
booted straight at a trip URL loads only the **trip** partition, while M2's
list comes from the **master** one, and with no reconnect drain (Track C) a
master pull that had not landed before the context went offline may never
land at all. `reopenTrip` then searched an empty list and reported the
absence as a sync failure.

The repair is a precondition rather than a change to what the case proves:
`warmTripList` walks the second page through M2 **while it is still online**
and asserts the rendered trip row. The two repairs rejected a day earlier are
still rejected — re-entering by `goto` would demonstrate the durable outbox
instead of the drain-on-trip-open, and re-entering by history broke the
sibling case that shares the helper. Proved both directions: 3/3 red without
the call, 3/3 green with it, `--retries=0` throughout.

**The lesson is about `retries: 1`, not about this case.** A retry cannot tell
a racing test from a broken one, and against a suite whose database outlives
the run it actively manufactures green: the retry is a *second* attempt
against state the first attempt created. Any case that reads shared master
state after going offline should establish it while online rather than trust
the run's history.

## M8/M4 — the composer's chip rows (2026-08-21)

E2E-M8-21 in `template-editor.spec.ts` and E2E-M4-46 in
`packing-list.spec.ts`, written with FR-25.13c. E2E-M8-13's focus assertion
turned around in the same change: the FAB expands the composer but no longer
focuses it, and the case asserts `not.toBeFocused()` *after* the confirm
button has rendered — by then the old `open()`'s awaited focus would have
landed, so the unfixed build fails there instead of racing past.

What each case is actually for:

1. **E2E-M8-21 owns the shared behaviour** — the related row headed by the
   contributing tag, the recents trail crossing scopes, a chip landing an
   FR-25.7 Standard row. Every "not offered" claim rides a positive signal in
   the same row: the chosen Zahnbürste's absence is asserted beside the
   rendered Shampoo chip, and the emptied chip area beside the two rows it
   just produced.
2. **E2E-M4-46 owns only M4's wiring** — the trip passing its contents into
   `excludeItemIds` at all. The shared component cannot see a dropped prop,
   so its own suite stays green through exactly the defect this case exists
   for. The positive signal for the absent suggestion is the free-text hint,
   which renders precisely when nothing is offered.
3. **Tagged inventory comes through M10's own path** (`createTaggedItem`,
   local to the spec): the name-only helper other specs use cannot produce a
   primary tag, and the related row keys on nothing else.

Mutation-proved: restoring the focus in `open()` plus forcing the chip rows
off reddens E2E-M8-07/13/12 and E2E-M8-21; dropping the `exclude-item-ids`
prop in M4 reddens E2E-M4-46.

## M8/M4/M6 — the inventory browse-sheet (2026-08-22)

E2E-M8-22 in `template-editor.spec.ts`, E2E-M4-47 in `packing-list.spec.ts`
and E2E-M6-21 in the new `shopping.spec.ts`, written with FR-25.13d. The
division of labour repeats the FR-25.13c split: **M8-22 owns the shared
sheet's behaviour** (tag axis on *any* tag, the run with rows flipping to
„schon drin" in place, the input-free sheet whose free-text line hands back
to the composer's field), the sheet's own rules beyond that live in
`InventoryBrowseSheet.spec.ts`, and **M4-47 and M6-21 own only the wiring**
— the trip's contents reaching the sheet as the carried state, which no
shared-component test can see dropped. M6-21 is the *first* M6 e2e case at
all; its file header says why it pins wiring and nothing more.

One trap paid for here: the free-text line first called the composer's
focus directly after flipping `is-open` off, and lost — Ionic's modal
teardown restores focus after dismissal, so the assertion found the field
`inactive`. The fix is a seam, not a wait: the focus now runs in the
modal's own `didDismiss` handler, gated by a pending flag, so the test
asserts settled state instead of racing the teardown.

Mutation-proved: forcing the carried branch off (`v-if="false"`) reddens
all three cases; dropping M6's `exclude-item-ids` prop reddens E2E-M6-21.

## FR-27.15 — the fold suggestion (2026-08-22)

E2E-M8-23 is **two tests in `template-editor.spec.ts`** sharing one world
(two groups plus a Vorlage carrying all three items), rather than one walk
covering the spec's whole sentence. The split is not cosmetic: the
dismissal half needs a reload and a *changed group*, and appending those to
the fold walk pushed it past the budget on WebKit — the same reason
E2E-M8-15 carries `test.slow()`.

Two things the case pins that the screen alone would not show:

- **The fold is proved by the resolution count, not by the rows.** Before
  the tap the footer states N; after it, the same N. Asserting only "the
  positions are gone and the group is there" would stay green against a
  fold that silently dropped or duplicated an item, which is the one
  failure this feature could plausibly have.
- **The guards need a positive signal beside them.** "No row for *Solo*"
  is an absence; it is only evidence because the *Erste Hilfe* row is
  asserted visible in the same frame, which proves the detector ran.

Mutation-proved both halves, rebuilding between runs: `GROUP_MATCH_MIN_POSITIONS`
2→1 reddens the one-item guard clause, and dropping `removeTemplateInclude`
from the undo handler reddens the restore.

One trap paid for here: closing the FR-27.12 peek with `Escape` and then
asserting `ion-modal.show-modal` is gone passed *before the sheet had
finished presenting*, and the still-live overlay swallowed the next tap on
WebKit. The sheet's own close button plus the same assertion is
deterministic. `page.locator('ion-modal')` is not the fix — five of them
sit in the DOM permanently; only `.show-modal` marks a presented one.

## §3.28 — the item mark (`e2e/item-mark.spec.ts`, 2026-08-22)

Six cases in one file, plus E2E-M8-18 in `template-editor.spec.ts` because
the group's mark is set in M8 and the walk needs M8's world anyway.

Three things the first red run taught, none of which is visible in the
source:

- **The picker's search is a plain `<input>`, not an Ionic field.** The
  shared `fillIonic` helper waits for `hydrated`, which never arrives on
  it, and the failure reads as a timeout on a control that is plainly on
  screen. Anything not built out of `ion-input` gets `fill()` directly.
- **`page.accessibility` is gone from the current Playwright API.** The
  seam for "the mark is out of the accessibility tree" is
  `locator.ariaSnapshot()`, and asserting on that is also more readable
  than a JSON blob.
- **An empty box with a width and no height is `hidden`.** E2E-G15-01's
  promise is that the empty slot *holds the column*, and the slot only had
  a width — so Playwright correctly refused to call it visible. The fix is
  in the production component (the slot sets both), which is the right
  place: a slot with no height was not holding anything.

**E2E-M8-18 paid for itself twice.** M3 step 3 has *two* pickable columns —
Ferien-Vorlagen and Gruppen — and the mark had been added to the first one
only. Nothing in the diff says so, the screen renders correctly for a
Vorlage, and the case is what named it. It also caught its own bad locator on
the way: a Vorlage's M7 row lists the groups it contains in its own subtitle
(FR-27.1), so `filter({ hasText: 'Camping Basis' })` matched the Vorlage
rather than the group as soon as one existed. The row helper filters on the
row's *heading*, and the walk asserts the M7 surface before creating the
Vorlage that would shadow it.

The case also carries a **reload** between the third and fourth surface. That
was added while diagnosing the above — a mark is master data, and Local Mode
rebuilds its whole store from IndexedDB on every navigation, so "it renders"
and "it is still there" are two claims.

And one that is about the feature rather than the harness:

- **M4's composer has two paths and only one of them can inherit a mark.**
  The suggestion carries `source_item_id`; the free-text confirm creates an
  ad-hoc row by design (FR-28.7). The first draft added *Zelt* by free text
  and asserted its mark — a correct failure. Both paths are now in the
  case, because "this row shows no mark" only means something beside a row
  that shows one.

## E2E-G3-01 (partial) + E2E-G3-03 — the lock goes one tap deeper (2026-08-22)

Backlog item 14(d). G-3 promises two things a padlock on M4's row was not
delivering: that a locked row **names its holder**, and that it is
"non-interactive for others except viewing". `ItemDetailSheet` had no lock
awareness at all, so the row that could not be packed from the list was
fully editable from the sheet one tap below it — and that is the worse of
the two, because the sheet *accepted* the edit and the other device simply
lost it at the next merge. No screen ever named the holder either, which is
the one question a padlock raises.

**What the new case in `single/server-sync.spec.ts` actually proves.** Both
contexts there are the same Single-User identity, so it does not prove
*whose* name is rendered. It proves the mechanism, which is the half that
was broken: device B never claimed the row, so B's client treats the claim
as foreign exactly as it would a second account's — the row carries the
holder line, the sheet carries the banner, its packing/skip/note/prep
controls are absent and *Details* is disabled, while name, quantity and
state stay readable. The holder's own sheet is asserted **untouched** in
the same case, because "locked for everyone including me" is the obvious
wrong fix and nothing else would catch it. The identity half stays with
E2E-G3-01 on the mock-IdP `server` project that does not exist yet.

**Proven able to fail.** The suite runs against `dist`, so a source-only
mutation proves nothing (the M10 lesson). Making `lockHolder` return `null`
unconditionally and rebuilding reddens the case at the row's holder line —
8 passed, 1 failed — and restoring it turns it green again. One trap on the
way: the first mutation was `if (true) return null`, which makes TypeScript
treat the rest of the function as unreachable, drop its narrowing, and fail
`vue-tsc` before a bundle is ever built. A mutation has to keep the build
honest to be worth anything.

**Why the whole sheet, not the packing block.** G-3's words are "except
viewing", and a mode where the quantity is frozen but the container is not
is a third state with no mental model behind it. The cost is real and
accepted: a note cannot be left on a row while somebody packs it. Each
write path is guarded in the handler *as well as* disabled in the template
— a control that flips back on its own is worse than one that never moved,
and the guard is what a vitest case can assert without depending on how
Ionic renders a disabled toggle.

**The 15 minutes stopped being a client constant.** Sync-API §7 had decided
the staleness window is "configurable via an environment variable"; the only
place it existed was `LOCK_TIMEOUT_MS` in the orchestrator.
`JITPACK_LOCK_TIMEOUT` now names it and `GET /api/v1/config` serves it. The
vitest case for it is written so it can only pass if the served value
arrived: the row is five minutes old — stale under the test's 60-second
window, fresh under the built-in default — so a client that ignored the
answer would keep the row locked and fail.

**What was checked and deliberately not built.** The backlog item also said
"the server neither expires a lock nor refuses a push for one". §7 does not
promise either: it makes locks advisory, persisted as ordinary
`packing_now` mutations, ignored by *clients* past the window. Server-side
refusal would be a different concurrency model, not a bug fix — it would put
a permanent 4xx in front of an offline device that packed a row somebody
claimed after it went offline, which is the outbox-wedge shape PR #156 had
just removed. That is an owner decision, and it is left as one.

## E2E-G3-02 — the half of a takeover that a single identity can prove (2026-08-24)

FR-5.7 removed the staleness window, so the case that used to advance the
clock past `JITPACK_LOCK_TIMEOUT` had nothing left to assert. What replaced
the window is the takeover, and **the takeover cannot be driven here at all**.

The reason is not a missing fixture. The `single` project's two browser
contexts are the same Single-User identity — that is exactly the trick
E2E-G3-03 relies on, since B never claimed the row and therefore treats the
claim as foreign. A takeover is different: it asks the *server* who holds the
row, and the server sees one user on both sides. `TakeOverClaim` refuses a
takeover of one's own claim, correctly, so the case would assert a 409.
Seeding a token changes nothing — the backend stamps its single user either
way.

So the case asserts the promise that *is* reachable and is a requirement in
its own right: **where there is no second account, a claimed row offers no
action at all** (G-8 — absent, not shown and then refused). Its positive
signal is the lock note on B's row, so "no action sheet" means the mode gate
rather than a row that never arrived or was never claimed.

The rest of E2E-G3-02 is owed by the future mock-IdP `server` project, beside
E2E-G3-01's identity half, which has been waiting at the same wall since
2026-08-22. Until then the takeover's mechanism is covered by Go API tests
(the claim moves, the holder is notified, each refusal answers its own code)
and by orchestrator units (nothing is written optimistically, a refusal leaves
the claim where it was) — and the *screen* is covered by neither. Saying so
here is the point of this ledger.

## The `server` project — two accounts, and what one identity was hiding (2026-08-24)

MVP-plan Track B step 2. The harness is ADR-029: a mock IdP fixture, a
second `jitpackd` in OIDC mode, a second `vite preview` in front of it, and
two browser contexts that log in as *different people* through the app's own
login page. Three cases land with it, and each of them asserts something no
`local` or `single` case can express.

**What it caught on its first green run — and this is the reason the
project exists.** The takeover case failed on Alice's screen: Bob took her
row over, her toast said *„Bob took „Trockenanzug" over from you"*, and her
row went on saying *„You are packing this — the others cannot change it"*.
The notification and the row disagreed, and the row was still fully
interactive, so both of them could pack the same thing — the exact failure
FR-5.3 exists to prevent.

The cause is that a claim is a *device* flag. `myLocks` has to be, because
Local and Single-User Mode have no second account to compare against, and
`lockHolder` returned `null` for anything in that set unconditionally. So
the one event that moves a claim to somebody else had no way to revoke it,
and the WS handler made it worse by ignoring `item.locked` outright for rows
in `myLocks`. A claim now stops being this device's when the holder the
server names is a *different account* — identity taken from the session
token's subject, which is `null` in exactly the two modes where the device
rule must stand alone. Two traps on the way:

- **The optimistic claim writes `current-user`.** The first fix read that
  placeholder as a foreign account and revoked every claim the instant it
  was made — one vitest case went red immediately, which is the only reason
  it did not ship as "the row never says it is mine".
- **`getToken` is async in the running app** (`refresher.freshToken()`),
  so it cannot answer a question a render asks. The identity comes from the
  stored session instead, behind an injectable seam, which is also what
  lets the unit cases name an account without a token.

**Proven able to fail**, both directions. Before the fix the takeover case
failed on the assertion above; after it, all three pass in 27 s. And with
`displayNameClaim` mutated so the IdP's name never reaches the app, **all
three** go red — which is the point of the project: every one of them
depends on an identity that came through the login, not on anything the
client invented.

**What this unit deliberately does not cover**, so the green does not read
as more than it is:

- **Presence (G-10)** — `server`-only and still unwritten. *(Delegation,
  E2E-FLOW-02, was in this list until 2026-08-25; see the section below.)*
- **The `lock_events` record** ADR-028 writes: asserted by Go tests, not by
  the screen.
- **The M2 Share entry is asserted as present in the DOM, not as visible** —
  it lives behind Ionic's slide gesture, which no case in this suite drives.
  What that assertion proves is the `collaborative` gate (G-8's positive
  half), and nothing about the gesture.
- **The admin surface (M20)** — the mock IdP's `alice` is the instance
  admin and `JITPACK_ADMIN_EMAILS` names her, so the subject exists; the
  cases do not.
- **A real provider.** ADR-029 accepts this outright: an Authelia-specific
  defect still ships green, and Track H's deployment is where it gets paid.
  **Half of that bill is now mechanical** (2026-08-30) — see the section at
  the end of this file — and the half that is not has a written procedure
  instead of an intention.

## FR-9.3/9.4 — the closing pass, and what its cases had to be careful about (2026-08-24)

Five new cases in `closing-pass.spec.ts` (E2E-M4-51 … 55) and one rewritten
M14 case. Three things are worth keeping, because each of them made a first
draft green against the unfixed build.

**E2E-M14-05 asserted the defect.** Its last line read „the empty state does
not take over a list that has decided rows" — which is exactly the behaviour
FR-9.4 removes. The case was written when the empty state could only be
reached by dismissing every proposal for good, and it pinned that as the
promise. A test that encodes the shape of a defect is not neutral about the
fix: it makes the fix look like a regression. Renaming the assertion was the
whole of the work, but finding it was not — it was found by running the suite,
not by reading it.

**„Nothing happened" needed a positive control, and the control needed the
right moment.** E2E-M4-55 asserts that press-and-hold is inert inside the
pass. On its own that is true of a list that never rendered, of a row that was
never added and of a broken gesture — so the case opens the menu on the *same
row* one moment earlier and closes it again. The first draft did that *after*
packing the row, and it failed: a packed row leaves the list (FR-25.2), so the
control was asserting against a row that was not there. The order matters as
much as the control does.

**A mark is read back off the row, never off the control that made it.**
E2E-M4-54's first draft asserted the pass toggle's own `aria-pressed`, which a
control with purely internal state would satisfy without a single write. It now
navigates back to the trip afterwards, reveals the packed rows and reads the
mark from the row — which is the same place the M14 assistant reads it.

*(The earlier draft of the pass used an `IonCheckbox` for the row's toggle. It
was replaced for two reasons found by rendering it: a checkbox is M4's *packed*
idiom sitting beside rows that say „packed · today", and Ionic's checkbox
keeps its own checked state, which drifted from the row on the very first tap.
The control now renders straight off `flag_unused`.)*

**E2E-M18-10 — the same file, twice, added 2026-08-24.** A restore is what you
run when you are not sure the last one worked, so running it again is the
normal case and not the odd one. Until ADR-030 the second run built a second
copy of every trip, silently, with the first still on screen — and a second
copy of every Ferien-Vorlage under a `(import)` suffix, which is why the case
carries all three document kinds rather than only the trip.

Three things worth keeping from writing it:

- **The assertion is `toHaveCount(1)`, not "no second row".** A case that only
  checked for the absence of a duplicate would be equally green against a
  restore that deleted the trip it already had — the exact failure the rule is
  supposed to make impossible.
- **The chip and the rule are two call sites, and both are asserted.** The
  restore list answers the question before the button is pressed (`findTripByIdentity`
  read straight from the trip store), and the import answers it again while
  writing. Mutating the rule reddens the count but *not* the chip, which is
  what tells you they are independent paths rather than one assertion twice.
- **Rebuild between the two mutation runs.** The suite drives `dist`; the first
  attempt at the red proof ran `npm run build-only` from the wrong directory,
  the build failed, and the "mutated" run passed against the old bundle — the
  trap already written down for e2e work, walked into again.

**E2E-M18-11 — the other branch of the same screen, added 2026-08-25.** Found by
this PR's own review rather than while building: M18-10 covers the restore
list, and M18 has a *second* branch for a file holding one document — the merge
preview, with its own note and its own commit. Both were written and neither
was run.

Two things it settled:

- **The file comes from the app, not from the fixture.** A device with one trip
  and no template backs itself up as exactly one document, which is both the
  branch this case needs and a way to keep the trip's *year* out of the test —
  hand-writing the YAML would have pinned whatever `new Date()` said that day.
- **The suite's app language is English, and the assertion now says so.** The
  first draft matched `/schon vorhanden|already here/i`, which looks
  locale-agnostic and is not: `seed()` pins `jitpack_locale` to `en`, the German
  half could never match, and the English half happened to appear in one
  catalogue string and not the other. It failed for the right reason and the
  alternation was replaced by the exact text.

## E2E-FLOW-02 — delegation, and the control it turned out to need (2026-08-25)

Writing this case is what found that **`packer_user_id` had no writer**. The
server has always fired `notifyDelegation` on a push carrying that column and
Go tests cover it; every client surface *read* it — M4's edge avatar, the
„zuständig war …" stamp, FR-25.20's filter and its reveal bar — and nothing
set it, because it was written once when a row was generated and never again.
So the whole FR-6.2 delegation path was unreachable by using the app, and the
case could not be written until M5 gained the FR-25.19 picker.

Worth keeping, because it generalises: **a case that cannot be written is a
finding about the product, not about the suite.** The two before it followed
the same shape — *unused* had no writer until FR-9.3, and a takeover had no
second identity until ADR-029.

**What the case asserts, deliberately as one chain rather than four units:**
the assignment lands, the toast on the *other* account names the actor and the
item, its *Open* button lands on the **rendered sheet** (never the URL), and
Alice's own list then hides the row and names Bob in the FR-25.20 reveal bar.
Any of those four could pass alone while the chain is broken.

**What it does not cover, so the green is not read as more:** the **OS**
notification. This is the in-app channel — NFR-4.6's universal fallback — and
Web Push needs a browser permission this harness does not grant. The service
worker's own copy of the wording (`client/public/sw.js`) is therefore still
covered by nothing, which is also where backlog item 19's second copy lives.

**E2E-SYNC-01 — a partition bigger than one page, added 2026-08-25.** The
defect it pins was found by *using* the app, not by testing it: after importing
a decade of real trips into the `:3000` instance, a fresh browser said
„Keine archivierten Reisen" with the sync glyph green. The pull took the first
500 changes, ignored `has_more`, and the trips sat behind them in `change_log`.

Three things worth keeping:

- **Every fixture in the suite was under one page**, which is why nothing caught
  it. A test for a paging rule has to build a partition big enough to page, and
  that means pushing rows at the API rather than driving the UI — 520 items
  through M10 would be a different, much slower test about a different thing.
- **The request count is asserted next to the visible row.** Without it the case
  quietly stops proving anything the day `PULL_PAGE_SIZE` grows past the seed:
  one page would still show the row, and the name of the test would be a lie.
- **Persisting the cursor made it worse, and the unit case now says so.**
  Outside Local Mode the pulled rows are not kept either, so a device that
  remembered its read position and not the rows asked for the changes after it,
  got none, and rendered an empty app. Measured while building the fix: "the
  first 500 rows" became "no rows at all".

**E2E-G2-11 — a refusal the user can read, added 2026-08-25.** E2E-G2-05
proved that a refused mutation is *parked*; this one proves the user can find
out **why**. It drives the motivating case end to end against a real
`jitpackd`: a group is built in M7/M8, a trip is generated from it, and the
group is then deleted from M7 — which the server refuses, because FR-9.2 keeps
`trip_items.source_template_id` pointing at it.

It has to run in the `single` project because nothing else produces the
refusal. **The client cannot pre-empt it**: it holds the trip partitions it has
opened, never every trip's, so an M7 pre-check would call the delete safe in
exactly the case that then fails. M7's existing guard is no help either — it
covers a group another *Vorlage* includes (FR-27.6), which the master partition
can see.

Proved by mutation: dropping `Error: string(res.Reason)` from the push
handler's result construction leaves `sync-detail-parked` green with its count
of 1 and makes `sync-detail-parked-reason` not exist — which is precisely the
defect the case was written for, a number where a sentence belongs.

The case ends on a second context that never saw the delete and still finds
the group. That is the positive signal the sheet's sentence is asserted
against, and it is also the divergence itself on record: the deleting device
removed the row optimistically and the server kept it. **Closing that gap —
putting the refused row back on the device that tried to delete it — is
E2E-G2-12 below, built the next day.**


**E2E-G2-12 — the refusal repairs the row, added 2026-08-25 (ADR-031).**
E2E-G2-11 ends at the divergence and records it: the group is gone from the
deleting device and still on the server. That state used to be *permanent* —
the server row had not changed, so its `change_log` entry was already behind
that device's cursor and no pull would ever offer it again. This case drives
the same refusal and asserts the two things that close it: the toast naming
how many changes were undone and why, and the group back in M7's list.

Proved by mutation: with the re-log removed from the store's
`still_referenced` branch (`internal/store/master.go`), the toast is still
green and the row assertion fails — the announcement without the repair, which
is exactly the state before this change.

**The row assertion counts the group's positions, and that is the case's
second finding.** It first read `toBeVisible()` on the group row, which was
green against a repair that put the Vorlage back **empty**: the client mirrors
the server's cascade when it deletes a template, so its positions had gone
optimistically too and re-logging the named row alone did not bring them back.
Only rendering it showed "0 items". The store now re-logs the cascade's rows
as well, and the case asserts `1 item` rather than mere visibility.


**E2E-M6-17 / E2E-M6-22 — what M6 hides is counted, named and reversible,
added 2026-08-25 (FR-25.11j).** Buying a BUY_BEFORE row changes its mode, so
the row leaves *both* tabs: every "it disappeared" assertion here is worth a
positive one beside it, and the bar counting what disappeared is that signal.
M6-17 walks the whole way — bar absent while nothing is bought, `Show 1
bought` after the tap, the revealed row naming where it went, and its checkbox
putting it back on the list it was bought from. M6-22 does the destination
tab, where the mode never changes and `bought_from` is the only thing keeping
the two reveals apart.

Proved by mutation: with the previous check-off restored
(`setMode`/`packComplete`, no record written) the bar never appears and both
cases fail on it, while E2E-M6-21 beside them stays green.

Two traps paid for, both cheap to hit again. **ADR-012 leaves M4 mounted and
*visible* behind M6**, so `visiblePage` resolves to two pages and every shared
testid — the composer's above all — is ambiguous; the cases scope through an
`m6-page` testid instead. And a **segment button swallows a click aimed at its
own `ion-label`**, the same finding `packing-list.spec.ts` already carries: the
tabs got their own testids rather than being reached by text.

## FR-1.6 — a name that is already taken (2026-08-25)

Four tests in the two template units, all `local`, because Local Mode is the
run mode with **no constraint behind the client** — whatever the client fails
to catch there is never caught at all.

| Case | What it drives | File |
|---|---|---|
| E2E-M7-10 | the create sheet names the scope holding the name, disables *Anlegen* and *Öffnen* navigates to that row; a free name still writes | `template-list.spec.ts` |
| E2E-M7-10 | the rename alert refuses, keeps the typed name, and the row keeps its own | `template-list.spec.ts` |
| E2E-M8-24 | *„Neue Gruppe anlegen…"* includes the group that already holds the name; a Vorlage holding it is reported as the different thing it is | `template-editor.spec.ts` |
| E2E-M8-24 | M8's own name field refuses a rename and the field goes back to the stored name | `template-editor.spec.ts` |

Three things worth carrying forward:

- **Every refusal is paired with the same field doing the write.** "Nothing was
  created" is equally true of a button that does nothing, so each test ends by
  putting a free name into the same control and asserting the row it produces.
- **`toBeDisabled()` is wrong on an `ion-button`.** The host carries
  `aria-disabled`; the native attribute sits on its shadow child, and
  Playwright reads the host. The first draft of E2E-M7-10 failed against a
  button whose own DOM dump in the error said `disabled`.
- **"Exactly one Kamera" has to be counted on the row title.** Once the group
  is included, the Vorlage's row *names* it in the `enthält: …` line, so a
  row-level `hasText` filter finds two rows and the assertion fails for the
  reason it was meant to prove.

**Still owed and not covered here:** FR-13.1's half — M3's *neue Serie* note
and M16's rename — has unit coverage
(`composables/__tests__/nameCollision.spec.ts`) but no Playwright case. It
belongs with the M16 unit, which does not exist yet.

## The refusal lost its only UI path (2026-08-25)

E2E-G2-11 and E2E-G2-12 were written around `still_referenced`: the user
deletes a group a trip generated from, the server refuses, and the client
first learns to *say* so (Sync-API §5) and then to *undo* it (ADR-031). Both
drove that through M7's delete, because it was the only place in the app where
a refusal could be produced on purpose.

FR-24.3 took that place away. A master item or Vorlage is now retired instead
of refused, and the other entities the refusal still governs are unreachable:
a series has no delete control at all, and container and traveler deletes
unassign their rows first, precisely so the refusal never happens. **There is
no UI path to a refusal any more.**

Both cases were therefore retargeted onto the behaviour the same tap now
produces — the retire being accepted with nothing parked, and the trip keeping
its rows on a device that never saw the delete. What they used to prove is
asserted where it is still reachable, and is named here so it is not mistaken
for lost:

- the server's re-log of a refused row and its children —
  `internal/store/rejection_repair_test.go` (on a series);
- the reason reaching the wire — `internal/api/rejection_reason_test.go`;
- the client's toast, its parked count and reason, and the repaired row
  replacing the optimistic one — `client/src/composables/__tests__/rejectionRepair.spec.ts`
  and `durableOutbox.spec.ts`.

If a UI path to a refusal ever returns — a series delete control is the likely
one — it should carry an e2e case again, because the client half of that path
is the half these two were written to protect.

## The restore's hard case is the one only a rendered test could show (2026-08-25)

M23's three cases are the way back from a retire, and the middle one is the
reason the file exists. Retiring frees the name (the unique indexes are
partial over the active rows), so the sequence *retire → someone re-creates
the name → restore* is ordinary, and the restore then cannot have its old
name back. The unit tests state that rule in both places it runs; what they
cannot see is **when** the user meets it. A restore that is enqueued and
refused by the push looks, on screen, like a row that comes back and then
vanishes again a drain later — ADR-031's repair doing exactly its job. Only a
rendered case distinguishes that from the refusal arriving *before* the tap
takes effect, which is what E2E-M23-02 asserts by finding the row still on
M23 behind the alert.

Two traps were paid for while writing these, both worth keeping:

- **A `page.goto` after a Local Mode write reloads before the write lands.**
  The first run restored a row and then found the inventory without it,
  because the assertion that settled the *optimistic* state (the row leaving
  M23) says nothing about IndexedDB. Every reload here now waits for the
  sync indicator to read `local` first, the seam that exists for this.
- **An `ion-alert` input does not reliably take `pressSequentially`.** The
  first run typed "Kamera (alt)" and restored a row named **"K"** — and every
  count in the case was still satisfied by it, because one row is one row.
  The input's value is asserted before the button is clicked.

putting the refused row back on the device that tried to delete it — is not in
this case and not built**; the refusal is announced, not undone.

**E2E-M2-10 — progress on a trip nobody opened, added 2026-08-25.** The row
summed a partition that was not on the device and printed `0/0 packed`, which
on the family's imported archive meant a decade of finished holidays reported
as untouched (ADR-033).

Two things the run taught, one of them by failing:

- **The second browser context is the assertion.** On the context that built
  the trip the rows are already in the store, so the case would pass against a
  screen that fetches nothing at all. Same reason E2E-M18-05 restores onto a
  fresh device.
- **`scrollIntoViewIfNeeded` is the rule, not a workaround — and only the full
  suite said so.** Run alone, the trip is the only one on the list, sits in the
  first screenful, and the assertion passed without scrolling. Run with the
  suite, the shared master partition has other tests' trips above it, the row
  is below the fold, and ADR-033 deliberately has not fetched it: the summary
  stayed on „Loading items …" for thirty seconds. A case that passes alone and
  fails in company was, that time, telling the truth about the feature.

**E2E-M2-11 — cloning a trip nobody opened, added 2026-08-26.** The same
absence E2E-M2-10 caught on the list reached further on ClonePage: the preview
summed rows that were never pulled and read `0 items, 0 travellers`, and the
button cloned exactly that — an empty trip, silently, with no error anywhere.
`cloneTrip` now refuses while the source's rows are not on the device
(the same "not pulled ≠ empty" guard the group refresh and FR-27.10 already
carry), and the page fetches the partition via `ensureTripData`, shows
„Loading items …" until it lands, and keeps the button locked. The case
asserts on a second context: preview text with the real counts, then the
clone opened with both source rows visible. The component halves (the loading
line, the locked button, the guard's `null`) are unit-tested in
`ClonePage.spec.ts` and `clone.spec.ts`.

## M20 and G-10 — the two areas the `server` project named as owed (2026-08-28)

When the `server` project landed it named three things it had not reached:
delegation, presence and the admin surface. Delegation came with FR-25.19's
control; these are the other two, and both were in the same state — fully
built, fully unit-tested, and carrying **not one `data-testid` between
them**, which is the plainest available statement that no test had ever
rendered either one.

Neither could have been covered anywhere else. Every rule in M20 is a rule
about *another account* — who may be deactivated, whose row says "(you)",
who is refused the overview — and every G-10 assertion needs a second person
on the same trip, which is exactly what `single`'s two contexts cannot be.

**The mock IdP grew a third account, `carol`.** These cases *change* the
account they act on, and one backend serves the whole run with
`admin.spec.ts` and `multi-user.spec.ts` free to land on two workers.
Deactivating `bob` mid-run would have reached sideways into the other unit's
trips. Carol exists to be administered and does nothing else. The one
irreversible action — resetting a display name — is deliberately the last
step of the last test that touches her, because the row is addressed *by*
that name.

### What rendering it found

**G-10 named nobody.** The facepile initialled `PresenceUser.user_id`, and
`users.id` is `lower(hex(randomblob(16)))` — so the faces read as two random
hex characters, different on every run. The component's own comment said
initials "stand in for avatars until user profiles sync to the client",
which had stopped being true: M4 already resolves names for the packing
stamps, and G-10 now takes the same `participants` directory. The case
asserts the initials `AL` and `BO` rather than the faces' presence, because
neither `L` nor `O` is a hex digit — the assertion is red against any build
that initials the id, whichever ids that run happens to mint.

**The group-sync badge could never appear.** This is the one that only a run
could have found, and it did: the case went red on `presence-in-sync` with
everything above it green. `sendCursor` dropped the report when the socket
was not yet open, while `subscribe` beside it queued — and on a cold page
load the HTTP drain regularly returns before the WebSocket handshake
finishes. So the server never learned the device had caught up, `in_sync`
stayed false for everyone, and "everyone has the latest state" was a badge
with no reachable state. The cursor is held and flushed on open now, newest
seq per trip winning: two drains racing to open must not leave the server
told the older of the two. Subscriptions flush first, since only a
subscribed connection is in the presence list the cursor informs.

**A deactivated account was told nothing.** FR-23.3 is enforced per request
in the auth middleware and the Go tests cover it thoroughly — but the
client had no branch on `account_deactivated` at all, and the tokens stay in
`localStorage` looking valid, so nothing expired them. The app went on
booting, every request 403'd, and the screen was indistinguishable from an
offline one. The session now ends on that error code and the screen is the
login again, which is what makes E2E-M20-02's access half assertable on a
rendered page instead of on a status code. It narrows on the **code**, not
the status: a 403 is also how the server refuses a non-admin the M20
endpoints, and logging that person out would have been the worse defect —
E2E-M20-05 stands on Bob's session surviving exactly that.

**And a fourth, found by looking at the screenshot rather than the run.**
M20's provisioning date came from a bare `toLocaleDateString()`, which
follows the *device*: on the suite's de-CH device with the app pinned to
English the overview read `Provisioned 28.8.2026` under English copy. It is
the same defect E2E-G2-01 found on the conflict log on 2026-08-24, in the one
other place the codebase still called `toLocale*` without a locale — the two
were the complete set. It goes through `formatDate()` now, and E2E-M20-01
pins a month abbreviation, which the numeric German form cannot produce.

**And a fifth, raised as an owner call and answered the same day.** An
account that never uploaded an avatar rendered the browser's torn-picture
glyph on M20. The answer needed no design decision, because the design
already existed and was already shipped: `UserAvatar` (FR-25.3) draws a
person as a coloured circle of initials and M4 and M5 have used it for
weeks. M20 had hand-rolled an `<img>` instead — and so, it turned out, had
**M17**, where the `@error` handler hides the element and leaves a 64 px
hole, with the `personCircleOutline` placeholder written for exactly that
case sitting behind `v-if="avatarUrl"`, a condition that is never false. The
placeholder had never rendered in its life.

`UserAvatar` now takes an optional `src` and lays it **over** the initials,
so the letters are the ground rather than a fallback: still loading, absent
and refused all show a person instead of a gap. Both screens use it, and two
hand-rolled circles are gone. The four states (none, present, failed,
re-uploaded) are exhaustive in `UserAvatar.spec.ts` — including the retry on
a changed URL, without which FR-17.13's cache-busting query would leave a
freshly uploaded picture hidden behind the previous failure.

**Both screens are asserted, not one.** The defect was written into two
templates, so one screen keeping the fix says nothing about the other:
E2E-M20-01 pins the circle and the absent picture element on the admin
overview, and E2E-M17-04 pins the same pair on the profile — and, after the
rename it already performed, that the circle is initialled from the *new*
name, so the two halves of the profile cannot drift apart. Both
mutation-proved by putting the bare `<img>` back.

### G-10 was rebuilt rather than completed (2026-08-28)

The review left the per-person sheet standing as an owner call. The owner
asked for it to be solved, and the answer was not to build it.

**The gap was never only the tap.** G-10 had three sub-bullets and all three
diverged: the facepile rendered every present user with no cap and no "+N";
the badge was a labelled chip beside the pile that appeared *only* when
everyone was in sync, with no amber; and nothing opened. A fourth
divergence sat one screen away — UI-Spec M2 asked for the facepile on the
trip rows, two lines after G-10 says presence is meaningless outside a
trip. The spec contradicted itself, and the wire settles it: presence is
broadcast per *subscribed* trip, so M2 would have to subscribe every listed
row to draw circles. That line is deleted.

**What the pattern can say is three fields** — `user_id`, `device_count`,
`in_sync` — and it is exactly what the hover `title` already said. On a
phone there is no hover, and that is the whole of the real gap: when the
badge goes amber the only useful question is *who*, because you turn to that
person. So the state moved onto the faces (an amber ring on whoever is
catching up) and the tap kept only the half a hover cannot give a touch
device — the name, in a line under the pile. The sheet was rejected for
putting that one actionable fact one tap deeper than a pile already on
screen; the device count was dropped outright.

**The badge is a glyph with a bubble, not a labelled chip** (owner,
2026-08-28). The first build spelled *„1 catching up"* out beside the pile;
the app already has a grammar for exactly this — G-2's `SyncIndicator`
carries its queue as a count on the glyph's corner — and a header that
already holds the trip's name has no room for a second sentence. The words
survive as the element's accessible name, so the colour is not the only
thing carrying the state, and `presence-behind-count` is asserted separately
from the name for that reason.

**One decision came from rendering it, not from writing it.** The first
build ringed everyone who *was* caught up, in green. On screen that makes
the ordinary state loud, repeats what the badge beside it says, and leaves
the one person worth noticing marked by an *absence*. Ringing the exception
in amber inverts all three, and it is the vocabulary G-10's own badge
already used.

**Where each half is tested, and why it is not all in one place.** A device
is "behind" only while its reported pull cursor sits below the trip head,
and the client reports one the moment its pull returns — so no Playwright
case can produce a lagging device without racing it, which this project
forbids. E2E-G10-01 therefore owns what a real run can hold still: the pile,
both people named, the badge in sync, the badge's counterpart absent, and
the tap in both directions. Amber, the ordering rule and the overflow are
stated against props in `PresenceFacepile.spec.ts`, and the three states are
in the dev gallery so they can be looked at. The ordering rule earns its own
case: **the "+N" bubble must never hide somebody who is behind**, or the
pile would summarise away the fact it exists to show and the badge would
count a person with no face to point at.

### What is deliberately not covered

- **Amber for a lagging device, end to end.** Producing a genuinely lagging
  device inside one case would mean holding a pull open, which is a seam the
  production code does not have — and inventing one to watch a colour is the
  wrong trade. It is a unit case and a gallery entry instead.
- **E2E-M20-03's avatar half.** *Remove avatar* changes no pixel on M20: the
  row's `img` src is the same URL either way and the served bytes are the
  placeholder before and after. The name half is asserted because it *is*
  rendered; the avatar half stays where it can be stated, in
  `store/admin_test.go`.
- **The two reasons a row offers no Deactivate.** FR-23.3 exempts admins and
  the own row, and this instance has exactly one admin — so the rendered case
  can only assert the row that is both. The split is exhaustive in
  `domain/__tests__/admin.spec.ts`.

**E2E-M2-13/14 — the opening segment, added 2026-08-29 (FR-2.8).** M2 always
opened on *Active*, which for most of the year is the one empty segment: the
family's device greeted „No active trips" while twenty-nine trips sat one tap
away. Three notes from building the cases:

- **Where the walk can be asserted at all is decided by the database.** The
  `single` project shares one jitpackd database for the whole run, so other
  tests' trips are in the list this device shows and no walk *target* is
  predictable there. The targets are `local` cases, on a device whose entire
  trip world the test built; the `single` case asserts only what needs a real
  wire — that nothing is decided before the list arrives — and, afterwards,
  that whatever segment it chose is one holding trips.
- **The held pull is a promise, not a wait.** `page.route` on the master pull
  parks the first one until the test resolves its own promise, so „before the
  list arrives" is a state the test *holds* rather than a window it hopes to
  hit.
- **The visual gate did not see a truncated label.** When the count moved into
  brackets beside the label (owner, 2026-08-29), the German *ARCHIVIERT (29)*
  was cut off at 390 px — and `make visual` passed, because the changed pixels
  stayed under the per-image tolerance. Rewriting the baseline needed
  `--update-snapshots=all -g "trips"`; plain `--update-snapshots` writes only
  over-tolerance diffs and reported nothing to write. Second time this exact
  blindness has cost a finding (see the M2/M4 head-alignment note): a baseline
  answers for a *layout*, and three cut-off words are apparently not one.
- **Only one of the four `local` legs exercises the re-entry.** The other
  three decide on mount, which is a different hook — the tab is left for
  another one and returned to precisely so the `onIonViewWillEnter` half is
  covered, since a rule that only fires on a cold start would pass all three
  of them.

## The avatar upload itself has never been driven

Recorded rather than quietly left, because the ledger's whole point is that a
green `e2e` job is not the same as a verified UI.

**What is covered:** that the picture control is *offered* to an OIDC account
(E2E-M17-05), which is the branch the 2026-08-29 revision changed, and that the
display name stays the provider's (E2E-M17-05b). The gate itself is also driven
as a component test in `SettingsPage.spec.ts`, both assertions
mutation-proven — reverting the flag reddens the picture case, making the name
editable reddens the other.

**What is not:** picking a file, positioning the crop and uploading — the open **E2E-M17-12**, which this revision widens from `single` to both projects. No project
has ever driven `AvatarCropModal.vue`, and the signature is the familiar one —
**the component carries no `data-testid` at all**, the same tell that marked M20
as never-rendered before #242.

**Why it was not added here.** The modal renders the chosen file into a canvas
and the upload waits on that. There is no settled signal to assert against, so
a case today could only wait-and-hope, which the testing rules forbid outright.
The fix belongs in the production code — a completion signal on the modal, the
same seam the G-2 indicator grew for in-flight Local Mode writes — and that is a
change of its own rather than a rider on a one-flag PR.

**E2E-NOTIFY-01 — the notification's language, added 2026-08-29 (NFR-4.12).**
Two things it cost, both of them about a notification being addressed to a
*person* rather than to a page:

- **Two cases on the same account fight over the toast.** Adding a second
  notification case turned E2E-FLOW-02 red: a notification reaches every
  session its recipient has open, so with two workers Bob's other page
  carried a second `ion-toast` and the unfiltered locator became a
  strict-mode violation rather than an assertion. Both cases filter by their
  own item name now, which is what each of them meant in the first place —
  the fix is not serialising the file.
- **The mutation has to go through a build.** The suite drives `dist`, so
  putting `describeNotification` back on its English literal proves nothing
  until `make e2e-server` rebuilds. It does, and then exactly this case
  reddens while the other ten stay green.


## E2E-M4-59 — hiding what is already in (FR-25.13e, 2026-08-29)

The browse-sheet's opt-in switch is otherwise a component-test subject: the
counting, the two "everything is already in" sentences and the persistence are
pinned in `InventoryBrowseSheet.spec.ts`. **Six of its seven cases are proven
red** against a build with the filter disabled; the seventh is the *default off*
case, which asserts the unfiltered sheet and is right to stay green there.

Two of the six only became red on the second pass, and both for the same
reason: they asserted the **tappable** rows, which look identical whether a
carried row is hidden or merely rendered as *„schon drin"*. The list that
separates the two is the carried one, and that is what they assert now. A
count of red cases is worth nothing without knowing which assertion earned
it.

**What only the rendered case can pin** is the rule the whole feature stands on:
with the switch on, a row tapped during the run **stays on screen** and reads
*added*. The obvious implementation — filter the carried set on every render —
passes every "the carried rows are gone" assertion and fails exactly here, with
the row vanishing from under the finger and the next row sliding into the tap
point. So the case asserts the presence of `browse-added-now` after the tap, not
the absence of something, and it also asserts the count line does **not** tick
up, which is the same clock stated twice.

The snapshot is taken in the component's *setup*, not in `onMounted` — found by
the persistence test, which mounted with the switch already on and caught the
first paint rendering the carried rows as freshly added. That makes each
*creation* of the sheet a new pass, and the case's second half asserts exactly
that by re-opening it: the previous run's add is hidden with the rest. The id
is **E2E-M4-59**, not 58 — 58 is claimed by the open FR-25.21 work.

The re-opening half cost one red pipeline before it settled anything: the
edit that added it matched a tail E2E-M4-47 has verbatim, so the block landed
in **both** tests, and a local run filtered to the new id could not see it.
Two shards found it. The lesson is the filter, not the edit — a change to a
shared file is verified by running the neighbours it could have touched.

It also settled a question the first draft got wrong. It was
written assuming `SheetModal` keeps its slot mounted, so `QuickAddItem` keyed
the sheet per opening to force a fresh snapshot. Removing that key left the case
**green**: Ionic destroys the modal's content when it is dismissed, so the
sheet is created afresh anyway. The key was deleted rather than kept as
insurance — and this case is what would catch it if a future Ionic changed its
mind.
## FR-25.21 — the three cases, and the four traps they cost (2026-08-29)

`e2e/membership.spec.ts`, three cases, all three red-proved. **E2E-M5-18** is the
one that owns the feature: mutating `planMembership` to give every member the
same amount reddens it, and nothing else in the suite noticed.

Four things the cases cost, each worth more than the case:

- **Five callers drove a control this PR deleted.** `m5-traveler`, M5's old
  single-select, was driven by `skip-item`, `analytics` and `single/server-sync`
  — three helpers with the same body plus two read-back assertions. `make ci`
  stayed green through all of it, because e2e is not in it. A redirected action
  needs **every** e2e caller, and grep is the only thing that finds them.
- **The bundle is what runs.** `membership-close` existed in the source and the
  case timed out waiting for it: `scripts/e2e.sh` drives `dist`, and the testid
  had been added after the last build. Rebuild between editing production code
  and running a case, always — the same rule a mutation proof needs.
- **A quantity of one has no stepper** (G-6), so `0/1` is text that never
  renders. Asserting the *control* — a checkbox for Mia, a stepper for Andy — is
  both the honest assertion and a stronger one: it shows the amounts differ.
- **An Ionic overlay stays mounted.** `expect(alert).toHaveCount(0)` after a
  cancel never passes; `toBeHidden()` is the assertion. The count reads the
  element, not the state.

And one case shape worth copying: **E2E-M5-19 asserts the cancel**, not only the
confirm. A destructive control that fires on the first tap and one that asks are
indistinguishable from the confirmed path alone. It also asserts the *silent*
half — a traveler whose row carries nothing leaves without a question — and that
half needs the disappearing amount as its positive signal, because "no dialog
appeared" is true of a build where the checkbox does nothing at all.

**What the review pass added, and why it was missing.** Two of the three cases
were written to their own shape rather than to the spec sentence they carry, and
reading the two side by side is what found it:

- **E2E-M5-20 promised that a preparation todo written before the conversion is
  still there afterwards** — and asserted only the summed quantity. That clause
  is not decoration: it is the entire reason ADR-036 chose keep-and-repoint over
  delete-and-recreate, and a collapse that recreated the row would have summed
  the amounts just as correctly. Deleting the content ladder from `survivorOf`
  now reddens M5-20 and nothing else; before, it reddened nothing.
- **E2E-M5-19 described three travelers and asserted two.** Harmless in itself,
  but it is the same defect in a smaller costume — a spec sentence nobody read
  back against the test body.

The general form: **a case id in the UI-Test-Spec is a list of promises, and each
clause has to be findable as an assertion.** The id existing is not the coverage,
and a green case named after the promise is exactly what hides its absence.

## FR-25.6 — one buy row for a per-person item (2026-08-29)

**E2E-M6-05 / E2E-M6-06**, both `local`, in `shopping.spec.ts`. The item is made
per-person the way a person makes one — M5's membership editor, three travelers,
2 / 3 / 1 — and only then looked at from the shop, so the case runs the whole
chain rather than a fixture shaped like its own answer.

**The mode is set before the conversion, on purpose.** The membership fan-out
copies the surviving row's fields onto the rows it creates (ADR-036), so
`buy_before` set once reaches all three; setting it afterwards from M5 would
have set it on **one** instance, and the other two would never have arrived on
M6 at all. That is a property of the product, not of the test: a per-person
item's procurement mode is still a per-row decision, and nothing yet changes it
for the whole cluster in one act.

**What makes M6-06 a real assertion.** "Every instance is settled" cannot be
read off a disappearance: two instances left behind would aggregate into a row
of their own and the list would still show something. The positive signals are
the **empty state** after the tap and the **restored `6×`** after the undo —
under a check-off that settled only the first instance, the first fails and the
second reads `4×`.

Proved by mutation in the unit layer rather than the container: with the
previous `ShoppingPage.vue` restored, four of the five new component cases go
red — the row count, the tab count, the fan-out and the aggregated reveal — and
the fifth, which asserts a *shared* row is left alone with exactly one call,
stays green in both builds. That last one is the guard against an aggregation
that swallows the ordinary case.

## E2E-G3-04 — the lock reaches the cluster, and says whose it is (2026-08-30)

**E2E-G3-04**, `server`, in `server/multi-user.spec.ts`. Alice claims **one**
child row of a per-person item; Bob opens the membership editor from a
**different**, unclaimed child. Both halves are asserted on the way in: M5
itself is *not* locked there (`m5-lock` count 0), so a green run cannot be the
old, row-scoped rule quietly passing.

**The case found a missing surface rather than a broken one.** The rule it
asserts had shipped the day before; what had not was any way to *see* it. Every
other G-3 surface names the holder, and this one could inherit nothing: M5's
banner is absent on the unclaimed row the editor is opened from, and the editor
is a modal *above* M5 in any case, so the banner would be covered even where it
exists. A frozen editor with no sentence is indistinguishable from a broken one
— which is exactly what the positive half of this case is written against.

**Alice releases the row instead of packing it** (FR-5.7). Packing would end the
claim too, but it also removes the row from the list Bob is looking at; the
release leaves everything in place except the claim, so what the assertion
measures afterwards is the lock and nothing else. The recovery is asserted on
the **still-open** sheet, and the write that follows — Leonardo's amount
stepping to 2 — is the positive signal.

**A helper changed shape for it:** `claimRow` now takes a test id rather than an
item name. A per-person item has no `m4-row-<name>` at all — it is a cluster
head with child rows — so the two-argument convenience of the older cases could
not address the row this one has to claim.

## FR-21.9 — the amount finally says what it is in (2026-08-30)

**E2E-M9-09**, `single`, in `single/instance-currency.spec.ts`. The chain is
four links long — the operator's `JITPACK_CURRENCY`, the endpoint, the
client's fetch at boot, `formatValue` — and only a rendered row crosses all
four. A unit test covers the last link and would stay green against a broken
first one.

**Why `single` and not `all`.** Local Mode has no server to ask, so its
amounts stay unit-less; that is the feature's stated cost, not a gap in the
case. The project's backend is started with `JITPACK_CURRENCY=CHF` in
`playwright.config.ts`, which makes the setting ambient for every `single`
case: a screen that renders an amount and drops the currency turns some case
red rather than passing quietly.

**Two clauses, both asserted.** `CHF` proves the label arrived; `129.50`
proves nothing converted it. The second is the one worth having — a currency
feature that quietly rescaled amounts would satisfy the first assertion
perfectly.

**Three Ionic traps, paid in three red runs:**

- A **header action is not inside the router outlet**. `visiblePage(page)`
  scopes to `ion-router-outlet > .ion-page:not(.ion-page-hidden)`, and the one
  app bar (ADR-011) lives outside it, so `m9-properties` is reached unscoped.
- **Escape does not dismiss an Ionic sheet modal.** The case clicks the
  backdrop, which is also what a person does.
- **`toHaveCount(0)` never arrives for a dismissed modal.** The test id sits on
  the `ion-modal` host, which Ionic keeps mounted and only empties, so the
  assertion is `toBeHidden()`.

**The case id was taken.** E2E-M9-08 already belongs to the UX-4 heading-gap
case; this is the second time a fresh id has collided with `main`. Grep the
spec *and* the ledger *and* `client/e2e` before claiming one.
## M6's twenty-two promises, read against the screen (2026-08-30)

Backlog item 6 says a green `e2e` job is not a verified UI, and M6 is where that
gap is widest: **17 of its 22 case ids had no test**, and not one of them was
marked *not implemented* — every one read as a description of built behaviour.
Before writing any of them, all 22 were held against `ShoppingPage.vue` rather
than against the spec. They fall into three heaps, and only the first is a
testing task.

**True and untested (7).** The two tabs with category grouping and their
FR-25.6 counts (M6-01), the check-off that moves a BUY_BEFORE row to *pack* and
a BUY_LOCAL row to *packed* (M6-02), the free-text add landing on the open tab
(M6-03), M4's shopping badge (M6-04), the visible confirm on M6's own template
(M6-16), the suggestion that adopts a master item's category (M6-19), and the
negative half of FR-25.10 — recipients are derived and there is no control to
re-enter them (M6-08).

**Stale wording, corrected in the spec rather than encoded in a test (4).**
Writing these as specified would have pinned behaviour the app deliberately does
not have:

- **M6-11** promised *„the ＋ FAB expands an inline quick-add and focuses it …
  an empty field collapses it on blur"*. M6 has **no FAB** — its composer
  carries its own trigger — the focus was removed by FR-25.13c because the
  keyboard covers the chips, and the blur-collapse by FR-25.13a because it
  reflows the list under the next tap. Three clauses, three deliberate
  reversals, all still standing in the spec.
- **M6-04** promised the M4 *„entry/badge hidden"*. The entry stays: the code
  says why where the count is computed — the destination exists either way and
  G-12's bar has no overflow to hide it in. A test written to the old sentence
  would have demanded that an empty trip cannot reach M6 at all.
- **M6-01**'s separated destination-checklist entries are FR-13.3 standing
  entries, waiting on trip series.
- **M6-15** guards a row colliding with the ＋ FAB. M4's half carries the rule;
  M6 has no FAB for a row to collide with.

**The surface does not exist (8).** M6-07 (a per-row note), M6-09/10/20
(FR-25.12's row sheet with *Zugewiesen an* and *Beschreibung*, and the edit
glyph that opens it), M6-12/13 (FR-25.13a's composer with a description field
and an assignee chip row that carries over), M6-14 (FR-25.11g's filter bar),
M6-18 (FR-25.11k's search). `ShoppingPage.vue` is 304 lines and imports two
components; there is one route, no sheet, no filter, no search. These are
**not a coverage gap** — writing them is building four features — and they are
marked in the UI-Test-Spec as an open owner decision rather than quietly
rewritten.

**What this pass is for, beyond M6.** The count of unwritten ids says nothing
about which of them *should* be written: a third of M6's turned out to describe
a screen nobody built, and two more would have frozen a rule the app had already
reversed on purpose. **Reading the promise against the screen has to come before
reading it against the test** — the id existing means somebody once meant it,
not that anything answers to it.

## The real provider — what a machine checks, and what a person must (2026-08-30)

ADR-029 kept a real Authelia out of the Playwright suite and wrote down the
cost: *„an Authelia-specific defect still ships green"*, to be paid by a
manual pre-release check against the family instance. That check existed as
an intention. This is it, split by what each half can actually establish.

### The mechanical half

`internal/api/realprovider_test.go`, opted into with an issuer:

```bash
JITPACK_REAL_IDP_ISSUER=https://auth.example.com go test ./internal/api/ -run RealProvider -v
```

Four read-only GETs against published metadata — no client secret, no
account, nothing written — so it is safe to point at production, which is
the only place the real answers are. Skipped without the variable, so `make
ci` and the pipeline are untouched: neither can reach a homelab, and a check
that needs the network must never be why a build goes red.

**It runs the shipped resolver, not a second reading of it.** The discovery
case calls `api.FetchDiscovery`, so the issuer-equality rule is asserted by
the code that runs at start-up.

**What it protects, and why each one is worth a case.** A provider does not
refuse an unsupported capability loudly; it grants less, and the failure
surfaces much later wearing a different costume. `offline_access` missing is
a session that stops renewing days after anyone would connect the two. A
missing `name`/`preferred_username` is an account provisioned with a blank
display name. An unpublished `email_verified` is an instance admin who
silently never gets the role, because an unasserted flag reads as false
(FR-23.1). Each failure names that consequence rather than only the gap.

**Falsified, not assumed.** Green against the real instance proves nothing
on its own, so the check was run twice more: against the same issuer with a
trailing slash, which is the trap `docs/authentication.md` names and which
fails with the mismatch printed; and against a locally served copy of the
real document degraded in three places (no `offline_access`, `plain`
instead of `S256`, `claims_supported` cut to `sub` and `email`, a JWKS
holding one non-signing key). Every assertion failed, each naming its
consequence. A conformance check that has never been red is a green light
wired to nothing.

**First run against the family instance** (2026-08-30, `https://auth.1-0.io`):
all four cases pass. The endpoints resolve under `/api/oidc/`, the signing
key is `kid=b4108f-rs256`, and every scope the client asks for is advertised.

### The half that needs a person

These are behind a real user session and no metadata document describes
them. Run them by hand against the family instance before a release, with a
real account:

1. **The login itself** — password page, the second factor Authelia's
   `family_two_factor` policy requires, and any consent screen. The mock IdP
   models none of this: it renders an account chooser and grants
   immediately.
2. **The round trip lands back in the app** — `/auth/callback` on the app's
   origin, the dashboard greeting carrying the display name UserInfo
   supplied. Authelia sets `authorization_response_iss_parameter_supported`,
   so the callback carries an `iss` parameter the mock never sends; what is
   being checked is that it is ignored rather than tripped over.
3. **The session renews** — leave the app open past the access token's
   lifetime, or clear it, and confirm the refresh grant works. This is the
   one `offline_access` buys, and the metadata check only proves it was
   *offered*.
4. **A deactivated account loses access** — the asymmetry the MVP plan
   records (ADR1): marking a user disabled in Authelia blocks new logins
   and **keeps honouring refresh tokens already issued**. Deactivate in
   JIT-Pack, or revoke at Authelia; confirm which one you did and that it
   took effect. This is the single most important item here, because the
   safe-looking action is the one that does nothing.

## M5 — six numbers that each meant two things (2026-08-30)

The third screen through the audit of backlog item 6, after M6 and M4, and
the first whose finding was not about a missing case at all.

**M5's catalogue had two blocks that never met.** Lines 262–277 of the
UI-Test-Spec were the set written for the §3.25 rebuild; 278–286 were the
original v1.0 list, never renumbered. Six ids — `E2E-M5-06`, `-07`, `-09`,
`-10`, `-11`, `-12` — carried one promise in each. The suite implements the
rebuild's meaning of `-09`…`-12`, so **four green tests read as coverage of
four promises nothing asserted**, and §7 pointed FR-3.3, FR-4.3, FR-6.2,
FR-7.3, FR-20.1, FR-20.4 and FR-22.1 at the invisible half.

It was not a slip anybody could have caught by reading a diff. `19d9826`
(2026-08-09) defined `-06` and `-07` twice **inside one commit** — the new
FR-25.14/25.15 entries were appended above the catalogue they duplicated —
and `dd560d4` (2026-08-14) added `-09`…`-12` on top of an existing
`-09`…`-12`. Both diffs are pure additions to a long list.

**Why the shadowed entries are struck in place rather than renumbered.**
Renumbering moves ids that eleven live artefacts already cite in their new
sense — the suite, this ledger, the matrix, four log sections, three commit
messages. And it destroys what the retirement convention exists for: a
reader arriving from an old commit that says "E2E-M5-10" has to land on a
line explaining what happened. The rule applied instead: **a number means
what the suite implements**, the loser is struck through and re-headed
*(v1.0 catalogue, shadowed)*, and only a promise that survives *and* has
nowhere to live gets a fresh number. Two did: `E2E-M5-22` and `E2E-M5-23`.

**It is a gate now.** `scripts/case-id-gate.mjs` fails on any id with more
than one live definition, because nothing about this class is visible to a
reviewer: both offending commits were pure additions to a long bulleted list,
one of them defined the same id twice *inside a single commit*, and every
automatic signal moved the reassuring way — the count of ids with a test rose
each time. Writing the gate immediately found **four more**, `E2E-M3-11`,
`-12`, `-13` and `E2E-M4-32`, all live pairs with two different promises. They
went into the gate as a shrink-only debt register — **and out of it the same
day**, see *The four inherited id collisions* below. The register is gone with
them; the gate carries one rule and no escape hatch.

**Held against the screen, the twelve sorted the way the two earlier audits
did** — four already asserted elsewhere (the G-3 lock banner, the delegation
notification, the master photo, the prep lifecycle), four describing a
screen that had moved on (the *Used by* section, *Buy now*, the per-person
layout, a duplicate of M5-17), one never built (FR-14.1's sparkline, retired
by the owner rather than left owed), and three real remainders.

**The three, and what each cost.**

*E2E-M5-05* — the note that becomes a task. One record, two sections, and
the assertion that carries it is that the row **left** one as it entered the
other: a case looking only for the todo passes against a build that renders
it in both. M4's prep badge is the third reader, which is what makes the
promotion a trip-level fact rather than sheet-local memory.

*E2E-M5-22* — moving an item between containers. E2E-M11-03 had deferred
this to M5 **in writing** ("re-assignment lives in M5's container control,
and belongs to that screen's cases") and nothing followed; `m5-container`
was asserted visible and never once operated. The readback is on M11 and by
weight, because the two cards are the only surface that states where the
thing actually is. Mutating `onContainerChange` to ignore a write onto an
already-assigned row reddens it and leaves E2E-M11-06 green — that case only
ever assigns out of the bucket.

*E2E-M5-23* — the companion offer, which was M5-10's shadowed promise. It is
the one entry that described something **built, visible on screen, and
asserted nowhere**: the section had been in the sheet since the rebuild with
no `data-testid` anywhere in it, which is the same signature the M20 audit
named. Two traps: a free-text quick-add row carries no `source_item_id` and
therefore no dependencies at all, so the world has to be built through the
*suggestion*; and `addItemDependency` defaults to `required`, so reaching
the suggested mode meant giving M10's dependency-mode select an id.

**The finding underneath the collision.** FR-25.15 says the sheet's save
indicator is *„deliberately distinct from G-2 … offline that difference is
the entire story, so the two indicators must not be merged into one"*, and
`SaveIndicator.vue`'s doc comment repeated it. All four sheets carrying it
passed it `syncStatus.state` — G-2's own state. That computed answers
`offline` **before** `syncing`, so a write still open on a device with no
network rendered as *saved*, and a background pull on a device with one
rendered as *saving*. The one case the requirement was written for is the
one it got wrong, and no case had ever caught it because the indicator's own
unit test asserted the consequence as the rule: *"reads every non-syncing
state as settled — offline is a G-2 story, not this one"*. Offline is
precisely this story.

It is now `capturePending`, counting this device's own open writes — the
Local Mode save, and the outbox's append to IndexedDB — and nothing else.
`SaveIndicator` takes a boolean and no longer imports `SyncState`, which is
what had tied the two together.

**Where that is asserted, and where it deliberately is not.** Five cases in
`composables/__tests__/captureState.spec.ts` and three in
`ItemDetailSheet.spec.ts`, all three of which redden when the sheet is
pointed back at `syncStatus.state`. **No e2e claims it**: the ● is transient
by construction, so a browser case could only race it, and the ledger's own
rule says a case that can pass by waiting-and-hoping is worse than no case.
What the e2e does assert is the half that holds still — E2E-M5-11 now checks
that the sheet carries no save control, beside the indicator that stands
instead of one.

**And the rule is pinned at the call sites, not on one screen.** The
indicator is mounted by four sheets and all four carried the same wrong
line, so a behavioural case on M5 would have proved M5 and nothing else —
the §4.0 trap, one rule written into N templates. `saveIndicatorWiring.spec.ts`
scans every file under `client/src` instead: no call site may be handed the
sync state, all must take `capturePending`, and the component itself must not
import `SyncState`. It **counts the call sites before judging them**, because
a source scan whose glob quietly matches nothing passes every assertion it
makes. Proved by rewiring one of the other three sheets — it reddens and
names the file.

**One promise was retired for the reverse reason.** FR-7.3 ends *"Resolution
is restricted to the item's assignee or the trip owner"* — enforced nowhere,
client or server, and contradicting the same FR's own sentence two lines
earlier that todos are visible to every trip member. Struck with the owner's
decision rather than left standing as a rule the app has never followed.

## The four inherited id collisions, read against their screens (2026-08-30)

The M5 audit's gate opened with a debt register of four: `E2E-M3-11`, `-12`,
`-13` and `E2E-M4-32`, each a live pair carrying two unrelated promises. This
is that register emptied. **It is now empty and must stay empty** — a new
collision is a build failure, not a line here.

**In all four the suite carried the *first* meaning**, and the shadowed half
was the v1.0 catalogue's. Three of them turned out to be plain duplicates of
ids that are implemented under their own number: M3-11's date-less trip is
**E2E-M3-15**, M3-12's *Mehr Optionen* fold is **E2E-M3-16**, M3-13's default
travellers are **E2E-M3-14**.

**M3-13 is the one worth remembering, because it nearly went through as a
summary.** Its shadowed text promised three things the live entry states in
one clause — the M17 configuration, the *order*, and that removing a traveller
still works. Only reading E2E-M3-14's **test body** showed all three are
actually asserted there (`names.first()` is Andy; the remove drops the count to
two). A retirement justified by a sentence that merely sounds equivalent is how
a promise gets lost.

**M4-32 did not retire cleanly, and its clauses split three ways.** The
required pull and the co-skip are E2E-M4-40. That *suggested* companions do not
join unasked became covered only on 2026-08-30 — by **E2E-M5-23**, written the
day before this — so for as long as the collision stood, that promise was
genuinely unasserted *and* unreadable as a gap, because the number rendered as
implemented while the suite carried the FR-19.2 cold-open case instead. That is
the collision's cost made concrete rather than argued.

**And the third clause was never built.** *„…pulls its required companions onto
the trip **and reports it**"*: `addRequiredCompanions` returns nothing and no
caller raises a snackbar, so the companion simply appears on the list. FR-20.2's
*skip* does name what it took along — which is what makes the silence on the add
look like an omission rather than a decision. Left as an owner decision with no
case, the same treatment the M2 audit gave its three unkept promises.

**What this pass deliberately did not fix.** Of 300 case ids in the suite, **78
appear only in a comment above a test rather than in its title**. That breaks
id-based traceability in the direction this audit keeps relying on — `git grep`
of an id confirms a gap that reading the suite refutes — but it is a convention
drift across the whole suite, not four defects, and folding it into a
four-entry cleanup would bury it. Recorded here so the next person measuring
coverage by grep knows the number is soft.
