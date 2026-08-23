# ADR-025: One Implementation of the Portable Format — Delete the Server's, or Keep Two in Agreement

**Status:** Accepted (owner decision, 2026-08-23)
**Related:** ADR-008 (generation and import run on the client — this ADR enforces its second driver), ADR-015 (local backup file shape), ADR-017 (portable composition), ADR-024 (portable restores what it saved), FR-18.1–18.7, FR-19.5, NFR-4.3 (footprint), NFR-4.11 (serverless backup)

**Decision Drivers (in priority order):**

1. **One implementation of the import rules.** ADR-008 decided this in 2026 and its second driver is quoted verbatim: *"A rule that runs in both modes must not be written twice, in two languages, and kept in agreement by hand."* The question here is not whether to honour it but how, given that a CLI written in Go would be a second implementation by construction.
2. **An import must be visible.** Whatever imports has to produce state that reaches every device — which in this architecture means writing sync mutations, not rows.
3. **Local Mode is not negotiable** (ADR-009, FR-19.x): the rules must exist in TypeScript because Local Mode has no server to run them.
4. **Footprint** (NFR-4.3) — what a self-hoster has to install and run.
5. The stability of the public HTTP surface for anyone scripting against the instance.

---

## What made the choice necessary

The two implementations had already diverged, and nobody could see it because the Go one had no caller until a CLI was built on it (PR #176). Measured on the maintainer's live instance, with the real data:

- **The Go import writes no change-log entry.** `appendChangeLog` is called zero times from `internal/store/export.go`. Templates reach a client only through the sync feed — the client fetches them over no other route. The master feed of `:3000` held 459 entries (191 `items`, 191 `item_tags`, 29 `trips`, 19 `tags`) and **zero `templates`**, while the same database held one Ferien-Vorlage, 18 groups and 182 positions imported through `POST /api/v1/templates/import`. Rendered, the Templates screen said *"No templates yet"*. A push of the same row to `/api/v1/sync/master` appeared in the feed immediately.
- Beyond that: the Go path forced every imported trip to `planning` (FR-18.4/ADR-024 promise the file's status), reset `packed_count` to 0, and never wrote tags (FR-24.1), `from_inventory`, `trips.imported`, or the FR-27.4 refresh sections. It matched item names with a case-sensitive `=` where the client folds case and accepts a Levenshtein-2 near match, and it looked groups up without owner scope.

Roughly 510 lines of Go implementing about half the rules, several of them contradicting written requirements.

**The export half turned out to be the same story** (found while verifying the decision, 2026-08-23). The client serializes portable YAML itself everywhere it writes one — M17, M21 and the NFR-4.11 backup all call `client/src/domain/portable.ts`, and none of them call `GET /api/v1/trips/{id}/export.yaml`. So the server's exporter had no product caller either, and it had fallen behind the same way: it writes **none** of `status`, ordered `tags`, `icon` or `from_inventory`, and none of the FR-27.4 sections. That was invisible while the importer discarded those fields too. It stopped being invisible the moment the importer started honouring them: exporting a trip from the server and importing the file back silently dropped its lifecycle state, every tag and every mark — measured on the maintainer's own data, where a trip exported from `:3000` came back as `planning` with zero tag links, while a hand-written file carrying the same fields landed complete (mark on the item, `Wassersport` at position 0, `Neopren` at 1, trip `archived`, row linked to the inventory).

---

## Considered Options

### Option A — Delete the server's implementation of the format; the CLI runs the client's *(recommended, accepted)*

`Store.ImportTemplate`/`ImportTrip`, `Store.ExportTemplate`/`ExportTrip`, the two `POST /api/v1/*/import` endpoints, the two YAML export endpoints and the whole `internal/portable` package are removed. The import rules are extracted out of the Vue composable into `client/src/domain/portableImport.ts`, where ADR-008 always said they lived, behind an injected environment (the inventory view, the mutation factory, and a sink for each write). The app supplies a sink that applies optimistically and enqueues into the outbox; the CLI supplies one that collects mutations and pushes them to `/api/v1/sync/master` and `/api/v1/sync/trips/{id}`. Both run the same module.

**Pros**
- Literally one implementation of the rules, in the language Local Mode forces them into.
- The four divergences above disappear by deletion rather than by porting: the CLI writes mutations, so its import is in the feed and on every device by construction.
- ~510 lines of import and ~330 of export, plus their tests and the `internal/portable` package, are removed rather than doubled.
- `gopkg.in/yaml.v3` leaves the Go dependency set with the package that used it — the only Go dependency this change touches, and one fewer to keep pinned (NFR-4.3).
- The format ends up with one reader and one writer, so a file written by JIT-Pack is a file JIT-Pack reads back completely — which is the actual promise of FR-18.1, and the one the server's exporter was quietly breaking.
- The extraction is what ADR-008 and CLAUDE.md's invariant 4 already claim is true; today the rules sit in a 3600-line composable, which is why nothing could reuse them.
- The sink boundary is testable with a hand-written fake and no browser at all.

**Cons**
- **The CLI needs a Node runtime**, where a Go subcommand needed none. It is therefore not part of the server image and not available on a host that only runs the container.
- **Four documented endpoints are removed** — both imports and both YAML exports. A breaking change to a documented HTTP surface; the manual's own `curl` examples for them go with it. `GET /export/full` (JSON) and `GET /trips/{id}/export.csv` stay, since neither has a client-side equivalent.
- **A portable file can no longer be fetched from the server at all.** Getting one out means the app — or, later, an `export` subcommand of the same CLI, which this ADR does not build.
- The refactor touches ~450 lines of a composable that many screens depend on; behaviour preservation rests on the existing 733-line import spec.
- The server can no longer be handed a file at all, so there is no path that works with nothing but `curl` and a shell.

### Option B — Port the client's rules to Go, hold both to a shared conformance corpus

The Go importer gains tags, status, `from_inventory`, the FR-27.4 sections, the fuzzy matcher and the `(import)` suffix, and starts writing mutations so it lands in the feed. Drift is prevented by a shared fixture corpus — document plus inventory snapshot in, expected mutation list out — executed by both the TypeScript and the Go suites in CI.

**Pros**
- The CLI stays a single static Go binary; nothing new to install, and it can live in the server image.
- The HTTP import surface stays for third parties and for `curl`.
- Drift becomes a red build instead of a discovery, which is strictly better than today.

**Cons**
- Two implementations of the same rules, permanently, against the explicit decision of ADR-008. The corpus makes drift *visible*, not impossible: a rule nobody wrote a fixture for still diverges silently.
- Roughly 500 further lines of Go, and every future import rule is written twice — the cost ADR-008 called "the maintenance cost the product cannot carry".
- The corpus is itself a third artefact to keep honest, and its fixtures have to be written by the same person who would otherwise have written the rule once.

### Option C — Fix only the change-log gap and document the rest as a limitation

`ImportTemplate`/`ImportTrip` call `appendChangeLog`; the manual stops promising the status, tags and FR-27.4 sections that the endpoint never carried.

**Pros**
- Days of work become an afternoon; PR #176 merges as it stands.
- No breaking API change, no Node dependency.

**Cons**
- The product keeps two importers that produce *different results from the same file*, now honestly documented — which makes the CLI a second-class import that silently loses a trip's tags and lifecycle state.
- The divergence that motivated the whole question is written down rather than removed.

---

## Decision Matrix

| Driver | Weight | A (delete Go) | B (port + corpus) | C (document it) |
|---|---|---|---|---|
| One implementation | 5 | **5** — one, by construction | 2 — two, held equal by fixtures | 0 — two, divergent by design |
| Import is visible everywhere | 5 | **5** — mutations, always | 4 — after the port | 3 — after the change-log fix |
| Local Mode intact | 5 | **5** — untouched | 5 — untouched | 5 — untouched |
| Footprint (NFR-4.3) | 3 | 2 — Node for the CLI | **5** — one static binary | **5** — unchanged |
| Stable HTTP surface | 2 | 1 — two endpoints removed | **5** — kept | **5** — kept |
| **Total** | | **73** | 66 | 56 |

---

## Decision

The server does not know the portable format. Reading it lives once in `client/src/domain/portableImport.ts` (behind an injected environment — the app and the CLI differ only in the sink they hand it, and both produce sync mutations), writing it lives once in `client/src/domain/portable.ts`. The four YAML endpoints and `internal/portable` are gone. The two exports with no client-side equivalent — the full JSON dump and the per-trip CSV — stay server capabilities.

## Consequences

**Positive**
- A CLI import and an in-app restore produce the same rows from the same file — including tags, marks, trip status, `from_inventory` and the FR-27.4 refresh state, none of which the server's importer carried.
- An import lands in the change log, so it reaches every device. Previously a `curl` import was invisible in the app.
- Invariant 4 and ADR-008 become true of the code rather than aspirational: the rules are in `client/src/domain`, I/O-free, and unit-tested against a fake environment with no DOM.

**Negative / accepted costs**
- The CLI requires Node. It is a maintainer and operator tool, not a runtime component, and it is deliberately not in the server image.
- Two documented endpoints are removed. `docs/backup.md` loses its `curl` import examples; export examples stay.
- A host that can only run the container cannot import a file without also having Node somewhere. Accepted: the app itself is the supported import path (ADR-015 already said restoring goes through the app), and the CLI is the convenience beside it.

**Neutral**
- `internal/portable` is deleted with the two halves it served. The Go side of the codebase no longer knows the portable format exists.
- The CSV export (NFR-4.5) used the portable document as its data source and now has its own flat query, `Store.TripCSVRows`. That is the honest shape anyway: a spreadsheet dump and a round-trippable document are different artefacts and were only sharing a loader.

## Revisit Trigger

Reopen if the CLI has to run somewhere Node cannot — a distroless image, an appliance, a `go install` audience — or if a second non-browser consumer of the import rules appears (a server-side scheduled import, a migration job). Either makes Option B's conformance corpus the cheaper answer, and the corpus should then be built *before* the second implementation, not after it.
