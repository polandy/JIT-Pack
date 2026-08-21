Review uncommitted or recently committed changes against project standards:

1. Run `git diff HEAD` (or `git diff HEAD~1` if working tree is clean) to see changes
2. Read `dev-docs/CODING_PRINCIPLES.md`
3. Check the changes against these criteria:
   - Test-first: is there a driving test for each new behavior?
   - No unnecessary dependencies or abstractions
   - Comments explain "why" not "what"
   - Exported symbols have godoc
   - Package boundaries respected: `api → domain/sync/store`, `store → domain`, `domain`/`sync` import nothing internal
   - No security issues (OWASP top 10)
   - Commit messages follow Conventional Commits with FR/NFR references where applicable
   - `CLAUDE.md`'s "Not built yet" updated if the change completes an item or opens a new gap — a closed item shrinks to one line and a pointer, only open work carries detail
   - `dev-docs/implementation-log.md` appended to **only if the change earns an entry** (see its "What earns an entry": a rejected option, a wrong premise, an accepted cost, a priced trap — not a retelling of the diff), and the index at its top extended with the new section
4. Report findings concisely: what's good, what needs fixing. If everything is clean, say so briefly.
