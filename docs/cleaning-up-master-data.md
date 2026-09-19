# Cleaning Up Master Data

Your instance accumulates items, tags and templates that nobody needs any more. You can
delete them one at a time in the app — but if you have a long list, or you want to work
from a spreadsheet, JIT-Pack gives you a delete endpoint per row.

!!! tip "For tags, try the app first"
    **Inventory → ⋮ → Manage tags** renames, merges, reorders and deletes tags, and it is
    the only place that can *merge* two tags into one. Merging is usually what you want
    when a tag was typed twice — it keeps every item filed, which deleting does not. See
    [what the endpoint does differently](#deleting-a-tag-is-not-what-the-app-does) below.

!!! tip "Let the app find the mess"
    **Inventory → ⋮ → Tidy up** checks the inventory against a few rules and lists what it
    finds, each with the fix beside it — see [Tidying up in the app](#tidying-up-in-the-app).

!!! warning "Back up first"
    Deletion through the API asks no confirmation question. Copy your database file before
    you start — see [Backup & Export](backup.md). It is one file, and restoring it undoes
    everything on this page.

## Tidying up in the app

**Inventory → ⋮ → Tidy up** runs three rules over your inventory. While any of them finds
something, a line at the end of the inventory list says how many findings there are, and
tapping it opens the same screen.

| Rule | What it finds | What you can do |
|---|---|---|
| Untagged | Items that carry no tag. They sit under "Untagged" and are missing from every tag filter. | Take the suggested tag, or **Choose tag…**, which searches your tags and creates one you type that does not exist yet. |
| Not used in a long time | Items in no template whose last trip ended more than 12 months ago (6 and 24 can be chosen). | **Retire** the item (it moves to *Hidden master data* and can be restored there), or **Keep** it. |
| Tag with a single item | Tags that only one item carries — usually a typo of another tag. | **Merge…** it into another tag, or **Keep** it. |

A tag is only suggested when there is a reason, and the reason is shown: an item with a
similar name ("like Zahnbürste"), or a template the item is in. Every fix shows a message with
**Undo** — except a merge, which asks before it acts, exactly as in **Manage tags**.

Some things to know:

- **Nothing is enforced.** An item without a tag can still be saved — imports and the quick
  create in the search produce them on purpose. The rule finds them afterwards.
- **An item that has never been on a trip is not reported as unused.** JIT-Pack does not know
  when an item was created, so a new item and a forgotten one would look the same.
- **With a server, only the trips this device has opened are counted.** If trips in the window
  have not been opened here, the screen says how many — one of them may have used the item.
- **The rules, the time window and every *Keep* are stored on this device only.** Another
  phone, or another member of your household, is asked again. The **Rules** button on the
  screen switches rules off and sets the window.

### Removing a packing-list row can remove its item

Every name you type on a packing list becomes an item in your inventory. So that a typo or a
one-off does not stay there for ever, **removing a row from the packing list also deletes its
item** when nothing else uses it: no template or group lists it, no other row on any trip
packs it, and no other item needs it as a companion. The message after the removal says so
(*"removed — from the inventory too"*), and so does the question JIT-Pack asks before
removing a row that is already packed or has notes.

The item goes only once the removal is final: when the message with **Undo** disappears —
also after you confirmed the question. **Undo** therefore brings back the row and leaves the
item exactly as it was.

With a server, your device asks the server first, because it only knows the trips it has
opened. If a trip it has not seen still uses the item, the item stays, even though the
message said it would go. If the device is offline at that moment, the item also stays, and
you can delete it from the inventory yourself.

### Giving a tag an icon

A tag can carry one emoji, like an item can. Open **Inventory → ⋮ → Manage tags** and tap the
square in front of a tag's name; the same emoji picker as for items opens. The icon appears on
the tag's chip and heading in the inventory, and in front of every item filed under the tag
that has no photo and no icon of its own — shown paler, so you can tell it from the item's own.

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

One more item endpoint is not a plain delete: `POST /api/v1/master/items/{id}/prune` deletes
the item **only if nothing uses it**, and otherwise leaves it untouched instead of hiding it.
It answers `{"pruned": true}` or `{"pruned": false}`. The app calls it when a packing-list
removal leaves an item unused ([see above](#removing-a-packing-list-row-can-remove-its-item)), and it is just as safe to call from a script.

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
The inventory points there too — when items are hidden, a line at the end of the list says how
many and takes you straight to them. And if you search the inventory for a hidden item by its
exact name, the top of the results offers to restore it rather than to create a second one.
Adding an item works the same way on the packing list, the shopping list and in the template
editor: they search the inventory with the same rules, so typing a hidden item's name there
restores it and adds it in one tap, and a name the inventory does not hold yet is created
in the inventory first rather than being added to that one trip only.

### Deleting a tag is not what the app does

Tags have no hidden state, so `retired` is always `false` for them — and the endpoint
**deletes a tag even while items carry it**. Every one of those items loses the tag, and
any item that was filed under it as its main tag drops into *„Ohne Tag"* in the inventory.
Nothing warns you, and nothing records which items had it.

The app refuses that same delete and offers to merge the tag into another one instead, so
the items keep where they are filed. If you are clearing out a duplicate tag rather than a
tag nobody uses, merge it in the app and let the merge delete it for you.

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
