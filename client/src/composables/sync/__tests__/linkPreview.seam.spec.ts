/**
 * FR-29.16's kernel half: a server reads a pasted link's page; Local Mode
 * has nobody to ask; an instance with previews off is asked once.
 */
import { describe, expect, it } from 'vitest'

import { APIRequestError } from '@/api/client'
import { API } from '@/api/routes'
import { ERROR_CODE } from '@/api/types'
import { createLinkPreview } from '../linkPreview'
import { stubClient } from './restClientStub'

const URL = 'https://www.oeschinensee.ch'

describe('createLinkPreview', () => {
  it('asks the trip’s route and hands back the page’s picture as bytes', async () => {
    const client = stubClient()
    client.answer({
      title: 'Oeschinensee',
      description: '',
      image: btoa('\xff\xd8\xff'),
      image_type: 'image/jpeg',
    })

    const preview = await createLinkPreview({ client, localMode: false }).read('trip-1', URL)

    expect(client.calls).toEqual([
      { verb: 'post', path: API.tripLinkPreview('trip-1'), payload: { url: URL } },
    ])
    expect(preview).toMatchObject({ title: 'Oeschinensee', description: null })
    expect(preview?.picture?.type).toBe('image/jpeg')
    expect(new Uint8Array(await preview!.picture!.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    )
  })

  it('answers null for a page without a picture’s bytes as for one it could not read', async () => {
    const client = stubClient()
    client.answer({ title: '', description: '', image: '', image_type: '' })
    client.fail(
      new APIRequestError(422, { code: ERROR_CODE.link_unreadable, message: 'unreadable' }),
    )
    const preview = createLinkPreview({ client, localMode: false })

    expect(await preview.read('trip-1', URL)).toEqual({
      title: null,
      description: null,
      picture: null,
    })
    expect(await preview.read('trip-1', URL)).toBeNull()
  })

  it('asks nothing in Local Mode', async () => {
    const client = stubClient()
    const previews = createLinkPreview({ client, localMode: true })
    expect(previews.offered()).toBe(false)
    expect(await previews.read('trip-1', URL)).toBeNull()
    expect(client.calls).toEqual([])
  })

  it('stops asking once the instance says previews are off', async () => {
    const client = stubClient()
    client.fail(new APIRequestError(501, { code: ERROR_CODE.not_configured, message: 'off' }))
    const preview = createLinkPreview({ client, localMode: false })

    expect(preview.offered()).toBe(true)
    expect(await preview.read('trip-1', URL)).toBeNull()
    expect(preview.offered()).toBe(false)
    expect(await preview.read('trip-1', 'https://example.org')).toBeNull()
    expect(client.calls).toHaveLength(1)
  })

  it('keeps asking after a page that failed, since the next page may not', async () => {
    const client = stubClient()
    client.fail(new Error('offline'))
    client.answer({ title: 'Hütte', description: '', image: '', image_type: '' })
    const preview = createLinkPreview({ client, localMode: false })

    expect(await preview.read('trip-1', URL)).toBeNull()
    expect(await preview.read('trip-1', URL)).toMatchObject({ title: 'Hütte' })
  })
})
