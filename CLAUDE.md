# CLAUDE.md — JIT-Pack

Self-hosted, offline-first, multi-user packing-list app. Go backend with embedded SQLite; Vue 3 + Ionic client (a Capacitor native shell stays planned per ADR-006 — the `@capacitor/*` packages were removed while unused and come back when the native build actually starts). Runs in three modes from one artifact: **Server** (multi-user, OIDC), **Single-User** (no auth, no membership) and **Local** (no backend at all, IndexedDB).

Read this file fully before touching code. It is the orientation document: what exists, where it lives, and the rules that must not break. It is deliberately short — the running history of what was built lives in `dev-docs/implementation-log.md`.

## Commands

- Toolchain: pinned once in `mise.toml` (go, node, golangci-lint, at the versions CI resolves). Run `mise install` per machine; the Makefile re-execs through `mise exec` when they are not already on PATH, so `make ci` works from a plain shell in a fresh clone.
- Build: `go build ./...` (binary: `go build -o jitpackd ./cmd/jitpackd`)
- Test: `go test ./... -race` — fast, no docker or network; store/api tests run against real in-memory SQLite
- **Verify before finishing any change: `make ci`** — it mirrors the CI jobs 1:1 (gofmt, build, vet, race tests, coverage gates, golangci-lint, client lint/build/vitest), so green here predicts a green pipeline
- Slow jobs, excluded from `make ci` on purpose: `make e2e` and `make visual` (both need docker and a built bundle — they run inside the pinned Playwright image, `make visual-update` rewrites the baselines, ADR-013) and `make docker-build` (needs a docker daemon). `make all` runs everything.
- **Run the slow jobs on GitHub, not on this machine** (owner, 2026-08-23): `make ci-remote` pushes the current branch, dispatches `ci.yml` against it and waits for the verdict — no pull request needed. `e2e`, `visual`, `docker-build` and the coverage profile all run there already, and on a two-core laptop they are the largest source of contention between concurrent sessions (measured: foreign load costs ~25 % of wall-clock, about what a hardware upgrade would buy). `make cover` in particular is fully redundant — the CI `go` job runs the same profile and the same `scripts/coverage-gate.sh`. **`make ci` stays local**: at ~80 s it is the fast gate, and GitHub's verdict takes minutes.
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
| What do the screens look like? | `dev-docs/UI_Spec_v1.10.md` — screens M1–M21, global patterns G-1–G-16 |
| What is the packing concept supposed to feel like? | `dev-docs/UI_Concept_Prototype.html` — the clickable mockup every §3.25/§3.27 decision was tested against; **`node dev-docs/UI_Concept_Prototype.verify.mjs` drives it headless and must stay green** |
| What's the wire protocol? | `dev-docs/Sync_API_Spec_v1.3.md` — pull/push envelopes, HLC format, merge algorithm, WebSocket events, RPC endpoints |
| What's the DB schema? | `internal/store/schema.sql` — one always-current file, **single source of truth, never duplicated into docs/** (ADR-018) |
| Why was X chosen over Y? | `dev-docs/adr/ADR-00N_*.md` — options considered, weighted decision matrix, consequences, revisit trigger |
| How do I run and operate this? | `docs/` — the published user manual; `docs/index.md` is its landing page |
| What must the UI test suite cover? | `dev-docs/UI_Test_Spec_v1.0.md` — Playwright scope: per-screen cases, cross-screen flows, FR/NFR traceability matrix |
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
PRD §3.25/§3.27, UI-Spec and UI-Test-Spec — and open as implementation. Owner decision
2026-08-08 on sequencing: **finish the concept before implementing**, then start with the
domain-free basics (login, users, code base) rather than with packing features. The reasoning
for each item below is in `dev-docs/implementation-log.md`, section "Concept phase".

**How to read this list.** It is a backlog, not a history: **a closed item is one line and a
pointer**, and only what is still open carries enough detail to act on. The reasoning behind
any item — options rejected, premises that turned out wrong, costs accepted — is in
`dev-docs/implementation-log.md`; its index names every section, so scan that before opening
it. Item numbers stay stable even as items close, because the log refers back to them.

