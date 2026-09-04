# ADR-020: Touch-first adding to templates — chips in the composer vs. inventory browse-sheet vs. tag tiles

**Status:** Accepted (2026-08-21)
**Related:** FR-25.13/13a/13c/13d, FR-25.7, FR-24.2, FR-5.5, §3.28 (mark slot in offers), UI-Spec M4/M8,
E2E-M8-21/E2E-M4-46

**Decision Drivers (in priority order):**
1. Taps instead of typing for the dominant authoring case — composing a scope out of the *existing* inventory on a
   phone.
2. FR-25.13's "one way to add, everywhere": whatever changes must not fork M8's composer away from M4/M6.
3. Cost of the first shippable step, because the owner wants the improvement in the family's hands before the next
   Urlaub (MVP plan).
4. Scaling to a grown inventory.

The round was decided on rendered mockups in the app's own token system
(artifact "Filling a template without a keyboard", 2026-08-21), not on descriptions —
the G-14 lesson applied to a concept decision.

---

## Considered Options

### Option A — Chip rows in the empty composer *(accepted as the first stage)*

The shared `QuickAddItem` opens **without focus** and, while empty, offers two
chip rows: items sharing a primary tag with the scope's contents ("Passt zu
{Tags}"), and a device-local recents trail ("Zuletzt verwendet"). Already-chosen
items are offered nowhere; typing hides the chips.

**Pros**
- One change to one shared component — lands on M4, M6 and M8 alike, FR-25.13 stays literally true.
- The related row reuses what exists (`getPrimaryTag`, the tag model of FR-24.2); the recents trail is ~40 lines of
  localStorage.
- Removes the silent-duplicate path as a default: what cannot be added is not offered.

**Cons**
- Helps only when the offer hits; systematic "work through the inventory" stays typing.
- Opening without focus costs the typing user one extra tap — on every surface, desktop included.
- Two rows surface at most ~12 items; the rest of the inventory is invisible from here.

### Option B — Inventory browse-sheet *(accepted as the decided next stage, FR-25.13d)*

A bottom sheet over the full inventory: M9's tag axis to filter, one-tap rows
that stay open for runs, "schon drin" as a state instead of a duplicate toast,
free text demoted to an explicit footer.

**Pros**
- The actual answer to "assemble from the bestand": zero keyboard, systematic coverage, ~1 tap per position.
- Reuses the M9 grouping and the FR-27.3 row idiom.

**Cons**
- A new writing sheet component, and a real spec decision: FR-25.13's "one way" must be re-worded into *Erfassen*
  (composer) vs. *Zusammenstellen* (sheet) — or the sheet rolled out to every list screen at once.
- Larger first step; sequencing it behind A costs nothing because A's ghost entry ("Mehr aus dem Inventar…") is its
  natural door.

### Option C — Two-step tag tiles *(rejected)*

First a grid of primary-tag tiles with counts, then that tag's item list.

**Pros**
- Largest touch targets; scales best; makes untagged inventory visible.

**Cons**
- Two levels of navigation *inside a sheet* — a new back-behaviour surface exactly where Track I already hurts.
- Always two steps, even for a five-item household inventory; B's tag axis covers the same scaling without the second
  level.

---

## Decision Matrix

| Driver | Weight | A — Chips | B — Sheet | C — Tiles |
|---|---|---|---|---|
| Taps not typing | 3 | 2 — hits the common case, not the long tail | 3 — covers it whole | 3 — covers it whole |
| One way everywhere | 3 | 3 — same component everywhere | 1 — needs the FR re-worded or a big rollout | 1 — same problem plus sheet-nav |
| First-step cost | 2 | 3 — one component, two small modules | 1 — new sheet | 0 — new sheet with two levels |
| Scaling | 1 | 1 — capped rows | 2 — tag axis | 3 — built for it |
| **Total** | | **22** | 16 | 15 |

A and B are not rivals but stages: A wins the first build, B is decided and
specified as FR-25.13d with A's ghost chip as its entry point. C loses to B
outright and stays rejected.

---

## Decision

Build A now (FR-25.13c): the shared composer opens unfocused and offers chip
rows; already-chosen items are offered nowhere, on M4 as well as M8. B is the
decided next stage (FR-25.13d), not started. C is rejected.

## Consequences

**Positive**
- Common adds on a phone are one tap and no keyboard; M6 improves without being touched, M4 needed only its exclude
  wiring (E2E-M4-46).
- The duplicate toast becomes a rarity — what it reported is no longer offered.

**Negative / accepted costs**
- One extra tap for whoever wants to type, on every surface including desktop — the keyboard now waits for the field's
  own tap.
- The recents trail is per device and deliberately unsynced; another device offers different chips.
- Until FR-25.13d lands, the inventory beyond "related + recent" is reachable only by typing.

**Neutral**
- E2E-M8-13's focus assertion inverted with the behaviour; the mutation-proof discipline covered both directions.

## Revisit Trigger

FR-25.13d's own trigger: the chip rows visibly failing as the inventory grows
past what "related + recent" can surface, or FR-27.13's group search landing
and leaving items as the only unsearchable add path — either starts the B
build rather than reopening this round.
