# Ideas

Before a trip, the people going on it collect what they might do there — a boat trip someone found online, a museum
for a rainy day, a restaurant a friend recommended. **Ideen** is the trip's place for them: everybody on the trip can
add one, say what they think of it, vote for or against it, and decide together which ones you actually mean to do.

## Adding an idea

Open the trip and tap the **light bulb** — the first icon in the row under the trip's name — then the round **+** at
the bottom right. The sheet asks for:

- a **title** — *Bernina Express nach Tirano*;
- a **link**, optional — paste the web address; `rhb.ch` is enough, the app adds the `https://`. Only web links are
  accepted. A pasted link alone is enough: an empty title takes the site's name, so you can add the idea straight away.
  On a server, the link is also read for you: a moment later the page's own title and description appear under the
  link as a suggestion — tap **Übernehmen** to use them, or **Nicht übernehmen** to keep what you have. The page's
  picture is fetched in the background and added to the idea as soon as it arrives, even after you saved, as long as the
  idea has no picture yet; you can remove it like any picture. (Your administrator can turn this off;
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
**Alle** shows everything again. Each idea shows its picture if it has one, its kind, the rain mark, the site its link
points to, the votes and how many comments it has.

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

## Deciding

Tap an idea to open it. On a phone it opens from the bottom; on a wide screen beside the board.

- **Ideen · Shortlist · Gemacht · Verworfen** moves the idea by hand. **Votes never move an idea** — you decide. A
  message at the bottom offers **Rückgängig**.
- **👍 and 👎** — your vote. Everybody sees who voted how; tap your vote again to take it back. The board sorts by
  votes; the **⋮** at the top switches to the newest first.
- **Kommentare** — write below, tap the arrow to send. Tap one of your own comments to edit or delete it; an edited comment says so.
- **Bearbeiten** changes the title, link, note, kind or rain mark. **Idee löschen** asks first, then removes the idea
  with its votes, comments and pictures for everybody — dropping it keeps them.

The link opens the website in a new tab.

## On your own

Votes only mean something when somebody else votes too. On a trip nobody shares — and always in Single-User and Local
mode — there are no vote buttons and no names: the board is a list of your own plans, sorted newest first.

## Good to know

- Ideas are part of the trip: they sync like everything else on it and work offline — except adding a picture on a
  server, which needs a connection, and reading a pasted link, which needs one too.
- Copying a trip does not copy its ideas.
- Ideas are **not** in the portable backup file; on a server, the full JSON export has them (see
  [Backup & Export](backup.md)).
