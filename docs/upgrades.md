# Upgrades

JIT-Pack is **pre-1.0, and pre-1.0 versions ship no database upgrade path.** A new version whose database layout differs from the one that wrote your file refuses to open it and exits — it never tries to upgrade the file, and it never touches it:

```
store: database schema is stale: /data/jitpack.db was built from a different schema
	JIT-Pack is pre-1.0 and ships no schema upgrade path
	to discard it:   rm /data/jitpack.db   and restart
	to keep it:      run the JIT-Pack version that wrote it, export under Settings -> Data, then upgrade and import
```

The refused file is left byte-for-byte as it was, so nothing is lost at that moment — but the new version will not run against it. [Troubleshooting](troubleshooting.md#store-database-schema-is-stale) covers the error itself; this page is about upgrading without losing what matters.

This is planned to change at 1.0, when upgrades will carry the database forward. Until then, treat every image bump as potentially breaking and follow the steps below.

## Export before you pull

Whether a given release actually changed the schema is not something you can tell from the version number, so the safe routine assumes it did. **Do the exports while the old version is still running** — afterwards, the data is only reachable by rolling the image back.

1. **Take a file backup** of the database ([how](backup.md#wal-mode-back-up-all-three-files-or-use-a-proper-snapshot)). This is your rollback: a `.db` file restores only [into the version that wrote it](backup.md#restoring), so together with the old image tag it recreates the instance exactly as it was.
2. **Export portable YAML** for every template and every trip you want to carry forward ([how](backup.md#getting-data-out-over-the-api)). Portable YAML is version-independent — it survives a schema change, the `.db` file does not.
3. Now pull the new image and start it.
   - If it starts, the schema did not change — you are done, and the exports cost you a minute.
   - If it refuses with the stale-schema error, move the old database file aside (keep it — it pairs with the old image), start the new version against an empty path, and **import** your YAML exports through the app or the [import endpoints](backup.md#template-export-and-import).

On a multi-user instance, accounts need no export: they are provisioned from the identity provider, so everyone gets their account back by [logging in again](multi-user-setup.md).

## What the portable exports do not carry

Re-importing YAML into a fresh database is a real reset in several ways. The exports carry your **lists** — trips, templates, items, quantities, travelers, containers, preparation tasks — and deliberately not the rest:

- **Packing progress.** Trip YAML is a clean list; every checkmark is gone.
- **Item reference photos and user avatars.** Images never travel in the exports; they are re-uploaded by hand.
- **Accounts and sessions.** Recreated at next login (multi-user), or implicit (single-user) — but notification preferences and push registrations reset with them, so everyone re-enables [push](notifications.md) once.
- **Trip history and analytics.** An archived trip you did not export is gone, and with it the packed-weight history and the usage data behind quantity suggestions.
- **A trip's link to its templates.** A re-imported trip is a plain list again: it no longer knows which groups it was generated from, so it stops being offered group changes.

For a household that has been packing with the instance for a season, that is a real loss — which leads to the actual recommendation:

## Don't upgrade mid-trip

Pin the version **and the digest** before a trip and leave it pinned until you are back:

```yaml
image: ghcr.io/polandy/jit-pack:0.2.0@sha256:…   # imagetools inspect prints the digest
```

A tag alone can be rebuilt; the digest cannot change under you, so nothing — not a re-pulled tag, not a well-meaning auto-updater like Watchtower — can swap the server out while everyone depends on it. Upgrade after the trip, when lost packing progress is a shrug instead of a problem. The same logic applies to any auto-update mechanism: exclude JIT-Pack from it entirely while pre-1.0, and upgrade deliberately with the routine above.
