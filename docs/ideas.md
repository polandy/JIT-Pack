# Ideas

Before a trip, the people going on it collect what they might do there — a boat trip someone found online, a museum
for a rainy day, a restaurant a friend recommended. **Ideen** is the trip's place for them: everybody on the trip can
add one, say what they think of it, vote for or against it, and decide together which ones you actually mean to do.

## Adding an idea

Open the trip and tap the **light bulb** — the first icon in the row under the trip's name — then the round **+** at
the bottom right. The sheet asks for:

- a **title** — *Bernina Express nach Tirano*;
- a **link**, optional — paste the web address; `rhb.ch` is enough, the app adds the `https://`. Only web links are
  accepted. The link then suggests a title and a description: shown grey in the title and note fields (or as a line
  under a field you already filled), each with **Übernehmen** beside it. At first the suggested title is the site's
  name; on a server, a moment later, the page's own title and description. Nothing is filled in until you tap
  **Übernehmen**. On a server the page's picture is also fetched in the background: you see it loading under the link
  and, after you add the idea, on its card, and it becomes the idea's picture as soon as it arrives — as long as the
  idea has no picture yet. You can remove it like any picture. (Your administrator can turn the reading of links off;
  see [Link previews](configuration.md#link-previews).);
- a **note**, optional;
- one **kind** — *Wandern*, *Baden*, *Kultur*, *Essen* or *Ausflug*, or none;
- **Geht auch bei Regen** — for what works in bad weather too.

Tap **Hinzufügen**. The idea appears at the top of **Ideen**, and the light bulb in the row counts the ideas nobody
has decided on yet.

## The board

The board has four parts, each with how many ideas it holds:

- **Ideen** — proposed, nobody has decided yet;
- **Shortlist** — what you mean to do;
- **Gemacht** — done;
- **Verworfen** — dropped. A dropped idea keeps its comments and votes; you can bring it back.

Under them, chips narrow the part you are looking at to one kind, or with the umbrella to what works in the rain.
**Alle** shows everything again. Each idea shows its picture if it has one — or, without a picture, the line of its
first GPX track — its kind, the rain mark, the site its link points to, the first track's distance and climb, the
votes and how many comments it has.

## Pictures

An idea can carry up to **four pictures** — the lake, the view from the hut, the menu. Open the idea and tap
**Bild hinzufügen** under its pictures; on a phone you can take a photo or pick one. The app makes it smaller before
it is stored, so a picture straight from the camera is fine.

- The **first picture** is the idea's cover: the board shows it above the title. In the idea, the cover stands large
  with the next two beside it.
- **Tap a picture** to see it whole. Swipe, or use the arrows, to see the others.
- **Als Titelbild** makes the picture you are looking at the cover.
- **Bild entfernen** asks first, then removes the picture for everybody on the trip.

Everybody on the trip sees the pictures — nobody else can open them. On a server, adding a picture needs a connection:
if the upload fails, the app says so and nothing is added; try again when you are online. In Local mode the pictures
stay on your device.

## GPX tracks

A hike or a bike tour someone planned in a hiking app or found online usually comes as a **GPX file**. An idea can
carry up to **five** of them — the loop from the village and the shorter one with the gondola, side by side. Open the
idea and tap **GPX hinzufügen** next to **Bild hinzufügen**, then pick the `.gpx` file (at most 5 MB). The app reads
it on your device; a file with no track in it, or a larger one, is refused and nothing is added.

The track then appears on a **map** in the idea:

- **The map** shows every track of the idea, each in its own colour, the one you chose in full, with arrows showing
  which way it goes. Inside Switzerland it
  is swisstopo's **Landeskarte**, elsewhere **OpenStreetMap**. Tap the map to see it full screen: there you can move
  and zoom it, switch between **Landeskarte** and **OSM** (the Landeskarte only covers Switzerland), and the square
  button brings the whole track back into view. With several tracks, a chip per track above the map chooses one.
- **The figures** of the chosen track: distance, ascent, descent and highest point. A file without heights shows
  *–* for the last three.
- **How long it takes.** Choose **Wandern** or **Velo** — the app suggests one from the file — and **Mit Kind** for a
  child's pace. A hike is timed with the formula of the Swiss hiking trails; a bike tour at 18 km/h plus 600 metres of
  climbing an hour. With a child, a hike counts 3 km/h, 200 m up and 350 m down an hour, and a bike tour 12 km/h and
  350 m. These are estimates. Add your **Pausen** with − and +, a quarter of an hour at a time: walking (or riding)
  time plus breaks is the time **Unterwegs**. Everybody on the trip sees the same settings.
- **⋮** next to the file's name: **Route bearbeiten** (see below), **Umbenennen**, **GPX herunterladen** (the file exactly as it was added — for your
  watch or your hiking app), **Durch andere Datei ersetzen** (name, kind, *Mit Kind* and breaks stay) and **Track
  entfernen**, which asks first and removes it for everybody on the trip.

Everybody on the trip sees the tracks; nobody else can open them. On a server, adding a track needs a connection —
the map and the figures then work offline. Offline, or where your administrator turned the map tiles off (see
[Map tiles](configuration.md#map-tiles)), the map shows the lines without the map behind them. In Local mode the files
stay on your device.

### Changing a route, or drawing one

A track can be changed on the map — a shorter variant for the child, another way down — the way you plan a route in
the swisstopo app. Choose **Route bearbeiten** in **⋮**, or **Bearbeiten** at the top of the full-screen map. To draw a
route without a file, tap **Route zeichnen** next to **GPX hinzufügen**. Editing needs the map, so it is not available
offline.

- **Tap the map** to add a point at the end. The way there **follows the paths** — or, with **Luftlinie** chosen at
  the bottom left, goes straight.
- **Drag a point** to move it: the stretches on both sides are found again.
- **Tap the line** to set a point there, which you can then drag. Where the route runs along the same path twice — out
  and back — the app asks which of the two you mean, **Hinweg** or **Rückweg**, and shows each on the map.
- **Tap a point** for **Hier starten**, **Hier enden** (the quickest way to a shorter variant) and **Punkt löschen**.
- Down the right edge: undo, redo, **Zurück zum Start** to make it a loop, **Richtung umkehren**, and the whole route.

While you edit, the distance, the climbing and the time follow every change. What you changed is drawn in another
colour over the original, which stays dotted underneath; **Vorher** says how far and how long the original was, and
the height profile at the bottom shows the climbs — move a finger along it to see the place on the map.

**Fertig** asks how to keep it. **Als neuen Track** puts it beside the original — named *(Variante)* unless you change
that — with the original's *Mit Kind* and breaks, so you can compare the two. **Ersetzen** puts it in place of the
original, keeping its name and settings; the original file is gone, but the message that follows has **Rückgängig**.
The app saves the route as a GPX file of its own, which **GPX herunterladen** gives you like any other.

The paths come from **BRouter**, a free route planner on OpenStreetMap's maps, which your device asks directly with
the two points of each stretch; the heights of a straight stretch come from swisstopo. Your administrator can turn
the path finding off (see [Route planning](configuration.md#route-planning)); points are then joined straight.

## Deciding

Tap an idea to open it. On a phone it opens from the bottom; on a wide screen beside the board.

- **Ideen · Shortlist · Gemacht · Verworfen** moves the idea by hand. **Votes never move an idea** — you decide. A
  message at the bottom offers **Rückgängig**.
- **👍 and 👎** — your vote. Everybody sees who voted how; tap your vote again to take it back. The board sorts by
  votes; the **⋮** at the top switches to the newest first.
- **Kommentare** — write below, tap the arrow to send. Tap one of your own comments to edit or delete it; an edited comment says so.
- **Bearbeiten** changes the title, link, note, kind or rain mark. **Idee löschen** asks first, then removes the idea
  with its votes, comments, pictures and tracks for everybody — dropping it keeps them.

The link opens the website in a new tab.

On the **Shortlist**, while the trip has both dates, an idea also gets a **Tag** — the day you mean to do it — and,
if you like, a time. It then stands on that day of the [Day plan](day-plan.md).

## Who is told

On a trip you share, the others hear about the planning without having to look:

- **A new idea** — everybody on the trip is told, except whoever wrote it.
- **A comment** — the person who wrote the idea and everybody who has commented on it are told, never the whole
  trip and never whoever wrote the comment.
- **Shortlist** — everybody on the trip is told when an idea moves there, except whoever moved it.

Votes tell nobody. Tapping a notification opens the idea. Each of the three has its own switch in **Settings** (see
[Notifications & Push](notifications.md)).

## On your own

Votes only mean something when somebody else votes too. On a trip nobody shares — and always in Single-User and Local
mode — there are no vote buttons and no names: the board is a list of your own plans, sorted newest first.

## Good to know

- Ideas are part of the trip: they sync like everything else on it and work offline — except adding a picture or a
  GPX track on a server, which needs a connection, and reading a pasted link, which needs one too.
- Copying a trip does not copy its ideas.
- Ideas are **not** in the portable backup file; on a server, the full JSON export has them (see
  [Backup & Export](backup.md)).
