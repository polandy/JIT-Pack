import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseImportArgs, runImport, EXIT } from '../importCommand'
import type { Mutation } from '@/api/types'

/**
 * A fake instance: it answers the master pull from `feed` and records every
 * mutation pushed to it, so the assertions are about what went over the wire
 * rather than about what the command believed it did.
 */
class FakeInstance {
  feed: {
    seq: number
    table: string
    id: string
    deleted: boolean
    row: Record<string, unknown>
  }[] = []
  pushed: { path: string; mutations: Mutation[] }[] = []
  refuse: string | null = null
  tokens: (string | null)[] = []

  get mutations(): Mutation[] {
    return this.pushed.flatMap((p) => p.mutations)
  }

  tables(): string[] {
    return [...new Set(this.mutations.map((m) => m.table))]
  }

  handler = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const path = new URL(String(url)).pathname
    const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null
    this.tokens.push(auth)
    if (init?.method === 'POST') {
      if (this.refuse) {
        return new Response(
          JSON.stringify({ error: { code: 'validation', message: this.refuse } }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      const body = JSON.parse(String(init.body)) as { mutations: Mutation[] }
      this.pushed.push({ path, mutations: body.mutations })
      return Response.json({
        results: body.mutations.map((m) => ({ mutation_id: m.mutation_id, outcome: 'applied' })),
        pull_hint: { next_cursor: 0 },
      })
    }
    return Response.json({ changes: this.feed, next_cursor: this.feed.length, has_more: false })
  }
}

let instance: FakeInstance

function io(files: Record<string, string>) {
  const lines: string[] = []
  return {
    readFile: async (path: string) => {
      const body = files[path]
      if (body === undefined) throw new Error(`no such file: ${path}`)
      return body
    },
    write: (line: string) => lines.push(line),
    now: () => 1_700_000_000_000,
    deviceId: 'aabbccdd',
    lines,
  }
}

const TEMPLATE = `kind: template
name: Ferien
items:
  - name: Socken
    quantity: 3
    tags: [Kleidung]
`

const TRIP = `kind: trip
name: Cannobio
year: 2024
status: archived
items:
  - name: Socken
    quantity: 3
    from_inventory: true
`

beforeEach(() => {
  instance = new FakeInstance()
  vi.stubGlobal('fetch', instance.handler)
})
afterEach(() => vi.unstubAllGlobals())

describe('parseImportArgs', () => {
  const env = (m: Record<string, string>) => (k: string) => m[k]

  it('lets a flag win over the environment', () => {
    const parsed = parseImportArgs(
      ['--server', 'http://flag:3000', '--token', 'flag', 'a.yaml'],
      env({ JITPACK_SERVER: 'http://env:3000', JITPACK_TOKEN: 'env' }),
    )
    expect(parsed).toMatchObject({
      ok: true,
      serverUrl: 'http://flag:3000',
      token: 'flag',
      files: ['a.yaml'],
    })
  })

  it('takes from the environment what the flags omit', () => {
    const parsed = parseImportArgs(
      ['a.yaml'],
      env({ JITPACK_SERVER: 'http://env:3000', JITPACK_TOKEN: 'env' }),
    )
    expect(parsed).toMatchObject({ ok: true, serverUrl: 'http://env:3000', token: 'env' })
  })

  it('still knows where to look with nothing set', () => {
    const parsed = parseImportArgs(['a.yaml'], env({}))
    expect(parsed.ok && parsed.serverUrl).toBeTruthy()
  })

  it('refuses an invocation with no file rather than succeeding emptily', () => {
    expect(parseImportArgs([], env({}))).toMatchObject({ ok: false })
  })

  it('refuses a flag it does not know', () => {
    const parsed = parseImportArgs(['--nope', 'a.yaml'], env({}))
    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok === false && 'error' in parsed && parsed.error).toContain('--nope')
  })

  // Asking for help is not a usage error: the caller has to be able to tell
  // them apart, because one belongs on stdout with exit 0 and the other on
  // stderr with exit 2.
  it('separates asking for help from getting it wrong', () => {
    for (const flag of ['-h', '--help']) {
      expect(parseImportArgs([flag], env({}))).toEqual({ ok: false, help: true })
    }
    expect(parseImportArgs([], env({}))).toMatchObject({ ok: false, error: expect.any(String) })
  })
})

describe('runImport', () => {
  // FR-18.7: the command exists to put a file into a running instance, and
  // what proves it is the mutations that arrive — an import that writes rows
  // without mutations is the defect this whole change removes.
  it('sends the document as sync mutations, not as a document', async () => {
    const it0 = io({ 'f.yaml': TEMPLATE })
    const code = await runImport(
      { serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    // An import writes master data, so every push goes to the master
    // partition's endpoint — named exactly rather than by prefix, because
    // the paths lead with their scope now (NFR-4.14, ADR-027) and a prefix
    // that no longer distinguishes anything asserts nothing.
    expect(instance.pushed.map((p) => p.path)).toEqual(
      Array(instance.pushed.length).fill('/api/v1/master/sync'),
    )
    expect(instance.pushed.length).toBeGreaterThan(0)
    expect(instance.tables()).toEqual(
      expect.arrayContaining(['templates', 'items', 'template_items']),
    )
    expect(it0.lines.join('\n')).toContain('Ferien')
  })

  // The whole point of sharing the client's rules: a trip keeps what the
  // server's own importer used to drop (ADR-024/ADR-025).
  it('keeps the status and the tags the file carries', async () => {
    const it0 = io({ 'f.yaml': `${TEMPLATE}---\n${TRIP}` })
    await runImport({ serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] }, it0)

    const trip = instance.mutations.find((m) => m.table === 'trips')
    expect(trip?.fields?.['status']).toBe('archived')
    expect(instance.tables()).toContain('item_tags')
  })

  // FR-18.4: matching happens per document as it is imported, so the trip
  // lands on the item the template just created instead of a second copy.
  it('matches a later document against what an earlier one created', async () => {
    const it0 = io({ 'f.yaml': `${TEMPLATE}---\n${TRIP}` })
    await runImport({ serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] }, it0)

    const socken = instance.mutations.filter(
      (m) => m.table === 'items' && m.fields?.['name'] === 'Socken',
    )
    expect(socken).toHaveLength(1)
    const row = instance.mutations.find((m) => m.table === 'trip_items')
    expect(row?.fields?.['source_item_id']).toBe(socken[0]!.id)
  })

  // …and against what the instance already has, which is why the pull
  // happens before anything is planned.
  it('matches against the inventory the instance already holds', async () => {
    instance.feed = [
      { seq: 1, table: 'items', id: 'existing', deleted: false, row: { name: 'Socken' } },
    ]
    const it0 = io({ 'f.yaml': TEMPLATE })
    await runImport({ serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] }, it0)

    expect(instance.mutations.filter((m) => m.table === 'items')).toHaveLength(0)
    const position = instance.mutations.find((m) => m.table === 'template_items')
    expect(position?.fields?.['item_id']).toBe('existing')
  })

  it('reports an unreadable document in its place and imports the rest', async () => {
    const it0 = io({ 'f.yaml': `${TEMPLATE}---\nkind: nonsense\nname: Kaputt\n---\n${TRIP}` })
    const code = await runImport(
      { serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] },
      it0,
    )

    expect(code).toBe(EXIT.documentFailed)
    expect(it0.lines.join('\n')).toContain('nonsense')
    expect(instance.tables()).toContain('trips')
  })

