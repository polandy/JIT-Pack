# Getting Started

From nothing to a running JIT-Pack in four steps, on your own machine, with no identity provider and no DNS. The stack you end up with is the repository's own local test stack: the `jitpackd` backend plus an nginx container that serves the client and proxies the API to it, so the whole app answers on a single origin.

```
browser ──▶ nginx (:3000) ──┬──▶ /            static SPA files
                            └──▶ /api, /ws    jitpackd (:8080) ──▶ /data/jitpack.db
```

That single origin is not a stylistic choice. The API sets no CORS headers and the sync WebSocket rejects cross-origin handshakes, so the SPA and the API must share a hostname — see [Installation](installation.md#serving-the-spa-behind-a-reverse-proxy) for what that means once you put this behind a real domain.

You need Docker with the Compose plugin, and Git. Nothing else — the images build Go and Node internally.

## Step 1 — Start the stack

```bash
git clone https://github.com/polandy/JIT-Pack.git
cd JIT-Pack
docker compose up --build
```

The first run compiles both halves, so give it a few minutes. It brings up two containers: `jitpack-dev-app` (the backend, reachable only inside the compose network) and `jitpack-dev-web` (nginx, published on port 3000).

The backend is configured for **single-user mode** through two environment variables in `docker-compose.yml`:

```yaml
JITPACK_SINGLE_USER: "true"
JITPACK_LOCAL_USER_ID: "local"
```

`JITPACK_SINGLE_USER=true` is what selects the mode, and `JITPACK_LOCAL_USER_ID` is mandatory alongside it — the server refuses to start without it, because it needs an identity to attribute every request to. That is the entire configuration. No session secret, no OIDC client, no identity provider: authentication and trip-membership checks are bypassed, and everything you create belongs to the user `local`.

!!! warning "Single-user mode has no authentication at all"
    There is no login, no token check and no per-user separation — anyone who can reach the port is that user. It is meant for a personal instance on a trusted network. Before exposing JIT-Pack to the internet, move to [multi-user mode with an identity provider](authentication.md).

## Step 2 — Confirm it started cleanly

A healthy backend logs exactly two lines and then goes quiet:

```
2026/08/09 10:14:22 starting in single-user mode (user=local)
2026/08/09 10:14:22 listening on :8080
```

The first line confirms the mode and echoes the user id the server will stamp on your data; the second means the HTTP listener is up. Nothing is logged per request, so silence afterwards is the expected state, not a stall.

Two startup failures you might see instead, both fatal and both immediate:

- `config: JITPACK_LOCAL_USER_ID is required in single-user mode` — `JITPACK_SINGLE_USER` is `true` but the user id is missing.
- `config: JITPACK_SESSION_SECRET is required in multi-user mode …` — `JITPACK_SINGLE_USER` is not exactly the string `true`, so the server fell through to multi-user mode. Any other value, including `1` or `TRUE`, counts as off.

Now check it over HTTP. All three go through nginx, so a good answer also proves the proxy routes are right:

```bash
curl -i http://localhost:3000/health
curl -s http://localhost:3000/api/v1/me
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Origin: http://localhost:3000" \
     http://localhost:3000/ws
```

`/health` returns `200 OK` with an empty body. `/api/v1/me` returns your identity as JSON — in single-user mode it answers without any credentials:

```json
{"user_id":"local","display_name":"Demo User","is_instance_admin":false}
```

The display name is a seeded default that you can change later in the app; the `user_id` is the value you configured.

The third is the sync WebSocket, and it answers `101 Switching Protocols`. It is worth running even though nothing in the four steps depends on it, because it is the one part of the stack that fails **silently**: the app loads and every screen works while live updates between devices never arrive. Send the `Origin` header exactly as shown — the handshake is only checked against it, so leaving it off turns this into a test that cannot fail. A `403` naming an `Origin` and a `Host` that differ means the proxy is not forwarding the address the browser used; [Installation](installation.md#serving-the-spa-behind-a-reverse-proxy) has the rule.

## Step 3 — Open the app

Go to <http://localhost:3000>.

On first launch the client asks a one-time question per device: keep the data **local to this device**, or connect to a **server**. Choose **Server** and connect — the URL field already contains the address you are on:

```
http://localhost:3000
```

The client stores that URL and reloads. It then asks the server whether OIDC login is available; a single-user server answers that it is not, so the client skips the login screen entirely and drops you straight into the app. There is no password to set and no account to create — you are already the user `local`.

!!! note "Keep the origin, don't swap in the backend port"
    The pre-filled value is the address the browser itself is on — `http://localhost:3000`. Should you ever change it by hand, it must stay that origin and must not become `http://localhost:8080`. The backend port is not published by this stack, and even if it were, requests to it from a page served on another port would be blocked by the browser and the WebSocket handshake would be refused.

## Step 4 — Know where your data is

Everything lives in a single SQLite file inside the `data` volume, at `/data/jitpack.db`. It survives `docker compose down` and is recreated empty if you ever remove the volume. The schema migrates itself on startup, so pulling a newer version needs no migration step from you.

```bash
docker compose down          # stops both containers, keeps the data
docker compose up -d         # back up, same database
```

## What's next

You now have a working single-user instance built from source. For anything longer-lived:

- **[Installation](installation.md)** — running the published image instead of a local build, and the reverse-proxy configuration for a real hostname (Traefik and nginx), including the `/ws` routing rule that quietly breaks sync when it is missing.
- **[Configuration](configuration.md)** — the full set of environment variables.
- **[Authentication](authentication.md)** — switching to multi-user mode, where accounts come from your own OIDC identity provider.
