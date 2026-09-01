import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseTravelerArgs, runTraveler } from '../travelerCommand'
import { EXIT } from '../common'
import type { Mutation } from '@/api/types'

/**
 * A fake instance that answers both partitions. The trip partition matters
 * here in a way it never did for the import command: a traveler is a trip
 * row, so what the command already knows about a trip decides whether it
 * writes anything at all.
 */
class FakeInstance {
  master: {
    seq: number
    table: string
    id: string
    deleted: boolean
    row: Record<string, unknown>
  }[] = []
  trip: Record<string, typeof this.master> = {}
  users: { user_id: string; display_name: string }[] = []
  pushed: { path: string; mutations: Mutation[] }[] = []

  get mutations(): Mutation[] {
    return this.pushed.flatMap((p) => p.mutations)
  }

  /** One trip in the master feed, so the command can resolve it by name. */
  addTrip(id: string, name: string, year: number): void {
    this.master.push({
      seq: this.master.length + 1,
      table: 'trips',
      id,
      deleted: false,
      row: { id, name, year, status: 'planning' },
    })
    this.trip[id] ??= []
  }

  /** One master row of any table, so a fixture can build a whole group. */
  addMaster(table: string, id: string, row: Record<string, unknown>): void {
    this.master.push({ seq: this.master.length + 1, table, id, deleted: false, row: { id, ...row } })
  }

  /** One row in a trip's own partition. */
  addTripRow(tripId: string, table: string, id: string, row: Record<string, unknown>): void {
    const feed = (this.trip[tripId] ??= [])
    feed.push({ seq: feed.length + 1, table, id, deleted: false, row: { id, trip_id: tripId, ...row } })
  }

  /**
   * A trip that follows one group holding one per-person position — the
   * shape M22's add produces rows for (FR-27.4).
   */
  addFollowedGroup(tripId: string, itemName: string): void {
    this.addMaster('items', 'itm-1', { name: itemName })
    this.addMaster('templates', 'tpl-1', { owner_id: 'u-1', name: 'Makro', kind: 'group' })
    this.addMaster('template_items', 'tpi-1', {
      template_id: 'tpl-1',
      item_id: 'itm-1',
      quantity: 1,
      assignment: 'per_person',
      dedup: 'max',
      conditions: null,
      default_mode: 'pack',
      late_packer: false,
    })
    this.addTripRow(tripId, 'trip_template_sources', 'src-1', { template_id: 'tpl-1' })
  }

  /** One traveler already on a trip, which is what makes a second add a no-op. */
  addTraveler(tripId: string, id: string, name: string): void {
    const feed = (this.trip[tripId] ??= [])
    feed.push({
      seq: feed.length + 1,
      table: 'travelers',
      id,
      deleted: false,
      row: { id, trip_id: tripId, name, linked_user_id: null },
    })
  }

  handler = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(url)).pathname
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { mutations: Mutation[] }
      this.pushed.push({ path, mutations: body.mutations })
      return Response.json({
        results: body.mutations.map((m) => ({ mutation_id: m.mutation_id, outcome: 'applied' })),
        pull_hint: { next_cursor: 0 },
      })
    }
    if (path === '/api/v1/users') return Response.json({ users: this.users })
    const tripMatch = /^\/api\/v1\/trips\/([^/]+)\/sync$/.exec(path)
    const feed = tripMatch ? (this.trip[tripMatch[1]!] ?? []) : this.master
    return Response.json({ changes: feed, next_cursor: feed.length, has_more: false })
  }
}

let instance: FakeInstance

function io() {
  const lines: string[] = []
  return {
    readFile: async () => '',
    write: (line: string) => lines.push(line),
    now: () => 1_700_000_000_000,
    deviceId: 'aabbccdd',
    lines,
  }
}

const conn = { serverUrl: 'http://x', token: null }

beforeEach(() => {
  instance = new FakeInstance()
  vi.stubGlobal('fetch', instance.handler)
})
afterEach(() => vi.unstubAllGlobals())

