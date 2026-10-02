# ADR-091: The e2e legs — each browser sharded on its own axis, WebKit's subset on a pull request vs. both engines in full on every run

**Status:** Accepted
**Related:** ADR-079 (a module-only diff on one leg), ADR-013 (visual baselines), ADR-045, FR-19.8,
`scripts/e2e-matrix.mjs`, `scripts/diff-scope.mjs`, `client/playwright.config.ts`

**Decision Drivers (in priority order):**
1. **No regression slips through unseen.** Whatever a pull request skips, a push to `main` still runs.
2. **A pull request's e2e verdict sets the pace of the dev loop.** `/pr-review` waits for it, and it took ≈14 min
   (run 36904819086, 2026-10-01) while every required check was done inside 3. ADR-079's one-leg selection never
   fired in the 25 pull-request runs before this decision: a feature reaches the kernel (`schema.sql`, `wire.go`,
   `types.ts`, the table registry, shared components) almost by definition.
3. **The 20 runners a public repository may hold at once.** A run that takes more of them queues the next one.
4. **Cheap to keep correct.** A selection that silently rots is skipped coverage nobody sees.

---

## Considered Options

### Option A — each browser sharded on its own axis; on a pull request WebKit runs `@smoke|@webkit` *(recommended, accepted)*

`scripts/e2e-matrix.mjs` turns the event and `diff-scope.mjs`'s module into the e2e matrix, emitted by the
`changes` job. A pull request runs Chromium in full over six legs and WebKit on one leg, over the `@smoke` set and
the cases tagged `@webkit` — those whose subject is an engine difference the suite has met: scroll restoration,
a route replace leaving both pages in the outlet, fractional layout boxes, an overlay that keeps swallowing taps,
IndexedDB's row order, `:has()`, a second mount beside the first. A push to `main` runs every case in both
engines, Chromium over four legs and WebKit over six. A module-only pull request keeps ADR-079's single leg. Every
leg names its `--project`, so the visual baselines — 36 tests the `visual` job owns — no longer ride along.

**Pros**
- A pull request does about half the test-seconds: Chromium's 555 cases plus 17 WebKit ones, against 1146.
- Balanced legs: under a count-split over both engines, Playwright handed the first half of the list (Chromium)
  to legs 1–5 and the second half (WebKit) to legs 6–10, so the slowest leg was always a WebKit one at
  ≈740–850 s while the Chromium legs had idled since ≈550.
- The bound is no longer an e2e leg but `e2e-server` (≈490 s), which a further Chromium leg cannot move.
- Fewer runners: seven legs on a pull request instead of ten.

**Cons**
- **A WebKit-only regression in a case without `@webkit` is found on `main`, one merge late.** The fix is then a
  follow-up PR, not a red check on the PR that caused it. `e2e` is not a required check in either option, so the
  merge gate itself does not change.
- `@webkit` is a judgement: a case gets it when it has met an engine difference, and a new engine difference is
  found by `main`'s full run first.
- Two leg counts to keep measured instead of one.

### Option B — keep both engines in full on every pull request, only balance the legs

Shard each browser on its own axis, but run WebKit in full everywhere.

**Pros**
- No coverage moves from the pull request to `main`.

**Cons**
- Bounded by WebKit's ≈3500 test-seconds: ≈11 min with the same ten legs, against ≈14. Driver 2 barely moves.

### Option C — one leg per browser

Tried first, 2026-09-04, and measured worse: the Chromium leg idles while one WebKit leg carries a whole engine.
Listed so it is not tried a third time.

### Option D — narrow ADR-079's selection further (an import graph, or more modules)

Make more diffs eligible for a one-leg run, by mapping source files to the e2e cases that reach them, or by
splitting the packing code into further modules.

**Pros**
- When it fires, it is the largest saving there is.

**Cons**
- An e2e case imports no app code, so the graph would be hand-kept — the rot driver 4 forbids.
- A feature PR edits the kernel, and a module split does not change that; ADR-079's rule fired zero times in 25
  runs, including the planner's own features.

---

## Decision Matrix

| Driver | Weight | A: per-browser axes, WebKit subset on PRs | B: per-browser axes, both in full | C: a leg per browser | D: finer selection |
|---|---|---|---|---|---|
| No regression unseen | 4 | 2 — WebKit-only on `main` | 3 | 3 | 1 — a hand-kept map misses |
| PR verdict pace | 3 | 3 — bounded by `e2e-server` | 2 — ≈11 min | 0 — worse | 1 — rarely fires |
| Runners held | 2 | 3 — seven legs | 2 — ten | 3 | 3 |
| Cheap to keep correct | 1 | 2 — two counts, one tag | 2 | 3 | 0 |
| **Total** | | **25** | **24** | **21** | **10** |

B is one point behind on the drivers' own weights, and the point is the owner's call: the pull request's wait was
the complaint, and `main`'s full run is the stated safety net.

---

## Decision

`scripts/e2e-matrix.mjs` decides the e2e legs. A pull request runs Chromium in full over six legs and WebKit on
`@smoke|@webkit` on one. A push to `main` runs both engines in full, each sharded on its own axis. A module-only pull
request keeps ADR-079's single leg over both engines.

## Consequences

**Positive**
- A pull request's e2e verdict is expected within ≈8 min, bounded by `e2e-server`, down from ≈14.
- The visual baselines run once per run, in `visual`, not a second time inside an e2e leg.

**Negative / accepted costs**
- A WebKit-only regression outside `@smoke|@webkit` turns `main` red after the merge, not the pull request before
  it. When that happens, the case that caught it earns `@webkit`.
- `PR_CHROMIUM_LEGS` and `MAIN_LEGS` go stale silently as the suite grows, like the single count before them.

**Neutral**
- `e2e`'s job names change from `e2e (N)` to `e2e (chromium-N)`, `e2e (webkit-N)` and `e2e (webkit-subset)`;
  none is a required check.

## Revisit Trigger

`main` turns red on a WebKit-only failure that the pull request's subset could not see more than twice in a month —
then WebKit's pull-request share is too small. Or `e2e-server` is no longer the slowest job of a pull request's
run — then the Chromium leg count is the bound again and wants re-measuring.
