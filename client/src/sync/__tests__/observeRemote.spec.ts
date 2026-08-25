import { describe, expect, it, vi } from 'vitest'

import { HLCGenerator, observeRemote } from '../hlc'

/**
 * A remote clock is data from another device, and a pull must survive one
 * that is wrong. `parseHLC` throws by design — that is right for the
 * generator's own contract — but a throw at the pull boundary aborts the
 * whole page, so one bad row would make every *other* row unreachable on
 * every device, indefinitely. The server stores an HLC verbatim and does
 * not validate its device id, so a single buggy client can produce one.
 */
describe('observeRemote', () => {
  const gen = () => new HLCGenerator(() => 1_000_000, 'abcdef01')

  it('advances the clock past a valid remote HLC', () => {
    const hlc = gen()
    expect(observeRemote(hlc, '0000009000000-0002-abcdef01')).toBe(true)
    // Positive signal: the next stamp is minted past what was observed.
    expect(hlc.next() > '0000009000000-0002-abcdef01').toBe(true)
  })

  it.each([
    ['empty, the schema default for a row never written through a merge', ''],
    ['a device id that is not lowercase hex', '0000000001519-0000-mt8zz87y'],
    ['too short', '123-0000-abcdef01'],
    ['a counter that is not hex', '0000009000000-zzzz-abcdef01'],
  ])('reports %s as unusable instead of throwing', (_name, bad) => {
    const hlc = gen()
    const before = hlc.next()

    expect(() => observeRemote(hlc, bad)).not.toThrow()
    expect(observeRemote(hlc, bad)).toBe(false)

    // Positive signal: the clock is untouched, so a refused value cannot
    // drag the device's clock anywhere either.
    const after = hlc.next()
    expect(after.slice(0, 13)).toBe(before.slice(0, 13))
  })

  it('names the value it refused, so a bad producer can be found', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    observeRemote(gen(), '0000000001519-0000-mt8zz87y')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('0000000001519-0000-mt8zz87y'))
    warn.mockRestore()
  })
})
