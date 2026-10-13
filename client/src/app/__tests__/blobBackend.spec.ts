/**
 * ARCH-14c: the mode picks where the bytes outside the envelope go, once.
 * A Local Mode device never reaches for a server, and a server client never
 * touches the device's store — checked on each of the four groups.
 */
import { describe, it, expect, vi } from 'vitest'

import { createBlobBackend } from '../blobBackend'
import type { ImageStore } from '../images'
import { stubClient } from './restClientStub'
import type { MasterItem } from '@/types/domain'

const ITEM = { id: 'item-1', name: 'Zelt', image_hash: 'h' } as MasterItem

function store() {
  return {
    putImage: vi.fn((_id: string, _blob: Blob) => Promise.resolve()),
    deleteImage: vi.fn((_id: string) => Promise.resolve()),
    getImage: vi.fn((_id: string): Promise<Blob | null> => Promise.resolve(new Blob(['x']))),
  } satisfies ImageStore
}

function backend(local: ImageStore | null) {
  const client = stubClient()
  return {
    client,
    blobs: createBlobBackend({
      local,
      client,
      baseUrl: 'http://srv',
      applyChanges: () => {},
      drainMaster: () => Promise.resolve(),
      drainTrip: () => Promise.resolve(),
      whenSent: () => Promise.resolve(),
    }),
  }
}

describe('createBlobBackend — ARCH-14c', () => {
  it('reads from the device store and sends nothing when the device holds the store', async () => {
    const local = store()
    const { client, blobs } = backend(local)

    expect(await blobs.images.itemImageUrl(ITEM)).toMatch(/^blob:/)
    await blobs.ideaTracks.forget(['t-1'])
    await blobs.pictures.forget(['p-1'])

    expect(local.getImage).toHaveBeenCalledWith('item-1')
    expect(local.deleteImage.mock.calls).toEqual([['t-1'], ['p-1']])
    expect(client.calls).toEqual([])
  })

  it('addresses the server and never the device store when a server answers', async () => {
    const { client, blobs } = backend(null)

    expect(await blobs.images.itemImageUrl(ITEM)).toBe('http://srv/api/v1/items/item-1/image?v=h')
    await blobs.ideaTracks.forget(['t-1'])
    await blobs.excursionTracks.forget(['t-2'])
    await blobs.pictures.forget(['p-1'])

    expect(client.calls).toEqual([])
  })
})
