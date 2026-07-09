/**
 * M18 portable YAML import (FR-18.4/18.5) — pure parse/match layer, the
 * TS counterpart of internal/portable on the server.
 *
 * Client-side by decision: in Local Mode the portable export *is* the
 * backup (NFR-4.11), so restoring must work without a server, and the
 * FR-16.3-style merge prompts need user decisions before anything is
 * committed. Uses the `yaml` package (already a transitive Vite
 * dependency — zero added footprint).
 */

import { parse, stringify } from 'yaml'

import { findDuplicates } from './spreadsheet'
import type {
  Container,
  MasterItem,
  Template,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
} from '@/types/domain'

/** The schema this app writes and fully understands (FR-18.5). */
export const PORTABLE_SCHEMA_VERSION = 1

export interface PortableTraveler {
  name: string
  profile: 'adult' | 'child'
}

export interface PortableContainer {
  name: string
  carrier: string | null
  max_weight_grams: number | null
}

export interface PortableItem {
  name: string
  quantity: string
  // Template fields
  assignment: 'per_person' | 'trip_global' | null
  dedup: 'max' | 'sum' | null
  conditions: Record<string, unknown> | null
  default_mode: string | null
  late_packer: boolean
  unit: string | null
  // Trip fields
  mode: string | null
  category: string | null
  traveler: string | null
  container: string | null
  packed_count: number | null
}

export interface PortableDocument {
  kind: 'template' | 'trip'
  schema_version: number
  name: string
  start_date: string | null
  end_date: string | null
  travelers: PortableTraveler[]
  containers: PortableContainer[]
  items: PortableItem[]
}

export interface ParseResult {
  doc: PortableDocument | null
  error: string | null
  /** FR-18.5: file written by a newer app — import proceeds best-effort. */
  newerSchema: boolean
}

export function parsePortable(text: string): ParseResult {
  let raw: unknown
  try {
    raw = parse(text)
  } catch (e) {
    return { doc: null, error: `not valid YAML: ${(e as Error).message}`, newerSchema: false }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { doc: null, error: 'not a portable document', newerSchema: false }
  }
  const obj = raw as Record<string, unknown>

  const kind = obj['kind']
  if (kind !== 'template' && kind !== 'trip') {
    return { doc: null, error: `unknown kind ${JSON.stringify(kind ?? null)}`, newerSchema: false }
  }
  const name = typeof obj['name'] === 'string' ? obj['name'].trim() : ''
  if (name === '') {
    return { doc: null, error: 'document has no name', newerSchema: false }
  }
  const rawItems = Array.isArray(obj['items']) ? obj['items'] : []
  const items: PortableItem[] = []
  for (const entry of rawItems) {
    const item = toItem(entry)
    if (!item) {
      return { doc: null, error: 'an item entry has no name', newerSchema: false }
    }
    items.push(item)
  }

  const schemaVersion = typeof obj['schema_version'] === 'number' ? obj['schema_version'] : 1
  return {
    doc: {
      kind,
      schema_version: schemaVersion,
      name,
      start_date: str(obj['start_date']),
      end_date: str(obj['end_date']),
      travelers: toTravelers(obj['travelers']),
      containers: toContainers(obj['containers']),
      items,
    },
    error: null,
    newerSchema: schemaVersion > PORTABLE_SCHEMA_VERSION,
  }
}

// --- Matching (FR-18.4, reusing the M15 dedup machinery) ---

export interface PortableMatch {
  name: string
  state: 'new' | 'matched' | 'near'
  existingId: string | null
  existingName: string | null
}

export function matchPortableItems(
  doc: PortableDocument,
  existing: MasterItem[],
): PortableMatch[] {
  const matches = new Map(
    findDuplicates(doc.items.map((i) => i.name), existing).map((m) => [m.imported, m]),
  )
  return doc.items.map((item) => {
    const match = matches.get(item.name)
    if (!match) return { name: item.name, state: 'new', existingId: null, existingName: null }
    return {
      name: item.name,
      state: match.exact ? 'matched' : 'near',
      existingId: match.existingId,
      existingName: match.existingName,
    }
  })
}

// --- Serialization (FR-18.2/18.3) ---
//
// The client writes the same shape as the server's internal/portable —
// field names, omit-empty semantics, and by-name ordering all match, so
// a file exported here imports there and vice versa. In Local Mode this
// serializer *is* the backup path (NFR-4.11): there is no server to ask.

