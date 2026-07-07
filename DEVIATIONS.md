# Deviations from CODING_PRINCIPLES.md

## D-001: SQLite driver `mattn/go-sqlite3` instead of `modernc.org/sqlite`
The approved pure-Go driver is unreachable from the current build
environment (modernc.org not on the network allowlist; the GitHub mirror
pulls modernc.org transitively). `mattn/go-sqlite3` (CGO) is functionally
equivalent for all store tests. Only `internal/store` imports the driver;
swapping back to `modernc.org/sqlite` for the static release binary is a
one-line change (import + driver name "sqlite" instead of "sqlite3").
