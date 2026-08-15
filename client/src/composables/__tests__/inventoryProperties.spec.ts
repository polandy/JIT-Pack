import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  inventoryProperties,
  INVENTORY_PROPERTIES,
  type InventoryProperty,
} from '@/composables/useInventoryProperties'

/**
 * FR-24.4: which extra properties the lean M9 list shows is a *device-local*
 * preference — same persistence class as the FR-25.2 reveal-done toggle.
 * The inventory is a lookup surface, not a spreadsheet.
 */

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  inventoryProperties().reset()
})

describe('inventoryProperties (FR-24.4)', () => {
  it('shows nothing but the name by default — the list is lean', () => {
    const props = inventoryProperties()

    for (const key of INVENTORY_PROPERTIES) {
      expect(props.isShown(key)).toBe(false)
    }
    expect(props.shownCount.value).toBe(0)
  })

  it('toggles one property without disturbing the others', () => {
    const props = inventoryProperties()

    props.toggle('weight')

    expect(props.isShown('weight')).toBe(true)
    expect(props.isShown('price')).toBe(false)
    expect(props.isShown('tags')).toBe(false)
    expect(props.shownCount.value).toBe(1)
  })

  it('counts what is shown, for the badge on the eye icon', () => {
    const props = inventoryProperties()

    props.toggle('weight')
    props.toggle('price')

    expect(props.shownCount.value).toBe(2)
  })

  it('toggles back off', () => {
    const props = inventoryProperties()

    props.toggle('tags')
    props.toggle('tags')

    expect(props.isShown('tags')).toBe(false)
    expect(props.shownCount.value).toBe(0)
  })

  it('persists the choice for this device', () => {
    inventoryProperties().toggle('price')

    // A fresh read of the stored value is what a reload would see.
    const stored: unknown = JSON.parse(localStorage.getItem('jitpack_inventory_properties') ?? '[]')
    expect(stored).toEqual(['price'])
  })

  it('survives a reload', () => {
    localStorage.setItem('jitpack_inventory_properties', JSON.stringify(['tags', 'weight']))

    const props = inventoryProperties()
    props.reload()

    expect(props.isShown('tags')).toBe(true)
    expect(props.isShown('weight')).toBe(true)
    expect(props.isShown('price')).toBe(false)
  })

  it('ignores a stored key that is no longer a property', () => {
    // A key retired by a later version must not resurrect as a column.
    localStorage.setItem('jitpack_inventory_properties', JSON.stringify(['weight', 'unit']))

    const props = inventoryProperties()
    props.reload()

    expect(props.shownCount.value).toBe(1)
    expect(props.isShown('weight')).toBe(true)
  })

  it('falls back to lean when storage holds something unreadable', () => {
    localStorage.setItem('jitpack_inventory_properties', 'not json')

    const props = inventoryProperties()
    props.reload()

    expect(props.shownCount.value).toBe(0)
  })

  it('shares one state across callers, so the sheet and the list agree', () => {
    const fromSheet = inventoryProperties()
    const fromList = inventoryProperties()

    fromSheet.toggle('weight')

    expect(fromList.isShown('weight')).toBe(true)
  })

  it('offers exactly the three properties the sheet lists', () => {
    expect([...INVENTORY_PROPERTIES]).toEqual<InventoryProperty[]>(['tags', 'weight', 'price'])
  })
})
