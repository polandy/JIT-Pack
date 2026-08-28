# Build stage — pure-Go modernc.org/sqlite, no C toolchain needed (ADR-001).
# Base images are pinned by digest (supply-chain hardening); the tag is kept
# for readability. Dependabot (docker ecosystem) updates the digest.
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

RUN mkdir -p /data

EXPOSE 8080

ENTRYPOINT ["jitpackd"]
