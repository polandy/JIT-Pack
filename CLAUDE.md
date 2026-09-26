# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite, serving the built client from the same origin (one container, ADR-043); Vue 3 + Ionic client (a Capacitor native shell stays planned per ADR-006, and comes back when the native build starts). Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

Read this file fully before touching code. It is the orientation document: what exists, where it lives, and the rules that must not break. It is deliberately short — history lives in `dev-docs/implementation-log.md`, reasoning in the ADRs.

## Commands

- Toolchain: pinned once in `mise.toml`. Run `mise install` per machine; the Makefile re-execs through `mise exec`, so `make ci` works from a plain shell.
- Build: `make build`. Test: `make test` — fast, no docker or network; store/api tests run against real in-memory SQLite. **Not `go test ./...`**: `client/node_modules` ships Go source (`flatted`), which drags coverage under the gate. `GO_PKGS` in the Makefile is the one place that scope is decided.
- **Verify before finishing any change: `make ci`** — mirrors the CI jobs 1:1 (gofmt, build, vet, race tests, coverage gates, golangci-lint, client lint/build/vitest, plus the `client-cli` build, which only runs here). Budget ~80 s cold and ~30 s warm on an idle 16-core machine (measured 2026-09-19); **read the load average before trusting a timing** — a parallel session has turned a 100 s vitest run into 370 s.
- **Slow jobs run on GitHub, not here** (owner, 2026-08-23): `make ci-remote` pushes the branch, dispatches `ci.yml` and waits for the verdict — no PR needed. `e2e`, `visual`, `docker-build` and the coverage profile are excluded from `make ci` on purpose (`make e2e`/`visual` need docker and a built bundle, ADR-013; `visual-update` rewrites baselines; `docker-build` also runs `scripts/docker-smoke.sh`). `make all` runs everything. **`e2e`, `e2e-single` and `e2e-server` skip the `workflow_dispatch` trigger** (owner, 2026-09-22): they stay a pre-PR/pre-merge signal (`pull_request`, `push` to main), not a per-`ci-remote` one — the dev loop was paying for the full e2e matrix on every feature-branch check, before a PR even existed. `visual` and `docker-build` still run under `ci-remote`. **`e2e` and `visual` also skip a diff that touches no app input** — the `changes` job matches every changed path against a list of what is *not* app input (Markdown, `docs/`, `dev-docs/`, unit tests, the gate scripts, the other workflows) and both jobs skip on `pull_request`/`push` too when nothing is left over. A path the list does not name runs them, so a new source location costs a run, never a missed regression. `docker-build` still runs on those, since it is cheap.
- Coverage gates live once, in `scripts/coverage-gate.sh`: **≥75 % overall, ≥90 % `internal/sync`**.
- Client only: `cd client && npm run dev`, `npx vitest run`, `npm run build` (type-check + build).
- **After changing `internal/api/wire.go`: `make wire`** — regenerates `client/src/api/types.ts` and `routes.ts`, both generated, never hand-edited (NFR-4.14, ADR-026/027). `make ci` catches the omission.
- **Test data**: the dev build's M2 empty state carries *„Beispieldaten anlegen (Dev)"*, seeding the master partition (`client/src/dev/sampleMaster.ts`) and then the sample trip (`sampleTrip.ts`). Standing rule (owner, 2026-08-16): **new master-data features extend that seed**. It is dev-only, writes through the orchestrator's own actions, and is **not Demo Mode** (removed, Addendum v2.10). The guard is `import.meta.env.DEV` **around the dynamic import**, never a `v-if` on the trigger (that hides the button and ships the code); `scripts/dev-code-gate.mjs` fails the build if a dev module reaches `dist`.

## Where things live

