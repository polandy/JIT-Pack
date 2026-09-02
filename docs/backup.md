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
   containing every trip and every template on the device, packing progress included —
   what is packed, and which shopping list a bought item came from, so the shopping
   screen's *bought* reveal still finds it after a restore.

Restore it through the **document icon** on the Trips screen (portable import): pick the
backup file, and the app lists the documents it holds and imports them together. Items are
matched to what already exists **by name**, so restoring onto a device that still has data
merges rather than duplicates. A document the file no longer holds intact is listed as
*skipped* with the reason, and the rest still import.

Restored trips come back **in the status they were saved in** — an archived trip is
archived again, a running one is running — and the app takes you straight to the tab where
they are, so a restore never finishes on an empty list. An item that a trip took from your
inventory comes back as an inventory item, with its icon and the tags it was filed under; a
tag the device already has is reused rather than duplicated. Something you typed straight
onto a trip stays where it was, on the trip, and does not appear in your inventory.

A backup taken with an older version of the app carries no status, and its trips arrive in
**planning** as they always did.

**What you already have is not added a second time.** A trip is recognised by its **year
and its name**, a template and a group by their **name**, so restoring the same file twice —
or restoring a newer backup that overlaps an older one — leaves you with one of each. The
restore list marks such a document *Schon vorhanden* before you press the button, and after
the import the app tells you how many it left alone. That means a restore is safe to repeat
when you are not sure the last one finished.

The flip side is worth knowing before it surprises you: if you have **two different trips
with the same name in the same year** — or two different templates of one name — only the
first can be imported. Give one of them a different name in the file, and both come in. And
if you rename a trip in the app, a backup that still holds the old name will restore it
again as a second trip.

A trip that was built from groups keeps **following** them after a restore, and the
restore list says so next to it. What you already told a group carries over too: a change
you accepted stays in the trip's change log with the date it happened, and one you
declined is not offered again. A trip restored from an older backup file — one taken
before this existed — starts following its groups from scratch instead, so it may ask
again about a change you have already answered.

### Moving to a server

The same file is how you move to a server instance, and the app walks you through it on
the **Settings** screen, in the card *Move to a server* at the end of the data section:

1. **Download a backup.** The same whole-device file as the status glyph's.
2. **Connect to a server.** The field is pre-filled with the address the app is running
   from, which is the right one for a self-hosted instance. The button stays disabled — and
   says why — while anything on the device is newer than the last backup, so take the
   backup right before you switch. Confirming reloads the app in Server Mode; on an
   instance with login you sign in first.
3. **Restore the backup.** A bar under the app bar asks you to finish the move: *Restore*
   opens the import screen for the file from step 1, and once it is imported the bar is
   gone. *Skip* is for starting fresh on the server — the app asks once, and your data
   then lives only in the file.

The data in the browser is left where it was. Server Mode never reads it, so it cannot get
mixed up with what is on the server; it simply stays until you clear the site's data.

