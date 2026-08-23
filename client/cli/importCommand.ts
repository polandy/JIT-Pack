/**
 * `jitpack-import` — put a portable YAML file into a running instance from a
 * shell (FR-18.7).
 *
 * It owns no import rules. It pulls the instance's inventory into the app's
 * own master store, hands `@/domain/portableImport` an environment whose sink
 * collects mutations, and pushes them through the ordinary sync endpoints —
 * so a file imported here produces exactly the rows M18 would produce from it,
 * and lands in the change log like every other write (ADR-025).
 */

import { createPinia, setActivePinia } from 'pinia'
import { APIClient } from '@/api/client'
import type { Mutation, PullChange } from '@/api/types'
import { useMasterStore } from '@/stores/masterStore'
import { useMutations } from '@/composables/useMutations'
import { usePull } from '@/composables/usePull'
import { usePush } from '@/composables/usePush'
import { MAX_PUSH_BATCH } from '@/composables/useSyncOutbox'
import { HLCGenerator } from '@/sync/hlc'
import { parsePortableAll } from '@/domain/portable'
import {
  importPortableDocument,
  restoreDecisions,
  type PortableImportEnv,
} from '@/domain/portableImport'

/** Where the command looks when a flag is omitted, so a shell can be set up once. */
export const ENV_SERVER = 'JITPACK_SERVER'
export const ENV_TOKEN = 'JITPACK_TOKEN'

/** Where a self-hosted instance usually answers; the flag exists because that is a guess. */
const DEFAULT_SERVER = 'http://localhost:3000'

/**
 * The process's answer. A script has to be able to tell "nothing landed" from
 * "some of it did", and both from "you invoked it wrong".
 */
export const EXIT = { ok: 0, documentFailed: 1, usage: 2 } as const

export interface ImportOptions {
  serverUrl: string
  token: string | null
  dryRun: boolean
  files: string[]
}

export type ParsedArgs =
  ({ ok: true } & ImportOptions) | { ok: false; error: string } | { ok: false; help: true }

export const USAGE = `Usage: jitpack-import [flags] FILE...

Imports portable YAML into a running JIT-Pack instance. A file may hold one
document or many; each is imported in the order the file lists it.

Flags:
  --server URL   instance base URL (default $${ENV_SERVER}, else ${DEFAULT_SERVER})
  --token TOKEN  bearer token for an instance with accounts (default $${ENV_TOKEN})
  --dry-run      read and report the documents without importing them`

/**
 * Read the command line. `getenv` supplies the fallbacks, so the precedence —
 * flag over environment over default — is decided here and can be tested
 * without touching the real environment.
 */
export function parseImportArgs(
  argv: string[],
  getenv: (name: string) => string | undefined,
): ParsedArgs {
  let serverUrl = ''
  let token = ''
  let dryRun = false
  const files: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') return { ok: false, help: true }
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--server') serverUrl = argv[++i] ?? ''
    else if (arg === '--token') token = argv[++i] ?? ''
    else if (arg.startsWith('-')) return { ok: false, error: `unknown flag: ${arg}` }
    else files.push(arg)
  }
  if (files.length === 0) return { ok: false, error: 'no file given' }

  return {
    ok: true,
    serverUrl: serverUrl || getenv(ENV_SERVER) || DEFAULT_SERVER,
    token: token || getenv(ENV_TOKEN) || null,
    dryRun,
    files,
  }
}

/** Everything the command touches outside itself, so a test can supply all of it. */
export interface ImportIO {
  readFile(path: string): Promise<string>
  write(line: string): void
  /** Injected so the HLC has no ambient clock (the project forbids one). */
  now(): number
  deviceId: string
}

/** One document's worth of mutations, kept per partition because they push separately. */
interface PendingWrites {
  master: Mutation[]
  trips: Map<string, Mutation[]>
}

