# One image, both halves: the SPA is built here and served by the same process
# that serves the API, so a JIT-Pack instance is a single container on a single
# origin (ADR-043). The API sets no CORS headers on purpose; there being only
# one server is what lets it go without them and without a reverse proxy.
#
# Base images are pinned by digest (supply-chain hardening); the tag is kept
# for readability. Dependabot (docker ecosystem) updates the digest.

# Client build stage — compile the Vue/Ionic SPA to static assets.
#
# The node major must match mise.toml's `node` and ci.yml's `node-version`:
# this stage builds the bundle that ships, and a version nothing else in the
# repo tests with would ship untested. scripts/toolchain-pins-gate.sh enforces
# that — moving the major is one change in all three files.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS client

# The Settings "About" section (M17) names the build. This stage has no
# `.git` (only `client/` is in its context), so the release tag and commit
# come in as build args instead of vite.config.ts's `git describe` fallback.
ARG APP_VERSION=dev
ARG APP_COMMIT=unknown
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${APP_COMMIT}

WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Server build stage — pure-Go modernc.org/sqlite, no C toolchain needed
# (ADR-001).
FROM golang:1.27-alpine@sha256:4c9fe60190a2a3350ddc51de80d0224b8a6698d12bdfc999fee45ea9d6c46dbc AS build

# The server names its own build too (FR-23.8): the release check compares
# this tag against the newest release upstream, and a build that carries no
# tag makes no check. Same arg as the client stage above, declared again
# because ARG scope ends with the stage.
ARG APP_VERSION=dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=0 go build -ldflags="-s -w -X main.version=${APP_VERSION}" -o /jitpackd ./cmd/jitpackd

# Runtime stage
FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

RUN apk add --no-cache ca-certificates wget

COPY --from=build /jitpackd /usr/local/bin/jitpackd
COPY --from=client /app/dist /srv/web

RUN mkdir -p /data

# The bundle is part of the image, so the default points at it. Unsetting it
# turns the container back into the API alone, for a deployment that serves the
# SPA from its own web server or a CDN.
ENV JITPACK_WEB_ROOT=/srv/web

EXPOSE 8080

# The image carries its own readiness probe, so a compose file needs none and
# `depends_on: condition: service_healthy` works out of the box. The short
# start-interval is what lets scripts/docker-smoke.sh wait on docker's own
# health state rather than on a sleep.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --start-interval=1s --retries=3 \
	CMD wget --spider -q http://localhost:8080/health || exit 1

ENTRYPOINT ["jitpackd"]
