import { describe, it, expect, vi } from 'vitest'
import { dispatch, USAGE } from '../dispatch'
import { EXIT } from '../common'
import type { CommandIO } from '../common'

function out() {
  const stdout: string[] = []
  const stderr: string[] = []
  return { out: (l: string) => stdout.push(l), err: (l: string) => stderr.push(l), stdout, stderr }
}

/** A command that reaches this has been dispatched; nothing else builds it. */
function io(): CommandIO {
  return {
    readFile: async () => '',
    write: () => {},
    now: () => 1_700_000_000_000,
    deviceId: 'aabbccdd',
  }
}

const env = () => undefined

describe('dispatch', () => {
  it('lists its commands when asked for help, and answers ok', async () => {
    const o = out()
    expect(await dispatch(['--help'], env, o, io)).toBe(EXIT.ok)
    expect(o.stdout.join('\n')).toContain('traveler')
    expect(o.stdout.join('\n')).toContain('import')
  })

  // The same text, a different answer: a script that ran the binary with no
  // arguments got it wrong, and has to be able to tell.
  it('prints the usage on stderr and fails when given no command', async () => {
    const o = out()
    expect(await dispatch([], env, o, io)).toBe(EXIT.usage)
    expect(o.stderr.join('\n')).toBe(USAGE)
    expect(o.stdout).toEqual([])
  })

  it('refuses a command it does not know, naming it', async () => {
    const o = out()
    expect(await dispatch(['travellers'], env, o, io)).toBe(EXIT.usage)
    expect(o.stderr.join('\n')).toContain('travellers')
  })

  it("prints a command's own usage rather than the dispatcher's", async () => {
    const o = out()
    expect(await dispatch(['traveler', '--help'], env, o, io)).toBe(EXIT.ok)
    expect(o.stdout.join('\n')).toContain('--trip')
  })

  it('reports a command argument error against that command', async () => {
    const o = out()
    expect(await dispatch(['traveler', 'add'], env, o, io)).toBe(EXIT.usage)
    expect(o.stderr.join('\n')).toContain('jitpack traveler:')
  })

  // The dispatcher must not build a command's outside world before it knows
  // there is a command to run — nothing here should open a file or a socket.
  it('builds no command environment for an invocation that runs nothing', async () => {
    const build = vi.fn(io)
    await dispatch(['nope'], env, out(), build)
    await dispatch([], env, out(), build)
    await dispatch(['--help'], env, out(), build)
    expect(build).not.toHaveBeenCalled()
  })
})
