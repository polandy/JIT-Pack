#!/bin/bash
# SessionStart: get the pinned toolchain (mise.toml) and project dependencies
# ready before the session starts working, so `make ci` actually mirrors CI
# instead of silently running on whatever go/node/golangci-lint happen to be
# on PATH in a fresh container.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

MISE_SHIMS="$HOME/.local/share/mise/shims"
MISE_BIN_DIR="$HOME/.local/bin"

# --- toolchain (mise.toml pins go/node/golangci-lint to the exact versions
# CI uses) -------------------------------------------------------------------
if ! command -v mise >/dev/null 2>&1 && [ ! -x "$MISE_BIN_DIR/mise" ]; then
  echo "jit-pack: mise not found, installing..."
  if ! curl -fsSL https://mise.jdx.dev/install.sh | sh >/tmp/jit-pack-mise-install.log 2>&1; then
    echo "jit-pack: WARNING - could not install mise (is mise.jdx.dev reachable?)." >&2
    echo "jit-pack: toolchain on PATH may not match the versions pinned in mise.toml / used by CI." >&2
    echo "jit-pack: allow mise.jdx.dev under the environment's Network access setting, then start a new session." >&2
    echo "jit-pack: install log: /tmp/jit-pack-mise-install.log" >&2
  fi
fi

export PATH="$MISE_BIN_DIR:$MISE_SHIMS:$PATH"

if command -v mise >/dev/null 2>&1; then
  echo "jit-pack: mise install (go/node/golangci-lint per mise.toml)..."
  if mise install; then
    # Prepend the mise shims so the pinned versions win over any system
    # go/node/golangci-lint already on PATH, for the rest of this session.
    echo "export PATH=\"$MISE_BIN_DIR:$MISE_SHIMS:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    echo "jit-pack: toolchain ready: $(mise ls --current 2>/dev/null | awk '{print $1"@"$2}' | tr '\n' ' ')"
  else
    echo "jit-pack: WARNING - mise install failed, falling back to whatever is already on PATH." >&2
  fi
else
  echo "jit-pack: mise unavailable, falling back to whatever go/node/golangci-lint are already on PATH." >&2
fi

# --- project dependencies, so `make test` / lint work without a first
# network round-trip mid-task --------------------------------------------
if command -v go >/dev/null 2>&1; then
  echo "jit-pack: go mod download..."
  go mod download || echo "jit-pack: WARNING - go mod download failed" >&2
fi

if command -v npm >/dev/null 2>&1 && [ -f client/package-lock.json ]; then
  if [ -d client/node_modules ]; then
    echo "jit-pack: client/node_modules already present, skipping npm ci"
  else
    # npm ci (not install): installs exactly what package-lock.json says and
    # never rewrites it, so a container without the pinned node version can't
    # drift the lockfile.
    echo "jit-pack: npm ci (client/)..."
    (cd client && npm ci) || echo "jit-pack: WARNING - npm ci failed in client/" >&2
  fi
fi

exit 0
