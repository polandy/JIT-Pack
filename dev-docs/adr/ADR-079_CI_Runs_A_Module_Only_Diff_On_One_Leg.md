# ADR-079: CI runs a module-only diff on one leg — tag selection with a smoke set vs. full run vs. import-graph impact

**Status:** Accepted
**Related:** ADR-066 (feature modules), ADR-078 (the planner), ADR-013 (visual baselines), FR-29.9, FR-30.3,
`dev-docs/planner-concept.md` §5a (decision #12), `scripts/diff-scope.mjs`, `scripts/module-boundary-gate.mjs`

**Decision Drivers (in priority order):**
1. **No regression slips through unseen.** Whatever is skipped on a pull request must be something the diff
   cannot have broken, or something `push` to `main` still runs.
2. **Fast feedback on a feature module's own work.** A diff inside `client/src/planner/` ran the full ten-leg e2e
   matrix (~13 min wall-clock, 10 of the 20 runners a public repo may hold at once) and the two backend jobs.
3. **Cheap to keep correct.** A selection rule that silently rots is worse than none: it turns into skipped
   coverage no one notices.
4. **No new dependency** (NFR-4.3).

---

## Considered Options

### Option A — module-only diffs select by tag, and a smoke set rides along *(recommended, accepted)*

The CI `changes` job classifies the diff (`scripts/diff-scope.mjs`). When every app-input path lies inside one
module — `client/src/<m>/`, `client/e2e/<m>/`, `internal/{store,api}/<m>*.go`, plus the non-app paths (docs,
specs, unit tests) — its `module` output names it. `e2e` then runs one leg with `--grep "@<m>|@smoke"`, and
`e2e-single`/`e2e-server` run `--grep @<m>`. The tag is held by `module-boundary-gate.mjs`: every case under
`client/e2e/<m>/` carries it, and so does every case elsewhere that works the module's surface (its trip view,
its switcher entry, its dashboard card — `MODULE_E2E_MARKERS` in `scripts/modules.mjs`). Anything else in the
diff — the schema, a migration, `wire.go`, `App.vue`, the router, `lib/`, `sync/`, the i18n catalogues, the
lockfile, a workflow — makes it a full run.

**Pros**
- The boundary gate already proves a module cannot be imported from outside, so a module-only diff cannot break
  packing code at compile time; the selection rests on a fact, not a guess.
- One runner instead of ten; the planner's leg is 32 tests, shopping's 92, against 1084.
- The tag rule is gated, so a new module case or a new kernel case that opens the module's view cannot fall out of
  the selection unnoticed.

**Cons**
- Run-time coupling is not visible to any gate: the planner shares the orchestrator, IndexedDB and the sync feed
  with packing. The `@smoke` set (boot, mode choice, the tab bar, the rail, packing a row, the quick-add, a reload
  into M4) is the bet that such a fault is loud; a subtler one waits for the full run on `push` to `main`.
- The markers are a list of patterns. A kernel case reaching a module surface some other way (a raw URL, a new
  helper in `client/e2e/helpers/`) is not caught until the list learns it.

### Option B — a full run on every diff (the status quo)

**Pros**
- Nothing to keep correct; nothing is ever skipped.

**Cons**
- A module's own work pays the whole matrix. It is the loop the planner was split out to make fast (concept §5a),
  and it holds half the concurrent runners while a second PR waits.

### Option C — test impact from an import graph

Map each e2e case to the source files it transitively imports or renders, and run the cases whose set the diff
touches.

**Pros**
- Finer than a module: a diff in one planner sheet would run only the cases that open it.

**Cons**
- An e2e case imports no source: it drives a built bundle through a browser. The graph would have to be
  recorded per case from coverage data, kept current on every change and trusted — a system of its own, for a
  refinement Option A's module granularity already makes small.
- A new tool or a hand-built recorder (NFR-4.3), and the same run-time blind spot as Option A.

---

## Decision Matrix

| Driver | Weight | A — tag + smoke | B — full run | C — import graph |
|---|---|---|---|---|
| No unseen regression | 4 | 4 — compile-time sound, run-time by smoke and `main` | 5 — nothing skipped | 3 — same blind spot, plus a recorder that can be stale |
| Fast module feedback | 3 | 5 — one leg | 1 — ten legs | 5 — one leg or less |
| Cheap to keep correct | 2 | 4 — one gate, one list | 5 — nothing to keep | 1 — a recorded graph per case |
| No new dependency | 1 | 5 | 5 | 2 |
| **Total** | | **44** | 38 | 31 |

---

## Decision

`changes` emits `module` alongside `app_untouched`, on a pull request only — a push to `main` always runs in full,
which is what makes it the backstop the accepted cost below leans on. On a module-only diff `e2e` runs one leg,
`--grep "@<module>|@smoke"`; `e2e-single` and `e2e-server` run `--grep @<module> --pass-with-no-tests`.
`visual` runs every baseline regardless: it is one job that finishes inside the module's e2e leg, so narrowing
it saves no wall-clock. `go`, `go-lint`, `client`, `format` and `docker-build` are unchanged. Locally,
`make e2e-module M=<module>` runs the same selection.

## Consequences

**Positive**
- A planner or shopping PR gets its e2e verdict from one leg and a few minutes, and leaves the other runners free.
- The module tags make a module's whole e2e footprint one `--grep` away, locally as in CI.

**Negative / accepted costs**
- A run-time fault that the smoke set does not trip reaches `main` and is caught by its full run, one merge late.
- Two lists to keep: the module's paths in `diff-scope.mjs` and the surface markers in `modules.mjs`. Both err
  towards running more — an unlisted path is a full run — except a marker that is missing, which the gate cannot
  know about.
- Every module case title carries one more tag.

**Neutral**
- Shopping gets the rule at the same time as the planner, since the rule is per module rather than per feature.

## Revisit Trigger

A regression found by `main`'s full run after a PR that ran as module-only, whose cause the smoke set could have
seen — then the smoke set grows, or the module's paths shrink. Or: the i18n catalogues become the usual reason a
module diff is a full run, which argues for a catalogue per module.

## Amendment 1 — a catalogue per module

The revisit trigger's second half fired: every planner PR since the day plan changed screen copy, and the copy lived
in the kernel's `i18n/messages/`, so none of them ran as module-only. Each module now carries its own catalogue,
`client/src/<m>/i18n/en.ts` and `de.ts`, inside the paths `diff-scope.mjs` already counts as the module's. `t()`
reads the parts as one: `i18n/index.ts` names each module's catalogue, the one reach into a module the boundary gate
admits besides the composition root, and looks a key up part by part, so the English fallback stays per key.

A key belongs to a module's catalogue when only that module reads it. A key the kernel reads too — a trip view's
name in the switcher, a count M1 shows — stays in the kernel's catalogue, even when it carries the module's prefix.
Two checks hold the split: `module-boundary-gate.mjs` refuses kernel code naming a module catalogue's key, and the
catalogue-integrity spec refuses a key defined in two parts, which the merged lookup would otherwise resolve
silently by order. German parity, placeholders and plural forms are checked per part.

Accepted cost: a new string has to be placed by who reads it, and a key that later gains a kernel reader moves
across — the gate names it when that happens.