/** serializeTemplate writes an owned template as environment-agnostic YAML (FR-18.2). */
export function serializeTemplate(
  template: Template,
  templateItems: TemplateItem[],
  masterItem: (id: string) => MasterItem | undefined,
): string {
  const items = templateItems
    .map((ti) => {
      const master = masterItem(ti.item_id)
      return {
        name: master?.name ?? 'Unknown item',
        quantity: ti.quantity_formula,
        assignment: ti.assignment,
        unit: master?.unit ?? 'pieces',
        ...(ti.conditions ? { conditions: ti.conditions } : {}),
        default_mode: ti.default_mode,
        ...(ti.late_packer ? { late_packer: true } : {}),
        dedup: ti.dedup,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  return stringify({
    kind: 'template',
    schema_version: PORTABLE_SCHEMA_VERSION,
    name: template.name,
    items,
  })
}

/** serializeTrip writes a trip's packing list, clean or with progress (FR-18.3). */
export function serializeTrip(args: {
  trip: Trip
  items: TripItem[]
  travelers: Traveler[]
  containers: Container[]
  includeProgress: boolean
}): string {
  const travelerNames = new Map(args.travelers.map((t) => [t.id, t.name]))
  const containerNames = new Map(args.containers.map((c) => [c.id, c.name]))

  const travelers = [...args.travelers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ name: t.name, profile: t.profile }))

  const containers = [...args.containers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      ...(c.carrier_traveler_id ? { carrier: travelerNames.get(c.carrier_traveler_id) } : {}),
      ...(c.max_weight_grams ? { max_weight_grams: c.max_weight_grams } : {}),
    }))

  const items = [...args.items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      name: item.name,
      quantity: String(item.quantity),
      mode: item.mode,
      ...(item.category_name ? { category: item.category_name } : {}),
      ...(item.assigned_traveler_id
        ? { traveler: travelerNames.get(item.assigned_traveler_id) }
        : {}),
      ...(item.container_id ? { container: containerNames.get(item.container_id) } : {}),
      ...(args.includeProgress ? { packed_count: item.packed_count } : {}),
      ...(item.late_packer ? { late_packer: true } : {}),
    }))

  return stringify({
    kind: 'trip',
    schema_version: PORTABLE_SCHEMA_VERSION,
    name: args.trip.name,
    ...(args.trip.start_date ? { start_date: args.trip.start_date } : {}),
    end_date: args.trip.end_date,
    ...(travelers.length > 0 ? { travelers } : {}),
    ...(containers.length > 0 ? { containers } : {}),
    items,
  })
}

// --- Field coercion (unknown fields are ignored by construction, FR-18.5) ---

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function toItem(entry: unknown): PortableItem | null {
  if (typeof entry !== 'object' || entry === null) return null
  const o = entry as Record<string, unknown>
  const name = typeof o['name'] === 'string' ? o['name'].trim() : ''
  if (name === '') return null
  return {
    name,
    quantity: typeof o['quantity'] === 'string' ? o['quantity'] : String(o['quantity'] ?? '1'),
    assignment: o['assignment'] === 'per_person' || o['assignment'] === 'trip_global' ? o['assignment'] : null,
    dedup: o['dedup'] === 'sum' || o['dedup'] === 'max' ? o['dedup'] : null,
    conditions:
      typeof o['conditions'] === 'object' && o['conditions'] !== null
        ? (o['conditions'] as Record<string, unknown>)
        : null,
    default_mode: str(o['default_mode']),
    late_packer: o['late_packer'] === true,
    unit: str(o['unit']),
    mode: str(o['mode']),
    category: str(o['category']),
    traveler: str(o['traveler']),
    container: str(o['container']),
    packed_count: typeof o['packed_count'] === 'number' ? o['packed_count'] : null,
  }
}

function toTravelers(v: unknown): PortableTraveler[] {
  if (!Array.isArray(v)) return []
  const out: PortableTraveler[] = []
  for (const entry of v) {
    const o = entry as Record<string, unknown>
    const name = typeof o?.['name'] === 'string' ? o['name'].trim() : ''
    if (name === '') continue
    out.push({ name, profile: o['profile'] === 'child' ? 'child' : 'adult' })
  }
  return out
}

function toContainers(v: unknown): PortableContainer[] {
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
