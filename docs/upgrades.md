# Upgrades

**From 0.17.0 on, JIT-Pack upgrades its own database.** When a new version starts against a file an older one wrote, it applies the schema changes it is missing and carries on — no SQL to run, no export-and-import, nothing for you to do but pull the image and restart.

That holds from **0.15.0** onwards. 0.15.0 and 0.16.0 ship the same database layout — byte for byte, so they are one starting point rather than two — and anything written by them or later is carried forward. A database from **0.14.0 or earlier** is refused, with the instruction it has always carried:

```
store: database schema is stale: /data/jitpack.db was built from a schema this build cannot place
	it predates v0.15.0, the oldest release this build carries forward
	to keep it:      run the JIT-Pack version that wrote it, export under Settings -> Data, then upgrade and import
	to discard it:   rm /data/jitpack.db   and restart
```

Two other refusals exist, and both leave the file untouched as well:

- **A database from a newer version than the one you are starting.** Migrations only go forward; roll the image back to the version that wrote it.
- **A database from the pre-0.15 migration era** (its schema level is between 1 and 23). Same two ways out as above.

The refused file is never modified — not to "fix" it, not to stamp it. [Troubleshooting](troubleshooting.md#store-database-schema-is-stale) covers the message itself.

## What an upgrade does to your data

Nothing you have to undo. Each schema change runs in its own transaction, so a step either lands whole or not at all, and the database records how far it got. If one fails, the instance stops with the error and stays on the level it had — start the previous image again and the file is exactly as it was.

**Back up anyway before pulling a new image** ([how](backup.md#wal-mode-back-up-all-three-files-or-use-a-proper-snapshot)). Not because the upgrade is expected to fail, but because a restore is the only thing that helps if it does, and a file backup costs a second.

## Knowing a new version is out

Nothing tells you by default. If you want the instance to say so, set [`JITPACK_UPDATE_CHECK=true`](configuration.md#release-check): **Settings → About** then carries a line naming the newest release, with a link to its notes. It asks GitHub at most once a day, only when somebody opens that screen, and only on an instance running a released image.

It is deliberately quiet — a line, never a notification — because pulling a new image is your decision, and the rest of this page is why it should stay one.

## Before you pull

1. **Take a file backup** of the database ([how](backup.md#wal-mode-back-up-all-three-files-or-use-a-proper-snapshot)). A `.db` file restores into the version that wrote it, so together with the old image tag it recreates the instance exactly as it was — that pair is your rollback.
2. **Rehearse on a copy** before the real file sees the new version. A backup only helps *after* something
   went wrong; a rehearsal tells you beforehand whether it will. Stop the instance, copy the database together
   with its `-wal` and `-shm` files, start the new image against the **copy** (`JITPACK_DB_PATH` pointing at it,
   and a different `JITPACK_LISTEN` so it does not collide with the running port), and read the log. It should
   say `schema migrated` for every step it took and then carry on to listen. That is the whole test: your file
   may not be the one anybody else has, and the only way to know that the migration fits *it* is to run it on it.
   Stop the rehearsal instance and delete the copy. If it refused, it named the reason and left the copy as it
   found it, which is exactly what it would have done to the real file.
3. Pull the new image and start it against the real file. The log says what it did:

   ```
   INFO schema migrated level=1 migration=001_columns_since_v0_16_0.sql
   ```

4. If it refuses instead, read which of the three refusals above it is. Only the *oldest-release* one needs the export route: run the version that wrote the file, export portable YAML for every template and trip ([how](backup.md#getting-data-out-over-the-api)), then start the new version against an empty path and import them.

On a multi-user instance, accounts need no export: they are provisioned from the identity provider, so everyone gets their account back by [logging in again](multi-user-setup.md).

## What the portable exports do not carry

This matters only on the export route above — an ordinary upgrade keeps everything. Re-importing YAML into a fresh database is a real reset in several ways. The exports carry your **lists** — trips, templates, items, quantities, travelers, containers, preparation tasks — and deliberately not the rest:

- **Packing progress.** Trip YAML is a clean list; every checkmark is gone.
- **Item reference photos and user avatars.** Images never travel in the exports; they are re-uploaded by hand.
- **Accounts and sessions.** Recreated at next login (multi-user), or implicit (single-user) — but notification preferences and push registrations reset with them, so everyone re-enables [push](notifications.md) once.
- **Trip history and analytics.** An archived trip you did not export is gone, and with it the packed-weight history and the usage data behind quantity suggestions.
- **A trip's link to its templates.** A re-imported trip is a plain list again: it no longer knows which groups it was generated from, so it stops being offered group changes.

For a household that has been packing with the instance for a season, that is a real loss — which leads to the actual recommendation:

## Don't upgrade mid-trip

Pin the version **and the digest** before a trip and leave it pinned until you are back:

```yaml
image: ghcr.io/polandy/jit-pack:0.4.0@sha256:…   # imagetools inspect prints the digest
```

A tag alone can be rebuilt; the digest cannot change under you, so nothing — not a re-pulled tag, not a well-meaning auto-updater like Watchtower — can swap the server out while everyone depends on it. Upgrade after the trip. The upgrade itself is unattended now, but a restart is still a restart: somebody is mid-list, offline, with unsynced changes on a phone, and the minute the server is away is the minute they tap *sync*. The same logic applies to any auto-update mechanism — exclude JIT-Pack from it and upgrade deliberately, between trips.
