/**
 * FR-29.5 in both modes. An idea picture's bytes never travel in the sync
 * envelope (ADR-002): Server Mode uploads them under the picture's own id
 * and lets a trip drain bring the row back, Local Mode keeps them on the
 * device and writes the row itself through the pull funnel. Reading one in
 * Server Mode is a bearer-authenticated fetch, because the bytes are the
 * trip's — so what a screen gets is an object URL.
 */
import { describe, it, expect, vi } from 'vitest'

import { API } from '@/api/routes'
import type { PullChange } from '@/api/types'
import type { IdeaImage } from '@/types/domain'
import { TABLE } from '@/api/tables'
import { createIdeaPictures } from '../ideaImages'
import type { ImageStore } from '../images'
import { hashBlob } from '@/sync/rows'
import { stubClient } from './restClientStub'

const JPEG = new Blob(['scaled'], { type: 'image/jpeg' })
const STORED = new Blob(['stored'], { type: 'image/jpeg' })

const PICTURE: IdeaImage = {
  id: 'ii-1',
  trip_id: 'trip-1',
  idea_id: 'idea-1',
  image_hash: 'abc',
  position: 0,
}

function deviceStore() {
  return {
    putImage: vi.fn((_id: string, _blob: Blob) => Promise.resolve()),
    deleteImage: vi.fn((_id: string) => Promise.resolve()),
    getImage: vi.fn((_id: string): Promise<Blob | null> => Promise.resolve(STORED)),
  } satisfies ImageStore
}

function pictures(local: ImageStore | null) {
  const client = stubClient()
  const applied: PullChange[] = []
  const drainTrip = vi.fn((_tripId: string) => Promise.resolve())
  const order: string[] = []
  const whenSent = vi.fn((_tripId: string) => {
    order.push('whenSent')
    return Promise.resolve()
  })
  const made: Blob[] = []
  return {
    client,
    applied,
    drainTrip,
    whenSent,
    order,
    made,
    pictures: createIdeaPictures({
      client,
      local,
      applyChanges: (changes) => void applied.push(...changes),
      drainTrip,
      whenSent,
      optimize: () => Promise.resolve(JPEG),
      objectUrl: (blob) => {
        made.push(blob)
        return `blob:${made.length}`
      },
    }),
  }
}

const { image_hash: _hash, ...UPLOAD } = PICTURE

describe('adding a picture in Server Mode', () => {
  it('uploads the scaled bytes under the picture id and pulls the row back', async () => {
    const { client, applied, drainTrip, pictures: p } = pictures(null)
    client.answer(undefined)

    await p.add(UPLOAD, new Blob(['a huge original']))

    expect(client.calls).toEqual([
      {
        verb: 'putRaw',
        path: API.tripIdeaImage('trip-1', 'idea-1', 'ii-1'),
        payload: { body: JPEG, contentType: 'image/jpeg' },
      },
    ])
    // No optimistic row: the server places the picture, and a guessed
    // position would disagree with the next pull.
    expect(applied).toEqual([])
    expect(drainTrip).toHaveBeenCalledWith('trip-1')
  })

  /*
   * The idea a picture belongs to may still be in this device's outbox — a
   * new idea saved with a picture, the dev seed — and the server refuses a
   * picture for an idea it does not have yet. So the trip's queued writes
   * go first.
   */
  it('lets the trip’s queued writes reach the server before the upload', async () => {
    const { client, whenSent, order, pictures: p } = pictures(null)
    const putRaw = client.putRaw
    client.putRaw = (...args) => {
      order.push('putRaw')
      return putRaw(...args)
    }
    client.answer(undefined)

    await p.add(UPLOAD, new Blob(['photo']))

    expect(whenSent).toHaveBeenCalledWith('trip-1')
    expect(order).toEqual(['whenSent', 'putRaw'])
  })

  it('uploads nothing when those writes cannot be sent', async () => {
    const { client, whenSent, pictures: p } = pictures(null)
    whenSent.mockImplementationOnce(() => Promise.reject(new Error('offline')))

    await expect(p.add(UPLOAD, new Blob(['photo']))).rejects.toThrow('offline')
    expect(client.calls).toEqual([])
  })

  it('writes nothing when the upload fails', async () => {
    const { client, applied, drainTrip, pictures: p } = pictures(null)
    client.fail(new Error('offline'))

    await expect(p.add(UPLOAD, new Blob(['x']))).rejects.toThrow('offline')
    expect(applied).toEqual([])
    expect(drainTrip).not.toHaveBeenCalled()
  })
})

describe('adding a picture in Local Mode', () => {
  it('keeps the bytes on the device and funnels the row with their hash', async () => {
    const local = deviceStore()
    const { client, applied, pictures: p } = pictures(local)

    await p.add(UPLOAD, new Blob(['a huge original']))

    expect(local.putImage).toHaveBeenCalledWith('ii-1', JPEG)
    expect(client.calls).toEqual([])
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      table: TABLE.ideaImages,
      id: 'ii-1',
      deleted: false,
      row: { trip_id: 'trip-1', idea_id: 'idea-1', position: 0, image_hash: await hashBlob(JPEG) },
    })
  })
})

describe('showing a picture', () => {
  it('fetches the bytes with the member credentials in Server Mode, once per picture', async () => {
    const { client, made, pictures: p } = pictures(null)
    client.answer(STORED)

    const first = await p.url(PICTURE)
    const second = await p.url(PICTURE)

    expect(client.calls).toEqual([
      { verb: 'getBlob', path: API.tripIdeaImage('trip-1', 'idea-1', 'ii-1') },
    ])
    expect(made).toEqual([STORED])
    expect(first).toBe('blob:1')
    expect(second).toBe(first)
  })

  it('answers null when the bytes cannot be fetched, and asks again next time', async () => {
    const { client, pictures: p } = pictures(null)
    client.fail(new Error('offline'))
    client.answer(STORED)

    expect(await p.url(PICTURE)).toBeNull()
    expect(await p.url(PICTURE)).toBe('blob:1')
    expect(client.calls).toHaveLength(2)
  })

  it('reads the device store in Local Mode', async () => {
    const local = deviceStore()
    const { client, pictures: p } = pictures(local)

    expect(await p.url(PICTURE)).toBe('blob:1')
    expect(local.getImage).toHaveBeenCalledWith('ii-1')
    expect(client.calls).toEqual([])
  })
})

describe('forgetting pictures', () => {
  it('drops the bytes from the device in Local Mode', async () => {
    const local = deviceStore()
    const { pictures: p } = pictures(local)

    await p.forget(['ii-1', 'ii-2'])

    expect(local.deleteImage.mock.calls).toEqual([['ii-1'], ['ii-2']])
  })

  it('leaves them to the server otherwise, whose delete takes them', async () => {
    const { client, pictures: p } = pictures(null)
    await p.forget(['ii-1'])
    expect(client.calls).toEqual([])
  })
})
