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

- `dev-docs/PRD_Addendum_v2.10.md` — the authoritative requirement source (it overrides `PRD_Base.md`). New/changed FR or NFR text belongs here.
- `dev-docs/UI_Spec_v1.10.md` — any new screen, global pattern (G-n) or changed screen behaviour.
- `dev-docs/Sync_API_Spec_v1.3.md` — new endpoints, envelope fields, WebSocket frames, merge-rule changes.
- `dev-docs/UI_Test_Spec_v1.0.md` — new UI behaviour adds its case + traceability-matrix row.
- **Schema**: `internal/store/schema.sql` is the single source of truth — flag any attempt to duplicate the schema into `docs/`.
- Check the reverse too: no doc may still describe behaviour this PR removed or changed.
- Doc comments on exported symbols must match actual behaviour; godoc on exported symbols is mandatory.

## 2. ADRs (`dev-docs/adr/ADR-00N_*.md`)

- Does the PR decide a real tradeoff — options weighed, one chosen at a cost — that needs a **new ADR** and doesn't have one? Additive config fields, endpoints following an existing pattern, and mechanical refactors do **not** need one.
- Does the PR contradict or supersede an **existing ADR**? Then that ADR needs a status update, or the PR needs to change.
- If the PR ships an ADR, verify its decision section matches what the code actually does, and that it carries the project's four parts: options considered, weighted decision matrix, consequences, revisit trigger.

## 3. Implementation quality — against the project standard

`CLAUDE.md` §Invariants and `dev-docs/CODING_PRINCIPLES.md` are the standard; apply them to the diff rather than re-deriving them. Flag freshly introduced violations:

- **Package boundaries** (the invariant most worth checking every time): `api → domain/sync/store`, `store → domain`; `domain` and `sync` import nothing internal, ever. A single wrong import destroys the testability those two packages exist for.
- **Schema**: the development phase has no migrations (ADR-018). A schema change edits `internal/store/schema.sql`; a new `internal/store/migrations/` file is a finding. Check that the change is a deliberate one — every existing database is destroyed by it — and that anything it *would* have backfilled is covered by the dev seed instead.
- **Server-stamped identity**: client-supplied user ids are never trusted; actor columns are stamped server-side.
- **Mode invariance**: does the feature still behave correctly in Single-User Mode (no auth, no membership) and Local Mode (no server at all)? Server-only features must be hidden per G-8, and anything that could run client-side generally should, so Local Mode keeps it.
- Errors wrapped with `%w`; sentinel errors checked via `errors.Is/As`, never string matching; no `_ =` swallowing without a stated reason; no panics outside `main`.
- No magic strings/numbers, no dead code kept "for later", no global state, `context.Context` first on anything that blocks.
- **Comment verbosity**: the non-obvious *what* plus the one *why*. Flag comments that narrate the change, restate the code, or duplicate an ADR's rationale — a `// see ADR-00N` pointer beats a paragraph. Flag comments that a well-named variable would make unnecessary.
- **New dependency?** It needs a one-line justification and must pass the NFR-4.3 footprint test. Verify pinning: npm via `package-lock.json`, Go via `go.sum`, Docker base images by `@sha256:` digest, Actions by full commit SHA — never a bare tag.
- If `go.mod` changed, verify `make tidy-check` is clean.

## 4. Test coverage

Test-first is non-negotiable: every new behaviour has a driving test, every bug fix has a test that fails without the fix.

### 4.0 The review scope is the diff, not the PR description — build the table first

Before any other coverage check, run `gh pr diff <PR> --name-only` and build a table with **one row per changed file** under `client/src/**`, `internal/**` and `cmd/**`, naming the test that drives *that file's changed lines* — test file plus case name. A row you cannot fill is a finding, whatever the PR title is about.

**This table is a required part of the §8 verdict.** Not a claim that it was done — the table itself, posted. It is cheap, and it is the only step here that cannot be satisfied by narrative.

