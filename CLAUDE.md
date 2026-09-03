# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite, serving the built client from the same origin (one container, ADR-043); Vue 3 + Ionic client (a Capacitor native shell stays planned per ADR-006 — the `@capacitor/*` packages were removed while unused and come back when the native build actually starts). Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

Read this file fully before touching code. It is the orientation document: what exists, where it lives, and the rules that must not break. It is deliberately short — the running history of what was built lives in `dev-docs/implementation-log.md`.

## Commands

- Toolchain: pinned once in `mise.toml` (go, node, golangci-lint, at the versions CI resolves). Run `mise install` per machine; the Makefile re-execs through `mise exec` when they are not already on PATH, so `make ci` works from a plain shell in a fresh clone.
- Build: `make build` (binary: `go build -o jitpackd ./cmd/jitpackd`)
- Test: `make test` — fast, no docker or network; store/api tests run against real in-memory SQLite. **Not `go test ./...`**: `client/node_modules` ships Go source (the npm package `flatted` vendors a Go implementation), so `./...` picks it up once the client is installed and drags coverage under the gate. The Makefile's `GO_PKGS` is the one place that scope is decided, and CI never sees the divergence because its runner is a fresh checkout.
- **Verify before finishing any change: `make ci`** — it mirrors the CI jobs 1:1 (gofmt, build, vet, race tests, coverage gates, golangci-lint, client lint/build/vitest), so green here predicts a green pipeline
- Slow jobs, excluded from `make ci` on purpose: `make e2e` and `make visual` (both need docker and a built bundle — they run inside the pinned Playwright image, `make visual-update` rewrites the baselines, ADR-013) and `make docker-build` (needs a docker daemon; it builds the image *and* runs `scripts/docker-smoke.sh` against it, because a green build says nothing about whether the bundle reached `/srv/web`). `make all` runs everything.
- **Run the slow jobs on GitHub, not on this machine** (owner, 2026-08-23): `make ci-remote` pushes the current branch, dispatches `ci.yml` against it and waits for the verdict — no pull request needed. `e2e`, `visual`, `docker-build` and the coverage profile all run there already; `make cover` is fully redundant with the CI `go` job. **`make ci` stays local**: it is the fast gate. Budget **~3 min on an idle machine, and read the load average before trusting a timing** — a parallel session has been measured turning a 100 s vitest run into 370 s, so a slow `make ci` is usually contention, not a regression.
- Coverage gates live once, in `scripts/coverage-gate.sh`, shared by `make cover` and the CI `go` job: **≥75 % overall, ≥90 % `internal/sync`**
- Client only: `cd client && npm run dev` (Vite dev server), `npx vitest run`, `npm run build` (type-check + build)
- **After changing `internal/api/wire.go`: `make wire`** — it regenerates `client/src/api/types.ts` *and* `client/src/api/routes.ts`, both generated and never hand-edited (NFR-4.14, ADR-026/027). `make ci` runs the gate that catches the omission.
- **Test data**: the dev build's M2 empty state carries *„Beispieldaten anlegen (Dev)"* — it seeds the
  **master partition first** (`client/src/dev/sampleMaster.ts`: tagged inventory, three groups, a
  composed Ferien-Vorlage with an FR-27.7 task) and then the sample trip (`sampleTrip.ts`). Standing
  rule (owner, 2026-08-16): **new master-data features extend that seed**, so a fresh device can
  exercise them without twenty minutes of typing. It is dev-only and writes through the orchestrator's own
  actions — **not Demo Mode**, which stays removed (Addendum v2.10). The guard that removes it
  from a production build is `import.meta.env.DEV` **around the dynamic import**, never a `v-if`
  on the trigger: that hides the button and ships the code. `scripts/dev-code-gate.mjs` (in
  `make client` and the CI client job) fails the build if a dev module reaches `dist`.

## Where things live

