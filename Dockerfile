# Build stage — CGO required for mattn/go-sqlite3 (deviation D-001).
# Switch to a scratch-based build once modernc.org/sqlite replaces it.
FROM golang:1.22-alpine AS build

RUN apk add --no-cache gcc musl-dev

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o /jitpackd ./cmd/jitpackd

# Runtime stage
FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget

COPY --from=build /jitpackd /usr/local/bin/jitpackd

RUN mkdir -p /data

EXPOSE 8080

ENTRYPOINT ["jitpackd"]
