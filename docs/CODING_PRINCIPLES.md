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

## 2. Tests

* **Naming as specification:** `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`, `TestPull_TombstonesIncludedUntilArchive`. A failing test name alone must tell you which rule broke (FR/NFR reference in the test body where applicable).
* **Table-driven tests** with named cases and `t.Run` subtests are the default for domain logic.
* **Test pyramid:**
  * *Unit* — merge algorithm, HLC, formula evaluation: pure functions, no I/O, exhaustive cases.
  * *Integration* — repositories and sync endpoints against a **real in-memory SQLite** (`:memory:`), never mocks of the database.
  * *End-to-end* — the walking-skeleton scenario: two simulated clients, concurrent offline edits, convergence per NFR-4.2a.
* **Coverage target:** ≥ 90 % for `internal/sync` and `internal/domain`, ≥ 75 % overall. Coverage is a smoke detector, not a goal — an uncovered branch in merge logic fails review regardless of the total.
* **Always run with `-race`.** CI and local: `go test -race ./...`.
* **Standard library testing only** (`testing`, `httptest`); a tiny diff helper (`go-cmp`) is allowed. No mocking frameworks — use hand-written fakes behind small interfaces.
* Tests are deterministic: fake clock injected (`Clock` interface), seeded randomness, no sleeps — synchronization via channels.

## 3. Architecture & Package Layout

```
cmd/jitpackd/          main: wiring only (flags/env, DI, serve) — no logic
internal/domain/       entities, state machine, formula eval — zero I/O deps
internal/sync/         HLC, merge algorithm, change-log semantics — zero I/O deps
internal/store/        SQLite repositories; the only package importing database/sql
internal/api/          HTTP handlers, WebSocket hub, JWT middleware
internal/notify/       push (VAPID/UnifiedPush) behind an interface
migrations/            embedded SQL migrations (//go:embed)
```

* **Dependency rule:** `api → domain/sync/store`, `store → domain`; `domain` and `sync` import nothing internal. This makes the two riskiest packages trivially unit-testable.
* **Accept interfaces, return structs.** Interfaces are declared where they are *consumed*, kept small (1–3 methods).
* **No global state.** Everything enters through constructors (`New…`); `main` is the only place that wires.
* Config exclusively via environment variables (PRD Section 2, declarative), parsed once at startup into a typed `Config` struct with validation.

## 4. Go Conventions (standard, enforced by tooling)

* `gofmt`/`goimports` mandatory; CI fails on diff.
* `golangci-lint` with: `govet`, `errcheck`, `staticcheck`, `revive`, `gocyclo` (limit 15), `ineffassign`, `misspell`.
* Naming: MixedCaps, no underscores; no stuttering (`sync.Merge`, not `sync.SyncMerge`); short receiver names; package names short, lowercase, singular, never `util`/`common`/`helpers`.
* `context.Context` is the first parameter of anything that does I/O or can block; contexts are never stored in structs.
* Errors: wrap with `fmt.Errorf("…: %w", err)`; sentinel errors as `var ErrTripNotFound = errors.New(…)` in the owning package; check with `errors.Is/As`. **No panics** outside `main` startup; no `_ =` swallowing except where the linter-annotated reason is stated.
* Zero values useful where cheap; constructors where invariants exist.
* `defer` for all cleanup, immediately after acquisition.
* Concurrency: share memory by communicating; every goroutine has a defined owner and shutdown path (context cancellation); no naked `go func()` in handlers.
* Logging: `log/slog`, structured key-value, levels `debug/info/warn/error`; never log secrets or JWTs; request-scoped logger with trip/user IDs via middleware.

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
