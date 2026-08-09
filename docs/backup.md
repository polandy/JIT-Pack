# Backup & Export

## Everything is one file

JIT-Pack stores all of its state in **a single SQLite database file** at the path you set
in `JITPACK_DB_PATH` (default `jitpack.db`; the reference Docker setup uses
`/data/jitpack.db` on a mounted volume). There is no second data directory, no object
store, and no separate media folder.

That file holds your trips, items, categories, templates, travelers, containers,
comments, the sync change log, notifications, Web Push subscriptions, accounts, and
active sessions. It also holds every **image as a BLOB** — user avatars in the `users`
table and item reference photos in `item_images` — which is a deliberate decision
(see `dev-docs/adr/ADR-002_Avatar_Storage.md`) precisely so that backing up the file can
never produce a snapshot with a row pointing at a picture that was not captured.

**Back up that file and you have backed up the instance.** Nothing else on the host is
state; the binary and the environment variables are your configuration.

## WAL mode: back up all three files, or use a proper snapshot

The schema enables write-ahead logging (`PRAGMA journal_mode = WAL`), and that setting is
stored in the database file itself, so it stays in force across restarts. In practice this
means two sidecar files sit next to your database while the server runs:

```
/data/jitpack.db
/data/jitpack.db-wal
/data/jitpack.db-shm
```

Recently committed transactions may live only in the `-wal` file until a checkpoint folds
them back into the main file.

!!! warning
    Copying `jitpack.db` on its own while the server is running can silently give you a
    stale or torn backup — the committed writes still sitting in the WAL are simply not
    in it.

Pick one of these instead.

### Online snapshot with the `sqlite3` CLI (recommended)

`.backup` takes a consistent snapshot of a live database and folds the WAL in for you, so
the result is a single self-contained file:

```bash
sqlite3 /data/jitpack.db ".backup '/backups/jitpack-$(date +%F).db'"
```

`VACUUM INTO` is an equally safe alternative and additionally compacts the result:

```bash
sqlite3 /data/jitpack.db "VACUUM INTO '/backups/jitpack-$(date +%F).db'"
```

If your database lives inside a container, run the command in the container (or against
the bind-mounted path on the host).

### Cold copy

Stop the server first, then copy the file. A clean shutdown checkpoints and removes the
sidecars, so a single file is all you need:

```bash
docker compose stop app
cp /data/jitpack.db /backups/jitpack-$(date +%F).db
docker compose start app
```

If you copy without stopping the server, copy **all three** files (`.db`, `.db-wal`,
`.db-shm`) together — and prefer one of the snapshot commands above, which does not
depend on getting that right.

### Continuous replication

