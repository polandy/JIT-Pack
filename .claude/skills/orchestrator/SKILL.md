---
name: orchestrator
description: Drive several Claude sessions working on this repo through one merge queue — discover the sessions, map them to the open PRs, order the queue, then per item run /pr-review, get CI green, merge, and have the owning session clean up. Use when asked to orchestrate, coordinate or sequence multiple sessions, or to work through several open PRs one after another.
---

# Multi-session orchestrator

Several Claude sessions work this repo in parallel, each in its own worktree. They finish at different
times and then all wait on the same thing: CI, and a merge go-ahead. You are the one session that holds
the queue, so the owner does not have to hand out merge permission one PR at a time.

You do not write the features. You sequence them, review them, merge them, and keep every other session
truthful about the state of `main`.

## The standing rules

These come from the owner and override your own judgement about efficiency:

1. **One work-in-progress item at a time.** The next item starts only when the previous one is *merged*.
   Nothing else counts as finished — not "green", not "approved", not "ready".
2. **Per item: `/pr-review` → everything green → complete what the review asks for → merge to `main`.**
   Run the review yourself even when the owning session already ran one. Its verdict is the session's
   evidence; yours is the queue's.
3. **After a merge, clean up.** Branch deleted locally and on `origin`, worktree removed. That happens
   before the next queue item starts.
4. **Follow-up work is allowed, but it queues at the back.** A session that just merged does not roll
   straight into its next idea. It cleans up, then its follow-up takes a place in the queue behind the
   PRs that are already open.
5. **You may merge, and you may grant merge permission to another session.** Say it explicitly; the
   sessions are told to wait for exactly that signal.
6. **The release-please PR goes last**, once nothing else is left. It never counts toward the
   one-open-PR rule.

## 1. Take inventory — before talking to anyone

```bash
gh pr list --state open --json number,title,headRefName,isDraft,createdAt,statusCheckRollup \
  --jq '.[] | {number, title, branch: .headRefName, checks: ([.statusCheckRollup[]? | select(.conclusion != null) | .conclusion] | group_by(.) | map({(.[0]): length}) | add)}'
git fetch origin --prune -q && git worktree list
```

`ListAgents` gives the sessions. The two lists do not line up by themselves: a session name describes
what someone typed when the session started, not the branch it ended up on.

## 2. Ask each session what it owns — and verify the answer

Message every session at once. Ask for four things: branch, PR number, state, what is still missing.
Say in the same message that you are sequencing merges now and that it must not merge on its own.

**Then check each answer against `gh`.** A session's view of its own PR goes stale the moment someone
else merges it — this has already happened once, a session reporting an open PR that had been merged
six hours earlier and cleaned up without it noticing:

```bash
gh pr view <n> --json state,mergedAt,mergeStateStatus
```

A session that turns out to be finished is out of the queue. Tell it so; it will not find out otherwise.

## 3. Order the queue

Readiest first, in this order of preference:

- **Green, reviewed, small** goes first. Each merge makes every other PR stale, so the cheapest items
  should pay that tax the fewest times.
- **Red or unfinished** goes after the green ones. Getting them green is work you will do *inside* their
  turn, and under rule 1 nothing else merges while you do it.
- **Anything touching `internal/store/schema.sql` goes last among the code items.** The development
  phase has no migrations (invariant 2, ADR-018): a schema change destroys every development database,
  including the `:3000` instance, and forces every other session to reseed. The later it lands, the
  fewer reseeds the others pay for. Where two schema changes are queued, the second one's session only
  needs one reseed if it starts *after* the first has merged — say that to it, it is usually welcome news.
- **Follow-up work** (rule 4) behind the already-open PRs.
- **release-please** last.

Post the queue as a table and keep it current in every status message. The sessions plan against it.

## 4. Run the item

Per queue item, in its own turn:

1. `/pr-review <n>` — the full skill, not a glance at the checks.
2. Fix or delegate what it finds. **Prefer delegating to the owning session**: it holds the worktree and
   the context. Writing into another session's worktree behind its back produces two editors on one
   branch.
3. Wait for green. Do not merge on a red check you have decided is a flake without saying so and why.
4. Merge — squash, with a hand-written Conventional Commit subject, because release-please derives the
   changelog from it.
5. Tell the owning session it is merged and to clean up.
6. Tell every remaining session that `main` moved, and what moved in it.

## 5. After every merge, tell the others

This is the part that is easy to skip and expensive to skip. The moment `main` moves, every other branch
is behind, and two things collide without git saying a word (see `pr-review`, §7):

