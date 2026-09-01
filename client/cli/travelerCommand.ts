/**
 * `jitpack traveler` — read and extend a trip's roster from a shell (FR-2.5,
 * FR-18.8).
 *
 * It owns no rules of its own. Adding runs M22's own action
 * (`addTravelerToTrip`) against a command-line `SyncContext`, so the person
 * arrives with the positions a trip that still follows its groups owes them
 * (FR-2.7/FR-27.4) — and everything it writes is pushed through the ordinary
 * trip sync endpoint, landing in the change log like every other write
 * (invariant 4, ADR-025). Calling the insert mutation directly is what this
 * command used to do, and it is why a traveller added from a shell arrived on
 * an empty list while the same name typed on M22 did not. There is no REST
 * resource for travelers and this command deliberately does not ask for one.
 */

import { APIClient } from '@/api/client'
import { API } from '@/api/routes'
import type { UserListResponse } from '@/api/types'
import { usePull } from '@/composables/usePull'
import { usePush } from '@/composables/usePush'
import { HLCGenerator } from '@/sync/hlc'
import { foldName } from '@/domain/nameCollision'
import type { Trip } from '@/types/domain'
import {
  message,
  DEFAULT_SERVER,
  ENV_SERVER,
  ENV_TOKEN,
  EXIT,
  pushPending,
  type CommandIO,
  type Connection,
} from './common'
import { createCommandContext } from './context'

/** What the command does. Removing a person is M22's job — see the usage note. */
export type TravelerAction = 'add' | 'list'

export interface TravelerOptions extends Connection {
  action: TravelerAction
  /** A trip id, or a name resolved against the instance (ADR-030's identity). */
  trip: string
  /** Only needed when one name means two trips. */
  year: number | null
  names: string[]
  /**
   * An account to record the person as, by id or display name. Recorded and
   * not acted on — FR-2.5's 2026-09-01 decision: the link has no reader, and
   * the built way to make a row somebody's is FR-25.19's assignment.
   */
  user: string | null
  dryRun: boolean
}

export type ParsedTravelerArgs =
  | ({ ok: true } & TravelerOptions)
  | { ok: false; error: string }
  | { ok: false; help: true }

export const TRAVELER_USAGE = `Usage: jitpack traveler add|list --trip TRIP [flags] [NAME...]

Reads or extends the people on one trip. Adding is idempotent per trip: a name
the trip already carries is left alone, so a run can be repeated over a whole
season. Removing a person is not offered here — it decides what happens to the
rows they own, and that question belongs on the screen that asks it (M22).

Flags:
  --trip TRIP    trip id, or its name (required)
  --year YEAR    which trip, when one name means several
  --user WHO     record which account the person is (nothing reads it yet)
  --server URL   instance base URL (default $${ENV_SERVER}, else ${DEFAULT_SERVER})
  --token TOKEN  bearer token for an instance with accounts (default $${ENV_TOKEN})
  --dry-run      report what would be added without adding it`

const ACTIONS: TravelerAction[] = ['add', 'list']

/**
 * Read the command line. `getenv` supplies the fallbacks, so the precedence —
 * flag over environment over default — is decided here and can be tested
 * without touching the real environment.
 */
export function parseTravelerArgs(
  argv: string[],
  getenv: (name: string) => string | undefined,
): ParsedTravelerArgs {
  let action: TravelerAction | null = null
  let serverUrl = ''
  let token = ''
  let trip = ''
  let year = ''
  let user = ''
  let dryRun = false
  const names: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') return { ok: false, help: true }
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--server') serverUrl = argv[++i] ?? ''
    else if (arg === '--token') token = argv[++i] ?? ''
    else if (arg === '--trip') trip = argv[++i] ?? ''
    else if (arg === '--year') year = argv[++i] ?? ''
    else if (arg === '--user') user = argv[++i] ?? ''
    else if (arg.startsWith('-')) return { ok: false, error: `unknown flag: ${arg}` }
    else if (action === null) {
      if (!ACTIONS.includes(arg as TravelerAction)) {
        return { ok: false, error: `unknown action: ${arg} (expected ${ACTIONS.join(' or ')})` }
      }
      action = arg as TravelerAction
    } else names.push(arg)
  }

  if (action === null) return { ok: false, error: `no action given (expected ${ACTIONS.join(' or ')})` }
  if (!trip) return { ok: false, error: 'no trip given — a traveler belongs to one' }
  if (action === 'add' && names.length === 0) return { ok: false, error: 'no name given' }
  if (year && !/^\d{4}$/.test(year)) return { ok: false, error: `not a year: ${year}` }

  return {
    ok: true,
    action,
    trip,
    year: year ? Number(year) : null,
    names,
    user: user || null,
    dryRun,
    serverUrl: serverUrl || getenv(ENV_SERVER) || DEFAULT_SERVER,
    token: token || getenv(ENV_TOKEN) || null,
  }
}

