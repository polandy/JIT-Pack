# Tasks and the Shopping List

A trip's tasks (**Aufgaben**) and its shopping list (**Einkaufen**) work the same way: each is grouped under tags,
and the same gestures file, move and tick off what is on it.

## Moving one entry

Every row you can file carries a grip (three short lines) at its left edge. Press it and drag the row onto another
heading; the heading lights up while it can take the row, and letting go files it there. A snackbar offers
**Rückgängig** to take it back.

On the task list a heading is a tag *inside a phase*, so dragging a task from *Vor der Reise* into a heading under
*Während der Reise* changes both in one move.

Rows that cannot be moved — the packing list's own positions on the shopping list — show a dashed circle instead of
the grip.

## Changing several at once

Hold a row's name for half a second (or right-click it on a computer, or tap the checkbox icon in the app bar) to
start selecting. The app bar at the top turns into the selection's bar: **✕** on the left, how many are selected, and
**Alle** on the right. Nothing on the page moves, so the row you just held stays under your finger. Every row then
shows a checkbox; tap names to add or remove them, or tap **Alle** to take every row you can select. The field for a
new entry stays where it is but rests (dimmed) until you are done. A bar at the bottom offers what you can do with the
selection:

| List | Actions |
|---|---|
| Shopping list | **Tag vergeben** — file every selected entry under one tag |
| Tasks | **Tag vergeben**, or move the selection to **Vor der Reise** or **Während der Reise** |

Only what changes is written, and one **Rückgängig** undoes the whole batch. Tap **✕** in the app bar to leave
without doing anything.

On the task list, done tasks are folded away and are not part of a selection.

## The inventory selects the same way

**Artikel** (the inventory) starts a selection with the same hold, right-click or checkbox icon. There the whole row
is what you hold and tap: outside a selection a tap opens the item, inside one it adds or removes the row. The bar at
the bottom offers **Tag geben**, **Tag nehmen**, **⋯ Mehr** and **Stilllegen**, and **Alle** takes every row the
search and the tag filter leave on screen.

The inventory has no grip: its groups are each item's *main* tag, so moving rows between them is **Tag geben** with
**Als primären Tag setzen** switched on.

**Manage tags** (in the inventory's ⋮ menu) selects the same way too: hold a tag, or tap the checkbox icon beside the
sheet's ✕. The line under the sheet's title then counts the selection, **Alle** appears beside the checkbox icon, and
the bar at the bottom offers **Zusammenführen** once two tags are picked. Tap the checkbox icon again to leave. To change the order of the tags,
drag one by the grip at its left edge, the same grip the tasks and the shopping list use. The sheet that browses the
inventory from a packing list or a template (**Mehr aus dem Inventar…**) heads its groups the way the inventory does,
with each tag's mark and the number of items under it.

## Hidden master data and luggage too

Two more lists select with the same hold, right-click or checkbox icon. Neither has a grip or headings.

**Hidden master data** (Settings → *Ausgeblendete Stammdaten*): while you select, each row's own buttons step aside
and the bar offers **Wiederherstellen** and **Löschen**.

- **Wiederherstellen** brings back every selected row whose name is still free. If an active item or template has
  taken a row's name in the meantime, that row is not restored: it stays selected, and a message says how many names
  are taken. Restore such a row on its own — select only it, or use its own button — and you are asked for a new name.
- **Löschen** removes for good only the rows that have a delete button of their own, i.e. nothing uses them any more.
  One confirmation says how many go; rows that are still used stay hidden and stay selected.

Switching between *Artikel* and *Vorlagen* ends the selection. Neither act can be undone from a snackbar — a restored
row is hidden again by deleting it, as before.

**Gepäck** (a trip's luggage): the rows under *Nicht zugeordnet* select. **In Gepäckstück …** on the bar opens the
usual "which bag?" picker once and puts every selected row into the bag you choose. Outside a selection, tapping a row
still opens the picker for that one row.

## Which menu holds what

A **⋮** menu only holds what belongs to the screen it sits on:

- **Packliste**: **Gepäck**, **Auswertung**, **Packen abschliessen**, and *Namen aus dem Inventar* when the inventory
  has renamed something on the list.
- **Einkaufen** and **Aufgaben** have no ⋮. Reach the luggage and the analytics through the packing list.
- **The trip itself**: *Reise-Eigenschaften*, **Reise starten** and **Reise abschliessen** are on the trip list. Hold
  the trip (or right-click it); the card of the trip you are packing also shows them as buttons. **Reise abschliessen**
  opens the packing list in its closing pass, where you mark what went unused; **Fertig** there finishes the trip.

## Single-User and Local Mode

Both work the same in every mode: grouping, dragging and selecting all happen on your device.
