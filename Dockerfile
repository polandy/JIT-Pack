# Build stage — pure-Go modernc.org/sqlite, no C toolchain needed (ADR-001).
# Base images are pinned by digest (supply-chain hardening); the tag is kept
# for readability. Dependabot (docker ecosystem) updates the digest.
FROM golang:1.26-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /jitpackd ./cmd/jitpackd

# Runtime stage
FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

RUN apk add --no-cache ca-certificates wget

COPY --from=build /jitpackd /usr/local/bin/jitpackd

RUN mkdir -p /data

EXPOSE 8080

ENTRYPOINT ["jitpackd"]