| Question | File |
|---|---|
| What does the product do? | `dev-docs/PRD_Base.md` (original vision) |
| What changed or was added since? | `dev-docs/PRD_Addendum_v2.10.md` — **always authoritative over PRD_Base.md where they differ** |
| What do the screens look like? | `dev-docs/UI_Spec_v1.10.md` — screens M1–M23, global patterns G-1–G-17 |
| What is the packing concept supposed to feel like? | `dev-docs/UI_Concept_Prototype.html` — the clickable mockup every §3.25/§3.27 decision was tested against; **`node dev-docs/UI_Concept_Prototype.verify.mjs` drives it headless and must stay green** |
| What's the wire protocol? | `dev-docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/schema.sql` — one always-current file, **single source of truth, never duplicated into docs/** (ADR-018) |
| Why was X chosen over Y? | `dev-docs/adr/ADR-00N_*.md` — options considered, weighted decision matrix, consequences, revisit trigger |
| How do I run and operate this? | `docs/` — the published user manual; `docs/index.md` is its landing page |
| What must the UI test suite cover? | `dev-docs/UI_Test_Spec_v1.0.md` — Playwright scope: per-screen cases, cross-screen flows, FR/NFR traceability matrix |
| What does the suite actually cover, and what is owed? | `dev-docs/e2e-tests.md` — the ledger; read and update it, a green `e2e` job is not a verified UI. **It opens with an index**, like the log: scan that and open only what it names. |
| How do I run and write an e2e case? | `client/e2e/README.md` — helpers, projects, running a single case |
| How do I write code here? | `dev-docs/CODING_PRINCIPLES.md` — **binding**, read before writing anything |
| What was already built, and why that way? | `dev-docs/implementation-log.md` — append-only history. **It opens with an index**: one line per section, so scan that and open only what it names. |

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
PRD §3.25/§3.27, UI-Spec and UI-Test-Spec. Owner decision 2026-08-08 on sequencing: **finish the
concept before implementing**, then start with the domain-free basics (login, users, code base)
rather than with packing features. Log: *„Concept phase"*.

**How to read this list.** It is a backlog, not a history: **a closed item is one line and a
pointer**, and only what is still open carries enough detail to act on. Every item below is
closed. The reasoning behind any of them — options rejected, premises that turned out wrong,
costs accepted — is in `dev-docs/implementation-log.md`; **its index names every section, so
scan that and open only what it names.** Item numbers stay stable as items close, because the
log and the specs refer back to them.

1. ~~**The basics first**~~ — done 2026-08-09 (PRs #54–#58, #60): auth/authorization (ADR-007),
   failure-path coverage, supply-chain pinning, `mise.toml`. Log: the five *„Basics audit"* sections.
2. ~~**§3.27 client package**~~ — done 2026-08-16 … 08-21, §3.27 owes nothing more. Log: seven
   sections from *„§3.27 generation"* to *„M21 — Vorlage aus Reise"*, plus *„The device backup
   carries the FR-27.4 refresh state"*.
3. ~~**The design foundation, then the remaining screen rebuilds**~~ — done 2026-08-14 … 08-24.
   Plan: `dev-docs/design-foundation-plan.md`. Log: eleven sections from *„The app gets its own
   two faces"* to *„M14 — review assistant rebuilt"*.
4. ~~**i18n migration**~~ — done 2026-08-22; the unit is a **section**, because a half-translated
   screen is worse than an untranslated one. Log: *„The i18n migration…"*, *„M17 was the last screen…"*.
5. ~~**Two migrations owed by concept decisions**~~ — done 2026-08-11. Log: *„Migrations 018/019"*.
6. ~~**Playwright suite**~~ — done 2026-09-01: every screen, the G-* patterns and the FLOW-*, PWA,
   SYNC and NFR rows were read promise by promise against the build. The owner decisions it raised
   were ruled on 2026-08-31, the last one on 2026-09-02 — FR-19.8/ADR-045, M17's guarded three-step
   move off Local Mode. **`dev-docs/e2e-tests.md` is the ledger of what is actually
   covered — it is the file to read and update.** Log: 24 sections, from *„What ‚covered by e2e'
   was not covering"* to *„A tooltip that only the bar owes"*; the rules the pass left behind are
   in **Testing** below.
7. ~~**Looking inside a group**~~ — done 2026-08-16 (FR-27.12). M8's picker chips still offer
   names alone — deliberate; revisit trigger in FR-27.12, fired by item 8.
8. ~~**FR-27.13 — the M8 group picker cannot be searched**~~ — done 2026-08-22; three points
   settled while building are recorded in the FR itself.
9. ~~**FR-27.14 — a Vorlage cannot show its resulting items**~~ — done 2026-08-17.
   Log: *„FR-27.14: the footer stops being the whole answer"*.
10. ~~**FR-2.6 — M3's review step only reviews the amount**~~ — done 2026-08-17 (variant A).
   Log: *„FR-2.6 variant A"*.
11. ~~**FR-5.5's „bewusst nicht einpacken" has no control**~~ — done 2026-08-18 (variants A + C;
   the swipe was removed rather than repaired). Log: *„FR-5.5"*.
