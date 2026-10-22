# ADR-103: *Zu viel* stores the number used — a `needed_quantity` column vs. a step-down proposal

**Status:** Accepted
**Related:** FR-9.6, FR-9.2, FR-27.11, FR-9.1, ADR-067, `trip_items.needed_quantity`, `client/src/domain/review.ts`

**Decision Drivers (in priority order):**
1. The proposal M14 makes must be one the family would have made themselves — a number they gave, not one inferred.
2. Every mode computes it on the device from synced row data (invariant 4, invariant 5).
3. Least new schema; the two existing flags keep their meaning and their readers (FR-14.3, FR-9.5, the facets).

---

## Considered Options

### Option A — a nullable `trip_items.needed_quantity` *(recommended, accepted)*

The verdict *„Zu viel"* records how many were actually used, from 1 to one less than `packed_count`. M14's *fewer*
proposal lowers the group line by the surplus (`packed_count − needed_quantity`), never below 1. Additive migration
`027_needed_quantity.sql`; the column merges field-level LWW like every other row field.

**Pros**
- The proposal names a number the user stated: „4 → 2" is what they said, not a guess.
- One verdict, one column; the flags stay booleans with their existing readers.
- NULL is „no verdict", so existing rows and old clients need nothing.

**Cons**
- A schema change and a migration for one control.
- One more field the *one verdict per row* rule has to clear, and a concurrent offline edit can still leave a flag
  beside a number (M14 shows both proposals).

### Option B — a boolean `flag_fewer`, the proposal steps the line down by one

**Pros**
- Matches the two existing flags; no number to enter.

**Cons**
- A line at 6 that should be 2 takes four trips to get there, and one used at 5 of 6 is proposed the same as 1 of 6.
- Still a schema change — it saves a stepper, not a migration.

### Option C — no storage; a quantity proposal inferred from `quantity − packed_count`

**Pros**
- No schema at all.

**Cons**
- It reads what was *packed*, not what was *needed*: a row packed in full and half used proposes nothing, which is
  exactly the case the verdict exists for.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Proposal the user would make | 3 | 3 — their number | 1 — a step | 0 — answers another question |
| On-device, all modes | 2 | 3 | 3 | 3 |
| Least new schema | 1 | 1 — one column | 1 — one column | 3 — none |
| **Total** | | **16** | **10** | **9** |

---

## Decision

A row judged *„Zu viel"* carries `needed_quantity`, the number used; M14's *fewer* proposal sets the group line to
its quantity minus the surplus, at least 1, the highest result where several rows of one item share the group.

## Consequences

**Positive**
- M14 proposes a concrete line quantity, and the reason beside it (an FR-7.1 comment) says why.

**Negative / accepted costs**
- Migration 027 and a stepper in the verdict sheet.

**Neutral**
- `clone.ts` resets the column with the flags; FR-14.3's trends do not read it yet.

## Revisit Trigger

A trend surface (FR-14.3) wants „used n of m" across trips — then the column is the series' input as well, and its
range rule moves into the shared analytics reader.
