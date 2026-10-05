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
connection once it has arrived; meals are left to the **Heute essen** card beside it. Tick a task or an idea right
there; *+ n weitere · Tagesplan* opens the whole day.
Once the packing is finished the card sits inside the trip's big card, beside the tasks and the shopping list.

## Reading a day

The row of days at the top lists every day of the trip. During the trip today is chosen; before it, the first day.
Dots under a day show that something stands on it. Tap a day to see it.

Under the row, the chosen day lists what is on it — first everything with a time, in time order, then the rest:

- **Anreise / Abreise** on the first and last day.
- **Ausflug** — an excursion with a date, on each of its days (*Start* and *Rückkehr* when it spans several), with how
  much of its rucksack is packed. Tap it to open the excursion.
  An excursion you made from an idea is one line with the idea's title (💡) under it, and at the time you gave the
  idea — the idea itself does not appear a second time. The way there and back you added on the
  excursion show as *Hinfahrt* and *Rückfahrt* with the excursion's name, and the excursion stands between them —
  right after the way there, or right before the way back if it has only that.
- **Idee** — an idea you planned on this day. Tick it once you did it: it moves to **Gemacht** on the board.
- **Aufgabe** — a task due this day, with whoever does it. Its tick is the same as on the task list.
- **Eintrag** — an entry of the day plan's own. Tap it to change or delete it. An entry for only some of you says
  so under it — *für Sia*; an excursion only some go on says who the same way.
- **Verbindung** — an entry with a train, bus or ferry journey: its title, and under it from where to where, when it
  arrives, which lines and how often you change. Tap **▸** to see each leg, and **In der App öffnen** to open the
  connection in the app it came from — that app knows about delays and platforms. **Karte ›** shows the journey on a
  map.
- **Mahlzeit** — a meal from the [meal plan](meal-plan.md), named by its meal (*Abendessen*), with who cooks and how
  much is bought. Without a time it stands where its meal belongs, the time column saying *abends*. Tap it to open it.

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

Tap the round **+** to add something to the chosen day: **Was**, and if you like a time and a note. Above them, the
shortlisted ideas without a day are offered — tap one to plan it on that day instead.

**Für wen** says whom the entry is for — the hairdresser for one, the kids' club for another. It starts on **Alle**.
Tap a name to make the entry that person's alone, tap more names to add them, and tap **Alle** to make it everyone's
again. A trip with a single traveller doesn't ask. Someone who joins the trip later is on every entry left for
**Alle**; someone who leaves it is taken off the entries that named them.

Tap an entry to change or delete it.

## Adding a connection

Any entry can carry a train, bus or ferry journey — when you write it, or later. Tap **Zugverbindung hinzufügen** in
the entry; a step opens in the same sheet. **‹** takes you back to the entry.

**Search the timetable:** type the departure and the arrival stop (suggestions appear from the third letter); **⇅**
swaps them. Choose **Abfahrt** or **Ankunft** and a time. The connections appear as soon as both stops are set — while
the timetable answers, the sheet says *Verbindungen werden gesucht …*. **‹ Früher** and **Später ›** add more. Tap one
and it is added to the entry. If a stop is not found or the timetable does not answer, the sheet says so. The search
needs a network connection and covers Switzerland, and your instance can switch it off
([Timetable](configuration.md#timetable)).

**From where you are:** tap **📍 Mein Standort** beside **Von**. Your phone is asked once where it is; the stops
nearest to you are offered with their distance, and each connection starts with the walk there (*🚶 3 min · los um
08:03*). Your position goes from your phone to the timetable service, not to your JIT-Pack server. The button needs
the page to be served over HTTPS.

**From the SBB app:** under **Nicht dabei?** tap **SBB-Link**. In the SBB app, open the connection, share it and copy
the link. Then tap **Link aus Zwischenablage einfügen**, or paste the link into the field. It is read at once, and
**Übernehmen** adds the connection to the entry. If the link names another day, the entry moves to that day; the day
plan then shows it.

- The SBB app's short link (`a.sbbmobile.ch/s/…`) is read through your server. In Local Mode, or if your instance has
  link previews switched off, only the full `sbb.ch` link is read. Open the short link in a browser and copy the address
  it leads to.
- The paste button needs the page to be served over HTTPS. Without it, paste into the field.

**Anywhere else:** under **Nicht dabei?** tap **Von Hand** and fill in **Von**, **ab**, **Nach**, **an** and, if you
like, **Linie**. If the arrival time is earlier than the departure, it is counted as the next morning, as on a night
train. A link JIT-Pack cannot read says so, keeps the link and offers the hand fields.

An entry without a title takes *Nach …* from the connection, and one without a time its departure — marked so, until
you type something else. **Entfernen** takes the connection off again and leaves the entry. **Ändern** finds another.

**On a map:** a connection from the timetable or the SBB app shows a small map in the entry — each leg in its colour,
the walks dotted. Tap it for the whole screen. A connection entered by hand has no map.

## Good to know

- Everybody on the trip sees and can change the day plan; it syncs like the rest of the trip and works offline.
- The day plan is the same in all three modes.
- Copying a trip does not copy its entries, and they are **not** in the portable backup file; on a server, the full
  JSON export has them (see [Backup & Export](backup.md)).
