# The Command Line

Some things are easier to do to thirty trips than to one. JIT-Pack ships a command line —
`jitpack` — that does them from a shell against a **running** instance.

It is the app's own code. Every command builds the same rows the app builds and sends them
over the same sync API, so what you change here reaches every phone the moment it syncs, and
a rule the app follows is a rule the command follows.

!!! note "There is no REST API for writing"
    Anything that changes data goes through this command or through the app. The server
    deliberately has no per-entity endpoints to `curl`, because the rules behind them live in
    the client — that is what keeps offline-only instances complete.

## Building it

The command is not in the container image; it is built from the repository, once:

```bash
cd client
npm ci
npm run build:cli
```

That writes `client/dist-cli/jitpack.mjs`. Run it with Node 24 or newer:

```bash
node client/dist-cli/jitpack.mjs --help
```

## Pointing it at your instance

Every command takes the same two connection flags, and both fall back to the environment, so
a shell can be set up once:

| Flag | Environment | Default |
|---|---|---|
| `--server URL` | `JITPACK_SERVER` | `http://localhost:3000` |
| `--token TOKEN` | `JITPACK_TOKEN` | none |

The token is an [API token](api-tokens.md). A single-user instance needs none; a multi-user
instance needs one, and the command acts as whoever created it.

```bash
export JITPACK_SERVER=https://jitpack.example.com
export JITPACK_TOKEN='paste-the-token-here'
```

Local Mode has no server, so there is nothing for a command to talk to. Everything here is
for an instance you run.

## What it can do

