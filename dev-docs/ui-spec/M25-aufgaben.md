# M25 — Aufgaben (A Trip's Tasks, FR-7.7, FR-7.14) — *built*

* **Purpose:** every task of one trip, in the two phases a trip has. *„Eine Salbe in der Apotheke holen"* is for
  before it; *„am Bahnhof die Zugverbindung abklären"* can only happen during it. The screen exists because the tasks
  outgrew the packing list: they are returned to across a whole trip, and half of them have nothing to do with packing.
* **Where it lives:** the third pill of the trip's view switcher (G-11/FR-21.21), after *Packliste* and *Einkauf*,
  at `/trips/{id}/tasks`. The page head names it *Aufgaben* with the trip's name as its meta (G-9).
* **One list in the data, two windows on it (ADR-071).** This screen shows **all** of a trip's tasks — both a
  preparation declared on a packing row (FR-7.3) and a chore of the trip itself (FR-7.4), which FR-7.6 already made one
  list. M4 shows a *window* of the same list. Nothing is filed twice, which is what gives the phase its meaning: moving
  a task to *Während der Reise* takes it off the packing list.
* **Shaped by a UX review (FR-7.14, which records its seven decisions).** In one line each: what is due now leads in
  its own block; one composer on top with chips, and the FAB; two-line rows with no ✕; one *erledigt* fold per phase;
  a finished packing's *before* at the end, folded; the sheet ordered by how often each act is wanted; the selection's
  bar carries *Erledigt*, *Fällig* and *Löschen*.
