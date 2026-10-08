/**
 * FR-29.16's kernel half: a server reads a pasted link's page, and then —
 * apart, so the words need not wait — the picture it names; Local Mode has
 * nobody to ask; an instance with previews off is asked once.
 */
import { describe, expect, it } from 'vitest'

import { APIRequestError } from '@/api/client'
import { API } from '@/api/routes'
import { ERROR_CODE } from '@/api/types'
import { createLinkPreview } from '../linkPreview'
import { stubClient } from './restClientStub'

const URL = 'https://www.oeschinensee.ch'
const PICTURE = 'https://www.oeschinensee.ch/see.jpg'

describe('createLinkPreview', () => {
  it('reads the page’s words and names its picture', async () => {
    const client = stubClient()
    client.answer({ title: 'Oeschinensee', description: '', image_url: PICTURE })

    const preview = await createLinkPreview({ client, localMode: false }).read('trip-1', URL)

    expect(client.calls).toEqual([
      { verb: 'post', path: API.tripLinkPreview('trip-1'), payload: { url: URL } },
    ])
    expect(preview).toEqual({
      title: 'Oeschinensee',
      description: null,
      imageUrl: PICTURE,
      links: [],
    })
  })

  it('carries the page’s links, for a connection behind a short link (FR-29.18)', async () => {
    const client = stubClient()
    const trip = 'https://www.sbb.ch/en/trip?tripId=3HA.a.b'
    client.answer({ title: '', description: '', image_url: '', links: [trip] })

    const preview = await createLinkPreview({ client, localMode: false }).read('trip-1', URL)

    expect(preview?.links).toEqual([trip])
  })

  it('reads the picture apart, as bytes', async () => {
    const client = stubClient()
    client.answer({ image: btoa('\xff\xd8\xff'), image_type: 'image/jpeg' })

    const picture = await createLinkPreview({ client, localMode: false }).picture('trip-1', PICTURE)

    expect(client.calls).toEqual([
      { verb: 'post', path: API.tripLinkPreviewImage('trip-1'), payload: { url: PICTURE } },
    ])
    expect(picture?.type).toBe('image/jpeg')
    expect(new Uint8Array(await picture!.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
  })

  it('answers null for a page or a picture it could not read', async () => {
    const client = stubClient()
    const unreadable = new APIRequestError(422, {
      code: ERROR_CODE.link_unreadable,
      message: 'unreadable',
    })
    client.fail(unreadable)
    client.fail(unreadable)
    const previews = createLinkPreview({ client, localMode: false })

    expect(await previews.read('trip-1', URL)).toBeNull()
    expect(await previews.picture('trip-1', PICTURE)).toBeNull()
    expect(previews.offered()).toBe(true)
  })

  it('asks nothing in Local Mode', async () => {
    const client = stubClient()
    const previews = createLinkPreview({ client, localMode: true })
    expect(previews.offered()).toBe(false)
    expect(await previews.read('trip-1', URL)).toBeNull()
    expect(await previews.picture('trip-1', PICTURE)).toBeNull()
    expect(client.calls).toEqual([])
  })

  it('stops asking once the instance says previews are off', async () => {
    const client = stubClient()
    client.fail(new APIRequestError(501, { code: ERROR_CODE.not_configured, message: 'off' }))
    const previews = createLinkPreview({ client, localMode: false })

    expect(previews.offered()).toBe(true)
    expect(await previews.read('trip-1', URL)).toBeNull()
    expect(previews.offered()).toBe(false)
    expect(await previews.read('trip-1', 'https://example.org')).toBeNull()
    expect(client.calls).toHaveLength(1)
  })

  it('keeps asking after a page that failed, since the next page may not', async () => {
    const client = stubClient()
    client.fail(new Error('offline'))
    client.answer({ title: 'Hütte', description: '', image_url: '' })
    const previews = createLinkPreview({ client, localMode: false })

    expect(await previews.read('trip-1', URL)).toBeNull()
    expect(await previews.read('trip-1', URL)).toMatchObject({ title: 'Hütte', imageUrl: null })
  })
})
