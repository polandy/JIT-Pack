# ADR-080: A date range is one field — an own calendar of stacked months vs. two date fields vs. Ionic's multi-select

**Status:** Accepted
**Related:** ADR-035 (form controls wear the theme), G-17, FR-2.1b, FR-2.1d, FR-31.1,
`client/src/components/global/DateRangeField.vue`, `client/src/lib/dateRange.ts`

**Decision Drivers (in priority order):**
1. **A span is picked as a span.** A trip, a clone and an excursion each have a first and a last day. Two
   `DateField`s meant two sheets, two calendars, and a second calendar that opened on the first one's month only by
   luck; the length of the span was nowhere on screen while it was being chosen.
2. **No inverted range, still no validation** (FR-2.1d). The pair has to stay unreachable rather than refused.
3. **Wears the theme** (ADR-035, G-17): the app's sheet, locale, Monday first, token colours.
4. **No new dependency** (NFR-4.3).

---

## Considered Options

### Option A — an own range calendar: one field, one sheet, months stacked *(accepted)*

`DateRangeField` shows the range through `formatDayRange` with its length as a pill, and opens one sheet: the two
sides in its head (*Beginn*/*Ende*, *Von*/*Bis*), the weekday row, and the months one under the other, scrolled to
the range's month. The first tap sets the start and moves on to the end, the second sets the end, the same day twice
is a one-day range; a tap on a side in the head chooses which one the next tap sets, so one side moves alone and an
end alone stays enterable (FR-2.1b). The tap rule is a pure function (`lib/dateRange.ts`): an end tapped before the
start becomes the start, a start past the end drops the end — so no sequence of taps holds an inverted pair. The
grid is plain buttons, so a bound (`min`/`max`) is a disabled day, and an e2e case taps a day by `data-day` rather
than walking a calendar with the keyboard.

### Option B — keep two `DateField`s that bound each other (the status quo)

Nothing to build. Every drawback of driver 1 stays: two sheets per span, no length while choosing, and on a phone
the two fields side by side (M27) cramped to half width each.

### Option C — Ionic's `ion-datetime` with `multiple`

Ionic has no range mode. `multiple` selects a *set* of days, so the range would be reconstructed from the first and
last day selected and the days between would have to be painted by hand into its shadow DOM, which Ionic does not
expose for styling beyond `::part(calendar-day)`. It is one month at a time, so a range across a month's end is never
seen whole, and it keeps every readiness trap `DateField` documents (the IntersectionObserver, the keyboard walk in
`setDateField`).

---

## Decision Matrix

| Driver | Weight | A — own calendar | B — two fields | C — `multiple` |
|---|---|---|---|---|
| A span picked as a span | 4 | 5 — one sheet, length shown, months stacked | 1 — two sheets | 3 — one sheet, one month at a time |
| No inverted range | 3 | 5 — a pure tap rule, unit-tested | 4 — each field bounds the other | 3 — a set has no order to guard |
| Wears the theme | 2 | 5 — tokens throughout | 4 — Ionic's calendar, themed | 2 — the range band fights the shadow DOM |
| No new dependency | 1 | 5 | 5 | 5 |
| **Total** | | **50** | 29 | 30 |

---

## Decision

Option A. `DateRangeField` is the range control at every site that edits a first and a last day: M3 step 1, M22,
the clone form and M27's sheet. An excursion's calendar is bounded by its trip's days (FR-31.1). `DateField` stays
the single-day control (a task's and a shopping entry's due day) and no longer carries bounds, since the only fields
that bounded each other are now one.

## Consequences

- One component of our own to keep: about 30 lines of rules and a template. The rules are unit-tested apart from the
  component (`lib/__tests__/dateRange.spec.ts`).
- An open side lists 12 months back and 24 ahead of where the sheet opened, and *Frühere Monate* / *Spätere Monate*
  add 12 more at a time. A trip entered after the fact (last July's, a year and more ago) is one or two taps
  further away than a coming one — accepted as ADR-035 accepted that a date cannot be typed.
- An e2e case sets a range with `setDateRange`, a click per day, and no longer needs the keyboard walk
  `setDateField` needs; that walk stays for the single-day fields.
- A stored range that is already inverted (a row from before FR-2.1d, an import) still renders and is repaired by
  picking a new range; the field never hides it.

## Revisit Trigger

A range whose sides are routinely more than a year apart (a season pass, a long stay abroad), where the stacked
months make scrolling the main act — or Ionic shipping a real range mode for `ion-datetime`.
