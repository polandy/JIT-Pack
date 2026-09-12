# Agent tooling — one configuration, two CLIs

JIT-Pack is developed with agent CLIs, and two of them are supported: **Claude Code** and
**GitHub Copilot CLI**. The rule is that the *configuration* is written once and both read it —
there is no Copilot copy of a Claude document that can drift, for the same reason there is no second
copy of the schema (ADR-018) or of the wire contract (ADR-026).

What follows is what each tool actually reads, verified by running it rather than by reading its
documentation — the two disagreed on one point that mattered, and the disagreement is the whole
reason this file exists.

## What is shared, and by what mechanism

| Thing | Lives in | Claude Code | Copilot CLI |
|---|---|---|---|
| Orientation + invariants | `CLAUDE.md` | loaded automatically | loaded automatically |
| Instruction pointer for other surfaces | `.github/copilot-instructions.md` | not read | loaded (also the cloud agent and code review) |
| Coding principles, specs, ADRs | `dev-docs/` | read on demand | read on demand |
| Skills | `.claude/skills/*/SKILL.md` | project skills | project skills (`.claude/skills/` is a discovery path) |
| Slash commands | `.claude/commands/*.md` | `/next`, `/review`, `/status` | surfaced as project skills under the same names |
| MCP servers | `.mcp.json` | project servers | project servers |
| Formatting on edit | `.claude/hooks/format-file.sh` | `PostToolUse` from the `.claude` settings | same file, same settings — see below |
| Migrations speed bump | Claude: a `deny` rule in `.claude/settings.json`; Copilot: `.github/hooks/jitpack.json` → `scripts/agent-guard-migrations.sh` | deny rule | `PreToolUse` hook |

`.github/copilot-instructions.md` is deliberately a **pointer, not a second orientation document**.
It exists because the cloud agent and code review do not read `CLAUDE.md`, and it says three things
and then names the file that says the rest. If it ever starts explaining the project, it has become
the copy this layout is meant to avoid.

## The one place the two tools genuinely differ

Copilot CLI reads the cross-tool `.claude/settings.json` for its inline `hooks` block, so a hook
declared for Claude Code fires under both. **The payload is not the same, though**, and the
difference is silent:

| | Claude Code | Copilot CLI |
|---|---|---|
| Edited file, in the `PostToolUse` payload | `tool_input.file_path` | `tool_input.path` |
| Repository root in the environment | `CLAUDE_PROJECT_DIR` | not set |

`format-file.sh` originally read `file_path` and branched on `$CLAUDE_PROJECT_DIR`. Under Copilot
both were empty, so the hook exited 0 having formatted nothing — a green, quiet, entirely inert
hook, and the only symptom would have been a `format` job failing on a branch days later. It now
reads either spelling and derives the root with `git rev-parse` when the variable is unset.

**The general rule this leaves behind:** a hook shared by both tools reads both spellings of the
edited path and never depends on `CLAUDE_PROJECT_DIR` being set. A hook that assumes one tool's
payload does not fail — it does nothing, which is worse.

## Why the migrations guard is a hook rather than a rule

Claude Code can refuse a write by path with a `permissions.deny` rule in its settings. Copilot CLI
has no repository-level deny rules — repository policy for it is `.github/hooks/` — so invariant 2's
speed bump against `internal/store/migrations/**` is a `PreToolUse` hook that returns
`permissionDecision: "deny"`.

Two properties of that hook are deliberate:

- **It emits `{}` for everything it is not about, and never exits non-zero.** Copilot's `preToolUse`
  command hooks are *fail-closed*: a crash or a non-zero exit denies the tool call. A guard that
  crashed on an unexpected payload would block every edit in the repository, so it declines to have
  an opinion instead.
- **It is still only a speed bump.** Both mechanisms are trivially bypassable with a shell
  redirection, and that is fine — the point is that creating a migration has to be a decision rather
  than a reflex. The invariant is enforced for real by `Open` refusing a stale fingerprint, not here.

## Adding a tool-specific setting

Prefer the shared file. When something genuinely has no cross-tool home:

- **Claude-only** → `.claude/settings.json` (committed) or `.claude/settings.local.json` (personal).
- **Copilot-only** → `.github/hooks/*.json`, or `.github/copilot/settings.json` for repository
  settings. Personal, uncommitted overrides go in `.github/copilot/settings.local.json`.
- **Either way, add a row to the table above.** A tool-specific setting that nobody records becomes
  a behaviour difference somebody debugs twice.
