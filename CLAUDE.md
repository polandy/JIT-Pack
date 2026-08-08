# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite; Vue 3 + Ionic + Capacitor client. Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

Read this file fully before touching code. It is the orientation document: what exists, where it lives, and the rules that must not break. It is deliberately short — the running history of what was built lives in `dev-docs/implementation-log.md`.

## Commands

- Build: `go build ./...` (binary: `go build -o jitpackd ./cmd/jitpackd`)
- Test: `go test ./... -race` — fast, no docker or network; store/api tests run against real in-memory SQLite
- **Verify before finishing any change: `make ci`** — it mirrors the CI jobs 1:1 (gofmt, build, vet, race tests, coverage gates, golangci-lint, client lint/build/vitest), so green here predicts a green pipeline
- Slow jobs, excluded from `make ci` on purpose: `make e2e` (needs Playwright browsers + a built bundle) and `make docker-build` (needs a docker daemon). `make all` runs everything.
- Coverage gates live once, in `scripts/coverage-gate.sh`, shared by `make cover` and the CI `go` job: **≥75 % overall, ≥90 % `internal/sync`**
- Client only: `cd client && npm run dev` (Vite dev server), `npx vitest run`, `npm run build` (type-check + build)

## Where things live

| Question | File |
|---|---|
| What does the product do? | `docs/PRD_Base.md` (original vision) |
| What changed or was added since? | `docs/PRD_Addendum_v2.10.md` — **always authoritative over PRD_Base.md where they differ** |
| What do the screens look like? | `docs/UI_Spec_v1.10.md` — screens M1–M21, global patterns G-1–G-12 |
| What is the packing concept supposed to feel like? | `docs/UI_Concept_Prototype.html` — the clickable mockup every §3.25/§3.27 decision was tested against; **`node docs/UI_Concept_Prototype.verify.mjs` drives it headless and must stay green** |
| What's the wire protocol? | `docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/migrations/*.sql` — **single source of truth, never duplicated into docs/** |
| Why was X chosen over Y? | `docs/ADR-00N_*.md` — options considered, weighted decision matrix, consequences, revisit trigger |
| What must the UI test suite cover? | `docs/UI_Test_Spec_v1.0.md` — Playwright scope: per-screen cases, cross-screen flows, FR/NFR traceability matrix |
| How do I write code here? | `docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| What was already built, and why that way? | `dev-docs/implementation-log.md` — append-only history |

Only the current version of each document is kept. Never write a "v2" of a doc — replace the file and update its own revision note.

## Not built yet

The packing concept is **closed as a concept** — mocked in the prototype and written up in
PRD §3.25/§3.27, UI-Spec and UI-Test-Spec — and open as implementation. Owner decision
2026-08-08 on sequencing: **finish the concept before implementing**, then start with the
domain-free basics (login, users, code base) rather than with packing features. The reasoning
for each item below is in `dev-docs/implementation-log.md`, section "Concept phase".

1. **The basics first** — login/users/sync/CI already exist and are green, so the open question
   is audit-and-harden versus deliberate rework, not build-from-scratch.
2. **One toolchain, not two.** `make ci` is documented above as *the* pre-finish check, but it
   calls `go`, `gofmt` and `golangci-lint` bare and dies with `go: No such file or directory`
   unless the nix devShell is active — while `mise.toml` pins those same three tools and
   `mise exec -- make ci` works. Two mechanisms for one job, and the failure lands on the very
   command people are told to trust. Pick one (devShell only, mise only, or let the Makefile
   detect and re-exec), then delete the other; whichever wins, `make ci` must work from a plain
   shell in a fresh clone.
3. **§3.27 client package** — `instantiate.ts` include expansion + FR-27.7 task materialisation,
   the FR-27.4 planning-trip refresh diff, the M21 screen, portable YAML for includes and tasks.
   Schema and sync wiring are done (migration 016).
4. **Screen rebuilds from the mock**, localized with `t()` from the first line: M4/M5, then
   M7/M8 (scopes, quick-add, sheet editing), M9/M10 (lean inventory, minimal creation),
   M11 (container sheet, picker), M12 (slice filtering, per-person shares), M14 (group-aware list).
5. **i18n migration** — ~300 hard-coded English strings across the surrounding screens; the module
   and both catalogues exist.
6. **Two migrations owed by concept decisions** — drop `travelers.profile` (FR-25.9 retired), and
   add the record column beside `packer_user_id` (FR-25.19 splits assignment from packing record).
7. **Playwright suite** — `docs/UI_Test_Spec_v1.0.md` is written and the harness scaffolded; the
   per-screen cases are not implemented, deliberately sequenced after the rebuilds.

**Parked, specified, do not start:** §3.24 item tags & lifecycle delete, §3.26 calendar feed,
the North-Star Plan/During phases, FR-27.8's per-trip usage history, and FR-1.6's publish/fork
ownership model (each carries a revisit trigger in its stub).

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config`, picks `api.New` / `api.NewWithJWKS` / `api.NewSingleUser`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/store` — the only package that imports `database/sql`. SQLite repositories, change-log/conflict-log, the two sync partitions (`master.go` for categories/items/templates/trips/series/members, the trip partition for trip_items/travelers/containers/comments), migrations via `PRAGMA user_version`.
- `internal/api` — HTTP handlers, WebSocket hub (`hub.go`/`ws.go`), JWT/JWKS auth, OIDC brokering, notifications, Web Push, admin surface, export/import.
- `internal/portable` — YAML wire types for portable template/trip export/import. Pure marshal/unmarshal.
- `client/src/domain` — the pure client-side rules: quantity formulas, template instantiation, dependencies, containers, analytics, review, clone, spreadsheet import, members. No I/O, exhaustively unit-tested. **This is where the Go layout's planned `internal/domain` actually ended up** — deliberately, see invariant 4.

## Invariants — do not break these

1. **Dependency direction**, as it actually is today (verified with `go list -deps`): `api → store, sync, portable`; `store → sync, portable`; **`sync` and `portable` import nothing internal, ever**. Those two leaves are trivially unit-testable precisely because of that, and that is the point. The pure domain rules live in `client/src/domain` (invariant 4), not in a Go `internal/domain`.
2. **Applied migrations are never edited.** A change means a new numbered migration. Dead schema from a retired feature stays inert rather than being cleaned up — the `outbound_packed` column and the `repack` status value are there for exactly that reason. `PRAGMA user_version` tracks the applied level and must stay reopen-safe.
3. **The client's identity claims are never trusted.** The server stamps actor columns itself (`stampActor` in `internal/api/server.go`: comment `author_id`, `packing_now_by`/`packing_now_at`, `packer_user_id`). A client placeholder like `'current-user'` must never reach a foreign key. Likewise, clients can never grant the `owner` role, and the trip creator's membership row is immutable.
4. **Generation runs client-side.** Template instantiation, dependency resolution, quantity suggestions, analytics, the review assistant, cloning and import all live in `client/src/domain`, not on the server — because **Local Mode has no server** and must keep every one of those features. Moving one of them server-side silently removes it from a supported mode.
5. **Three modes, one artifact.** Behaviour is selected at runtime, never by a separate build — but note where each switch lives: the client's `jitpack_mode` is only `local` or `server`; **Single-User is a server-side configuration** (`api.NewSingleUser`) that a `server`-mode client discovers by being offered no OIDC. There is no third client mode. Every feature must answer: what happens in Single-User Mode (auth and membership are bypassed — anything gated on `authed` is inert) and in Local Mode (no network)? Server-only surfaces are hidden per G-8, not left broken.
6. **Item image BLOBs stay outside the sync envelope** (ADR-002). Only `items.image_hash` flows through the master feed; the bytes move over their own endpoints. The 150 KB / JPEG limit is enforced at handler, store and CHECK constraint — three layers on purpose.
7. **Coverage gates are enforced, not aspirational**: ≥75 % overall, ≥90 % `internal/sync`. An uncovered branch in merge logic fails review regardless of the total.
8. **Everything resolves to an exact version verified by hash.** npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA with the tag as a readable comment. Never a bare tag. Dependabot updates the digests, so pinning costs no freshness.
9. **Colors come from one token table** — `client/src/theme/catppuccin.css` (`--ct-*`, Mocha as the dark default, Latte behind `jitpack-latte`). Ionic's variables consume those tokens; there is no parallel color system and no hard-coded color.

## Testing

Test-first: every behaviour starts as a failing test that reads as its specification, then implementation until green.

- **Naming as specification** — `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`. The failing test name alone must say which rule broke; carry the FR/NFR id in the name or body.
- **Table-driven** with named `t.Run` subtests for domain logic.
- **Real in-memory SQLite** (`:memory:`) for store and api tests — never a mocked database. Hand-written fakes behind small consumer-side interfaces; no mocking frameworks.
- **Failure paths** are covered wherever code enforces a correctness or authorization rule, not just the happy path.
- **No non-deterministic timing constraints** — in Go, Vitest and Playwright alike. A test must never depend on wall-clock timing that only *probably* holds: no sleeps, no fixed waits for async work, no polling for an effect that might not land. If a test can only pass by waiting-and-hoping, the fault is in the production code — give it a deterministic seam (injected clock, completion signal, settled state) so the test asserts the outcome directly instead of racing it.
- **Always `-race`.**

## Working agreement (see CODING_PRINCIPLES.md for the full detail)

- **Never commit to `main`.** One git worktree per feature under `.claude/worktrees/`, branched from `origin/main` → PR → green CI → **wait for the merge go-ahead**. Merge with a hand-written squash subject; release-please derives the changelog from it.
- **A feature PR is complete**: backend + the client UI that exposes it + the spec update (PRD Addendum / UI-Spec / Sync-API-Spec / UI-Test-Spec) + an ADR when a real tradeoff was decided. Never "UI in a follow-up", never "docs later".
- **An ADR is owed only for a real tradeoff** — options weighed, one chosen at a cost. Not for additive config fields or mechanical refactors.
- Run `/pr-review` on your own PR before asking for the go-ahead.
- English throughout. Comments justify *why*, never *what*; godoc on exported symbols is mandatory.
- Standard library first — a new dependency needs a one-line justification; footprint is a first-class concern (NFR-4.3).
- Conventional Commits, allowed types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` (`build:` only where Dependabot generates it). Reference spec ids (`FR-5.4`, `NFR-4.2a`) when implementing them.

