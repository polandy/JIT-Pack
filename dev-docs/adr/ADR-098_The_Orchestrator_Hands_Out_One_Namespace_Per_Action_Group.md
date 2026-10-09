# ADR-098: The orchestrator hands out one namespace per action group — namespaces vs. a flat facade

**Status:** Accepted
**Related:** ARCH-13, ADR-095 (the write funnel), ADR-096 (the layers), `client/src/composables/useSyncOrchestrator.ts`,
`client/src/app/actions/`, `client/src/composables/shared/useOrchestrator.ts`

**Decision Drivers (in priority order):**
1. A call site says which use case it reaches: reading `orchestrator.x(…)` leads to the file that decides `x`.
2. Two groups cannot answer to the same name, and nothing has to be remembered for that to hold.
3. The facade decides nothing; a rule it still held is in a group of its own.
4. The cost of the change — the consumers, the specs and their stubs — and of rebasing open branches over it.

---

## Context

`useSyncOrchestrator` built ~20 action groups and spread them into one object of ~220 members, 63 screens and
composables and ~70 specs read it. Nothing stopped two groups from exporting the same name: the spread let the later
one win without a word. The facade also still held rules of its own — the claims (FR-5.2/5.7), FR-5.8's prune, trip
membership and the portable-import environment — although its header said it decided nothing.

The claims, the membership, the portable import and the prune moved into `app/actions/` (`claims.ts`,
`membership.ts`, `portable.ts`, `removalPrune.ts`) under any option. What stayed open was the facade's shape.

## Considered Options

### Option A — one namespace per group *(accepted)*

The facade returns the glue it owns flat (`syncStatus`, `connect`, the drains, `today`, `now`, `moduleHost`) and every
action group whole under a key named after its file: `orchestrator.packing.packIncrement`,
`orchestrator.claims.takeOverClaim`, `orchestrator.comments.addComment`. The socket-fed reads sit under `presence`.

**Pros**
- The call site names its group; the trace from a tap to its rule is one file.
- A collision is a compile error: two groups under different keys cannot clash, and two keys in one object literal
  are TS1117.
- A spec stub fakes one group and reads like it.

**Cons**
- ~1,300 call sites in code and specs and ~40 stubs rewritten in one change; open branches rebase over it.
- A group's internal helpers (`groupRefresh.applyRefreshPlan`) are reachable, since a group is handed out whole.

### Option B — flat, held by a disjoint-keys guard

Keep `orchestrator.packIncrement`; spread every group through one merge that throws on a duplicate key, with a spec.

**Pros**
- Small diff, nothing to rebase. Go-to-definition on a spread member already lands in the group.

**Cons**
- The call site still does not say where a member comes from; the guard is a runtime check a spec has to reach.

### Option C — flat, consumers typed by `Pick<Orchestrator, …>`

**Pros**
- A helper or stub declares only what it uses.

**Cons**
- Components still receive the whole facade through `useOrchestrator()`; the trace is unchanged.

---

## Decision Matrix

| Driver | Weight | A — namespaces | B — flat + guard | C — flat + `Pick` |
|---|---|---|---|---|
| Call site names its use case | 3 | 3 — the key is the file | 1 — unchanged | 1 — unchanged |
| Collisions impossible | 2 | 3 — by construction | 2 — a runtime throw | 1 — not addressed |
| Facade decides nothing | 2 | 3 — groups extracted | 3 — same | 3 — same |
| Cost of the change | 1 | 1 — ~1,300 sites | 3 — one file | 2 — helpers only |
| **Total** | | **22** | **16** | **12** |

---

## Decision

`useSyncOrchestrator` returns its own glue flat and each action group whole, under a key named after the group's
file. Chosen by the owner over B, which was the recommendation on cost.

## Consequences

**Positive**
- The facade is a list of groups; adding one is one line and cannot shadow another.
- The extracted groups are seam-testable without the orchestrator, like the rest of `app/actions/`.

**Negative / accepted costs**
- Every consumer and spec was rewritten; branches open at the time rebase over it.
- The longer paths wrapped lines in six files already over the size limit; their budgets in
  `scripts/file-size-budget.txt` were raised by exactly those lines, the ratchet's one exception, granted by the owner.
- A group's helpers that only another group calls are reachable from a screen.

**Neutral**
- The member names did not change; only their path did.

## Revisit Trigger

A screen that calls a group's internal helper (one no other screen uses and that the group calls itself) — then the
group's return splits into what it offers and what it keeps.