1. ~~**The basics first**~~ — **done** (2026-08-09, PRs #54–#58, #60). Auth/authorization
   (ADR-007), failure-path coverage, supply-chain pinning, the two migrations in item 5, and
   `mise.toml` as the single toolchain pinning. Log: the five *„Basics audit"* sections.
2. ~~**§3.27 client package**~~ — **done, §3.27 owes nothing more** (2026-08-16 … 08-19):
   generation from composed Vorlagen, the FR-27.4 group refresh (ADR-016) and its
   same-day revision to *asking* at the trip, FR-27.3 single items in M3, FR-27.10 whole
   groups onto a running trip, portable YAML carrying the composition (ADR-017), and M21
   folding a finished trip back into its groups (FR-27.5). Log: seven sections, from
   *„§3.27 generation"* to *„M21 — Vorlage aus Reise"*.
   The gap that stood open here is closed too (2026-08-21): the Local Mode backup carries
   the three FR-27.4 tables, named in the trip document and re-keyed on restore against the
   ids it just created (ADR-015 amendment). Log: *„The device backup carries the FR-27.4
   refresh state"*.
3. ~~**The design foundation, then the remaining screen rebuilds**~~ — **both complete**
   (2026-08-14 … 08-16). The foundation is the three token tables plus the gate (invariants
   9/9b), the FR-25.2 pack-out and the ADR-013 visual baselines; the rebuilds are M4, M5, M7,
   M8, M9/M10, M11, M12 and M14, all localized with `t()`. Plan:
   `dev-docs/design-foundation-plan.md`. Log: eleven sections, from *„The app gets its own two
   faces"* to *„M14 — review assistant rebuilt"*.
   **What was still owed from it is paid** (2026-08-24): M14 has been eyeballed with real
   proposals, first from the dev fixture and then from a trip built through the app — what it
   showed became FR-9.4, and item 15 built the answers.
   E2E-M12-03's positive half is **written since 2026-08-21**, and the cost M4 carried from
   the M5 rebuild — losing its scroll position when a detail opened — is **paid** with it:
   `lib/scrollMemory.ts` holds the offset *and* the header-line state across the replace
   (E2E-M4-45, ADR-012's second amendment).
4. ~~**i18n migration**~~ — **done** (2026-08-22). Every screen is on the catalogue; the rule
   it was run by is that a **section is the unit**, because a half-translated screen is worse
   than an untranslated one. M17 Settings was the last, and the trap it closed is worth keeping:
   **finished text in a module-level constant is unreachable by a language switch**, the same
   shape that had stranded the nav anchors and the route titles. Log: *„The i18n migration…"*
   and *„M17 was the last screen…"*.
5. ~~**Two migrations owed by concept decisions**~~ — **done** (2026-08-11): `travelers.profile`
   dropped, `trip_items.packed_by_user_id` carries the packing record and `packer_user_id` the
   assignment (FR-25.9/25.19). Log: *„Migrations 018/019"*.
6. **Playwright suite** — `dev-docs/UI_Test_Spec_v1.0.md` is written and the per-screen cases
   are landing screen by screen. **`dev-docs/e2e-tests.md` is the ledger of what is actually
   covered, and it is the file to read and update** — a green `e2e` job is not the same as a
   verified UI (log: *„What ‚covered by e2e' was not covering"*). Measured 2026-08-30:
   **250 of 370 case ids have a test.** The count is not the backlog, though — **M6 was the
   first screen taken through it**, and of its 17 unwritten ids only two needed a new case:
   four were already asserted by cases that existed, four described behaviour the app had
   deliberately reversed, and eight described a screen nobody built. Retired that day
   (owner): M6's filter bar, search field, composer fields and per-item note; **owed and
   decided to be built:** FR-25.12's row sheet. Log: *„Seventeen unwritten cases, two worth
   writing"*. **M4 followed 2026-08-30**, and its 17 unwritten ids sorted differently again:
   four were already asserted with no id on them — three of those as *unit* tests, which is
   why grepping the id confirmed a gap that reading the suite refuted — four described a
   removed gesture or a reversed rule, and eight were real, small remainders now written.
   The rule the two screens agree on: **a coverage count says how many promises have no
   test, never how many deserve one**, and the order is promise → screen → test. **Do not
   re-derive the headline number to compare against it** — a second grep is a second
   *method*, not a second measurement (a broader id pattern turns 250/370 into 272/383 on the
   same tree), and a retired entry stays in the file struck through, so it goes on being
   counted as a gap forever. Measure a screen, not the repository. Two owner decisions are
   open (M4's container chip, the amber prep cast on M4); worth carrying forward:
   **`rowEdgeAvatar` had been a rule inside a component since the concept round**, so its
   case could not be written at all until it moved. Log: *„A blocked case that had quietly
   unblocked, and one that had quietly been covered"*. **M2 followed 2026-08-30 and sorted a
   fifth way**: three of its nine unwritten ids were real and are written (E2E-M2-05/06/07 —
   the whole slide menu had never been *operated* by any test, only asserted present), three
   were already covered elsewhere or described a gesture M2 never had, and **three are
   promises the screen never kept** — the list still groups by series and sorts newest-first
   where the 2026-08-08 review decided flat-with-a-chip (E2E-M2-15, renumbered off a
   duplicated id), the row has no participant avatars (E2E-M2-03), and `trips.imported` is
   written by M15 and read by nothing (E2E-M2-08). Those three are open with the owner and
   **deliberately have no test**: a case written first would leave a red suite pointing at a
   rebuild nobody scheduled. The general form: **an unwritten case is as likely to be an
   unbuilt promise as a missing test**, and only reading it against the screen tells you
   which. Log: *„Nine promises, three tests and three things that were never built"*. **M17 followed the same day** and produced a fourth: **a promise whose own
   wording was the defect.** E2E-M17-07 said the backup reminder is *„cleared after a YAML
   download"*, and NFR-4.11 says the backup it warns about is the **whole device** — so M17's
   per-trip YAML clearing it was a bug the case had been describing as the specification.
   Fixed here, with the tail it had (the banner only ever refreshed on the exports that should
   not have counted). Five cases written (E2E-M17-01/03/06/07/07b/08), one retired with its
   reason (M17-02: unit-owned, and its remaining branch is unreachable in a suite whose
   browsers all support Push), and two scope labels corrected against the screen — `all` meant
   `server` for the data section, which is a *different section* in Local Mode. Also worth
   carrying: **the theme toggle had never been pressed**, because every colour test seeds
   `jitpack_theme` and asserts the palette. Log: *„A promise that was its own defect"*.
   **M5 followed as well**, and
   found the failure mode the other two could not: **an id can mean two things**. Six
   `E2E-M5-*` numbers were each defined twice — the v1.0 catalogue and the §3.25 rebuild,
   in one section, never reconciled — so four *green* tests read as coverage of four
   promises nothing asserted. Neither commit that caused it is reviewable as a mistake
   (both are pure additions to a long list) and the coverage count went **up** each time.
   The rule that resolved it, and the one to reuse: **a number means what the suite
   implements**; the loser is struck through in place and says where its promise went,
   never renumbered, because a reader arriving from an old commit has to land somewhere
   that explains it. Under the collision sat the audit's real finding: FR-25.15's save
   indicator was a relabelled G-2 glyph on all four sheets carrying it, so offline — the
   one case the requirement exists for — an open write said *saved*. It had survived
   because the component's doc comment quoted the requirement, its unit test pinned the
   defect as the rule, and the shadowed id made the promise look answered from every
   direction. Owner retirements: M5-01, -03, -04, -09, -06(A), and FR-7.3's never-built
   resolution restriction. **The class is a gate now** — `scripts/case-id-gate.mjs`, in
   `make ci` — because nothing here was catchable by eye; it found **four more** live
   collisions the same hour (`E2E-M3-11/-12/-13`, `E2E-M4-32`) — **since resolved and the
   register is empty**: three were duplicates of live ids, and the fourth left a promise the
   quick-add has never kept (it pulls required companions **silently**, where the skip names
   what it took along) which is an open owner decision. **78 of 300 case ids live only in a
   comment and not in a test title**, so `git grep <id>` understates coverage — a separate,
   suite-wide cleanup. Log: *„Six numbers that each meant two
   things"*.
   **M9 followed the same day and found a sixth shape: two ids that were simply on the wrong
   tests.** The §3.24 rebuild wrote the spec entries and the tests in one commit and numbered
   the tests `E2E-M9-02`/`E2E-M9-03`, whose entries describe the FAB's creation mode and a
   multi-select merge — so for a year the two behaviours those ids promise had no test while
   reading as covered, and the two that *were* tested (M9-05/06) read as implemented under
   somebody else's number. **`scripts/case-id-gate.mjs`, landed one PR earlier, cannot find
   this**: each id is used exactly once, so the duplicate check is green, and the totals are
   identical either way — a swap is not a collision. Renumbered, and the two
   ids it freed sorted the usual way — **M9-02 retired** (E2E-M10-07 asserts the creation mode
   and reaches it through `m9-fab`), **M9-03 is an unbuilt promise** (there is no multi-select
   and no merge on M9; FR-16.3 is deduplication *on import* and M15/M18 discharge it — owner
   decision, and note PRD FR-27.5 argues against fuzzy matching partly *because* M9 can merge).
   Two real remainders written: **E2E-M9-04**, whose state no test had ever rendered
   (`m9-empty` existed in the suite only as an *absence* assertion), and **E2E-M9-10**, the
   word „searchable" in M9-01's sentence that nothing typed into. Log: *„Two ids on the wrong
   tests"*.
   **M11 and M12 followed 2026-08-30, and both had every id implemented** — so
   the audit's product was not new cases but a **seventh shape: a clause whose
   assertion cannot fail.** E2E-M12-01 switched to the *Gepäck* dimension and
   asserted `analytics-slice-none`, which the *Kategorie* view it started on
   already rendered — the absence bucket is keyed `''` in every dimension, so
   the same element was on screen before and after the click; and its
   packed/planned KPI was asserted in a world where the two were equal.
   Underneath sat FR-10.4, credited to the case while **no test had ever put an
   item in a bag and opened the screen**. The check that finds this shape:
   **would the assertion have passed before the action?** Two more clauses were
   credited and unasserted (M11-05's absent Save button, FR-10.1's carrier being
   *optional* — nothing had ever cleared one), and **two promises are unbuilt**:
   FR-10.3's per-trip imbalance threshold is honoured by the domain and written
   by no screen, and UI-Spec M11's *„and from M12"* edge does not exist. Both
   open with the owner, deliberately untested. Log: *„An assertion that was true
   before the click"*.
   **M7 and M23 followed 2026-08-30.** M7's catalogue predates the 2026-08-15 variant pass that
   rebuilt the screen, so three of its ids describe surfaces that pass removed or never built:
   M7-01's my/published split (FR-1.6's simplification — nothing to render) and M7-03's name
   prompt are **retired**, and **M7-05's FAB import menu is an unbuilt promise** — an owner
   decision, because import *is* reachable from the header icon and UI-Spec M7's Actions line
   claimed the menu as built while the same document's amendment listed it as owed. Three
   remainders written, each a clause of an id that read as covered: the row's **resolved** item
   count (E2E-M8-07 composes only empty groups, where the raw and resolved counts are both 0, so
   the one arithmetic the row does was invisible to it), M7's **no-match** state and the search
   that produces it, and the header icon's trip to M18 and back to M7. M23-01/02/03 keep every
   clause they promise — but all three retire an *item*, so **E2E-M23-04** renders the Vorlagen
   half for the first time. Log: *„A row that could not count, and a segment nobody filled"*.
   **M8 followed the same day and was the first screen with no unwritten ids at all** — all
   twenty-four already had a test — so the read had to be clause by clause, and that is the only
   reading that finds this: **E2E-M8-06 had read *implemented* since the M8 rebuild while nothing
   in the suite ever removed a position** (`m8-position-remove-*` occurred in no test, and the page
   has no component test). It survived because the ✕ was a *decision* that commit made — the M7
   variant pass had just rejected the swipe — so it went into three documents as an **amendment**,
   and the amendment is what everyone then read: **a clause that arrives as news is not checked the
   way a clause that arrives as a requirement is.** Written, with the name sort and the empty state
   nothing had rendered. Four unasserted clauses of other ids went in with it (M8-12's *nothing
   auto-opens*, M8-13's two-character gate — `MIN_SEARCH_LENGTH` had no assertion anywhere and is
   shared with M3 — M8-03's clear-on-retap, and M8-05's sentence, which specified the pre-2026-08-18
   FR-27.4 model the screen had already stopped following). Three were checked and deliberately left
   (M8-02's default, M8-14's *scrim tap* = Ionic's own `backdropDismiss`, M8-15's group-name match =
   the `searchGroups` unit). **No owner decision owed.** Log: *„A control nobody had ever clicked"*.
   **M10 followed and is the same commit's larger half**: five tests written under
   **M10-01 … M10-05**, which were live entries for five other promises, while the three ids
   the commit marked implemented (07/08/10) had no test carrying them. `e2e-tests.md`'s
   promise table named them right the whole time and nothing else did — **when two documents
   disagree about coverage, the one mapping test bodies to ids is the one to trust**.
   Renumbered. Two real remainders written, both sections that were built in July and had no
   `data-testid` anywhere: **E2E-M10-03** (the dependency section — its cycle refusal, its
   default mode, its read-only reverse list; two other cases only *drive* it as setup) and
   **E2E-M10-04** (the photo, add/replace/remove, read back from the device). Retired: M10-01
   (clause by clause), M10-02 (its „delete blocked" half was reversed by FR-24.3) and M10-09
   (a second id over M10-03's section). **Two unbuilt promises, owner decision owed:**
   „Enthalten in" (FR-27.8) and „Kommentare aus Reisen" (FR-27.9) exist in the prototype and
   in three specs, and in no build — including inside FR-24.5, which named them as the
   sections creation mode hides, so a green case asserted the absence of something absent in
   both modes. Log: *„Five numbers, and two sections nobody had built"*.
   **M18 followed 2026-08-30 and inverted the pattern**: nothing was retired and nothing was
   unbuilt — all four of its unwritten ids describe built behaviour on the **merge preview**,
   the branch a single-document file opens, which no test had ever rendered. It was invisible
   because the suite *uses* that branch: two `packing-list.spec.ts` cases click through it as a
   fixture and assert nothing, and **a screen that appears as a fixture reads like a screen that
   is covered**. All four written. The finding was in the clauses: „creates a trip in *planning*
   status" was reversed by ADR-024 a year earlier and still stood in five places, one of them a
   comment three lines above the code that reads `doc.status`; „the same dedup component as
   M15" was never true (the shared thing is `findDuplicates`); „rejected before this screen is
   ever shown" misplaces a refusal that is M18's own picker step. Log: *„The branch the backup
   never took"*.
   **M21 and M22 followed 2026-08-30**, both with every id implemented and no id on the wrong
   test, so the product was four cases and two owner decisions. M21's finding is about *time*:
   the FR-1.6 name refusal was added to the screen on 2026-08-25, five days after its cases
   landed, and **a rule that arrives after a screen's cases do is invisible to every one of
   them** — nothing had rendered the note, the disabled button, or the rule that exists nowhere
   else (the Vorlage and the bundle group written in one pass must have different names). Two
   more clauses could not fail: the word *checked* (no test had ever operated a loose row's
   checkbox) and the blast note, asserted visible only in the one world where it can produce a
   single branch. M22's ids are all sound, but reading its **element list** against the template
   found two fields the screen does not have: the **series** is edited on M16, and **the trip's
   year cannot be changed anywhere** — an owner decision, since FR-2.1b makes it the one
   required temporal fact. Two more: the archived editor had never been opened by any test and,
   opened, says nothing about why it answers no tap (second owner decision); and the rename —
   one of the roster row's three affordances — had never been operated. The transferable one is
   procedural: E2E-M22-03's own note records this exact race being fixed in 2026-08-21, and
   **the fix was written into one case rather than into the file**, so five siblings kept
   navigating straight after a write and E2E-M22-08 failed against correct code during this
   audit. Log: *„A rule that arrived after its tests"*.
7. ~~**Looking inside a group**~~ — **done** (2026-08-16, FR-27.12): a group names its first
   items and a chevron opens the resolved peek sheet. M8's picker chips still offer names
   alone — deliberate, revisit trigger in FR-27.12 (which item 8 is now firing).
8. ~~**FR-27.13 — the M8 group picker cannot be searched**~~ — **done** (2026-08-22): the
   picker card carries a search above six groups, matching group and resolved item names;
   results are FR-27.12 summary rows. Three points settled while building are recorded in
   the FR itself, including that the promised diacritics folding existed nowhere else yet.
9. ~~**FR-27.14 — a Vorlage cannot show its resulting items**~~ — **done** (2026-08-17): M8's
   resolution footer opens the FR-27.12 peek sheet on the Vorlage itself, each line naming its
   source. Log: *„FR-27.14: the footer stops being the whole answer"*.
10. ~~**FR-2.6 — M3's review step only reviews the amount**~~ — **done** (2026-08-17, variant A):
   the row carries the amount and a ✕ that drops it as FR-5.5 *skipped* rather than deleting it.
   Log: *„FR-2.6 variant A"*.
11. ~~**FR-5.5's „bewusst nicht einpacken" has no control**~~ — **done** (2026-08-18): the row's
   press-and-hold menu plus the spelled-out M5 control (variants A + C); the swipe was removed
   rather than repaired. Five e2e cases in `client/e2e/skip-item.spec.ts`. Log: *„FR-5.5"*.
12. ~~**§3.28 — the item mark**~~ — **done** (2026-08-22, ADR-021): one optional emoji on
   `items.icon` and `templates.icon`, a curated searchable index that answers both the search
   and the name suggestion, a shared picker used by M10 and M8, and one `ItemMark` component
   owning the per-surface fallback ladder. The face is self-hosted and subsetted (80 KB, 103
   code points) and held to the index by `scripts/mark-font-gate.mjs`. The deliberate
   `make visual-update` and the seed extension shipped with it — and the baseline cost the
   spec predicted did **not** arrive: four of twenty-two moved, none of them for the face.
   Log: *„§3.28: the mark gets built"*.

13. ~~**FR-27.15 — M8 does not notice when loose positions are a group**~~ — **done**
   (2026-08-22): a non-blocking suggestion row per recognised group, *Zusammenfassen* on the
   picker's write path with *Rückgängig*, *Ignorieren* device-local and keyed to the group's
   item set. Three widenings settled while building are recorded in the FR itself — the most
   consequential being that the stated deviation covers every generation-relevant field, not
   only the quantity. Log: *„FR-27.15: the editor learns to recognise its own duplicates"*.

14. ~~**The multi-user concept's unfinished half**~~ — **closed 2026-08-30** — the concept itself is built and holds
   (NFR-4.2a: HLC + field-level LWW, additive fields, terminal precedence, the `conflict_log`,
   G-3's lock, presence, FR-25.19/25.20's assignment). Five places did not do what the spec said,
   each verified in the code, worst first — all five are closed:
   **(a)** ~~`groupDecision` let *any* incoming `packed` win regardless of HLC~~ — **done**
   (2026-08-22, ADR-022): the real fault under it was one `updated_hlc` per row where §6 says
   per field-group; `field_hlcs` now carries a clock per field, rule 2 is the two pairs §6
   names, and a conflict entry names the losing `mutation_id` and `actor_user_id`.
   Log: *„Field-level LWW was row-level, and ‚packed always wins' was hiding it"*.
   **(b)** ~~Master-partition conflicts were write-only~~ — **done** (2026-08-22): one query
   serves both partitions, so a conflict on a trip's name or dates is reachable.
   Log: *„The conflict log had two partitions and one query"*.
   **(c)** ~~The push response's `conflicts[]` was read by nothing~~ — **done** (2026-08-22):
   a `merged` push raises one toast per push naming how many fields were overwritten, and the
   G-2 sheet carries the count as a standing line. Log: *„`merged` was a quieter `applied`"*.
   ~~**(d)** G-3's lock ends at the row~~ — **done**
   (2026-08-22): the sheet goes read-only and names the holder, and M4's row names them too. (The
   staleness window this item added is gone again — see item 17.) The fourth part of
   that finding — the server neither expiring a lock nor refusing a push for one — **is not a
   defect and was not built**: §7 makes the lock advisory on purpose, and refusal would wedge an
   offline device's outbox — reaffirmed by the owner 2026-08-23, the lock stays a client-side
   courtesy. **Decided 2026-08-30 (owner): it stays advisory** — the question was reopened and
   closed unchanged, so item 14 owes nothing. What refusal would buy is prevention of a collision
   the field-level merge and the conflict log already survive; what it would cost is the one case
   the app is built for, a device that packed rows offline and meets a claim taken while it was
   away, whose outbox has no answer to a permanent rejection. What was still missing is that a claim could only *end* by packing the row or by
   ageing out: it can be **released** now, and an aged claim says it aged instead of letting the
   row go quiet. Log: *„The lock stopped at the row"*, *„A claim had no way out"*.
   ~~**(e)** NFR-4.2a promises audit **and manual revert**~~ — **done** (2026-08-22,
   ADR-023): a revert is an ordinary mutation with a fresh server HLC, not an undo, so
   the merge rules can refuse it and each refusal has its own sentence. No schema change
   was owed — `losing_value` and an unused `reverted` flag were already there.
   Found 2026-08-22 while answering how concurrent packers are kept from overwriting each other.

15. ~~**FR-9.3/9.4 — the trip's feedback is expensive to give and impossible to correct**~~ —
   **done** (2026-08-24). *ungenutzt* joins M4's press-and-hold menu beside FR-5.5's entry and the
   row carries the mark; the window stays open on the **archived** trip, where M14 runs, while
   *missing* keeps its live-trip gate; and *„Reise abschliessen"* opens the closing pass — a mode of
   M4 over the packed rows whose *„Fertig"* archives and opens M14. FR-9.4's three points went with
   it: a handled proposal leaves *Offen* for an *Erledigt* block, the finished state is reachable by
   finishing, and *„Nie mehr fragen"* is worded. Five e2e cases in `client/e2e/closing-pass.spec.ts`.
   Log: *„A trip could be judged only one row at a time"*.

16. ~~**NFR-4.14 — the client/server contract is written twice and checked nowhere**~~ —
   **done** (2026-08-23/24). The mechanism is ADR-026: `internal/api/wire.go` is the one
   declaration, `make wire` generates `client/src/api/types.ts` from it, and
   `scripts/wire-contract-gate.sh` (in `make ci` and the CI `go` job) fails the build when they
   differ; the 16 error codes are `ErrorCode` constants generated into a frozen `ERROR_CODE`
   object. The **route shapes** are ADR-027: **a path names its scope first, then the resource**,
   the master partition's scope segment is the literal `master`, and an export names its format
   (`/trips/{id}/sync`, `/master/sync`, `/master/conflicts`, `/me/export.json`). Log: *„The wire
   was described twice…"* and *„A route names its scope first"*.
   Coverage closed 2026-08-24: **every response body is a declared type**, held there by
   `TestEveryResponseBodyIsADeclaredType` (an AST check over `internal/api`, so the next response
   cannot be a map literal) and, for the blind spot that check has, by
   `TestWire_NotificationPrefsNamesEveryKindTheStoreKnows`.
   The **routes** followed the same day: `wire.go` declares every path and every path variable,
   the mux registers from those constants, `cmd/wiregen` writes `client/src/api/routes.ts`, and
   four AST rules refuse a route or a path variable taken from a literal. ADR-027's second
   revisit trigger is discharged, and NFR-4.14 owes nothing further. Log: *„A path stopped being
   written twice"*.

17. ~~**FR-5.7 — a claim is broken by a person, not by a clock**~~ — **done** (2026-08-24,
   ADR-028): the staleness window and everything serving it are deleted, and a claim now ends
   only by being packed, released, or **taken over** — confirmed against the holder's name,
   stamped by the server, recorded in `lock_events`, and notified to the holder as a fourth
   FR-6.2 kind. It reverses 14(d)'s "client-side courtesy" for the takeover alone. What building
   it settled is in FR-5.7 itself. Its e2e case became reachable the next day, with the mock-IdP
   `server` project (item 18) — which found that a takeover left the *loser's* device still
   believing it held the row. Log: *„A claim stops having a lifetime"*.

18. ~~**A second identity was unreachable in the e2e suite**~~ — **done** (2026-08-24, ADR-029):
   the `server` Playwright project runs jitpackd in OIDC mode against a mock IdP fixture
   (`client/e2e/server/`), with two browser contexts logged in as two accounts through the app's
   own login. `make e2e-server`, its own CI job, gated on `E2E_SERVER` the way `single` is on
   `E2E_BACKEND`. It closes MVP-plan blocker B3 and the identity halves of E2E-G3-01/02/03 and
   E2E-FLOW-01. The three areas it named as owed are all closed: delegation (E2E-FLOW-02)
   2026-08-25 with item 20's control, presence (G-10) and the admin surface (M20) 2026-08-28 —
   the last two found a facepile initialling a random key, a group-sync badge whose state was
   unreachable, and a deactivated account whose app looked offline instead of saying so.
   **Real-provider coverage closed it 2026-08-30**, split by what each half can establish: the
   metadata half is `internal/api/realprovider_test.go` (opt in with `JITPACK_REAL_IDP_ISSUER`,
   skipped everywhere else, read-only so it is safe against production), and the half that needs
   a person — the login, the second factor, the refresh grant, the disabled-account asymmetry —
   is a written procedure in `dev-docs/e2e-tests.md` rather than an intention. **Item 18 owes
   nothing further.** Log: *„A second account arrives…"*, *„Two screens
   nobody had ever rendered"*.

19. ~~**NFR-4.12 — notifications were the one surface still written in English**~~ — **done**
   (2026-08-29, ADR-037). The bodies come off the catalogue, and the service worker's second copy
   is gone: the app mirrors the finished templates for the active language into IndexedDB and
   `sw.js` reads them there — the one mechanism that still works when a push wakes a worker with
   no page open. The *selection* is written twice by necessity and held equal by a test that loads
   the worker source and drives both renderers; the worker keeps exactly one English sentence, for
   a device that has never written the mirror.

20. ~~**FR-25.19 — responsibility was read everywhere and written nowhere**~~ — **done**
   (2026-08-25). UI-Spec M5 had promised *„Zugewiesen an" → notification (FR-6.2)* since the
   concept round; `packer_user_id` was written once when a row was generated and never again, so
   M4's edge avatar, the „zuständig war …" stamp and FR-25.20's filter all described a state
   nobody could produce, and the delegation notification the server fires could not be produced
   by using the app. The picker sits in M5's *Details ▾* with *„niemand"* as its clear, absent
   where there is nobody to assign to (G-8) and silent on a locked row (G-3). E2E-FLOW-02 covers
   the chain. Log: *„A column everything read and nothing wrote"*.

19. ~~**FR-24.3 — a delete of a referenced master row was refused, not decided**~~ — **done**
   (2026-08-25, ADR-032), for master items **and** Vorlagen: `retired_at` on both tables, the
   server's `stillReferenced` check turned from a refusal into the choice, M10's delete card (which
   did not exist) and M7's confirm stating which of the two happens *before* it does, and
   `itemList`/`templateList` deliberately still meaning everything while display surfaces opt into
   the active lists. §3.24 is closed. **Restore followed the same day** (ADR-034): M23 lists the
   retired rows off M17, and the collision the partial name index makes possible — the freed name
   taken by a new row — is refused on the client before the mutation, with a replacement name
   written in the same write. A retired row nothing references any more can still be removed for
   good. Log: *„A delete that could only be refused"*, *„The restore was free, the name was not"*.

21. ~~**FR-2.8 — M2 opens on the one segment that is usually empty**~~ — **done**
   (2026-08-29): the opening segment is derived from what the list holds and each segment states
   its count. The clause that carried the cost is the settled guard — a list that has not arrived
   is not an empty one (ADR-033) — which is why this started in the orchestrator, with
   `masterDataLoaded`, and not in M2. E2E-M2-13/13b/13c/13d and E2E-M2-14.

22. ~~**FR-25.21 — the per-person model had no writer**~~ — **done** (2026-08-29/30).
   The model has carried per-traveler quantities since FR-25.1 — one `trip_items` row per traveler,
   its own quantity — and M4's cluster, M12 and the FR-27.4 refresh all read it. Nothing in the app could *produce* it: M5's *„Wer braucht das?"* is a single-select, so
   FR-25.10's multi-select was specified in July and shipped as a picker, and FR-25.8's per-traveler
   quick-add was never built. **M6 is a second unbuilt promise found with it**: FR-25.6's
   aggregated buy row was decided 2026-08-07 and `ShoppingPage.vue` groups by category
   only, so a per-person item is N identical rows — inside this FR, not a separate one.
   The editor is one component on two surfaces, membership is a checkbox
   (0 stays FR-5.5's *skipped*), and the write path is ADR-036: keep-and-repoint with ADR-016-derived
   ids, which makes the hand-made row and the generated row the same row. Three points decided rather
   than parked — the cluster head counts people, collapsing sums, and the ADR was owed. No schema,
   server or sync-contract change. Full finding in FR-25.21; UI-Spec M5/M4; E2E-M5-18/19/20, M4-58,
   G3-04.
   **Built 2026-08-29:** `domain/membership.ts` (the ADR-036 planner, 19 unit cases),
   `MembershipSheet.vue` behind M5's *Details ▾*, and E2E-M5-18/19/20 — red-proved, and the five e2e
   callers of the deleted `m5-traveler` picker rewired with them. Log: *„The per-person model finally
   gets a writer"*. **FR-25.8's *Pro Person* quick-add followed 2026-08-29**: a *Gemeinsam*/*Pro Person*
   segment on the shared composer, offered only where there is somebody to distribute over (G-8, so
   never on M8), writing the row first and opening the editor on it — E2E-M4-12/58, M4-13, M4-64/65.
   Log: *„The quick-add gets a mode…"*. **FR-25.6's aggregated M6 buy row followed 2026-08-29**:
   `domain/shoppingView.ts` keys the buy row by M4's own `perPersonKey`, sums the amounts, names the
   recipients, and one check-off settles every instance — the reveal aggregates by the same rule and
   each tab counts rows to buy (E2E-M6-05/06). Log: *„The shop stops asking three times…"*.
   **E2E-G3-04 closed it 2026-08-30**: the two-identity case for the G-3 cluster lock, which found
   that the rule had shipped with no surface saying it — the editor now names the holder.
   Log: *„A rule that was complete and invisible"*. **One further rule came out of the two features
   meeting (2026-08-30):** a conversion leaves no row claiming a state its own numbers no longer
   support — FR-25.13f's ✕ writes quantity 0 and *skipped*, per-person floors the amount at 1, and the
   row was created and hidden in the same breath. The state falls back to *open* exactly when it has
   stopped being true, and only un-skipping is confirmed (E2E-M5-21). Log: *„A row kept saying it was
   skipped…"*. **FR-25.21 owes nothing further.**

**Parked, specified, do not start:** §3.26 calendar feed,
the North-Star Plan/During phases, FR-27.8's per-trip usage history, and FR-1.6's publish/fork
ownership model (each carries a revisit trigger in its stub).

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config`, picks `api.New` (+ `EnableOIDC` after discovery) / `api.NewSingleUser`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge algorithm (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/wiregen` — turns `internal/api/wire.go` into the client's TypeScript: the shapes (`types.ts`, ADR-026) and the paths (`routes.ts`, ADR-027). A second pure leaf beside `sync`: `go/ast` in, a string out, zero I/O. `cmd/wiregen` is the thin main that reads the contract and writes both files.
- `internal/store` — the only package that imports `database/sql`. SQLite repositories, change-log/conflict-log, the two sync partitions (`master.go` for tags/items/templates/trips/series/members, the trip partition for trip_items/travelers/containers/comments), the schema applied from `schema.sql` and fingerprinted in `PRAGMA user_version` (ADR-018).
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
8. **Everything resolves to an exact version verified by hash.** npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, GitHub Actions by full commit SHA with the tag as a readable comment. Never a bare tag. Dependabot updates the digests, so pinning costs no freshness — **except where a version is also a toolchain decision, and then it is made by hand.** Two such places — and the first of them has a tail:

   **A build image's version is also a toolchain version, and `scripts/toolchain-pins-gate.sh` holds them together** (added 2026-08-21 after a `node:24-alpine` → `26-alpine` bump merged green). `client/Dockerfile`'s node and the root `Dockerfile`'s golang build what actually ships, and each major is named a second and third time — in `mise.toml`, in every `node-version:` in `ci.yml`, in `go.mod`. A bump in one file alone passes **every** other check, because CI compiles through `setup-node`/`setup-go` and never through the image, so the published artifact would be built by a version nothing tested. The gate compares all of them (run by `make ci` and first in the `docker-build` job) and fails naming the files still to change. **Dependabot therefore keeps proposing majors on purpose**: the PR arrives by itself, the gate turns it red, and moving a major stays one deliberate change across the files that name it — remembered by the pipeline rather than by the maintainer.

   **A Go major is named in a fourth place: `golangci-lint`** (2026-08-28, #239). The linter refuses to load a config for a module targeting a newer Go than the one it was itself built with, so `go 1.27.0` in `go.mod` also means bumping the `version:` under `golangci-lint-action` and the `golangci-lint` pin in `mise.toml`. The gate holds *those two* to each other — a lint that differs between `make ci` and the pipeline is the same defect in a smaller costume — but it deliberately does **not** try to decide whether the pinned release is new enough for the go directive: that depends on the toolchain the release was built with, which no file in the repo records. golangci-lint's own `go.mod` stays a major behind on purpose and answers a different question, so reading it would mislead. Only running the binary says, and `make ci` does that one step later. The coupling lives in the gate's failure hints instead.

   **The Playwright image** in `scripts/playwright-image.sh` — sourced by `scripts/visual.sh` and `scripts/e2e.sh` — is bumped by hand, because Dependabot's docker ecosystem reads Dockerfiles rather than shell scripts, and because a bump there rewrites every visual baseline and should be a decision rather than a Tuesday (ADR-013). That exception is **checked rather than trusted**: both scripts compare the pinned version against `@playwright/test` in `client/package-lock.json` before starting the container and fail with the fix, because Dependabot bumps the lockfile and cannot see the image — the drift otherwise surfaces as Playwright's own "Executable doesn't exist", which names neither cause nor remedy.
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
- The `autoformat` CI job pushes `style:` commits back onto your branch. Pull before you push, or run `make fmt` yourself and keep it out of the way. **Its push then leaves the PR looking broken in a way nothing explains**: the run that push triggers is attributed to `github-actions[bot]` and comes back `action_required`, so `gh pr checks` reports *no checks at all* and the PR sits at `BLOCKED` — not red, not pending, simply blank. Approve it: `gh api -X POST repos/polandy/JIT-Pack/actions/runs/<run-id>/approve`, with the id from `gh run list --branch <branch>`. Nothing about the state says approval is what it wants (found twice on 2026-08-23, PR #168).
- **CI/CD layout** (`.github/`): `ci.yml` (go, go-lint, client, visual, e2e, autoformat, docker-build, dependabot-merge), `docker.yml` (ghcr.io on `v*` tags), `release.yml` (release-please). Dependabot merging is gated by the `dependabot-merge` job, which `needs` every check job. **`main` is protected** (configured 2026-08-08, now that the repo is public — the historical note that protection was blocked applied to the free-plan private repo). Required checks: `go`, `go-lint`, `client`, `docker-build`. Force-pushes and deletion are off, linear history is required (squash-merge produces it), admins are **not** exempt. Deliberately not set: `e2e` is not required — it is a four-leg shard matrix (four separate check names that would each need listing) and `dependabot-merge` already waits for it; `visual` is not required because it `needs: [client]`, and a skipped required check blocks a PR with a less useful message than the client failure itself. Review approvals are not required either: with a single maintainer that would block every merge and break Dependabot auto-merge. If a required check ever wedges, lift protection with `gh api -X DELETE repos/polandy/JIT-Pack/branches/main/protection`, merge, then re-apply.

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` uses pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`. History in `DEVIATIONS.md`.
