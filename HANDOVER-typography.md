# Handover — design foundation, PR 1 (typography)

**Branch:** `feat/design-typography`, branched from `origin/main` @ `1f89f8a`.
**Status: incomplete.** Code and tests are done and green; the doc tail and
`make ci` are not. Delete this file before opening the PR — it is scaffolding,
not a document the repo keeps.

The plan this implements is `dev-docs/design-foundation-plan.md`, "PR 1 —
Typography". Read that first; this file only records what is done, what is
left, and the two places the plan turned out to be wrong.

## Resume on a fresh machine

```sh
git fetch origin && git checkout feat/design-typography
mise install                       # toolchain per CLAUDE.md
cd client && npm ci                # the worktree needs its own node_modules
```

The four `.woff2` files are **committed** — nothing is downloaded at build time
and nothing needs re-fetching.

## What is done

- `client/src/assets/fonts/` — Fraunces and Hanken Grotesk, variable, latin +
  latin-ext, four files, ~180 KB total. Downloaded once from the Google Fonts
  css2 API (Fraunces v38, Hanken Grotesk v12) and committed; see FR-21.6 for
  why they are not fetched at runtime.
- `client/src/theme/typography.css` — the `@font-face` rules, `--jp-font-*`
  families, the `--jp-text-*` scale, `--ion-font-family`, and the `.jp-*` role
  classes. Imported from `main.ts` beside `catppuccin.css`.
- Roles applied: `ion-title` (global), `.jp-page-title` on M2/Items/Templates,
  `.jp-hero-title` on the M1 greeting, `.jp-sheet-title` on M5's item name and
  on the Login/M19 headings, `.jp-num` on M4's packed count. Each of those
  edits also **deleted** the local `font-size`/`font-weight` it replaced, so
  there is one definition per role and no second opinion.
- `client/src/theme/__tests__/typography.spec.ts` — 6 cases. Note it reads the
  CSS with `fs`: Vitest stubs CSS imports, and `?raw` with them, so an import
  asserts against an empty string and passes forever. That was tried first.
- `client/e2e/typography.spec.ts` — E2E-G13-01/-02.
- Specs: PRD Addendum §3.21 gains **FR-21.5** (two faces, one scale, roles) and
  **FR-21.6** (self-hosted); UI-Spec gains **G-13** plus an amendment line;
  UI-Test-Spec gains the two G-13 rows and its section heading now reads
  G-1 – G-13; `e2e-tests.md` gains the unit row and a note on what it does not
  prove.

## Verified

- `npx vitest run src/theme` — 16 passed.
- `npm run build` — clean; the four woff2 are emitted to `dist/assets/`.
- `E2E_PORT=4199 npx playwright test` — **92 passed**, chromium + webkit,
  including the two new cases and every pre-existing one.
- Rendered at 390×844 and compared before/after: M1, M2, M4, M5. Both faces
  paint. The M4 app-bar title truncates ("Sameda…") — **that predates this
  branch**, it is identical on `main`, and it belongs to the app-bar budget,
  not to type.

## What is left

1. **`make ci`** — never run on this branch. Run it before anything else;
   expect `prettier`/`eslint` to have opinions about the new files.
2. **`CLAUDE.md`** — invariant 9 still says colour is the one token table and
   names only `catppuccin.css`. It needs a sentence for `typography.css`, and
   "Not built yet" item 3 should record the typography step as done. Do *not*
   restructure it into 9b — that is PR 3's job and the plan says so.
3. **`dev-docs/design-foundation-plan.md`** — mark PR 1 done, and correct the
   two errors below in place.
4. **`dev-docs/implementation-log.md`** — append the entry (append only, never
   restructure).
5. **`docs/`** — nothing is owed, and that is a decision, not an omission: the
   published manual covers server operation, and FR-21.6 changes nothing an
   operator configures. Say so in the PR body so it does not read as skipped.
6. **The owner's eyeball pass** — the plan makes this the gate *before* asking
   for the merge go-ahead, not after. Screenshots were taken this session but
   live in a scratchpad, so they are gone; re-take them with the recipe below.
7. Delete this file, then open the PR.

### Re-taking the screenshots

There is no committed harness for this (that is PR 5). Drop a throwaway spec in
`client/e2e/`, run it against `--project=chromium` at `{ width: 390, height:
844 }`, and pass `animations: 'disabled'` to `page.screenshot` — without it the
M5 capture catches the sheet mid-transition and looks like a rendering bug.
Build the state through `createTripViaWizard` plus the M4 quick-add, per
UI-Test-Spec §2.4. Delete the spec afterwards.

## Two corrections to the plan

- **"these are all six of its `font-family` declarations, so this list is
  complete"** — it is not. The prototype has more display-face uses than the
  table lists: `.ihead .iname` (24px), `.greet h2` (28px), `.atot .box .n`
  (22px), `.footer-note .big` (19px), plus `.qrow .formula` in a mono stack.
  The scale here covers them; the plan's table should be corrected rather than
  trusted next time.
- **A trip row's name is not a title.** The prototype sets M2 rows in the UI
  face (`.li .nm`), so the tempting blanket `h1, h2 { display }` is wrong — it
  would set every card title in the serif and flatten the hierarchy the serif
  exists to state. G-13 states this explicitly; keep it that way.

## Decisions worth not re-litigating

- **Committed font files, not an npm package.** `@fontsource-*` would have
  worked and satisfies invariant 8 through the lockfile, but it adds two
  dependencies against NFR-4.3 to ship four static assets, and the plan asked
  for `client/src/assets/fonts/`.
- **Raw `px` lives in `typography.css` and nowhere else.** That is deliberate
  groundwork: PR 3's token gate rejects bare `px` in `client/src` outside the
  token files, and a role class that hard-codes `34px` would recreate the magic
  numbers this file exists to retire. There is a unit test asserting exactly
  that.
- **The prototype keeps its Google Fonts link.** It is one file opened from
  disk, not the app; self-hosting it would check the same four files in twice.
