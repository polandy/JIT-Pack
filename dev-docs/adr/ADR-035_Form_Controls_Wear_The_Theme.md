# ADR-035: Browser-rendered form controls — themed Ionic controls vs. deliberately native

**Status:** Accepted (2026-08-26)
**Related:** UX-6 (UX review 2026-08-25), NFR-4.12 (localization), invariants 9/9b (token system), ADR-006 (Capacitor shell planned), G-3 (lock), UI-Spec G-17

**Decision Drivers (in priority order):**
1. The control's text follows the *app's* language (NFR-4.12) — a `de` app must not show "Choose File / No file chosen" or an `mm/dd/yyyy` placeholder because the *browser* is English.
2. The token system's look (invariants 9/9b): a control the browser paints in its own chrome is the one surface the three token tables cannot reach.
3. One date rendering per app: B5 made `formatDay`/`formatTripPeriod` the single temporal formatter; a second, browser-owned rendering of the same date reintroduces the split.
4. Cost of ownership: e2e drivability, accessibility, code kept.

---

## Considered Options

### Option A — Ionic's own controls, wrapped once *(accepted)*

`<input type="date">` is replaced by one shared `DateField` component: a read-only `IonInput` that renders the value through `formatDay` (the B5 formatter) and opens an `IonModal` carrying `IonDatetime presentation="date"` with `locale` set to the app's `intlLocale()` and Monday as first day of the week. The visible `<input type="file">` on the two import screens becomes the pattern the codebase already uses in M10 and M17: a hidden input behind a labelled `IonButton` (`FilePickButton`).

**Pros**
- Every visible string and every painted pixel comes from the catalogue and the token tables; the calendar is the same component the planned Capacitor shell will render natively (ADR-006).
- The one date formatter stays one: the field displays `formatDay`, not a second Intl path the browser owns.
- The file-trigger pattern already exists twice in the codebase — this closes the inconsistency rather than adding a third style.

**Cons**
- A date can no longer be *typed*; the calendar is the only entry path. Acceptable for trip dates (picked, near today), wrong for e.g. a birth date — revisit if such a field ever appears.
- e2e can no longer `fill()` a date; the suite needs a picker-driving helper, and the picker flow is more DOM than an input.
- More code than an attribute: one component, one modal per field instance.

### Option B — deliberately native, documented

Keep `type="date"` and `type="file"`, declare the browser's rendering intentional.

**Pros**
- Zero code; free keyboard entry; the OS picker on mobile is familiar.

**Cons**
- Fails driver 1 outright: the control's language is the browser's, not the app's — on any non-German browser a `de` app shows English control text, and no i18n work can reach it.
- Fails driver 2: unthemable chrome inside token-styled cards reads as unfinished (the UX-6 finding verbatim).
- Splits driver 3: the field renders the browser-locale date format next to surfaces that render `formatDay`.

---

## Decision Matrix

| Driver | Weight | A — themed Ionic | B — native |
|---|---|---|---|
| App-language text (NFR-4.12) | 4 | 4 — catalogue owns every string | 0 — browser owns them |
| Token-system look (inv. 9/9b) | 3 | 4 — tokens reach everything | 1 — foreign chrome |
| One date rendering | 2 | 4 — `formatDay` displays | 1 — second Intl path |
| Cost of ownership | 2 | 2 — component + e2e helper | 4 — zero code |
| **Total** | | **38** | **17** |

---

## Consequences

- One shared `DateField` (`client/src/components/global/DateField.vue`) is the only date control; a view never writes `type="date"` again. It honours G-3 read-only.
- `FilePickButton` (`client/src/components/global/FilePickButton.vue`) is the visible file trigger for M15/M18; M10's photo and M17's avatar keep their existing hidden-input buttons (same pattern, already themed).
- `intlLocale()` becomes an exported member of the i18n module — `IonDatetime` needs the same regional tag the formatters use.
- e2e sets dates through `setDateField` in `fixtures.ts` (opens the picker and clicks the day), not through `fill()`.
- Typing a date is not possible. **Revisit trigger:** a date field whose value is far from today (a birth date, a passport expiry) — the calendar-only path is the wrong entry for those, and the component would need a typed alternative.
