# ADR-049: One Ionic mode on every platform, and the controls Material shaped are told once — vs. per-platform chrome

**Status:** Accepted (2026-09-06)
**Related:** ADR-048 (the palette), ADR-006 (client framework), ADR-011 (one header bar), FR-21.7, FR-21.8, UI-Spec
G-9, G-11, G-13, G-14, invariant 9/9b, the design concept *Bergluft* (step 2 of five), E2E-VIS-01…06

**Context.** Step 2 of the concept is "Material ausbauen": the built app carried Ionic's Material defaults wherever
nothing had overridden them — tracked capitals on every button and segment label, the underlined segment, the 2 px
checkbox corner, a header bar painted as a slab with a drop shadow onto the page — and the concept review named them as
the second of six reasons the app did not read as a product.

Reading the code to remove them turned up something the review had not seen: **the app had no mode at all.**
`app.use(IonicVue)` leaves the mode to Ionic's user-agent detection, so an iPhone rendered the app in iOS chrome — pill
segments, sentence-case buttons, no ripple, swipe-back — while every Playwright project, every visual baseline, every
review screenshot and the owner's desktop browser rendered Material. The family's phones and the design work had never
shown the same product. Every rule about buttons, segments and checkboxes written into the token tables would have
applied to the mode the tests see and been silently overruled by the other.

**Decision Drivers (in priority order):**
1. **One artifact, one look.** Invariant 5's "three modes, one artifact" applies to appearance too: what the suite
   renders is what a person sees, on every device, or the baselines are a screenshot of a different product.
2. **Told once.** A control's shape and case are decided in the token tables, as the FAB's colour already is
   (FR-21.7) — never per screen, and never per platform.
3. **The rendered pixel is the review.** The change lands with its baselines; a reviewer looks at them.
4. **Native feel is nice, not load-bearing.** iOS mode's swipe-back and sheet presentation are pleasant on an iPhone;
   the app is a PWA in a browser, and neither feature is specified anywhere.

---

## Considered Options

### Option A — Pin `md` and restyle its components in the tables *(recommended, accepted)*

`app.use(IonicVue, { mode: 'md' })`. Then, once each: buttons in sentence case and pill-shaped without a shadow;
segments as a pill track on the sunken plane with a card-coloured chosen option and no underline; the checkbox at
24 px with the small radius; the header bar transparent over a page that paints a brand wash, and its Material shadow
removed; the active tab carrying a soft brand pill behind its glyph.

**Pros**
- The mode the suite has always rendered becomes the mode everyone gets; no baseline is a lie about any device.
- Every rule lives in `palette.css`, `typography.css` or `surfaces.css`, guarded by the same gate as the rest.
- Material's *behaviour* stays (ripples, transitions the e2e cases already drive); only its *look* is overwritten.

**Cons**
- iPhones lose iOS chrome they had by accident: swipe-back, the iOS sheet look. Nobody had asked for either.
- Material's md styling has to be overridden variable by variable; a component added later starts Material until its
  rule is written (same standing cost as the FAB rule).

### Option B — Pin `ios` and take its defaults

`mode: 'ios'` gives pill segments and sentence-case buttons out of the box.

**Pros**
- Most of step 2 for free; a native feel on the family's actual devices.

**Cons**
- Every baseline, every e2e case that reaches into a component's shadow parts, and every measured padding in the specs
  were written against md; switching is a rewrite of the test surface with no design gain the tables cannot give.
- iOS mode's own opinions (translucent toolbars, its list dividers, its back-button label) are as much a foreign
  default as Material's, and would need overriding in turn.

### Option C — Leave the mode to the platform, restyle both

Keep the detection and write every rule twice, under `.md` and `.ios`.

**Pros**
- Nothing changes for anyone's device.

**Cons**
- Two of everything, checked by a suite that renders one of them. This is the status quo with its blindness made
  official.

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| One artifact, one look | 5 | 5 — pinned to what the suite renders | 5 — pinned | 1 — two looks by design |
| Told once | 4 | 5 — one rule per control | 3 — defaults, not decisions | 1 — twice per control |
| Rendered pixel is the review | 4 | 5 — baselines already md | 2 — every baseline rewritten for the switch | 2 — half never rendered |
| Native feel | 1 | 2 | 5 | 4 |
| **Total** | | **67** | 51 | 21 |

---

## Decision

The client runs in Ionic's `md` mode on every platform, and the shape, case and chrome of the controls Material would
otherwise decide — button, segment, checkbox, header bar, active tab — are written once in the three token tables.

## Consequences

**Positive**
- The screens the family sees are the screens the suite renders and the reviews judge.
- The Material tells the concept review named are gone from every screen at once, without touching a view.

**Negative / accepted costs**
- iPhone users lose swipe-back and the iOS sheet presentation they had through detection. If that is missed, the
  answer is a *decided* gesture (Ionic's `swipeBackEnabled` works in md too), not a return to detection.
- 26 visual baselines are rewritten again, one PR after ADR-048.

**Neutral**
- The section label's uppercase (G-13) is untouched here; the concept replaces it with a Fraunces section head in
  step 5, which is a typography role, not a Material default.

## Revisit Trigger

A native shell (ADR-006's Capacitor plan) that ships to an app store: a store build may want the platform's own chrome,
and that is the moment to decide per platform on purpose — with both looks rendered by the suite — rather than by
detection.
