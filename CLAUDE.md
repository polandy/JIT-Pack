# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite, serving the built client from the same origin (one container, ADR-043); Vue 3 + Ionic client (a Capacitor native shell stays planned per ADR-006). Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

This file is loaded in full by every session and every subagent, so it holds the rules and pointers only. The detail lives with the side it applies to — **`client/CLAUDE.md`** (the client's modules, design tokens, Vitest and Playwright conventions, the dev seed) and **`internal/CLAUDE.md`** (the Go packages, schema chain, server-stamped identity, Go tests). Read the one for the side you change.

## Commands

- Toolchain pinned in `mise.toml` (`mise install` per machine). Build: `make build`; fast tests without docker or network: `make test`.
- **Verify before finishing any change: `make ci`** — mirrors the CI jobs 1:1, one line per target, a failing target's output in full. **Not `go test ./...`** (`client/node_modules` ships Go source; `GO_PKGS` in the Makefile decides the scope).
- **Slow jobs run on GitHub, not here** (owner's rule): `make ci-remote`; `make e2e-module M=planner` runs one module's cases.
- **A red CI run: `node scripts/ci-failures.mjs [<run-id> | --pr <n>]`.**
- **After changing `internal/api/wire.go`, `internal/store/tables.go` or `schema.sql`: `make wire`** — regenerates `client/src/api/types.ts`, `routes.ts` and `tables.ts`, never hand-edited (ADR-026/027).
- Client only: `cd client && npm run dev`, `npx vitest run`, `npm run build`.
- Timings, the skipped jobs, the e2e legs, the workflows and `main`'s protection: **`dev-docs/ci.md`**.

## Reading budget

Every result is re-read, and paid for, on each later turn.

- **Specs are directories, one file per section** — `dev-docs/prd-addendum/3.29-*.md`, `dev-docs/ui-spec/M28-*.md`, `dev-docs/ui-test-spec/M28-*.md`. Open the section a change touches, never the set.
- **Ledgers are read through their index lines**: `grep -h "^- \[" dev-docs/implementation-log/*.md | grep -i <topic>`, then that section alone.
- **Grep before you read**, and read a large file by offset. **Bundle independent commands into one call**; never repeat a `git status`-style check whose answer cannot have changed.
- **Delegate by threshold**: fact-finding reads over ~10 KB, spec lookups, every `make ci`, test or e2e run, red CI logs and rename sweeps go to a subagent (`Explore` to find, `model: "sonnet"` to run) reporting in a few lines. Judgement and spec writing stay with you.

## Where things live

| Question | File |
|---|---|
| What does the product do? | `dev-docs/prd-addendum/` (one file per section, **authoritative**) over `dev-docs/PRD_Base.md` |
| What do the screens look like? | `dev-docs/ui-spec/` — `Mnn-*.md` per screen, `global-patterns.md` (G-n) |
| What should packing feel like? | `dev-docs/UI_Concept_Prototype.html`; **`node dev-docs/UI_Concept_Prototype.verify.mjs` must stay green** |
| Wire protocol? | `dev-docs/Sync_API_Spec_v1.3.md` |
| DB schema? | `internal/store/schema.sql` — **single source of truth, never duplicated into docs** (ADR-018) |
| Why X over Y? | `dev-docs/adr/` |
| How do I write code here? | `dev-docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| What must the UI suite cover, and what does it? | `dev-docs/ui-test-spec/`; `dev-docs/e2e-ledger/status.md` (read and update it) |
| How do I run/write an e2e case? | `client/e2e/README.md` |
| What was built, and why that way? | `dev-docs/implementation-log/` — append-only, one file per week, each opening with its index |
| Parked work, standing decisions, „item 19"? | `dev-docs/backlog.md` |
| How do I run and operate this? | `docs/` — the published user manual |
| Which doc tier does a text belong in? | `dev-docs/README.md` — `README.md` / `docs/` / `dev-docs/`, by who reads it |

- Only the current version of each document is kept — never a "v2"; git holds the history (the ledgers and ADRs excepted).
- **A user-visible change updates `docs/`**, verified against the code; a new page goes into `nav:` in `mkdocs.yml`.
- **A `dev-docs/` document wraps at 120 characters** (`scripts/spec-width-gate.mjs`); a document split into a directory names every file in its `README.md` (`scripts/log-index-gate.mjs`).

## Open work

Sources of open work, in order: what the owner just asked for (the family's instance runs in production); `TODO.md` in the repo root (the owner's list, **HIGH** first); an open `*REVIEW*.md` worklist in the repo root (untracked); a fired revisit trigger in a parked stub or ADR. **The parked sections must not be started, and the standing decisions hold** — both listed in `dev-docs/backlog.md`.

## Invariants — do not break these

The full text of 2, 3 and 6 is in `internal/CLAUDE.md`, of 4, 9 and 9b in `client/CLAUDE.md`, of 8 in `CODING_PRINCIPLES.md` §5.

1. **Dependency direction** (`go list -deps`): `api → store, sync, linkpreview`; `store → sync`; **`sync`, `wiregen` and `linkpreview` import nothing internal, ever**; `webui` does not import `api`.
2. **A schema change carries a migration** (ADR-067): `schema.sql` *and* an additive `migrations/NNN_*.sql`. Nothing is recreated or deleted on start-up; an unknown database is refused with `ErrSchemaStale`.
3. **The client's identity claims are never trusted.** The server stamps actor columns (`tableSpec.serverOwned`); clients can never grant `owner`; the trip creator's membership row is immutable.
4. **Generation runs client-side, once** (ADR-008, ADR-025): template instantiation, dependencies, quantities, analytics, review, clone and import live in `client/src/domain` because Local Mode has no server. A rule is never reachable only through a Vue composable, and `domain` never imports Vue, router, pinia or Ionic (`scripts/domain-purity-gate.mjs`). The kernel and its feature modules (`shopping`, `planner`, `meals`) never import each other (`scripts/module-boundary-gate.mjs`).
5. **Three modes, one artifact.** Behaviour is selected at runtime. The client's `jitpack_mode` is only `local` or `server`; Single-User is server-side configuration (`api.NewSingleUser`). Every feature answers: what happens in Single-User (anything gated on `authed` is inert) and in Local (no network)? Server-only surfaces are hidden per G-8, not left broken.
6. **Binary uploads stay outside the sync envelope** (ADR-002): item images, idea pictures, GPX tracks. Only their rows and hashes sync.
7. **Coverage gates** (`scripts/coverage-gate.sh`): ≥75 % overall, ≥90 % `internal/sync`. An uncovered branch in merge logic fails review regardless of the total.
8. **Everything resolves to an exact version verified by hash** — lockfiles, `@sha256:` digests, Actions by full commit SHA. Never a bare tag. A toolchain major is bumped by hand (`scripts/toolchain-pins-gate.sh`).
9. **Colors, type, icons and shape come from the token tables** in `client/src/theme/` — no hard-coded color, not even as `var(--x, #fallback)`; `scripts/design-tokens-gate.mjs` holds it.

## Testing

Test-first: every behaviour starts as a failing test that reads as its specification, then implementation until green.

- **Naming as specification**; carry the FR/NFR id. **Failure paths** are covered wherever code enforces a correctness or authorization rule.
- **No non-deterministic timing constraints** — no sleeps, fixed waits or polling for an effect that might not land. Give the production code a deterministic seam instead.
- **A coverage count says how many promises have no test, never how many deserve one.** Measure a screen, not the repository.
- **Before crediting an assertion, ask whether it would have passed before the action.** An absence needs a positive signal. A `data-testid` that occurs in no test means no test has operated that control.
- **A case id in a test title is a coverage claim**; `scripts/case-id-gate.mjs` refuses duplicates. On collision the loser is struck through in place and says where its promise went, never renumbered. Run one case with `-g "E2E-M5-05"`.

## Working agreement (see CODING_PRINCIPLES.md for detail)

- **One task per session, under 150k context**: past 150k in the status line, `/compact` or go fresh; run `opus`, not `opus[1m]`, so auto-compaction fires early. The feature session ends at a green PR with its `/pr-review` verdict (a forked context; `/pr-review-lite` while iterating); go-ahead, merge and clean-up run in a fresh session.
- **Never commit to `main`.** One git worktree per feature under `.claude/worktrees/`, branched from `origin/main` → PR → green CI → **wait for the merge go-ahead**. Merge with a hand-written squash subject; release-please derives the changelog from it. One open PR at a time.
- **A feature PR is complete**: backend + the client UI that exposes it + the spec update in `dev-docs/` + an ADR when a real tradeoff was decided + the `docs/` page when visible to whoever runs the instance. Never "UI in a follow-up", never "docs later".
- **A UI change ships a *running* Playwright case** (owner's rule; details in `client/CLAUDE.md`). Render a UI change and let the maintainer eyeball it before the case is finalized — never judge it from the stylesheet.
- **An ADR is owed only for a real tradeoff** — options weighed, one chosen at a cost.
- **English throughout — including quoting the owner** (translated, never a pasted „…" quote). Exception: German that is **content** (UI copy, seed data, mark keywords, the `de` catalogue). Comments justify *why*, never *what*; godoc on exported symbols is mandatory.
- **No magic strings or numbers** (CODING_PRINCIPLES §4a): `store.Table*`/`RoleOwner` in Go, `TABLE` in `client/src/api/tables.ts` (generated).
- Standard library first — a new dependency needs a one-line justification (NFR-4.3).
- Conventional Commits: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` (`build:` only from Dependabot). Reference spec ids.

## Don'ts

- Don't restructure the implementation log; append to the current week's file **only when the work earns an entry** (its README's "What earns an entry"), with an index line (`scripts/log-index-gate.mjs`).
- Don't grow `CLAUDE.md` — detail goes to the subtree file or `dev-docs/`, a closed item to `dev-docs/backlog.md`.
- Don't duplicate the schema into docs, or an ADR's rationale into a code comment — `// see ADR-00N` is enough.
- **A red e2e leg is the diff until proved otherwise**: fix a real flake at its cause, never with a wait or a blind rerun.

## Deviations

None open. History in `DEVIATIONS.md`.
