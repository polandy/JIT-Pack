import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseTagsArgs, runTags, type TagsOptions } from '../tagsCommand'
import { parseTagPlan } from '../tagPlan'
import { EXIT } from '../common'
import type { Mutation } from '@/api/types'

/**
 * A fake instance holding one master partition. Every assertion on a write
 * reads `pushed` — what reached the sync endpoint — because that, not the
 * command's own report, is what another device will receive.
 */
class FakeInstance {
  master: {
    seq: number
    table: string
    id: string
    deleted: boolean
    row: Record<string, unknown>
  }[] = []
  pushed: Mutation[] = []
  pulls = 0

  add(table: string, id: string, row: Record<string, unknown>): void {
    this.master.push({
      seq: this.master.length + 1,
      table,
      id,
      deleted: false,
      row: { id, ...row },
    })
  }

  tag(id: string, name: string, icon: string | null = null): void {
    this.add('tags', id, { name, sort_order: this.master.length, icon })
  }

  item(id: string, name: string, retired = false): void {
    this.add('items', id, { name, retired_at: retired ? '2026-01-01T00:00:00.000Z' : null })
  }

  assign(id: string, itemId: string, tagId: string, position: number): void {
    this.add('item_tags', id, { item_id: itemId, tag_id: tagId, position })
  }

  handler = async (_url: string | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { mutations: Mutation[] }
      this.pushed.push(...body.mutations)
      return Response.json({
        results: body.mutations.map((m) => ({ mutation_id: m.mutation_id, outcome: 'applied' })),
        pull_hint: { next_cursor: 0 },
      })
    }
    this.pulls++
    return Response.json({ changes: this.master, next_cursor: this.master.length, has_more: false })
  }
}

let instance: FakeInstance

function io(plan = '') {
  const lines: string[] = []
  return {
    readFile: async () => plan,
    write: (line: string) => lines.push(line),
    now: () => 1_700_000_000_000,
    deviceId: 'aabbccdd',
    lines,
  }
}

const conn = { serverUrl: 'http://x', token: null }

function options(argv: string[]): TagsOptions {
  const parsed = parseTagsArgs(argv, () => undefined)
  if (!parsed.ok) throw new Error(`fixture does not parse: ${argv.join(' ')}`)
  return { ...parsed, ...conn }
}

/** The assignments as the pushed mutations leave them: item → tag ids, primary first. */
function filingAfterPush(): Map<string, string[]> {
  const rows = new Map<string, { item_id: string; tag_id: string; position: number }>()
  for (const entry of instance.master) {
    if (entry.table === 'item_tags') rows.set(entry.id, entry.row as never)
  }
  for (const m of instance.pushed) {
    if (m.table !== 'item_tags') continue
    if (m.op === 'delete') rows.delete(m.id)
    else rows.set(m.id, { ...(rows.get(m.id) ?? {}), ...(m.fields as object) } as never)
  }
  const out = new Map<string, string[]>()
  for (const row of [...rows.values()].sort((a, b) => a.position - b.position)) {
    out.set(row.item_id, [...(out.get(row.item_id) ?? []), row.tag_id])
  }
  return out
}

beforeEach(() => {
  instance = new FakeInstance()
  vi.stubGlobal('fetch', instance.handler)
})
afterEach(() => vi.unstubAllGlobals())

