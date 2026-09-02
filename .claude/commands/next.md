Identify the next task to work on:

1. Check what is already in flight first: `gh pr list` and `git worktree list`. The standing rule
   is **one open PR at a time**, so an open PR waiting on a merge go-ahead *is* the next task.
2. `CLAUDE.md`'s "Not built yet" is where the backlog lives — but every numbered item is closed,
   and the "Parked, specified, do not start" list is explicitly not a candidate list. So the real
   sources of open work, in order:
   - whatever the owner has just asked for
   - an open review worklist in the repo root (`*REVIEW*.md`, untracked by convention — a
     structural or quality list with its own recommended order)
   - `dev-docs/mvp-plan.md` Track H, the owner-driven dogfood deployment
   - a revisit trigger that has fired: the parked stubs each carry one, and so do several ADRs
3. Read ONLY the spec sections that item references, not the full documents.
4. Propose a concrete implementation plan with small, committable steps.

Keep the plan short — max 5 steps. Each step is one Conventional Commit with green tests, and the
final step updates whichever ledger the work belongs to (`CLAUDE.md`'s backlog line,
`dev-docs/e2e-tests.md`, the worklist item) and — **only if the work earned an entry** by that
file's own rule — appends to `dev-docs/implementation-log.md` and its index.
