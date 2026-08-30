# Cleaning Up Master Data

Your instance accumulates items, tags and templates that nobody needs any more. You can
delete them one at a time in the app — but if you have a long list, or you want to work
from a spreadsheet, JIT-Pack gives you a delete endpoint per row.

!!! warning "Back up first"
    Deletion through the API asks no confirmation question. Copy your database file before
    you start — see [Backup & Export](backup.md). It is one file, and restoring it undoes
    everything on this page.

## What you can delete

| Kind | Endpoint |
|---|---|
| Tag | `DELETE /api/v1/master/tags/{id}` |
| Item | `DELETE /api/v1/master/items/{id}` |
| Template or group | `DELETE /api/v1/master/templates/{id}` |
| One position inside a template | `DELETE /api/v1/master/template-items/{id}` |

Templates and groups share one endpoint, because a group *is* a template — the app just
shows the two on separate tabs.

Trips are not on this list. Deleting a trip removes other people's packing history along
with it, so it stays in the app where the confirmation question can say so.

## Authenticating

**Single-User Mode** needs no token at all — every request is already you:

```bash
curl -X DELETE https://jitpack.example.com/api/v1/master/items/it-abc123
```

**Server Mode** needs the bearer token your browser already holds. Open the app, open your
browser's developer tools, and read the value of `jitpack_tokens` under Local Storage; the
`access_token` field inside it is the token:

```bash
TOKEN='paste-the-access_token-here'
curl -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  https://jitpack.example.com/api/v1/master/items/it-abc123
```

Access tokens are short-lived — 15 minutes. When you start getting `401`, reload the app in
the browser and copy the fresh value out of `jitpack_tokens` again.

## What the answer means

A successful delete answers `200` with a small JSON body:

```json
{ "outcome": "applied", "retired": false, "pull_hint": { "next_cursor": 4711 } }
```

**Read `retired` — it is the important field.** JIT-Pack does not remove a row that your
history still depends on:

- `"retired": false` — nothing had ever used the row. It is gone for good.
- `"retired": true` — a trip was packed from this template, or a template still lists this
  item, so the row was **hidden** instead: it disappears from every list and picker in the
  app, but stays in the database so archived trips and statistics keep making sense.

A hidden row is not stuck. Once whatever kept it alive is deleted too, deleting it again
removes it for good. You can also see and undo these: **Settings → Hidden master data →
Restore hidden items and templates** lists them, restores them, or deletes them permanently.

The other answers you may get:

| Status | Meaning |
|---|---|
| `401` | No token, or an expired one |
| `404` | No row of that id — worth checking before you assume it was already deleted |
| `500` | Something went wrong on the server; nothing was deleted |

## Finding the ids

Export your data and read the ids out of it:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://jitpack.example.com/api/v1/me/export.json > jitpack-export.json
```

The file has one array per table. To list every template with its name and id:

```bash
jq -r '.data.templates[] | "\(.id)\t\(.kind)\t\(.name)"' jitpack-export.json
```

Use `.data.items`, `.data.tags` or `.data.template_items` the same way.

## Deleting a list

Put the ids in a file, one per line, and work through it — reporting what happened to each,
so a retirement does not pass for a deletion:

```bash
while read -r id; do
  body=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
    "https://jitpack.example.com/api/v1/master/templates/$id")
  echo "$id: $body"
done < templates-to-delete.txt
```

## Your other devices

Every delete is recorded the same way a change made in the app is, so other devices and
other people pick it up on their next sync. A device that was offline while you cleaned up
catches up when it comes back — you do not have to do anything on it.
