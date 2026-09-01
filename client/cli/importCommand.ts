/**
 * `jitpack import` — put a portable YAML file into a running instance from a
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
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { useMutations } from '@/composables/useMutations'
import { usePull } from '@/composables/usePull'
import { usePush } from '@/composables/usePush'
import { HLCGenerator } from '@/sync/hlc'
import { optimisticInsert } from '@/sync/optimistic'
import { parsePortableAll } from '@/domain/portable'
import {
  message,
  DEFAULT_SERVER,
  ENV_SERVER,
  ENV_TOKEN,
  EXIT,
  pushPending,
  type CommandIO,
  type PendingWrites,
} from './common'
import {
  findExistingSubject,
  importPortableDocument,
  restoreDecisions,
  type PortableImportEnv,
} from '@/domain/portableImport'

export { EXIT, ENV_SERVER, ENV_TOKEN } from './common'

export interface ImportOptions {
  serverUrl: string
  token: string | null
  dryRun: boolean
  files: string[]
}

export type ParsedArgs =
  ({ ok: true } & ImportOptions) | { ok: false; error: string } | { ok: false; help: true }

export const USAGE = `Usage: jitpack import [flags] FILE...

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

export async function runImport(opts: ImportOptions, io: CommandIO): Promise<number> {
  setActivePinia(createPinia())
  const master = useMasterStore()
  // Trips are in the master partition but not in the master store, and
  // ADR-030's rule has to read them: a file re-run against an instance that
  // already holds its trips and templates must add nothing.
  const trips = useTripStore()
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
    trips.applyChanges(pulled.changes)
  } catch (e) {
    io.write(`${opts.serverUrl}: ${message(e)}`)
    return EXIT.failed
  }

  let total = 0
  let failed = 0
  let skipped = 0

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
      // Reported on both paths: a dry run whose job is "what would this file
      // do?" must say what it would leave alone (ADR-030).
      const duplicate = findExistingSubject(doc, {
        templateList: master.templateList,
        tripList: trips.tripList,
      })
      if (opts.dryRun) {
        io.write(`${what}: ${duplicate ? 'already here' : 'readable'} (dry run, not sent)`)
        continue
      }

      const pending: PendingWrites = { master: [], trips: new Map() }
      const env: PortableImportEnv = {
        master: {
          get itemList() {
            return master.itemList
          },
          get tagList() {
            return master.tagList
          },
          get templateList() {
            return master.templateList
          },
          get tripList() {
            return trips.tripList
          },
        },
        mutations,
        emit(partition, tripId, mutation) {
          const change = optimisticInsert(mutation)
          // Only the master partition is read back by the rules — a trip's own
          // rows are written, never matched against. Both stores see it: the
          // `trips` table is in this partition and belongs to the trip store.
          if (partition === 'master') {
            master.applyChanges([change])
            trips.applyChanges([change])
          }
          if (partition === 'trip' && tripId) {
            pending.trips.set(tripId, [...(pending.trips.get(tripId) ?? []), mutation])
          } else {
            pending.master.push(mutation)
          }
        },
      }

      const result = importPortableDocument(doc, restoreDecisions(doc, env), env, restoredTemplates)
      if (result.kind === 'template') restoredTemplates.set(doc.name, result.id)

      if (result.outcome === 'duplicate') {
        io.write(`${what}: already here — nothing added`)
        skipped++
        continue
      }

      try {
        await pushPending(pending, pushMaster, pushTrip)
      } catch (e) {
        io.write(`${what}: failed — ${message(e)}`)
        failed++
        continue
      }
      io.write(`${what}: imported`)
    }
  }

  const [landed, lost] = opts.dryRun ? ['readable', 'unreadable'] : ['imported', 'failed']
  const alreadyHere = skipped > 0 ? `, ${skipped} already here` : ''
  io.write(
    `${total} ${total === 1 ? 'document' : 'documents'}: ${total - failed - skipped} ${landed}${alreadyHere}, ${failed} ${lost}`,
  )
  return failed > 0 ? EXIT.failed : EXIT.ok
}