| Question | File |
|---|---|
| What does the product do? | `dev-docs/PRD_Base.md` (original vision) |
| What changed since? | `dev-docs/PRD_Addendum_v2.10.md` — **always authoritative over PRD_Base.md** |
| What do the screens look like? | `dev-docs/UI_Spec_v1.10.md` — screens M1–M23, global patterns G-1–G-17 |
| What should packing feel like? | `dev-docs/UI_Concept_Prototype.html`; **`node dev-docs/UI_Concept_Prototype.verify.mjs` must stay green** |
| Wire protocol? | `dev-docs/Sync_API_Spec_v1.3.md` |
| DB schema? | `internal/store/schema.sql` — **single source of truth, never duplicated into docs** (ADR-018) |
| Why X over Y? | `dev-docs/adr/ADR-00N_*.md` |
| How do I run and operate this? | `docs/` — the published user manual (`docs/index.md`) |
| What must the UI suite cover? | `dev-docs/UI_Test_Spec_v1.0.md` |
| What does it actually cover, and what is owed? | `dev-docs/e2e-tests.md` — the ledger; read and update it. Opens with an index. |
| How do I run/write an e2e case? | `client/e2e/README.md` — the on-ramp and the binding conventions |
| How do I write code here? | `dev-docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| Which agent CLI reads which config? | `dev-docs/agent-tooling.md` |
| What was built, and why that way? | `dev-docs/implementation-log.md` — append-only; opens with an index, scan it and open only what it names |

Only the current version of each document is kept. Never write a "v2" of a doc — replace the text in place. A spec states the current product only: no revision notes, no dated provenance, no "amended"/"used to" narration — git holds the history. The two append-only ledgers and the ADRs are the exception, since recording history is their job.

## Documentation layout — three tiers, and they do not mix

Which tier a document belongs to is decided by **who reads it**, never by what it is about:

| Tier | Audience | Content |
|---|---|---|
| `README.md` | someone deciding whether to care | A shop window: what, why, quickstart, links onward. No configuration reference, no deployment detail. |
| `docs/` | people **running** JIT-Pack | User manual, published via MkDocs Material (`mkdocs.yml`). Second person, task-oriented. |
| `dev-docs/` | people **developing** JIT-Pack | PRDs, ADRs, specs, log, prototype. Never published; indexed by `dev-docs/README.md`. |

- **A user-visible change updates `docs/`, not just the spec.** A feature is complete when the person running the instance can find out how to use it.
- **Never document what is not implemented.** Every claim in `docs/` is verified against the code, not the spec.
- A new page goes into `nav:` in `mkdocs.yml`; CI runs `mkdocs build --strict`.
- **A `dev-docs/` document wraps at 120 characters** (`scripts/spec-width-gate.mjs`). Exempt: table rows, ATX headings, fenced code, and the two append-only ledgers.
- Never link to `dev-docs/` from `docs/` with a relative path — link to GitHub or restate.

## Not built yet

The packing concept is closed and every numbered backlog item below is done; the reasoning behind each is in the log (scan its index). **Numbers stay stable** because the log and specs refer to them (e.g. „item 19" means NFR-4.12). Real sources of open work, in order: what the owner just asked for; an open `*REVIEW*.md` worklist in the repo root (untracked by convention); `dev-docs/mvp-plan.md` Track H (owner-driven dogfood deployment); a fired revisit trigger in a parked stub or ADR.

1. Basics first (auth, coverage, pinning, `mise`) — 2026-08-09
2. §3.27 client package — 2026-08-21
3. Design foundation and screen rebuilds (`dev-docs/design-foundation-plan.md`) — 2026-08-24
4. i18n migration (unit: a section) — 2026-08-22
5. Migrations 018/019 — 2026-08-11
6. Playwright suite (ledger: `dev-docs/e2e-tests.md`; FR-19.8/ADR-045) — 2026-09-02
7. FR-27.12 looking inside a group — 2026-08-16
8. FR-27.13 searchable M8 group picker — 2026-08-22
9. FR-27.14 a Vorlage shows its resulting items — 2026-08-17
10. FR-2.6 M3 review step, variant A — 2026-08-17
11. FR-5.5 „bewusst nicht einpacken" control — 2026-08-18
12. §3.28 item mark (ADR-021) — 2026-08-22
13. FR-27.15 M8 recognises loose positions as a group — 2026-08-22
14. Multi-user concept's second half (ADR-022, ADR-023). **The G-3 lock stays advisory by decision** (owner, 2026-08-30): refusal would wedge an offline device's outbox — 2026-08-30
15. FR-9.3/9.4 trip feedback — 2026-08-24
16. NFR-4.14 wire contract (ADR-026/027) — 2026-08-24
17. FR-5.7 claims broken by a person, not a clock (ADR-028) — 2026-08-24
18. Second identity in e2e (ADR-029) — 2026-08-30
19. NFR-4.12 notifications localised (ADR-037) — 2026-08-29
20. FR-25.19 responsibility writer — 2026-08-25
21. FR-2.8 M2 default segment (ADR-033) — 2026-08-29
22. FR-25.21 per-person model writer (ADR-036) — 2026-08-30
23. FR-24.3 retire/restore of referenced master rows (ADR-032/034) — 2026-08-25
24. FR-7.4 trip todos (PR #490) — 2026-09-18. Not in the portable backup, like FR-7.3's todos.
25. FR-30 the shopping list as a feature module (ADR-066) — 2026-09-19. Own entries are not in the portable backup either.
26. FR-24.14/FR-24.15 the inventory's two merges — tags in one act, duplicate items at all (ADR-069) — 2026-09-20. The item merge moves master data only: trip history keeps naming the row it was packed from, and `items.merged_into_id` is what makes the two pasts read as one.
27. FR-7.9 trip notes, read by every traveller and ticked per person (ADR-073) — 2026-09-22. Not in the portable backup either, like the shopping list's own entries.
28. FR-7.11/FR-7.12 a task's due day with the server's own morning reminder, and a finished packing closes *before* (ADR-076) — 2026-09-25. The reminder is the one notification Single-User sends.
29. FR-7.13 trip notes as threads — a titled first note, replies one level deep, author-only edits, a tick that reaches the newest entry, replies pushed to the participants — on a view of their own, M26 (ADR-073 amendment note) — 2026-09-25.

**Parked, specified, do not start:** §3.26 calendar feed, the North-Star Plan/During phases, FR-27.8's per-trip usage history, FR-1.6's publish/fork ownership model. Each carries a revisit trigger in its stub.

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config` → one `api.Options`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/wiregen` — `wire.go` → the client's `types.ts` and `routes.ts` (ADR-026/027). Pure leaf: `go/ast` in, string out. `cmd/wiregen` is the thin main.
- `internal/store` — the only package importing `database/sql`. SQLite repositories, change/conflict logs, the two sync partitions (master; trip), schema applied from `schema.sql` on a fresh database and carried forward by the `migrations/` chain on an existing one, with the level in `schema_meta` (ADR-067).
- `internal/webui` — serves the built client beside the API on one origin (ADR-043). Standard library only; does **not** import `internal/api` (prefixes are passed in).
- `internal/api` — HTTP handlers, WebSocket hub, session auth + OIDC broker (ADR-007), notifications, Web Push, admin, export. **`wire.go` is the contract** — envelopes, frame, conflict shapes, error vocabulary, routes. **Export only** — importing is the client's (invariant 4, ADR-025).
- `client/src/domain` — the pure client-side rules: quantities, template instantiation, dependencies, containers, analytics, review, clone, spreadsheet import, the portable format (`portable.ts`, `portableImport.ts`), members. No I/O, exhaustively unit-tested. This is where a Go `internal/domain` ended up, deliberately (invariant 4).
- `client/src/shopping` — the first **feature module** (FR-30.3, ADR-066): its own store, actions and M6, its e2e cases in `client/e2e/shopping/`. It and the packing code never import each other; they meet through kernel contracts (`lib/shoppingSources.ts`, `sync/featureModule.ts`, `lib/tripCards.ts`) that `App.vue` binds. `scripts/module-boundary-gate.mjs` holds both directions. The planner (§3.29) is to follow the same shape.

## Invariants — do not break these

1. **Dependency direction** (verify with `go list -deps`): `api → store, sync`; `store → sync`; **`sync` and `wiregen` import nothing internal, ever**. Pure domain rules live in `client/src/domain`, not a Go `internal/domain`.
2. **A schema change carries a migration** (ADR-067, built 2026-09-21). `internal/store/schema.sql` stays the whole schema, always current, and is what a **fresh** database is built from; an existing one is carried forward by the additive `internal/store/migrations/NNN_*.sql` chain, applied at `Open`, one transaction per step. A schema change is therefore **two edits**, and `TestSchemaChain_EndsWhereSchemaSQLDoes` proves the two end at the same database, column for column — order excepted, since `ALTER TABLE ADD COLUMN` appends where `schema.sql` declares in place. **The level lives in `schema_meta`**, with `PRAGMA user_version` as a readable mirror: a hash and a counter must not share one field, and the migration era left levels 1–23 behind that would read as either. A database from before the chain is placed by its **release fingerprint** (v0.16.0 is the first one listed); anything else — an unknown fingerprint, a migration-era level, a level from a newer build — is refused with `ErrSchemaStale` naming the path, never guessed. **Nothing is recreated or deleted on start-up**, and a development database now survives a schema change.
3. **The client's identity claims are never trusted.** The server stamps actor columns itself (`stampActor` in `internal/api/server.go`: comment `author_id`, a note's `note_acks.user_id` (FR-7.9), `packing_now_by`/`packing_now_at`, `packed_by_user_id` — also stripped from incoming `trip_items` mutations). `packer_user_id` is deliberately *not* stamped: since FR-25.19 it is the assignment. A client placeholder like `'current-user'` must never reach a foreign key. Clients can never grant `owner`, and the trip creator's membership row is immutable.
4. **Generation runs client-side.** Template instantiation, dependency resolution, quantity suggestions, analytics, review, cloning and import live in `client/src/domain` because **Local Mode has no server** and must keep every one. **And there is only one of each** (ADR-008 driver 2, ADR-025): the server's second portable importer/exporter drifted and was deleted, and the Go side no longer knows the format exists. `GET /me/export.json` and `GET /trips/{id}/export.csv` stay because neither has a client twin. Anything outside the browser that needs these rules runs *this* code (the FR-18.7 import command is a Node program over `domain/portableImport.ts`). **A rule must never be reachable only through a Vue composable.** **The arrow never turns round**: a `client/src/domain` module imports `types/`, `api/`, `sync/`, `lib/` and its own siblings — an allowlist — and never Vue, `vue-router`, `pinia` or Ionic. Type-only imports count. The mutation factory is Vue-free: `createMutations` in `client/src/sync/mutations.ts`. `scripts/domain-purity-gate.mjs` holds the direction.
5. **Three modes, one artifact.** Behaviour is selected at runtime, never by a separate build. The client's `jitpack_mode` is only `local` or `server`; **Single-User is server-side configuration** (`api.NewSingleUser`) that a `server`-mode client discovers by being offered no OIDC. Every feature must answer: what happens in Single-User (auth and membership bypassed — anything gated on `authed` is inert) and in Local (no network)? Server-only surfaces are hidden per G-8, not left broken.
6. **Item image BLOBs stay outside the sync envelope** (ADR-002). Only `items.image_hash` flows through the master feed. The 150 KB / JPEG limit is enforced at handler, store and CHECK constraint — three layers on purpose.
7. **Coverage gates are enforced**: ≥75 % overall, ≥90 % `internal/sync`. An uncovered branch in merge logic fails review regardless of the total.
8. **Everything resolves to an exact version verified by hash.** npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA with the tag as a comment. Never a bare tag. Dependabot updates the digests, **except where a version is also a toolchain decision — then it is made by hand**, because CI compiles through `setup-node`/`setup-go`, not the build image. A **node** major is named in the root `Dockerfile`, `mise.toml` and every `node-version:` in `ci.yml`; a **Go** major in the `Dockerfile`, `mise.toml`, `go.mod` and the `golangci-lint` pins in `mise.toml` and `ci.yml`. `scripts/toolchain-pins-gate.sh` compares them (Dependabot's majors arrive red on purpose); it does not judge whether a linter is new enough for the go directive — `make ci` running the binary does. **The Playwright image** in `scripts/playwright-image.sh` is bumped by hand (Dependabot cannot see shell scripts, and a bump rewrites every visual baseline — ADR-013); both scripts check it against `@playwright/test` in the lockfile.
9. **Colors come from one token table** — `client/src/theme/palette.css` (`--ct-*`, the *Bergluft* palette, ADR-048: Nacht dark default, Tag behind `jitpack-day`). Ionic's variables consume those tokens; no parallel color system and no hard-coded color — **not even as `var(--x, #fallback)`**. One written exception: the §3.28 item mark's glyphs paint their own colours (ADR-021; confined by FR-28.5/G-15 and `markRendering.spec.ts`). Above the palette sit the **role anchors** (`--jp-brand`, `--jp-action`, `--jp-done`, G-11/FR-21.7): a component asks for the role. **Type comes from `client/src/theme/typography.css`** (`--jp-text-*` scale, `.jp-*` role classes): a view never sets its own `font-family`, `font-size`, `font-weight` or `letter-spacing`. **A screen's name is a role too** — `.jp-page-title`, rendered once by the frame's `PageHead` from the head each screen registers (G-9, ADR-050); the app bar names no page. **Icons have their own scale** (`--jp-icon-*`): `font-size` on an `ion-icon` is a glyph box, not a text size (G-13, FR-21.5/21.6).
9b. **Shape comes from a third table, enforced by a gate** — `client/src/theme/surfaces.css` (`--jp-r*` radius scale, three elevation casts, `.jp-card`). Depth is a role: **page → card → sunken**, `--jp-surface-*`; Ionic's background variables resolve through them. Elevation is one geometry cast in the flavour's ink (offsets in `surfaces.css`, ink in `palette.css`). `scripts/design-tokens-gate.mjs` rejects a raw colour (in every notation), raw type declaration, raw `border-radius` length or raw `box-shadow` in `client/src` outside the three theme files. Five carve-outs, by rule not allowlist: a `color-mix()` whose colour arguments are all `var(--…)`/`transparent`/`currentColor`; `50%`; a `0 0 0 <n>px` ring; `letter-spacing: 0`/`normal`; SVG text (font-size is an attribute in the template). **Why this exists:** a card can pass every colour rule and still be the colour of the page behind it — only a rendered pixel can tell you (G-14, FR-21.8).

## Testing

Test-first: every behaviour starts as a failing test that reads as its specification, then implementation until green.

- **Naming as specification** — `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`; carry the FR/NFR id.
- **Table-driven** with named `t.Run` subtests for domain logic.
- **Real in-memory SQLite** for store and api tests — never a mocked database. Hand-written fakes behind small consumer-side interfaces; no mocking frameworks.
- **Failure paths** are covered wherever code enforces a correctness or authorization rule.
- **No non-deterministic timing constraints** — in Go, Vitest and Playwright alike: no sleeps, fixed waits or polling for an effect that might not land. If a test can only pass by waiting-and-hoping, give the production code a deterministic seam (injected clock, completion signal, settled state).
- **A Vitest spec declares its own environment.** Default is `node`; a spec whose subject touches `localStorage`, `document` or `window` carries a `// @vitest-environment jsdom` docblock **even if the suite is green without it** — production code reading a DOM global inside a `try` takes the `catch` under `node` and the spec passes against the error path.
- **The globals come from one harness**, `client/src/__tests__/harness.ts` (`installHarness()` in `beforeEach`): pinia, `fetch`, `WebSocket`, response builders. It stubs `localStorage` only under `node`. A spec owns anything bespoke and stubs after the call.
- **A coverage count says how many promises have no test, never how many deserve one.** Measure a screen, not the repository, and never re-derive a headline number to compare against it. An unwritten case is as likely an unbuilt promise as a missing test.
- **Before crediting an assertion, ask whether it would have passed before the action.** An absence needs a positive signal (a recorded call, a settled state, a planted response). A `data-testid` that occurs in no test means no test has operated that control.
- **A case id in a test title is a coverage claim**; `scripts/case-id-gate.mjs` refuses duplicates. On collision **a number means what the suite implements**: the loser is struck through in place and says where its promise went, never renumbered. Run one case with `-g "E2E-M5-05"`.
- **Always `-race`.**

## Working agreement (see CODING_PRINCIPLES.md for detail)

- **Never commit to `main`.** One git worktree per feature under `.claude/worktrees/`, branched from `origin/main` → PR → green CI → **wait for the merge go-ahead**. Merge with a hand-written squash subject; release-please derives the changelog from it. One open PR at a time.
- **A feature PR is complete**: backend + the client UI that exposes it + the spec update in `dev-docs/` + an ADR when a real tradeoff was decided + the `docs/` page when visible to whoever runs the instance. Never "UI in a follow-up", never "docs later".
- **A UI change ships a *running* Playwright case** (owner, 2026-08-13):
  - Cover the global patterns, not only the screen at hand — `client/e2e/global-nav.spec.ts` owns navigation and app-bar behaviour.
  - Assert what is *rendered*, never only the URL; scope to `ion-router-outlet > .ion-page:not(.ion-page-hidden)`.
  - Never a `waitForTimeout`. If nothing observable exists to wait on, that absence is the defect: give the production code a signal.
- **An ADR is owed only for a real tradeoff** — options weighed, one chosen at a cost. Not for additive config fields or mechanical refactors.
- Run `/pr-review` on your own PR before asking for the go-ahead — every PR; its verdict comment is the evidence, and a missing verdict is a blocker.
- **English throughout — including quoting the owner.** Specs, ADRs, log, comments, commits and PR text are English; a German request is *translated*, never pasted as a „…" quote. Exception: German that is **content** (UI labels and screen copy being specified, seed data, mark-index keywords, the `de` catalogue). Comments justify *why*, never *what*; godoc on exported symbols is mandatory.
- **No magic strings or numbers** (CODING_PRINCIPLES §4a): a literal compared against, switched on, or repeated across files is named once — `store.Table*`/`RoleOwner` in Go, `TABLE` in `client/src/types/tables.ts`.
- Standard library first — a new dependency needs a one-line justification (NFR-4.3).
- Conventional Commits, types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` (`build:` only where Dependabot generates it). Reference spec ids (`FR-5.4`, `NFR-4.2a`).

## Don'ts & pointers

- A migration is no longer forbidden, it is **owed**: a schema change edits `internal/store/schema.sql` *and* adds `internal/store/migrations/NNN_*.sql`. The two deny rules that used to stop it are gone with the rule they enforced; what replaces them is the chain gate, which fails the pair when they disagree.
- Don't restructure `dev-docs/implementation-log.md`; append to it **only when the work earns an entry** (its own "What earns an entry" section: what the code cannot show — a rejected option, a wrong premise, an accepted cost, a trap). An entry also gets an index line (`scripts/log-index-gate.mjs`).
- Don't grow `CLAUDE.md` with history — it is loaded in full every session. A closed item is one line.
- Don't duplicate the schema into docs, or an ADR's rationale into a code comment — `// see ADR-00N` is enough.
- Don't judge a UI change from the stylesheet. Render it, look at it, and let the maintainer eyeball it before the Playwright case is finalized.
- **Run `make fmt` before pushing** if `make ci` complains: the CI `format` job *checks* gofmt and prettier (ADR-040).
- **The e2e shard count is a measurement, not a constant.** It is 10 (`ci.yml`), sized 2026-09-18 against ~2940 test-seconds; a growing suite makes it stale silently, so when e2e feels slow read the per-leg times of a recent run first. **And a single run cannot resolve a leg-count change**: the runners' variance is the size of every effect worth chasing (502 s and 583 s for the same configuration, 2026-09-20) — log: 'Three CI levers, two measured worse than nothing and one disproved'.
- **CI/CD** (`.github/`): `ci.yml` (go, go-lint, client, format, visual, e2e ×N, e2e-single, e2e-server, docker-build, dependabot-merge), `docker.yml` (image to ghcr.io on `v*` tags, ADR-043), `release.yml` (release-please). A `concurrency` group supersedes a superseded **pull-request** run; a push to main is never cancelled. **`main` is protected**: required checks `go`, `go-lint`, `client`, `format` (ADR-040), `docker-build`; no force-push or deletion, linear history, admins not exempt, no review approvals required. `e2e` and `visual` are deliberately **not** required (a sharded matrix would need every leg named; `dependabot-merge` waits for them). If a required check wedges: `gh api -X DELETE repos/polandy/JIT-Pack/branches/main/protection`, merge, re-apply.

## Deviations

None open. History in `DEVIATIONS.md`.