  it('says so when the file is not there', async () => {
    const it0 = io({})
    const code = await runImport(
      { serverUrl: 'http://x', token: null, dryRun: false, files: ['missing.yaml'] },
      it0,
    )
    expect(code).toBe(EXIT.documentFailed)
    expect(it0.lines.join('\n')).toContain('missing.yaml')
  })

  it('reports the server’s refusal instead of swallowing it', async () => {
    instance.refuse = 'year out of range'
    const it0 = io({ 'f.yaml': TEMPLATE })
    const code = await runImport(
      { serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] },
      it0,
    )
    expect(code).toBe(EXIT.documentFailed)
    expect(it0.lines.join('\n')).toContain('year out of range')
  })

  it('sends nothing at all on a dry run, and still reports what it read', async () => {
    const it0 = io({ 'f.yaml': `${TEMPLATE}---\nkind: nonsense\nname: Kaputt\n` })
    const code = await runImport(
      { serverUrl: 'http://x', token: null, dryRun: true, files: ['f.yaml'] },
      it0,
    )

    expect(instance.pushed).toHaveLength(0)
    expect(code).toBe(EXIT.documentFailed)
    const report = it0.lines.join('\n')
    expect(report).toContain('Ferien')
    expect(report).not.toContain('imported')
  })

  it('carries the token on every request, not only the first', async () => {
    const it0 = io({ 'f.yaml': `${TEMPLATE}---\n${TRIP}` })
    await runImport(
      { serverUrl: 'http://x', token: 't0ken', dryRun: false, files: ['f.yaml'] },
      it0,
    )

    expect(instance.tokens.length).toBeGreaterThan(1)
    expect(instance.tokens.every((t) => t === 'Bearer t0ken')).toBe(true)
  })

  // Sync-API §9 caps a push at 200 mutations; a real Vorlage is well past it,
  // and a whole-file rejection is what the cap costs if nobody chunks.
  it('chunks a document that is larger than one push', async () => {
    const many = Array.from(
      { length: 150 },
      (_, i) => `  - name: Item ${i}\n    quantity: 1\n`,
    ).join('')
    const it0 = io({ 'f.yaml': `kind: template\nname: Gross\nitems:\n${many}` })
    const code = await runImport(
      { serverUrl: 'http://x', token: null, dryRun: false, files: ['f.yaml'] },
      it0,
    )

    expect(code).toBe(EXIT.ok)
    expect(instance.mutations.length).toBeGreaterThan(200)
    expect(instance.pushed.every((p) => p.mutations.length <= 200)).toBe(true)
  })
})
