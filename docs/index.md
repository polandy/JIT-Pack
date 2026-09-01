<p align="center">
  <img src="assets/logo-light.svg#only-light" alt="JIT-Pack" width="260">
  <img src="assets/logo-dark.svg#only-dark" alt="JIT-Pack" width="260">
</p>

# JIT-Pack

*Self-hosted, offline-first packing lists — quantities learned from past trips, real-time collaboration, your data on your server*

Packing lists that remember. Items are per-person or per-trip, so party size takes care of itself, and how *many* of each comes from what you actually took on your last trips — rescaled to this one's length and offered as a one-tap default. Check something off and it disappears from everyone else's screen at the same moment. It runs on your own machine: a single Go binary with an embedded SQLite database, and a client that keeps working with no network at all.

This manual covers **running** a JIT-Pack server: installing it, configuring it, wiring up authentication, and keeping it healthy.

## Quickstart

One container, no identity provider, no configuration file:

```bash
docker run -d --name jitpack -p 8080:8080 -v jitpack-data:/data \
  -e JITPACK_SINGLE_USER=true \
  -e JITPACK_LOCAL_USER_ID=me \
  -e JITPACK_DB_PATH=/data/jitpack.db \
  ghcr.io/polandy/jit-pack:0.4.0
```

Open <http://localhost:8080>: the same container serves the app and the API. That is [single-user mode](authentication.md): no authentication, every change attributed to one person. It is the fastest way to see the thing run, and a perfectly reasonable way to keep running it for one household.

When you want real accounts, point it at an OIDC provider and it brokers the login itself — no user database of its own, no password to store. See [Authentication](authentication.md).

The [Getting Started walkthrough](getting-started.md) takes it from nothing to a running instance; [Installation](installation.md) covers the reverse proxy you put in front of it for TLS.

## How it fits together

JIT-Pack is two pieces and one file, shipped as one container:

- **`jitpackd`** — the Go server. It owns the SQLite database, the sync protocol, the OIDC login broker, and it serves the client's files as well, so the whole app answers on one origin.
- **The client** — a Vue single-page app, installable on a phone. It holds its own copy of the data and syncs when it can. (You can serve it from your own web server or a CDN instead; see [Installation](installation.md#if-you-serve-the-client-yourself).)
- **`jitpack.db`** — one SQLite file holding everything, images included. That file is your backup.

Because the client owns its data, the interesting failure mode is uninteresting: losing the network stops the sync, not the app. Changes made offline merge back in field by field, and any value that was overwritten in the process is kept in a conflict log rather than silently dropped. The log is reachable from the sync glyph in the top bar — one for the open trip, one for everything shared across trips. Each entry names the thing it is about, the field, and both values in the app's language, and offers to put the losing value back. Reverting is an ordinary change, not a rewind: it reaches every device the usual way, and anyone who edits the same thing afterwards still wins.

## Where to go next

| Page | What it covers |
|---|---|
| [Getting Started](getting-started.md) | From nothing to a running instance. |
| [Installation](installation.md) | Docker, building from source, the reverse proxy in front — including the `Host` header rule that is easy to miss. |
| [Configuration](configuration.md) | Every environment variable, which combinations are valid, and what fails fast at startup. |
| [Authentication](authentication.md) | The three modes, the Authelia setup, and precisely what does and does not end a session. |
| [Multi-user Setup](multi-user-setup.md) | From a running multi-user instance to a household actually using it. |
| [User Management](user-management.md) | How accounts appear, who is an instance admin, and how to shut one off. |
| [Notifications & Push](notifications.md) | What triggers a notification, and getting Web Push onto every phone. |
| [Backup & Export](backup.md) | Which files are the backup, what a scheduled one must get right, and how to get your data out. |
| [Upgrades](upgrades.md) | Moving between pre-1.0 versions without losing your data. |
| [Troubleshooting](troubleshooting.md) | Symptoms first, then causes. |

Design records and specifications live in [`dev-docs/`](https://github.com/polandy/JIT-Pack/tree/main/dev-docs) in the repository. They are contributor material and are deliberately not part of this manual.
