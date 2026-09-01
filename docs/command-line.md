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
| `--user WHO` | Link this person to an account, by display name or user id. One name only. |
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

A traveler is a person on a trip; an account is someone who signs in. Linking the two is
what lets the app show that this row belongs to *you*:

```bash
node client/dist-cli/jitpack.mjs traveler add --trip "Cannobio" --user "Sia" Sia
```

The account is matched by display name or user id — the directory holds no e-mail addresses.
Someone who has **never signed in has no account yet**, so link them after their first login.
Until then, add them as an unlinked traveler; the person is still packed for.

### Removing someone

Not from here. Taking a person off a trip has to decide what happens to the rows they were
packing, so the app asks — open the trip, edit it, and remove them there.

## A whole season at once

The commands are ordinary programs, so the shell does the repetition:

```bash
for trip in "Cannobio" "Wiriehorn" "Samedan"; do
  node client/dist-cli/jitpack.mjs traveler add --trip "$trip" Andy Sia
done
```

Use `--dry-run` first when the list is long: it reports exactly what each run would add, and
what it would leave alone, while nothing has changed yet.
