# Implementation log

What has been built, in the order it was built, with the reasoning decided
along the way. This is **history**: append to it, don't restructure it.

`CLAUDE.md` is the orientation document — what the project is, where things
live, and the invariants that must hold. It deliberately no longer carries this
log, because a file that grows with every shipped feature stops working as the
thing you read first. If something recorded here is still load-bearing for
_future_ work, it belongs in `CLAUDE.md`'s invariants or in an ADR as well —
this log alone is not where a binding rule should live.

## What earns an entry

The log is now large enough that writing everything makes it unreadable, so an
entry has to earn its place. **If the diff and the commit message tell the same
story, don't write one** — the code is a better account of what was built than a
paragraph restating it, and it cannot drift.

Write the entry when the work produced something the code cannot show:

- an **option that was weighed and rejected**, and what it cost to reject it —
  otherwise the next person reopens a settled question;
- a **premise that turned out to be wrong** — a diff shows the fix, never the
  belief that made the bug possible;
- a **cost knowingly accepted** — an unrecorded deliberate regression reads as a
  defect and gets "fixed";
- a **trap with a price attached** — the measurement, the framework behaviour, the
  ordering that has to hold;
- **who decided what, and on what evidence** — owner calls, rendered variant
  rounds, measurements.

An ADR is the better home when the tradeoff is _load-bearing for future work_
(`adr/README.md` decides); the log holds the narrative around it. New entries go
at the bottom, and **get a line in the index below** — `scripts/log-index-gate.mjs`
(`make ci`, CI client job) fails the build for a section the index does not name,
because the index is read _instead of_ this file and an unlisted section is
unreachable.

## Deviations

None open. D-001 (CGO SQLite driver) was resolved 2026-07-09: `internal/store` now uses the pure-Go `modernc.org/sqlite`, builds with `CGO_ENABLED=0`, and the Dockerfile needs no C toolchain. History in `DEVIATIONS.md`.

## Files

One file per week, named by its Monday, each opening with the index of its own sections.
**Search the index lines, do not read a file to find something:**
`grep -h "^- \[" dev-docs/implementation-log/*.md | grep -i <word>` names the section, and the file
that holds it is the one `grep -l` returns. Then read that section alone.

**A new entry goes at the bottom of the current week's file** — the newest one, or a new file named by
this week's Monday — and gets a line in that file's index.

| Week of | Sections |
|---|---|
| [`2026-08-03`](2026-08-03.md) | 9 |
| [`2026-08-10`](2026-08-10.md) | 35 |
| [`2026-08-17`](2026-08-17.md) | 59 |
| [`2026-08-24`](2026-08-24.md) | 69 |
| [`2026-08-31`](2026-08-31.md) | 78 |
| [`2026-09-07`](2026-09-07.md) | 44 |
| [`2026-09-14`](2026-09-14.md) | 37 |
| [`2026-09-21`](2026-09-21.md) | 34 |
| [`2026-09-28`](2026-09-28.md) | 5 |
