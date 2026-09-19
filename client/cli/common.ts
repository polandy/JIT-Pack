/**
 * What every `jitpack` subcommand shares: where it looks for the instance,
 * how it answers the shell, and how it gets a batch of mutations past the
 * push cap. A command owns its own rules and nothing else.
 */

import type { APIClient } from '@/api/client'
import { MUTATION_OUTCOME, type Mutation } from '@/api/types'
import type { HLCGenerator } from '@/sync/hlc'
import { MASTER_PARTITION, MAX_PUSH_BATCH, pushPartition, tripPartition } from '@/sync/partition'

/** Where a command looks when a flag is omitted, so a shell can be set up once. */
export const ENV_SERVER = 'JITPACK_SERVER'
export const ENV_TOKEN = 'JITPACK_TOKEN'

/** Where a self-hosted instance usually answers; the flag exists because that is a guess. */
export const DEFAULT_SERVER = 'http://localhost:3000'

/**
 * The process's answer. A script has to be able to tell "nothing landed" from
 * "some of it did", and both from "you invoked it wrong".
 */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const

/** How a command reaches the instance, shared by every subcommand's flags. */
export interface Connection {
  serverUrl: string
  token: string | null
}

/** Everything a command touches outside itself, so a test can supply all of it. */
export interface CommandIO {
  readFile(path: string): Promise<string>
  write(line: string): void
  /** Injected so the HLC has no ambient clock (the project forbids one). */
  now(): number
  deviceId: string
}

/** Sync-API §9 caps a push; a real Vorlage is well past it, and the cap rejects the whole batch. */
export function* chunked(mutations: Mutation[]): Generator<Mutation[]> {
  for (let offset = 0; offset < mutations.length; offset += MAX_PUSH_BATCH) {
    yield mutations.slice(offset, offset + MAX_PUSH_BATCH)
  }
}

/**
 * What a run has to push, in the order the app's rules produced it. Master
 * first when both are present: a trip's rows reference travelers and items
 * written there.
 */
export interface PendingWrites {
  master: Mutation[]
  trips: Map<string, Mutation[]>
}

/** A write the instance answered with `rejected`, and the reason it gave. */
export interface RejectedWrite {
  mutation: Mutation
  error: string | null
}

/**
 * Send one run's collected writes, chunked past the §9 cap. Resolves to the
 * writes the instance rejected: a push that answers 200 can still refuse
 * some of its mutations, and a command that reports them as sent is lying.
 */
export async function pushPending(
  client: APIClient,
  hlc: HLCGenerator,
  pending: PendingWrites,
): Promise<RejectedWrite[]> {
  const rejected: RejectedWrite[] = []
  const send = async (partition: Parameters<typeof pushPartition>[2], chunk: Mutation[]) => {
    const byId = new Map(chunk.map((m) => [m.mutation_id, m]))
    for (const result of (await pushPartition(client, hlc, partition, chunk)).results) {
      const mutation = byId.get(result.mutation_id)
      if (result.outcome === MUTATION_OUTCOME.rejected && mutation) {
        rejected.push({ mutation, error: result.error ?? null })
      }
    }
  }
  for (const chunk of chunked(pending.master)) await send(MASTER_PARTITION, chunk)
  for (const [tripId, list] of pending.trips) {
    const partition = tripPartition(tripId)
    for (const chunk of chunked(list)) await send(partition, chunk)
  }
  return rejected
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
