# Trip notes

A trip note is a short message any traveller can leave for the others — the code for
the key box, the phone number of the pizza courier, where you left the car. Everyone on
the trip reads the same list; each person ticks a note off for themselves once they have
seen it.

## Writing one

Open the trip, switch to **Aufgaben**, and tap the **Notizen** segment beside it. Type
into the field at the bottom and add it — that's it, no due date, no assignee.

A phone number in the text becomes a tappable link automatically. Holding a press on a
note's words, in its own sheet, copies the whole text — handy for a code you need to
paste somewhere else.

## Ticking one off

A note somebody else wrote carries a small checkmark of its own. Tapping it marks the
note as seen **for you** — it does not affect what anyone else sees, and it does not
change the note itself. Un-tick it the same way if you want it to stand out again.

Your own notes never carry a tick: there is nothing to confirm about words you wrote
yourself.

The three newest notes by other travellers that you have not ticked also show on the
dashboard, across every trip you are on — with the same tick right there, so you do not
have to open the trip just to mark something as read.

## Not a secret store

A trip note is stored as plain text, the same as any other message in the app. Every
member of the trip can read it, and it appears in a full account export the same way.
Use it for a key-box code or a gate combination — not for a password you would not want
someone else to see if they exported your data.

## Single-User and Local Mode

Notes still work as a scratchpad — write yourself a reminder, look it up later. With
nobody else on the trip there is no "seen by someone else" to mark, so the tick and the
dashboard card do not appear; nothing is missing, there is simply nothing for them to
say.

## What is not kept

Trip notes, and who has ticked which one, are **not** part of the portable backup
(Local Mode's YAML export) — see [Backup & Export](backup.md). A restored trip comes
back without either. In Server and Single-User Mode nothing is lost; the full account
export (`GET /me/export.json`) carries both.

Everyone on the trip who has enabled the **Trip notes** notification (see
[Notifications & Push](notifications.md)) is told about a new one — except whoever
wrote it.
