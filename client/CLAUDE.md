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

## The kernel's catalogue is split by area

`client/src/i18n/messages/<area>/en.ts` and `de.ts` — `shared`, `inventory`, `templates`, `packing`, `trips`,
`excursions`, `settings` — assembled by `messages/en.ts`/`de.ts`, which change only when an area is added. A key goes
into the area its prefix belongs to; a copy change reads that one pair, not the whole catalogue. Each `de.ts` is typed
against its `en.ts`, so a key missing in German fails the type check in the file it is missing from.

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

## The layers — where a new file goes

`domain → lib → auth → sync → local → edges → kernel → stores → app → composables → components → views`, each
importing only leftwards, with no exception (ADR-096; the table with each layer's role is `CODING_PRINCIPLES.md` §3).
`scripts/layer-gate.mjs` holds the order and refuses a file in no layer. Decide by what the file imports:

- a rule with no I/O → `domain/`; a pure helper that words or formats → `lib/` (no `vue`, Ionic or router there);
- a use case the orchestrator and the CLI share → `app/` (an action group in `app/actions/`);
- a contract between the kernel and a module, or the adapter that fills one → `kernel/` — its shape in `domain/` when a
  module's rules read it (`domain/dayPlanLine.ts` beside `kernel/dayPlanSources.ts`), only the `InjectionKey` here;
- anything reactive or an Ionic controller → `composables/`, into `composables/shared/` if a module mounts it;
- a rule handed a collaborator declares the port it consumes (`ImportMutations` in `domain/portableImport.ts`), its
  option shapes in `types/`, and the caller satisfies it structurally — never `ReturnType<typeof …>` from above.

## The kernel and its feature modules

- `client/src/domain` — the pure client-side rules: quantities, template instantiation, dependencies, containers,
  analytics, review, clone, spreadsheet import, the portable format (`portable.ts`, `portableImport.ts`), members. No
  I/O, exhaustively unit-tested. This is where a Go `internal/domain` ended up, deliberately (invariant 4).
- `client/src/shopping` — the first **feature module** (FR-30.3, ADR-066): its own store, actions and M6, its e2e cases
  in `client/e2e/shopping/`. It and the packing code never import each other; they meet through kernel contracts
  (`kernel/shoppingSources.ts`, `sync/featureModule.ts`, `kernel/tripCards.ts`, `kernel/activityReaders.ts`,
  `kernel/dayPlanSources.ts`) that `App.vue` binds. `scripts/module-boundary-gate.mjs` holds both directions.
- `client/src/planner` — the second feature module (§3.29, ADR-078): ideas, votes, their discussion, pictures and GPX
  tracks and the day plan's entries in tables of its own, M28 and M29, its pure rules in `planner/domain/` (held by
  `domain-purity-gate.mjs` too), its e2e cases in `client/e2e/planner/`.
- `client/src/meals` — the third (§3.33, ADR-092): meals and their ingredients, M31 and the one meal sheet the shell
  mounts, its rules in `meals/domain/`. It reads the trip through `kernel/mealContext.ts` and reaches M6, M29, M27
  and M1 through `kernel/shoppingSources.ts`, `kernel/dayPlanSources.ts`, `kernel/excursionExtraLines.ts` and
  `kernel/tripCards.ts`.
- **A module's words live in the module** — `client/src/<m>/i18n/en.ts`/`de.ts`, read by `t()` through
  `i18n/index.ts`, so a copy change stays a module-only diff (ADR-079 amendment). A key only the module reads goes
  there; one the kernel reads too stays in `i18n/messages/`. The boundary gate holds it.

## Invariant 4 in full — generation runs client-side

Template instantiation, dependency resolution, quantity suggestions, analytics, review, cloning and import live in
`client/src/domain` because **Local Mode has no server** and must keep every one. **And there is only one of each**
(ADR-008 driver 2, ADR-025): the Go side no longer knows the portable format exists; `GET /me/export.json` and
`GET /trips/{id}/export.csv` stay because neither has a client twin. Anything outside the browser that needs these
rules runs *this* code (the FR-18.7 import command is a Node program over `domain/portableImport.ts`). **A rule must
never be reachable only through a Vue composable**, and **the arrow never turns round**: a `client/src/domain` module
imports `types/`, `api/` and its own siblings — an allowlist — and never Vue, `vue-router`, `pinia` or Ionic, type-only
imports included, without exception. `scripts/domain-purity-gate.mjs` holds the direction.
