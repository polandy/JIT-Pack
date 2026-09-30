# Activity

The activity log answers *who changed what, and when*: who packed the hiking boots, who
deleted the sunscreen, who added a new item to the inventory last week. Every change
that reaches the server is recorded with the person who made it.

There are two logs: one per trip, and one for the inventory.

## A trip's activity

Open the trip's packing list, tap **⋮** in the top bar and choose **Aktivität**. You see
everything that happened in the trip, newest first, one section per day (**Heute**,
**Gestern**, then the date):

- packing — added, deleted, changed, **eingepackt**, **wieder ausgepackt**, **bewusst
  nicht eingepackt**
- the shopping list — added, **gekauft**, purchase taken back
- tasks — **erledigt**, **wieder geöffnet**
- notes, excursions, ideas and votes, the travellers and the luggage
- the trip itself — its name and dates, and who was added as a member

Each line names the thing, what happened, where (**Packliste**, **Einkauf**,
**Aufgaben**, …), who did it and at what time. When someone changed a field, the line
says what it was before and after — *Menge: 2 → 3*.

Several changes in a row by the same person, of the same kind, are folded into one line:
*Badehose, Socken, Zahnbürste · 3× eingepackt · Bob · 21:24*. Tap it to see each one. If
somebody else did something in between, you see two lines — the order is the point.

Merely opening an item on the packing list (the "someone is packing this" marker) and
what trip generation does behind the scenes are not listed.

Every member of the trip can read its log. It goes with the trip: delete the trip and
its log is gone too.

## The inventory's activity

On **Artikel**, tap **⋮** and choose **Aktivität**. It lists changes to the items,
tags, groups and templates, which everybody on the instance shares, and to your own
trip series.

## Good to know

- **The log starts with the version that introduced it.** Changes made before you
  upgraded were never recorded with a name, so the log begins empty.
- **The time is when the change reached the server.** If you packed with no connection,
  your changes appear once your phone was back online, at that time.
- **Pull down** on the list to refresh it. **Ältere laden** at the bottom reads further
  back.
- **Single-User Mode** records the log too, but names nobody — there is only you.
- **Local Mode** has no server to record anything, so the entry is not offered there.
- The log is not in the portable YAML backup — a restored trip starts a new log. A copy
  of the server's database file (see [Backup & Export](backup.md)) contains it.
