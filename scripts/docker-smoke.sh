#!/usr/bin/env bash
#
# Starts the published image and checks that one container answers both halves
# of the app (ADR-043): the API's health probe, and the client's index.html at
# the root. Run by the docker-build job in .github/workflows/ci.yml and by
# `make docker-build`.
#
# It exists because "docker build" succeeding says nothing about the bundle:
# a COPY that lands in the wrong place, an unset JITPACK_WEB_ROOT or a client
# build that emitted nothing all produce an image that starts, passes its own
# healthcheck and serves a 404 to every browser.
set -euo pipefail

image="${1:?usage: docker-smoke.sh <image>}"
port="${JITPACK_SMOKE_PORT:-18080}"
name="jitpack-smoke-$$"

cleanup() {
	docker rm -f "${name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "${name}" -p "${port}:8080" \
	-e JITPACK_SINGLE_USER=true \
	-e JITPACK_LOCAL_USER_ID=smoke \
	-e JITPACK_DB_PATH=/data/smoke.db \
	"${image}" >/dev/null

# The container's own HEALTHCHECK is the readiness signal: docker probes it
# every second during the start period, and this loop reads the state it
# reports rather than guessing at a fixed wait. An image without a healthcheck
# never becomes "healthy" and fails on the deadline below, which is the right
# failure for a smoke test whose whole subject is the image.
deadline=$((SECONDS + 60))
until [ "$(docker inspect -f '{{.State.Health.Status}}' "${name}" 2>/dev/null)" = "healthy" ]; do
	sleep 1
	if [ "$(docker inspect -f '{{.State.Running}}' "${name}" 2>/dev/null)" != "true" ]; then
		echo "error: the container exited before becoming healthy" >&2
		docker logs "${name}" >&2 || true
		exit 1
	fi
	if [ "${SECONDS}" -ge "${deadline}" ]; then
		echo "error: the container never became healthy" >&2
		docker logs "${name}" >&2 || true
		exit 1
	fi
done

fail() {
	echo "::error::$1"
	docker logs "${name}" >&2 || true
	exit 1
}

base="http://localhost:${port}"

curl -fsS "${base}/health" >/dev/null || fail "the API's /health did not answer"

# The app itself: the root must be the client's document, not the API's 404.
# Grepping for the mount point rather than for "<html>" — an error page is
# HTML too.
index=$(curl -fsS "${base}/") || fail "the container served no client at /"
grep -q '<div id="app"' <<<"${index}" ||
	fail "/ answered, but with something other than the client's index.html"

# A deep link is a client route, and a hard reload on one has to arrive at the
# app rather than at a 404 — the history fallback, end to end.
curl -fsS "${base}/trips" >/dev/null || fail "a client route did not fall back to index.html"

echo "docker-smoke: ok — ${image} serves /health and the client on one origin"