| Command | What it is for |
|---|---|
| `jitpack import` | Put portable YAML into the instance — see [Backup & Export](backup.md#importing-yaml-from-the-command-line). |
| `jitpack traveler` | Read and extend the people on a trip. |
| `jitpack tags` | Read, rename, merge and hand out the tags your inventory is filed under. |

Every command exits `0` when it worked, `1` when the instance refused or something failed,
and `2` when the command line itself was wrong — so a script can tell "nothing landed" from
"most of it did".

## Travelers

A trip's travelers are the people you pack for. They are what per-person quantities, the
"who needs this?" question and the packing statistics are counted against, and a trip
imported from a spreadsheet has none — the sheet never had them.

Read a trip's roster:

```bash
node client/dist-cli/jitpack.mjs traveler list --trip "Cannobio"
```

```
Cannobio 2026: Andy (linked)
Cannobio 2026: Sia
```

Add people to it:

```bash
node client/dist-cli/jitpack.mjs traveler add --trip "Cannobio" Andy Sia
```

```
Cannobio 2026: added Andy
Cannobio 2026: added Sia
Cannobio 2026: 2 added, 0 already here
```

**Adding someone changes the packing list, exactly as the app does.** While a trip still
follows the groups it was built from, a new person brings their own per-person positions
with them — the same thing that happens when you type the name on the trip's own screen.
The command says what it did, so you do not have to open the app to find out:

```
Cannobio 2026: added Sia — 14 rows added, 0 removed, 0 kept
```

A trip that follows no group, or one that is already over, simply gains the person.

**Running it again is safe.** A name the trip already carries is reported and left alone, so
a loop over a whole season tops up what is missing instead of doubling what is there:

```
Cannobio 2026: Andy is already here — nothing added
Cannobio 2026: 0 added, 1 already here
```

| Option | Meaning |
|---|---|
| `--trip TRIP` | Which trip: its name, or its id. Required. |
| `--year YEAR` | Which trip, when one name means several. |
| `--user WHO` | Link this person to an account, by display name or user id. One name only, and the account must already be a member of the trip — see below. |
| `--dry-run` | Say what would be added without adding it. |

### Naming the right trip

A trip is identified by its **year and its name**, because a family goes back to the same
place. If a name means more than one trip, the command refuses and tells you which years it
found, rather than picking one:

```
"Cannobio" is several trips (2025, 2026) — say which with --year
```

Add `--year 2026`, or pass the trip's id, which is never ambiguous.

### Linking a person to an account

A traveler is a person on a trip; an account is someone who signs in. The link records
which account a person is, and — once they are already a member of the trip — makes
assigning them a row notify their account, the same way assigning a row to somebody
directly does.

**You can do this in the app as well**, and for one or two people that is the shorter
way: open the trip, edit it, and pick the account beside the traveler's name — or, when
you are adding the person right now, pick it beside the name field before you press Add.
Either picker offers the trip's members, so they appear only on a trip you have shared
with somebody. The command is for doing it in bulk, or for a trip you are setting up from
a script:

```bash
node client/dist-cli/jitpack.mjs traveler add --trip "Cannobio" --user "Sia" Sia
```

The account is matched by display name or user id — the directory holds no e-mail addresses.

**The account must already be a member of the trip.** A notification's link into the
trip is only good to the person receiving it if their device can already open that
trip, so linking someone not yet invited is refused:

```
Cannobio 2026: Sia is not a member of this trip — invite them before linking
```

Invite them to the trip first (they need to have signed in at least once), then run
the link. Until then, add them as an unlinked traveler; the person is still packed
for, and assigning a row to them still works through the item's detail sheet — it
just has nobody's account to notify yet.

### Removing someone

Not from here. Taking a person off a trip has to decide what happens to the rows they were
packing, so the app asks — open the trip, edit it, and remove them there.

## Tags

Tags are how the inventory is filed. Over time they drift — `Elektronik` beside `Technik`, a
`Diverses` that holds half the house — and tidying them in the app is a lot of tapping. The
`tags` command does the same things the tag manager and the inventory's selection mode do,
from a shell, and it can run a whole cleanup written down as a file.

See what is there:

```bash
node client/dist-cli/jitpack.mjs tags list --items
```

```
Elektronik — 1 item
  Ladekabel
Diverses — 2 items
  Pflaster
Bad — 1 item
  Zahnbürste
```

The number beside a tag counts every item carrying it, retired ones included — the same
number the tag manager shows. `--items` also lists the items filed under each tag, and those
with no tag at all.

### One change at a time

| Action | What it does |
|---|---|
| `rename TAG NAME` | Gives a tag a new name. Refused if another tag already has it — merge into that one instead. |
| `merge TAG INTO` | Moves every item from `TAG` onto `INTO`, keeping each item filed where it was, then removes `TAG`. |
| `give TAG ITEM...` | Gives the tag to these items and files them under it. `--no-primary` only adds it. A tag that does not exist yet is created. |
| `take TAG ITEM...` | Takes the tag away from these items. `--all` takes it from every active item that carries it. |
| `delete TAG` | Removes a tag no item carries. Refused while items still carry it, and says how many. |
| `mark TAG EMOJI` | Sets the tag's mark; `--clear` removes it. Only emoji the app's mark picker offers are accepted. |

Tags and items are matched ignoring case. Retired items are left alone, as in the app:
naming one is refused, and `--all` skips them — which is why a tag only retired items still
carry cannot be deleted. Merge it into another tag instead.

```bash
node client/dist-cli/jitpack.mjs tags merge Elektronik Technik
```

### A whole cleanup as a plan

A plan is a YAML list of the same steps, run in order:

```yaml
- rename: Elektronik
  to: Technik
- merge: Fotografie
  into: Technik
- rename: Bad
  to: Hygiene
- give: Gesundheit
  items: [Pflaster]
- take: Diverses
  items: all
- delete: Diverses
- mark: Technik
  as: 🔌
- mark: Hygiene
  as: 🧴
```

`give` files the items under the tag unless the step says `primary: false`. `mark` takes
`as: null` to clear a mark.

Always run it with `--dry-run` first. It performs every step against a copy of your data,
reports each one, and shows the tags you would end up with — and sends nothing:

```bash
node client/dist-cli/jitpack.mjs tags apply retag.yaml --dry-run
```

```
rename Elektronik → Technik
merge Fotografie → Technik: 1 item moved, Fotografie removed
rename Bad → Hygiene
give Gesundheit (new tag): 1 of 1 item filed under it
take Diverses: removed from 2 items
delete Diverses
mark Technik: 🔌
mark Hygiene: 🧴
11 writes (dry run, not sent). Tags afterwards:
  Technik 🔌 — 2 items
  Hygiene 🧴 — 1 item
  Gesundheit — 1 item
```

Then run it without `--dry-run`. **A plan is all or nothing:** if any step is refused — a
misspelt item, a name already taken, a tag still in use — the run stops there, says which
step and why, and sends nothing at all. Fix the file and run it again.

A plan describes a change, not an end state, so running the same file a second time stops at
its first rename or merge (the old tag is gone) without changing anything.

**There is no undo for a plan.** Take a backup of the database first — see
[Backup & Export](backup.md) — so a cleanup you regret can be rolled back.

## A whole season at once

The commands are ordinary programs, so the shell does the repetition:

```bash
for trip in "Cannobio" "Wiriehorn" "Samedan"; do
  node client/dist-cli/jitpack.mjs traveler add --trip "$trip" Andy Sia
done
```

Use `--dry-run` first when the list is long: it reports exactly what each run would add, and
what it would leave alone, while nothing has changed yet.
