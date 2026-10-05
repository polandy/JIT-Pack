# M31 — Essen (a trip's meal plan, §3.33)

* **E2E-M31-01** `local` (FR-33.1/33.10) — **implemented** (`meals/mealplan.spec.ts`): a trip with only an end date has
  no *Meals* pill; one with both has it after *Day plan*. An empty plan is the start (*Nothing planned yet*, no day,
  no shopping bar), whose *Plan a meal* opens the first day's dinner; written, only that day stands as a day (with
  *Arrival*), and the fourteen free days after it are one line, which opens into a row per day; planning from the last
  opens the sheet on its dinner, the day chips scrolled to it, where the planned day wears its dot and a free one
  does not.
* **E2E-M31-02** `local` (FR-33.1/33.2/33.9) — **implemented** (`meals/mealplan.spec.ts`): a new dinner through the ＋;
  a dish and three ingredients typed as *„500 g Hörnli"* (the amount split off, Enter keeping the focus) are written
  by *Add*, and its row shows *0 of 3 ingredients bought* and the shopping bar *3 ingredients still to buy*. Opened
  again, a time is kept (*· 19:00*); deleting it asks first, naming the three open ingredients, and leaves the empty
  plan with no shopping bar. A meal eaten out reads *eaten out · Pizzeria Mulin*.
* **E2E-M31-03** `local` (FR-33.3) — **implemented** (`meals/mealplan.spec.ts`): a meal's ingredients stand on M6
  under *Meal plan*, each naming its meal; the one of today's meal leads the *Due* block, tomorrow's stays under
  the heading. Buying one on M6 ticks it in the meal's sheet, and the row follows; ticking one in the sheet takes it
  off M6's open list. Yesterday's meal folds into *1 meal already eaten* without a day of its own, and its open
  ingredient is not on the list.
* **E2E-M31-04** `local` (FR-33.4) — **implemented** (`meals/mealplan.spec.ts`): the dishes cooked on an earlier trip
  are offered on the empty plan of another, the newest first; a tap opens a dinner — tonight's, the first day's
  before the trip — with the dish and its ingredients taken, marked as coming from that trip. On a new meal they are
  offered by what is typed; taking one fills the dish and its ingredients, none bought.
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
* **E2E-M31-09** `local` (FR-33.2/33.12/33.13) — **implemented** (`meals/ingredients.spec.ts`): on a second trip the
  field shows the amount it reads as one types — *2 Zehen* for *„2 Zehen Knoblauch"*, only *2* for *„2 Kellen Suppe"* —
  and the added row carries *2 Zehen*. The ingredient field offers nothing before a letter; *„r"* offers the first
  trip's *Rahm* and *Reis*, with the amount used last and *used 1× · last on Tessin*; *„300 g Bu"* offers *Butter* at
  *300 g*, which a tap adds and empties the field. Cream reads *🌿 fresh* and butter *keeps* from the built-in list;
  butter set fresh by hand is written with the meal, and the next meal's suggestion of it brings *used 2× · last on
  Engadin*, *300 g* and fresh along.
* **E2E-M31-10** `local` (FR-33.14) — **implemented** (`meals/ingredients.spec.ts`): butter on three meals of a trip is
  one line of M6, *· 1.5 kg* and *3×*, no *🌿*; cream on the first two days is one fresh line *· 3 dl*, the fifth
  day's a line of its own. A tap opens the butter's three parts with their meals and amounts; its tick buys all three,
  one line with *· 1.5 kg* in the bought fold, each meal showing *1 of 2 ingredients bought*. Cream ticked in one meal
  leaves the summed line with the rest.
* **E2E-M31-11** `local` (FR-33.15, G-21, ADR-094) — **implemented** (`meals/mealplan.spec.ts`): Raclette lifted by
  its grip over its own day is carried as a chip saying *stays on …*, and let go there it stays. Lifted again, the free
  days open into rows of their own; over one the row is framed and the chip, above the finger and clear of the row,
  says *→* and the day's name. Let go, the meal stands on that day, its old day is a free line again, and the toast's
  *Undo* puts it back. The picnic carried off its excursion's day leaves the rucksack (*no longer in the rucksack for
  Gletscher*) and keeps its lunch slot. In the sheet, another day chip moves a meal too: the day it leaves is marked,
  the head reads *→*, and *Save* moves it.