Because the whole instance is one SQLite file, file-level streaming replication tools such
as [Litestream](https://litestream.io/) work without any support from JIT-Pack. This is an
option you wire up yourself; nothing is built in.

## Restoring

Stop the server, put the backup file in place at `JITPACK_DB_PATH` (removing any leftover
`-wal`/`-shm` sidecars alongside it), and start the server again. Migrations are applied
on open and tracked in `PRAGMA user_version`, so restoring a database taken from an older
version and starting a newer binary upgrades the schema on the way up. Going the other
direction — an older binary on a newer database — is not supported.

There is no restore endpoint and no scheduled-backup feature; scheduling is your host's
job (a cron job or systemd timer around one of the commands above).

## Getting data out over the API

The export endpoints are a **convenience for moving data around**, not a substitute for
backing up the file. None of them include images, and the JSON export deliberately omits
accounts.

All of them require a bearer token.

| Method | Path | Produces |
|---|---|---|
| `GET` | `/api/v1/export/full` | versioned JSON dump of everything you can see |
| `GET` | `/api/v1/trips/{tripID}/export.yaml` | portable trip YAML, without packing progress |
| `GET` | `/api/v1/trips/{tripID}/export.csv` | flat CSV of the packing list, with progress |
| `GET` | `/api/v1/templates/{templateID}/export` | portable template YAML |
| `POST` | `/api/v1/trips/import` | imports a trip YAML document |
| `POST` | `/api/v1/templates/import` | imports a template YAML document |

### Full JSON export

```bash
curl -sOJ https://jitpack.example.com/api/v1/export/full \
  -H "Authorization: Bearer $TOKEN"
```

The response is served as an attachment named `jitpack-export.json`, shaped like this:

```json
{
  "version": 1,
  "exported_at": "2026-08-09T07:41:02Z",
  "data": {
    "categories": [ … ],
    "items": [ … ],
    "templates": [ … ],
    "trips": [ … ],
    "trip_items": [ … ],
    "comments": [ … ]
  }
}
```

It is **filtered to the requesting user's visibility**, mirroring the rules the sync feed
uses: instance-wide master data (categories, items, templates and their parts) in full,
and trip-scoped rows only for trips you are a member of, series only for those you own.
An admin's export is therefore not an instance-wide dump either — it is that admin's view.

Accounts, avatars, item images, sessions, notifications, and push subscriptions are **not**
in it. There is no import counterpart. Treat it as a data-portability artifact; the file
backup is the real backup.

### Per-trip export

The **YAML** form is the round-trippable one — it is the same portable format the import
endpoint accepts, and it deliberately leaves packing progress out so the export reads as a
clean list:

```bash
curl -sOJ https://jitpack.example.com/api/v1/trips/$TRIP_ID/export.yaml \
  -H "Authorization: Bearer $TOKEN"
```

```yaml
kind: trip
schema_version: 1
name: Norway 2026
start_date: "2026-06-01"
end_date: "2026-06-14"
travelers:
  - name: Alice
    profile: adult
containers:
  - name: Big duffel
    carrier: Alice
items:
  - name: Rain jacket
    quantity: 1
    category: Clothing
    traveler: Alice
    container: Big duffel
```

The file is served as an attachment named after the trip. A missing trip answers `404`
with code `not_found`.

The **CSV** form is the flat dump, and it *does* carry packing progress. It is not
round-trippable — there is no CSV import:

```bash
curl -sOJ https://jitpack.example.com/api/v1/trips/$TRIP_ID/export.csv \
  -H "Authorization: Bearer $TOKEN"
```

```csv
item,category,quantity,packed_count,mode,traveler,container
Rain jacket,Clothing,1,1,carry,Alice,Big duffel
```

!!! warning "Known gap — do not rely on this"
    The **CSV** endpoint requires you to be a member of the trip (`403 forbidden`,
    `not a member of this trip`, otherwise). The **YAML** endpoint checks only that the
    request carries a valid token, so any account on the instance can export any trip if
    it knows the trip id. This is an inconsistency in the route wiring rather than an
    intended capability, and it will be closed — treat the YAML endpoint as
    member-only when deciding who gets an account.

### Template export and import

```bash
curl -sOJ https://jitpack.example.com/api/v1/templates/$TEMPLATE_ID/export \
  -H "Authorization: Bearer $TOKEN"
```

The document is `kind: template`, with instance-specific identifiers stripped — items are
carried by name, so a template moves cleanly between instances.

Import posts the YAML document as the request body:

```bash
curl -s -X POST https://jitpack.example.com/api/v1/templates/import \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary @my-template.yaml
```

```json
{"ok": true, "template_id": "a41d…"}
```

Trip import works identically at `/api/v1/trips/import` and returns `trip_id`. Items are
matched to master items **by name**, and any name that does not exist yet is created. The
importing user owns the result.

Both import endpoints:

- read at most **1 MB** of request body,
- reject a document whose `kind` does not match the endpoint with `422` and code
  `validation` (`expected kind: trip` / `expected kind: template`),
- reject malformed YAML with `422` and code `validation`,
- ignore fields they do not recognise, so a document from a newer version still imports.

If an export or import fails unexpectedly, [Troubleshooting](troubleshooting.md) lists the
error codes.
