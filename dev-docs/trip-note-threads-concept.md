# Concept — trip notes become threads: a titled note, one level of replies, its participants told

**Status:** **every question decided 2026-09-25 (owner: the recommendation everywhere; question 6 after two renders);
built the same day in two PRs** — the trip-view switcher went to icons first (ADR-051 amendment 3, #601), then the
threads as **FR-7.13** in PRD Addendum §3.7a, with notes as a view of their own (**M26**). The FR and UI-Spec M26 are
authoritative; where this file's §4 still describes M25's segment, it is the reasoning before question 6 was decided.
Two details moved in the build: the edit is a ✎ on the entry itself rather than an entry in the sheet (the mockup's
shape), and the reader's own latest entry counts as read (§3's *"replying is not ticking"*, made a rule). The
interactive mockup is `dev-docs/UI_Concept_TripNoteThreads_variants.html`. **Reworked the same day after a UX review
(§7b)**: a thread has its own view, read top to bottom, and question 1's newest-first is reversed there. It builds on
FR-7.9 as built (`dev-docs/trip-notes-concept.md`, ADR-073) and changes nothing that concept decided unless §2 says so.

**Asked for** (owner, 2026-09-25, translated): notes should work like a forum with threads. One note can have
several notes attached to it, one level only. The parent note can have a title, and the overview shows that title.
Notes can be edited. The newest entry is always on top. Notes can be expanded. A new note also shows on the
dashboard. When somebody else responds to a note, everyone who took part in it is notified.

---

## 1. The shape, in one paragraph

**A thread is a note with replies.** The first note keeps everything FR-7.9 gave it — author, time, the per-person
tick, the push to every member — and gains an optional title. A reply is a note of its own that names its parent;
it has no title and cannot be replied to. The M25 notes segment becomes a list of **collapsed threads**, the one
with the latest activity first; expanding one shows the first note, a reply field right under it, and the replies
newest first. **"New for me" moves from the note to the thread**: a thread is new when somebody else wrote something
in it that I have not seen, so a reply to a thread I ticked last week makes it new again. Replying notifies the
**participants** — the first note's author and everyone who has replied — never the whole trip.

## 2. What changes against FR-7.9, and what it costs

| Changed | Consequence to accept |
|---|---|
| The tick is per thread, and a later entry by someone else re-opens it | A tick records *how far* I read, not only *that* I read — one column on `note_acks` |
| The list is ordered by latest activity | FR-7.9's "ticked notes sink and are muted" is struck: a ticked thread keeps its place, only its marker goes |
| A note can be edited | A new column (`edited_at`); an edit to a code others have ticked re-opens the thread for them (question 3) |
| A reply notifies the participants | A new notification kind, `note_reply`, with its own switch in the settings |
| M1 reports threads, not notes | The card's row shows the thread's title and its newest unseen entry, with a count |

## 3. Data model

* **A reply is a `comments` row** with the note shape (`trip_item_id` NULL, `is_task = 0`) and a new
  **`parent_id`** pointing at the thread's first note. Sync, author stamp, export and delete come with the table,
  as they did for FR-7.9. Rejected: a `note_replies` table — it would duplicate every one of those for a row that
  differs from a note by one reference.
* **`parent_id` is written once.** Like `author_id`, the server ignores it on an update (a reply cannot be moved to
  another thread; the conflict it would create has no reading a person can follow). On insert the server refuses a
  parent that is itself a reply, is not a note, or belongs to another trip — **one level is a server rule**, since a
  `CHECK` cannot see another row. The client offers no reply field on a reply, so the refusal is a guard, not a flow.
  `ON DELETE CASCADE`: deleting the first note deletes its thread (the sheet says how many replies go with it).
* **`title`**, nullable, meaningful on a first note only. The server drops it from a reply's mutation. Without a
  title, the collapsed thread shows the first line of the body — the title is optional because *"Pizza Bella 079 555
  12 34"* is its own title.
