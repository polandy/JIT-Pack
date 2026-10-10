/**
 * M18 portable field coercion (FR-18.5) — turns one already-parsed YAML
 * value into one typed field of a `PortableItem`/`PortableGeneratedPosition`/
 * `PortableAppliedChange`, or drops it.
 *
 * Unknown fields are ignored by construction: every coercion here returns a
 * typed value or a safe default rather than throwing, so a file written by a
 * newer build, or a hand-edited one, degrades instead of failing the whole
 * document. `portable.ts` calls these from `fromRaw`; nothing else needs them.
 */
import type { ChangeDetail, ChangedField, ItemMode, ShoppingMode, TripStatus } from '@/types/domain'
import { ITEM_MODE_PACK, TRIP_STATUSES, isShoppingMode, toItemMode } from '@/types/domain'

import type {
  PortableAppliedChange,
  PortableContainer,
  PortableGeneratedPosition,
  PortableItem,
  PortableTraveler,
} from './portable'

/** Legacy files carried string quantities — sometimes a formula. Numeric
 * strings keep their value, formula strings fold to 1 (FR-18.4 tolerance;
 * formulas retired with FR-1.3/1.5). */
function coerceQuantity(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.floor(raw))
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10)
  return 1
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/** A plausible year, or null — a garbage value must not become one. */
export function num(v: unknown): number | null {
  const parsed = typeof v === 'number' ? v : Number(v)
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2200 ? parsed : null
}

/**
 * The document's trip status, or null when it declares none.
 *
 * A value this build does not know is dropped rather than carried: the
 * schema's CHECK would refuse it, and a push that fails a constraint parks the
 * whole mutation and reports a database error where a file problem happened.
 * Null then means the same as absent, and the importer supplies `planning` —
 * which is what every file written before this field existed produces.
 */
export function toTripStatus(v: unknown): TripStatus | null {
  return TRIP_STATUSES.includes(v as TripStatus) ? (v as TripStatus) : null
}

/** A value outside the two shopping lists is not a list a row can have left. */
export function toShoppingMode(raw: unknown): ShoppingMode | null {
  return isShoppingMode(raw) ? raw : null
}

export function toItem(entry: unknown): PortableItem | null {
  if (typeof entry !== 'object' || entry === null) return null
  const o = entry as Record<string, unknown>
  const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
  if (name === '') return null
  return {
    name,
    icon: str(o['icon']),
    quantity: coerceQuantity(o['quantity']),
    // Strings only: a task list that quietly swallowed a number would read
    // back as "1" and claim the user wrote it.
    tasks: Array.isArray(o['tasks'])
      ? o['tasks'].filter((t): t is string => typeof t === 'string')
      : [],
    assignment:
      o['assignment'] === 'per_person' || o['assignment'] === 'trip_global'
        ? o['assignment']
        : null,
    dedup: o['dedup'] === 'sum' || o['dedup'] === 'max' ? o['dedup'] : null,
    conditions:
      typeof o['conditions'] === 'object' && o['conditions'] !== null
        ? (o['conditions'] as Record<string, unknown>)
        : null,
    default_mode: toItemMode(o['default_mode']),
    late_packer: o['late_packer'] === true,
    mode: toItemMode(o['mode']),
    category: str(o['category']),
    traveler: str(o['traveler']),
    container: str(o['container']),
    packed_count: typeof o['packed_count'] === 'number' ? o['packed_count'] : null,
    bought_from: toShoppingMode(o['bought_from']),
    // Strings only, for the reason the task list is: a number here would read
    // back as a tag named "1" and claim the user filed it that way.
    tags: Array.isArray(o['tags'])
      ? o['tags'].filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : [],
    from_inventory: o['from_inventory'] === true,
  }
}

/**
 * FR-7.4: a trip-task list, strings only and trimmed, blanks dropped — a
 * number here would read back as a task called "1" nobody wrote.
 */
export function toTaskList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t !== '')
}

export function toTravelers(v: unknown): PortableTraveler[] {
  if (!Array.isArray(v)) return []
  const out: PortableTraveler[] = []
  for (const entry of v) {
    const o = entry as Record<string, unknown>
    const name = typeof o?.['name'] === 'string' ? o['name'].trim() : ''
    if (name === '') continue
    // A pre-FR-25.9 document carries `profile`; it is dropped, not an error.
    out.push({ name })
  }
  return out
}