## Don'ts & pointers

- Don't edit an applied migration (invariant 2) — `.claude/settings.json` denies it as a speed bump; a genuinely new migration is a new file.
- Don't restructure `dev-docs/implementation-log.md`; append to it.
- Don't duplicate the schema into docs, and don't duplicate an ADR's rationale into a code comment — a `// see ADR-00N` pointer is enough.
- Don't judge a UI change from the stylesheet. Render it, look at it, and let the maintainer eyeball it before the Playwright case is finalized.
- The `autoformat` CI job pushes `style:` commits back onto your branch. Pull before you push, or run `make fmt` yourself and keep it out of the way.
- **CI/CD layout** (`.github/`): `ci.yml` (go, go-lint, client, e2e, autoformat, docker-build, dependabot-merge), `docker.yml` (ghcr.io on `v*` tags), `release.yml` (release-please). Dependabot merging is gated by the `dependabot-merge` job, which `needs` every check job. **`main` is protected** (configured 2026-08-08, now that the repo is public — the historical note that protection was blocked applied to the free-plan private repo). Required checks: `go`, `go-lint`, `client`, `docker-build`. Force-pushes and deletion are off, linear history is required (squash-merge produces it), admins are **not** exempt. Deliberately not set: `e2e` is not required, because it `needs: [client]` and a skipped required check blocks a PR with a less useful message than the client failure itself — `dependabot-merge` already waits for it. Review approvals are not required either: with a single maintainer that would block every merge and break Dependabot auto-merge. If a required check ever wedges, lift protection with `gh api -X DELETE repos/polandy/JIT-Pack/branches/main/protection`, merge, then re-apply.

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` uses pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`. History in `DEVIATIONS.md`.