* **`edited_at`**, nullable, named by the client like `resolved_at` (an edit happens offline too). The entry shows
  *"bearbeitet"* beside its time. **Only the author edits their own entry** (question 2) — an entry carries its
  author's name, and words edited by somebody else would still be signed by them.
* **`note_acks.seen_through`**, nullable: the `created_at`/`edited_at` of the newest entry of the thread at the moment
  of the tick. Comparing it with the entries' own stamps compares data with data, so two devices' clocks never meet.
  An existing ack row (no value) reads as *"the first note as it was"* — correct, because no reply exists yet.
* **"New for me" stays derived** (`client/src/domain/tripNotes.ts`): a thread is new when an entry by someone else
  was created or edited after my `seen_through`, or I have no ticked ack at all. The count on the collapsed thread
  and on M25's segment is the number of such entries. My own entries never make a thread new for me.
* **Replying is not ticking.** Writing a reply does not tick the thread (question 4), but the newest entry is then
  mine, so it is not new either — the rule already gives the right answer without a special case.
* **Migration** `006_note_threads.sql` beside the `schema.sql` edit (invariant 2): three columns on `comments`, one on
  `note_acks`, an index on `comments(parent_id)`. Additive only.
* **Not in the portable backup**, like FR-7.9's notes (NFR-4.11).

## 4. Surfaces

* **M25, notes segment.** Each thread collapsed to one card: title (or first line), author avatar, *"3 Antworten ·
  vor 2 Std."*, the avatars of the participants, the *neu* marker with the count, and the tick. Tapping the card
  expands it in place — accordion, several may be open. Expanded: the first note in full (phone numbers as `tel:`,
  long press copies — FR-7.9 unchanged), a reply field, then the replies newest first, each with its author, time,
  *bearbeitet*, and for my own a ✎. Threads that are new for me are **not** opened automatically: the marker says so,
  and a list that opens itself moves under the thumb.
* **The composer** at the bottom of the segment gets a title field above the text, collapsed to a *"+ Titel"* link
  until tapped, so writing a quick number stays one field.
* **The note's sheet** (FR-7.9 decision 3: who has seen it) stays, reached from the expanded thread's ⋯; it gains
  *Bearbeiten* for the author and names the replies in the delete confirmation.
* **M1, *Neue Notizen*.** One row per thread with something new for me, up to three, latest first: the title, then
  *"Chris: Danke! Parkplatz ist Nr. 12"* (the newest unseen entry) and *"+2"* when more are unseen, the trip chip, and
  the tick (FR-7.9 decision 2 unchanged). Tapping the words opens M25 on that thread, expanded.
