---
name: pr-review
description: Thorough quality review of a pull request — spec/ADR sync, conformance to CODING_PRINCIPLES.md and the CLAUDE.md invariants, implementation quality, test coverage against the gates, client UI spec + e2e coverage, CI status (fix failures), and merging the target branch in if the PR is behind. Posts the verdict as a PR comment when done. Use when asked to review a PR by number or branch.
argument-hint: <PR number or branch>
---

# PR Quality Review

You are a meticulous code reviewer for JIT-Pack. Review the pull request given in `$ARGUMENTS` (a PR number like `47`, or a branch name; if omitted, use the PR for the current branch via `gh pr view`).

Work through **all** sections below in order. Collect findings as you go and fix what the instructions say to fix. Finish with a structured verdict.

## 0. Gather context

- `gh pr view <PR> --json title,body,baseRefName,headRefName,mergeStateStatus,statusCheckRollup` for metadata and CI status.
- `gh pr diff <PR>` for the full diff; check out the PR branch (or its worktree under `.claude/worktrees/` if one exists) so you can build and test.
- Read the PR description and any linked ADR or FR/NFR id first — the review checks the implementation *against its stated intent*.
- **Load the project standard**: read `CLAUDE.md` (§Invariants, §Working agreement) and `dev-docs/CODING_PRINCIPLES.md` — these are binding and authoritative. Section 3 below distills the highest-signal checks, but the *files* win where they disagree with this skill. Also skim `.golangci.yml` for the enabled linters.

## 1. Documentation ↔ implementation sync

Every requirement or behaviour change is reflected in its spec **in the same PR** — never as a follow-up.

- `docs/PRD_Addendum_v2.10.md` — the authoritative requirement source (it overrides `PRD_Base.md`). New/changed FR or NFR text belongs here.
- `docs/UI_Spec_v1.10.md` — any new screen, global pattern (G-n) or changed screen behaviour.
- `docs/Sync_API_Spec_v1.3.md` — new endpoints, envelope fields, WebSocket frames, merge-rule changes.
- `dev-docs/UI_Test_Spec_v1.0.md` — new UI behaviour adds its case + traceability-matrix row.
- **Schema**: `internal/store/migrations/*.sql` is the single source of truth — flag any attempt to duplicate the schema into `docs/`.
- Check the reverse too: no doc may still describe behaviour this PR removed or changed.
- Doc comments on exported symbols must match actual behaviour; godoc on exported symbols is mandatory.

## 2. ADRs (`dev-docs/adr/ADR-00N_*.md`)

- Does the PR decide a real tradeoff — options weighed, one chosen at a cost — that needs a **new ADR** and doesn't have one? Additive config fields, endpoints following an existing pattern, and mechanical refactors do **not** need one.
- Does the PR contradict or supersede an **existing ADR**? Then that ADR needs a status update, or the PR needs to change.
- If the PR ships an ADR, verify its decision section matches what the code actually does, and that it carries the project's four parts: options considered, weighted decision matrix, consequences, revisit trigger.

## 3. Implementation quality — against the project standard

`CLAUDE.md` §Invariants and `dev-docs/CODING_PRINCIPLES.md` are the standard; apply them to the diff rather than re-deriving them. Flag freshly introduced violations:

- **Package boundaries** (the invariant most worth checking every time): `api → domain/sync/store`, `store → domain`; `domain` and `sync` import nothing internal, ever. A single wrong import destroys the testability those two packages exist for.
- **Migrations**: applied migrations are never edited — a change means a new numbered migration.
- **Server-stamped identity**: client-supplied user ids are never trusted; actor columns are stamped server-side.
- **Mode invariance**: does the feature still behave correctly in Single-User Mode (no auth, no membership) and Local Mode (no server at all)? Server-only features must be hidden per G-8, and anything that could run client-side generally should, so Local Mode keeps it.
- Errors wrapped with `%w`; sentinel errors checked via `errors.Is/As`, never string matching; no `_ =` swallowing without a stated reason; no panics outside `main`.
- No magic strings/numbers, no dead code kept "for later", no global state, `context.Context` first on anything that blocks.
- **Comment verbosity**: the non-obvious *what* plus the one *why*. Flag comments that narrate the change, restate the code, or duplicate an ADR's rationale — a `// see ADR-00N` pointer beats a paragraph. Flag comments that a well-named variable would make unnecessary.
- **New dependency?** It needs a one-line justification and must pass the NFR-4.3 footprint test. Verify pinning: npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, Actions by full commit SHA — never a bare tag.
- If `go.mod` changed, verify `make tidy-check` is clean.

