/**
 * FR-22.1/22.5 in both modes. The bytes never travel in the sync envelope
 * (ADR-002): Server Mode uploads them and lets a master drain bring the
 * hash back, Local Mode writes them to the device and computes the hash
 * itself — and the *same* funnel every pulled row passes through is what
 * carries it, or the photo would be on the device and off the list.
 */
import { describe, it, expect, vi } from 'vitest'

import { API } from '@/api/routes'
import { TABLE } from '@/types/tables'
import { createImageActions, type ImageStore } from '../images'
import { stubClient } from './restClientStub'
import type { PullChange } from '@/api/types'
import type { MasterItem } from '@/types/domain'

const JPEG = new Blob(['optimized'], { type: 'image/jpeg' })

function item(over: Partial<MasterItem> = {}): MasterItem {
  return { id: 'item-1', name: 'Zelt', image_hash: null, ...over } as MasterItem
}

function deviceStore(): ImageStore & {
  put: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
} {
  const put = vi.fn(() => Promise.resolve())
  const del = vi.fn(() => Promise.resolve())
  return {
    put,
    del,
    putImage: put,
    deleteImage: del,
    getImage: () => Promise.resolve(new Blob(['stored'])),
  }
}

function actions(local: ImageStore | null) {
  const client = stubClient()
  const applied: PullChange[] = []
  const drainMaster = vi.fn(() => Promise.resolve())
  return {
    client,
    applied,
    drainMaster,
    images: createImageActions({
      client,
      local,
      baseUrl: 'http://localhost',
      applyChanges: (changes) => void applied.push(...changes),
      drainMaster,
      // The source is never read here: what the optimizer does is
      // `lib/imageResize`'s promise, that it runs first is this group's.
      optimize: () => Promise.resolve(JPEG),
    }),
  }
}

describe('setItemImage in Server Mode', () => {
  it('uploads the optimized bytes and pulls the hash the server stamped', async () => {
    const { client, applied, drainMaster, images } = actions(null)
    client.answer(undefined)

    await images.setItemImage(item(), new Blob(['huge original']))

    expect(client.calls[0]).toMatchObject({
      verb: 'putRaw',
      path: API.itemImage('item-1'),
      payload: { body: JPEG, contentType: 'image/jpeg' },
    })
    // No optimistic row: `items.image_hash` is the server's to write, and a
    // guessed one would disagree with the next pull.
    expect(applied).toEqual([])
    expect(drainMaster).toHaveBeenCalledTimes(1)
  })
})

describe('setItemImage in Local Mode', () => {
  it('stores the bytes and funnels the hash through the change path', async () => {
    const local = deviceStore()
    const { client, applied, drainMaster, images } = actions(local)

    await images.setItemImage(item(), new Blob(['huge original']))

    expect(local.put).toHaveBeenCalledWith('item-1', JPEG)
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({ table: TABLE.items, id: 'item-1' })
    // There is no server to stamp it, so the device computes one — and it
    // has to be a hash of what was actually stored.
    expect(applied[0]!.row!['image_hash']).toEqual(expect.any(String))
    expect(applied[0]!.row!['name']).toBe('Zelt')
    // Nothing goes to the network, and there is nothing to drain.
    expect(client.calls).toEqual([])
    expect(drainMaster).not.toHaveBeenCalled()
  })
})

describe('deleteItemImage (FR-22.5)', () => {
  it('deletes on the server and pulls the cleared hash', async () => {
    const { client, drainMaster, images } = actions(null)
    client.answer(undefined)

    await images.deleteItemImage(item({ image_hash: 'abc' }))

    expect(client.calls[0]).toMatchObject({ verb: 'delete', path: API.itemImage('item-1') })
    expect(drainMaster).toHaveBeenCalledTimes(1)
  })

  it('clears the hash on the device itself in Local Mode', async () => {
    const local = deviceStore()
    const { applied, images } = actions(local)

    await images.deleteItemImage(item({ image_hash: 'abc' }))

    expect(local.del).toHaveBeenCalledWith('item-1')
    expect(applied[0]!.row!['image_hash']).toBeNull()
  })
})

describe('itemImageUrl', () => {
  it('is null for an item with no photo, in either mode', async () => {
    const { client, images } = actions(null)

    expect(await images.itemImageUrl(item())).toBeNull()
    // The guard is what keeps the lookup off the wire, so an unqueued
    // answer would be the proof it fired.
    expect(client.calls).toEqual([])
  })

  it('points at the public endpoint, versioned by the hash', async () => {
    const { images } = actions(null)

    expect(await images.itemImageUrl(item({ image_hash: 'abc' }))).toBe(
      `http://localhost${API.itemImage('item-1')}?v=abc`,
    )
  })

  it('hands Local Mode an object URL over the stored bytes', async () => {
    const createObjectURL = vi.fn(() => 'blob:stored')
    vi.stubGlobal('URL', { ...URL, createObjectURL })
    const { images } = actions(deviceStore())

    expect(await images.itemImageUrl(item({ image_hash: 'abc' }))).toBe('blob:stored')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
