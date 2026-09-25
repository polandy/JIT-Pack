# Trip notes

A trip note is a short message any traveller can leave for the others — the code for
the key box, the phone number of the pizza courier, where you left the car. The others
can answer it, so a note becomes a small conversation: a **thread**. Everyone on the
trip reads the same threads, and each person marks a thread as read for themselves.

## Writing one

Open the trip and tap the **Notizen** icon (two speech bubbles) in the row under the
trip's name. Tap the round **+** button at the bottom right: a sheet opens with an
optional **Titel** and the text. Tap **Teilen**.

Without a title, the note's first line names it — *"Pizza Bella 079 555 12 34"* is a
fine title on its own.

## Reading the list

Each thread is one card, the one with the latest activity on top. The card already
shows what is in it — the note's words, up to two lines, and the newest answer with
who wrote it — so looking up a code needs no tap. **Neu** on a card means something in
it is new for you.

## Inside a thread

Tap a card to open the thread. The note stands on top; the answers follow in the order
they were written, yours on the right. Type an answer into the field at the bottom and
send it — it lands at the bottom, where you wrote it. Answers go one level deep: you
answer the note, not an answer.

A phone number becomes a tappable link. A short code — three to six digits, like
**4711** — is shown as a small box; tapping it copies the code.

Tap any entry to open its menu: **Text kopieren**, **Bearbeiten** and delete.

## Changing what you wrote

**Bearbeiten** is offered on your own entries only — an entry carries its writer's
name. Change the words (and a note's title) and save; the entry then says *bearbeitet*.

A change you make counts as new for everybody else: a corrected key-box code must not
go unseen by someone who read the wrong one.

## Marking a thread as read

When a thread has something new for you, a line **Neu seit deinem letzten Besuch**
shows where the new part starts, and the thread opens there. Under the last entry sits
**✓ Gelesen**: tap it to mark the thread as read **for you** — it does not affect what
anyone else sees. Opening a thread alone does not mark it. When somebody answers or
changes something after that, the thread shows **Neu** again, and only the new entries
count. Answering yourself counts as having read what came before.

The note on top says who has read the thread (**Gesehen von …**).

The **Notizen** icon shows how many entries are new for you, in blue.

Up to three threads with something new for you also show on the dashboard, across
every trip you are on — each with the newest entry you have not seen, and a checkmark
to mark it read right there. Tapping the words opens the thread.

## Deleting

Open an entry's menu and delete it. Deleting the first note of a thread deletes its
answers too; the button says how many.

## Not a secret store

A trip note is stored as plain text, the same as any other message in the app. Every
member of the trip can read it, and it appears in a full account export the same way.
Use it for a key-box code or a gate combination — not for a password you would not want
someone else to see if they exported your data.

## Single-User and Local Mode

Notes, titles, answers and changes still work as a scratchpad. With nobody else on the
trip there is no "seen by someone else" to mark, so **Gelesen**, the count and the
dashboard card do not appear; nothing is missing, there is simply nothing for them to
say.

## What is not kept

Trip notes, and who has read which one, are **not** part of the portable backup
(Local Mode's YAML export) — see [Backup & Export](backup.md). A restored trip comes
back without either. In Server and Single-User Mode nothing is lost; the full account
export (`GET /me/export.json`) carries both.

## Who is told

- A **new note** reaches everyone on the trip who has **Trip notes** switched on — except
  whoever wrote it.
- An **answer** reaches everyone who has taken part in that thread — who wrote the note,
  and everyone who answered — if they have **Replies to notes** switched on. Somebody who
  only read it is not told: reading is not joining the conversation.
- A change sends nothing; the thread shows *Neu* instead.

See [Notifications & Push](notifications.md). Tapping either notification opens the
thread.