export async function runTraveler(opts: TravelerOptions, io: CommandIO): Promise<number> {
  // One account is one person, so a link with several names has no right
  // answer — and the wrong one would be silent.
  if (opts.user && opts.names.length > 1) {
    io.write('--user names one account, so it takes one traveler')
    return EXIT.failed
  }

  const hlc = new HLCGenerator(io.now, io.deviceId)
  const client = new APIClient(opts.serverUrl, () => opts.token)
  const ctx = createCommandContext(hlc, io.now)
  const { trips, pending, tripLifecycle } = ctx
  const { pullMasterAll, pullTripAll } = usePull(client, hlc)
  const { pushMaster, pushTrip } = usePush(client, hlc)

  // Trips are in the master partition; the roster is in the trip's own. Both
  // have to be here before anything is planned, because both decide whether
  // this run writes at all.
  let trip: Trip
  try {
    // The whole master partition, not only the trips: the refresh the add
    // may trigger resolves against the groups and the inventory.
    ctx.applyPulled('master', (await pullMasterAll(0)).changes)
    const found = resolveTrip(trips.tripList, opts.trip, opts.year)
    if ('error' in found) {
      io.write(found.error)
      return EXIT.failed
    }
    trip = found.trip
    ctx.applyPulled('trip', (await pullTripAll(trip.id, 0)).changes)
    ctx.markTripLoaded(trip.id)
  } catch (e) {
    io.write(`${opts.serverUrl}: ${message(e)}`)
    return EXIT.failed
  }

  const roster = trips.getTravelers(trip.id)
  const where = `${trip.name} ${trip.year}`

  if (opts.action === 'list') {
    if (roster.length === 0) io.write(`${where}: no travelers`)
    for (const person of roster) {
      io.write(`${where}: ${person.name}${person.linked_user_id ? ' (linked)' : ''}`)
    }
    return EXIT.ok
  }

  let linkedUserId: string | null = null
  if (opts.user) {
    try {
      const resolved = resolveUser((await client.get<UserListResponse>(API.users, {})).users, opts.user)
      if ('error' in resolved) {
        io.write(resolved.error)
        return EXIT.failed
      }
      linkedUserId = resolved.userId
    } catch (e) {
      io.write(`${API.users}: ${message(e)}`)
      return EXIT.failed
    }
  }

  let skipped = 0
  let written = 0
  const taken = new Set(roster.map((p) => foldName(p.name)))
  const reports: string[] = []

  for (const raw of opts.names) {
    const name = raw.trim()
    if (taken.has(foldName(name))) {
      io.write(`${where}: ${name} is already here — nothing added`)
      skipped++
      continue
    }
    taken.add(foldName(name))
    if (opts.dryRun) {
      io.write(`${where}: would add ${name} (dry run, not sent)`)
      continue
    }
    // M22's action, not the mutation under it: a trip that still follows its
    // groups owes the new person their positions (FR-2.7/FR-27.4).
    const report = tripLifecycle.addTravelerToTrip(trip.id, name, linkedUserId)
    if (!report) {
      io.write(`${where}: ${name} could not be added — the trip's rows are not here`)
      return EXIT.failed
    }
    written++
    reports.push(
      report.added + report.removed + report.kept === 0
        ? `${where}: added ${name}`
        : `${where}: added ${name} — ${report.added} rows added, ${report.removed} removed, ${report.kept} kept`,
    )
  }

  if (written > 0) {
    try {
      await pushPending(pending, pushMaster, pushTrip)
    } catch (e) {
      io.write(`${where}: failed — ${message(e)}`)
      return EXIT.failed
    }
    for (const line of reports) io.write(line)
  }

  const added = opts.dryRun ? opts.names.length - skipped : written
  io.write(`${where}: ${added} added, ${skipped} already here`)
  return EXIT.ok
}

/**
 * A trip's identity is (year, name) — ADR-030 — so a name alone can mean
 * several trips, and picking one of them would write the roster onto whatever
 * sorted first. An id is never ambiguous and is tried first.
 */
function resolveTrip(
  all: Trip[],
  wanted: string,
  year: number | null,
): { trip: Trip } | { error: string } {
  const byId = all.find((t) => t.id === wanted)
  if (byId) return { trip: byId }

  const folded = foldName(wanted)
  const named = all.filter((t) => foldName(t.name) === folded)
  const candidates = year === null ? named : named.filter((t) => t.year === year)

  if (candidates.length === 1) return { trip: candidates[0]! }
  if (candidates.length === 0) {
    return { error: `no trip called "${wanted}"${year === null ? '' : ` in ${year}`}` }
  }
  const years = candidates.map((t) => t.year).join(', ')
  return { error: `"${wanted}" is several trips (${years}) — say which with --year` }
}

/** By id or display name; the directory carries no address to match on. */
function resolveUser(
  users: { user_id: string; display_name: string }[],
  wanted: string,
): { userId: string } | { error: string } {
  const byId = users.find((u) => u.user_id === wanted)
  if (byId) return { userId: byId.user_id }

  const folded = foldName(wanted)
  const named = users.filter((u) => foldName(u.display_name) === folded)
  if (named.length === 1) return { userId: named[0]!.user_id }
  if (named.length === 0) return { error: `no account called "${wanted}"` }
  return { error: `"${wanted}" is several accounts — say which with its user id` }
}
