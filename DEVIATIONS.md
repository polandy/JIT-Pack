# Deviations from CODING_PRINCIPLES.md

## D-001: SQLite driver `mattn/go-sqlite3` instead of `modernc.org/sqlite` — RESOLVED
Originally the approved pure-Go driver was unreachable from the build
environment (modernc.org not on the network allowlist), so the CGO driver
`mattn/go-sqlite3` was used. Resolved 2026-07-09: switched to
`modernc.org/sqlite` (driver name "sqlite"), `CGO_ENABLED=0` build restored,
Dockerfile no longer installs a C toolchain. No open deviations remain.