12. ~~**§3.28 — the item mark**~~ — done 2026-08-22 (ADR-021). Log: *„§3.28: the mark gets built"*.
13. ~~**FR-27.15 — M8 does not notice when loose positions are a group**~~ — done 2026-08-22;
   three widenings are recorded in the FR itself. Log: *„FR-27.15: the editor learns to recognise
   its own duplicates"*.
14. ~~**The multi-user concept's unfinished half**~~ — closed 2026-08-30, all five parts (ADR-022
   field clocks, master conflicts readable, `merged` surfaced, the G-3 lock beyond the row,
   ADR-023 manual revert). **The lock stays advisory by decision** — reaffirmed by the owner
   2026-08-30; refusal would wedge an offline device's outbox. Log: five sections, from
   *„Field-level LWW was row-level…"* to *„A claim had no way out"*.
15. ~~**FR-9.3/9.4 — the trip's feedback is expensive to give and impossible to correct**~~ —
   done 2026-08-24. Log: *„A trip could be judged only one row at a time"*.
16. ~~**NFR-4.14 — the client/server contract is written twice and checked nowhere**~~ — done
   2026-08-23/24 (ADR-026 shapes, ADR-027 routes; `make wire` + `scripts/wire-contract-gate.sh`).
   Log: *„The wire was described twice…"*, *„A route names its scope first"*, *„A path stopped
   being written twice"*.
17. ~~**FR-5.7 — a claim is broken by a person, not by a clock**~~ — done 2026-08-24 (ADR-028).
   Log: *„A claim stops having a lifetime"*.
18. ~~**A second identity was unreachable in the e2e suite**~~ — done 2026-08-24 (ADR-029): the
   `server` Playwright project with a mock IdP; real-provider coverage closed it 2026-08-30.
   Log: *„A second account arrives…"*, *„Two screens nobody had ever rendered"*.
19. ~~**NFR-4.12 — notifications were the one surface still written in English**~~ — done
   2026-08-29 (ADR-037): the worker reads the mirrored catalogue from IndexedDB, and keeps exactly
   one English sentence for a device that has never written the mirror.
20. ~~**FR-25.19 — responsibility was read everywhere and written nowhere**~~ — done 2026-08-25.
   Log: *„A column everything read and nothing wrote"*.
21. ~~**FR-2.8 — M2 opens on the one segment that is usually empty**~~ — done 2026-08-29; the
   clause that carried the cost is the settled guard (ADR-033) — a list that has not arrived is
   not an empty one.
22. ~~**FR-25.21 — the per-person model had no writer**~~ — done 2026-08-29/30 (ADR-036
   keep-and-repoint). Log: five sections, from *„The per-person model finally gets a writer"* to
   *„A row kept saying it was skipped…"*.