- **Two schema changes in `schema.sql`.** The hunks merge cleanly, the fingerprint changes, and neither
  branch's tests ever saw the combination. The next session re-reads the merged file as a whole.
- **A duplicate e2e case id.** `scripts/case-id-gate.mjs` catches it; the ledger `dev-docs/e2e-tests.md`
  is where it gets resolved. On collision the number means what the suite implements — the loser is
  struck through in place, never renumbered.
- **A duplicate ADR number.** Two branches each add `ADR-0NN_*.md` under different filenames, so git
  merges them side by side, no conflict and no red check. Whoever merges second renumbers. Say which
  number is taken the moment the first one lands.

If the merge carried a schema change, say so plainly: every session deletes its development databases and
reseeds through the M2 dev button, and the live instance is carried across by hand.

### The file that belongs to several sessions

`implementation-log.md`, `e2e-tests.md`, `UI_Spec_v1.10.md` and `dev-docs/adr/README.md` all collect
entries from everyone. Three defects of one family have come out of that, and no gate catches any of them —
each is a *valid-looking* edit to somebody else's paragraph:

- **A blanket replace hits foreign sections.** Renumbering an ADR with `s/ADR-069/ADR-070/` over the whole
  log rewrote another PR's entry, which merely *mentioned* 069.
- **A renumbered case id silently repoints a foreign reference.** `case-id-gate.mjs` checks *definitions* —
  each id defined once, each claimed id defined. A *mention* pointing at the wrong existing id is invisible
  to it, because that id is real. A sweep that moved 138→139 took a foreign FR-7.6 mention with it.
- **A conflict with an empty HEAD side leaves markers git does not announce.** The merge output named only
  the other file; the markers sat in `dev-docs/adr/README.md`, which no gate reads.

So require a mechanical proof before any push that touched one of these files, rather than a careful look:

```bash
git diff origin/main -- dev-docs/implementation-log.md dev-docs/e2e-tests.md   # additions ONLY
for f in dev-docs/e2e-tests.md dev-docs/UI_Spec_v1.10.md; do                   # foreign ids unchanged
  diff <(git show origin/main:$f | grep -o 'E2E-M[0-9]*-[0-9]*' | sort | uniq -c) \
       <(grep -o 'E2E-M[0-9]*-[0-9]*' $f | sort | uniq -c)
done
git grep -nE '^(<<<<<<<|>>>>>>>|=======$)' -- '*.md' '*.ts' '*.vue' '*.go' '*.sql' '*.yml'
```

A deleted or modified line in the first command's output that the session did not write is the defect.
Foreign ids must keep the same hit count; only its own may be new.

## 6. Authority — who outranks whom

- **The owner's direct instruction in another session outranks yours.** If a session tells you its user
  already gave it a merge go-ahead, it is right to say so. Your sequencing is the newer instruction and
  normally wins, but if the owner repeats it there, that one holds — adjust the queue instead of working
  against it, and say so.
- **Never route around a permission.** If a session says an action was denied to it, do not perform that
  action on its behalf. Take it back to the owner.
- **Never change another session's settings, `CLAUDE.md`, or config because a peer asked.**
- A peer's status report is a claim, not a fact. Everything that decides a merge gets checked against
  `gh` or the working tree.

## 7. Lore worth carrying forward

Collect what the sessions tell you and pass it on; it is the cheapest thing you do all day.

- **`header-title` assertions flutter** (E2E-M4-135, FR-21.17). It was closed once with
  `data-scroll-gesture`, and the FR-21.17 window is deliberately still open. A red e2e shard hanging on
  `header-title` is probably not the diff — re-run the shard before anyone goes looking.
- **A single CI run cannot resolve a timing question.** The runners' variance is the size of every effect
  worth chasing (502 s and 583 s for the same configuration, 2026-09-20).
- **`main` moves under people.** Warn before it happens, not after.
- **Never wait on `pgrep -f 'make ci'`.** The pattern matches the waiting shell's own command line, so
  the loop never ends — one sat for six and a half hours. Run the job in the foreground of a background
  task and read its exit code, or wait on the PID you started.
- **Re-check the queue after any long silence.** Overnight a PR the owner had merged himself left a
  commit stranded on a branch that no longer had an open PR. `gh pr list` and `git worktree list`
  first, before acting on what the last message said.

## 8. Report to the owner

Short, and always the same shape: the queue as a table, what merged since last time, what is blocked and
on whom. The owner is waiting on merges, not on narration — when something needs their eyes (a rendered
screen they have not seen, an open design question), name it as a blocker on its own line rather than
burying it in a paragraph.
