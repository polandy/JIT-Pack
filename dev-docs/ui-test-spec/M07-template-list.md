# M7 — Template List

Three of M7's ids describe surfaces the screen deliberately does not have — the my/published split, the name prompt,
the FAB's import menu — and are retired in place with their reason.

* ~~**E2E-M7-01**~~ `all` (FR-1.2/1.6) — **retired**, not unimplemented. Its first half is the FR-1.6 MVP
  simplification itself (one shared list, no my-vs-published split): there is nothing to render and therefore nothing
  to assert — the same supersession as E2E-M7-02. Its second half, *per-row name + item count*, is **E2E-M7-07**, which
  asserts the name on every row it filters by and the count as well. *The promise as written:* one shared
  instance-wide list; per-row name + item count.
* **E2E-M7-02** — **superseded by the FR-1.6 MVP simplification:** no publishing, no forking; every
  template is editable by every account. Returns with the parked FR-1.6 model.
* ~~**E2E-M7-03**~~ `all` (FR-1.2) — **retired: the name prompt is rejected by decision, not left unbuilt.** The
  scope chooser carries the name field in the same sheet, so that no row exists before the name does — a `prompt()`
  cannot say what a Gruppe is while you name one. **E2E-M7-08** and **E2E-M7-09** assert that flow, including the write
  that must *not* happen. *The promise as written:* FAB → name prompt →
  creates template → opens M8.
* **E2E-M7-04** `all` (FR-18.2) — **implemented**: long-press → Export → YAML download.
* **E2E-M7-12** `local` (FR-18.2) — **implemented as three tests**: where the browser can share a file,
  long-press → *Vorlage teilen…* hands the share sheet one file, `Makro.yaml.txt` as `text/plain`, carrying the whole
  portable document of that Gruppe (its kind, name and scope); a share that fails other than by dismissal saves
  `Makro.yaml` instead and a toast says so; where the browser cannot share a file the menu carries *Export* and no share
  entry. The share sheet itself is the operating system's, so the case stubs `navigator.share` and asserts the call.
* **E2E-M7-05** `all` (FR-18.4) — **implemented; the FAB-menu clause is struck by decision.** Import from M7 is a header
  icon beside the page title and reaches M18; the FAB opens the scope chooser. A second door to a function that already
  has one buys nothing, and E2E-M7-06 applies the same reasoning to this screen's empty state — create is the FAB,
  import is the header icon, both already on screen. The case asserts that the icon opens M18 and the way back lands on
  **M7**, which is not M18's declared parent (E2E-G9-12 asserts the same rule for the entrance from M2 and names M7
  without covering it, so this entrance could silently have returned to Settings).
* **E2E-M7-06** `all` (G-7) — **implemented, and its CTA clause is retired.** The empty state carries **no CTA buttons
  of its own**, by the decision in UI-Spec M7's *States* line: create is the FAB and import is the header icon, both
  already on screen. What the case asserts instead is the two empty states the screen really has, which share one
  element and are told apart by their words and by the segment beside them: nothing at all names both scopes and drops
  the segment; nothing *matching* says *„Keine Vorlage gefunden"* and **keeps** it, because there is something to widen
  back to (the same shape as E2E-M9-10). Two rows are seeded rather than one, so the term has something to narrow
  **away**: with a single row, a search that ignores its input is indistinguishable from one that works, and only the
  no-match half would fail.
* **E2E-M7-07** `all` (FR-27.1/27.2/27.6): scope segmentation — *Alle* renders Ferien-Vorlagen and Gruppen as two
  sections (vacation templates first), the *Gruppen*/*Ferien-Vorlagen* tabs filter to one scope, group rows carry the
  *Gruppe* chip; a composed template's row shows its group count, its **resolved** item count (not 0 for a template with
no own positions), and an "enthält: …" line naming the included groups. **The resolved-count clause is asserted** in
  `template-list.spec.ts` rather than in the M8 case that carries the rest: E2E-M8-07 builds a composition out of
  groups that are *empty*, so the raw count and the resolved count are both 0 there and the one arithmetic this row
  exists for is invisible to it. The case gives the group a position and asserts the Vorlage
  that owns none reads *1 item* — with the group's own row as the control, since the same sentence arrived at without
  any resolution is what says the number is a fact about the include.
* **E2E-M7-09** `all` (FR-27.6): the ＋ follows the scope segment — on *Gruppen* the chooser is skipped and the sheet
  opens on the name, and the created template is a Gruppe (proved by the editor shape, which has no Gruppen section); on
  *Alle* both options are still offered.
* **E2E-M7-08** `all` (FR-27.6): FAB opens the two-option scope chooser (Ferien-Vorlage / Gruppe with **one-line
  explanations** — asserted on both cards, because a hint on one of them satisfies a sentence that
  means both, and the explanations are the reason the chooser exists at all: *„Gruppe"* alone does not say what it is
  for); picking a scope marks the card and reveals the name field **in the same sheet**, the commit stays disabled until
  a name exists (no unnamed row is ever written — dismissing the half-finished sheet leaves the list untouched), and
  Enter/Anlegen creates the template of that scope and opens the matching M8 editor shape.
* **E2E-M7-10** `local` (FR-1.6, *implemented as two tests*): a taken name never becomes a write. Typing a
  name a **Gruppe** holds into the create sheet's name field for a **Ferien-Vorlage** — differing only in capitals —
  renders a line naming the group that holds it, disables *Anlegen*, and the **Öffnen** beside it navigates to that
  row's editor; a free name in the same field still creates and opens the new template (the positive signal, without
  which "nothing was created" is also true of a broken button). The rename alert refuses onto a taken name with a toast
  naming the holder, **stays open with the typed name**, and the row keeps the name it had; the same menu with a free
  name renames. Local Mode deliberately, because it is the run mode with no constraint behind the client.
