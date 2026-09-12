#!/bin/sh
# PostToolUse(Edit|Write): format the touched file the same way CI's autoformat
# job would, so the bot never needs to commit `style:` fixes on our branches.
#
# Both agent CLIs run this same script — Copilot CLI reads the cross-tool
# .claude settings file for its hooks — but they do not describe the edit
# identically: Claude Code names the edited file `file_path` and exports
# CLAUDE_PROJECT_DIR, Copilot CLI names it `path` and exports neither. Read both
# spellings and derive the root when it is unset, or the hook silently formats
# nothing under one of the two.
payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

root=${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)}
[ -n "$root" ] || exit 0

case "$file" in
  *.go)
    if command -v gofmt >/dev/null 2>&1; then
      gofmt -w "$file"
    else
      # toolchain comes from mise (see mise.toml); shims may not be on PATH here
      mise exec -- gofmt -w "$file" 2>/dev/null
    fi
    ;;
  "$root"/client/src/*)
    case "$file" in
      *.ts | *.vue | *.css | *.json | *.html)
        cd "$root/client" || exit 0
        if command -v npx >/dev/null 2>&1; then
          npx prettier --write --experimental-cli --log-level warn "$file" >/dev/null 2>&1
        else
          mise exec -- npx prettier --write --experimental-cli --log-level warn "$file" >/dev/null 2>&1
        fi
        ;;
    esac
    ;;
esac
exit 0
