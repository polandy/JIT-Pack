---
name: pr-review-lite
description: Fast quality review of a feature branch or draft PR — same standard as /pr-review (spec/ADR sync, CODING_PRINCIPLES.md and the CLAUDE.md invariants, implementation quality, test coverage against the gates, client UI spec + e2e coverage) but does not wait for or require e2e/visual to be green, so it can run before a PR exists or while those jobs are still running on GitHub. Not a substitute for /pr-review before merge. Use for a quick pre-PR check while iterating on a feature branch.
argument-hint: <branch name, or PR number if one already exists>
---

# Fast branch review (no e2e wait)

You are the same meticulous reviewer `/pr-review` is, applied to `$ARGUMENTS` (a branch name, or a PR number/current
branch if a PR already exists). The difference from `/pr-review` is scope of *time*, not of *standard*: this skill
exists so a feature branch gets full review feedback without paying for the e2e matrix first, per the tradeoff
recorded in `dev-docs/implementation-log.md` ("`e2e` stopped running on `ci-remote`", 2026-09-22) — `e2e` no longer
runs on `make ci-remote`, only on an actual `pull_request` or `push` to main, so waiting on it here would mean
waiting on a job that has not even started.

**This is not the merge gate.** Before merge, run the real `/pr-review` — its CI-status section requires every check
green, this one deliberately does not.

Work through the sections below in order, exactly as `/pr-review` does, and fix what you can as you go.

## 0. Gather context

- If a PR already exists for the branch: `gh pr view <PR> --json title,body,baseRefName,headRefName,statusCheckRollup`
  and `gh pr diff <PR>`.
- If no PR exists yet: check out the branch (or its worktree under `.claude/worktrees/`), then diff against the base
  it will merge into — `git fetch origin && git diff origin/main...<branch> --stat` for scope, full diff as needed.
- Read any linked ADR or FR/NFR id first — review the implementation *against its stated intent*, not just the diff.
- **Load the project standard**: `CLAUDE.md` (§Invariants, §Working agreement) and `dev-docs/CODING_PRINCIPLES.md` —
  binding and authoritative, they win over this skill where the two disagree. Skim `.golangci.yml` for enabled
  linters.

## 1–5, 7. Same checks as /pr-review

Run `/pr-review`'s sections 1 (documentation ↔ implementation sync), 2 (ADRs), 3 (implementation quality against the
project standard), 4 (test coverage, including the §4.0 per-file table — build it here too, it is cheap and it is
the check that actually catches a second, untested half of a diff), 5 (client/UI changes, e2e/spec coverage) and 7
(branch freshness) exactly as that skill defines them. Read `.claude/skills/pr-review/SKILL.md` for the full text of
each rather than duplicating it here — the two must not drift, and the source of truth is one file.

Section 5's e2e requirement is about the **case existing and being correctly written** (naming the right assertions,
the right mode, mutation-proving the headline defect) — that check still applies in full. What this skill skips is
only *waiting for that case to have actually run green in CI*, covered in section 6 below.

## 6. CI status — fast checks only, e2e/visual read but not required

- Check `gh pr checks <PR>` if a PR exists; otherwise run the fast local equivalent: `make ci` (mirrors `go`,
  `go-lint`, `client`, `format` 1:1) plus `docker build -t jitpack-ci .` if the diff touches the `Dockerfile` or
  anything `scripts/docker-smoke.sh` exercises.
- **Required to be green**: `go`, `go-lint`, `client`, `format`, `docker-build` — same set branch protection already
  requires for `main`.
- **Not required, read and reported instead**: `e2e`, `e2e-single`, `e2e-server`, `visual`. If a PR exists and they
  have already run (from a prior `pull_request` event, or because CI re-ran after this session's push), report their
  result — a red one among them is worth surfacing as a note, not treated as a blocker here. If they have not run
  yet (branch has no PR, or `ci-remote` was the last trigger), say so plainly rather than guessing at their state.
- If a required (fast) check is red: read the failure, fix it, run `make ci`, commit, push, re-check. Same loop as
  `/pr-review` §6.

## 8. Verdict

Same shape as `/pr-review` §8 (Summary, the §4.0 table, Findings, Blockers, Merge readiness), with one addition:
**e2e status** — a one-line note on whether `e2e`/`e2e-single`/`e2e-server`/`visual` have run, and their result if
known. End the merge-readiness line with a reminder that `/pr-review` is still owed before merge if this review
found nothing needing a fix.

## 9. Posting

Only post a PR comment if a PR already exists (`gh pr comment <PR> --body '...'`, prefixed `## 🤖 Fast branch review
(no e2e wait)`, editing a prior one of the same skill via `--edit-last`). If no PR exists yet, give the verdict
directly in the response instead — there is nowhere to post it.
