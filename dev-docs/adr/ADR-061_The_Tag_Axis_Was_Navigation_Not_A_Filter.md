# ADR-061: The inventory's tag axis was navigation, not a filter — chips + sheet + jump vs. cloud vs. dropdown

**Status:** Accepted
**Related:** FR-24.8 (the tag controls), FR-24.2 (filter reaches wider than the grouping), FR-24.6 (the
tool bar that stays), FR-24.3 / ADR-032 (a retired row leaves this list), UI-Spec M9, G-12 (screen
actions in the app bar), `dev-docs/e2e-tests.md` — E2E-M9-14 / E2E-M9-15, ~~E2E-M9-08~~

**Decision Drivers (in priority order):**
1. **No horizontal scrolling** (owner, 2026-09-13). Measured on the family instance: the `ion-segment`
   showed **4 of 24** chips at 390 px, clipped the fourth mid-word, kept no scroll position and gave no
   hint that twenty more existed.
2. **Answer the question the control is actually used for.** **3 of 184 items carry a second tag**, so
   filtering by tag almost never separates anything the primary-tag grouping has not separated already.
   What the axis bought was *arriving* at a group without fifteen screens of swiping.
3. **The bar is sticky, so its height is spent on every screen of the list** (FR-24.6). A control that
   grows with the vocabulary spends that height forever.
4. **It must still work at twice the vocabulary.** 23 tags today; a household that keeps using the
   feature has more, and a control that degrades with use is a control that will be replaced again.
5. **Multi-select must remain reachable**, because §3.24's next phase (bulk tagging out of „Diverses",
   49 of 184 rows) needs it.

---

## Considered Options

### Option A — three chips, a sheet behind them, and the group heading as a jump *(recommended, accepted)*

The tool bar carries the **three tags holding the most items**, each with its count, plus **„Alle N
Tags"** opening a sheet: every tag with its count, searchable, several choosable at once under
*irgendeiner* / *alle*, and the „Ohne Tag" bucket. A chosen tag outside the three gets its own removable
chip. The **group heading becomes a button** that lists the groups with their counts and **scrolls** to
the one chosen.

**Pros**
- Nothing scrolls horizontally, and the bar stays one or two rows at any vocabulary size.
- The common question — „take me to Wandern" — costs two taps and takes nothing out of the list.
- The rarer question — two tags, the untagged bucket — is in a surface built for it, with counts and a
  search the segment could never carry.
- Multi-select comes for free with the sheet, so driver 5 is already paid for.

**Cons**
- **Two mechanisms sit next to each other** (jumping and filtering) and have to be told apart — the
  heading's caret and the chips are the only thing that does it.
- A tag outside the three costs a sheet opening, where the axis needed only a swipe.

### Option B — the same chips, wrapping instead of scrolling

The segment becomes a wrapping chip row, two rows visible, the rest behind „＋ 17 weitere".

**Pros**
- Everything is one tap away with no overlay at all, and each chip can carry its count.
- The smallest conceptual change: the control keeps its identity.

**Cons**
- Expanded, 23 chips fill five to six rows of a **sticky** bar — half a phone screen, permanently, on
  the screen whose job is the list underneath (driver 3).
- It is the one option that gets **worse as the vocabulary grows** (driver 4): at 60 tags the expansion
  is itself a list to scroll.

### Option C — one anchored dropdown („Alle Tags ▾")

A single control in the bar opening a searchable, counted list anchored to itself.

**Pros**
- Cheapest to build, most familiar mechanic, and the button names the active filter at rest.
- Costs one line of the bar at any vocabulary size.

**Cons**
- **One tag at a time.** A menu that marks several entries is no longer a menu, it is Option A's sheet in
  a smaller window — so this forecloses driver 5 and would be replaced by the bulk phase.
- Still an overlay over the list, so it pays A's cost without A's reach.

### Option D — the sheet alone, with no chips

„Filter" opens the sheet; nothing else is in the bar.