* **Elements, top to bottom:**
  * **The *Meine* chip**, off by default — the whole list is the screen's subject. It narrows to the tasks handed to
    the viewer. **Absent where nobody can be named** (Local Mode, Single-User Mode, a trip with no second member,
    G-8): with nobody to hand a task to, every task is everybody's.
  * **The composer** (`TaskComposer`, `m25-composer`, a card) — M6's shape: the field and its ＋, then chips that
    file the task as it is typed. **The phase**: *Vor der Reise* / *Unterwegs*, *Vor der Reise* chosen until the
    trip is **under way** — started, its first day come, or its packing finished (`beforeIsOver`, FR-30.8's rule; an
    undated trip nobody has started keeps both); then the row goes and the field says *„Aufgabe für unterwegs…"*.
    From then on no task is moved into *before* either: the sheet offers a road task no move back, the selection's
    bar no *Vor der Reise*, a drag no drop there. A task already in *before* is still worked and moved out.
    **The tag**: every task tag, and *＋ Tag*, which opens **M6's entry sheet** for a task (one dialog for both
    lists) — *Neue Aufgabe*, the words typed so far, the day chips and the
    tag chooser below, and *Hinzufügen*; the tag chosen there stays chosen in the composer (FR-7.8's „created where it
    is needed"). **The day**: `DueChips`, shown once something is typed — *Heute*, *Morgen*, *Vor Abreise* and
    *Datum…*. The task is written in **one insert** with its phase, tag and day. Phase and tag stay chosen for the next
    task, as M6's tag does — the things for one errand are typed one after another; the day does not.
  * **The *Fällig* block** (`m25-due`), drawn only when something is pressing: every open task that is overdue, due
    today or in the next two days (FR-7.11's *soon*), **from both phases and every tag**, earliest first, as one
    `ListGroup` headed *Fällig* with its count and tinted faintly in the overdue ink. **A task in it leaves its group**
    — listed twice, it would be ticked in one place and still open in the other. Its rows name their tag on the second
    line, since they stand outside their group (an untagged row names nothing: a preparation's chip already says
    where it came from). It is not a drop target:
    what makes a task pressing is its day, not where it was put. A task left open in a closed *before* is history and
    not in it (`domain/taskBoard.ts`).
  * **Two sections**, *Vor der Reise* and *Während der Reise*, each a `SectionHead` whose count is **what stands under
    it** — a task up in the *Fällig* block is not counted twice. Sections are **not** a segment: the two phases of a
    trip are one thing read top to bottom (M6's lists read the same way, FR-30.11). **A phase with no open task
    under its heading** — also when its last open tasks stand in the *Fällig* block — leaves reading order for **one
    line at the end of the screen** (`RestLine`, M6 alike): *„Vor der Reise · nichts offen"*, a
    statement (*„· 2 fällig"* while the block holds some of its tasks); *„· 3 erledigt ›"* once something is done, a
    fold that opens onto the finished tasks directly, with no second *erledigt* fold under it (`m25-before-fold` /
    `m25-during-fold`). Such a phase takes no heading, hint or fold of room above the one still being worked.
  * **Inside each section, the tag groups** (FR-7.8, ADR-072). One heading per task tag that holds something, in the
    tags' own order, then *Aus Packliste* and *Ohne Tag* for what carries none — the heading names where the task came
    from, and both are the same state in the data. **Closing the packing (FR-7.16) tags the trip's own untagged
    tasks with *„Von vor der Abreise"***, the vocabulary's tag of that name, reused or created; a preparation keeps
    *Aus Packliste*, and the undo takes the tag off again (the tag stays in the vocabulary). **An empty heading is
    not drawn**, and is therefore not a drop target. Each group is a drop target carrying its phase *and* its tag, so
    one movement may change both. The groups hold open tasks only.
  * **One *erledigt* fold per phase**, at the section's end (*„N erledigt"*, `trip-todos-resolved`) — not one under
    every tag group, where a *„1 erledigt"* between two headings would read like a heading. Its
    rows name their tag on the second line and can be unticked.
  * **The FAB** (＋, `FAB_ANCHOR.m25`, `m25-fab`), the one M4, M6 and M26 carry: it scrolls to the top and focuses the
    composer's field. Hidden while selecting; the snackbar clears it.
* **A task's line (FR-7.14): two lines at most.** The first is the grip and the words; the second, where there is
  anything to say, is what is known about the task — the **due pill**, the **row it prepares** (the chip leading to
  it) and the **tag** where the row stands outside its group. **The person stands at the row's edge, before the tick**
  (`AssigneeSeat`: the seat in Server Mode, 24 px like an avatar; an avatar alone where the task can no longer be
  handed over), M4's place for it and M6's — so a task with nothing under its words is one line, as tall as a shopping
  row (E2E-M25-18). The tick stands at the row's own edge — the rule M4's packing rows follow. **No ✕ on the
  row**: *done* and *delete* would be same-sized neighbours a finger-width apart; a task is removed from its sheet or
  from a selection. A fact never squeezes the words: they take the row's width. M4's window keeps its compact one-line
  rows.
  * **The grip** (FR-7.8) is M6's own `DragGrip.vue`; it lifts the task at once, and **only the grip does** — a hold
    on the words selects instead (ADR-075). While a task is in the air the group under the pointer says *hier
    ablegen*; the row stays in the list, dimmed (ADR-060), and a chip above the fingertip names the task and the
    group it would land in, *„→ Vor der Reise · Haus"* (G-21, ADR-094), in the shared frame of
    `composables/dragToGroup.css`. The gesture's state is on the page as `data-drag`, always set, and returns to `idle`
    only once the write has landed. A row in the *Fällig* block is lifted into a group the same way.
  * **Put where it belongs (FR-7.17).** Inside the group under the pointer, M6's insert line marks the gap the task
    will land in, and letting go puts it there — in its own group, or in another one it is retagged into. A group a
    task can never go to dims while it is in the air (*Aus Packliste* under a chore of the trip). (E2E-M25-20)
  * **The provenance line is not on the row:** *„erstellt von Andy · heute 14:32"* and
    *„erledigt von Sia · gestern 09:15"* are fact lines in the task's sheet.
  * **The due pill (FR-7.11)**: *Überfällig* in the danger ink on its tint, *Heute* / *Morgen* / *In 2 Tagen* in the
    action ink, a short date (*„Fr., 17.7."*) quiet on the sunken plane further out. It stays visible while
    selecting — when a task is due is part of choosing it. Inside a group the dated open tasks lead, earliest first —
    among the tasks never put in place by hand, which read before the placed ones (FR-7.17).
* **Before the trip, closed (FR-7.12, placed by FR-7.14).** Once the packing is finished, *Vor der Reise* is history,
  and history comes after the work: *Während der Reise* is the first section, and *Vor der Reise* is **one folded line
  at the end** (`m25-before-fold`, the same `RestLine` an empty phase folds to): *„Vor der Reise · N erledigt"*, or *„·
  abgeschlossen"* with nothing done. Unfolded it carries the lock line (*„Die Packliste ist abgeschlossen — hier steht,
  was vor der Reise erledigt wurde."*, `m25-before-locked`) and the phase's groups and fold read-only: ticks disabled,
  no grip, no seat, no drop. The composer has no *Vor der Reise* chip, *„Alle N"* leaves those tasks out, and the sheet
  offers no move back. Reopening the packing on M4 lifts all of it.
* **Several tasks at once (FR-7.8/ADR-075, extended by FR-7.14).** M6's selection, drawn by the same components
  (`useRowSelection`, `SelectBox`, `BulkBar`, and the app bar's G-20 mode): a **hold on a task's words** (500 ms, 8 px),
  a right-click, or the app bar's icon (`m25-select`) enters it. **The icon is `SELECTION_ICON`**
  (`checkmarkDoneOutline`, one constant for every list that selects) — not the *Aufgaben* pill's own ☑, which stands
  directly under it. While selecting, the selection box stands where the grip was, the seat and the tick step aside, a
  tap on the words toggles the row, and the app bar carries ✕, *„N ausgewählt"* and *„Alle N"*; the *Meine* chip stays
  live and the composer stays in place at rest. *„Alle N"* takes every **open** task shown, in both phases and of both
  kinds. The floating bar offers, left to right: **Erledigt** (every selected task ticked off, in the done ink),
  **Fällig** (a sheet of the same day chips, titled for the batch; *Vor Abreise* only where every selected task is for
  before the trip), **Tag** (the task sheet's tag chooser, titled for the batch), **Zuweisen** (the row's person
  picker, headed *„Wer übernimmt N Tasks?"*; only where anybody else is on the trip, FR-30.12), **the other phase** —
  one button per phase the batch would actually move something into, never back into a closed *before* — and
  **Löschen**, only when
  every selected task is the trip's own (a preparation is removed on its row, FR-7.3). Only what changes is written, one
  snackbar undo takes the whole batch back (a deletion is hidden at once and written when the undo lapses, as a single
  one is), and the mode ends with the batch; a batch that changes nothing says so instead. Switching views ends the
  mode. M4's window has no selection.
* **The rows look like M6's.** Each tag group is a `ListGroup` — the heading and drop frame M6's tag
  headings wear — and its rows are full-width list items with M6's separators, the task's words set in the row-name
  role (`ion-label h3`'s size and weight).
* **The task sheet** opens by tapping a task's words, on this screen and on M4's window. **Ordered by how often each
  act is wanted (FR-7.14):**
  * **The head**: the task's words **are its title and are edited in place** (`task-sheet-title-input`, the title
    role, a dashed underline): leaving the field or Enter writes the correction as one act with its own undo; emptied,
    the field returns to the words it had. Any member may reword a task (it is shared work; the author-only rule is a
    note's, FR-7.13). Its phase is the meta.
  * **Erledigt** — the one primary button, in the done ink; the sheet closes with it. On a finished task it is
    *Wieder öffnen*, outlined.
  * **Fällig** (an open task only): `DueChips` — the day in force as its own chip with ✕ (*„Sa., 26.9. ·
    Morgen"*), then *Heute*, *Morgen*, *Vor Abreise* (the day before the trip's start, for a task before the trip,
    when that day is later than tomorrow) and *Datum…*, which opens the app's calendar (`DateField`'s bare shape,
    ADR-035). A picked day is written at once, the sheet stays up, and the undo writes the day the task had before.
  * **Tag** (FR-7.8) — **M6's search-or-create mask** (`TaskTagChooser`, the shape of
    `ShoppingTagChooser`): a search field *„Tags suchen oder anlegen…"*, the chosen tag as a chip with its ✕ (which
    takes it off), the matching tags as chips, a dashed *„… neu anlegen"* chip for a word no tag
    carries, and a summary line — *„Abgelegt unter: X"*, or *„Noch kein Tag — die Aufgabe steht unter „Ohne Tag"."*
    naming the group it stands in (*Aus Packliste* for a preparation). Exactly one: choosing is the act. The batch
    sheet has no summary and offers the *no tag* group as a chip instead, since it has no one tag to ✕.
  * **The phase move** as a secondary, outlined row: *Auf „Während der Reise" schieben* / *Zurück auf „Vor der
    Reise"*.
  * **The facts** on the sunken plane: the row it prepares, who wrote it and when, who finished it and when.
  * ***Aufgabe entfernen*** last, quiet, in the danger ink — the trip's own kind only.
  * A task left open in a closed *before* is read, not worked: no *Erledigt*, no editable words, no day.
* **Every act raises the screen's one snackbar with *Rückgängig*** (FR-25.31): the tick, the add, the removal, the
  assignment, the phase move, the due date, the correction of the words, and each batch. The move's undo writes back
  the phase the task actually had, which for a task written before FR-7.7 is none at all.
* **From an idea (FR-29.13):** entered from an idea's *Aufgabe* chip (`?fromIdea=`), the composer holds *„… buchen"*
  with the day before the idea's as its due day (the day itself where the day before is past; none for an unplanned
  idea) and the phase that day falls in; the task written next names the idea, the one after is the list's own again.
  The parameter leaves the address once answered; `‹` returns to the idea (`meta.acceptsLinkedFrom`). On the task's
  second line the **💡 line** (`IdeaOrigin`, the bulb in `--jp-brand` and the idea's title, small and quiet) names the
  idea it was made from (FR-29.13); a tap opens the idea over M28 (`?idea=`), and nothing is drawn for an idea the
  device does not hold. Its handle: `trip-todo-idea-<body>`.
* **Modes:** all three. Local and Single-User lose the seat, the chip and the *who* of each stamp (G-8) and keep
  everything else — the phases, the move and the moments are client-side rules. **Before the trip partition has
  arrived** the screen shows nothing rather than an empty list (ADR-033).
* **Navigation:** the pill row reaches it from M4 and M6 and back; M4's task section also carries *„Alle Aufgaben"* as
  the way out of its window. M25 has no ⋮: *Gepäck* and *Auswertung* are packing's (G-12).
* ~~**The notes segment (FR-7.9)**~~ — the notes are threads in a view of their own, **M26**, the fourth pill
  (FR-7.13); M25 is one list, with no segment. ~~E2E-M25-10/11~~ moved to E2E-M26-01/03.
