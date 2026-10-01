# M21 — Vorlage aus Reise (new screen, §3.27)

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