You can also feed the file in from a shell with the
[import command](#importing-yaml-from-the-command-line) below.

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

## Importing a spreadsheet you already keep

Most people arrive with years of packing history in one spreadsheet: rows are items,
columns are trips, cells are amounts. The **spreadsheet import** — the upload icon on the
Trips screen, and the button on the Items screen while your inventory is still empty —
reads exactly that shape. Export your sheet as
**CSV** (comma, semicolon and tab all work) and paste it in or pick the file.

The wizard reads the sheet's own layout and shows you what it found, so you correct rather
than describe:

- **Two header rows are fine.** A sheet that writes the year above the trip's name gives
  each column both — the name it is called by and the date it is filed under. A single
  header row of years still works; the trips are then named by their year.
- **Categories may be a column or a row.** If the category sits in its own column beside
  the item and is only written where it changes, say so with the *Category column* picker —
  it is carried down until the next one. If instead the category is a heading row spanning
  the sheet, leave the picker on *None* and tick those rows under *Category rows*.
- **A column the sheet never named is not imported unless you name it.** Every other column
  is preselected.
- **A thing listed twice is imported once.** If the same name appears under two
  categories, you get one item — filed under the first — and where both rows give an
  amount for the same trip, the larger one is kept.
- **A sheet with no trips in it at all is fine.** If your file is just a list of things —
  categories and item names, no amounts — import it as it is: you get the inventory and no
  trip, and the app takes you to the Items screen where the result is.

Each imported column becomes an **archived** trip in the year its header gives, with the
amounts recorded as packed, and the app lands you on the Archived tab where they are.
Items are matched against your inventory by name, with a merge prompt for near-misses, and
the category becomes the item's tag. An item name ending in `?` is imported without the
question mark and gets an open task on that trip, which is how those sheets usually mark
"check this before leaving".

## Getting data out over the API

The export endpoints are a **convenience for moving data around**, not a substitute for
backing up the file. None of them include images, and the JSON export deliberately omits
accounts.

All of them require a bearer token.

| Method | Path | Produces |
|---|---|---|
| `GET` | `/api/v1/me/export.json` | versioned JSON dump of everything you can see |
| `GET` | `/api/v1/trips/{tripID}/export.csv` | flat CSV of the packing list, with progress |

### Full JSON export

```bash
curl -sOJ https://jitpack.example.com/api/v1/me/export.json \
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

### Per-trip export (CSV)

The per-trip **CSV** is a flat dump for a spreadsheet, and it carries packing progress. It
is not round-trippable — there is no CSV import, and the round-trippable form is the
portable YAML you export **in the app** (see [Portable YAML](#portable-yaml-is-written-by-the-app)):

```bash
curl -sOJ https://jitpack.example.com/api/v1/trips/$TRIP_ID/export.csv \
  -H "Authorization: Bearer $TOKEN"
```

```csv
item,category,quantity,packed_count,mode,traveler,container
Rain jacket,Clothing,1,1,carry,Alice,Big duffel
```

It requires you to be a member of the trip; anyone else gets `403 forbidden`,
`not a member of this trip`.

### Portable YAML is written by the app

The **portable YAML** format — one template or one trip, environment-agnostic, meant to be
read and hand-edited — is not served by the instance. There is no
`/api/v1/templates/{id}/export` and no `/api/v1/trips/{id}/export.yaml`; you export a
template or a trip **in the app**, from the list screen, and a whole device from
**Settings → Backup**.

The reason is worth knowing, because it is what the format is *for*: reading and writing it
live in one place, so a file JIT-Pack writes is a file JIT-Pack reads back completely. The
instance used to serve this format too, from a second implementation that had quietly fallen
behind — its files left out the trip's status, its tags and its item marks, so exporting from
the server and importing the file back lost them without saying so. Removing it was the fix.

What the format carries:

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

A `scope:` line says which kind of template it is: a `group` (a reusable set of items) or a
`template` (a holiday template composed of groups). A holiday template carries the groups it
is made of **whole**, under `includes:`, together with each position's preparation tasks — so
the file still means something on an instance that has never seen those groups. `icon:` is
the optional mark, on the template, on each group and on each item; it is left out where
there is none, and a file written before the field existed imports without one.

**On import, a group of the same name is linked, never overwritten.** The name is how a
group is recognised across instances. If your instance already has a group called
*Makro Fotografie*, the imported template is attached to **yours** and the file's version of
that group is discarded — the file may be older than your group, and a group is shared by
every template that includes it and every trip that follows it. The consequence worth
knowing: an import can give you less than the file described. Rename your own group first if
you want the file's version alongside it.

The same linking applies when you import a **group document** on its own: if a group of that
name is already here, the import lands on it and changes nothing, rather than leaving a
second copy behind. A *holiday template* whose name is taken is treated the same way since ADR-030: the import
lands on the one that is here and changes nothing. It used to create a second one suffixed
*(import)*, which meant restoring a backup twice doubled every template in it.

A group document (`scope: group`) carries no `includes:` — a group is never composed of
other groups.

These rules are the same wherever a file goes in: the app's import screen and the
[import command](#importing-yaml-from-the-command-line) run the same code.

## Importing YAML from the command line

Everything above gets data *out*. To put a portable YAML file back **in** from a shell —
seeding a new instance, restoring on a machine with no screen, replaying a file you edited
by hand — use the import command that ships with the repository. Build it once with `npm run build:cli` in `client/` (see [The Command Line](command-line.md)), then:

```bash
node client/dist-cli/jitpack.mjs import my-template.yaml
node client/dist-cli/jitpack.mjs import --server https://jitpack.example.com --token "$TOKEN" backup.yaml
```

It needs Node, and it talks to a **running** instance over the same sync API the app uses;
it does not open the database file, which the server has open at the same time. That is also
why it gives you exactly what the app's import screen gives you — it runs the same code, so
a trip keeps its tags, its marks, its status and its links to the groups it follows.

A file may hold one document or many. Each is imported in the order the file lists it, and
each gets a line:

```
backup.yaml #1 template "Ferien": imported
backup.yaml #2 trip "Wiriehorn": imported
backup.yaml #3: unreadable — unknown kind "nonsense"
3 documents: 2 imported, 1 unreadable
```

**Running it again is safe.** Anything the instance already holds — a trip by its year and
name, a template or group by its name — is skipped and counted on its own, so re-running a
file after a connection died tops up what is missing instead of doubling what is there:

```
backup.yaml #1 template "Ferien": imported
backup.yaml #2 trip "Wiriehorn": already here — nothing added
2 documents: 1 imported, 1 already here, 0 failed
```

**One bad document never costs the ones behind it.** Whatever went wrong is said on its own
line and the rest of the file still goes in. The command exits with `1` if any document
failed and `2` if the command line itself was wrong, so a script can tell "nothing landed"
from "most of it did".

| Option | Meaning |
|---|---|
| `--server URL` | The instance to import into. Defaults to `$JITPACK_SERVER`, then `http://localhost:3000`. |
| `--token TOKEN` | Bearer token, for an instance with accounts. Defaults to `$JITPACK_TOKEN`. A single-user instance needs none. |
| `--dry-run` | Read the file and report what is in it without importing anything, including what is already here. |

Use `--dry-run` before importing a file you wrote or edited yourself — it tells you how many
documents the file really has, which of them the app can read, and which of them it would
leave alone because they are already there, while nothing has changed yet.

Local Mode has no server, so there is nothing to import into from a shell; restore a Local
Mode backup in the app, on the device.

If an export or import fails unexpectedly, [Troubleshooting](troubleshooting.md) lists the
error codes.
