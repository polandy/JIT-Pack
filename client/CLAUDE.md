# CLAUDE.md — the client (`client/`)

The detail of the root `CLAUDE.md`'s rules that only the client has to know. The root file still holds every invariant
in short form; this one is what you need open while changing code below `client/`.

## Invariant 9 — colors, type and icons come from token tables

**Colors come from one token table** — `client/src/theme/palette.css` (`--ct-*`, the *Bergluft* palette, ADR-048: Nacht
dark default, Tag behind `jitpack-day`). Ionic's variables consume those tokens; no parallel color system and no
hard-coded color — **not even as `var(--x, #fallback)`**. One written exception: the §3.28 item mark's glyphs paint
their own colours (ADR-021; confined by FR-28.5/G-15 and `markRendering.spec.ts`). Above the palette sit the **role
anchors** (`--jp-brand`, `--jp-action`, `--jp-done`, G-11/FR-21.7): a component asks for the role. **Type comes from
`client/src/theme/typography.css`** (`--jp-text-*` scale, `.jp-*` role classes): a view never sets its own
`font-family`, `font-size`, `font-weight` or `letter-spacing`. **A screen's name is a role too** — `.jp-page-title`,
rendered once by the frame's `PageHead` from the head each screen registers (G-9, ADR-050); the app bar names no page.
**Icons have their own scale** (`--jp-icon-*`): `font-size` on an `ion-icon` is a glyph box, not a text size (G-13,
FR-21.5/21.6).

## Invariant 9b — shape comes from a third table, enforced by a gate

`client/src/theme/surfaces.css` (`--jp-r*` radius scale, three elevation casts, `.jp-card`). Depth is a role: **page →
card → sunken**, `--jp-surface-*`; Ionic's background variables resolve through them. Elevation is one geometry cast
in the flavour's ink (offsets in `surfaces.css`, ink in `palette.css`). `scripts/design-tokens-gate.mjs` rejects a raw
colour (in every notation), raw type declaration, raw `border-radius` length or raw `box-shadow` in `client/src`
outside the three theme files. Five carve-outs, by rule not allowlist: a `color-mix()` whose colour arguments are all
`var(--…)`/`transparent`/`currentColor`; `50%`; a `0 0 0 <n>px` ring; `letter-spacing: 0`/`normal`; SVG text
(font-size is an attribute in the template). **Why this exists:** a card can pass every colour rule and still be the
colour of the page behind it — only a rendered pixel can tell you (G-14, FR-21.8).

## Vitest

- **A spec declares its own environment.** Default is `node`; a spec whose subject touches `localStorage`, `document`
  or `window` carries a `// @vitest-environment jsdom` docblock **even if the suite is green without it** — production
  code reading a DOM global inside a `try` takes the `catch` under `node` and the spec passes against the error path.
- **The globals come from one harness**, `client/src/__tests__/harness.ts` (`installHarness()` in `beforeEach`):
  pinia, `fetch`, `WebSocket`, response builders. It stubs `localStorage` only under `node`. A spec owns anything
  bespoke and stubs after the call.

## Playwright — a UI change ships a *running* case (owner's rule)

- Cover the global patterns, not only the screen at hand — `client/e2e/global-nav.spec.ts` owns navigation and app-bar
  behaviour.
- Assert what is *rendered*, never only the URL; scope to `ion-router-outlet > .ion-page:not(.ion-page-hidden)`.
- Never a `waitForTimeout`. If nothing observable exists to wait on, that absence is the defect: give the production
  code a signal.
- `client/e2e/README.md` is the on-ramp and holds the rest of the conventions.

## The dev seed

The dev build's M2 empty state carries *„Beispieldaten anlegen (Dev)"*, seeding the master partition
(`client/src/dev/sampleMaster.ts`) and then the sample trip (`sampleTrip.ts`). Standing rule (owner's): **new
master-data features extend that seed**. It is dev-only, writes through the orchestrator's own actions, and is **not
Demo Mode** (removed). The guard is `import.meta.env.DEV` **around the dynamic import**, never a `v-if` on the trigger
(that hides the button and ships the code); `scripts/dev-code-gate.mjs` fails the build if a dev module reaches
`dist`.
