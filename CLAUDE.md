# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite; Vue 3 + Ionic client (a Capacitor native shell stays planned per ADR-006 — the `@capacitor/*` packages were removed while unused and come back when the native build actually starts). Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

Read this file fully before touching code. It is the orientation document: what exists, where it lives, and the rules that must not break. It is deliberately short — the running history of what was built lives in `dev-docs/implementation-log.md`.

## Commands

- Toolchain: pinned once in `mise.toml` (go, node, golangci-lint, at the versions CI resolves). Run `mise install` per machine; the Makefile re-execs through `mise exec` when they are not already on PATH, so `make ci` works from a plain shell in a fresh clone.
- Build: `go build ./...` (binary: `go build -o jitpackd ./cmd/jitpackd`)
- Test: `go test ./... -race` — fast, no docker or network; store/api tests run against real in-memory SQLite
- **Verify before finishing any change: `make ci`** — it mirrors the CI jobs 1:1 (gofmt, build, vet, race tests, coverage gates, golangci-lint, client lint/build/vitest), so green here predicts a green pipeline
- Slow jobs, excluded from `make ci` on purpose: `make e2e` (needs Playwright browsers + a built bundle) and `make docker-build` (needs a docker daemon). `make all` runs everything.
- Coverage gates live once, in `scripts/coverage-gate.sh`, shared by `make cover` and the CI `go` job: **≥75 % overall, ≥90 % `internal/sync`**
- Client only: `cd client && npm run dev` (Vite dev server), `npx vitest run`, `npm run build` (type-check + build)

## Where things live

