#!/usr/bin/env bash
#
# Runs `make ci`'s targets one after another and prints one line per target;
# a failing target's output is printed in full, and the run stops there, as
# `make ci` itself does.
#
# Why: a green `make ci` is some 40 KB of output — npm's install report, every
# gate's "ok", the vitest file list, the bundle table — and none of it says
# anything a single "ok" does not. The reader of that output is usually an
# agent, which pays for every line of it on every run. A failure is the one
# case where the detail matters, so it is the one case where it is shown; the
# logs of the green targets stay on disk for anyone who wants them.
#
# `make ci V=1` streams everything instead, exactly as before.
#
# Usage (from the Makefile): MAKE=make scripts/ci-quiet.sh <target>...
set -uo pipefail

MAKE=${MAKE:-make}

# A failure longer than this is printed from its tail, where test runners and
# compilers put the verdict; the full log is named beneath it.
TAIL_LINES=150

logs=$(mktemp -d "${TMPDIR:-/tmp}/jitpack-ci.XXXXXX")
total=$SECONDS

for target in "$@"; do
  start=$SECONDS
  log="$logs/$target.log"
  if "$MAKE" --no-print-directory "$target" >"$log" 2>&1; then
    printf 'ok    %-12s %4ss\n' "$target" $((SECONDS - start))
    continue
  fi
  printf 'FAIL  %-12s %4ss\n\n' "$target" $((SECONDS - start))
  lines=$(wc -l <"$log")
  if [ "$lines" -gt "$TAIL_LINES" ]; then
    echo "… last $TAIL_LINES of $lines lines:"
    tail -n "$TAIL_LINES" "$log"
  else
    cat "$log"
  fi
  echo
  echo "make ci: '$target' failed — full log: $log"
  exit 1
done

echo "make ci: all $# targets green in $((SECONDS - total))s (logs: $logs)"
