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

interface StoredRow {
  table: string
  id: string
  row: Record<string, unknown>
}

export class IndexedDBPersistence {
  private db: Promise<IDBDatabase> | null = null

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE)
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
