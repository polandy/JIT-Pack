# CODING_PRINCIPLES.md — „JIT-Pack"

**Status:** Binding for all code in this project once agreed.
**Precedence:** These principles > convenience. Deviations require a written note in the PR/commit.

---

## 1. Non-Negotiables (agreed baseline)

1. **Test-first:** Every behavior starts as a failing test that reads as its specification. Implementation follows until green, then refactor. No production code without a driving test.
2. **Readability over cleverness:** Code is written for the next reader. If a construct needs explanation, rewrite it before commenting it.
3. **English everywhere:** Identifiers, tests, commit messages, docs.
4. **Comments only when necessary:** A comment justifies *why*, never *what*. Godoc comments on exported symbols are the exception and are mandatory (Go convention). No commented-out code.
5. **Clear responsibilities:** Every package has one reason to exist and one reason to change. Dependencies point inward (see §3); no package reaches "sideways" into a sibling's internals.
6. **No magic strings or numbers.** A literal that is *compared against*, *switched on*, or repeated across files is named once as a constant and referenced everywhere after — in Go and in TypeScript alike. The full rule and what counts as an exception is §4a.

## 2. Tests

* **Naming as specification:** `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`, `TestPull_TombstonesIncludedUntilArchive`. A failing test name alone must tell you which rule broke (FR/NFR reference in the test body where applicable).
* **Table-driven tests** with named cases and `t.Run` subtests are the default for domain logic.
* **Test pyramid:**
  * *Unit* — merge algorithm, HLC, instantiation/dedup: pure functions, no I/O, exhaustive cases.
  * *Integration* — repositories and sync endpoints against a **real in-memory SQLite** (`:memory:`), never mocks of the database.
  * *End-to-end* — the walking-skeleton scenario: two simulated clients, concurrent offline edits, convergence per NFR-4.2a.
* **Coverage target:** ≥ 90 % for `internal/sync` and `internal/domain`, ≥ 75 % overall. Coverage is a smoke detector, not a goal — an uncovered branch in merge logic fails review regardless of the total.
* **Always run with `-race`.** CI and local: `go test -race ./...`.
* **Standard library testing only** (`testing`, `httptest`); a tiny diff helper (`go-cmp`) is allowed. No mocking frameworks — use hand-written fakes behind small interfaces.
* Tests are deterministic: fake clock injected (`Clock` interface), seeded randomness, no sleeps — synchronization via channels.

## 3. Architecture & Package Layout

```
cmd/jitpackd/                main: wiring only (flags/env, DI, serve) — no logic
internal/sync/               HLC, merge algorithm, change-log semantics — zero I/O deps
internal/portable/           YAML wire types for export/import — zero I/O deps
internal/store/              SQLite repositories; the only package importing database/sql
internal/store/schema.sql    the whole schema, always current (//go:embed, ADR-018)
internal/api/                HTTP handlers, WebSocket hub, auth middleware, push
client/src/domain/           entities, state machine, generation/analytics — pure, no I/O
client/src/sync/             the client's half of the wire: HLC, and the durable outbox's IndexedDB store
client/src/local/            Local Mode's own storage: the row store, backup, export reminder
```

* **Dependency rule:** `api → store, sync, portable`; `store → sync, portable`; **`sync` and `portable` import nothing internal, ever.** This makes the riskiest packages trivially unit-testable.
* `client/src/sync/` is **not** a pure leaf the way Go's `internal/sync` is — the name is shared, the rule is not. It holds what the client needs to speak the sync protocol, and since B2 that includes an IndexedDB adapter for the outbox queue. It lives there rather than in `client/src/local/` because that directory means *Local Mode*, and the outbox exists only in the mode that has a server. Purity is preserved where it is claimed: `client/src/domain/` imports nothing from `sync/`.
* The pure domain rules deliberately live in `client/src/domain/` rather than an `internal/domain/`: Local Mode runs with no backend, so generation, dependency resolution, analytics and review have to execute on the client to exist in that mode at all. Push lives in `internal/api/push.go` rather than a separate `internal/notify/` — it is small enough that the package boundary would buy nothing.
* **Accept interfaces, return structs.** Interfaces are declared where they are *consumed*, kept small (1–3 methods).
* **Testability is an architectural acceptance criterion, not a property tests add later.** Where a new behaviour lands is decided by where its driving test can live: decision logic goes into pure functions a table-driven unit test can state exhaustively; I/O stays at the edges (handlers and repositories thin, calling into the logic rather than containing it); every external effect enters through a small consumer-side interface with a hand-written fake behind it; time, randomness and completion are injected seams, never ambient. The test pyramid in §2 is the consequence: if a rule can only be asserted by standing up HTTP + database + goroutines, that is not a call for a bigger integration test — the cut is wrong, and the rule moves out until a unit test can reach it. (`internal/sync` and `internal/portable` are the proof: zero-dependency leaves precisely so their risk is trivially testable.)
* **No global state.** Everything enters through constructors (`New…`); `main` is the only place that wires.
* Config exclusively via environment variables (PRD Section 2, declarative), parsed once at startup into a typed `Config` struct with validation.

## 4. Go Conventions (standard, enforced by tooling)