describe('parseTagsArgs (FR-18.9)', () => {
  const env = (m: Record<string, string>) => (k: string) => m[k]

  it('reads a give with its tag and items, filing by default', () => {
    expect(parseTagsArgs(['give', 'Hygiene', 'Zahnbürste', 'Seife'], env({}))).toMatchObject({
      ok: true,
      task: {
        kind: 'step',
        step: { op: 'give', tag: 'Hygiene', items: ['Zahnbürste', 'Seife'], primary: true },
      },
    })
  })

  it('reads --no-primary as only adding the tag', () => {
    expect(parseTagsArgs(['give', 'Reise', 'Kissen', '--no-primary'], env({}))).toMatchObject({
      ok: true,
      task: { step: { primary: false } },
    })
  })

  it('takes the connection from the environment when the flags omit it', () => {
    expect(
      parseTagsArgs(['list'], env({ JITPACK_SERVER: 'http://env:3000', JITPACK_TOKEN: 't' })),
    ).toMatchObject({ ok: true, serverUrl: 'http://env:3000', token: 't' })
  })

  it.each([
    [[], 'no action'],
    [['shuffle', 'X'], 'unknown action'],
    [['rename', 'X'], 'rename takes 2 names'],
    [['merge', 'X', 'Y', 'Z'], 'merge takes 2 names'],
    [['give', 'X'], 'at least one item'],
    [['take', 'X'], 'either items or --all'],
    [['take', 'X', 'Y', '--all'], 'either items or --all'],
    [['mark', 'X'], 'either an emoji or --clear'],
    [['apply'], 'one plan file'],
    [['list', '--bogus'], 'unknown flag'],
  ])('refuses %j (%s)', (argv, error) => {
    const parsed = parseTagsArgs(argv, env({}))
    expect(parsed.ok).toBe(false)
    expect('error' in parsed && parsed.error).toContain(error)
  })
})

describe('parseTagPlan', () => {
  it('reads every step kind in order', () => {
    const plan = parseTagPlan(`
- merge: Elektronik
  into: Technik
- rename: Bad
  to: Hygiene
- give: Reise
  primary: false
  items: [Kissen]
- take: Diverses
  items: all
- delete: Diverses
- mark: Technik
  as: 🔌
- mark: Reise
  as: null
`)
    expect(plan).toEqual({
      steps: [
        { op: 'merge', tag: 'Elektronik', into: 'Technik' },
        { op: 'rename', tag: 'Bad', to: 'Hygiene' },
        { op: 'give', tag: 'Reise', items: ['Kissen'], primary: false },
        { op: 'take', tag: 'Diverses', items: 'all' },
        { op: 'delete', tag: 'Diverses' },
        { op: 'mark', tag: 'Technik', mark: '🔌' },
        { op: 'mark', tag: 'Reise', mark: null },
      ],
    })
  })

  it.each([
    ['merge: X', 'a list of steps'],
    ['- merge: X', 'merge needs "into"'],
    ['- merge: X\n  to: Y', '"to" does not belong to merge'],
    ['- give: X\n  items: []', 'give needs a list'],
    ['- give: X\n  items: [A]\n  primary: yes please', '"primary" is true or false'],
    ['- delete: X\n  rename: Y', 'exactly one of'],
    ['- mark: X', 'mark needs "as"'],
    ['- [a, b]', 'expected a mapping'],
    ['- give: [', 'not YAML'],
  ])('refuses %j and names the step', (text, error) => {
    const plan = parseTagPlan(text)
    expect('error' in plan && plan.error).toContain(error)
  })
})

