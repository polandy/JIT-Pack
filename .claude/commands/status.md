Run a quick project health check and report the results concisely:

1. Run `go test -race -count=1 ./...` and report pass/fail (prefix with `mise exec --` if `go` is not on PATH)
2. Run `go test -coverprofile=/tmp/cover.txt ./... 2>/dev/null && go tool cover -func=/tmp/cover.txt | grep total` for overall coverage (gates: ≥75 % overall, ≥90 % `internal/sync`)
3. Run `cd client && npm run test:unit -- --run` and report pass/fail + test count
4. Show `git log --oneline -5` for recent commits
5. Show `git status -s` for uncommitted changes

Format the output as a short status dashboard. Flag anything that needs attention (failing tests, low coverage, uncommitted work).
