Identify the next task to work on:

1. Check what is already in flight first: `gh pr list` and `git worktree list`. The standing rule
   is **one open PR at a time**, so an open PR waiting on a merge go-ahead *is* the next task.
2. `dev-docs/backlog.md` holds the parked work and standing decisions; its parked sections are
   explicitly not a candidate list. So the real sources of open work, in order:
   - whatever the owner has just asked for
   - `TODO.md` in the repo root (the owner's list, **HIGH** first)
   - an open review worklist in the repo root (`*REVIEW*.md`, untracked by convention — a
     structural or quality list with its own recommended order)
   - a revisit trigger that has fired: the parked stubs each carry one, and so do several ADRs
3. Read ONLY the spec sections that item references, not the full documents.
4. Propose a concrete implementation plan with small, committable steps.

Keep the plan short — max 5 steps. Each step is one Conventional Commit with green tests, and the
final step updates whichever ledger the work belongs to (`dev-docs/backlog.md`,
`dev-docs/e2e-ledger/`, the worklist item) and — **only if the work earned an entry** by that
file's own rule — appends to the current week's file in `dev-docs/implementation-log/` and its index.