describe('runTags', () => {
  beforeEach(() => {
    instance.tag('t-div', 'Diverses')
    instance.tag('t-tec', 'Technik')
    instance.tag('t-ele', 'Elektronik')
    instance.item('i-kab', 'Ladekabel')
    instance.item('i-zb', 'Zahnbürste')
    instance.item('i-alt', 'Alte Kamera', true)
    instance.assign('a-1', 'i-kab', 't-ele', 0)
    instance.assign('a-2', 'i-zb', 't-div', 0)
    instance.assign('a-3', 'i-alt', 't-div', 0)
  })

  it('lists each tag with its mark and a count that includes retired items', async () => {
    const out = io()
    expect(await runTags(options(['list', '--items']), out)).toBe(EXIT.ok)
    expect(out.lines).toEqual([
      'Diverses — 2 items',
      '  Zahnbürste',
      'Technik — 0 items',
      'Elektronik — 1 item',
      '  Ladekabel',
    ])
  })

  it('files items under a new tag, creating it, and pushes the writes (FR-24.9)', async () => {
    const out = io()
    expect(await runTags(options(['give', 'Hygiene', 'zahnbürste']), out)).toBe(EXIT.ok)

    const created = instance.pushed.find((m) => m.table === 'tags')
    expect(created?.fields).toMatchObject({ name: 'Hygiene' })
    expect(filingAfterPush().get('i-zb')?.[0]).toBe(created?.id)
    expect(out.lines).toContain('give Hygiene (new tag): 1 of 1 item filed under it')
  })

  it('runs a plan: merge, take all, delete — and the leftover item is filed where it was', async () => {
    const plan = `
- merge: Elektronik
  into: Technik
- give: Technik
  items: [Zahnbürste]
  primary: false
- take: Diverses
  items: all
`
    const out = io(plan)
    expect(await runTags(options(['apply', 'plan.yaml']), out)).toBe(EXIT.ok)

    const filing = filingAfterPush()
    expect(filing.get('i-kab')).toEqual(['t-tec'])
    expect(filing.get('i-zb')).toEqual(['t-tec'])
    expect(instance.pushed).toContainEqual(expect.objectContaining({ op: 'delete', id: 't-ele' }))
    // „all" is what M9's „Alle N" selects: active items only.
    expect(filing.get('i-alt')).toEqual(['t-div'])
  })

  it('refuses a delete retired items still block, says so, and sends nothing', async () => {
    const out = io('- take: Diverses\n  items: all\n- delete: Diverses\n')
    expect(await runTags(options(['apply', 'plan.yaml']), out)).toBe(EXIT.failed)

    expect(out.lines.at(-1)).toBe(
      'step 2 (delete Diverses): 1 item still carry it, 1 of them retired — merge it into another tag instead — nothing sent',
    )
    expect(instance.pulls).toBe(1)
    expect(instance.pushed).toEqual([])
  })

  it('refuses a rename onto a taken name, naming the holder', async () => {
    const out = io()
    expect(await runTags(options(['rename', 'Diverses', 'technik']), out)).toBe(EXIT.failed)
    expect(out.lines.at(-1)).toContain('"Technik" already exists — merge into it instead')
    expect(instance.pushed).toEqual([])
  })

  it('refuses an item only a retired row is called, rather than writing to it', async () => {
    const out = io()
    expect(await runTags(options(['give', 'Technik', 'Alte Kamera']), out)).toBe(EXIT.failed)
    expect(out.lines.at(-1)).toContain('"Alte Kamera" is retired')
    expect(instance.pushed).toEqual([])
  })

  it('refuses a missing item before creating the tag it would have gone into', async () => {
    const out = io()
    expect(await runTags(options(['give', 'Hygiene', 'Seife']), out)).toBe(EXIT.failed)
    expect(out.lines.at(-1)).toContain('no item called "Seife"')
    expect(instance.pushed).toEqual([])
  })

  it('refuses a mark outside the picker’s index (FR-28.6)', async () => {
    const out = io()
    expect(await runTags(options(['mark', 'Technik', 'x']), out)).toBe(EXIT.failed)
    expect(out.lines.at(-1)).toContain('not in the mark picker')
  })

  it('sets and clears a mark', async () => {
    expect(await runTags(options(['mark', 'Technik', '🔌']), io())).toBe(EXIT.ok)
    expect(instance.pushed.at(-1)).toMatchObject({
      table: 'tags',
      id: 't-tec',
      fields: { icon: '🔌' },
    })
  })

  it('a dry run reports the writes and the resulting axis, and sends nothing', async () => {
    const out = io()
    expect(await runTags(options(['merge', 'Elektronik', 'Technik', '--dry-run']), out)).toBe(
      EXIT.ok,
    )

    expect(instance.pulls).toBe(1)
    expect(instance.pushed).toEqual([])
    expect(out.lines).toEqual([
      'merge Elektronik → Technik: 1 item moved, Elektronik removed',
      '2 writes (dry run, not sent). Tags afterwards:',
      '  Diverses — 2 items',
      '  Technik — 1 item',
    ])
  })

  it('reports a plan that cannot be read without pulling anything', async () => {
    const out = io('- shuffle: X')
    expect(await runTags(options(['apply', 'plan.yaml']), out)).toBe(EXIT.failed)
    expect(out.lines[0]).toContain('plan.yaml: step 1')
    expect(instance.pulls).toBe(0)
  })
})
