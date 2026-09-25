# UX review — M25 *Aufgaben* (trip tasks)

**Status:** findings and proposals, nothing decided, nothing built. Written 2026-09-25 after the owner's verdict that
the tasks page is not user-friendly. Rendered from the dev build (Local Mode, seed plus ten added tasks across the
three task tags, four due days, one tick) at 390 × 844 in Nacht and Tag. The screenshots and the proposed mockups
are in the review artifact. This file is the reasoning, ranked by what hurts a user most.

**Not re-opened:** G-20's long-press selection (#598), the due day and its pill (FR-7.11), the two phases (FR-7.7),
the read-only *before* after a closed packing (FR-7.12), one tag per task (FR-7.8). Every proposal below works
around those decisions.

---

## Findings, ranked

### 1. What is due now is scattered across the tag groups

**Seen:** with 14 open tasks, *Briefkasten leeren lassen (Überfällig)* sits second group down, under *Apotheke*,
whose *Heute* task wins the group order. *Pass verlängern (Morgen)* is in a third group, *Rückfahrt reservieren*
three screens further down in *Während der Reise*. The pills exist, but the reader has to scan five headings to
collect them.

**Why it hurts:** people open a task list to answer *"what do I have to do now?"*. The screen answers *"what kinds of
task are there?"* first. The pill was built to say which line is read now (FR-7.11), and the tag grouping outranks it.
This is an information-scent problem: the most urgent row has no position of its own.

**Proposal:** a *Fällig* block at the top of the screen that lists every overdue, today and next-two-days task, from
both phases and all tags, earliest first. Those rows leave their tag group while they are in the block, so nothing is
listed twice. Without a pressing task the block is not drawn. Alternatives are listed under question 1.

### 2. Adding a task is hidden and half-finished

**Seen:** two composers, one at the end of each section. With ten tasks before the trip, the *before* field is below
the first screen and the *during* field is three screens down. M4, M6 and M26 all carry the orange ＋ FAB and M6
has its field on top. M25 has no FAB. A new task cannot be given a tag or a day when it is typed. It always lands in
*Ohne Tag*. To give it a day you then need the task sheet, the *Fällig* field and a second stacked calendar sheet,
which takes five taps.

