# Trip notes

A trip note is a short message any traveller can leave for the others — the code for
the key box, the phone number of the pizza courier, where you left the car. The others
can answer it, so a note becomes a small conversation: a **thread**. Everyone on the
trip reads the same threads; each person ticks a thread off for themselves once they
have seen it.

## Writing one

Open the trip and tap the **Notizen** icon (two speech bubbles) in the row under the
trip's name. Type into the field at the bottom and tap **Senden**.

Want a heading? Tap **+ Titel** above the field first. The list then shows the title;
without one it shows the note's first line — *"Pizza Bella 079 555 12 34"* is a fine
title on its own.

A phone number in the text becomes a tappable link automatically. Tap a note's words to
open it in its own sheet; holding a press on the text there copies all of it — handy
for a code you need to paste somewhere else.

## Answering one

Each thread is one card, the one with the latest answer on top. Tap it to open it:
the note comes first, the answer field right under it, then the answers, **newest
first**. Answers go one level deep — you answer the note, not an answer.

## Changing what you wrote

Your own note or answer carries **Bearbeiten**. Change the words (and a note's title)
and save; the entry then says *bearbeitet*. Only the person who wrote something can
change it — it carries their name.

A change you make counts as new for everybody else: a corrected key-box code must not
go unseen by someone who ticked the wrong one.

## Ticking one off

A thread somebody else has written in carries a small checkmark. Tapping it marks the
thread as seen **for you** — it does not affect what anyone else sees. When somebody
answers or changes something after that, the thread shows **Neu** again, and only the
new entries are marked. Answering yourself counts as having read what came before.

The **Notizen** icon shows how many entries are new for you, in blue.

Up to three threads with something new for you also show on the dashboard, across
every trip you are on — each with the newest entry you have not seen, and the same
tick right there. Tapping the words opens the thread.

## Deleting

Open a note's sheet and delete it. Deleting the first note of a thread deletes its
answers too; the button says how many.

## Not a secret store

A trip note is stored as plain text, the same as any other message in the app. Every
member of the trip can read it, and it appears in a full account export the same way.
Use it for a key-box code or a gate combination — not for a password you would not want
someone else to see if they exported your data.

## Single-User and Local Mode

Notes, titles, answers and changes still work as a scratchpad. With nobody else on the
trip there is no "seen by someone else" to mark, so the tick, the count and the
dashboard card do not appear; nothing is missing, there is simply nothing for them to
say.

## What is not kept

Trip notes, and who has ticked which one, are **not** part of the portable backup
(Local Mode's YAML export) — see [Backup & Export](backup.md). A restored trip comes
back without either. In Server and Single-User Mode nothing is lost; the full account
export (`GET /me/export.json`) carries both.

## Who is told

- A **new note** reaches everyone on the trip who has **Trip notes** switched on — except
  whoever wrote it.
- An **answer** reaches everyone who has taken part in that thread — who wrote the note,
  and everyone who answered — if they have **Replies to notes** switched on. Somebody who
  only ticked it is not told: a tick is not joining the conversation.
- A change sends nothing; the thread shows *Neu* instead.

See [Notifications & Push](notifications.md). Tapping either notification opens the
thread.
