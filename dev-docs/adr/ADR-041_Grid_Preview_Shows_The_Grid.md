# ADR-041: M15's parser preview — the grid itself vs. a summary of it

**Status:** Accepted
**Related:** FR-16.1, NFR-4.7, E2E-M15-01, UI-Spec M15 Step 1, G-9 (wide content), ADR-035 (G-17 file trigger)

**Decision Drivers (in priority order):**
1. **Answer the one question step 1 exists for** — *did the parser read my file the way I meant it?* A delimiter guessed
   wrong, a quoted comma split in two, a ragged row shifted left: each produces a plausible-looking mapping step and a
   wrong import.
2. **A phone is the primary target** (UI-Spec G-9). The owner's real sheets are an item column plus one column per year;
   ten columns is ordinary and thirty is possible.
3. **The page must never scroll sideways** (G-9's rule for wide content) — a horizontally scrolling *document* loses the
   reader's place in the vertical one.
4. **NFR-4.3, footprint.** No table library.

---

## Considered Options

### Option A — Render the grid, scrolling inside its own box *(recommended, accepted)*

The first six parsed rows as a plain `<table>` inside an `overflow-x: auto` container, live while the text is being
pasted. Rows padded to the widest so a short row keeps its shape; the first row carries the header's emphasis; a note
names how many rows were not shown.

**Pros**
- It is the only option that shows a **mis-split cell**, which is the failure the step exists to catch. `Wanderschuhe,
  hoch` arriving as one cell or two is visible at a glance and invisible in any summary.
- Live, so the answer arrives before *Analyze* rather than after — the reader can fix the paste without a round trip.
- No dependency; a table and one overflow rule.

**Cons**
- **A wide sheet needs sideways scrolling inside the box**, which is a gesture the rest of the app never asks for.
  Measured on a 390 px viewport with ten columns: the box is 358 px and its content 617 px, so roughly a third of the
  columns are off-screen at rest.
- Six rows is a guess. A sheet whose header block is three rows shows only three data rows.

### Option B — Truncate to the first N columns, with a "+M more" chip

**Pros**
- Fits the viewport with no new gesture.

**Cons**
- **Hides exactly the columns most likely to be wrong.** The trip columns run to the right, and a delimiter error
  usually shows up as *more* columns than expected — the ones truncation removes.
- A "+18 more" chip tells the reader the parse produced 20 columns without letting them see whether that is right.

### Option C — A column-header list with one sample value each

**Pros**
- Compact, vertical, no new gesture, and it reads like the rest of the app.

**Cons**
- **It is step 2 again.** Step 2 already names the columns and what each was taken for; a second list of the same thing
  adds a screen and answers nothing new.
- Cannot show a ragged row at all, because it has no rows.

### Option D — Leave it unbuilt

**Pros**
- Zero cost; the promise has stood unbuilt since the wizard shipped.

**Cons**
- The owner ruled against it 2026-08-31. And the failure mode is real and silent: a mis-parsed sheet reaches the mapping
  step looking merely confusing, and the reader has no way to tell a bad file from a bad guess.

---

## Decision Matrix

| Driver | Weight | A — the grid | B — truncated | C — header list | D — nothing |
|---|---|---|---|---|---|
| Shows a mis-parse | 5 | 5 — cells are visible as cells | 2 — hides the right-hand columns | 1 — no rows, no split cells | 0 |
| Phone-legible | 3 | 3 — legible, but needs a sideways gesture | 5 — fits | 5 — fits | 5 |
| Page never scrolls sideways | 3 | 5 — the box scrolls, measured | 5 | 5 | 5 |
| Footprint | 2 | 5 — a table and one rule | 5 | 5 | 5 |
| **Total** | | **56** | **46** | **38** | **35** |

---

## Consequences

- Step 1 grows a second surface, and it is the tallest thing on that step. The *Analyze* button stays below it and
  reachable — measured on a 390 px viewport, where the whole step is one screen with the six preview rows and the note.
- **The preview is deliberately not the mapping.** It renders `parseSpreadsheet` output and nothing derived, so it stays
  truthful when the analysis is wrong — which is the case it exists for.
- The row cap is a named constant (`PREVIEW_ROWS`), not a literal, so the next measurement can move it.
- The first parsed row is rendered as `<th scope="col">` rather than a `<td>` wearing a class: a screen reader
  announcing a data table needs the header to *be* one, and the emphasis then follows the element instead of being
  asserted twice.
- A sheet pasted a character at a time re-parses on every keystroke — **once**, not twice: the row list and the row
  count come off one computed, which the first draft had as two calls. Acceptable: the parse is a pure string split over
  text a person can type, and the same call already runs on *Analyze*.

## Revisit trigger

The first sheet whose header block is deep enough that six rows show no data — or the first report of the sideways
gesture being missed. Either moves the cap or brings Option B's truncation back as a *second* view rather than as a
replacement.