**Pros**
- One control, scale-free, nothing to decide about which tags deserve a shortcut.

**Cons**
- Every tag costs the same two taps, including the two or three that answer most questions — the
  frequency information in the data is thrown away.

---

## Decision Matrix

| Driver | Weight | A — chips + sheet + jump | B — wrapping cloud | C — dropdown | D — sheet only |
|---|---|---|---|---|---|
| No horizontal scrolling | 5 | 5 — none anywhere | 5 — none | 5 — none | 5 — none |
| Answers the question actually asked | 5 | 5 — jumping is named as jumping | 2 — still only filtering | 2 — only filtering | 2 — only filtering |
| Sticky bar stays cheap | 4 | 4 — two rows worst case | 1 — five to six rows expanded | 5 — one row | 5 — one row |
| Holds at twice the vocabulary | 4 | 5 — unchanged | 1 — degrades with use | 4 — unchanged | 5 — unchanged |
| Multi-select stays reachable | 3 | 5 — built in | 3 — possible, crowded | 0 — forecloses it | 5 — built in |
| **Total** | | **92** | **48** | **66** | **79** |

---

## Decision

M9's `ion-segment` is removed. The tool bar carries the three tags with the highest item count (ties by
the tag's own `sort_order`, then name, so two devices offer the same three), „Alle N Tags" opening
`TagFilterSheet`, and a removable chip for any chosen tag outside the three. The group heading opens
`GroupJumpSheet` and **scrolls** to the chosen group rather than anchoring it (owner, 2026-09-13): the
rows above stay where they were, so a jump is undone by scrolling back rather than by a second jump.

The matching rules are pure functions in `client/src/domain/tags.ts` (`tagCounts`, `topTagsByCount`,
`filterByTags`), so Local Mode keeps every one of them (invariant 4).

## Consequences

**Positive**
- The two things the segment could not do — a count per tag, and two tags at once — are the two the
  sheet leads with.
- „Ohne Tag" becomes reachable as a filter for the first time; it had a group heading and no control.
- The jump makes the 10 391 px list navigable without taking rows out of it, which a filter cannot.

**Negative / accepted costs**
- **The sort left the tool bar for the app bar's G-12 cluster.** Measured at 390 px, a fourth chip beside
  the three tags and the sheet's opener wraps the sticky bar to three rows. Which order is active is
  legible from the list itself (tag headings, or one alphabetical run) and marked in the action sheet.
- **„Stillgelegt" is not offered as a filter**, although the sheet is the obvious place for it: FR-24.3
  settled that a retired row *leaves* this list rather than becoming a mode of it, and M23 owns them.
  Re-deciding that belongs to FR-24.3, not to this control.
- **The untagged bucket is exclusive.** `filterByTags` reads it faithfully as a member of the selection,
  so under *alle* it contradicts every real tag beside it and yields an empty screen — honest, useless,
  and therefore not offered: picking the bucket clears the tags and picking a tag clears the bucket.
- **Two mechanisms to tell apart.** The heading's caret is the whole affordance for the jump, and it is
  offered only where it is a question: grouped order, outside a search, more than one group.
- **A jump is clamped by the sheet it came from** unless it waits: while an Ionic overlay is presented
  the scroll host is locked, measured as 120 px of a 9 975 px jump. The key is held until the sheet
  reports it has dismissed. No e2e case can falsify that rule — on any list a case builds through the UI
  the whole distance fits inside the clamp — so it is a unit test, and E2E-M9-15 keeps the outcome.

## Revisit trigger

- The three chips stop being the right three: if the owner finds himself opening the sheet for the same
  tag repeatedly, the shortcut should follow *recency* rather than size (the alternative considered and
  not taken on 2026-09-13).
- The jump and the filter are confused for one another in use — then one of the two mechanisms is wrong
  on this screen, not merely labelled wrong.
- The bulk phase lands and the sheet's selection turns out to be the wrong shape for choosing *rows*
  rather than narrowing them.
