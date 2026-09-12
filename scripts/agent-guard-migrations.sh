#!/bin/sh
# PreToolUse(Edit|Write) guard: the development phase has no DDL migrations
# (CLAUDE.md invariant 2, ADR-018) — a schema change edits
# internal/store/schema.sql. Claude Code enforces this with a `deny` rule in its
# settings; Copilot CLI has no repository-level deny rules, so the same speed
# bump is a hook here. Both are speed bumps, not security boundaries: the point
# is that creating a migration has to be a decision rather than a reflex.
#
# `preToolUse` command hooks are fail-closed — a crash or a non-zero exit denies
# the call — so this script never exits non-zero and emits `{}` (no opinion) for
# everything it is not about. Hence no `set -e`.
payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

case "$file" in
  */internal/store/migrations/*)
    printf '%s\n' '{"permissionDecision":"deny","permissionDecisionReason":"CLAUDE.md invariant 2 (ADR-018): the development phase has no DDL migrations. Edit internal/store/schema.sql instead; there is no upgrade path, so a change that would have needed a backfill is a reseed."}'
    ;;
  *)
    printf '%s\n' '{}'
    ;;
esac
exit 0
