# Copilot instructions — JIT-Pack

The orientation document for this repository is [`CLAUDE.md`](../CLAUDE.md) in the repository root,
and it is binding for every agent working here regardless of which one you are. Copilot CLI loads it
automatically; surfaces that do not — the cloud agent, code review — must read it before changing
anything.

**Read, in this order:**

1. [`CLAUDE.md`](../CLAUDE.md) — commands, where things live, the **Invariants** (do not break these),
   the testing rules and the working agreement.
2. [`dev-docs/CODING_PRINCIPLES.md`](../dev-docs/CODING_PRINCIPLES.md) — binding; read before writing
   code.
3. The spec sections your change actually touches, named in `CLAUDE.md`'s "Where things live" table.
   Not the whole documents.

**The three that catch an agent out most often:**

- **Verify with `make ci` before finishing any change.** It mirrors the CI jobs 1:1. Do not use
  `go test ./...` — the Makefile's `GO_PKGS` is the one place the package scope is decided.
- **No DDL migrations** (invariant 2, ADR-018): a schema change edits `internal/store/schema.sql`.
  `.github/hooks/jitpack.json` refuses a write under `internal/store/migrations/` as a speed bump.
- **Never commit to `main`** — a worktree under `.claude/worktrees/`, a PR, green CI, and then wait
  for the merge go-ahead.

Agent tooling shared by both CLIs — hooks, skills, MCP servers, and which of it each tool reads — is
described in [`dev-docs/agent-tooling.md`](../dev-docs/agent-tooling.md).