* **Push.** A new first note: unchanged, every member but the author (`note`). A reply: the participants but the
  replier (`note_reply`, *"Chris hat auf „Schlüsselbox" geantwortet: Danke! Parkplatz…"*). An edit sends nothing — a
  corrected code re-opens the thread (question 3), and the marker is the signal. A tick sends nothing.

## 5. Modes (G-8)

* **Server:** everything.
* **Single-User:** one author, so nothing is ever new and no push is sent; threads, titles and edits work as a
  scratchpad.
* **Local:** no user id, no `note_acks` row (FR-7.9's rule), no push. Threads work; nothing is ever new.

## 6. Rejected

* **Deeper nesting.** Asked against. One level keeps the reply field in one obvious place and the list readable on
  a phone.
* **Oldest reply first, as in a chat.** The owner asked for the newest on top; the reply field sits right above it,
  so what I just wrote lands where I wrote it.
* **Every member notified of every reply.** A thread about the ferry is not the business of the person who only
  wrote the pizza number; the first note already reached everyone.
* **Expanding a thread counts as seen.** FR-7.9 chose an explicit tick because *seen* is a statement, and scrolling
  past is not one.

## 7. Questions — all decided (owner, 2026-09-25)

| # | Question | Recommended | Alternatives, and what they cost |
|---|---|---|---|
| 1 | Order of the threads | **By latest activity** — a reply lifts its thread | By creation: an old thread with a new answer stays buried under newer ones |
| 2 | Who may edit | **The author, own entries only** | Everyone: the edit is still signed by the author, who did not write it |
| 3 | Does an edit re-open the thread for others | **Yes, an edit by someone else counts as new** | No: a corrected key-box code goes unseen by everyone who ticked the wrong one |
| 4 | Who is a participant | **The first note's author and everyone who replied** | Also everyone who ticked: a tick would subscribe you to the whole discussion |
| 5 | Its own push switch | **Yes, `note_reply` beside `note`** | Share `note`: a person who wants new codes but not the discussion cannot say so |
| 6 | Notes as their own trip view (a pill beside *Aufgaben*) instead of M25's second segment | **A view of its own, on an icon row** (owner, 2026-09-25) — the switcher goes to icons first, its own PR | See §7a |

### 7a. Question 6 — a view of their own

Asked by the owner the same day. FR-7.9 decision 1 put notes inside M25 because a fourth pill reopened ADR-051
amendment 1's width measurement. Threads change the premise of that ruling:

* **For a view of its own.** A note *is not work* — FR-7.9's own first sentence — so filing it under *Aufgaben* is a
  category error the segment only hid while a note was one line. A thread is a place people write in, which is the
  form ADR-051's revisit trigger names (*"a view that is worked in rather than read"*). A push or an M1 row lands on
  the notes directly instead of on the tasks with a segment to switch. M25 loses its segment and is one list again.
* **Against.** The row: pills carry their counts (*„Einkauf 12"*), and amendment 1 measured four pills at 390 px to
  within six pixels. *Notizen* is shorter than the *Auswertung* measured then, so it may fit — a render decides, not
  an estimate. And a view people open a few times a trip stands as loud as the list being packed.
* **Fallbacks if four do not fit:** the notes pill carries only its *new* count (never the total), or the row keeps
  three and *Notizen* joins the ⋮ — the second is rejected in advance for something written in, not read once.

**Measured 2026-09-25** in the mockup's §*Frage 6*, with `TripViewNav.vue`'s own metrics (13 px Hanken Grotesk, 10 px
padding, 1 px border, 6 px gap, 16 px page gutter) in headless Chromium, counts Einkaufen 12, Aufgaben 7, 2 new notes.
Negative is overflow:

| Row | 360 px | 390 px | 430 px |
|---|---|---|---|
| Today, three pills, on M4 (de) | +47 | +77 | +117 |
| Four pills, on M4 (de) | −42 | −12 | +28 |
| Four pills, no new notes, on M4 (de) | −25 | +5 | +45 |
| Four pills, on M4 (en) | −20 | +10 | +50 |
| Today, three pills, standing on *Auswertung* (de) | −50 | −20 | +20 |
| Four pills, standing on *Auswertung* (de) | −139 | −109 | −69 |

**Reading:** in German a fourth pill fits only on a large phone; at 390 px it fits only while no note is new — the
moment the pill has something to say, it is cut off. The row scrolls rather than clips, so nothing breaks, but the
view that is new is the one that disappears. A side finding: **today's three-pill row already overflows at 390 px
while standing on *Auswertung* or *Gepäck*** — ADR-051 amendment 1's 286 px measurement was made with a one-digit
shopping count and before *Aufgaben* joined the row. Recommendation after the render: **keep the segment**, and give
it what the own view would have bought — push and M1 open M25 on the notes segment and the thread expanded, and the
*Aufgaben* pill does not count notes. A shorter pill word (the count as a badge, not *„(12)"*) would change every
pill and is its own decision.

**Owner's counter-proposal, same day: icons instead of words.** Rendered as a third variant: the current view keeps
icon and word (the row must still say where you are — ADR-051 amendment 1), every other view is its Ionicon at
`--jp-icon-md` with its count as a badge (the notes' badge in the *neu* colour, the others grey), and the name appears
in a bubble on a long press (on hover with a mouse). Measured the same way:

| Row, icons | 360 px | 390 px | 430 px |
|---|---|---|---|
| Four, on M4 (de) | +70 | +100 | +140 |
| Four, on the notes (de) | +61 | +91 | +131 |
| Four, standing on *Auswertung* (de) | −1 | +29 | +69 |

It fits everywhere but the widest case on the smallest phone, by one pixel, and also cures today's overflow. What it
costs: **a pill no longer says what it is** — the packing list (a list) and the tasks (a checkbox) are both
checklists, and that pair is the one a reader will confuse; the page title names the screen after the tap, which is
the lesson, not the label. **The bubble on a tap** (the owner's first reading) was drawn too and is not recommended:
every switch would cost two taps to spare a reader who already knows the icons one look at the title. And it is a
change to the switcher for every trip view (M4, M6, M25, M11, M12), so it is ADR-051's amendment 3 and E2E-G12's
cases, not a rider on this feature.

## 7b. The UX rework — decided 2026-09-25 (owner: the recommendation everywhere)

Asked for the same day, once the built M26 had been used (owner, translated): the notes module did not convince in
use; review it as a UX expert and show the improvements in mockups. The review found three things that hit the
module's main purpose — looking up a code, and seeing what the others wrote since:

* **The words were folded away.** A collapsed card showed only a name; *4711* was a tap away on every lookup.
* **The reading direction broke.** Inside a thread: the first note, then the reply field, then the replies newest
  first — read downwards and upwards at once, with the field in the middle of the conversation.
* **The tick read as *done*.** A bare checkbox beside a chevron, one pill from the tasks' checkboxes.

Four questions, each decided as recommended:

| # | Question | Decided | What it cost |
|---|---|---|---|
| a | The replies' order | **Oldest first, the field fixed at the bottom** — reverses question 1's inner order | Question 1's reason (*what I wrote lands where I wrote it*) holds either way; the divider only works in reading order |
| b | Where a thread opens | **Its own view**, `/trips/:id/notes/:threadId` | The deep links (M1, push, service worker) and every M26 case change; an accordion cannot hold a field at the bottom |
| c | Pinning a note | **Not now** | See below |
| d | When | **Inside PR #602**, before it merged | The UI was built and specified twice in one PR rather than once each on `main` |

What else came with it, from the mockups: the card shows the first note's words (two lines) and the newest reply
with its writer; *Gelesen* is a labelled button at the end of what is new, with a divider *„Neu seit deinem letzten
Besuch"* above the first unseen reply, and *„Gesehen von"* moved from the sheet to the thread's first note; a new note
is written from a FAB and a sheet, *Teilen*, with a line saying who reads it; an entry's actions — copy, edit, delete —
are one menu opened by tapping the entry, replacing the ✎ under every entry and the sheet behind the words; a short
code (three to six digits standing alone) is a chip that copies itself. Nothing in the data, the sync or the push
changed.

**Pinning, parked.** A pinned note — the door code that should always stand first — is new behaviour: a column and a
migration, a rule for who may pin, a section of its own on the list. With the words on the card the code is readable
without a tap, which was the pain. **Revisit trigger:** a code that matters scrolls out of sight on a trip's notes in
real use, or the owner asks for it.

## 8. What building it is

FR-7.13 in §3.7a, M25's and M1's entries in the UI-Spec, **no ADR unless question 3 or 4 is decided against the
recommendation** (the rest is additive; the per-thread tick is ADR-073's table read one way further, which an
amendment note on ADR-073 records). `schema.sql` **and** `006_note_threads.sql`; the server's parent and title rules
with failure-path tests; `planNoteReply` in `notificationrules.go` with the participant set tested; the thread
derivation in `client/src/domain/tripNotes.ts` (grouping, order, new count, `seen_through` on tick); the `de`/`en`
catalogues and the notification text; `docs/trip-notes.md` and `docs/notifications.md`; the dev seed extended by a
thread with replies from two authors; e2e cases: **a reply lifts its thread and lands on top inside it**, **a reply
re-opens a ticked thread for the other traveller** (second identity, ADR-029), **M1 shows the newest unseen entry
and stops once ticked**, **a reply cannot be replied to**, and **only the author sees ✎**.
