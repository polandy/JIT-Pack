# M23 — Hidden Items and Templates (FR-24.3) — *built*

* **Purpose:** The way back from a retire. FR-24.3 hides a master item or Vorlage that something still uses instead of
  removing it; without this screen no surface would list those rows — the data half of the FR's "free restore" would be
  unreachable, making a retire one-way in practice.
* **Where it lives, and why not in M9/M7.** Off **M17's own section**, beside the conflict-log pointer, because it is
  the same kind of surface: corrective, opened after something went wrong, never during browsing. Three alternatives
  were weighed and rejected. A **filter chip on M9's tag axis** puts hidden rows one tap from the normal flow, which is
  the opposite of what retiring them is for, and a lifecycle state is not a tag; the same chip would then be owed on
  M7's scope segment, which is also not a lifecycle axis. A **folded section at the foot of M9 and M7** is two surfaces
  for one rule, in the screen FR-24.4 deliberately made lean. A **`?retired=1` mode of M9** inherits a grouping, a tag
  axis, a property sheet and a FAB that all mean nothing for a list whose only actions are *restore* and *delete for
  good*.
* **A row that got here by a merge says so (FR-24.15):** beneath the retire date it names the surviving
  item — *„zusammengeführt mit ‚Stirnlampe'"* — because a bare *Wiederherstellen* is otherwise an offer to re-create
  the duplicate the user has just removed. The restore is ADR-034's act unchanged and additionally **clears the merge
  alias**: a row that is active again has a past of its own. What it does *not* bring back are the references the
  merge moved — the tags, positions and companions are the survivor's now.
* **Elements:** the FR's sentence in one line, then a two-value segment — *Artikel (N)* / *Vorlagen (N)* — and one card
  list per side, **newest retire first**, because the row someone wants back is almost always the one they just lost. A
  row carries the mark, the name, the date it was hidden, and its usage count. **Both segments are always present, and
  an empty one says so** — "nothing is hidden" is an answer, and a screen that renders only the non-empty half cannot
  give it.
* **Restore** is a single button, **with no confirm step**: it is non-destructive and undone by the same delete that hid
  the row, so a dialog would ask the user to agree to what they just asked for. A toast names what came back.
* **The name may be gone (the hard case).** Retiring *frees* the name — `UNIQUE (name)` on both tables is a partial
  index over the active rows (FR-24.3), because re-creating what you just deleted is the common case — so an active row
  can hold it by the time the restore is asked for, and two active rows of one name is what FR-16.3/FR-1.6 exist to
  prevent. The refusal is met **before the mutation is enqueued**, on the client, over the complete master partition
  every device holds: this is the one FR-24.3 question the client can answer *exactly* in all three modes, unlike the
  reference count ADR-032 had to make advisory, and in Local Mode it is the only guard there is. Letting the push refuse
  it instead would show an optimistic restore that reverses itself a moment later (ADR-031), for an answer the device
  already had. **The refusal carries its own way out**: an alert names who holds the name and offers a text field
  prefilled with the old one; *Wiederherstellen* writes the new name **in the same mutation** as the cleared marker (two
  writes would leave a moment where the index is violated, and the second can be the one the outbox drops). A
  replacement that is also taken re-states the refusal and **keeps the alert open with the typed name** — M7's rename
  idiom, for the same reason: dismissing it would throw the edit away.
* **Delete for good** is offered on a row **only where the delete would actually be physical** — i.e. where FR-24.3's
  second branch now applies because whatever kept the row alive is itself gone. Without it a retire would become
  permanent by omission: the row would be unreferenced and undeletable forever. Where the row is still referenced the
  button is absent and the usage count says why, rather than a control that silently re-retires. The bin stands
  **before** *Wiederherstellen*, so the restore button ends at the same edge on every row. The confirm
  carries M10's three-form outcome sentence unchanged, including the Server-Mode hedge.
* **Several at once (FR-24.3, ADR-075 amended):** M23 selects the way M6, M25, M9 and M11 do. A **hold** on
  a row (500 ms, or a right-click) starts the mode with that row picked, as does the app bar's checkbox glyph — offered
  while the segment shown has a row. While selecting, the app bar carries ✕, the count and *„Alle N"* over the segment
  shown (G-20), each row carries a `SelectBox` and **its own two buttons step aside**, a tap picks, and a
  `BulkBar` offers **Wiederherstellen** and **Löschen** (the `danger` button). Outside the mode a tap on the row does
  nothing. Switching the segment ends the selection — it belongs to the list it was made in.
  * *Wiederherstellen* restores every selected row whose name is free, in one go, and **leaves the colliding rows
    selected**; the toast says how many came back and how many names are taken (*„2 Einträge sind wieder sichtbar. Ein
    Name ist vergeben — …"*). A selection of **one** is the single-row restore, so a collision there meets the rename
    alert above. No alert per collision in a batch: a queue of prompts is worse than a list of what is left.
  * *Löschen* deletes for good only the selected rows that carry their own delete button; one confirmation names the
    count (*„2 Einträge endgültig löschen?"*) and, where some are still used, adds that those stay hidden — they stay
    selected. A selection with nothing deletable asks nothing and says so in a toast. Neither act has an undo, like the
    single ones. No grip, drag or headings. (E2E-M23-06)
* **Modes:** all three. The screen is master data, so it is not gated on `authed`; in Local Mode the client's name check
  is the only thing between the user and two indistinguishable rows.
* **Navigation:** M17 → M23; the row carries the count of hidden rows and is silent when there are none. Back returns
  where it was opened from (the fifth route class, ADR-011). **The screen renders no heading of its own** — the
  one header bar names it from the route's `titleKey`, which is why the title is short enough not to truncate in either
  language, and why E2E-G9-14 asserts the bar rather than the page.