It exists because both reviews it was written after failed the same way (2026-08-17, PRs #101 and #102):

- #101's verdict summary says "M18 now reads such a file" and marks client coverage ✅ — while `PortableImportPage.vue`, changed in that same diff, appears in no section of the review. The restore branch shipped with nothing driving it.
- #102's verdict is entirely about FR-27.14. The same diff also amended FR-25.13a across two screens; that half is not mentioned anywhere, and the untested screen stayed untested.

Both reviewed the feature named in the title. A PR routinely carries two, and the second one is the one that ships without tests.

Three rules follow from the same two misses:

- **A write half and a read half are two behaviours.** Export/import, backup/restore, generate/render, encode/decode: each side needs its own driving case. "We write it and a domain unit parses it" is not coverage of the screen a user reads it back through — and for anything that is the only copy of the user's data, the read half is the more important of the two.
- **One rule written into N templates needs N cases.** If the same behaviour is expressed separately per screen (a `v-if` in each view rather than one shared component), one screen keeping it says nothing about the others. Check every site the diff touched.
- **A shared test helper is never the assertion.** A helper that tolerates both states — `if (await x.isVisible()) return` — has to tolerate them, and would stay green against the behaviour's removal. If the only thing "covering" a behaviour is a helper's tolerance, it is untested.

- **Naming as specification** — `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`, not `TestMerge2`. Table-driven with named `t.Run` subtests for domain logic; FR/NFR id in the test body or name where one applies.
- **Real in-memory SQLite** for store/api tests, never DB mocks. Hand-written fakes behind small interfaces; no mocking frameworks.
- **Failure paths**, not just the happy path, wherever the code enforces a correctness or authorization rule.
- **No non-deterministic timing**: flag any test that leans on sleeps, fixed waits for async work, or polling for an effect that only *probably* lands — both in Go and in Vitest/Playwright. The fix is a deterministic seam in the production code (injected clock, completion signal, settled state), never a longer wait.
- **Review the cut, not just the coverage** (CODING_PRINCIPLES §3, testability-by-design): for each new behaviour in the diff, ask *where does its driving test live?* Decision logic that is only reachable through an HTTP handler, a goroutine, or a wired-up store is a finding even when an integration test covers it — the fix is moving the rule into a pure function (or behind a small consumer-side interface with a hand-written fake), not writing a bigger integration test. Watch for the usual smells: branching business rules inline in a handler, `time.Now()`/`Date.now()` called ambiently where a seam belongs, a new external effect without an interface at the consumer, client-side rules placed in a component instead of `client/src/domain`.
- Run `make ci`. It mirrors the CI jobs, so a red target here is a red pipeline. `make cover` enforces the gates (≥75 % overall, ≥90 % `internal/sync`); compare touched packages against `main` and flag regressions even when the gate still passes — for backend packages the diff touches, run `go test -cover` per package on the PR branch and on `main` and report the delta.

## 5. Client / UI changes

If the PR touches `client/src`:

- **`dev-docs/UI_Spec_v1.10.md` must be updated** in the same PR to describe the new surface, and `dev-docs/UI_Test_Spec_v1.0.md` gains the corresponding case.
- **The feature's UI ships with the feature.** A backend capability with "UI in a follow-up" is a blocker, not a note.
- **e2e**: new UI behaviour needs a Playwright case in `client/e2e` — one test unit per PR. Check that behaviour assertions exist and that the case runs in the mode(s) the feature actually supports (`jitpack_mode` seeding, see `client/e2e/fixtures.ts`).
- **Read the spec's case text against the test body, sentence by sentence.** A case id existing is not coverage. The UI-Test-Spec entry is a list of promises, and each clause has to be findable as an assertion — "released on both when cleared **or when one side is deleted**" is two promises, and a PR that tests the first while marking the id *implemented* has written a false spec. Where a promise turns out not to be assertable through the UI, the spec sentence is what changes; do not leave it standing as if a lower-layer unit test satisfied it.
- **Check the spec's claim against the screen, not only against the test.** The same reading catches a promise the *implementation* never made: if the spec says items can be moved between containers and the built screen offers no path once an item is assigned, the finding is a wrong spec sentence, not a missing test.
- **Global patterns, not only the screen.** The working agreement makes this binding after four navigation defects that both green screen suites missed: reaching the new screen from wherever it is reached, leaving it, and what the app bar shows afterwards belong in `client/e2e/global-nav.spec.ts`. A PR that adds a screen and covers it only from inside its own unit has not covered getting there. Assert against the visible page (`ion-router-outlet > .ion-page:not(.ion-page-hidden)`), never the URL alone.
- **Mutation-prove the case that owns the PR's headline defect.** Revert the fix in the production code, watch that exact case go red, restore. A case that stays green is not a test, whatever its name says — and this is the cheapest way to find one. **Rebuild between the two runs** (`npm run build`): Playwright drives the built bundle via `npm run preview`, so a source-only edit changes nothing and the "proof" passes both ways. Test-side edits need no rebuild; production-side edits always do.
- **Manual-test-first**: if the maintainer hasn't eyeballed the rendered UI yet, flag that as a gate before the e2e case is finalized — do not silently skip it. Never judge visibility or layout from the stylesheet; render it.
- Theming: colors come from the `--ct-*` token table in `client/src/theme/catppuccin.css`. A hard-coded color or a parallel color system is a finding.

## 6. CI status — fix failures

- Check `gh pr checks <PR>`. **All checks must be green.**
- If anything is red: read the failure (`gh run view --log-failed`), fix it on the PR branch, run `make ci`, commit with a Conventional Commit (allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` — `build:` only where Dependabot generates it), push, wait for the re-run. Repeat until green.
- Note: the `autoformat` job pushes formatting commits back onto the branch. If it did, pull before you push, or your push is rejected.

## 7. Branch freshness — update if behind

- `git fetch origin && git rev-list --count <head>..origin/<base>`.
- If behind, **merge** the target branch in (`git merge origin/<base>`) and push. Always merge, never rebase: the PR is squash-merged anyway, so intermediate history doesn't matter, and merging avoids a force-push while keeping review comments anchored.
- **After updating, re-run sections 1–6.** The merge may have pulled in doc moves, a schema change, or a new ADR that the PR now conflicts with semantically even though git merged cleanly.
- Two things collide specifically when two PRs land near each other and git won't flag either: **two schema changes in `schema.sql`** (git merges the hunks cleanly; re-read the merged file as a whole, because the fingerprint changes and neither branch's tests saw the combination) and a **duplicate e2e case name**.

## 8. Verdict

End with a concise report:

1. **Summary** — what the PR does, one paragraph.
2. **The §4.0 table** — every changed production file against the test that drives its changed lines. Posted as a table, not summarised; an unfilled row is a finding and belongs in the findings below too.
3. **Findings** — per section above: ✅ ok / ⚠️ issue (with file:line) / 🔧 fixed by me (with commit).
4. **Blockers** — anything that must change before merge and that you could not fix yourself (missing manual UI check, design questions).
5. **Merge readiness** — ready / not ready. Do **not** merge; the maintainer merges via squash with a crafted Conventional Commit on their own command.

## 9. Post the verdict as a PR comment

Post the section-8 report as a PR comment so the outcome is recorded:

```
gh pr comment <PR> --body '<the verdict report, GitHub-flavored markdown>'
```

- Write it in **English**, using the same Summary / Findings / Blockers / Merge readiness structure.
- Prefix it with `## 🤖 PR quality review` so it's clearly the automated review.
- Post it **after** your last push, so the comment reflects the final state.
- If a prior review comment from this skill exists, edit or replace it (`gh pr comment --edit-last`) instead of stacking duplicates.
