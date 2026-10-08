# M26 — Notizen (A Trip's Notes, FR-7.13) — *built*

* **What it is:** a trip's notes as threads — information one traveller leaves for the others (a key-box code, a
  courier's number) and the answers to it. A thread is a first note with replies, one level deep. Reasoning:
  `dev-docs/trip-note-threads-concept.md` (§7b is the UX rework); the interactive mockup is
  `UI_Concept_TripNoteThreads_variants.html` at `6b148419`.
* **Where it lives:** the fourth pill of the G-9 switcher, after *Aufgaben*, glyph `chatbubblesOutline`
  (`/trips/:id/notes`, `meta.tripView: 'notes'`). Its badge is the number of entries new for me, in the action colour.
  No ⋮ (ADR-051 amendment 2): nothing here is packing's. Back is M4.
* **The list:** the threads, the one with the latest activity first — a reply lifts its thread (question 1). Each is one
  card (`.jp-card`), itself a button into the thread: the first note's author's avatar; **its name** — the title in the
  heading weight, or else the first line in the body weight — with a ***Neu*** badge (*Neu 3* for three) where entries
  are new for me, and the card's edge in the action colour; **what is in it** — the first note's words under a title,
  the rest of them under a first-line name, two lines at most, with a phone number and a code marked as on the thread;
  under a hairline **the newest reply** as *„Ben: Parkplatz ist Nr. 12"* with Ben's avatar; and *„2 Antworten · vor 5
  Min"*, or who wrote it and when with no reply yet. A thread about an excursion (FR-7.15) names it under the words,
  signpost glyph and name in the meta size (`note-thread-excursion`); a link to an excursion the device no longer holds
  names nothing. No chevron and no checkbox: the notes are looked things up in, so
  the code is readable without a tap, and *seen* is said inside the thread. The empty trip says *„Für diese Reise gibt
  es noch keine Notizen."*
* **Writing a note:** the FAB (＋, `FAB_ANCHOR.m26`) opens a sheet *„Neue Notiz"*: *„Titel (optional)"*, the words
  (*„Eine Notiz für alle — ein Code, eine Nummer…"*), where another member shares the trip the line *„Alle
  Mitreisenden sehen die Notiz."*, where the trip has excursions a chip row *„Zu einem Ausflug"* — one `ChoiceChip`
  per excursion with the signpost glyph, at most one pressed, a second tap taking it off (FR-7.15) —
  *Abbrechen* and *Teilen*. It writes a first note with `created_at` from the device; the list stays where it is.
* **The thread view** (`/trips/:id/notes/:threadId`, `meta.parent` the list, no pills) is headed by the thread's
  title, or ***„Notiz"*** where it has none — never the first line, which the card under it shows in full — with the
  trip as meta. **The first note is a card on top** — avatar, *„Ben · heute 14:32 · bearbeitet"*, a ⋯, the words in
  full, and in Server Mode ***„Gesehen von Anna, Chris"*** (FR-7.9 decision 3, here rather than on the list); under
  the card's words, for a thread about an excursion, a pill with the signpost, its name and a chevron
  (`note-excursion-link`) that opens the excursion's list (M27) — beside the entry's own button, not in it, so the tap
  does not open the entry's menu. **Then
  the replies in the order they were written**, as bubbles: somebody else's on the left with avatar and name, mine on
  the right in the action colour's tint with only the time. **The reply field is fixed at the bottom** (*„Antworten…"*,
  a send button, Enter sends), and a reply lands at the bottom, scrolled into view — oldest first, so the field never
  stands between the note and its answers. A reply has no reply field of its own: one level.
* **New for me:** a divider ***„Neu seit deinem letzten Besuch"*** stands above the first unseen reply, and the view
  opens scrolled to it; a thread new as a whole has no divider — its first note's card takes the action colour at the
  edge. **What is new** is derived (`noteThreads`): an entry by somebody else created or edited after my tick reached,
  or after my own latest entry — replying is not ticking, but what I answered is behind me. Opening is not seeing.
* ***„✓ Gelesen"*** (FR-7.9's tick, per person) is a labelled button under the last entry while anything is new for
  me; it ticks the thread through its newest entry (`seen_through`) and goes. It is not a bare checkbox on the list,
  which would read as *done* one pill from the tasks.
* **Words:** a phone number is a `tel:` link; **a code** — three to six digits standing alone — is a chip that copies
  itself (*„4711 kopiert"*). On the list the chip only marks it: a card is one button already.
* **An entry's menu** opens on a tap on the entry (the ⋯ on the first note shows it can): *Text kopieren*,
  ***Bearbeiten* on my own entries only** (question 2; in Local Mode, with no identity, on every entry — one writer),
  and the delete — *„Notiz löschen, mit 2 Antworten"* on a first note with replies, which takes the thread and returns
  to the list; *„Antwort löschen"* on a reply. *Bearbeiten* opens the entry in place — a title field on a first note,
  the words, on a first note where the trip has excursions the sheet's chip row with the current one pressed,
  *Abbrechen* / *Speichern*; saving writes the words, the title and `edited_at`, the entry says *bearbeitet*, and for
  everybody else the thread is new again (question 3). A changed excursion is a write of its own without `edited_at`
  — it neither says *bearbeitet* nor makes the thread new (FR-7.15). No push. A thread deleted elsewhere leaves its
  view for the list.
* **A link naming a thread** — M1's row, a `note` or `note_reply` notification — opens its view directly.
* **Modes:** all three. Server: everything. Single-User and Local: one author, so nothing is new, *Gelesen* and
  *„Gesehen von"* never render and no push is sent; threads, titles and edits work as a scratchpad. **Before the trip
  partition has arrived** the screen shows nothing rather than an empty list (ADR-033).
* (E2E-M26-01/02/05/06 `local`, E2E-M26-03/04 `server`, E2E-M1-14, E2E-G12-06/07, E2E-VIS-14)
