# One image, both halves: the SPA is built here and served by the same process
# that serves the API, so a JIT-Pack instance is a single container on a single
# origin (ADR-043). The API sets no CORS headers on purpose, which used to make
# a reverse proxy a hard requirement; it is now satisfied by there being only
# one server.
#
# Base images are pinned by digest (supply-chain hardening); the tag is kept
# for readability. Dependabot (docker ecosystem) updates the digest.

# Client build stage — compile the Vue/Ionic SPA to static assets.
#
# The node major must match mise.toml's `node` and ci.yml's `node-version`:
# this stage builds the bundle that ships, and a version nothing else in the
# repo tests with would ship untested. scripts/toolchain-pins-gate.sh enforces
# that — moving the major is one change in all three files.
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS client

WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Server build stage — pure-Go modernc.org/sqlite, no C toolchain needed
# (ADR-001).
FROM golang:1.27-alpine@sha256:4c9fe60190a2a3350ddc51de80d0224b8a6698d12bdfc999fee45ea9d6c46dbc AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /jitpackd ./cmd/jitpackd

# Runtime stage
FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

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
