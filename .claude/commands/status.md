Run a quick project health check and report the results concisely:

1. `make test` — the race-enabled Go suite. **Use the Makefile target, not `go test ./...`**:
   `client/node_modules` ships Go source (the npm package `flatted` vendors a Go implementation),
   so `./...` picks it up once the client is installed and drags coverage under the gate. The
   target's `GO_PKGS` is the one place that scope is decided.
2. `make cover` for coverage against the gates (≥75 % overall, ≥90 % `internal/sync`) — but note
   CI runs the same profile and the same `scripts/coverage-gate.sh`, so on a busy machine prefer
   reading the last CI run.
3. `make client-test` — Vitest, once, no watcher.
4. `git log --oneline -5` for recent commits
5. `git status -s` for uncommitted changes, and `gh pr list` for what is already open

Format the output as a short status dashboard. Flag anything that needs attention (failing tests,
low coverage, uncommitted work, an open PR waiting on a merge go-ahead). `make ci` is the real
gate before any push; this command is the cheaper look.