export async function runImport(opts: ImportOptions, io: ImportIO): Promise<number> {
  setActivePinia(createPinia())
  const master = useMasterStore()
  const hlc = new HLCGenerator(io.now, io.deviceId)
  const client = new APIClient(opts.serverUrl, () => opts.token)
  const mutations = useMutations(hlc)
  const { pullMasterAll } = usePull(client, hlc)
  const { pushMaster, pushTrip } = usePush(client, hlc)

  // The inventory has to be here before anything is planned: FR-18.4 matches
  // each document against what the instance holds, and a dry run has to read
  // it too or it would report every item as new.
  try {
    const pulled = await pullMasterAll(0)
    master.applyChanges(pulled.changes)
  } catch (e) {
    io.write(`${opts.serverUrl}: ${message(e)}`)
    return EXIT.documentFailed
  }

  let total = 0
  let failed = 0

  for (const path of opts.files) {
    let text: string
    try {
      text = await io.readFile(path)
    } catch (e) {
      io.write(`${path}: ${message(e)}`)
      total++
      failed++
      continue
    }

    const results = parsePortableAll(text)
    if (results.length === 0) {
      io.write(`${path}: no document found`)
      total++
      failed++
      continue
    }

    // A backup names the same template in a trip's `follows`, so a Vorlage
    // this run created has to be findable by the trips behind it.
    const restoredTemplates = new Map<string, string>()

    for (const [index, parsed] of results.entries()) {
      total++
      const where = `${path} #${index + 1}`
      if (!parsed.doc) {
        io.write(`${where}: unreadable — ${parsed.error}`)
        failed++
        continue
      }
      const doc = parsed.doc
      const what = `${where} ${doc.kind} "${doc.name}"`
      if (opts.dryRun) {
        io.write(`${what}: readable (dry run, not sent)`)
        continue
      }

      const pending: PendingWrites = { master: [], trips: new Map() }
      const env: PortableImportEnv = {
        master,
        mutations,
        emit(partition, tripId, table, id, mutation) {
          const change: PullChange = {
            seq: 0,
            table,
            id,
            deleted: false,
            row: mutation.fields ?? {},
          }
          // Only the master partition is read back by the rules, and only the
          // master store is loaded here — a trip's own rows are written, never
          // matched against.
          if (partition === 'master') master.applyChanges([change])
          if (partition === 'trip' && tripId) {
            pending.trips.set(tripId, [...(pending.trips.get(tripId) ?? []), mutation])
          } else {
            pending.master.push(mutation)
          }
        },
      }

      const result = importPortableDocument(doc, restoreDecisions(doc, env), env, restoredTemplates)
      if (result.kind === 'template') restoredTemplates.set(doc.name, result.id)

      try {
        await pushAll(pending, pushMaster, pushTrip)
      } catch (e) {
        io.write(`${what}: failed — ${message(e)}`)
        failed++
        continue
      }
      io.write(`${what}: imported`)
    }
  }

  const [landed, lost] = opts.dryRun ? ['readable', 'unreadable'] : ['imported', 'failed']
  io.write(
    `${total} ${total === 1 ? 'document' : 'documents'}: ${total - failed} ${landed}, ${failed} ${lost}`,
  )
  return failed > 0 ? EXIT.documentFailed : EXIT.ok
}

/** Master first: a trip's rows reference travelers and items written there. */
async function pushAll(
  pending: PendingWrites,
  pushMaster: (m: Mutation[]) => Promise<unknown>,
  pushTrip: (tripId: string, m: Mutation[]) => Promise<unknown>,
): Promise<void> {
  for (const chunk of chunked(pending.master)) await pushMaster(chunk)
  for (const [tripId, list] of pending.trips) {
    for (const chunk of chunked(list)) await pushTrip(tripId, chunk)
  }
}

/** Sync-API §9 caps a push; a real Vorlage is well past it, and the cap rejects the whole batch. */
function* chunked(mutations: Mutation[]): Generator<Mutation[]> {
  for (let offset = 0; offset < mutations.length; offset += MAX_PUSH_BATCH) {
    yield mutations.slice(offset, offset + MAX_PUSH_BATCH)
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
