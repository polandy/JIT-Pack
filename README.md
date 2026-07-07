# JIT-Pack

Self-hosted, offline-first packing-list app. Go + embedded SQLite backend, Vue 3 + Capacitor client.

## For humans

Full specification set lives in `docs/` — start with `docs/PRD_Base.md` and `docs/PRD_Addendum_v2.8.md` for what the product does, `docs/UI_Spec_v1.8.md` for the screens, and the `docs/ADR-*.md` files for why the architecture looks the way it does.

## For Claude Code / an AI coding assistant

Read `CLAUDE.md` in this root first — it's written specifically to orient a fresh session without needing prior conversation context: current implementation status, what's built vs. not, in what order to build the rest, and a known environment deviation to check before touching the database layer.

## Running the tests

```
go test -race -cover ./...
```

Requires a C toolchain (CGO) for the current SQLite driver — see the deviation note in `CLAUDE.md` if that's a problem in your environment.
