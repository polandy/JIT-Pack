# ADR-040: Formatting is checked, not applied — the bot stops pushing to the branch

**Status:** Accepted
**Related:** `.github/workflows/ci.yml` (`format` job), `Makefile` (`fmt-check`, `client-fmt`), CLAUDE.md "Don'ts &
pointers"

**Decision Drivers (in priority order):**

1. **A pipeline state must be readable.** Whatever CI reports, the author has to be able to tell what
   it wants from them. A state that says nothing at all is worse than a red one.
2. **Formatting must stay enforced.** Whichever way this goes, an unformatted tree must not reach
   `main` — the current arrangement is the only thing enforcing it, since neither the `go` nor the
   `client` job checks formatting.
3. **The local gate is the fast gate.** `make ci` exists so a failure is found before the push;
   anything CI can fail on that `make ci` cannot is a round trip through GitHub.
4. **Cost is a first-class concern** (NFR-4.3) — including the cost of a maintainer's attention.

---

## The problem, stated as what it actually looked like

The `autoformat` job ran `gofmt -w` and `prettier --write` and pushed a `style:` commit back onto the
branch, so formatting was never a red build. The cost is not the commit; it is what the commit does
to the pull request.

A push by `GITHUB_TOKEN` is attributed to `github-actions[bot]`, and a run triggered by a bot push
arrives in the `action_required` state — waiting for a human to approve it. The visible result is
that `gh pr checks` reports **no checks at all** and the PR sits at `BLOCKED`: not red, not pending,
blank. Nothing on the screen says that the fix is `gh api -X POST .../actions/runs/<id>/approve`, and
nothing connects the blank state to the formatting commit that caused it.

This was diagnosed twice on the same day (2026-08-23, PR #168) and has been carried since as a
paragraph of standing instructions in CLAUDE.md. That is the tell: **a workaround documented in the
orientation document is a defect that was priced and then paid every time**, and every session pays
it again, because the state is unreadable on its own terms.

## Considered Options

### A. Keep the auto-fix, make the bot's push trigger a normal run

Push with a fine-grained PAT instead of `GITHUB_TOKEN`; a run triggered by a real account is not
`action_required`.

- **Pros:** Formatting stays a non-event. No new failure mode for the author. No change to what the
  pipeline enforces.
- **Cons:** Needs a secret that a maintainer must create, scope and rotate, and it is a token that
  can push to any branch — the widest credential in the repository, held to spare people a `make fmt`.
  It also does not remove the surprise commit, which still lands mid-review and still means a `git
  pull` before the next push or a rejected push. And it cannot be set up by the agent doing the work,
  so the defect stays live until a human does an unrelated chore.

### B. Check instead of applying (chosen)

The job asserts `gofmt -l` is empty and `prettier --check` passes, and fails naming `make fmt`.

- **Pros:** No bot push at all, so the unreadable state cannot occur; nothing to approve, nothing to
  pull, no commit appearing under someone else's name in the middle of a review. The check is the
  same two commands `make ci` already runs, so the author sees it locally first. No credential.
- **Cons:** Formatting becomes a way to fail the build, where it previously could not be. Someone who
  pushes without running `make ci` gets a red pipeline for something a machine could have fixed —
  a real regression in convenience, and the cost this option accepts.

### C. Drop formatting enforcement from CI entirely

Rely on `make ci` alone.

- **Pros:** Simplest; no job, no failure mode.
- **Cons:** Unenforceable. `make ci` is a convention, not a gate — the pipeline is what decides what
  reaches `main`, and this makes formatting the one agreed rule with nothing behind it. Rejected.

## Decision Matrix

| Driver (weight) | A: PAT auto-fix | B: check | C: drop |
|---|---|---|---|
| Readable pipeline state (5) | 4 — bot commit still surprises | 5 — no bot push exists | 5 |
| Formatting stays enforced (5) | 5 | 5 | 0 |
| Local gate catches it first (3) | 2 — nothing to catch, so nothing is learned | 5 | 3 |
| Cost, including attention and credentials (3) | 1 — a push-scoped PAT to save a `make fmt` | 5 | 5 |
| **Weighted total** | **52** | **80** | **49** |

## Consequences

- The `autoformat` job is replaced by `format`, which checks and never writes. It no longer needs
  `contents: write`, and the fork-PR exclusion goes with it — a check runs fine on a fork.
- `client-fmt` joins the `client` target, so `make ci` now checks prettier as well as gofmt. Without
  that, this ADR would have moved the failure to GitHub instead of removing it — the local gate has
  to be able to see everything the new job can fail on. This is the change that makes B's stated cost
  bounded: a red `format` job is now only reachable by pushing without running `make ci`.
- `format` joins `dependabot-merge`'s `needs`, so an auto-merged dependency PR is held to it too.
- Verified before landing: `gofmt -l cmd internal` is empty and `prettier --check src/` passes on
  `main`, so this turns nothing red on arrival.
- The CLAUDE.md paragraph describing the `action_required` workaround is deleted rather than kept as
  history — it documents a state that can no longer occur, and a live instruction for an impossible
  situation is worse than no instruction.
- **The job can fail, proved rather than assumed.** A deliberate formatting violation was pushed to a
  throwaway branch: `make client-fmt` failed locally and the CI `format` job came back red. A check
  nobody has watched fail is a check nobody knows is wired up, and this one's whole purpose is to be
  the thing that fails.
- **`format` is a required status check** (owner decision, 2026-08-30). Without it this ADR would
  have *weakened* enforcement rather than relocated it: the old job guaranteed formatted code on main
  by rewriting it, whereas a check that merely reports leaves a red `format` as something a
  maintainer must not merge past rather than something the branch refuses — and driver 2 asks for
  more than good intentions. Neither reason CLAUDE.md gives for leaving a job out of the required set
  applies here: `format` is a single check name (unlike the `e2e` matrix) and has no `needs`, so it
  can never be skipped into a blocking state (unlike `visual`). The required set is therefore
  `go`, `go-lint`, `client`, `format`, `docker-build`.

## Revisit trigger

If formatting failures become a recurring interruption — concretely, if the `format` job fails on
more than one PR in a month for a tree its author had run `make ci` against — then the local gate is
not actually catching what the job checks, and the two have drifted. Fix the drift; if it cannot be
fixed, option A becomes worth its credential.