**Why it hurts:** consistency with the sibling screens (Jakob's law inside the app): the owner asked for the tasks to
behave like the shopping list, and the add pattern is the one part that does not. Capturing a task should be
instant, and it should be possible to file it while you type it.

**Proposal:** one composer at the top, M6's own shape: the field, then a row of chips. A *Vor der Reise /
Unterwegs* phase toggle defaults to *before* until the packing closes and to *during* after. Then the task tags
(*＋ Tag*), then quick days (*Heute*, *Morgen*, *Vor Abreise*, *Datum…*). Add the M4/M6 FAB, which scrolls to the
field and focuses it. The per-section composers go away.

### 3. The row is overloaded and the ✕ is next to the tick

**Seen:** grip, words, due pill, item chip, ✕ and tick share 390 px. *Filme herunterladen* and *Briefkasten leeren
lassen* wrap to two lines beside the pill or chip, while the grip column stays empty. The grey ✕ is about 40 px
from the tick on every row of the trip's own kind, and is the destructive act.

**Why it hurts:** Fitts's law and error prevention. The two most different acts on the row (done and delete) are
neighbours of the same size. Undo mitigates the damage, but not the fright. The pill competes with the words for
the first line.

**Proposal:** two-line rows. The words go on the first line. The meta line holds the due pill, the prepared item
(for a *Aus Packliste* task) and the assignee name in Server Mode. Remove the ✕ from the row. Deleting is done from
the sheet and from the selection's bulk bar (new *Löschen*). The tick stays at the edge, as FR-21.x wants.

### 4. After packing closes, history sits on top of the live list

**Seen:** after *Packen abschliessen*, *Vor der Reise* stays first. It shows the locked sentence, two empty group
headings (*Haus*, *Ohne Tag*) and one *1 erledigt* bar under each. The 14 live tasks start below that, and the only
field is at the very bottom.

**Why it hurts:** the page's order no longer follows its use. During the trip everything the reader can act on is
under *Während der Reise*. Empty headings with a fold under them read like broken groups.

**Proposal:** once the packing is closed, *Während der Reise* comes first. *Vor der Reise* becomes one folded line at
the end: *„Vor der Reise · 2 erledigt ›"*, and its locked sentence moves into the fold.

### 5. Finished tasks are folded once per group

**Seen:** *1 erledigt* appears under *Haus* and again under *Ohne Tag*, between groups. At a glance it reads like a
heading.

**Why it hurts:** it breaks the list rhythm and multiplies a control whose job is *the past, out of the way*.

**Proposal:** one fold per phase, at the section's end (*„3 erledigt"*). Each row inside it keeps its tag as its
meta line.

### 6. The task sheet leads with the rarest act, and the words cannot be edited

**Seen:** the primary, full-width button is *Auf „Während der Reise" schieben*. There is no *Erledigt* in the sheet.
The task's own words cannot be changed anywhere. A note can be edited since FR-7.13, a task cannot, so a typo costs
deleting and retyping, which loses its tag and day. *Fällig 24.09.2026* does not look tappable, and *Tag — genau
eines* is jargon. The date opens a second sheet over the first, with no quick choices and no mark for the departure
day.

**Why it hurts:** visual hierarchy should follow frequency. Here the sheet is the only place to date or retag a task,
so its most common acts should be its most visible ones.

**Proposal:** the title is an editable field, saved on blur with undo. *Erledigt* is the primary button. *Fällig* uses
the same quick chips as the composer (*Heute · Morgen · Vor Abreise · Datum…*), so the calendar is only the last
resort. The tag chips come under a plain *Tag* label. *Nach „Unterwegs" schieben* becomes a secondary row, and
*Aufgabe entfernen* stays as the quiet danger action at the end.

### 7. Two identical ☑ glyphs mean different things

**Seen:** the app bar's *Auswählen* icon (`checkboxOutline`) is the same glyph as the *Aufgaben* pill directly below
it. The same pair appears on M6.

**Why it hurts:** recognition over recall. On M6 a new user will read the bar icon as *go to tasks*.

**Proposal:** give selection its own glyph (for example `checkmarkDoneOutline` or a list-with-checks), app-wide,
since G-20 is shared.

### 8. The selection's bulk bar misses the common batch acts

**Seen:** the bar offers *Tag vergeben*, *Vor der Reise* and *Während der Reise*. It offers *Vor der Reise* even when
every selected task is already there, and the due pills vanish while selecting.

**Why it hurts:** the batch you most often want at the end of an errand is *these three are done*. The second most
common one is *all of these by Friday*.

**Proposal:** *Erledigt · Fällig · Tag · Verschieben ▸* (the phase you are not in, one button). Keep the pills
visible while selecting.

### 9. Three screens count *Aufgaben* three ways

**Seen:** M4's figure says *0/2 Aufgaben* (the packing window), M1's card *2 von 16 erledigt*, M25 *10 offen* and
*4 offen*. M1's list is alphabetical, carries no due pill and does not flag the overdue task.

**Why it hurts:** the same word with three numbers makes the reader doubt all three.

**Proposal:** M4's figure is named for what it counts (*Beim Packen 0/2*). M1's card takes M25's order (due first) and
its pills.

### 10. Local Mode cannot hand a task to a traveller

**Seen:** the sample trip names Andy, Sia and Leonardo on M4, and packing rows can be handed to them. *Rezept für Sia
abholen* cannot be handed to Sia, because a task's seat needs accounts (G-8).

**Why it hurts:** a family using one device sees people everywhere except where the task says whose job it is.

**Proposal:** a question for the owner, not a fix. See question 7.

---

## Open questions for the owner

Each question lists the recommendation first.

1. **Where does *what is due now* go?** (a) a *Fällig* block on top, across tags and phases, whose rows leave their
   group; (b) a *Ordnen: Tag | Fälligkeit* switch above the list; (c) keep the groups and make the section head say
   *„2 fällig · 10 offen"*, with a tap scrolling to the first.
2. **How is a task added?** (a) one composer on top in M6's shape, with phase, tag and day chips, plus the FAB that
   focuses it; (b) the FAB opens an add sheet with the same fields (M26's way); (c) keep one composer per section,
   moved to the section's top.
3. **What does a row carry?** (a) two lines, with the words first and then pill, item and person, and no ✕ on the
   row; (b) one line with no ✕, and the pill after the words; (c) as today, with the ✕ moved into the sheet only.
4. **After the packing is closed:** (a) *Während* first, *Vor der Reise* folded into one line at the end; (b) keep the
   order, fold *Vor der Reise* to one line; (c) as today.
5. **Finished tasks:** (a) one fold per phase at the section end; (b) one fold for the whole screen, at the bottom;
   (c) per group, as today.
6. **The task sheet:** (a) editable title, *Erledigt* primary, quick day chips, move as a secondary row; (b) the same
   without the editable title; (c) only the quick day chips.
7. **Local Mode and travellers:** (a) leave it (a task's seat stays an account, as G-8 decided); (b) let a task name
   a *traveller* the way a packing row's for-whom seat does, in every mode.
