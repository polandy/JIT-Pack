# ADR-048: The app paints its own palette, *Bergluft* — vs. keeping Catppuccin and fixing everything around it

**Status:** Accepted (2026-09-06)
**Related:** FR-21.2 (one palette, one token table), FR-21.3 (the light flavour), FR-21.7 (the three anchors),
FR-21.8 (planes and elevation), UI-Spec G-11, invariant 9, `dev-docs/design-foundation-plan.md`, the design concept
*Bergluft* presented 2026-09-06, E2E-G11-01…05, E2E-VIS-01…06

**Context.** The owner's verdict on the built app, 2026-09-06, was that it does not look appealing. The design review
that followed found six causes, and only one of them was the palette — but the palette was the one nothing else could
compensate for. Catppuccin is a syntax-highlighting palette: fourteen accents of equal weight, tuned so that every token
class in an editor gets a distinguishable pastel, on a navy ground with a violet bias. A product needs the opposite
shape — one identity, one action, one done, a handful of semantics — and every hue beyond that is noise a screen can
reach for. The three anchors (FR-21.7) had already tried to impose that shape on top of the fourteen, and the rendered
screens still read as an editor theme with a packing list loaded into it: a flat blue-grey ground, an unbroken chain of
`subtext0` labels, and a single warm point, the FAB.