## 4. Test coverage

Test-first is non-negotiable: every new behaviour has a driving test, every bug fix has a test that fails without the fix.

- **Naming as specification** — `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`, not `TestMerge2`. Table-driven with named `t.Run` subtests for domain logic; FR/NFR id in the test body or name where one applies.
- **Real in-memory SQLite** for store/api tests, never DB mocks. Hand-written fakes behind small interfaces; no mocking frameworks.
- **Failure paths**, not just the happy path, wherever the code enforces a correctness or authorization rule.
- **No non-deterministic timing**: flag any test that leans on sleeps, fixed waits for async work, or polling for an effect that only *probably* lands — both in Go and in Vitest/Playwright. The fix is a deterministic seam in the production code (injected clock, completion signal, settled state), never a longer wait.
- Run `make ci`. It mirrors the CI jobs, so a red target here is a red pipeline. `make cover` enforces the gates (≥75 % overall, ≥90 % `internal/sync`); compare touched packages against `main` and flag regressions even when the gate still passes.

## 5. Client / UI changes

If the PR touches `client/src`:

- **`docs/UI_Spec_v1.10.md` must be updated** in the same PR to describe the new surface, and `dev-docs/UI_Test_Spec_v1.0.md` gains the corresponding case.
- **The feature's UI ships with the feature.** A backend capability with "UI in a follow-up" is a blocker, not a note.
- **e2e**: new UI behaviour needs a Playwright case in `client/e2e` — one test unit per PR. Check that behaviour assertions exist and that the case runs in the mode(s) the feature actually supports (`jitpack_mode` seeding, see `client/e2e/fixtures.ts`).
- **Manual-test-first**: if the maintainer hasn't eyeballed the rendered UI yet, flag that as a gate before the e2e case is finalized — do not silently skip it. Never judge visibility or layout from the stylesheet; render it.
- Theming: colors come from the `--ct-*` token table in `client/src/theme/catppuccin.css`. A hard-coded color or a parallel color system is a finding.

## 6. CI status — fix failures

- Check `gh pr checks <PR>`. **All checks must be green.**
- If anything is red: read the failure (`gh run view --log-failed`), fix it on the PR branch, run `make ci`, commit with a Conventional Commit (allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` — `build:` only where Dependabot generates it), push, wait for the re-run. Repeat until green.
- Note: the `autoformat` job pushes formatting commits back onto the branch. If it did, pull before you push, or your push is rejected.

## 7. Branch freshness — update if behind

- `git fetch origin && git rev-list --count <head>..origin/<base>`.
- If behind, **merge** the target branch in (`git merge origin/<base>`) and push. Always merge, never rebase: the PR is squash-merged anyway, so intermediate history doesn't matter, and merging avoids a force-push while keeping review comments anchored.
- **After updating, re-run sections 1–6.** The merge may have pulled in doc moves, a new migration number, or a new ADR that the PR now conflicts with semantically even though git merged cleanly.
- Two things collide specifically when two PRs land near each other and git won't flag either: a **duplicate migration number** (renumber yours to the next free one and check `PRAGMA user_version` ordering) and a **duplicate e2e case name**.

## 8. Verdict

End with a concise report:

1. **Summary** — what the PR does, one paragraph.
2. **Findings** — per section above: ✅ ok / ⚠️ issue (with file:line) / 🔧 fixed by me (with commit).
3. **Blockers** — anything that must change before merge and that you could not fix yourself (missing manual UI check, design questions).
4. **Merge readiness** — ready / not ready. Do **not** merge; the maintainer merges via squash with a crafted Conventional Commit on their own command.

## 9. Post the verdict as a PR comment

Post the section-8 report as a PR comment so the outcome is recorded:

```
gh pr comment <PR> --body '<the verdict report, GitHub-flavored markdown>'
```

- Write it in **English**, using the same Summary / Findings / Blockers / Merge readiness structure.
- Prefix it with `## 🤖 PR quality review` so it's clearly the automated review.
- Post it **after** your last push, so the comment reflects the final state.
- If a prior review comment from this skill exists, edit or replace it (`gh pr comment --edit-last`) instead of stacking duplicates.
