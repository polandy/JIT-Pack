Review uncommitted or recently committed changes against project standards:

1. Run `git diff HEAD` (or `git diff HEAD~1` if working tree is clean) to see changes
2. Read `docs/CODING_PRINCIPLES.md`
3. Check the changes against these criteria:
   - Test-first: is there a driving test for each new behavior?
   - No unnecessary dependencies or abstractions
   - Comments explain "why" not "what"
   - Exported symbols have godoc
   - Package boundaries respected: `api → domain/sync/store`, `store → domain`, `domain`/`sync` import nothing internal
   - No security issues (OWASP top 10)
4. Report findings concisely: what's good, what needs fixing. If everything is clean, say so briefly.
