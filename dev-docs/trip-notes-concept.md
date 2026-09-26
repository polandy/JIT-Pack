# Concept — trip notes: written by one traveller, read by all, ticked per person

**Status:** **decided, built.** Variants and an interactive prototype are in
`dev-docs/UI_Concept_TripNotes_variants.html`. The built feature is **FR-7.9** in
`dev-docs/PRD_Addendum_v2.10.md` §3.7a, which is authoritative over this document; the per-person-state
tradeoff is `dev-docs/adr/ADR-073_A_Notes_Tick_Is_A_Row_Per_Person_Not_A_Column_On_The_Comment.md`.

**Scope:** notes on a trip that the other travellers can read — the key-box code, the pizza courier's phone number.
The dashboard shows the latest notes by others. A note can be ticked as done, and the tick belongs to the person who
sets it, not to the trip.

## 1. What a note is, and what it is not

A note is **information**, not work. A task (FR-7.4) has one state for the trip: somebody did it, so it is done. A
note has **one state per reader**: I have seen Anna's key-box code; Chris has not. That difference is the whole
concept, and it is why a note is not a task with a flag.

## 2. Data model

* **The note is a `comments` row** with `trip_item_id` NULL and `is_task = 0` — the *trip-level comment* shape FR-7.1
  allows and no screen writes yet. Author and time are already stamped by the server (invariant 3); sync, export and
  delete come with the table. No new column.
* **The per-person tick is a new table in the trip partition**, `note_acks`: `comment_id`, `user_id` (server-stamped,
  invariant 3), `acked`, field HLCs. Un-ticking sets `acked` back; field-level LWW never deletes a row.
* **Why a table and not a column on `comments`.** A field such as `acked_by` is merged whole (NFR-4.2a): Anna's and
  Ben's ticks made at the same time overwrite each other and one loses. One row per (note, person) cannot collide.
  This is the reason FR-7.4's `template_tasks` is a table; it is worth an ADR.
* **Rejected: the tick lives on the device only.** Simple, and Local Mode needs nothing else, but it does not follow a
  person to their second device and is lost with the browser data.
* **„New for me" is derived, never stored:** `author ≠ me` and no `acked` row for me. My own notes are never new. This
  is FR-7.3's lesson (open-prep is derived) applied again.
* **Not in the portable backup**, like every task and shopping entry (NFR-4.11).

## 3. Modes (G-8)

* **Server:** everything.
* **Single-User:** one account, so there is no other author; nothing is ever new and the dashboard card stays silent.
  The screen still works as a scratchpad.
* **Local:** no user id (`identityStore.myUserId` is null by design); same as Single-User, and no `note_acks` row is
  written, so nothing has to be a foreign key.

## 4. Surfaces

* **Notes of a trip.** Every note, new ones first and marked, ticked ones below and muted; a composer; a tick per note
  that is not mine; the sheet (text, author, time, who has seen it, edit, delete). Phone numbers become `tel:` links and
  a long press on a code copies it — presentation only, the note stays text.
* **M1.** A *Neue Notizen* card: the latest three notes by **others** that I have not ticked, across active trips, each
  with its trip chip and **its own tick**; tapping the text leads into the trip. Silent when there are none. This is a
  deliberate exception to FR-7.4's *„M1 takes no actions"* (see decision 2) and amends it for notes only.
* **Push.** A new note uses the existing „to all members" notification path; without it nobody reads the code in time.

## 5. Decisions

The recommended variant was taken everywhere except question 2.

| # | Question | Decided | Alternatives, and what they cost |
|---|---|---|---|
| 1 | Where the notes live | **A — a second segment inside M25**, carrying the count of new notes | B, a fourth pill, reopens the pill-row measurement ADR-051 amendment 1 closed at three words; C, a card above the packing list, competes with the list being worked |
| 2 | Tick on M1 | **B — yes, the card carries the tick** | A (report only) held FR-7.4's ruling; the tick is taken because *„gesehen"* is exactly what one says at the dashboard. The FR-7.4 ruling was made against an empty composer standing above every dashboard, which a tick is not |
| 3 | Who sees who ticked | **Everyone, in the note's sheet only** | Not in the list: a line per note about others' ticks makes the list a read-receipt board |
| 4 | Own notes | **Never new, no tick** | A tick on my own note would say nothing |
| 5 | Push on a new note | **Yes**, the existing „to all members" path | Without it nobody reads the code in time |
| 6 | Where a note hangs | **The trip only**, not a packing row | *Trigger:* a note somebody wants on one row — a row's own comment (FR-7.1) already exists for that |

**Consequence of 2 worth stating:** M1 stops being read-only for one card. The composer, the packing rows and the tasks
stay off M1 as FR-7.4 ruled; only the note's tick is there, because it is one tap, needs no keyboard and undoes itself
by tapping again.

## 6. Not a secret store

The code is stored in clear text, visible to every member and in the server export. This is for a key box, not a
password. The docs page says so.

## 7. What building it is

FR-7.9 in §3.7, a screen entry in the UI-Spec plus the M1 card, an **ADR** on per-person state as a table, the
`note_acks` table in `schema.sql` **with** its migration (invariant 2), the stamp in `stampActor` with failure-path
tests, the pure „new for me" rule in `client/src/domain` (invariant 4), the `de`/`en` catalogues, the `docs/` page, the
dev-seed extension (standing rule: sample notes from two authors), and e2e cases: **a note written by one member is new
for another**, **a tick is mine alone** (second identity, ADR-029), **M1 lists it and stops once ticked**.
