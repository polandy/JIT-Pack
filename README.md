<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
    <img alt="JIT-Pack" src="docs/assets/logo-light.svg" width="300">
  </picture>
</p>

<p align="center"><i>Self-hosted, offline-first packing lists — quantities learned from past trips, real-time collaboration, your data on your server</i></p>

<p align="center">📖 <b><a href="https://polandy.github.io/JIT-Pack/">Documentation</a></b></p>
<br>

Packing lists that remember. Items are per-person or per-trip, so party size takes care of itself, and how *many* of each comes from what you actually took on your last trips — rescaled to this one's length and offered as a one-tap default. Check something off and it disappears from everyone else's screen at the same moment. It runs on your own machine — a single Go binary with an embedded SQLite database — and it keeps working on the plane, in the tent, and anywhere else the network is not.

> **Status:** the sync engine, the login broker and the API are in place and tested; large parts of the UI are being rebuilt against a closed concept. See [Not built yet](CLAUDE.md#not-built-yet) for exactly what is and is not there.

## Quickstart

One container, no identity provider, no configuration file:

```bash
docker run -d --name jitpack -p 8080:8080 -v jitpack-data:/data \
  -e JITPACK_SINGLE_USER=true \
  -e JITPACK_LOCAL_USER_ID=me \
  -e JITPACK_DB_PATH=/data/jitpack.db \
  ghcr.io/polandy/jit-pack:0.4.0
```

Open <http://localhost:8080> — the same container serves the app and the API. That is single-user mode: no authentication, every change attributed to one person. When you want accounts, hand it an OIDC provider and it brokers the login itself — see **[Authentication](https://polandy.github.io/JIT-Pack/authentication/)**.

New here? The **[Getting Started walkthrough](https://polandy.github.io/JIT-Pack/getting-started/)** takes it from nothing to a running instance, and **[Installation](https://polandy.github.io/JIT-Pack/installation/)** covers the reverse proxy in front of it.

## Features

- **Quantities from your own history** — the duration-normalized median of your last three trips in a series, rescaled to this trip's length and offered as a one-tap default. Things that scale with time scale; one-offs stay put.
- **Per-person or per-trip** — one tent for the group, three shirts each, and the list adds it up as travellers come and go.
- **Offline-first, genuinely** — the client owns its data and syncs when it can. Field-level last-write-wins merge over hybrid logical clocks, with every losing write kept in a conflict log rather than silently dropped.
- **Real-time collaboration** — one WebSocket per trip; a checked-off item lands on the other phone immediately.
- **Templates and trip cloning** — build the list once, instantiate it per trip, and let last year's trip seed this year's.
- **Post-trip review** — record what you actually used, and let the next instantiation of that template start from what the last trip taught it.
- **Luggage** — assign items to bags and see what is still unpacked, per bag and per person.
- **Three modes, one artifact** — multi-user with OIDC, single-user without any identity provider, and a purely local mode with no backend at all.
- **First-party sessions** — the server brokers OIDC as a confidential client and issues its own short-lived tokens; the provider's tokens never reach the browser ([ADR-007](dev-docs/adr/ADR-007_Session_Brokering.md)).

## Why JIT-Pack?

**A packing list is a small database with rules, and everyone keeps rebuilding it in a notes app.** The rules are what make it worth doing properly: quantities depend on the trip and on what last time taught you, some items imply others, and two people packing the same trip need to see each other's progress without stepping on it.

- **Your server, your file** — one SQLite file holds everything, images included. Back it up by copying it.
- **Offline is the normal case, not the error case** — the interesting moments for a packing list are the ones without reception.
- **No account anywhere else** — bring your own identity provider, or run it single-user and skip identity entirely.
- **Small on purpose** — a static binary and a SPA; no cluster, no message broker, no external database.

**Scope is deliberate.** JIT-Pack leaves identity to a real IdP (Authelia is the reference), TLS and routing to a reverse proxy, and backups to whatever already backs up your server. It does one thing: keep a packing list correct, shared, and available offline.

## Documentation

| Topic | Description |
|---|---|
| **[Getting Started](https://polandy.github.io/JIT-Pack/getting-started/)** | From nothing to a running instance. |
| **[Installation](https://polandy.github.io/JIT-Pack/installation/)** | Docker, building from source, serving the client, and the reverse proxy in front of both. |
| **[Configuration](https://polandy.github.io/JIT-Pack/configuration/)** | Every environment variable, and which combinations are valid. |
| **[Authentication](https://polandy.github.io/JIT-Pack/authentication/)** | The three modes, the OIDC setup, and what actually ends a session. |
| **[User Management](https://polandy.github.io/JIT-Pack/user-management/)** | Instance admins, provisioning, deactivating an account. |
| **[Backup & Export](https://polandy.github.io/JIT-Pack/backup/)** | What to back up, and how to get your data out. |
| **[Troubleshooting](https://polandy.github.io/JIT-Pack/troubleshooting/)** | Symptoms first, then causes. |
| **[Contributor docs](dev-docs/)** | PRDs, ADRs, specs and the implementation log — design records, not part of the user manual. |

## Development

`CLAUDE.md` in this root is the orientation document for anyone — human or AI assistant — starting on the codebase: what exists, where it lives, and the invariants that must not break. [`dev-docs/CODING_PRINCIPLES.md`](dev-docs/CODING_PRINCIPLES.md) is binding for code.

```bash
mise install     # once per machine — mise.toml pins the toolchain at the versions CI uses
make ci          # mirrors the CI pipeline 1:1 — green here predicts a green pipeline
go test -race ./cmd/... ./internal/...   # Go tests only; scoped because client/node_modules vendors Go source
```

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please) from the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) history. Merging the release PR creates the GitHub release, the `v*` tag, the CHANGELOG entry, and the container image on `ghcr.io` (`jit-pack` — one image serving the API and the client).

## License

[CC BY-NC-SA 4.0](LICENSE.md) — share and adapt with attribution, non-commercial, under the same terms.

## AI-Assisted Development

Much of this codebase was written with AI assistance ([Claude Code](https://claude.com/claude-code)), reviewed and maintained by the author. Every change goes through the same gate as any other: tests first, `make ci` green, and a human review before it lands on `main`.
