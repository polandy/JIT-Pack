# ADR-093: Summing a meal plan's ingredients — a fresh mark over a fixed window or no summing

**Status:** Accepted
**Related:** ADR-092 (the meal plan, its ingredients shopping lines by projection), ADR-066 (`lib/shoppingSources.ts`),
FR-33.12–33.14, FR-30.2, FR-24.7, `meal_ingredients.fresh` (migration 024), `client/src/meals/domain/ingredients.ts`,
mockup `mockup-meal-ingredients.html` (owner's choices of 2026-10-04)

**Decision Drivers (in priority order):**
1. **Nothing spoils on the way.** Fresh food is bought for its day; a line that tells the family to buy Friday's
   cream on Monday is wrong even if it is shorter.
2. **Staples are bought once.** Butter, rice and potatoes for a week's cooking are one purchase, not one per meal.
3. **No second truth.** An ingredient stays a row of its meal (ADR-092); a summed line is a projection, its amounts
   never written back, and buying it writes each part's own purchase.
4. **Local Mode keeps it** (invariant 4): the rule runs on the client, with no catalogue the server would have to own.

---

## Considered Options

### Option A — a *frisch* mark; durable summed over the trip, fresh only across one day *(accepted)*

Every ingredient is fresh or durable (`meal_ingredients.fresh`, null until set by hand). Unset, it takes its name's
last setting on the device, then a small built-in list of fresh food matched at the end of the name. One trip's open
ingredients of one name (case and spaces aside) are one line: all of them when durable; when fresh, only while they
are due at most one day after the line's first part, counted from that first part so a week of cream never chains.
Amounts add up within a family of units and stand side by side otherwise.

**Pros**
- Both drivers 1 and 2 hold: rice once, cream per day or two.
- The family sets a name's freshness once; every later meal, on any trip, takes it.

**Cons**
- A new column and a migration, and one more chip on every ingredient row of the sheet.
- The built-in list is a guess; a name it misjudges is wrong until somebody taps the chip.

### Option B — no mark; every name summed within two days

**Pros**
- No column, no chip, nothing to set.

**Cons**
- Staples are split across the week: the potatoes for Friday stand again, so driver 2 fails.

### Option C — no summing for fresh food at all, durable over the trip

**Pros**
- The simplest rule that never spoils anything.

**Cons**
- Still needs the mark, and shows two milk lines for Monday and Tuesday that are bought together on Monday.

---

## Decision Matrix

| Driver | Weight | A — mark, one-day window | B — no mark, two days | C — fresh never summed |
|---|---|---|---|---|
| Nothing spoils | 4 | 3 — one day at most | 2 — two days for everything | 3 — never |
| Staples bought once | 3 | 3 — over the trip | 1 — split every two days | 3 — over the trip |
| No second truth | 2 | 3 — projection | 3 — projection | 3 — projection |
| Local Mode, no catalogue | 1 | 2 — a built-in guess | 3 — nothing to guess | 2 — a built-in guess |
| **Total** | | **29** | **20** | **29** |

A and C tie on the matrix; the owner chose A in the mockup because C's two milk lines are a list the family would
merge in their head every morning.

---

## Consequences

- `meal_ingredients.fresh` syncs like every column (field-level LWW); NULL means "not set", so existing rows take the
  learned value or the built-in list without a data migration.
- `ShoppingLine` carries `parts`, `total` and `fresh`; M6 opens a summed line's parts on a tap. Buying, putting back
  and placing a summed line write every part in one batch.
- Own entries and packing rows are never summed with ingredients (FR-30.2): whether they mean the same thing would be
  a guess.
- Ingredient suggestions (FR-33.12) read the same rows: no ingredient catalogue exists, as no recipe book does
  (FR-33.4).

## Revisit trigger

Reopen when the family buys fresh food for more than one day ahead and splits a summed line by hand, or when a
fresh line keeps being bought days early — then the window, not the mark, is wrong. Reopen too when ingredients and
own entries of one name are asked to merge (FR-30.2).
