import { describe, expect, it } from 'vitest'

import type { Idea, IdeaLink } from '../../types'
import {
  LINK_OWN,
  LINK_NEW,
  LINK_ROW,
  ideaLinks,
  linkDrafts,
  linkName,
  linkWrites,
  type LinkDraft,
} from '../links'

const OESCHINEN = 'https://www.oeschinensee.ch/sommer'
const SBB = 'https://www.sbb.ch/de/fahrplan'
const MAPS = 'https://maps.example.ch/route'

function idea(over: Partial<Idea> = {}): Idea {
  return {
    id: 'idea-1',
    trip_id: 'trip-1',
    author_id: 'user-andy',
    title: 'Oeschinensee',
    note: null,
    link: OESCHINEN,
    link_label: null,
    tag: null,
    rain_proof: false,
    state: 'idea',
    created_at: null,
    planned_on: null,
    planned_at: null,
    ...over,
  }
}

function row(id: string, url: string, position: number, over: Partial<IdeaLink> = {}): IdeaLink {
  return { id, trip_id: 'trip-1', idea_id: 'idea-1', url, label: null, position, ...over }
}

describe('ideaLinks (FR-29.22)', () => {
  it('puts the idea’s own link at 0 among its further links, in their positions', () => {
    const links = [
      row('l-2', MAPS, 2),
      row('l-0', SBB, -1),
      row('other', MAPS, 1, { idea_id: 'idea-2' }),
    ]
    expect(ideaLinks(idea(), links).map((l) => l.url)).toEqual([SBB, OESCHINEN, MAPS])
  })

  it('carries the own link’s label from the idea, a further link’s from its row', () => {
    const links = ideaLinks(idea({ link_label: 'Rundweg' }), [
      row('l-1', SBB, 1, { label: 'Bahn' }),
    ])
    expect(links.map((l) => [l.kind, l.label])).toEqual([
      [LINK_OWN, 'Rundweg'],
      [LINK_ROW, 'Bahn'],
    ])
  })

  it('has no own entry when the idea has no link of its own', () => {
    expect(ideaLinks(idea({ link: null }), [row('l-1', SBB, 1)]).map((l) => l.kind)).toEqual([
      LINK_ROW,
    ])
  })

  it('lets the own link win a tie, then the id, so every device agrees', () => {
    const links = [row('z', MAPS, 0), row('m', SBB, 0)]
    expect(ideaLinks(idea(), links).map((l) => l.url)).toEqual([OESCHINEN, SBB, MAPS])
  })
})

describe('linkName (FR-29.22)', () => {
  it('is the label the travellers gave it', () => {
    expect(linkName({ url: SBB, label: 'Bahn ab Bern' }, 'SBB Fahrplan')).toBe('Bahn ab Bern')
  })

  it('is the page’s title when it has no label', () => {
    expect(linkName({ url: SBB, label: null }, 'SBB Fahrplan')).toBe('SBB Fahrplan')
  })

  it('is the site when neither is there — Local Mode reads no page', () => {
    expect(linkName({ url: SBB, label: '  ' }, null)).toBe('sbb.ch')
  })
})

describe('linkWrites (FR-29.22)', () => {
  const draft = (
    kind: LinkDraft['kind'],
    id: string,
    url: string,
    label: string | null = null,
  ): LinkDraft => ({
    kind,
    id,
    url,
    label,
  })

  it('writes nothing for the drafts the idea already has', () => {
    const rows = [row('l-1', SBB, 1, { label: 'Bahn' })]
    const writes = linkWrites(idea(), rows, linkDrafts(idea(), rows))
    expect(writes).toEqual({ own: {}, inserts: [], updates: [], deletes: [] })
  })

  it('adds a new link behind the own one as a row', () => {
    const writes = linkWrites(
      idea(),
      [],
      [draft(LINK_OWN, 'idea-1', OESCHINEN), draft(LINK_NEW, 'n-1', SBB, 'Bahn')],
    )
    expect(writes.inserts).toEqual([row('n-1', SBB, 1, { label: 'Bahn' })])
    expect(writes.own).toEqual({})
  })

  it('makes the first new link the idea’s own when it has none, as a one-link idea always was', () => {
    const writes = linkWrites(
      idea({ link: null }),
      [],
      [draft(LINK_NEW, 'n-1', SBB, 'Bahn'), draft(LINK_NEW, 'n-2', MAPS)],
    )
    expect(writes.own).toEqual({ link: SBB, link_label: 'Bahn' })
    expect(writes.inserts).toEqual([row('n-2', MAPS, 1)])
  })

  it('moves a link before the own one to a negative position, leaving the idea alone', () => {
    const rows = [row('l-1', SBB, 1)]
    const writes = linkWrites(idea(), rows, [
      draft(LINK_ROW, 'l-1', SBB),
      draft(LINK_OWN, 'idea-1', OESCHINEN),
    ])
    expect(writes.updates).toEqual([{ id: 'l-1', fields: { position: -1 } }])
    expect(writes.own).toEqual({})
  })

  it('writes only the fields a kept link changed', () => {
    const rows = [row('l-1', SBB, 1, { label: 'Bahn' })]
    const writes = linkWrites(idea(), rows, [
      draft(LINK_OWN, 'idea-1', OESCHINEN, 'Rundweg'),
      draft(LINK_ROW, 'l-1', MAPS, 'Bahn'),
    ])
    expect(writes.own).toEqual({ link_label: 'Rundweg' })
    expect(writes.updates).toEqual([{ id: 'l-1', fields: { url: MAPS } }])
  })

  it('deletes a removed row, and clears a removed own link and its label', () => {
    const rows = [row('l-1', SBB, 1)]
    const writes = linkWrites(idea({ link_label: 'Rundweg' }), rows, [draft(LINK_ROW, 'l-1', SBB)])
    expect(writes.deletes).toEqual([])
    expect(writes.own).toEqual({ link: null, link_label: null })
    expect(linkWrites(idea(), rows, []).deletes).toEqual(['l-1'])
  })

  it('keeps the positions a delete left gaps in, and adds one past the last', () => {
    const rows = [row('l-1', SBB, 3), row('l-2', MAPS, 7)]
    const drafts = [...linkDrafts(idea(), rows), draft(LINK_NEW, 'n-1', 'https://gorropu.info')]
    const writes = linkWrites(idea(), rows, drafts)
    expect(writes.updates).toEqual([])
    expect(writes.inserts.map((l) => l.position)).toEqual([8])
  })

  it('drops a draft left blank — an added row nobody filled in is no link', () => {
    const writes = linkWrites(
      idea(),
      [],
      [draft(LINK_OWN, 'idea-1', OESCHINEN), draft(LINK_NEW, 'n-1', '  ')],
    )
    expect(writes.inserts).toEqual([])
  })

  it('stores a blank label as none, so the page title shows again', () => {
    const writes = linkWrites(
      idea({ link_label: 'Rundweg' }),
      [],
      [draft(LINK_OWN, 'idea-1', OESCHINEN, ' ')],
    )
    expect(writes.own).toEqual({ link_label: null })
  })
})
