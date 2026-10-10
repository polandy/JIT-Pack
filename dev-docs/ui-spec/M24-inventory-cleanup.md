# M24 — Aufräumen (Inventory Cleanup, FR-24.12) — *built*

* **Purpose:** the inventory's cleanup rules, each finding beside the one repair that answers it. A rule **finds and
  never refuses** (the PRD says why a refusal cannot exist), so this screen is where the findings go.
* **Elements:** one card per rule the device runs, in a fixed order — *Ohne Tag*, *Lange nicht gebraucht*, *Tag mit nur
  einem Artikel*. A card's head is a status dot (caution while it finds something, done when not), the rule's name, the
  sentence saying what it looks for, and its count. **A rule with nothing to report stays on screen collapsed to „Nichts
  zu tun"** — a rule that vanished when satisfied would read as switched off. The page head's meta line counts the
  findings; with none, a G-7 state *„Alles aufgeräumt"* heads the collapsed cards.
* **Ohne Tag:** per item the leading slot (G-15's inventory ladder), the name, and two controls — the **suggested tag**
  as a dashed chip in the done hue, and *„Tag wählen …"*, which opens FR-24.9's give sheet without its refiling switch
  (an untagged item's first tag is its primary one either way), so it searches and creates. The **reason** sits under
  the controls: *„Vorschlag: wie ‚Zahnbürste'"*, *„Vorschlag: in Vorlage ‚Strand'"*, or *„Kein Vorschlag – es findet
  sich kein Grund."* With two or more suggestions the card's foot offers *„N Vorschläge übernehmen"*.
* **Lange nicht gebraucht:** the name, its primary tag and *„zuletzt auf einer Reise am {Datum}"*; *Stilllegen* in the
  danger hue and *Behalten* as a quiet word. Where the device has not opened every trip in the window (Server Mode,
  ADR-032) a line under the head says how many it has not seen.
* **Tag mit nur einem Artikel:** the tag's mark, its name and *„nur an {Artikel}"*; *Zusammenführen …* (FR-24.10's
  prompt, the same one the tag manager opens) and *Behalten*.
* **Every write raises a snackbar with *Rückgängig*:** a given tag is taken back (and a tag created for it deleted), a
  retire is M23's restore, a *Behalten* is forgotten. The merge is FR-24.10's and confirms before it acts, as it does
  there.
* **Rules sheet:** the app bar's one glyph (*Regeln*) opens a sheet with a toggle per rule and, under *Lange nicht
  gebraucht*, the window as three chips (6 / 12 / 24 Monate). Device-local, no save button, like FR-24.4's sheet.
* **Modes:** all three; the rules are client-side and read only what the device holds. **Before the master partition has
  arrived** the screen says the inventory is not here yet and lists nothing (ADR-033).
* **Navigation:** M9 → M24 (the ⋮ word or the foot sentence); back returns to M9. The one header bar names it from the
  route's `titleKey`.
