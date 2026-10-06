# CLAUDE.md — the Go backend (`internal/`)

The detail of the root `CLAUDE.md`'s rules that only the backend has to know. The root file still holds every invariant
in short form; this one is what you need open while changing code below `internal/` or `cmd/`.

## Invariant 2 — a schema change carries a migration (ADR-067)

`internal/store/schema.sql` stays the whole schema, always current, and is what a **fresh** database is built from; an
existing one is carried forward by the additive `internal/store/migrations/NNN_*.sql` chain, applied at `Open`, one
transaction per step. A schema change is therefore **two edits**, and `TestSchemaChain_EndsWhereSchemaSQLDoes` proves
the two end at the same database, column for column — order excepted, since `ALTER TABLE ADD COLUMN` appends where
`schema.sql` declares in place.

**The level lives in `schema_meta`**, with `PRAGMA user_version` as a readable mirror: a hash and a counter must not
share one field, and the migration era left levels 1–23 behind that would read as either. A database from before the
chain is placed by its **release fingerprint** (v0.16.0 is the first one listed); anything else — an unknown
fingerprint, a migration-era level, a level from a newer build — is refused with `ErrSchemaStale` naming the path,
never guessed. **Nothing is recreated or deleted on start-up**, and a development database survives a schema change.

Two schema PRs in flight collide on the migration *number*: git merges two `NNN_*.sql` files side by side without a
word. Whoever merges second renumbers.

## Invariant 3 — the client's identity claims are never trusted

The server stamps actor columns itself. Which columns a table owns is declared once, as `serverOwned` on its
`tableSpec` (`internal/store/tables.go`, rules in `stamp.go`); the store's write pipeline strips them from every
mutation and stamps them back from the actor before the scope rule runs — on a push of either partition and on a
conflict revert alike. Among them: comment `author_id` and the task's resolution record, `note_acks.user_id`
(FR-7.9), an idea's, its discussion's and a day entry's `author_id` and `idea_votes.user_id` (§3.29), the packing
claim and record and the purchase record, the master creator columns (`owner_id`, `created_by`).
`TestServerOwned_NoForgedValueSurvives_Invariant3` sweeps every table. Outside the sync envelope: a shared position's
`user_id` and `at` on the WebSocket (FR-29.19). `packer_user_id` is deliberately *not* stamped: since FR-25.19 it is
the assignment. A client placeholder like `'current-user'` must never reach a foreign key. Clients can never grant `owner`, and the
trip creator's membership row is immutable — `trip_members`' write guard.

Every table's write rule is its `tableSpec.guard` (`guard.go`), run after the stamp step and, on the trip partition,
after the membership check; a table that needs none declares `unguarded` with the reason beside it, and
`TestEverySpecDeclaresAWriteGuard` refuses a spec that declares nothing.

## Invariant 6 — binary uploads stay outside the sync envelope (ADR-002)

Only `items.image_hash` flows through the master feed. The 150 KB / JPEG limit is enforced at handler, store and CHECK
constraint — three layers on purpose. An idea's pictures follow the same split with their own 500 KB, but are the
trip's: the upload writes their `idea_images` row, and the bytes are read through the trip's membership (FR-29.5,
ADR-081). An idea's GPX file does too, at 5 MB, its `idea_tracks` row carrying what the device read from it (FR-29.17,
ADR-085), and an excursion's in `excursion_tracks` (FR-31.15, ADR-089).

## Go tests

- **Naming as specification** — `TestMerge_PackedBeatsPackingNow_RegardlessOfHLC`; carry the FR/NFR id.
- **Table-driven** with named `t.Run` subtests for domain logic.
- **Real in-memory SQLite** for store and api tests — never a mocked database. Hand-written fakes behind small
  consumer-side interfaces; no mocking frameworks.
- **Always `-race`** — `make test` does; `go test ./...` from the root does not stay inside `GO_PKGS` (see the root file).

## Packages

- `cmd/jitpackd` — wiring only: env-parsed `Config` → one `api.Options`, graceful shutdown. No logic.
- `internal/sync` — HLC generator + field-level merge (NFR-4.2a). Pure, zero I/O, zero internal imports.
- `internal/wiregen` — `wire.go` → the client's `types.ts` and `routes.ts` (ADR-026/027). Pure leaf: `go/ast` in, string
  out. `cmd/wiregen` is the thin main.
- `internal/store` — the only package importing `database/sql`. SQLite repositories, change/conflict logs, the two sync
  partitions (master; trip), the schema and its migration chain (ADR-067).
- `internal/linkpreview` — FR-29.16: reads a pasted link's page for its title, description, picture and links
  (FR-29.18), through a dialer that admits public addresses on 80/443 only (ADR-082). Standard library only, a leaf —
  the one place the server fetches an address a user chose.
- `internal/webui` — serves the built client beside the API on one origin (ADR-043). Standard library only; does
  **not** import `internal/api` (prefixes are passed in).
- `internal/api` — HTTP handlers, WebSocket hub, session auth + OIDC broker (ADR-007), notifications, Web Push, admin,
  export. **`wire.go` is the contract** — envelopes, frame, conflict shapes, error vocabulary, routes. **Export only** —
  importing is the client's (invariant 4, ADR-025).
