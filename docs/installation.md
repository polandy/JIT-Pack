# Installation

JIT-Pack ships as **one container**. `jitpackd` is a single static Go binary that serves three things from one port: the JSON API, the sync WebSocket, and the built Vue client — everything in one embedded SQLite file, with no runtime dependencies and nothing to put in front of it but TLS.

That matters more than it sounds. The API sets no CORS headers and the sync WebSocket refuses a cross-origin handshake, so the client and the API have to answer on the same scheme, host and port. One server is the simplest way to satisfy that, and it is the shape the published image takes.

!!! note "Serving the client yourself is still supported"
    `JITPACK_WEB_ROOT` is what tells `jitpackd` where the built client is; the image sets it to `/srv/web`. Unset it and the binary serves the API alone — the shape to use if a CDN or an existing web server already serves your static files. The [routing rules](#if-you-serve-the-client-yourself) that arrangement has to respect are at the end of this page.

If you just want an instance running on your laptop to look at, follow the [Getting Started walkthrough](getting-started.md) instead — it uses the repository's own compose stack and skips everything below.

---

## Docker

One image is published on every `v*` tag:

```
ghcr.io/polandy/jit-pack
```

It is built from the repository root `Dockerfile`: the client is compiled by a Node stage into `/srv/web`, `./cmd/jitpackd` by a Go stage with `CGO_ENABLED=0`, and both are copied into Alpine — entrypoint `jitpackd`, `EXPOSE 8080`, `JITPACK_WEB_ROOT=/srv/web`, with an empty `/data` directory prepared for the database.

```yaml
services:
  jitpack:
    image: ghcr.io/polandy/jit-pack:0.4.0
    restart: unless-stopped
    volumes:
      - jitpack-data:/data
    environment:
      JITPACK_LISTEN: ":8080"
      JITPACK_DB_PATH: "/data/jitpack.db"
      JITPACK_SINGLE_USER: "true"
      JITPACK_LOCAL_USER_ID: "local"

volumes:
  jitpack-data:
```

Notes on that file:

- **Pin a version tag.** `latest` exists, but it moves with every release — check the [Releases page](https://github.com/polandy/JIT-Pack/releases) for the current version. To freeze the deployment completely, pin the digest as well (`docker buildx imagetools inspect ghcr.io/polandy/jit-pack:0.4.0` prints it; then `image: ghcr.io/polandy/jit-pack:0.4.0@sha256:…`). [Upgrades](upgrades.md) explains when that matters.
- **The image carries its own healthcheck** — `wget --spider http://localhost:8080/health`, probed every 30 seconds — so `docker ps` reports `healthy` and another service's `depends_on: condition: service_healthy` works without a `healthcheck:` block of your own.
- **No published port.** Nothing outside needs to reach `8080` directly — the reverse proxy does, over the Docker network. Add `ports:` only if you are debugging, or if you are running without a proxy at all.
- **The volume must survive recreation.** `/data` holds the database; without the volume, every `docker compose up` starts an empty instance.
- **A misconfigured web root stops the container.** If `JITPACK_WEB_ROOT` points somewhere without an `index.html`, `jitpackd` exits at startup naming the path, rather than starting and serving a white page to the first person who opens a browser.
- The container above runs in **single-user mode**, which performs no authentication whatsoever. For a multi-user instance behind an identity provider, see [Authentication](authentication.md); the full variable list is in [Configuration](configuration.md).

`jitpackd` handles SIGTERM and shuts the HTTP server down gracefully with a five-second drain, so an ordinary `docker compose down` is a clean stop.

---

## Building from source

You need **Go 1.26 or newer** (`go.mod` declares `go 1.26.0`, which is also what the release image builds on) and, for the client, **Node 24**.

```bash
git clone https://github.com/polandy/JIT-Pack.git
cd JIT-Pack
CGO_ENABLED=0 go build -o jitpackd ./cmd/jitpackd
```

**No C toolchain is required.** The SQLite driver is `modernc.org/sqlite`, a pure-Go implementation, so the build is CGO-free and produces a static binary you can drop on any machine of the same architecture. This was not always true — deviation D-001 in `DEVIATIONS.md` records the earlier CGO driver and its removal on 2026-07-09 — so ignore any older instruction that tells you to install `gcc` or `musl-dev` for the build.

The distinction worth keeping straight: that statement is about the **build**. Running the test suite the way the project does (`go test ./cmd/... ./internal/... -race`) enables the race detector, and Go's race detector requires cgo and a working C linker on the host. The database layer itself needs neither. If you only want the binary, the command above is the whole story.

Run it directly:

```bash
JITPACK_SINGLE_USER=true \
JITPACK_LOCAL_USER_ID=local \
JITPACK_DB_PATH=/var/lib/jitpack/jitpack.db \
JITPACK_WEB_ROOT=/var/lib/jitpack/web \
  ./jitpackd
```

`JITPACK_WEB_ROOT` is the built client (next section). Leave it out and the binary serves the API alone.

### Building the client

The SPA is a normal Vite build in `client/`:

```bash
cd client
npm ci
npm run build
```

The result lands in `client/dist` — plain static files. Point `JITPACK_WEB_ROOT` at that directory (copy it somewhere stable first; a rebuild empties it) and `jitpackd` serves it beside the API. Or hand it to your own web server instead and leave the variable unset — see [If you serve the client yourself](#if-you-serve-the-client-yourself).

You normally do **not** need to configure a backend URL into the build. The lookup order in `client/src/config.ts` is: the URL stored in `localStorage` under `jitpack_server_url` (what the first-launch screen writes when someone picks *Server* and types an address), then a build-time `VITE_API_URL` if one was set, then **the page's own origin**. Since the SPA and the API must share one origin anyway (next section), the default is right for every real deployment, and the first-launch screen comes pre-filled with it. Set `VITE_API_URL=https://…` at build time only if you have a reason to point fresh devices somewhere other than where the app is served from.

### How `jitpackd` serves it

Three rules, so you know what you get and what you would have to reproduce elsewhere:

- **A path naming a file gets that file, or a 404.** A request for `/assets/gone.js` is answered `404`, never with `index.html` — HTML returned where a script was asked for surfaces as a syntax error somewhere unrelated.
- **A path with no extension gets `index.html`.** That is the history fallback the client's routing needs: `/trips/abc123` and the OIDC login's return to `/auth/callback` are client-side routes that exist only inside the app.
- **Only the content-hashed bundles are cached hard.** Files under `/assets/` are immutable for a year because a new build gives them new names; everything else — `index.html`, `sw.js`, the icons — is sent `no-cache`, so a browser revalidates and an upgrade is actually noticed.

The API keeps its own paths: `/api/v1/…`, `/ws` and `/health` are answered by the API whatever the client bundle contains.

### The example stack

The repository ships a complete stack in [`deploy/multi-user/`](https://github.com/polandy/JIT-Pack/tree/main/deploy/multi-user) — one service with the OIDC variables wired through and Traefik labels for the one route it needs. It is the shortest path to a production instance.

It is one container on two networks: the database on a named volume, `internal` for the stack itself and your proxy network for the single router that sends the hostname at it. There is no path splitting to get right, because there is nothing to split it between.

Three things to change before the first `docker compose up -d`:

- **The hostname.** `jitpack.example.com` appears in the router rule; DNS for it must point at this host before your proxy can obtain a certificate.
- **The proxy network.** The compose file expects an existing external network called `proxy` — the one your reverse proxy is already on. Rename it to match yours, or create it with `docker network create proxy`. The `traefik.docker.network` label names the network Traefik should dial; without it, a container on two networks can have the wrong address picked and every request times out.
- **A `.env` beside the compose file**, holding `JITPACK_SESSION_SECRET` (generate once with `openssl rand -hex 32`), the three `JITPACK_OIDC_*` values from [Authentication](authentication.md) and `JITPACK_ADMIN_EMAILS` from [Multi-user Setup](multi-user-setup.md). The compose file refuses to start rather than defaulting them, and the file belongs in no repository.

Not running Traefik? Delete the `labels` block and the `proxy` network, publish the container on a host port instead, and point your proxy at that port. The one requirement either way is the `Host` header, and it is the section below.

One detail worth keeping if you write your own file: `restart: unless-stopped` does more than cover crashes. With OIDC configured, `jitpackd` exits at startup when it cannot reach the identity provider, and after a host reboot the identity provider often comes up later than JIT-Pack. The restart policy is what turns that race into a short retry loop instead of a dead service.

---

## Putting a reverse proxy in front

The container speaks plain HTTP on one port and answers every path the app needs, so a proxy in front of it has one job: terminate TLS for a hostname and forward everything to that port. There is no path splitting, no static file server and no upstream to name twice.

What it must get right is small, and each item is something that fails quietly:

- **Forward the browser's `Host` header, port included.** The WebSocket handshake compares the request's `Origin` against its `Host`, and the browser's `Origin` carries the port. A proxy that rewrites `Host` to the container name turns every dial into a `403` — and so does one that merely drops the port: in nginx that is the difference between `$http_host` (correct) and `$host` (which strips it), so an instance published on, say, `:3000` is refused even though the hostname matched. The failure is the worst kind: the app loads, every REST call succeeds, and only live updates never arrive.
- **Pass the upgrade headers through** (`Upgrade` and `Connection`) and use HTTP/1.1 for `/ws`, or the handshake never completes.
- **Do not cut idle connections quickly.** A sync socket is idle most of the time; nginx's default `proxy_read_timeout` of 60 seconds closes it repeatedly.
- **Keep it one origin.** The API sets no CORS headers at all, so a client served from `https://app.example.com` cannot call an API on `https://api.example.com` — there is no configuration to open that up.

### Traefik

One router, one service, and Traefik forwards the upgrade and preserves the original `Host` without extra configuration:

```yaml
services:
  jitpack:
    image: ghcr.io/polandy/jit-pack:0.4.0
    # unless-stopped also covers the IdP boot race: in the OIDC shape,
    # jitpackd deliberately exits when the issuer is unreachable at
    # startup, and after a host reboot the IdP often comes up later
    # than this container. The restart policy turns that into a short
    # retry loop instead of a dead service.
    restart: unless-stopped
    volumes:
      - jitpack-data:/data
    environment:
      JITPACK_DB_PATH: "/data/jitpack.db"
      # The production shape is multi-user with OIDC — see
      # Configuration for what each value is and Authentication for
      # the IdP side. Values from your secret store, not this file.
      JITPACK_SESSION_SECRET: "…"
      JITPACK_OIDC_ISSUER: "https://auth.example.com"
      JITPACK_OIDC_CLIENT_ID: "jitpack"
      JITPACK_OIDC_CLIENT_SECRET: "…"
      JITPACK_ADMIN_EMAILS: "you@example.com"
    labels:
      traefik.enable: "true"
      traefik.http.routers.jitpack.rule: "Host(`jitpack.example.com`)"
      traefik.http.routers.jitpack.entrypoints: "websecure"
      traefik.http.routers.jitpack.tls.certresolver: "letsencrypt"
      traefik.http.services.jitpack.loadbalancer.server.port: "8080"

volumes:
  jitpack-data:
```

### nginx

If nginx terminates TLS, one location does everything:

```nginx
upstream jitpack {
    server 127.0.0.1:8080;
}

server {
    listen 443 ssl;
    server_name jitpack.example.com;

    ssl_certificate     /etc/letsencrypt/live/jitpack.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jitpack.example.com/privkey.pem;

    location / {
        proxy_pass http://jitpack;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }
}
```

`$connection_upgrade` is not built in; define it once in the `http` block, so ordinary requests are not all told to upgrade:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

If the container runs in Docker on the same network as nginx, replace `127.0.0.1:8080` with the service name, e.g. `server jitpack:8080;`.

### Verifying it

From a machine that can reach the public hostname:

```bash
curl -i https://jitpack.example.com/health
curl -i https://jitpack.example.com/api/v1/auth/config
curl -s https://jitpack.example.com/ | head -1
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Origin: https://jitpack.example.com" \
     https://jitpack.example.com/ws
```

The first returns `200` with an empty body. The second returns JSON on a multi-user instance and `501 not_configured` on a single-user one — either way it proves the API is being reached. The third must be the client's `index.html`. The fourth is the one that fails silently in real use, so it is the one worth running: `101 Switching Protocols` means the socket is routed and the headers survive the proxy.

Send the `Origin` header exactly as written, matching the address you are calling — port included, if you use one. Without it the same-origin check is skipped entirely and the command answers `101` on a proxy that every real browser is refused by. If it comes back `403 request Origin "…" is not authorized for Host "…"`, the two names in that message are the bug: the proxy handed `jitpackd` a `Host` the browser never addressed.

---

## If you serve the client yourself

Leaving `JITPACK_WEB_ROOT` unset turns `jitpackd` back into an API-only server, for the deployment where a CDN or an existing web server already serves static files. Then the split above becomes yours to make, on **one hostname** — the CORS and same-origin rules do not relax.

| Path | Goes to | Why |
|---|---|---|
| `/api/…` | `jitpackd` | The whole REST surface lives under `/api/v1/`. |
| `/ws` | `jitpackd` | The sync WebSocket — **outside** the `/api` tree. |
| `/health` | `jitpackd` | Optional; only needed if you want to probe the backend through the proxy. |
| everything else | static files | The built client, with a fallback to `index.html`. |

!!! warning "`/ws` is the trap"
    The WebSocket is registered at the top level as `GET /ws`, not under `/api/v1/`. A proxy rule that matches only `/api` therefore sends the socket to the *static file server*, which answers with `index.html` — and the failure is quiet and misleading. Every REST call works, the app loads, trips load, and only live updates between devices never arrive. If sync is one-directional-until-reload, check this rule first.

The `Host` and upgrade rules from [the section above](#putting-a-reverse-proxy-in-front) apply unchanged to the backend route. And on the static route: **fall back to `index.html`** for unknown paths, or a hard reload on `/trips/abc123` is a 404 — and so is the OIDC login's return to `/auth/callback`, which fails multi-user login at the last step.

---

## Where the data lives

Everything JIT-Pack stores — trips, items, templates, users, the sync change log, avatars and item images — is in **one SQLite file** at `JITPACK_DB_PATH` (default `jitpack.db` in the working directory; `/data/jitpack.db` in the compose examples above). There is no external database, no cache and no separate uploads directory.

The schema is created automatically the first time the server sees an empty file, and reopening that file afterwards is safe.

**JIT-Pack is pre-1.0 and ships no schema upgrade path.** While the schema is still changing, an image that changed it will refuse a database written by an earlier one rather than upgrade it, and say so on the first lines of the log — see [the schema is stale](troubleshooting.md#store-database-schema-is-stale) for what to do. Export your data before you upgrade the image; [Backup & Export](backup.md) covers how.

One caveat for backups: the database runs in **WAL mode**, so at runtime it is accompanied by `jitpack.db-wal` and `jitpack.db-shm` sidecars. Copying `jitpack.db` alone while the server is running can therefore miss the most recent writes. [Backup & Export](backup.md) covers how to take a consistent copy.

---

## Next steps

- [Getting Started](getting-started.md) — the fastest path to a running instance.
- [Configuration](configuration.md) — every environment variable and what it does.
- [Authentication](authentication.md) — running multi-user with an OIDC identity provider.
