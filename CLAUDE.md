# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite, serving the built client from the same origin (one container, ADR-043); Vue 3 + Ionic client (a Capacitor native shell stays planned per ADR-006). Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

Read this file fully before touching code: what exists, where it lives, the rules that must not break. Two subtree files carry the detail of the rules that only apply there — **`client/CLAUDE.md`** (design tokens, Vitest and Playwright conventions, the dev seed) and **`internal/CLAUDE.md`** (schema chain, server-stamped identity, Go tests). Read the one for the side you change. History lives in `dev-docs/implementation-log/`, reasoning in the ADRs.

## Commands

- Toolchain: pinned once in `mise.toml`. Run `mise install` per machine; the Makefile re-execs through `mise exec`, so `make ci` works from a plain shell.
- Build: `make build`. Test: `make test` — fast, no docker or network. **Not `go test ./...`**: `client/node_modules` ships Go source (`flatted`), which drags coverage under the gate. `GO_PKGS` in the Makefile is the one place that scope is decided.
- **Verify before finishing any change: `make ci`** — mirrors the CI jobs 1:1 (gofmt, build, vet, race tests, coverage gates, golangci-lint, client lint/build/vitest, plus the `client-cli` build, which only runs here). It prints one line per target and a failing target's output in full; `make ci V=1` streams everything. Budget ~80 s cold and ~30 s warm on an idle 16-core machine; **read the load average before trusting a timing** — a parallel session has turned a 100 s vitest run into 370 s.
- **Slow jobs run on GitHub, not here** (owner's rule): `make ci-remote` pushes the branch, dispatches `ci.yml`, waits quietly and prints the job verdicts — and, when red, only what failed. `e2e`, `visual`, `docker-build` and the coverage profile are excluded from `make ci` on purpose (`make e2e`/`visual` need docker and a built bundle, ADR-013; `visual-update` rewrites baselines); `make all` runs everything. The **e2e jobs skip `workflow_dispatch`**: they are a pull-request and push-to-main signal, not a per-`ci-remote` one; `visual` and `docker-build` still run there. **`e2e` and `visual` skip a diff that touches no app input** (`scripts/diff-scope.mjs` — a path its list does not name runs them, so a new source location costs a run, never a missed regression), and **a pull request inside one feature module runs e2e on one leg** (ADR-079; `--grep "@<module>|@smoke"`, locally `make e2e-module M=planner`).
- **A red CI run: `node scripts/ci-failures.mjs [<run-id> | --pr <n>]`** — the failing assertions and their source lines, without the image pulls and attachment banners around them. `gh run view --log-failed` only when that is not enough.
- Coverage gates live once, in `scripts/coverage-gate.sh`: **≥75 % overall, ≥90 % `internal/sync`**.
- Client only: `cd client && npm run dev`, `npx vitest run`, `npm run build` (type-check + build).
- **After changing `internal/api/wire.go`: `make wire`** — regenerates `client/src/api/types.ts` and `routes.ts`, both generated, never hand-edited (NFR-4.14, ADR-026/027). `make ci` catches the omission.

## Reading budget

Every line read is paid for, and the documents here are large. The defaults:

- **Specs are directories, one file per section** — `dev-docs/prd-addendum/3.29-*.md`, `dev-docs/ui-spec/M28-*.md`, `dev-docs/ui-test-spec/M28-*.md`. Open the section a change touches, never the set; `ls` or grep finds it.
- **Ledgers are read through their index lines**, never end to end: `grep -h "^- \[" dev-docs/implementation-log/*.md | grep -i <topic>` names the section, then read that section alone.
- **Grep before you read**, and read a large file by offset. A whole-file read is for a file you are about to rewrite.
- **Delegate the mechanical to a cheaper model**: a red CI log, a rename sweep, merging `main` and re-running `make ci`, a search across many files — a subagent at `model: "sonnet"` (or `"haiku"` for a pure lookup) that reports back in a few lines. Design, review verdicts and spec text stay with the main session.
- **One task per session.** Context carried from a finished PR into the next one is paid for on every turn after it.

## Where things live

| Question | File |
|---|---|
| What does the product do? | `dev-docs/PRD_Base.md` (original vision) |
| What changed since? | `dev-docs/prd-addendum/` — one file per section; **always authoritative over PRD_Base.md** |
| What do the screens look like? | `dev-docs/ui-spec/` — `Mnn-*.md` per screen (M1–M30), `global-patterns.md` (G-1–G-20) |
| What should packing feel like? | `dev-docs/UI_Concept_Prototype.html`; **`node dev-docs/UI_Concept_Prototype.verify.mjs` must stay green** |
| Wire protocol? | `dev-docs/Sync_API_Spec_v1.3.md` |
| DB schema? | `internal/store/schema.sql` — **single source of truth, never duplicated into docs** (ADR-018) |
| Why X over Y? | `dev-docs/adr/ADR-00N_*.md` |
| How do I run and operate this? | `docs/` — the published user manual (`docs/index.md`) |
| What must the UI suite cover? | `dev-docs/ui-test-spec/` — one file per screen, `traceability.md` |
| What does it actually cover, and what is owed? | `dev-docs/e2e-ledger/` — `status.md` is the table; read and update it |
| How do I run/write an e2e case? | `client/e2e/README.md` — the on-ramp and the binding conventions |
| How do I write code here? | `dev-docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| Which agent CLI reads which config? | `dev-docs/agent-tooling.md` |
| What was built, and why that way? | `dev-docs/implementation-log/` — append-only, one file per week, each opening with its index |
| What does „item 19" mean? | `dev-docs/backlog.md` — the closed numbered backlog |

Only the current version of each document is kept. Never write a "v2" of a doc — replace the text in place. A spec states the current product only: no revision notes, no dated provenance, no "amended"/"used to" narration — git holds the history. The two append-only ledgers and the ADRs are the exception, since recording history is their job. **A document split into a directory names every file in its `README.md`** (`scripts/log-index-gate.mjs`): a new screen is a new `Mnn-*.md` plus its README row.

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

## Open work

Every numbered backlog item is closed (`dev-docs/backlog.md`). Real sources of open work, in order: what the owner just asked for — the family's instance runs in production, so this is where its friction arrives; an open `*REVIEW*.md` worklist in the repo root (untracked by convention); a fired revisit trigger in a parked stub or ADR. §3.29's bridge to the packing side is specified, not built.

**Parked, specified, do not start:** §3.26 calendar feed, the North-Star phases beyond §3.29's planner, FR-27.8's per-trip usage history, FR-1.6's publish/fork ownership model. Each carries a revisit trigger in its stub.

**Standing decisions:**
- **The G-3 lock stays advisory** (owner's decision, ADR-022/023): refusal would wedge an offline device's outbox.
- **The portable backup carries master data and trips only.** Not in it: trip todos (FR-7.3/7.4), the shopping list's own entries (FR-30), trip notes (FR-7.9/7.13), excursions (FR-31), the planner (§3.29) and the activity log (§3.32).
- **The item merge moves master data only** (FR-24.15, ADR-069): trip history keeps naming the row it was packed from, and `items.merged_into_id` makes the two pasts read as one.
- **The task due-day reminder is the one notification Single-User sends** (FR-7.12, ADR-076).

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config` → one `api.Options`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/wiregen` — `wire.go` → the client's `types.ts` and `routes.ts` (ADR-026/027). Pure leaf: `go/ast` in, string out. `cmd/wiregen` is the thin main.
- `internal/store` — the only package importing `database/sql`. SQLite repositories, change/conflict logs, the two sync partitions (master; trip), the schema and its migration chain (ADR-067).
- `internal/linkpreview` — FR-29.16: reads a pasted link's page for its title, description, picture and links (FR-29.18), through a dialer that admits public addresses on 80/443 only (ADR-082). Standard library only, a leaf — the one place the server fetches an address a user chose.
- `internal/webui` — serves the built client beside the API on one origin (ADR-043). Standard library only; does **not** import `internal/api` (prefixes are passed in).
- `internal/api` — HTTP handlers, WebSocket hub, session auth + OIDC broker (ADR-007), notifications, Web Push, admin, export. **`wire.go` is the contract** — envelopes, frame, conflict shapes, error vocabulary, routes. **Export only** — importing is the client's (invariant 4, ADR-025).
- `client/src/domain` — the pure client-side rules: quantities, template instantiation, dependencies, containers, analytics, review, clone, spreadsheet import, the portable format (`portable.ts`, `portableImport.ts`), members. No I/O, exhaustively unit-tested. This is where a Go `internal/domain` ended up, deliberately (invariant 4).
- `client/src/shopping` — the first **feature module** (FR-30.3, ADR-066): its own store, actions and M6, its e2e cases in `client/e2e/shopping/`. It and the packing code never import each other; they meet through kernel contracts (`lib/shoppingSources.ts`, `sync/featureModule.ts`, `lib/tripCards.ts`, `lib/activityReaders.ts`, `lib/dayPlanSources.ts`) that `App.vue` binds. `scripts/module-boundary-gate.mjs` holds both directions.
- `client/src/planner` — the second feature module (§3.29, ADR-078): ideas, votes, their discussion, pictures and GPX tracks and the day plan's entries in tables of its own, M28 and M29, its pure rules in `planner/domain/` (held by `domain-purity-gate.mjs` too), its e2e cases in `client/e2e/planner/`.
- **A module's words live in the module** — `client/src/<m>/i18n/en.ts`/`de.ts`, read by `t()` through `i18n/index.ts`, so a copy change stays a module-only diff (ADR-079 amendment). A key only the module reads goes there; one the kernel reads too stays in `i18n/messages/`. The boundary gate holds it.

## Invariants — do not break these

The full text of 2, 3 and 6 is in `internal/CLAUDE.md`, of 9 and 9b in `client/CLAUDE.md`.

1. **Dependency direction** (verify with `go list -deps`): `api → store, sync, linkpreview`; `store → sync`; **`sync`, `wiregen` and `linkpreview` import nothing internal, ever**. Pure domain rules live in `client/src/domain`, not a Go `internal/domain`.
2. **A schema change carries a migration** (ADR-067): `internal/store/schema.sql` *and* an additive `internal/store/migrations/NNN_*.sql` — two edits, held together by `TestSchemaChain_EndsWhereSchemaSQLDoes`. Nothing is recreated or deleted on start-up; an unknown database is refused with `ErrSchemaStale`, never guessed.
3. **The client's identity claims are never trusted.** The server stamps actor columns itself (`stampActor` in `internal/api/server.go`); a client placeholder like `'current-user'` must never reach a foreign key. Clients can never grant `owner`, and the trip creator's membership row is immutable.
4. **Generation runs client-side.** Template instantiation, dependency resolution, quantity suggestions, analytics, review, cloning and import live in `client/src/domain` because **Local Mode has no server** and must keep every one. **And there is only one of each** (ADR-008 driver 2, ADR-025): the Go side no longer knows the portable format exists; `GET /me/export.json` and `GET /trips/{id}/export.csv` stay because neither has a client twin. Anything outside the browser that needs these rules runs *this* code (the FR-18.7 import command is a Node program over `domain/portableImport.ts`). **A rule must never be reachable only through a Vue composable**, and **the arrow never turns round**: a `client/src/domain` module imports `types/`, `api/`, `sync/`, `lib/` and its own siblings — an allowlist — and never Vue, `vue-router`, `pinia` or Ionic, type-only imports included. The mutation factory is Vue-free (`createMutations` in `client/src/sync/mutations.ts`). `scripts/domain-purity-gate.mjs` holds the direction.
5. **Three modes, one artifact.** Behaviour is selected at runtime, never by a separate build. The client's `jitpack_mode` is only `local` or `server`; **Single-User is server-side configuration** (`api.NewSingleUser`) that a `server`-mode client discovers by being offered no OIDC. Every feature must answer: what happens in Single-User (auth and membership bypassed — anything gated on `authed` is inert) and in Local (no network)? Server-only surfaces are hidden per G-8, not left broken.
6. **Binary uploads stay outside the sync envelope** (ADR-002): item images (150 KB JPEG, enforced at handler, store and CHECK constraint), an idea's pictures (500 KB) and GPX tracks (5 MB). Only their rows and hashes sync.
7. **Coverage gates are enforced**: ≥75 % overall, ≥90 % `internal/sync`. An uncovered branch in merge logic fails review regardless of the total.
8. **Everything resolves to an exact version verified by hash.** npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA with the tag as a comment. Never a bare tag. Dependabot updates the digests, **except where a version is also a toolchain decision — then it is made by hand**, because CI compiles through `setup-node`/`setup-go`, not the build image. A **node** major is named in the root `Dockerfile`, `mise.toml` and every `node-version:` in `ci.yml`; a **Go** major in the `Dockerfile`, `mise.toml`, `go.mod` and the `golangci-lint` pins in `mise.toml` and `ci.yml`. `scripts/toolchain-pins-gate.sh` compares them (Dependabot's majors arrive red on purpose); whether a linter is new enough for the go directive is judged by `make ci` running it. **The Playwright image** in `scripts/playwright-image.sh` is bumped by hand (Dependabot cannot see shell scripts, and a bump rewrites every visual baseline — ADR-013); both scripts check it against `@playwright/test` in the lockfile.
9. **Colors, type and icons come from token tables** — `client/src/theme/palette.css` (`--ct-*`, ADR-048), the role anchors above it, `typography.css` and the icon scale. No hard-coded color — **not even as `var(--x, #fallback)`** — and no view sets its own font.
9b. **Shape comes from `client/src/theme/surfaces.css`**, and `scripts/design-tokens-gate.mjs` rejects a raw colour, type declaration, radius or shadow outside the three theme files.

## Testing

Test-first: every behaviour starts as a failing test that reads as its specification, then implementation until green.

- **Naming as specification**; carry the FR/NFR id. **Failure paths** are covered wherever code enforces a correctness or authorization rule.
- **No non-deterministic timing constraints** — in Go, Vitest and Playwright alike: no sleeps, fixed waits or polling for an effect that might not land. If a test can only pass by waiting-and-hoping, give the production code a deterministic seam (injected clock, completion signal, settled state).
- **A coverage count says how many promises have no test, never how many deserve one.** Measure a screen, not the repository, and never re-derive a headline number to compare against it. An unwritten case is as likely an unbuilt promise as a missing test.
- **Before crediting an assertion, ask whether it would have passed before the action.** An absence needs a positive signal (a recorded call, a settled state, a planted response). A `data-testid` that occurs in no test means no test has operated that control.
- **A case id in a test title is a coverage claim**; `scripts/case-id-gate.mjs` refuses duplicates. On collision **a number means what the suite implements**: the loser is struck through in place and says where its promise went, never renumbered. Run one case with `-g "E2E-M5-05"`.
- Go specifics in `internal/CLAUDE.md`, Vitest and Playwright specifics in `client/CLAUDE.md`.

## Working agreement (see CODING_PRINCIPLES.md for detail)

- **Never commit to `main`.** One git worktree per feature under `.claude/worktrees/`, branched from `origin/main` → PR → green CI → **wait for the merge go-ahead**. Merge with a hand-written squash subject; release-please derives the changelog from it. One open PR at a time.
- **A feature PR is complete**: backend + the client UI that exposes it + the spec update in `dev-docs/` + an ADR when a real tradeoff was decided + the `docs/` page when visible to whoever runs the instance. Never "UI in a follow-up", never "docs later".
- **A UI change ships a *running* Playwright case** (owner's rule) — the binding details are in `client/CLAUDE.md`.
- **An ADR is owed only for a real tradeoff** — options weighed, one chosen at a cost. Not for additive config fields or mechanical refactors.
- Run `/pr-review` on your own PR before asking for the go-ahead — every PR; its verdict comment is the evidence, and a missing verdict is a blocker. While iterating, `/pr-review-lite` is the cheaper check.
- **English throughout — including quoting the owner.** Specs, ADRs, log, comments, commits and PR text are English; a German request is *translated*, never pasted as a „…" quote. Exception: German that is **content** (UI labels and screen copy being specified, seed data, mark-index keywords, the `de` catalogue). Comments justify *why*, never *what*; godoc on exported symbols is mandatory.
- **No magic strings or numbers** (CODING_PRINCIPLES §4a): a literal compared against, switched on, or repeated across files is named once — `store.Table*`/`RoleOwner` in Go, `TABLE` in `client/src/types/tables.ts`.
- Standard library first — a new dependency needs a one-line justification (NFR-4.3).
- Conventional Commits, types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` (`build:` only where Dependabot generates it). Reference spec ids (`FR-5.4`, `NFR-4.2a`).

## Don'ts & pointers

- Don't restructure the implementation log; append to the current week's file in `dev-docs/implementation-log/` **only when the work earns an entry** (its README's "What earns an entry": what the code cannot show — a rejected option, a wrong premise, an accepted cost, a trap), with an index line in that file (`scripts/log-index-gate.mjs`).
- Don't grow `CLAUDE.md` with history — it is loaded in full every session, and by every subagent. A closed item goes to `dev-docs/backlog.md`.
- Don't duplicate the schema into docs, or an ADR's rationale into a code comment — `// see ADR-00N` is enough.
- Don't judge a UI change from the stylesheet. Render it, look at it, and let the maintainer eyeball it before the Playwright case is finalized.
- **Run `make fmt` before pushing** if `make ci` complains: the CI `format` job *checks* gofmt and prettier (ADR-040).
- **A red e2e leg is the diff until proved otherwise.** A rerun without a diagnosis pays for the run twice and teaches nothing; read it with `ci-failures.mjs`, and fix a real flake at its cause (a missing signal in the production code), never with a wait.
- **The e2e shard count is a measurement, not a constant.** It is 10 (`ci.yml`); a growing suite makes it stale silently, so when e2e feels slow read the per-leg times of a recent run first. **A single run cannot resolve a leg-count change**: the runners' variance is the size of every effect worth chasing (log: 'Three CI levers, two measured worse than nothing and one disproved').
- **CI/CD** (`.github/`): `ci.yml` (go, go-lint, client, format, visual, e2e ×N, e2e-single, e2e-server, docker-build, dependabot-merge), `docker.yml` (image to ghcr.io on `v*` tags, ADR-043), `release.yml` (release-please). A `concurrency` group supersedes a superseded **pull-request** run; a push to main is never cancelled. **`main` is protected**: required checks `go`, `go-lint`, `client`, `format` (ADR-040), `docker-build`; no force-push or deletion, linear history, admins not exempt, no review approvals required. `e2e` and `visual` are deliberately **not** required (a sharded matrix would need every leg named; `dependabot-merge` waits for them). If a required check wedges: `gh api -X DELETE repos/polandy/JIT-Pack/branches/main/protection`, merge, re-apply.

## Deviations

None open. History in `DEVIATIONS.md`.
