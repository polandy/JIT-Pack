#!/bin/sh
# PostToolUse(Edit|Write): format the touched file the same way CI's autoformat
# job would, so the bot never needs to commit `style:` fixes on our branches.
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0

case "$file" in
  *.go)
    if command -v gofmt >/dev/null 2>&1; then
      gofmt -w "$file"
    else
      # toolchain comes from mise (see mise.toml); shims may not be on PATH here
      mise exec -- gofmt -w "$file" 2>/dev/null
    fi
    ;;
  "$CLAUDE_PROJECT_DIR"/client/src/*)
    case "$file" in
      *.ts | *.vue | *.css | *.json | *.html)
        cd "$CLAUDE_PROJECT_DIR/client" || exit 0
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
