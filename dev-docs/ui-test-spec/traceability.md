# 7. Requirement Traceability Matrix

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
| FR-2.1d | E2E+UNIT | M3-20; `lib/__tests__/dateRange.spec.ts` (`tapDay`), `DateRangeField.spec.ts`, `TripEditPage.spec.ts`, `ClonePage.spec.ts`, `TripWizardPage.spec.ts` |
| FR-2.2 | E2E+UNIT | M3-06, M18-02 + M18-09 (an imported trip carries the status its file names, ADR-024 — the preview branch and the restore branch), FLOW-04 (a group edited between two runs generates differently); instantiate.ts |
| FR-2.3 / 2.3a | E2E+UNIT | M3-06, M8-03; instantiate.ts |
| FR-2.4 | E2E | M3-10, M8-05 (the note's wording, in the FR-27.4 model); the M10 usage count is asserted in M10-14/15 (M10-02 retired — its „delete blocked" half is reversed by FR-24.3) |
| FR-2.5 | E2E | M3-03 |
| FR-2.5b | E2E+UNIT | M3-21 (the preview names what an empty roster cannot place, and one traveller takes the block away); `domain/__tests__/instantiate.spec.ts` (the report, its falsifier and the two filters), `domain/__tests__/groupAdd.spec.ts` + `lib/__tests__/groupAdditionMessage.spec.ts` (FR-27.10's sixth outcome) |
| FR-2.7 | E2E+UNIT | M22-01 (name and dates), M22-02/03/05/11 (the roster's three affordances and what each does to the per-person rows), M22-04/07 (removal ends at departure), M22-08 (a partial edit is still a whole row), M22-10 (an archived trip's editor is read-only throughout **and says so**), M22-12 (the year, corrected and read back through M2); `TripEditPage.spec.ts` (the FR-2.1d date range) and `composables/__tests__/tripProperties.spec.ts` (the mutations). **The year is on the screen** (M22-12, by decision — it has a reader everywhere and would otherwise have a writer only at creation), and the **series** is edited on M16 instead, as PRD FR-2.7's opening paragraph says; M2-34 (reached from M2's row menu) |
| FR-3.1 | E2E | M5-02 (the control), shopping/shopping.spec.ts (the write, `addBuyRowOnM4`) |
| FR-3.2 | E2E | M6-01/04, M4-11 |
| FR-3.3 | E2E | M6-02, M6-17, M6-22, FLOW-03 (M5-09 retired — the buy lives on M6) |
| FR-4.1 | E2E | M3-04 (share on create) |
| FR-4.2 | E2E | M4-24, M4-30 (the record), M5-18, M5-19 (for whom) — M5-01 retired |
| FR-4.3 | E2E | FLOW-02, M4-30, M4-31 (M4-06 and the shadowed M5-07 are both retired) |
| FR-4.4 | E2E | M4-10, FLOW-01, **M1-03** (the delegation reaches the dashboard live, no reload) |
| FR-4.5 | E2E | M2-05, M3-04, TripMembers |
| FR-4.6 | E2E | G10-01, G10-02 (FR-4.6 is the presence indicator; `members.ts`'s role model is FR-4.5/4.7's) |
| FR-4.7 | E2E+UNIT | M3-04 (role select); `TripWizardPage.spec.ts` (a share's role reaches the created trip; a share taken back is offered again) |
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
| FR-7.16 | E2E+UNIT | M4-151 (M2's start asks on M4, finish-and-start under one undo, the carried purchase and task where they land), M4-152 (*Start only*), M6-38 (the carried heading, and a later entry outside it); `closePacking.spec.ts` (`tasksToFileAsCarried`, `carriedTaskTag`), `tripLifecycle.seam.spec.ts` (the carried tag, the stamp and its undo), `list.spec.ts` in `shopping/` (the carried section), `PackingListPage.spec.ts` and `TripListPage.spec.ts` (the start variant), `shopping_entries_test.go` (`carried_over_at` set and cleared) |
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
| FR-13.1 | E2E+UNIT | M2-02 (the grouping it describes is what the screen does, by decision; see E2E-M2-15), M16-01 (name, defaults, **and the rename refusal**), M16-03 (history, detach/attach); `composables/__tests__/nameCollision.spec.ts` (the rule: a taken series name is refused before the mutation — M3's wizard note still has no e2e case, named in `e2e-ledger/`); `TripWizardPage.spec.ts` (the wizard's note names the taken series and holds *Next*) |
| FR-13.2 | E2E | M16-03 (history + attach/detach) and M16-04 (both shortcuts); M3-02 |
| FR-13.3 | E2E+UNIT | M16-02 (**the only test of the checklist editor**, which also guards the field it types into rendering with a width), M3-09 (the wizard's offer, still unwritten), M6-01; `TripWizardPage.spec.ts` (the offer reaches the created trip, and stays behind once unticked) |
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
| FR-21.17 | E2E+UNIT | M4-70 (the head yields with the line and holds at the bottom), M4-129 (a list too short to survive the yield keeps its head), M4-135 (a scroll nobody made moves neither the head nor the rows), M4-150 (a focus ends the gesture, so the scroll it brings leaves the head); `headScroll.spec.ts` (the direction, the jitter, the clamp, the short list, the scroll nobody made, which inputs arm the gesture and which end it) |
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
| G-12 | E2E | G12-01…06 (app-bar placement, two clusters + no overflow, survives collapse, one line, literal icons, nameable glyphs); G12-08 (a held switcher glyph names itself and goes nowhere); G12-09 (the day plan's pill only with both dates, wholly in view where you stand, its back the packing list); G12-07 and M4-57 (a ⋮ holds its own context — none on M6/M25, no trip-wide entries on M4) |
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
| FR-28.8 | E2E | M8-18 (template mark on all four offering surfaces), M8-28 (the fold row and the quick-add card) |
| FR-28.9 | SERVER+UNIT | Go: `capMark` rejects an over-long value and touches nothing else (`itemmark_test.go`); `schema_shape_test.go` pins the column on both tables and on the sync whitelist; merge is ordinary LWW (no special case) |
| FR-28.10 | UNIT | `internal/portable` and `internal/store` round-trip with and without `icon` on all three levels (document, group, item); the client's `domain/portable.ts` and `commitPortableImport` likewise; an export from before the field imports unmarked (FR-18.4 tolerance) |
| FR-28.11 | E2E | M10-11 runs in `local` — the picker, the search and the suggestion work with no server present |
| FR-30.1 | E2E+UNIT | M6-26 (reaches no packing figure), M6-27 (buy, reveal, put back, remove, reload), M6-01/03 (one entry per tab); `shopping/__tests__/ShoppingPage.spec.ts`, `sync.spec.ts` (routing, trip cascade, restart); Go: `shopping_entries_test.go` |
| FR-30.10 | E2E+UNIT | M6-35 (set in the sheet, the pill, the order, a reload, M1's card and Local Mode's hint); `shopping/__tests__/list.spec.ts` (due order, pressing sections first), `ShoppingPage.spec.ts` (pill, sheet), `ShoppingDashboardCard.spec.ts` (pressing lead on card and block), `sync.spec.ts` (the field's writes, the count), `useDueTaskHint.spec.ts`; Go: `TestDueShoppingEntries_*`, `TestPlanShoppingDue_*`, `TestRemindDueTasks_*` |
| FR-30.9 | E2E+UNIT | M6-31 (the entry sheet with name and search-or-create tag, grouped open list, flat reveal with the tag, check-off at the end, reload); `shopping/__tests__/ShoppingPage.spec.ts` (grouping order, chips, sheet, source lines offer none); Go: `shopping_entries_test.go` (push path, per-field merge, 1–40 bound) |
| FR-30.2 | E2E+UNIT | M6-28 (on the list exactly while the mode says so), M6-17/22/05/06 (packing rows through the contract); `composables/__tests__/packingShoppingSource.spec.ts`, `domain/__tests__/buyRows.spec.ts` |
| FR-30.14 | E2E+UNIT | M6-41 (the bought row's *＋ Nochmal*, the purchase kept, *On the list* while open, the toast's undo, a reload); `ShoppingPage.spec.ts` (name and tag carried, day and assignee not; *Vor Ort* once before is over; nothing on a packing line or a closed *before*) |
| FR-31.1–31.3 | E2E+UNIT+SERVER | M27-01 (created with days, from a group, who goes), M27-14 (the days as one range inside the trip's; `DateRangeField.spec.ts` for the bounds), M27-05 (who goes changes), M27-06 (deleted, the packing list untouched); `domain/__tests__/excursions.spec.ts` (participants, time), `excursions.seam.spec.ts`; Go: `excursions_test.go` (push path, cascades) |
| FR-31.4/31.5/31.7 | E2E+UNIT+SERVER | M27-01 (lines borrowed and created), M27-02 (the link shares no tick), M27-03 (a closed suitcase, *nicht im Gepäck*), M27-04/05 (*für alle*); `excursions.spec.ts` (`planLinks`, `planParticipantChange`), `excursions.seam.spec.ts` (undo across both lists, traveller removal); Go: `TestApplyMutation_DeletingATripItemUnlinksItsExcursionLine_FR31_4` |
| FR-31.8 | E2E+UNIT | M27-03 (on M6 under the excursion's name, bought there); `excursionShoppingSource.spec.ts`, `shopping/__tests__/list.spec.ts` (a source's own heading) |
| FR-31.9 | UNIT+SERVER | `workerBody.spec.ts` (body and link), Go: `TestDueExcursions_FR31_9_*`, `TestPlanExcursionDue_FR31_9_*`, `TestRemindDueTasks_*` |
| FR-31.10–31.12 | E2E+UNIT | M27-01 (M4's borrowed line), M27-06 (saved as a group); `excursions.spec.ts` (`arrangeExcursions`, `pendingExcursionCount`, `dueExcursions`, `borrowersByTripItem`, `planGroupFromExcursion`), `excursions.seam.spec.ts` (`saveAsGroup`) |
| FR-31.13 | E2E+UNIT | M27-07 (bought through M6, taken onto the packing list, on M4 and in M9); `excursions.spec.ts` (`canJoinPackingList`, `inventoryItemFor`), `excursions.seam.spec.ts` (`addToPackingList`, its undo) |
| FR-31.14 | E2E+UNIT | M27-09; `excursions.spec.ts` (`planLinks` leaves the line out, `canAdoptIntoInventory`, `planGroupFromExcursion` without unlisted lines), `excursions.seam.spec.ts` (`adoptIntoInventory` and its undo, `unlistedNames`, `saveAsGroup` leaving them out) |
| FR-31.15 | E2E+UNIT | M27-15, M27-16; `excursionTracks.seam.spec.ts` (add, the limit, settings, removal, the excursion's delete), `trackFiles.seam.spec.ts` (the excursion's route and row), `track.spec.ts` (`trackSettingsPatch`), `trackFormat.spec.ts` (`tracksSummary`), `routeFold.spec.ts` (the default by phase, the choice per excursion); Go `TestPutExcursionTrack_*`, `TestExcursionTrack_*`, `TestApplyMutation_ExcursionTrack_SettingsOnly_FR31_15` |
| FR-31.6 (M4's parts) | E2E+UNIT | M27-10 (menu, popover, snackbar undo), M27-11 (search, person filter, fold-all, empty states), M27-12 (`?line=`, back, side panel), M27-13 (browse verbs); `excursions.spec.ts` (`excursionMenuEntries`); M4's own `useHeadScroll` through E2E-M4-70/135/150 |
| FR-31.5/31.6 (the sheet) | E2E+UNIT | M27-08; `excursions.spec.ts` (`planForWhom`, `lineSetOf`), `excursions.seam.spec.ts` (`setForWhom`, its undo) |
| FR-29.1/29.10/29.12 | E2E+UNIT+SERVER | M28-01 (written with link, tag, rain mark), M28-04 (chips); `planner/domain/__tests__/ideas.spec.ts` (`parseLink`, `linkSite`, `ideaBoard`); Go: `TestSchema_IdeaVocabulary_FR29_1`, `TestStampActor_IdeaAuthorIsThePusher_FR29_1` |
| FR-29.2 | E2E+UNIT+SERVER | M28-02 (moved, undone, on the route), M28-05 (deleted when confirmed); `planner/__tests__/sync.spec.ts` (undo not over a later move, the idea's cascade in Local Mode); Go: `TestApplyMutation_DeletingAnIdeaTombstonesItsVotesAndComments_FR29_2` |
| FR-29.3 | E2E+UNIT+SERVER | M28-06 (a named vote, withdrawn), M28-05 (hidden alone, G-8); `ideas.spec.ts` (`voteTally`, `nextVote`), `sync.spec.ts` (one row per person); Go: `TestApplyMutation_OnlyTheVoterMayChangeAVote_FR29_3`, `TestSchema_OneVotePerPersonPerIdea_FR29_3`, `TestStampActor_Vote*` |
| FR-29.4 | E2E+UNIT+SERVER | M28-03; `ideas.spec.ts` (`ideaDiscussion`), `sync.spec.ts` (survives a restart); Go: `TestStampActor_IdeaCommentAuthorIsThePusher_FR29_4` |
| FR-29.5 | E2E+UNIT+SERVER | M28-07 (banner, mosaic, viewer, cover, removal, reload), M28-08 (another member sees it), NFR-SEC-05 (the hash on plain HTTP); `planner/domain/__tests__/pictures.spec.ts` (order, limit, `coverMoves`), `planner/__tests__/sync.spec.ts` (pulled, added, moved, removed, taken with the idea), `composables/sync/__tests__/ideaImages.seam.spec.ts` (both modes); Go: `internal/store/ideaimage_test.go`, `internal/api/ideaimage_test.go` |
| FR-29.16 | E2E+UNIT+SERVER | M28-09 (words as a suggestion confirmed or dismissed, the picture shown coming and following a save); `sync.spec.ts` (a link's picture only to an idea without one), M28-10 (the site suggested as the title, one tap from saving, no read shown in Local Mode); `planner/domain/__tests__/linkFill.spec.ts`, `composables/sync/__tests__/linkPreview.seam.spec.ts` (Local Mode asks nothing, off latches); Go: `internal/linkpreview` (`TestParse_*`, `TestFetch_*`, `TestPublicOnly_FR29_16`), `internal/api/linkpreview_test.go` (members only, refusals, off), `cmd/jitpackd` `TestLoadConfig_LinkPreviews_FR29_16` |
| FR-29.20 | E2E+UNIT+SERVER | M28-18 (a moved point re-routed, the change shown, saved as a variant with its settings), M28-19 (the pass asked for, *End here*, a replacement and its undo), M28-20 (drawn from nothing, the kind's profile, straight with heights, undo and redo, saved), M28-21 (offline locks editing, leaving asks first); `domain/__tests__/route.spec.ts` (handles, legs, passes, arrows, LV95, the GPX written), `lib/__tests__/routing.spec.ts` (the address, BRouter, swisstopo's heights), `lib/__tests__/routeEditor.spec.ts` (history, fallback, aborting); Go: `cmd/jitpackd/config_test.go`, `internal/api/instance_test.go`, `internal/api/options_test.go` |
| FR-29.17 | E2E+UNIT+SERVER | M28-12 (figures, time, kind, child, breaks, reload), M28-13 (another member sees and downloads it; tiles off), M28-14 (several tracks, the source following them, full screen, offline), M28-15 (rename, download, replace, remove, a file with no track); `domain/__tests__/track.spec.ts` (reading GPX, figures, kind, thinning, the line, paces), `planner/__tests__/tracks.spec.ts` (pulled, added, a sixth refused, settings, removed, taken with the idea, Local Mode restart), `composables/sync/__tests__/trackFiles.seam.spec.ts` (both modes), `dev/__tests__/sampleTrip.spec.ts` (the seed's routes), `lib/__tests__/mapTiles.spec.ts` (the switch kept, the connection followed), `lib/__tests__/trackFormat.spec.ts`; Go: `internal/store/track_test.go`, `internal/api/track_test.go`, `cmd/jitpackd/config_test.go` |
| FR-29.19 | E2E+UNIT+SERVER | M28-16 (the own position, refused and allowed, no sharing alone), M28-17 (shared, named, hidden, stopped); `lib/__tests__/liveLocation.spec.ts` (`shouldShare`, `applyLocation`, `freshPeople`), `useLiveLocation.spec.ts`, `liveLocation.seam.spec.ts` (the orchestrator's frames, a dead socket, Local Mode), `TrackLines.spec.ts` (the marks without tiles), `useWebSocket.spec.ts` (said again after a drop); Go: `TestLiveLocation_*`, `TestWS_ALocationReachesTheTripsOtherMemberAndNoStrangersDoes_FR29_19` |
| FR-29.8 | E2E+UNIT+SERVER | M28-11 (each kind on the other's screen, the notice opening the idea); `notifications/__tests__/format.spec.ts`, `workerBody.spec.ts` (wording and link, app and worker alike), `SettingsPage.spec.ts` (three switches); Go: `TestPlanNotifications_Ideas_FR29_8`, `TestNotifications_Ideas_NewCommentedAndShortlisted_FR29_8`, `TestIdeaDiscussion_NamesTheIdeasAuthorThenEveryCommenterOnce_FR29_8` |
| FR-29.6/29.7 | E2E+UNIT | M28-01/02/04, G12-07 (the first pill, the row scrolling at 410 px with the current pill in view); `lib/__tests__/tripViews.spec.ts`, `TripViewNav.spec.ts` |
| FR-29.7 (opening, *Heute*) | E2E+UNIT | M29-10 (where a trip opens), M29-12 (an empty day's errands), M29-11 (M1's *Heute* card); `lib/__tests__/tripOpening.spec.ts` (`openingView`, `isUnderWay`, the last visited view), `router/__tests__/tripOpening.spec.ts` (`openingTarget`), `planner/domain/__tests__/dayPlan.spec.ts` (`linesAhead`, `dayHoldsNothing`, `openingDayHoldsNothing`) |
| FR-29.13 | E2E+UNIT+SERVER | M28-22 (each creator pre-filled, the result naming the idea, back to it, the excursion once), M28-23 (the idea deleted, the task kept), M28-24 (the phone's sheet left for M25 stays left); `planner/domain/__tests__/bridge.spec.ts`, `domain/__tests__/ideaResults.spec.ts`, `composables/__tests__/ideaResultSource.spec.ts`, `ShoppingPage.spec.ts` and `TripTasksPage.spec.ts` (the seed answered once), `router/__tests__/backTarget.spec.ts` (`acceptsLinkedFrom`, `ideaBridgePath`); Go: `TestApplyMutation_IdeaResult_*_FR29_13`, `TestApplyMutation_DeletingAnIdeaKeepsWhatCameOfIt_FR29_13` |
| FR-29.14/29.15 | E2E+UNIT+SERVER | M29-01 (the days, arrival and departure), M29-02 (an entry of its own), M29-03 (planned from the pool and from M28, the tick), M29-04 (an excursion on its days), M29-13 (an idea and its excursion as one line), M29-14/15 (an entry gains, fills from and loses a connection), G12-09 (the pill); `planner/domain/__tests__/dayPlan.spec.ts` (`tripDays`, `openingDay`, `unplannedIdeas`, `ideasOutsideTrip`, `dayLines`, `ideasWithExcursion`), `dayPlanSource.spec.ts`, `sync.spec.ts` (planning, the entry's writes, the trip's cascade); Go: `TestApplyMutation_DayPlan_PlannedIdeaAndOwnEntry_FR29_15`, `TestStampActor_DayEntryAuthorIsThePusher_FR29_15` |
| FR-29.18 (excursion link) | E2E+UNIT+SERVER | M29-13 (a connection added from an excursion's line, labelled with it); M27-17 (the way there and back, the time on the spot, M27's line), M27-18 (the timetable search, seeded from the route), M27-19 (the step on the excursion, the ways on the route's map); M29-16 (from where one is), M29-17 (the map), M29-18 (the step without the search); `planner/domain/__tests__/timetable.spec.ts`, `timetableClient.spec.ts`, `lib/__tests__/timetable.spec.ts`, `cmd/jitpackd/config_test.go` (`JITPACK_TIMETABLE`); `planner/domain/__tests__/dayPlan.spec.ts` (`dayLines`), `journey.spec.ts`, `planner/__tests__/journeyText.spec.ts`, `dayLineText.spec.ts`; Go: `TestApplyMutation_ConnectionExcursion_KeepsItOnTheTripsOwn`, `TestApplyMutation_ConnectionExcursionRole_OutOrBackOnly` |
| FR-29.9 | GATE+UNIT | `module-boundary-gate.mjs`, `domain-purity-gate.mjs`; `sync.spec.ts` (the pull funnel, the trip's cascade) |
| FR-30.3 | GATE+UNIT | `scripts/module-boundary-gate.mjs` (both directions, in `make client`); `sync/__tests__/routing.spec.ts` (a feature table routes to a feature store) |
| FR-30.4 | E2E+UNIT | M6-29 (`single`: the buyer named, read fresh from the server), M6-17/27 (`local`: the time alone); Go: `purchaserecord_test.go` (stamping), `purchaserecord_push_test.go` (through the push); `rowFacts.spec.ts`, `ShoppingPage.spec.ts` |
| FR-30.5 | E2E | M1-12 (the card's way onto M6) |
| FR-30.6 | E2E+UNIT | M6-15 (the ＋ leads to the field, the last row clear of it); `ShoppingPage.spec.ts` |
| FR-30.7 | E2E+UNIT | M1-12 (the list that is now, the planned rule), M1-13 (check off, undo, add; M4/M6 agree); `ShoppingDashboardCard.spec.ts` |
| FR-32.1 | E2E+SERVER | M30-01 (the actor stamped, not claimed); Go: `TestActivity_*` in `internal/store` (what is recorded and what is not, the trip a master row belongs to, the names through a foreign key, the side paths, every table's name sources) and `internal/api` (membership, paging, refusals) |
| FR-32.2 | E2E+UNIT | M30-01 (a run folded and opened), M30-03 (a module's reader bound); `domain/__tests__/activity.spec.ts` (every act, the areas, the folding), the modules' own `activity.spec.ts` and `activityReadersWiring.spec.ts` (every table read by one side), `ActivityLogPage.spec.ts` (Single-User names nobody, the older page, the empty and failed states) |
| FR-33.1/33.2/33.9 | E2E+UNIT+SERVER | M31-01 (the pill, the days, the slots), M31-02 (planned, changed, deleted, eaten out); `meals/domain/__tests__/mealPlan.spec.ts`, `meals/__tests__/sync.spec.ts`; Go: `TestApplyMutation_DeletingAMealTombstonesItsIngredients_FR33_9`, `TestSchema_MealVocabulary_FR33_1`, `TestApplyMutation_IngredientNamesAMealOfItsTrip_FR33_2` |
| FR-33.3 | E2E+UNIT+SERVER | M31-03 (the lines of M6, both ways, *Due* on the day, a past meal), M31-08 (the buyer); `shopping/__tests__/list.spec.ts` (the heading's rank, the day's press), `meals/__tests__/sources.spec.ts`; Go: `TestPush_MealIngredientPurchase_StampsTheBuyer_FR33_3` |
| FR-33.4 | E2E+UNIT | M31-04 (offered, filtered, taken); `mealPlan.spec.ts` (`earlierDishes`, `matchingDishes`) |
| FR-33.5 | E2E+UNIT | M31-05 (at its slot's place, opened over M29); `planner/domain/__tests__/dayPlan.spec.ts` (a meal on the plan), `sources.spec.ts` |
| FR-33.6 | E2E+UNIT+SERVER | M31-06 (taken along, packed, counted, named on M29, left again); `lib/__tests__/excursionExtraLines.spec.ts`, `dayPlanSource.spec.ts`, `sync.spec.ts`; Go: `TestApplyMutation_MealExcursion_KeepsItOnTheTripsOwn_FR33_6` |
| FR-33.7 | E2E+UNIT | M31-07 (the block, opened, the *Heute* card without meals); `dayPlan.spec.ts` (`linesAhead`) |
| FR-33.8 | E2E | M31-08 (a member cooks, on M31 and M29) |
| FR-32.3 | E2E+UNIT+SERVER | M30-02; G12-07 and `ItemInventoryPage.spec.ts` (hidden in Local Mode); Go: `TestActivity_Inventory_FollowsMasterVisibility_FR32_1` |
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