export function toContainers(v: unknown): PortableContainer[] {
  if (!Array.isArray(v)) return []
  const out: PortableContainer[] = []
  for (const entry of v) {
    const o = entry as Record<string, unknown>
    const name = typeof o?.['name'] === 'string' ? o['name'].trim() : ''
    if (name === '') continue
    out.push({
      name,
      carrier: str(o['carrier']),
      max_weight_grams: typeof o['max_weight_grams'] === 'number' ? o['max_weight_grams'] : null,
    })
  }
  return out
}

// --- FR-27.4 sections ---
//
// All three are *tolerant*: an absent section reads as empty and a malformed
// entry is dropped, where a malformed item aborts the document. The asymmetry
// is deliberate and is the documented fallback for a file written before these
// sections existed (ADR-015): the items are the user's data, while these three
// are bookkeeping about how the trip follows its groups. Losing a trip because
// one ledger line is unreadable would trade the valuable half for the cheap
// one — the refresh re-derives what it cannot read here.

export function toFollows(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const entry of v) {
    const name = typeof entry === 'string' ? entry.trim() : ''
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
}

function toMode(v: unknown): ItemMode {
  return toItemMode(v) ?? ITEM_MODE_PACK
}

export function toGeneratedPositions(v: unknown): PortableGeneratedPosition[] {
  if (!Array.isArray(v)) return []
  const out: PortableGeneratedPosition[] = []
  for (const entry of v) {
    if (typeof entry !== 'object' || entry === null) continue
    const o = entry as Record<string, unknown>
    const item = typeof o['item'] === 'string' ? o['item'].trim() : ''
    const source = typeof o['source'] === 'string' ? o['source'].trim() : ''
    // Both are references the restore has to resolve to an id. An entry
    // missing either cannot be placed, and a placed-wrong ledger entry
    // detaches a position nobody asked to detach.
    if (item === '' || source === '') continue
    const name = typeof o['name'] === 'string' && o['name'].trim() !== '' ? o['name'].trim() : item
    out.push({
      item,
      traveler: str(o['traveler']),
      source,
      name,
      quantity: coerceQuantity(o['quantity']),
      mode: toMode(o['mode']),
      late_packer: o['late_packer'] === true,
      weight_grams: typeof o['weight_grams'] === 'number' ? o['weight_grams'] : null,
      value_cents: typeof o['value_cents'] === 'number' ? o['value_cents'] : null,
      category: str(o['category']),
      tasks: Array.isArray(o['tasks'])
        ? o['tasks'].filter((t): t is string => typeof t === 'string')
        : [],
    })
  }
  return out
}

const CHANGED_FIELDS: readonly ChangedField[] = [
  'quantity',
  'mode',
  'name',
  'late_packer',
  'weight_grams',
  'value_cents',
  'category_name',
  'tasks',
]

function toChangeDetail(v: unknown): ChangeDetail | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const field = CHANGED_FIELDS.find((f) => f === o['field'])
  if (!field) return null
  const value = (raw: unknown): ChangeDetail['from'] =>
    typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? raw : null
  return { field, from: value(o['from']), to: value(o['to']) }
}

export function toAppliedChanges(v: unknown): PortableAppliedChange[] {
  if (!Array.isArray(v)) return []
  const out: PortableAppliedChange[] = []
  for (const entry of v) {
    if (typeof entry !== 'object' || entry === null) continue
    const o = entry as Record<string, unknown>
    const kind = o['kind']
    if (kind !== 'added' && kind !== 'removed' && kind !== 'changed') continue
    const source = typeof o['source'] === 'string' ? o['source'].trim() : ''
    const item = typeof o['item'] === 'string' ? o['item'].trim() : ''
    if (source === '' || item === '') continue
    out.push({
      source,
      kind,
      item,
      detail: toChangeDetail(o['detail']),
      // A log line with no timestamp would sort to the top of M2's list and
      // claim to be the newest thing that happened.
      at: str(o['at']) ?? '',
    })
  }
  return out.filter((entry) => entry.at !== '')
}
