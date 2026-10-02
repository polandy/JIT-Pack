# Internal / Contributor Docs

Documentation for people **working on** JIT-Pack, not for people **running** it.
These files deliberately live outside `docs/` so they are **not** published to the
[user manual](https://polandy.github.io/JIT-Pack/) — read them here on GitHub.

Only the current version of each document is kept. Never write a "v2" of a doc —
replace the file; git holds its history.

**The large documents are directories, one file per section.** Each has a `README.md` that
names every file (`scripts/log-index-gate.mjs` holds that), so a change to §3.29 or to M28
reads one file, not the whole specification. Find a file by its number (`ls dev-docs/ui-spec/M28*`)
or by grep, then read only the part you need.

## The three documentation tiers

Which tier a document belongs to is decided by **who reads it**, never by what it is about:

| Tier | Audience | Content |
|---|---|---|
| `README.md` | someone deciding whether to care | A shop window: what, why, quickstart, links onward. No configuration reference, no deployment detail. |
| `docs/` | people **running** JIT-Pack | User manual, published via MkDocs Material (`mkdocs.yml`). Second person, task-oriented. |
| `dev-docs/` | people **developing** JIT-Pack | PRDs, ADRs, specs, log, prototype. Never published; indexed here. |

- **A user-visible change updates `docs/`, not just the spec.** A feature is complete when the person running the
  instance can find out how to use it. **Never document what is not implemented**: every claim in `docs/` is verified
  against the code, not the spec.
- A new page goes into `nav:` in `mkdocs.yml`; CI runs `mkdocs build --strict`. Never link to `dev-docs/` from
  `docs/` with a relative path — link to GitHub or restate.
- **A `dev-docs/` document wraps at 120 characters** (`scripts/spec-width-gate.mjs`). Exempt: table rows, ATX
  headings, fenced code, and the two append-only ledgers.
- A spec states the current product only: no revision notes, no dated provenance, no "amended"/"used to" narration —
  git holds the history. The two append-only ledgers and the ADRs are the exception, since recording history is their
  job.

## Product

- [`PRD_Base.md`](PRD_Base.md) — the original product definition: what JIT-Pack is for.
- [`prd-addendum/`](prd-addendum/README.md) — everything decided since, and
  **authoritative over `PRD_Base.md` wherever the two differ**. One file per section
  (`3.29-planner.md`), Part C's NFRs in `nfr.md`.
- [`Vision_NorthStar_v1.0.md`](Vision_NorthStar_v1.0.md) — the long-range picture the
  roadmap is cut from; deliberately beyond what is built.

## Design records

- [`adr/`](adr/) — Architecture Decision Records: options weighed, one chosen at a
  cost, with its consequences and a revisit trigger. One file per decision.
- [`CODING_PRINCIPLES.md`](CODING_PRINCIPLES.md) — **binding**; read before writing
  code.
- [`ci.md`](ci.md) — what runs locally and what on GitHub, reading a red run, the e2e legs,
  the workflows and `main`'s protection.
- [`agent-tooling.md`](agent-tooling.md) — which agent CLI reads which configuration: hooks,
  skills, MCP servers.
- [`implementation-log/`](implementation-log/README.md) — append-only history of what was
  built and why it was built that way. One file per week, each opening with the
  **index** of its own sections — grep the index lines, never read a file to find something.
  Its README holds **„What earns an entry"**: if the diff and the commit message tell the
  same story, no entry is owed. What belongs here is what the code cannot show — a rejected
  option, a wrong premise, a cost accepted on purpose, a trap with a price.
- [`design-foundation-plan.md`](design-foundation-plan.md) — the token-level PRs that
  came **before** the remaining screen rebuilds, with the measured gap between the
  prototype and the client that motivated each. All six are merged; it is
  kept for the measurements, not as a plan.
- [`mvp-plan.md`](mvp-plan.md) — the tracks that stand between today and the family
  packing a real vacation with it, and which of them may run in parallel. Delete it
  once the vacation has happened.

## Specifications

- [`Sync_API_Spec_v1.3.md`](Sync_API_Spec_v1.3.md) — the wire protocol: pull/push
  envelopes, HLC format, the merge algorithm, WebSocket events, RPC endpoints.
- [`ui-spec/`](ui-spec/README.md) — screens M1–M30, one file each (`M04-packing-list.md`),
  and the global patterns G-1–G-20 in `global-patterns.md`.
- [`Navigation_Concept_v1.0.md`](Navigation_Concept_v1.0.md) — how the screens hang
  together.
- [`ui-test-spec/`](ui-test-spec/README.md) — the Playwright scope: per-screen cases
  (one file per screen), cross-screen flows, and the FR/NFR traceability matrix.
- [`e2e-ledger/`](e2e-ledger/README.md) — which of those cases are actually implemented,
  and where. The spec says what *should* be covered; the ledger says what *is*. Its
  `status.md` is the table; the dated narratives behind each unit are one file per month,
  each opening with its own index.

The database schema has no spec file on purpose: `internal/store/schema.sql` is its
single source of truth and is never duplicated into prose. While the project is pre-1.0
it is one always-current file with no migration chain behind it — see
[ADR-018](adr/ADR-018_No_DDL_Migrations_In_Development.md) for why, and for when
migrations come back.

## Concept prototype

- [`UI_Concept_Prototype.html`](UI_Concept_Prototype.html) — the clickable mockup every
  §3.25/§3.27 decision was tested against. `node dev-docs/UI_Concept_Prototype.verify.mjs`
  drives it headless and must stay green.
- [`UI_Concept_Overview.html`](UI_Concept_Overview.html) — the annotated walkthrough of
  that prototype, with screenshots regenerated by
  `node dev-docs/assets/shoot-screens.mjs`.

**Variant rounds.** Where a decision came down to how something *looks*, it was rendered
side by side in the prototype's own stylesheet and decided on the pixels. Once decided, a
round's page and its generator were deleted: the decision lives in the spec section that
names the round, and the pages stay readable at commit `6b148419`
(`git show 6b148419:dev-docs/UI_Concept_<Name>_variants.html`). A new round follows the same
path — rendered while open, removed in the PR that settles it.

**Concept notes** — the reasoning a feature was decided from; the FR, the screen and the ADR they
name are authoritative wherever they differ: [`api-tokens-concept.md`](api-tokens-concept.md)
(FR-23.7), [`trip-notes-concept.md`](trip-notes-concept.md) (FR-7.9),
[`trip-note-threads-concept.md`](trip-note-threads-concept.md) (FR-7.13),
[`excursions-concept.md`](excursions-concept.md) (§3.31) and
[`planner-concept.md`](planner-concept.md) (§3.29).