23. ~~**FR-24.3 — a delete of a referenced master row was refused, not decided**~~ — done
   2026-08-25 (ADR-032 retire, ADR-034 restore via M23); §3.24 is closed. Log: *„A delete that
   could only be refused"*, *„The restore was free, the name was not"*. (Numbered 23 since
   2026-09-02: it had been a second item 19, and the specs' „item 19" means NFR-4.12.)

**Parked, specified, do not start:** §3.26 calendar feed,
the North-Star Plan/During phases, FR-27.8's per-trip usage history (its *commented* slice is
built as FR-27.9; the full „was on trips X, Y, Z" listing stays deferred), and FR-1.6's
publish/fork ownership model (each carries a revisit trigger in its stub).

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config`, picks `api.New` (+ `EnableOIDC` after discovery) / `api.NewSingleUser`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/wiregen` — turns `internal/api/wire.go` into the client's TypeScript: the shapes (`types.ts`, ADR-026) and the paths (`routes.ts`, ADR-027). A second pure leaf beside `sync`: `go/ast` in, a string out, zero I/O. `cmd/wiregen` is the thin main that reads the contract and writes both files.
- `internal/store` — the only package that imports `database/sql`. SQLite repositories, change-log/conflict-log, the two sync partitions (`master.go` for tags/items/templates/trips/series/members, the trip partition for trip_items/travelers/containers/comments), the schema applied from `schema.sql` and fingerprinted in `PRAGMA user_version` (ADR-018).
- `internal/webui` — serves the built client beside the API on one origin (ADR-043): API prefixes to the API handler, files from `JITPACK_WEB_ROOT`, `index.html` for an extension-less path and a 404 for a missing file. Standard library only, and it does **not** import `internal/api` — the prefixes are passed in.
- `internal/api` — HTTP handlers, WebSocket hub (`hub.go`/`ws.go`), first-party session auth + OIDC login broker (ADR-007), notifications, Web Push, admin surface, export. **`wire.go` is the contract** — the one declaration of the envelopes, the frame, the conflict shapes, the error vocabulary and the routes, generated into the client (NFR-4.14, ADR-026/027). **Export only** — importing is the client's (invariant 4, ADR-025).
- `client/src/domain` — the pure client-side rules: quantity formulas, template instantiation, dependencies, containers, analytics, review, clone, spreadsheet import, the portable format in both directions (`portable.ts` writes and reads, `portableImport.ts` turns a document into rows — shared by M18 and the FR-18.7 command), members. No I/O, exhaustively unit-tested. **This is where the Go layout's planned `internal/domain` actually ended up** — deliberately, see invariant 4.

## Invariants — do not break these

1. **Dependency direction**, as it actually is today (verified with `go list -deps`): `api → store, sync`; `store → sync`; **`sync` and `wiregen` import nothing internal, ever**. Both leaves are trivially unit-testable precisely because of that, and that is the point. (`internal/portable` was a second such leaf until 2026-08-23; it went with the server's half of the portable format — ADR-025.) The pure domain rules live in `client/src/domain` (invariant 4), not in a Go `internal/domain`.
2. **The development phase has no DDL migrations** (ADR-018, decided 2026-08-19). `internal/store/schema.sql` is the whole schema, always current: a schema change **edits that file**, and there is no upgrade path. `Open` applies it to an empty database and stamps a fingerprint of the file into `PRAGMA user_version`; any other value — a migration-era level, or `0` on a file that already has tables — is refused with `ErrSchemaStale` and an instruction naming the database path. **Nothing is recreated or deleted on start-up**: a database the code refuses is left exactly as it was. Two consequences to plan for: every schema change means deleting every development database (the `:3000` instance included — reseed with the M2 dev button), and a *data transformation* has nowhere to live, so a schema change that would have needed a backfill is a reseed instead. Dead schema from a retired feature is now a choice rather than a rule; `outbound_packed` and the `repack` status value are still there because removing them changes the sync contract, not because they cannot be removed. **This reverts at the first release meant for anyone but the maintainer** — `schema.sql` becomes `migrations/001_schema.sql`, numbering resumes at `002`, and this invariant returns to "applied migrations are never edited". The trigger is written out in ADR-018.
3. **The client's identity claims are never trusted.** The server stamps actor columns itself (`stampActor` in `internal/api/server.go`: comment `author_id`, `packing_now_by`/`packing_now_at`, and `packed_by_user_id` — which is also stripped from every incoming `trip_items` mutation so it cannot be forged. `packer_user_id` is deliberately *not* stamped: since FR-25.19 it is the assignment, which the client chooses). A client placeholder like `'current-user'` must never reach a foreign key. Likewise, clients can never grant the `owner` role, and the trip creator's membership row is immutable.
4. **Generation runs client-side.** Template instantiation, dependency resolution, quantity suggestions, analytics, the review assistant, cloning and import all live in `client/src/domain`, not on the server — because **Local Mode has no server** and must keep every one of those features. Moving one of them server-side silently removes it from a supported mode. **And there is only one of each** (ADR-008 driver 2, enforced 2026-08-23 by ADR-025): the server had a second portable importer in `internal/store`, unreachable from any product surface, which had drifted from the client's and wrote rows without a change-log entry — so what it imported reached no device. It is deleted, and so is the matching *exporter*, which was behind in the same way — it wrote no status, no ordered tags, no marks, no `from_inventory`. With them went `internal/portable` and all four YAML endpoints; the Go side no longer knows the format exists. `GET /me/export.json` and `GET /trips/{id}/export.csv` stay, because neither has a client-side twin. Anything outside the browser that has to run these rules runs *this* code: the FR-18.7 import command is a Node program over `client/src/domain/portableImport.ts`, which takes its inventory view, its mutation factory and a write sink as parameters. **A rule of theirs must never be reachable only through a Vue composable** — that is what made the duplicate necessary in the first place.
5. **Three modes, one artifact.** Behaviour is selected at runtime, never by a separate build — but note where each switch lives: the client's `jitpack_mode` is only `local` or `server`; **Single-User is a server-side configuration** (`api.NewSingleUser`) that a `server`-mode client discovers by being offered no OIDC. There is no third client mode. Every feature must answer: what happens in Single-User Mode (auth and membership are bypassed — anything gated on `authed` is inert) and in Local Mode (no network)? Server-only surfaces are hidden per G-8, not left broken.
6. **Item image BLOBs stay outside the sync envelope** (ADR-002). Only `items.image_hash` flows through the master feed; the bytes move over their own endpoints. The 150 KB / JPEG limit is enforced at handler, store and CHECK constraint — three layers on purpose.
7. **Coverage gates are enforced, not aspirational**: ≥75 % overall, ≥90 % `internal/sync`. An uncovered branch in merge logic fails review regardless of the total.
8. **Everything resolves to an exact version verified by hash.** npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA with the tag as a readable comment. Never a bare tag. Dependabot updates the digests, so pinning costs no freshness — **except where a version is also a toolchain decision, and then it is made by hand**, because CI compiles through `setup-node`/`setup-go` and never through the build image, so a lone bump would ship an artifact built by a version nothing tested. A **node** major is named in the root `Dockerfile`, `mise.toml` and every `node-version:` in `ci.yml`; a **Go** major in the `Dockerfile`, `mise.toml`, `go.mod` and — because the linter refuses a config for a newer Go than it was built with — the `golangci-lint` pins in `mise.toml` and `ci.yml`. `scripts/toolchain-pins-gate.sh` (in `make ci`, first in `docker-build`) compares them and fails naming the files still to change; Dependabot's majors therefore arrive red on purpose. It deliberately does **not** judge whether a pinned linter release is new enough for the go directive — no file records that; `make ci` running the binary is what says. Log: *„A version that was named in a fourth place"*.

   **The Playwright image** in `scripts/playwright-image.sh` — sourced by `scripts/visual.sh` and `scripts/e2e.sh` — is bumped by hand, because Dependabot's docker ecosystem reads Dockerfiles rather than shell scripts, and because a bump rewrites every visual baseline and should be a decision rather than a Tuesday (ADR-013). Both scripts compare the pin against `@playwright/test` in `client/package-lock.json` before starting the container, because Dependabot bumps the lockfile and cannot see the image.
9. **Colors come from one token table** — `client/src/theme/catppuccin.css` (`--ct-*`, Mocha as the dark default, Latte behind `jitpack-latte`). Ionic's variables consume those tokens; there is no parallel color system and no hard-coded color — **not even as a `var(--x, #fallback)`**, which is a second unreviewed palette that only paints when something is already wrong. (One written exception: the §3.28 item mark's glyphs paint their own colours, because they come from the emoji face; it stays an exception because FR-28.5/G-15 confine the mark to content and `markRendering.spec.ts` confines the face to two components — ADR-021.) Above the palette sit the three **role anchors** (`--jp-brand` peach, `--jp-action` blue, `--jp-done` green/teal, G-11/FR-21.7): a component asks for the role, and only that block decides which hue a role is. **Type comes from a second table beside it**, `client/src/theme/typography.css` (the two self-hosted faces, the `--jp-text-*` scale, the `.jp-*` role classes): which face and size a piece of text takes is decided by its role, each role is defined once there, and a view never sets its own `font-family`, `font-size`, `font-weight` or `letter-spacing` — the gate in 9b rejects all four. **Icons are a second table beside the type scale** (`--jp-icon-*`): `font-size` on an `ion-icon` is a glyph box, not a text size, and sharing one scale would tie an empty-state illustration to whatever body copy does next (G-13, FR-21.5/21.6).
9b. **Shape comes from a third table, and the three are enforced by a gate** — `client/src/theme/surfaces.css` (the `--jp-r*` radius scale, the three elevation casts, `.jp-card`). Depth is a role like brand and action: **page → card → sunken**, named once as `--jp-surface-*`, and Ionic's background variables resolve *through* those roles. Elevation is **one geometry cast in the flavour's ink** — the offsets live in `surfaces.css`, the ink and its weight in `catppuccin.css`, because a shadow that reads as depth on near-black reads as dirt on near-white. `scripts/design-tokens-gate.mjs` (run by `make client` and the CI `client` job) rejects a raw colour, a raw type declaration, a raw `border-radius` length or a raw `box-shadow` anywhere in `client/src` outside the three theme files. Four carve-outs, each **by rule and not by allowlist**: `50%` (a circle is a shape, not a size), a `0 0 0 <n>px` ring (casts no light, so it is not elevation), `letter-spacing: 0`/`normal` (a reset declines a decision rather than making one), and SVG text — inside a `viewBox` a font-size is in *user units*, so it lives as an attribute in the template beside the other geometry and never reaches CSS. **What this invariant is actually for:** the M4 group card painted itself `--ct-mantle` — a valid palette token, passing invariant 9 — which was the exact colour of the page behind it. A card can satisfy every colour rule and still not be a card, and only a rendered pixel can tell you (G-14, FR-21.8).

## Testing

Test-first: every behaviour starts as a failing test that reads as its specification, then implementation until green.

- **Naming as specification** — `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`. The failing test name alone must say which rule broke; carry the FR/NFR id in the name or body.
- **Table-driven** with named `t.Run` subtests for domain logic.
- **Real in-memory SQLite** (`:memory:`) for store and api tests — never a mocked database. Hand-written fakes behind small consumer-side interfaces; no mocking frameworks.
- **Failure paths** are covered wherever code enforces a correctness or authorization rule, not just the happy path.
- **No non-deterministic timing constraints** — in Go, Vitest and Playwright alike. A test must never depend on wall-clock timing that only *probably* holds: no sleeps, no fixed waits for async work, no polling for an effect that might not land. If a test can only pass by waiting-and-hoping, the fault is in the production code — give it a deterministic seam (injected clock, completion signal, settled state) so the test asserts the outcome directly instead of racing it.
- **A Vitest spec declares its own environment.** The default is `node`; a spec that
  needs a DOM carries a `// @vitest-environment jsdom` docblock. Add it whenever the
  spec's *subject* touches `localStorage`, `document` or `window` — **even if the suite
  is green without it**. A missing docblock is not reliably a red test: production code
  that reads a DOM global inside a `try` takes the `catch` under `node`, and the spec
  passes while asserting against the error path. Only a coverage diff between the two
  environments catches that.
- **The globals come from one harness**, `client/src/__tests__/harness.ts`
  (`installHarness()` in `beforeEach`): pinia, `fetch`, `WebSocket` and the response
  builders. It stubs `localStorage` **only under `node`** — under `jsdom` the real one
  stays, because replacing it means asserting against the stub instead of the environment
  the spec declared. A spec still owns anything bespoke (a constructible `WebSocket` that
  records instances, a storage that throws) by stubbing after the call.
- **A coverage count says how many promises have no test, never how many deserve one.** Measure a
  screen, not the repository, and **never re-derive the headline number to compare against it** —
  a second grep is a second *method*, not a second measurement. An unwritten case is as likely to
  be an unbuilt promise as a missing test; only reading it against the screen says which.
- **Before crediting an assertion, ask whether it would have passed before the action.** A clause
  can be green and unfalsifiable — an absence needs a positive signal (a recorded call, a settled
  state, a planted response), and for an absence the signal must be the same event reaching
  somewhere else. A `data-testid` that occurs in no test is a dependable sign that no test has
  ever operated that control.
- **A case id in a test title is a coverage claim**, and `scripts/case-id-gate.mjs` (in `make ci`)
  refuses a duplicate definition. When two entries have collided, **a number means what the suite
  implements**: the loser is struck through in place and says where its promise went, never
  renumbered, because a reader arriving from an old commit has to land somewhere that explains it.
  Run one case with `-g "E2E-M5-05"`; the ledger is `dev-docs/e2e-tests.md`.
- **Always `-race`.**

## Working agreement (see CODING_PRINCIPLES.md for the full detail)

- **Never commit to `main`.** One git worktree per feature under `.claude/worktrees/`, branched from `origin/main` → PR → green CI → **wait for the merge go-ahead**. Merge with a hand-written squash subject; release-please derives the changelog from it.
- **A feature PR is complete**: backend + the client UI that exposes it + the spec update in `dev-docs/` (PRD Addendum / UI-Spec / Sync-API-Spec / UI-Test-Spec) + an ADR when a real tradeoff was decided + the `docs/` page when the change is visible to whoever runs the instance. Never "UI in a follow-up", never "docs later".
- **A UI change ships a *running* Playwright case, not just a written one** (owner, 2026-08-13, after finding four navigation defects by hand that both green screen suites had missed). Three rules that follow, each paid for by one of those defects:
  - **Cover the global patterns, not only the screen the PR is about.** Getting to a screen, leaving it, and what the app bar does afterwards are behaviours; `client/e2e/global-nav.spec.ts` owns them.
  - **Assert what is *rendered*, never only the URL.** Scope assertions to the visible page (`ion-router-outlet > .ion-page:not(.ion-page-hidden)`) — a route change that does not repaint keeps every URL assertion green.
  - **Never a `waitForTimeout`.** If nothing observable exists to wait on, that absence is the defect: give the production code a signal (the G-2 indicator now reports an in-flight Local Mode write for exactly this reason).
- **An ADR is owed only for a real tradeoff** — options weighed, one chosen at a cost. Not for additive config fields or mechanical refactors.
- Run `/pr-review` on your own PR before asking for the go-ahead — **every PR, and its verdict comment is the evidence it happened**. A missing verdict is itself a blocker, not a formality skipped: of the four PRs merged on 2026-08-17, #103 got no review at all and two of the reviewed ones marked coverage ✅ for a feature the diff only half contained (see the skill's §4.0).
- **English throughout — and that includes quoting the owner.** Specs, ADRs, the log, code
  comments, commit messages and PR text are English; a request made in German is *translated*,
  never pasted in as a „…" quote (owner, 2026-08-23, after one reached an NFR). The single
  exception is German that is **content**: UI labels and screen copy being specified, sample and
  seed data, the mark index's search keywords, and the `de` catalogue itself (NFR-4.12) — a spec
  that translates a button's label describes text no screen renders. Comments justify *why*,
  never *what*; godoc on exported symbols is mandatory.
- **No magic strings or numbers** (CODING_PRINCIPLES §4a): a literal that is compared against, switched on, or repeated across files is named once — `store.Table*`/`RoleOwner` in Go, `TABLE` in `client/src/types/tables.ts`. `goconst` is the Go floor; serialization keys are the documented carve-out.
- Standard library first — a new dependency needs a one-line justification; footprint is a first-class concern (NFR-4.3).
- Conventional Commits, allowed types `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` (`build:` only where Dependabot generates it). Reference spec ids (`FR-5.4`, `NFR-4.2a`) when implementing them.

## Don'ts & pointers

- Don't add a migration (invariant 2, ADR-018) — `.claude/settings.json` denies creating `internal/store/migrations/**` as a speed bump; a schema change edits `internal/store/schema.sql`.
- Don't restructure `dev-docs/implementation-log.md`; append to it — and **only when the work earns an entry**. Its own "What earns an entry" section is the rule: if the diff and the commit message tell the same story, write no entry; what belongs there is what the code cannot show (a rejected option, a wrong premise, a cost accepted on purpose, a trap with a price). An entry that lands also gets a line in the file's index — `scripts/log-index-gate.mjs` enforces that, so an unindexed section fails `make ci`.
- Don't grow `CLAUDE.md` with history. It is loaded in full for every session, so a closed backlog item shrinks to one line and a pointer; the narrative belongs in the log.
- Don't duplicate the schema into docs, and don't duplicate an ADR's rationale into a code comment — a `// see ADR-00N` pointer is enough.
- Don't judge a UI change from the stylesheet. Render it, look at it, and let the maintainer eyeball it before the Playwright case is finalized.
- **Run `make fmt` before pushing** if `make ci` complains: since ADR-040 the CI `format` job *checks* gofmt and prettier instead of fixing them, so formatting can fail a build. It no longer pushes anything to your branch — the `action_required` state that used to make a PR look checkless is gone with it.
- **The e2e shard count is a measurement, not a constant.** It is 8 (`ci.yml`), sized 2026-08-30 against ~1920 test-seconds. A suite that grows makes it stale *silently*, because the only symptom is a slower pipeline. When e2e feels slow, read the per-leg times of a recent run before anything else.
- **CI/CD layout** (`.github/`): `ci.yml` (go, go-lint, client, format, visual, e2e ×8, e2e-single, e2e-server, docker-build, dependabot-merge), `docker.yml` (one image to ghcr.io on `v*` tags, ADR-043), `release.yml` (release-please). A `concurrency` group supersedes a superseded **pull-request** run; a `push` to main is never cancelled, because its run is the record that main was green. Dependabot merging is gated by `dependabot-merge`, which `needs` every check job. **`main` is protected**: required checks are `go`, `go-lint`, `client`, `format` (since ADR-040) and `docker-build`; force-pushes and deletion are off, linear history is required, admins are not exempt, review approvals are not required. `e2e` and `visual` are deliberately **not** required — an eight-leg matrix would need eight listed names and `dependabot-merge` already waits for it, and a skipped required check reports worse than the failure under it. If a required check wedges, lift protection with `gh api -X DELETE repos/polandy/JIT-Pack/branches/main/protection`, merge, then re-apply.

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` uses pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`. History in `DEVIATIONS.md`.
