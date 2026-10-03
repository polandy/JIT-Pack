# Day plan

Once you are there, the question changes from *what could we do?* to *what are we doing today?*. **Tagesplan** shows
it, day by day: the ideas you planned, your excursions, the tasks due, when you arrive and leave, and anything else you
want to remember for a day — a table you booked, the hire car to pick up.

## Opening it

The day plan is the **calendar** — the last icon in the row under the trip's name. It is there only once the trip has
both a start and an end date; set them in the trip's properties if the icon is missing.

**During the trip you land on it.** From the trip's first day to its last — or from *Reise starten* if you started it
early — tapping the trip on the overview or in the trip list opens the day plan on today. On a day with nothing planned
it opens the shopping list instead — or the tasks, if nothing is to buy but a task is still open. Before the trip, the
trip opens where you last left it on this device (on a first visit the ideas, while nothing is on the packing list yet);
after the trip, on the packing list. The pills under the trip's name still take you to any view.

**Today on the overview.** On each day of the trip, the overview shows a **Heute** card under the trip: the next three
things still to come today, as the day plan lists them — something with a time leaves once its time has passed, a
connection once it has arrived. Tick a task or an idea right there; *+ n weitere · Tagesplan* opens the whole day.
Once the packing is finished the card sits inside the trip's big card, beside the tasks and the shopping list.

## Reading a day

The row of days at the top lists every day of the trip. During the trip today is chosen; before it, the first day.
Dots under a day show that something stands on it. Tap a day to see it.

Under the row, the chosen day lists what is on it — first everything with a time, in time order, then the rest:

- **Anreise / Abreise** on the first and last day.
- **Ausflug** — an excursion with a date, on each of its days (*Start* and *Rückkehr* when it spans several), with how
  much of its rucksack is packed. Tap it to open the excursion.
  An excursion you made from an idea is one line with the idea's title (💡) under it, and at the time you gave the
  idea — the idea itself does not appear a second time. **Verbindung hinzufügen** under the line adds a connection
  that belongs to this excursion; its line then names the excursion.
- **Idee** — an idea you planned on this day. Tick it once you did it: it moves to **Gemacht** on the board.
- **Aufgabe** — a task due this day, with whoever does it. Its tick is the same as on the task list.
- **Eintrag** — an entry of the day plan's own. Tap it to change or delete it.
- **Verbindung** — a train, bus or ferry journey: from where to where, when it arrives, which lines and how often you
  change. Tap **▸** to see each leg, and **In der App öffnen** to open the connection in the app it came from — that
  app knows about delays and platforms.

Below the day, **Morgen** shows tomorrow.

## Planning an idea

Only ideas on the **Shortlist** go on the plan. Give one a day in either of two places:

- On the board: open the idea and tap a day under **Tag**; a time is optional. The idea's card on the Shortlist then
  shows its day — or *noch nicht eingeplant*.
- On the day plan: the bar at the bottom counts the shortlisted ideas without a day. Tap it and tap a day beside an
  idea.

An idea you drop leaves the plan but keeps its day, and comes back with it if you shortlist it again. If the trip's
dates move so that an idea's or entry's day is no longer part of the trip, it is listed under **Außerhalb der
Reise**.

## Your own entries

Tap the round **+** to add something to the chosen day: a title, a note and, if you like, a time. In the same sheet,
**Idee** lists the shortlisted ideas without a day — tap one to plan it on that day instead.

## Adding a connection

Tap **+** and choose **Verbindung**.

**From the SBB app:** open the connection there, share it and copy the link. Then tap **Link aus Zwischenablage
einfügen**, or paste the link into the field. It is read at once: the sheet lists the legs, and **Am … einfügen** adds
the connection on the day it runs, even if you had a different day open. The day plan then shows that day.

- The SBB app's short link (`a.sbbmobile.ch/s/…`) is read through your server. In Local Mode, or if your instance has
  link previews switched off, only the full `sbb.ch` link is read. Open the short link in a browser and copy the address
  it leads to.
- The paste button needs the page to be served over HTTPS. Without it, paste into the field.

**Anywhere else:** fill in **Von**, **ab**, **Nach**, **an** and, if you like, **Linie**. If the arrival time is
earlier than the departure, it is counted as the next morning, as on a night train. You can put any link in the field
too, a booking for example. JIT-Pack keeps it and offers it under the connection. A link it cannot read says so, and
you fill in the fields.

Tap the connection to change or delete it.

## Good to know

- Everybody on the trip sees and can change the day plan; it syncs like the rest of the trip and works offline.
- The day plan is the same in all three modes.
- Copying a trip does not copy its entries, and they are **not** in the portable backup file; on a server, the full
  JSON export has them (see [Backup & Export](backup.md)).