describe('parseTravelerArgs', () => {
  const env = (m: Record<string, string>) => (k: string) => m[k]

  it('reads an add with its trip and its names', () => {
    expect(parseTravelerArgs(['add', '--trip', 'Cannobio', 'Andy', 'Sia'], env({}))).toMatchObject({
      ok: true,
      action: 'add',
      trip: 'Cannobio',
      names: ['Andy', 'Sia'],
    })
  })

  it('lets a flag win over the environment', () => {
    const parsed = parseTravelerArgs(
      ['list', '--trip', 'X', '--server', 'http://flag:3000', '--token', 'flag'],
      env({ JITPACK_SERVER: 'http://env:3000', JITPACK_TOKEN: 'env' }),
    )
    expect(parsed).toMatchObject({ ok: true, serverUrl: 'http://flag:3000', token: 'flag' })
  })

  it('takes from the environment what the flags omit', () => {
    const parsed = parseTravelerArgs(
      ['list', '--trip', 'X'],
      env({ JITPACK_SERVER: 'http://env:3000', JITPACK_TOKEN: 'env' }),
    )
    expect(parsed).toMatchObject({ ok: true, serverUrl: 'http://env:3000', token: 'env' })
  })

  it('refuses an action it does not know rather than guessing one', () => {
    expect(parseTravelerArgs(['remove', '--trip', 'X'], env({}))).toMatchObject({ ok: false })
  })

  it('refuses an add with no name rather than succeeding emptily', () => {
    expect(parseTravelerArgs(['add', '--trip', 'X'], env({}))).toMatchObject({ ok: false })
  })

  it('refuses any action without a trip, because a traveler belongs to one', () => {
    expect(parseTravelerArgs(['add', 'Andy'], env({}))).toMatchObject({ ok: false })
  })

  it('refuses a flag it does not know', () => {
    const parsed = parseTravelerArgs(['add', '--nope', '--trip', 'X', 'Andy'], env({}))
    expect(parsed.ok === false && 'error' in parsed && parsed.error).toContain('--nope')
  })

  // Asking for help is not a usage error: one belongs on stdout with exit 0
  // and the other on stderr with exit 2.
  it('separates asking for help from getting it wrong', () => {
    for (const flag of ['-h', '--help']) {
      expect(parseTravelerArgs([flag], env({}))).toEqual({ ok: false, help: true })
    }
    expect(parseTravelerArgs([], env({}))).toMatchObject({ ok: false, error: expect.any(String) })
  })
})

describe('runTraveler add', () => {
  // The whole point: a traveler is created by the same insert mutation the
  // app writes (`useMutations.addTraveler`), on the trip partition's own
  // endpoint — not by a REST resource the server does not have.
  it('sends the traveler as a sync mutation on the trip it belongs to', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Andy'], user: null, dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    expect(instance.pushed.map((p) => p.path)).toEqual(['/api/v1/trips/trip-1/sync'])
    expect(instance.mutations).toHaveLength(1)
    expect(instance.mutations[0]).toMatchObject({
      op: 'insert',
      table: 'travelers',
      fields: { trip_id: 'trip-1', name: 'Andy', linked_user_id: null },
    })
  })

  it('takes several names in one run', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)

    await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Andy', 'Sia'], user: null, dryRun: false },
      io(),
    )

    expect(instance.mutations.map((m) => m.fields?.['name'])).toEqual(['Andy', 'Sia'])
  })

  // Idempotent per trip, the same way an import is (ADR-030): running it
  // twice over 33 trips must not double the roster. The positive signal is
  // the empty push — nothing was sent, rather than something being ignored.
  it('leaves a name the trip already carries alone', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    instance.addTraveler('trip-1', 'trv-1', 'Andy')
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['andy ', 'Sia'], user: null, dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    expect(instance.mutations.map((m) => m.fields?.['name'])).toEqual(['Sia'])
    expect(it0.lines.join('\n')).toContain('already here')
  })

  it('writes nothing on a dry run and says what it would have done', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Andy'], user: null, dryRun: true },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    expect(instance.pushed).toHaveLength(0)
    expect(it0.lines.join('\n')).toContain('Andy')
  })

  // A trip's identity is (year, name) — ADR-030 — so a family that goes back
  // to the same place has two trips one name cannot address. Refusing beats
  // writing the roster onto whichever one sorted first.
  it('refuses an ambiguous trip name instead of picking one', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2025)
    instance.addTrip('trip-2', 'Cannobio', 2026)
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Andy'], user: null, dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.failed)
    expect(instance.pushed).toHaveLength(0)
    expect(it0.lines.join('\n')).toMatch(/2025.*2026|2026.*2025/s)
  })

  it('resolves the ambiguity with the year', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2025)
    instance.addTrip('trip-2', 'Cannobio', 2026)

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: 2026, names: ['Andy'], user: null, dryRun: false },
      io(),
    )

    expect(code).toBe(EXIT.ok)
    expect(instance.pushed.map((p) => p.path)).toEqual(['/api/v1/trips/trip-2/sync'])
  })

  it('accepts the trip id, which is never ambiguous', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2025)
    instance.addTrip('trip-2', 'Cannobio', 2026)

    await runTraveler(
      { ...conn, action: 'add', trip: 'trip-1', year: null, names: ['Andy'], user: null, dryRun: false },
      io(),
    )

    expect(instance.pushed.map((p) => p.path)).toEqual(['/api/v1/trips/trip-1/sync'])
  })

  it('refuses an unknown trip without writing anything', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Samedan', year: null, names: ['Andy'], user: null, dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.failed)
    expect(instance.pushed).toHaveLength(0)
    expect(it0.lines.join('\n')).toContain('Samedan')
  })

  // FR-2.5: the link is what makes the person on the trip the account on the
  // instance, and it is the half no import ever wrote.
  it('links the account named by --user', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    instance.users = [{ user_id: 'u-sia', display_name: 'Sia' }]

    await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Sia'], user: 'Sia', dryRun: false },
      io(),
    )

    expect(instance.mutations[0]?.fields?.['linked_user_id']).toBe('u-sia')
  })

  it('refuses an unknown account rather than writing an unlinked traveler', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Sia'], user: 'Sia', dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.failed)
    expect(instance.pushed).toHaveLength(0)
  })

  // An account can only be linked to one person, so --user with two names is
  // a mistake with a silent wrong answer.
  it('refuses --user with more than one name', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    instance.users = [{ user_id: 'u-sia', display_name: 'Sia' }]

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Sia', 'Andy'], user: 'Sia', dryRun: false },
      io(),
    )

    expect(code).toBe(EXIT.failed)
    expect(instance.pushed).toHaveLength(0)
  })
})

