# Build stage — pure-Go modernc.org/sqlite, no C toolchain needed (ADR-001).
FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /jitpackd ./cmd/jitpackd

# Runtime stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget

COPY --from=build /jitpackd /usr/local/bin/jitpackd

RUN mkdir -p /data

EXPOSE 8080

ENTRYPOINT ["jitpackd"]
