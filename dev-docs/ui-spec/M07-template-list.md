# M7 — Template List

* **Purpose:** Manage modular master templates and the groups they are built from (FR-1.2, §3.27).
* **Elements:** One shared instance-wide list (FR-1.6 MVP simplification — no my/published split, no publish toggle),
  segmented **Alle · Ferien · Gruppen** (FR-27.6) — the middle tab carries the *short* form of the scope name, because
  at 390 px "Ferien-Vorlagen" truncates to an ellipsis and an ellipsis names a scope worse than one word does; the
  section head below spells it out in full. *Alle* renders the two scopes as sections, vacation templates first — they
  are what a trip starts from, groups are the building blocks — and group rows carry a *Gruppe* chip. A section is
  **absent rather than empty** when its scope has no rows, and a single-scope tab drops the head entirely: the segment
  has already said which scope you are in. Per row: name, item count; a composed template counts its **resolved** set
  (own positions + included groups, deduped), so "2 Gruppen · 16 Artikel" rather than "0 Artikel", with an *enthält: …*
  line naming the included groups.
* **States:** No templates at all → the G-7 empty state naming both scopes, and **no segment** — a filter over an empty
  set is a control with nothing to do. The empty state carries **no CTA buttons of its own**: create is the FAB and
  import is the ⋮'s *Datei importieren*, both already in reach, and a third and fourth copy of them would be the empty
  state's only content. Nothing *matching* the search → "Keine Vorlage gefunden", with the segment still in place,
  because there is something to widen back to.
* **Actions:** Tap → M8 (every template is editable by every account); **FAB asks which scope to create** (two-option
  chooser with one-line explanations, FR-27.6) — **but only on *Alle***: on a single-scope tab the segment has already
  answered, so the ＋ creates that scope and the sheet opens on the name, titled with the scope it is about to create —
  **picking a scope reveals the name field in the same sheet** (decided on a rendered variant pass, B1–B3): one surface,
  one commit, and no row exists until the name does. A create-then-rename flow would write an unnamed row on the first
  tap. **Long-press a row (right-click on desktop) → context menu with *Umbenennen*, *Export* and *Löschen*** (Addendum
  FR-18.2), and ***Vorlage teilen…*** after *Export* where the browser can share a file (FR-18.2) — decided on a
  rendered variant pass (A1–A3; a swipe's panel breaks out of the card) — the row itself keeps only what identifies it
  (name, counts, scope chip). Rename is an alert prefilled with the name; delete confirms first and states that
  generated trips keep their rows (FR-2.4), and **a group something includes refuses deletion naming its consumer** —
  the same stance as the FR-27.6 promotion guard, because a cascade would silently rewrite every Vorlage built on it.
  **A group a *trip* has already used is a different case (FR-24.3, *built*):** that delete is not refused — the Vorlage
  is **retired**, kept so FR-9.2's provenance keeps resolving and hidden from this list, from M3's scope rows and from
  M8's group picker. The confirm carries M10's outcome sentence in its three forms, for the same reason and with the
  same wording; the client's own count is advisory and the server's is authoritative (ADR-032); the outcome is stated
  before the tap rather than reported after it in G-2's detail. While the menu is open, row taps are inert. **Import is
  *Datei importieren* behind the app bar's ⋮** → M18 (G-12, ADR-050 amendment 1: a tab root carries the magnifier and
  the ⋮ alone) — ~~the FAB's *Import from file* entry~~ is **not built**: the FAB asks which scope to create and has no
  menu, and a second door to a function that already has one buys nothing. E2E-M7-05 asserts the entry, including that
  the way back lands on M7 rather than on M18's declared parent. **A taken name is met in the sheet, not by a push
  (FR-1.6):** `templates.name` is UNIQUE instance-wide and across both scopes, and the device holds the whole master
  partition, so as the name is typed the sheet carries a line under the field naming what already holds it *and in which
  scope* ("Die Gruppe „Makro“ gibt es schon.") with an **Öffnen** button beside it, and *Anlegen* is disabled. Offering
  the existing row rather than only naming it is the point: someone typing a name that exists almost always means the
  thing that has it. The rename alert refuses the same way — a toast names the holder and the alert **stays open with
  the typed name**, because dismissing it would throw the edit away.
* **Navigation:** Tab 3.
