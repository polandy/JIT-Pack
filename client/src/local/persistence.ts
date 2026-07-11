/**
 * Local Mode persistence (Addendum 3.19, FR-19.2): IndexedDB adapter
 * storing rows as `table/id → row` in the exact shape the sync
 * protocol delivers, so startup loads through the identical
 * applyChanges path as a server pull. The client-side mutation layer
 * is the sole write authority here — no server completes rows later.
 */

import type { PullChange } from '@/api/types'

const DB_NAME = 'jitpack-local'
const STORE = 'rows'
// FR-22: item reference photos live here as blobs, keyed by item id.
// They are deliberately outside the row store (which mirrors the sync
// envelope) — the same separation the server makes with item_images.
const IMAGES = 'images'
const DB_VERSION = 2

interface StoredRow {
  table: string
  id: string
  row: Record<string, unknown>
}

export class IndexedDBPersistence {
  private db: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
        if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return this.db
  }

  /** save applies changes: upserts rows, tombstones delete them. */
  async save(changes: PullChange[]): Promise<void> {
    if (changes.length === 0) return
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const c of changes) {
        const key = `${c.table}/${c.id}`
        if (c.deleted) {
          store.delete(key)
        } else if (c.row) {
          const stored: StoredRow = { table: c.table, id: c.id, row: c.row }
          store.put(stored, key)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  /** load returns every stored row as a pull change (seq 0). */
  async load(): Promise<PullChange[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        resolve(
          (req.result as StoredRow[]).map((s) => ({
            seq: 0,
            table: s.table,
            id: s.id,
            deleted: false,
            row: s.row,
          })),
        )
      }
      req.onerror = () => reject(req.error)
    })
  }

  /** putImage stores (or replaces) an item's reference photo (FR-22.5).
   * The bytes are kept as a plain ArrayBuffer, not a Blob: ArrayBuffers
   * structured-clone identically across every runtime, whereas a Blob's
   * cloneability varies by engine. */
  async putImage(itemId: string, blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer()
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGES, 'readwrite')
      tx.objectStore(IMAGES).put({ buffer, type: blob.type || 'image/jpeg' }, itemId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  /** getImage returns an item's stored photo, or null when it has none. */
  async getImage(itemId: string): Promise<Blob | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(IMAGES, 'readonly').objectStore(IMAGES).get(itemId)
      req.onsuccess = () => {
        const stored = req.result as { buffer: ArrayBuffer; type: string } | undefined
        resolve(stored ? new Blob([stored.buffer], { type: stored.type }) : null)
      }
      req.onerror = () => reject(req.error)
    })
  }

  /** deleteImage removes an item's stored photo (FR-22.5). */
  async deleteImage(itemId: string): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IMAGES, 'readwrite')
      tx.objectStore(IMAGES).delete(itemId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  /**
   * requestDurability asks the browser to protect the origin's storage
   * from eviction (NFR-4.11). Returns whether persistence is granted;
   * callers surface a warning when it is not.
   */
  async requestDurability(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return navigator.storage.persist()
  }
}