The light flavour showed the same problem from the other side. Latte is Mocha's mirror — the same fourteen pastels at
higher saturation on a pale blue-grey — so page, card and input were three barely distinguishable greys, and the brand
had to be *mixed* darker in the anchor block (FR-21.7's "flavour-relative" clause) because the palette had no value that
worked as text on its own light ground.

What was **not** wrong is the token architecture: three tables, roles above hues, planes above the palette, a gate that
refuses a raw colour anywhere else. FR-21.2 promised that "a future palette adjustment touches one file, not every
component"; this decision is the first time that promise was called in.

**Decision Drivers (in priority order):**
1. **The app has to look like a product, not a theme.** The owner's actual complaint; no amount of role-mapping had
   fixed it on the existing hues.
2. **The light flavour is designed, not derived.** Paper and ink, with accents that clear 4.5:1 as text on both the
   page and the card — measured, not eyeballed.
3. **The architecture stays.** Three tables, the roles, the planes, the gate and every `--ct-*` reference in the views
   survive; the change is values and accent names.
4. **Nobody loses a choice.** A device that opted into the light flavour before the change still opens light after it.
5. **A rendered pixel is the review.** The visual baselines are rewritten in the same PR, so the diff is the evidence.

---

## Considered Options

### Option A — An own palette, *Bergluft*, in the same token table *(recommended, accepted)*

`catppuccin.css` becomes `palette.css`. The two flavour blocks are rewritten as **Nacht** (default) and **Tag**: a
twelve-step neutral ramp that keeps the depth names the views were built on (`crust` … `text`), and ten accents named
for what they are on this palette — `larch` (brand) and `larch-deep`, `glacier` (action), `pine` and `moss` (done),
`straw` (caution), `ember` (danger), `heather` (per-person), `lupine` and `alpenrose` (the brand mark and the avatar
set). The anchors point at the new names; the Ionic mapping, the plane roles, the elevation ink and every element rule
are untouched. The persisted theme value becomes `night`/`day`, and the old `latte` is still read as `day`.

**Pros**
- Fixes the complaint at its root: one warm identity, cool action, green done, and a ground that belongs to the same
  world as the things you tap.
- Tag is thought from white-on-linen; its accents are dark enough that the anchor block no longer mixes a brand for it.
- Every view keeps compiling: 150 accent references were renamed mechanically, ~450 neutral references not at all.
- Exercises FR-21.2's own promise and proves it — the gate, the anchors and the planes all held.

**Cons**
- Rewrites every visual baseline (13 shots × 2 projects) and the PWA icons, the docs logos and the favicon.
- Retires a palette with an ecosystem: nobody can look up "what is `--ct-larch`" on catppuccin.com.
- The accent names are the app's invention and one more thing to learn; the neutrals keep names another project coined.

### Option B — Keep Catppuccin and fix the other five findings

Leave Mocha and Latte in place; remove the Material defaults, rebuild the hierarchy, fix the packing row, cut the
chrome.

**Pros**
- No baseline rewrite, no ADR, no rename; every other finding is addressed the same way regardless.
- The palette stays externally documented.

**Cons**
- Does not address driver 1. The five other fixes were mocked on both palettes during the concept round, and on Mocha
  the result was a tidier editor theme.
- Latte stays a mirror, so the light flavour keeps the mixed brand and the three-greys problem.

### Option C — Adopt another published palette

A product palette from elsewhere (a Material tonal set, Radix colours, Tailwind's scales).

**Pros**
- Externally documented; tonal scales come with contrast guarantees.

**Cons**
- Every such system is a *scale per hue* (50…950), and the app's tables are built on *twelve named steps plus roles*;
  adopting one means either mapping twelve steps out of a scale by hand (which is Option A with borrowed numbers) or
  rebuilding the token vocabulary, which is the architecture driver 3 keeps.
- None of them carries the warm/cool split the concept wants; the brand would again be a colour picked from a list.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| Looks like a product | 5 | 5 — designed for it | 1 — same ground, same fourteen | 3 — competent, generic |
| Light flavour designed | 4 | 5 — white on linen, all accents ≥ 4.5:1 | 1 — mirror stays | 4 — scales guarantee contrast |
| Architecture stays | 4 | 5 — values and names only | 5 — nothing moves | 2 — scale ≠ twelve steps |
| Nobody loses a choice | 2 | 5 — `latte` read as `day` | 5 | 5 |
| Rendered pixel is the review | 2 | 5 — baselines rewritten in the PR | 5 | 5 |
| **Total** | | **83** | 49 | 58 |

---

## Decision

`client/src/theme/palette.css` defines Nacht and Tag, the *Bergluft* palette, and is the only file that knows a hex.
The anchors are `larch`/`glacier`/`pine`; the flavour blocks, not the anchors, carry the flavour-relative differences.
`theme.ts` persists `night`/`day` and reads the pre-ADR `latte` as `day`.

## Consequences

**Positive**
- The screens read as one product in both flavours; the diff of the visual baselines is the evidence in the PR.
- FR-21.7's flavour-relative clause is paid for once, in the flavour blocks — the anchor block is one declaration.
- The unit guard on the brand's rgb twin became a guard on *every* twin in both blocks (a twin that disagrees with its
  hex fails the build), because now every accent is restated per flavour.

**Negative / accepted costs**
- 26 baselines, four icons, three docs logos and the favicon were regenerated; a reviewer has to look at them rather
  than at a number.
- The neutral steps keep names Catppuccin coined (`crust`, `mantle`, `subtext0`). Renaming ~450 references for the sake
  of provenance was judged not worth the diff; the names describe positions in a ramp and do that job on any palette.
- `--ct-*` now reads "colour token". The prefix was kept for the same reason.
- The concept prototype and the variant galleries under `dev-docs/` still paint Catppuccin literals. They are frozen
  artefacts of the decisions they recorded and are deliberately not repainted.

- Doing this found that the visual gate could not see it: every baseline passed against the new bundle, because
  Playwright's default per-pixel tolerance (0.2 in YIQ) exceeds any single token move in this palette. The gate now
  compares at `threshold: 0`, proved to fail on the old baselines and pass on the new (log: *„The visual gate could not
  see the palette change"*).

**Neutral**
- Steps 2–5 of the concept (Material defaults, the packing row, the page head and app bar, the hero/section/sheet
  components) are separate PRs and do not depend on this one beyond the tokens it names.

## Revisit Trigger

A third flavour, or a per-instance brand colour: either would mean the accents need to be *derived* rather than
declared twice, and the hand-kept twelve-plus-ten table becomes the wrong shape. Until then, a palette change is what
FR-21.2 says it is — one file.
