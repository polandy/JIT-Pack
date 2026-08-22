# Backup & Export

## Everything is one file

JIT-Pack stores all of its state in **a single SQLite database file** at the path you set
in `JITPACK_DB_PATH` (default `jitpack.db`; the reference Docker setup uses
`/data/jitpack.db` on a mounted volume). There is no second data directory, no object
store, and no separate media folder.

That file holds your trips, items, tags, templates, travelers, containers,
comments, the sync change log, notifications, Web Push subscriptions, accounts, and
active sessions. It also holds every **image** — user avatars and item reference
photos — so backing up the file can never produce a snapshot with a row pointing at
a picture that was not captured.

**Back up that file and you have backed up the instance.** Nothing else on the host is
state; the binary and the environment variables are your configuration.

## Local Mode: there is no file on a host

Local Mode keeps everything in the **browser's own storage** on one device — there is no
`jitpack.db` to copy and no server to ask. Nothing on the host is state, so the whole of
this page except this section is about the server modes.

Back it up from inside the app:

1. Tap the **status glyph** in the top bar — in Local Mode it is a phone icon.
2. The sheet reports how much space the data uses and whether the browser has marked it
   **persistent**. If it has not, the browser is allowed to delete the data when space
   runs short, and that warning is the reason this backup matters.
3. Tap **Back up now**. You get one YAML file — `jitpack-backup-YYYY-MM-DD.yaml` —
   containing every trip and every template on the device, packing progress included.

Restore it through the **document icon** on the Trips screen (portable import): pick the
backup file, and the app lists the documents it holds and imports them together. Items are
matched to what already exists **by name**, so restoring onto a device that still has data
merges rather than duplicates. A document the file no longer holds intact is listed as
*skipped* with the reason, and the rest still import.

Restored trips arrive in **planning** status, and the app takes you straight to the Trips
screen's **Planned** tab when the restore finishes — that is where they are. The *Active*
tab, which the list normally opens on, stays empty until you start a trip.

A trip that was built from groups keeps **following** them after a restore, and the
restore list says so next to it. What you already told a group carries over too: a change
you accepted stays in the trip's change log with the date it happened, and one you
declined is not offered again. A trip restored from an older backup file — one taken
before this existed — starts following its groups from scratch instead, so it may ask
again about a change you have already answered.

The same file is how you move to a server instance: point the app at the server, then
import the backup there through the same screen. Note that the server's own
`/api/v1/*/import` endpoints (below) take **one** document per request — a whole-device
backup goes in through the app, not through `curl`.

!!! warning "The device is the only copy"
    Nothing syncs anywhere in Local Mode. A cleared browser profile, a reset device or a
    browser evicting the storage takes the data with it, and the last backup is what is
    left. The sheet always states how old the last one is, and Settings shows a reminder
    once it is more than 30 days old.

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

### What a scheduled backup must get right

There is no built-in scheduler; recurring backups are your host's job, with whatever
mechanism you already use. Whatever runs it, the requirements are the ones this page
has already laid out — stated once, tool-neutrally:

- **Capture a consistent snapshot of the database**, which at runtime means the
  `.db` file *plus* its `-wal`/`-shm` sidecars — or one of the snapshot methods
  above, which fold the WAL in and produce a single self-contained file. That one
  file is the entire instance: avatars and item images included, nothing else on
  the host is state.
- **Store it away from the original** — a backup on the same disk shares its fate.
- **Remember the version it came from.** A file backup [restores only into the
  JIT-Pack version that wrote it](#restoring), so a retention scheme that outlives
  an upgrade needs the matching image version kept alongside, or a portable YAML
  export taken at upgrade time.
- **Test a restore once.** A backup that has never been restored is a hope, not a
  backup.

### Continuous replication

Because the whole instance is one SQLite file, file-level streaming replication tools such
as [Litestream](https://litestream.io/) work without any support from JIT-Pack. This is an
option you wire up yourself; nothing is built in.

## Restoring

Stop the server, put the backup file in place at `JITPACK_DB_PATH` (removing any leftover
`-wal`/`-shm` sidecars alongside it), and start the server again.

!!! warning "A file backup only restores into the version that wrote it"

    JIT-Pack is pre-1.0 and ships no schema upgrade path. The schema is one
    always-current definition, fingerprinted in `PRAGMA user_version`, and a binary whose
    schema differs [refuses to start](troubleshooting.md#store-database-schema-is-stale)
    rather than upgrading the file. So a `.db` backup restores into **the JIT-Pack version
    it was taken from**, in either direction.

    That is what the [API exports](#getting-data-out-over-the-api) below are for: portable
    YAML and the JSON export survive a schema change, a copy of the file does not. Take one
    before you upgrade the image. This changes at 1.0, when migrations return.

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
    "tags": [ … ],
    "items": [ … ],
    "item_tags": [ … ],
    "templates": [ … ],
    "trips": [ … ],
    "trip_items": [ … ],
    "comments": [ … ],
    "trip_template_sources": [ … ],
    "trip_generated_positions": [ … ],
    "trip_applied_changes": [ … ]
  }
}
```

The last three describe how a trip that is still being planned follows the
templates it was created from: which templates it follows, what the app last
generated for each position, and the changes it has taken over since. They
travel with the trip so that a restored planning trip keeps following its
templates instead of treating every existing row as hand-made.

It is **filtered to the requesting user's visibility**, mirroring the rules the sync feed
uses: instance-wide master data (tags, items and their tag assignments, templates and
their parts) in full,
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

Both trip exports require you to be a member of the trip; anyone else gets
`403 forbidden`, `not a member of this trip`.

### Template export and import

```bash
curl -sOJ https://jitpack.example.com/api/v1/templates/$TEMPLATE_ID/export \
  -H "Authorization: Bearer $TOKEN"
```

The document is `kind: template`, with instance-specific identifiers stripped — items are
carried by name, so a template moves cleanly between instances. A `scope:` line says which
kind of template it is: a `group` (a reusable set of items) or a `template` (a holiday
template composed of groups).

A holiday template carries the groups it is made of **whole**, under `includes:`, together
with each position's preparation tasks — so the file still means something on an instance
that has never seen those groups:

```yaml
kind: template
scope: template
name: Fototage
icon: "📷"
includes:
  - name: Makro Fotografie
    icon: "📷"
    items:
      - name: Kamera
        icon: "📷"
        quantity: 1
        tasks: ["Charge the batteries"]
items:
  - name: First-aid kit
    quantity: 1
```

`icon:` is the optional mark — one emoji, on the template, on each group and on each item.
It is left out where there is none, and a file written before the field existed imports
without one.

**On import, a group of the same name is linked, never overwritten.** The name is how a
group is recognised across instances. If your instance already has a group called
*Makro Fotografie*, the imported template is attached to **yours** and the file's version of
that group is discarded — the file may be older than your group, and a group is shared by
every template that includes it and every trip that follows it. The consequence worth
knowing: an import can give you less than the file described. Rename your own group first if
you want the file's version alongside it.

The same linking applies when you import a **group document** on its own: if a group of that
name is already here, the import lands on it and changes nothing, rather than leaving a
second copy behind. Importing a *holiday template* whose name is taken does create a second
one, suffixed `(import)` — two templates of one name are two different plans.

A group document (`scope: group`) carries no `includes:` — a group is never composed of
other groups.

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
