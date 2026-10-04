# M31 — Essen (a trip's meal plan, §3.33)

* **E2E-M31-01** `local` (FR-33.1/33.10) — **implemented** (`meals/mealplan.spec.ts`): a trip with only an end date has
  no *Meals* pill; one with both has it after *Day plan*, and its days stand one under another, each with an empty
  *＋ Breakfast*, *＋ Lunch* and *＋ Dinner* and the quiet *＋ Snack* at the card's foot, *Arrival* on the first day and
  *Departure* on the last.
* **E2E-M31-02** `local` (FR-33.1/33.2) — **implemented** (`meals/mealplan.spec.ts`): an empty dinner opens a new meal
  on that day; a dish and three ingredients typed as *„500 g Hörnli"* (the amount split off, Enter keeping the focus)
  are written by *Add*, and the slot shows the dish and *0 of 3 ingredients bought*. Opened again, a time and *Out*
  change it — the ingredients go when it is saved — and deleting it asks first, naming the open ingredients, and
  empties the slot.
* **E2E-M31-03** `local` (FR-33.3) — **implemented** (`meals/mealplan.spec.ts`): a meal's ingredients stand on M6
  under *🍽 Meal plan*, each naming its meal; the one of today's meal leads the *Due* block, tomorrow's stays under
  the heading with its pill. Buying one on M6 ticks it in the meal's sheet, and the ring and the shopping bar follow;
  ticking one in the sheet takes it off M6's open list. A past meal's open ingredient is not on the list.
* **E2E-M31-04** `local` (FR-33.4) — **implemented** (`meals/mealplan.spec.ts`): a meal cooked on an earlier trip is
  offered by its dish on a new meal of another trip, filtered by what is typed; taking it fills the dish and its
  ingredients, none bought, marked as coming from that trip.
* **E2E-M31-05** `local` (FR-33.5) — **implemented** (`meals/mealplan.spec.ts`): a meal stands on the day plan as a
  *meal* line — untimed at its slot's place after a timed line before it, with *dinner* in the time column and its
  bought share — and a tap opens its sheet over the day plan.
* **E2E-M31-06** `local` (FR-33.6) — **implemented** (`meals/mealplan.spec.ts`): a lunch on an excursion's day offers
  *Take on the excursion*; switched on, the excursion's list on M27 carries the meal as one line, ticked there and
  counted in its share, and the day plan's excursion line names it. Moved to dinner, it leaves the excursion.
* **E2E-M31-07** `local` (FR-33.7) — **implemented** (`meals/mealplan.spec.ts`): during the trip M1's hero carries
  *Eating today* with today's meals and their open ingredients; a tap opens the meal's sheet, *Meal plan ›* the view.
* **E2E-M31-08** `server` (FR-33.8) — **implemented** (`meals/mealplan.server.spec.ts`): on a trip with two members the
  sheet offers *Who cooks*; the cook chosen stands on M31 and on the day plan, and a bought ingredient names its buyer.
