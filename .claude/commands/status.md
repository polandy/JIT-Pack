Run a quick project health check and report the results concisely:

1. Run `go test -race -count=1 ./...` and report pass/fail
2. Run `go test -coverprofile=/tmp/cover.txt ./... 2>/dev/null && go tool cover -func=/tmp/cover.txt | grep total` for overall coverage
3. Show `git log --oneline -5` for recent commits
4. Show `git status -s` for uncommitted changes

Format the output as a short status dashboard. Flag anything that needs attention (failing tests, low coverage, uncommitted work).
