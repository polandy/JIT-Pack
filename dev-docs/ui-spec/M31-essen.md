# M31 — Essen (A Trip's Meal Plan, §3.33) — *built*

* **What it is:** what the family eats on each day of the trip — the meals, who cooks them and what is still to buy
  for them (Addendum §3.33, ADR-092). The rendered concept is `mockup-meal-plan.html` (2026-10-04). The screen is the
  meals module's (`client/src/meals/MealPlanPage.vue`).
* **Where it lives:** the last pill of the G-9 switcher, after *Tagesplan*, glyph `restaurantOutline`
  (`/trips/:id/meals`, `meta.tripView: 'meals'`, `trip-view-meals`), **drawn only while the trip has both dates**, as
  the day plan's (`absentViews`). The page's name is *Essen*, its meta line the trip's name. Back is M4. A trip without
  both dates opened on the route says *„Der Essensplan braucht Start- und Enddatum der Reise."* (`m31-no-dates`).
* **The shopping bar** (`m31-shop`), at the top while any ingredient is open: *„🛒 7 Zutaten noch zu kaufen"* over
  *„3 davon für heute"* (*„nichts davon für heute"*), and *Einkaufen ›* at its end; a tap opens M6.
* **The days**, one under another, from today during the trip (the first day otherwise). The days already past fold
  into one line above them, *„› 2 vergangene Tage · 3 Mahlzeiten"* (`m31-past`), which opens them in place, dimmed, and
  closes again (*„⌃ Vergangene Tage einklappen"*). Each day (`m31-day-<YYYY-MM-DD>`): a head with the day
  (*„Mo., 12.10."*), *heute* as a pill on today, *🚗 Anreise* / *🚗 Abreise* on the first and last day, else the first
  excursion of the day (*„🪧 Morteratschgletscher"*), and *Tag 3* at its end; then one card holding the day's slots:
  * **A meal** (`m31-meal-<id>`, `data-slot`): the slot's short name in the label role (*Früh*, *Mittag*, *Zw.*,
    *Abend*), the dish in the heading weight with *„· 12:30"* where it has a time, and under it who cooks (avatar and
    *„Lena kocht"*, FR-33.8) and *„3 von 4 Zutaten eingekauft"* (*alles eingekauft*, *keine Zutaten*), *„· 🎒 mit auf
    Morteratschgletscher"* where it goes on an excursion; eaten out *„🍴 auswärts · Pizzeria Mulin"*, the dish led by
    🍴. At its end the ring of its bought share (`m31-ring-<id>`), in the done tone when full, absent without
    ingredients. A tap opens its sheet. Two meals in one slot stand one under the other.
  * **An empty slot** (`m31-add-<YYYY-MM-DD>-<slot>`) of breakfast, lunch and dinner: the label and a dashed
    *„＋ Abendessen"*; a tap opens a new meal's sheet on that day and slot. **The snack slot has no row while empty**,
    only a quiet *„＋ Zwischendurch"* at the card's foot (`m31-add-<YYYY-MM-DD>-snack`) — a fourth empty row on every
    day would be noise.
* **„+" (the FAB, `m31-fab`, `FAB_ANCHOR.m31`)** opens a new meal on the first empty one of breakfast, lunch and
  dinner from today on.
* **The meal sheet** (`meal-sheet`), *„Neu: Abendessen"* or *„Abendessen"* (`meal-sheet-title`) over *„Mo., 12.10. ·
  Tag 3 von 8"*, ✕ (`meal-sheet-close`):
  * **Gericht** (`meal-title`, *„z. B. Älplermagronen, Grillieren"*), focused on a new meal. Under it, on a new cooked
    meal, **Früher gekocht** (`meal-earlier`): up to four chips (`meal-earlier-<n>`) of FR-33.4's dishes, each the dish
    over *„4 Zutaten · Tessin, Mai 2026"*, filtered by what is typed (*Von früheren Reisen*). A chip fills the dish and
    the ingredients, marked *aus „Tessin, Mai 2026"* in the done tone beside *Zutaten* (`meal-earlier-from`), and the
    row goes.
  * ***🍳 Selbst kochen | 🍴 Auswärts*** (`meal-kind`), a segmented control.
  * **Mahlzeit** (`meal-slot-<slot>`) and **Tag** (`meal-day-<YYYY-MM-DD>`, scrolled sideways to the chosen one) as
    chips.
  * **Uhrzeit** (`meal-time`, 24 h, the slot's time as its placeholder) beside **Notiz** (`meal-note`, *optional*).
  * **Wer kocht** (`meal-cook-<userId>`, *niemand* last, `meal-cook-none`), cooked meals in Server Mode with more
    than one member.
  * **🎒 Mit auf den Ausflug „…"** (`meal-excursion`, `role="switch"`), a cooked meal not at dinner on a day an
    excursion covers (the first one, by its first day): *„Steht als eine Zeile im Rucksack. Die Zutaten bleiben auf der
    Einkaufsliste."* under it.
  * **Zutaten** (`meal-ingredients`), cooked meals: *„2 von 4 eingekauft"* at the label's end; a row per ingredient
    (`meal-ingredient-<name>`) — a round tick (`meal-ingredient-tick-<name>`, `aria-pressed`), the name (struck
    through once bought, *„gekauft von Lena"* under it in Server Mode), the amount, its list as a small chip (*Vor Ort*
    / *Vor der Reise*, `meal-ingredient-list-<name>`, a toggle only before the trip's first day and on an open
    ingredient), ✕ (`meal-ingredient-remove-<name>`). Last, the field *„Zutat, z. B. 500 g Hörnli"*
    (`meal-ingredient-add`) with its ＋, Enter adding too and keeping the focus. Under the list: *„Steht in Einkaufen
    unter Essensplan, fällig am Mo., 12.10."*.
  * **Wo** (`meal-place`, *„Restaurant, Hütte …"*), a meal eaten out, and under it **Von der Ideen-Shortlist**: a 💡
    chip per shortlisted idea (`meal-place-idea-<id>`) that fills *Wo* and an empty dish.
  * **Hinzufügen** / **Speichern** (`meal-save`), full width, on once the meal has a dish or a place; it toasts
    *„„Raclette" steht am Mo., 12.10. · 3 Zutaten auf der Einkaufsliste"*. Ticking an ingredient writes at once, as on
    M6; everything else is written by the button.
  * **Mahlzeit löschen** (`meal-remove`) on an existing meal — a destructive confirmation (`meal-remove-confirm`)
    *„„Raclette" löschen?"* / *„2 offene Zutaten verschwinden von der Einkaufsliste. Die Mahlzeit verschwindet für alle,
    die an der Reise teilnehmen."* (the first sentence only where some are open).
  The same sheet opens from M29's meal line and from M1's block.
* **Elsewhere:** M29 draws the meals as lines (FR-33.5, `data-kind="meal"`), M6 the ingredients under *Essensplan*
  (FR-33.3, `m6-group-source-Essensplan`), M27 a picnic as a line of the excursion's list (FR-33.6,
  `m27-extra-meal:<id>`), M1 *Heute essen* (FR-33.7, `dashboard-meals-<trip>`).
* **Modes:** all three; Single-User and Local Mode name nobody.
* (E2E-M31-01…08)