describe('runTraveler list', () => {
  it('reads the roster back and writes nothing', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    instance.addTraveler('trip-1', 'trv-1', 'Andy')
    instance.addTraveler('trip-1', 'trv-2', 'Sia')
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'list', trip: 'Cannobio', year: null, names: [], user: null, dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    expect(instance.pushed).toHaveLength(0)
    expect(it0.lines.join('\n')).toContain('Andy')
    expect(it0.lines.join('\n')).toContain('Sia')
  })

  it('says a trip has nobody rather than printing nothing', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    const it0 = io()

    await runTraveler(
      { ...conn, action: 'list', trip: 'Cannobio', year: null, names: [], user: null, dryRun: false },
      it0,
    )

    expect(it0.lines.join('\n')).toMatch(/no travell?ers/i)
  })
})

/**
 * The parity this command promises (FR-18.8): what it writes is what the app
 * would have written. M22's add is not the bare insert — a trip that still
 * follows its groups gets the new person's positions in the same breath
 * (FR-2.7, the FR-27.4 amendment of 2026-08-21), and a command that skips
 * that leaves a traveller on a trip with nothing to pack while the app's own
 * screen would have filled the list.
 */
describe('runTraveler add — the trip follows the roster (FR-2.7/FR-27.4)', () => {
  it('generates the new traveller\u2019s positions, as M22 does', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    instance.addFollowedGroup('trip-1', 'Zahnbürste')
    const it0 = io()

    const code = await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Sia'], user: null, dryRun: false },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    const written = instance.mutations.filter((m) => m.table === 'trip_items')
    expect(written.map((m) => m.fields?.['name'])).toEqual(['Zahnbürste'])
    // Reported, not left to be discovered: the screen says what appeared and
    // so must the command (FR-2.7's report).
    expect(it0.lines.join('\n')).toMatch(/1/)
  })

  /**
   * The positive control the case above needs: the rows come from the
   * refresh, not from something the command always does. A trip that follows
   * nothing writes the traveller and nothing else.
   */
  it('writes only the traveller when the trip follows no group', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    const it0 = io()

    await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Sia'], user: null, dryRun: false },
      it0,
    )

    expect(instance.mutations.map((m) => m.table)).toEqual(['travelers'])
  })

  it('adds nothing when the run is a dry run', async () => {
    instance.addTrip('trip-1', 'Cannobio', 2026)
    instance.addFollowedGroup('trip-1', 'Zahnbürste')

    await runTraveler(
      { ...conn, action: 'add', trip: 'Cannobio', year: null, names: ['Sia'], user: null, dryRun: true },
      io(),
    )

    expect(instance.pushed).toHaveLength(0)
  })
})
