# Installation

JIT-Pack ships as two separate pieces:

- **`jitpackd`** — the Go backend. It serves the JSON API, the sync WebSocket and a health endpoint, and stores everything in one embedded SQLite file. It is a single static binary with no runtime dependencies.
- **The client** — a Vue 3 single-page app. It is built to static files and served by whatever already serves static files for you: your reverse proxy, an nginx container, a CDN, anything.

!!! warning "`jitpackd` serves no static files"
    The backend has exactly three route prefixes — `/api/v1/…`, `/ws` and `/health`. There is no HTML, no `index.html`, no asset handler. Pointing a browser at the backend port gets you a 404, not the app. Serving the SPA is always the reverse proxy's job, and [that setup](#serving-the-spa-behind-a-reverse-proxy) is the part worth reading carefully.

If you just want an instance running on your laptop to look at, follow the [Getting Started walkthrough](getting-started.md) instead — it uses the repository's own compose stack and skips everything below.

---

## Docker

Two images are published on every `v*` tag:

```
ghcr.io/polandy/jit-pack          # the backend, jitpackd
ghcr.io/polandy/jit-pack-client   # the SPA + nginx, ready to sit in front of it
```

The backend image is built from the repository root `Dockerfile`: a `CGO_ENABLED=0` build of `./cmd/jitpackd` copied into Alpine, entrypoint `jitpackd`, `EXPOSE 8080`, with an empty `/data` directory prepared for the database. The client image is covered [below](#the-client-image).

```yaml
services:
  jitpack:
    image: ghcr.io/polandy/jit-pack:0.2.0
    restart: unless-stopped
    volumes:
      - jitpack-data:/data
    environment:
      JITPACK_LISTEN: ":8080"
      JITPACK_DB_PATH: "/data/jitpack.db"
      JITPACK_SINGLE_USER: "true"
      JITPACK_LOCAL_USER_ID: "local"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s

volumes:
  jitpack-data:
```

Notes on that file:

- **Pin a version tag.** `latest` exists, but it moves with every release — check the [Releases page](https://github.com/polandy/JIT-Pack/releases) for the current version. To freeze the deployment completely, pin the digest as well (`docker buildx imagetools inspect ghcr.io/polandy/jit-pack:0.2.0` prints it; then `image: ghcr.io/polandy/jit-pack:0.2.0@sha256:…`). [Upgrades](upgrades.md) explains when that matters.
- **`wget` is in the image** (the Dockerfile installs it alongside `ca-certificates`), which is what makes the healthcheck above work without adding anything.
- **No published port.** Nothing outside needs to reach `8080` directly — the reverse proxy does, over the Docker network. Add `ports:` only if you are debugging.
- **The volume must survive recreation.** `/data` holds the database; without the volume, every `docker compose up` starts an empty instance.
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
  ./jitpackd
```

### Building the client

The SPA is a normal Vite build in `client/`:

```bash
cd client
npm ci
npm run build
```

The result lands in `client/dist` — plain static files. Copy that directory to wherever your web server serves from, or bake it into an image (the repository's `client/Dockerfile` does exactly that with nginx).

You normally do **not** need to configure a backend URL into the build. The lookup order in `client/src/config.ts` is: the URL stored in `localStorage` under `jitpack_server_url` (what the first-launch screen writes when someone picks *Server* and types an address), then a build-time `VITE_API_URL` if one was set, then **the page's own origin**. Since the SPA and the API must share one origin anyway (next section), the default is right for every real deployment, and the first-launch screen comes pre-filled with it. Set `VITE_API_URL=https://…` at build time only if you have a reason to point fresh devices somewhere other than where the app is served from.

### The client image

`ghcr.io/polandy/jit-pack-client` is that build baked into nginx, with [a config](https://github.com/polandy/JIT-Pack/blob/main/client/nginx.conf) that already implements the whole routing table below: it serves the SPA with the `index.html` fallback and proxies `/api/`, `/ws` (upgrade headers included) and `/health` to the backend. It is built **without** `VITE_API_URL`, so the app talks to whatever origin serves it — which is exactly the same-origin shape the backend requires.

Two things to know before using it:

- **It expects the backend at `app:8080`.** The nginx upstream is hard-wired to the hostname `app`, so name the backend service `app` on the shared Docker network — or mount your own config over `/etc/nginx/conf.d/default.conf`.
- **It listens on plain HTTP (port 80).** TLS termination stays with your reverse proxy, which only needs to forward everything for the hostname to this container, preserving `Host`.

The repository ships a complete stack in [`deploy/multi-user/`](https://github.com/polandy/JIT-Pack/tree/main/deploy/multi-user) — the backend and this client image, with the OIDC variables wired through and Traefik labels for the one route it needs. If you deploy with the client image, that example is the shortest path and you can skip hand-writing the routing rules below.

---

## Serving the SPA behind a reverse proxy

The whole app should live on **one origin**: the SPA's static files and the API answer on the same scheme, host and port. Two independent reasons make this the supported layout rather than a preference:

- **The API sets no CORS headers at all.** A browser on `https://app.example.com` calling an API on `https://api.example.com` will be blocked, and there is no configuration to open that up.
- **The sync WebSocket enforces same-origin on the handshake.** `jitpackd` accepts WebSocket connections with the library's default options, which authorize only an `Origin` whose host matches the request host; anything else is answered with `403`.

So the proxy owns one hostname and splits it: API paths to `jitpackd`, everything else to the static files.

### The routing table

| Path | Goes to | Why |
|---|---|---|
| `/api/…` | `jitpackd` | The whole REST surface lives under `/api/v1/`. |
| `/ws` | `jitpackd` | The sync WebSocket — **outside** the `/api` tree. |
| `/health` | `jitpackd` | Optional; only needed if you want to probe the backend through the proxy. |
| everything else | static files | The built SPA, with a fallback to `index.html`. |

!!! warning "`/ws` is the trap"
    The WebSocket is registered at the top level as `GET /ws`, not under `/api/v1/`. A proxy rule that matches only `/api` therefore sends the socket to the *static file server*, which answers with `index.html` — and the failure is quiet and misleading. Every REST call works, the app loads, trips load, and only live updates between devices never arrive. If sync is one-directional-until-reload, check this rule first.

Two more requirements on the backend route:

- **Pass the upgrade headers through** (`Upgrade` and `Connection`) and use HTTP/1.1 for `/ws`, or the handshake never completes.
- **Preserve the browser's `Host` header.** The same-origin check compares the request's `Origin` against its `Host`; a proxy that rewrites `Host` to the backend's container name turns every WebSocket dial into a `403`.

And one on the static route: **fall back to `index.html`** for unknown paths. The client uses HTML5 history routing, so deep links like `/trips/abc123` or `/tabs/settings` must return the app rather than a 404 on a hard reload. This matters beyond bookmarks — the OIDC login flow returns the browser to `/auth/callback`, a client-side route that only exists inside the SPA. Without the fallback, multi-user login fails at the last step with a 404.

### Traefik

Two routers on the same hostname, distinguished by priority: the specific one claims the API paths, the catch-all takes the rest.

```yaml
services:
  jitpack:
    image: ghcr.io/polandy/jit-pack:0.2.0
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
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
    labels:
      traefik.enable: "true"
      traefik.http.routers.jitpack-api.rule: "Host(`jitpack.example.com`) && (PathPrefix(`/api`) || Path(`/ws`))"
      traefik.http.routers.jitpack-api.entrypoints: "websecure"
      traefik.http.routers.jitpack-api.tls.certresolver: "letsencrypt"
      traefik.http.routers.jitpack-api.priority: "100"
      traefik.http.services.jitpack-api.loadbalancer.server.port: "8080"

  jitpack-web:
    image: nginx:1.29-alpine
    restart: unless-stopped
    volumes:
      - ./dist:/usr/share/nginx/html:ro
      - ./spa.conf:/etc/nginx/conf.d/default.conf:ro
    labels:
      traefik.enable: "true"
      traefik.http.routers.jitpack-web.rule: "Host(`jitpack.example.com`)"
      traefik.http.routers.jitpack-web.entrypoints: "websecure"
      traefik.http.routers.jitpack-web.tls.certresolver: "letsencrypt"
      traefik.http.routers.jitpack-web.priority: "1"
      traefik.http.services.jitpack-web.loadbalancer.server.port: "80"

volumes:
  jitpack-data:
```

`./dist` is the `client/dist` you built above, and `./spa.conf` only needs the `try_files` fallback:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

The **priority** is what makes this work. Traefik ranks routers by rule length when priorities are equal, and a bare `Host(...)` rule can otherwise win over the compound one — sending `/api` requests into the static server. Set both priorities explicitly rather than relying on the default ordering. Traefik needs no extra configuration for the WebSocket: it forwards the upgrade automatically and preserves the original `Host`.

To reach the backend's health endpoint from outside, extend the API rule with a third alternative:

```
Host(`jitpack.example.com`) && (PathPrefix(`/api`) || Path(`/ws`) || Path(`/health`))
```

### nginx (single server block)

If nginx terminates TLS and serves the files itself, one server block does everything:

```nginx
upstream jitpack_backend {
    server 127.0.0.1:8080;
}

server {
    listen 443 ssl;
    server_name jitpack.example.com;

    ssl_certificate     /etc/letsencrypt/live/jitpack.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jitpack.example.com/privkey.pem;

    root /var/www/jitpack;   # the contents of client/dist
    index index.html;

    # SPA history routing: unknown paths return the app, not a 404.
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://jitpack_backend;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # The sync WebSocket — a separate location, outside /api/.
    location /ws {
        proxy_pass http://jitpack_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
        proxy_read_timeout 3600s;
    }

    location /health {
        proxy_pass http://jitpack_backend;
    }
}
```

The long `proxy_read_timeout` on `/ws` keeps idle sync connections from being cut every 60 seconds, which is nginx's default.

If the backend runs in Docker on the same network as nginx, replace `127.0.0.1:8080` with the service name, e.g. `server jitpack:8080;`.

### Verifying the split

From a machine that can reach the public hostname:

```bash
curl -i https://jitpack.example.com/health
curl -i https://jitpack.example.com/api/v1/auth/config
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     https://jitpack.example.com/ws
```

The first returns `200` with an empty body. The second returns JSON on a multi-user instance and `501 not_configured` on a single-user one — either way it proves the API route reaches `jitpackd`. The third must **not** return HTML: `101 Switching Protocols` means the route is correct, and a `400` or `403` from the Go server is still evidence the request arrived. An `index.html` body means `/ws` is being served by the static host and sync will silently never work.

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
