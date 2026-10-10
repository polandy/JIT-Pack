# M30 — Aktivität (who changed what, §3.32)

* **E2E-M30-01** `server` (FR-32.1/32.2) — **implemented** (`server/activity.spec.ts`): Bob packs two things on
  Alice's trip; Alice opens *Activity* from M4's ⋮ and reads one *packed* line for both, *2× packed*, named after Bob
  (the server's stamp, invariant 3) and naming both things, above her own *added* line; the line opens to its two
  parts.
* **E2E-M30-03** `server` (FR-32.2) — **implemented** (`server/activity.spec.ts`): Bob's vote on Alice's idea is a
  *voted* line under *Ideas*, named after Bob — the planner's own reading of its rows, bound by the composition root;
  without that binding the vote would read as a bare *added* line.
* **E2E-M30-02** `server` (FR-32.3) — **implemented** (`server/activity.spec.ts`): an inventory item Alice creates is an
  *added* line in the inventory's activity Bob opens from M9's ⋮, named after Alice.
* Local Mode offers neither entry (G-8): M4's ⋮ is asserted without it inside E2E-G12-07, on a sheet that demonstrably
  opened; M9's is `ItemInventoryPage.spec.ts`. The same case types both activity URLs and lands on M4 and M9 (UX-21);
  the guard itself is `router/__tests__/serverOnly.spec.ts`.
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
