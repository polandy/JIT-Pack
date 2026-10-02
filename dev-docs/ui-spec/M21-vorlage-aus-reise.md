# M21 — Vorlage aus Reise (Template from Trip)

**Built** (Addendum §3.27, FR-27.5), mocked in `UI_Concept_Prototype.html`. A row generated from the old
**Ferien-Vorlage's own** positions is treated as loose rather than recognised, because FR-27.1 forbids a Vorlage
including another one, and it says so differently from an ad-hoc row; the *„Auf der Reise ergänzt"* wording
describes a path the app cannot walk — see FR-27.5's build note. The entry depends on the trip lifecycle M2 offers
(*Reise starten*, then the close).

* **Purpose:** Turn a finished trip back into a reusable template, so the year's learning ends up in the templates
  instead of in the archive. The screen exists because the naive "save as template" (copy everything flat) destroys
  composition: the trip's rows came *from* groups, and a copy would fork them, so next year two divergent camera lists
  exist. M21 is that recognition step, and it is the closing half of the FR-27.1 round-trip (M3 instantiates a template
  into a trip, M21 folds a trip back into templates).
* **Entry:** The closing card at the top of **M4 on an archived trip** — "Reise abgeschlossen", one line of explanation,
  one button "Vorlage aus dieser Reise erstellen →". Nothing else in the app links here. Full-screen with a back
  chevron, no FAB, no G-12 cluster (there is no list to search or filter).
* **Elements (top to bottom):**
  * One explanatory line stating the screen's contract: recognised groups are **referenced, not copied**, and stay
    independently maintainable.
  * **Name der Vorlage** — a text field, prefilled with a next-occurrence guess derived from the trip name. A name
    another template already holds is refused where it is typed (FR-1.6): a note under the field names the
    holder and *Vorlage erstellen* is disabled. There is no existing row to offer here — folding a trip is not an edit
    of the template that happens to share the name — and the check has to precede the screen's **first** write, since
    M21 writes master items and group updates before it writes the Vorlage. The optional bundle group's name is held to
    the same rule, and to one more: the two names this screen writes must also differ from each other.
  * **Erkannte Gruppen · N** — one card per group the trip's rows trace back to (`source_template_id` provenance), each
    with the group's name, "*n* Artikel dieser Reise stammen daraus", and a green **"wird wiederverwendet ✓"** chip.
    Group membership is a fact of the data, not a user choice: recognised groups are always referenced, so there is no
    per-group opt-out here.
  * **Per-group deviations.** A group whose trip rows contain additions names them literally — "Während der Reise
    ergänzt: **Gimbal**" — followed by a two-option segment: **Gruppe aktualisieren**
    (default) vs. **Nur in diese Vorlage**. While *aktualisieren* is selected, a muted line spells out the blast radius:
    the change reaches everything that includes the group and is proposed to the trips that still follow it (FR-27.4).
    Defaulting to *update* is deliberate and matches M14's stance — a change made on the trip is treated as learned
    truth, not as an accident.
  * **Absent positions are reported, never acted on.** Group positions the trip did not carry get one muted line ("…
    waren auf dieser Reise nicht dabei — Gruppe bleibt unverändert"). A skipped tripod is trip history; silently pruning
    the group over it would make every incomplete trip erode the master data.
  * **Eigene Artikel · n von m** — the loose ad-hoc rows (no group provenance), each a checkbox row with its category
    and "ohne Gruppe hinzugefügt", **all pre-checked**. Unchecking is how trip-specific one-offs stay out of the
    template.
  * **"Als neue Gruppe speichern"** toggle — bundles the checked loose rows into a *fresh group* (name field appears
    below, prefilled) instead of dropping them in as own positions, for the case where they form a reusable unit. Off by
    default: the common case is a handful of unrelated extras, and a group per trip would breed clutter.
  * Primary action **"Vorlage erstellen ✓"**.
* **Actions / result:** Creating writes, in this order — (1) deviations marked *aktualisieren* into their group, each
  recorded in the group's change history with its origin ("aus Reise „…“"), (2) the checked loose rows plus every
  deviation marked *nur in diese Vorlage* as own positions — or the loose rows into the new group when the toggle is on,
  (3) the composed **Ferien-Vorlage** itself (FR-27.6 scope, referencing the recognised groups and any freshly created
  one). Ad-hoc rows are matched to master items by tolerant name match (FR-16.3-style, the same fold M14 does); an
  unmatched name creates the master item first (FR-9.2 mechanics). A confirmation snackbar names the template, and the
  screen hands off **directly into M8** on the new template — creation ends where editing continues, and it is also the
  immediate proof that the groups were referenced rather than copied.
* **States:** No recognised groups (a purely ad-hoc trip) → the *Erkannte Gruppen* section is absent and the screen
  degrades to "name it, pick the rows"; no loose rows → the *Eigene Artikel* card shows its empty line and the bundle
  toggle is inert. The source trip is **never modified** by this screen, archived or not.
* **Navigation:** From M4's closing card on an archived trip; exits into M8 on success, back chevron to the packing list
  otherwise.