* `gofmt`/`goimports` mandatory; CI fails on diff.
* `golangci-lint` with: `govet`, `errcheck`, `staticcheck`, `ineffassign`, `unused`, and `goconst` (§4a).
* Naming: MixedCaps, no underscores; no stuttering (`sync.Merge`, not `sync.SyncMerge`); short receiver names; package names short, lowercase, singular, never `util`/`common`/`helpers`.
* `context.Context` is the first parameter of anything that does I/O or can block; contexts are never stored in structs.
* Errors: wrap with `fmt.Errorf("…: %w", err)`; sentinel errors as `var ErrTripNotFound = errors.New(…)` in the owning package; check with `errors.Is/As`. **No panics** outside `main` startup; no `_ =` swallowing except where the linter-annotated reason is stated.
* Zero values useful where cheap; constructors where invariants exist.
* `defer` for all cleanup, immediately after acquisition.
* Concurrency: share memory by communicating; every goroutine has a defined owner and shutdown path (context cancellation); no naked `go func()` in handlers.
* Logging: `log/slog`, structured key-value, levels `debug/info/warn/error`; never log secrets or JWTs; request-scoped logger with trip/user IDs via middleware.

## 4a. Named Constants — no magic strings or numbers

The point is not tidiness. A literal that several places must agree on is a
contract with no compiler behind it: mistype `"trip_intems"` in one of five
switches and nothing fails to build — the case is simply never taken, and the
symptom surfaces far away as a row that quietly never syncs.

**A literal must be named when it is:**

* **compared against or switched on** — table names, statuses, modes, kinds,
  event types, storage keys, route names, CSS class names read back in a test;
* **repeated across files**, even twice;
* **a threshold or limit with a reason** — `150 * 1024` is a magic number,
  `MaxItemImageBytes` carries the reason (FR-22, invariant 6) and the ADR
  pointer with it;
* **an index or offset with meaning** — `position == 0` is the *primary* tag
  (FR-24.2), so it is `PrimaryTagPosition`.

**A literal may stay a literal when it is:**

* used exactly once, at the only place that can care — a struct-tag name, a
  SQL fragment inside the one query that owns it;
* self-evident arithmetic identity (`0`, `1`, `-1` as counters or steps),
  where naming it would say less than the expression already does;
* a test's expected value: a test states its expectation *literally* on
  purpose, so that a wrong constant in production code is visible as a
  mismatch rather than hidden behind the same symbol on both sides;
* a **serialization key** — a JSON or YAML field name in a payload literal, a
  struct tag, or a claim lookup. It *is* the wire contract rather than a
  comparison against one: it is fixed by `Sync_API_Spec_v1.3.md` (or by the
  OIDC spec) and verified against that document, and a Go constant sitting
  between the code and the shape it implements hides the very thing a reader
  came to check. A key that is *read back out* of a decoded map to branch on
  is a comparison again, and is named.

**Where the constant lives:** with the concept it names, in the package that
owns it, exported only if another package legitimately compares against it —
`store.TableTripItems` is exported because `internal/api` switches on the same
names. Never a `constants.go` grab-bag: that is a package with no reason to
exist (§1.5).

**Enforcement:** `goconst` in `golangci-lint` fails a Go string literal
repeated three times or more, with the serialization-key carve-out configured
explicitly in `.golangci.yml`. That is a floor, not the rule — it counts
repetitions and cannot see the single-occurrence `switch` the rule above
still names. On the client there is no equivalent worth enabling
(`no-magic-numbers` fires on one-off view geometry far more often than on a
threshold that carries a reason), so TypeScript is held to §4a by review —
except for the one class that *is* gated: colours, type and shape, which
`scripts/design-tokens-gate.mjs` rejects as raw values (invariant 9/9b).

*Paid for on 2026-08-18 (FR-27.4):* `internal/store` switched on bare table
names in five places across two packages. Adding a table meant finding all
five by grep, and the sixth place that should have had a case simply did not.
Naming them turned "did I catch every switch?" into a compile-time question.

## 5. Dependencies (footprint-guarded)

* **Standard library first.** Every new module requires a one-line justification in `go.mod` comment form.
* Approved starting set: `modernc.org/sqlite` (pure Go, keeps the static binary CGO-free), `github.com/golang-jwt/jwt/v5`, `github.com/coder/websocket`, `github.com/google/go-cmp` (tests only). Router: `net/http` `ServeMux` (Go ≥ 1.22 patterns suffice).
* No ORM. SQL lives as named constants next to the repository that uses it.

## 6. Workflow

* **Cycle:** red (test as spec) → green (simplest passing code) → refactor (with tests green). Commits may follow this rhythm; each commit compiles and passes tests.
* Commit messages: imperative mood, ≤ 72-char subject, body explains *why*; reference spec IDs (`FR-5.4`, `NFR-4.2a`) when implementing them.
* Spec traceability: domain rules carry their FR/NFR ID in the godoc of the implementing function and in the test name — greppable in both directions.
* Definition of Done per feature: tests green with `-race`, lint clean, coverage thresholds met, godoc on exported symbols, no TODO without an issue reference.

---

*Amendments to this document are themselves test-first: propose, discuss, commit.*
