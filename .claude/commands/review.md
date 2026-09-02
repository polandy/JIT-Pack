Review uncommitted or recently committed changes against project standards:

1. Run `git diff HEAD` (or `git diff HEAD~1` if the working tree is clean) to see the changes
2. Read `dev-docs/CODING_PRINCIPLES.md` and `CLAUDE.md`'s **Invariants** and **Working agreement**
   sections. **Those files are the standard** — check the diff against them rather than against a
   list restated here, which is how a third copy goes stale without anything turning red.
3. Beyond what those files say, check:
   - Test-first: is there a driving test for each new behaviour, and does its *name* say which
     rule would break?
   - Comments explain "why", not "what"; godoc on exported symbols
   - No security issues (OWASP top 10)
   - Conventional Commits with FR/NFR references where applicable
   - `CLAUDE.md`'s "Not built yet" updated if the change closes an item or opens a new gap — a
     closed item is one line and a pointer, only open work carries detail
   - `dev-docs/implementation-log.md` appended to **only if the change earns an entry** (see its
     "What earns an entry": a rejected option, a wrong premise, an accepted cost, a priced trap —
     not a retelling of the diff), and its index extended with the new section
   - `dev-docs/e2e-tests.md` updated when the diff adds or retires a Playwright case
4. Report findings concisely: what's good, what needs fixing. If everything is clean, say so
   briefly.

For a pull request rather than a working tree, use the `pr-review` skill instead — it is the
fuller checklist and it posts its verdict.