| Question | File |
|---|---|
| What does the product do? | `dev-docs/PRD_Base.md` (original vision) |
| What changed or was added since? | `dev-docs/PRD_Addendum_v2.10.md` — **always authoritative over PRD_Base.md where they differ** |
| What do the screens look like? | `dev-docs/UI_Spec_v1.10.md` — screens M1–M21, global patterns G-1–G-12 |
| What is the packing concept supposed to feel like? | `dev-docs/UI_Concept_Prototype.html` — the clickable mockup every §3.25/§3.27 decision was tested against; **`node dev-docs/UI_Concept_Prototype.verify.mjs` drives it headless and must stay green** |
| What's the wire protocol? | `dev-docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/migrations/*.sql` — **single source of truth, never duplicated into docs/** |
| Why was X chosen over Y? | `dev-docs/adr/ADR-00N_*.md` — options considered, weighted decision matrix, consequences, revisit trigger |
| How do I run and operate this? | `docs/` — the published user manual; `docs/index.md` is its landing page |
| What must the UI test suite cover? | `dev-docs/UI_Test_Spec_v1.0.md` — Playwright scope: per-screen cases, cross-screen flows, FR/NFR traceability matrix |
| How do I write code here? | `dev-docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| What was already built, and why that way? | `dev-docs/implementation-log.md` — append-only history |

Only the current version of each document is kept. Never write a "v2" of a doc — replace the file and update its own revision note.

## Documentation layout — three tiers, and they do not mix

Modelled on [skipper-cd](https://github.com/polandy/skipper-cd). Which tier a document belongs to is decided by **who reads it**, never by what it is about:

| Tier | Audience | Content |
|---|---|---|
| `README.md` | someone deciding whether to care | Short and appealing: what JIT-Pack is, why it exists, a quickstart, and links onward. It is a shop window, not a manual — no configuration reference, no deployment detail. |
| `docs/` | people **running** JIT-Pack | The user manual, published to GitHub Pages via MkDocs Material (`mkdocs.yml`, `.github/workflows/docs.yml`). Install, configure, authenticate, operate, troubleshoot. Second person, task-oriented. |
| `dev-docs/` | people **developing** JIT-Pack | PRDs, ADRs, specs, the implementation log, the concept prototype. Deliberately outside `docs/` so it is never published; read on GitHub. Indexed by `dev-docs/README.md`. |

Rules that follow from this:

- **A user-visible change updates `docs/`, not just the spec.** A feature is not complete when the spec is written; it is complete when the person running the instance can find out how to use it.
- **Never document what is not implemented.** Large parts of the UI are still being rebuilt (see "Not built yet"), so the manual covers server operation and stops there. Adding a page for a screen that does not exist is worse than having no page.
- **Every claim in `docs/` is verified against the code**, not against the spec — the spec says what is intended, the code says what runs.
- Adding a page means adding it to `nav:` in `mkdocs.yml`; CI runs `mkdocs build --strict`, so an orphan page or a broken link fails the PR.
- `dev-docs/` is not published. Never link to it from `docs/` with a relative path expecting it to resolve on the site — link to GitHub, or restate what the reader needs.

## Not built yet

The packing concept is **closed as a concept** — mocked in the prototype and written up in
PRD §3.25/§3.27, UI-Spec and UI-Test-Spec — and open as implementation. Owner decision
2026-08-08 on sequencing: **finish the concept before implementing**, then start with the
domain-free basics (login, users, code base) rather than with packing features. The reasoning
for each item below is in `dev-docs/implementation-log.md`, section "Concept phase".

1. ~~**The basics first**~~ — **done.** The audit-and-harden pass the owner chose on
   2026-08-08 is closed on all four fields: the auth and authorization paths (ADR-007 stack,
   PRs #54–#56), failure-path coverage (#57), supply-chain pinning against NFR-4.3 and
   invariant 8 (#58), and the two migrations in item 5 (#60). The toolchain item beside it is
   done too — `mise.toml` is the single pinning mechanism and `make ci` runs from a plain
   shell. History in the implementation log.
2. **§3.27 client package** — `instantiate.ts` include expansion + FR-27.7 task materialisation,
   the FR-27.4 planning-trip refresh diff, the M21 screen, portable YAML for includes and tasks.
   Schema and sync wiring are done (migration 016).
3. **The design foundation, then the remaining screen rebuilds** — in that order, decided by
   the owner 2026-08-14 after M4 and M5 were compared with the prototype. The plan is
   `dev-docs/design-foundation-plan.md`; read it before starting either half.
   * **The foundation, five small PRs. Typography is done** (FR-21.5/21.6, G-13:
     Fraunces and Hanken Grotesk self-hosted, one scale, role classes in
     `client/src/theme/typography.css` — see invariant 9). **Colour anchors are done too**
     (FR-21.7, G-11: brand/action/done named once, `--ion-color-primary` deliberately still
     blue, caution moved off peach onto yellow). **Surfaces are done too** (FR-21.8, G-14,
     invariant 9b: three planes, a five-step radius scale, elevation as one geometry in the
     flavour's ink, `.jp-card`, and `scripts/design-tokens-gate.mjs` wired into `make client`
     and CI). **The type migration is done too** — all 123 `font-size`, 40 `font-weight` and
     7 `letter-spacing` sites across 31 screens are on the scale, icons have their own
     `--jp-icon-*` table, and the gate covers type. **The FR-25.2 pack-out is done too** — the
     row washes green, collapses and fades, with one undo snackbar and a `prefers-reduced-motion`
     path. Remaining: visual baselines plus a dev gallery (owes ADR-013). Each acts
     on every screen at once, which is why they come first: after six more rebuilds the same
     gap would have been built six more times.
   * **The rebuilds themselves**, localized with `t()` from the first line. **M4 and M5 are
     done** (2026-08-14, PR #73): M4's header line, G-12 app-bar cluster, facet sheet that
     applies as you tap, clusters, folding, both reveal bars, the FR-25.17 stamp and the FAB
     quick-add; M5 as a sheet over the list (side panel on desktop) whose first level is
     packing, preparation and notes. Both were rendered and eyeballed by the owner.
     Remaining, in order: **M7/M8** (scopes, quick-add, sheet editing), M9/M10 (lean
     inventory, minimal creation), M11 (container sheet, picker), M12 (slice filtering,
     per-person shares), M14 (group-aware list) — **none of those has been eyeballed**, only
     the prototype. Known cost carried over from the M5 rebuild: M4 loses its scroll position
     when a detail opens (ADR-012's overlay amendment).
4. **i18n migration** — the hard-coded English strings across the screens M4 did not touch;
   the module and both catalogues exist and M4 + the quick-add + the filter sheet are done.
5. ~~**Two migrations owed by concept decisions**~~ — **done** (migrations 018/019): `travelers.profile`
   is dropped and `trip_items.packed_by_user_id` carries the packing record, with `packer_user_id`
   left as the assignment. The M4/M5 *presentation* of that split (two rings, „gepackt von … ·
   zuständig war …“) is part of the screen rebuilds in item 3.
6. **Playwright suite** — `dev-docs/UI_Test_Spec_v1.0.md` is written and four units have landed
   (M3 trip creation, M4 packing list, M5 item detail, global navigation); the remaining
   per-screen cases are deliberately sequenced after the rebuilds. The Local Mode reload
   defect recorded here was **two** defects and both are fixed: a render crash from the
   teleported app-bar actions, and a Local Mode write nobody awaited (FR-19.2).
   `dev-docs/e2e-tests.md` is the ledger of what is actually covered — a green `e2e` job is
   not the same as a verified UI.

**Parked, specified, do not start:** §3.24 item tags & lifecycle delete, §3.26 calendar feed,
the North-Star Plan/During phases, FR-27.8's per-trip usage history, and FR-1.6's publish/fork
ownership model (each carries a revisit trigger in its stub).

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config`, picks `api.New` (+ `EnableOIDC` after discovery) / `api.NewSingleUser`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/store` — the only package that imports `database/sql`. SQLite repositories, change-log/conflict-log, the two sync partitions (`master.go` for categories/items/templates/trips/series/members, the trip partition for trip_items/travelers/containers/comments), migrations via `PRAGMA user_version`.
- `internal/api` — HTTP handlers, WebSocket hub (`hub.go`/`ws.go`), first-party session auth + OIDC login broker (ADR-007), notifications, Web Push, admin surface, export/import.
- `internal/portable` — YAML wire types for portable template/trip export/import. Pure marshal/unmarshal.
- `client/src/domain` — the pure client-side rules: quantity formulas, template instantiation, dependencies, containers, analytics, review, clone, spreadsheet import, members. No I/O, exhaustively unit-tested. **This is where the Go layout's planned `internal/domain` actually ended up** — deliberately, see invariant 4.

## Invariants — do not break these

1. **Dependency direction**, as it actually is today (verified with `go list -deps`): `api → store, sync, portable`; `store → sync, portable`; **`sync` and `portable` import nothing internal, ever**. Those two leaves are trivially unit-testable precisely because of that, and that is the point. The pure domain rules live in `client/src/domain` (invariant 4), not in a Go `internal/domain`.
2. **Applied migrations are never edited.** A change means a new numbered migration. Dead schema from a retired feature stays inert rather than being cleaned up — the `outbound_packed` column and the `repack` status value are there for exactly that reason. `PRAGMA user_version` tracks the applied level and must stay reopen-safe.
3. **The client's identity claims are never trusted.** The server stamps actor columns itself (`stampActor` in `internal/api/server.go`: comment `author_id`, `packing_now_by`/`packing_now_at`, and `packed_by_user_id` — which is also stripped from every incoming `trip_items` mutation so it cannot be forged. `packer_user_id` is deliberately *not* stamped: since FR-25.19 it is the assignment, which the client chooses). A client placeholder like `'current-user'` must never reach a foreign key. Likewise, clients can never grant the `owner` role, and the trip creator's membership row is immutable.
4. **Generation runs client-side.** Template instantiation, dependency resolution, quantity suggestions, analytics, the review assistant, cloning and import all live in `client/src/domain`, not on the server — because **Local Mode has no server** and must keep every one of those features. Moving one of them server-side silently removes it from a supported mode.
5. **Three modes, one artifact.** Behaviour is selected at runtime, never by a separate build — but note where each switch lives: the client's `jitpack_mode` is only `local` or `server`; **Single-User is a server-side configuration** (`api.NewSingleUser`) that a `server`-mode client discovers by being offered no OIDC. There is no third client mode. Every feature must answer: what happens in Single-User Mode (auth and membership are bypassed — anything gated on `authed` is inert) and in Local Mode (no network)? Server-only surfaces are hidden per G-8, not left broken.
6. **Item image BLOBs stay outside the sync envelope** (ADR-002). Only `items.image_hash` flows through the master feed; the bytes move over their own endpoints. The 150 KB / JPEG limit is enforced at handler, store and CHECK constraint — three layers on purpose.
7. **Coverage gates are enforced, not aspirational**: ≥75 % overall, ≥90 % `internal/sync`. An uncovered branch in merge logic fails review regardless of the total.
8. **Everything resolves to an exact version verified by hash.** npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA with the tag as a readable comment. Never a bare tag. Dependabot updates the digests, so pinning costs no freshness.
9. **Colors come from one token table** — `client/src/theme/catppuccin.css` (`--ct-*`, Mocha as the dark default, Latte behind `jitpack-latte`). Ionic's variables consume those tokens; there is no parallel color system and no hard-coded color — **not even as a `var(--x, #fallback)`**, which is a second unreviewed palette that only paints when something is already wrong. Above the palette sit the three **role anchors** (`--jp-brand` peach, `--jp-action` blue, `--jp-done` green/teal, G-11/FR-21.7): a component asks for the role, and only that block decides which hue a role is. **Type comes from a second table beside it**, `client/src/theme/typography.css` (the two self-hosted faces, the `--jp-text-*` scale, the `.jp-*` role classes): which face and size a piece of text takes is decided by its role, each role is defined once there, and a view never sets its own `font-family`, `font-size`, `font-weight` or `letter-spacing` — the gate in 9b rejects all four. **Icons are a second table beside the type scale** (`--jp-icon-*`): `font-size` on an `ion-icon` is a glyph box, not a text size, and sharing one scale would tie an empty-state illustration to whatever body copy does next (G-13, FR-21.5/21.6).
9b. **Shape comes from a third table, and the three are enforced by a gate** — `client/src/theme/surfaces.css` (the `--jp-r*` radius scale, the three elevation casts, `.jp-card`). Depth is a role like brand and action: **page → card → sunken**, named once as `--jp-surface-*`, and Ionic's background variables resolve *through* those roles. Elevation is **one geometry cast in the flavour's ink** — the offsets live in `surfaces.css`, the ink and its weight in `catppuccin.css`, because a shadow that reads as depth on near-black reads as dirt on near-white. `scripts/design-tokens-gate.mjs` (run by `make client` and the CI `client` job) rejects a raw colour, a raw type declaration, a raw `border-radius` length or a raw `box-shadow` anywhere in `client/src` outside the three theme files. Four carve-outs, each **by rule and not by allowlist**: `50%` (a circle is a shape, not a size), a `0 0 0 <n>px` ring (casts no light, so it is not elevation), `letter-spacing: 0`/`normal` (a reset declines a decision rather than making one), and SVG text — inside a `viewBox` a font-size is in *user units*, so it lives as an attribute in the template beside the other geometry and never reaches CSS. **What this invariant is actually for:** the M4 group card painted itself `--ct-mantle` — a valid palette token, passing invariant 9 — which was the exact colour of the page behind it. A card can satisfy every colour rule and still not be a card, and only a rendered pixel can tell you (G-14, FR-21.8).

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
- **A feature PR is complete**: backend + the client UI that exposes it + the spec update in `dev-docs/` (PRD Addendum / UI-Spec / Sync-API-Spec / UI-Test-Spec) + an ADR when a real tradeoff was decided + the `docs/` page when the change is visible to whoever runs the instance. Never "UI in a follow-up", never "docs later".
- **A UI change ships a *running* Playwright case, not just a written one** (owner, 2026-08-13, after finding four navigation defects by hand that both green screen suites had missed). Three rules that follow, each paid for by one of those defects:
  - **Cover the global patterns, not only the screen the PR is about.** Getting to a screen, leaving it, and what the app bar does afterwards are behaviours; `client/e2e/global-nav.spec.ts` owns them.
  - **Assert what is *rendered*, never only the URL.** Scope assertions to the visible page (`ion-router-outlet > .ion-page:not(.ion-page-hidden)`) — a route change that does not repaint keeps every URL assertion green.
  - **Never a `waitForTimeout`.** If nothing observable exists to wait on, that absence is the defect: give the production code a signal (the G-2 indicator now reports an in-flight Local Mode write for exactly this reason).
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
