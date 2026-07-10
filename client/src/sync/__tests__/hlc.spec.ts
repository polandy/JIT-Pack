import { describe, it, expect } from 'vitest'
import { HLCGenerator, parseHLC, compareHLC } from '../hlc'

describe('HLC format', () => {
  it('generates a valid HLC string', () => {
    const gen = new HLCGenerator(() => 1783862400123, 'a1b2c3d4')
    const hlc = gen.next()
    expect(hlc).toBe('1783862400123-0000-a1b2c3d4')
    expect(hlc).toHaveLength(27)
  })

  it('parses an HLC into components', () => {
    const { millis, counter, deviceId } = parseHLC('1783862400123-0003-a1b2c3d4')
    expect(millis).toBe(1783862400123)
    expect(counter).toBe(3)
    expect(deviceId).toBe('a1b2c3d4')
  })

  it('rejects malformed HLC strings', () => {
    expect(() => parseHLC('short')).toThrow(/malformed HLC/)
    expect(() => parseHLC('1783862400123-ZZZZ-a1b2c3d4')).toThrow(/counter/)
    expect(() => parseHLC('1783862400123-0000-ZZZZZZZZ')).toThrow(/device id/)
  })
})

describe('HLC monotonicity', () => {
  it('increments counter when wall clock stalls', () => {
    const gen = new HLCGenerator(() => 1000, 'abcd1234')
    const a = gen.next()
    const b = gen.next()
    const c = gen.next()
    expect(a).toBe('0000000001000-0000-abcd1234')
    expect(b).toBe('0000000001000-0001-abcd1234')
    expect(c).toBe('0000000001000-0002-abcd1234')
  })

  it('resets counter when wall clock advances', () => {
    let now = 1000
    const gen = new HLCGenerator(() => now, 'abcd1234')
    gen.next() // 1000-0000
    gen.next() // 1000-0001
    now = 2000
    const hlc = gen.next()
    expect(hlc).toBe('0000000002000-0000-abcd1234')
  })

  it('handles wall clock going backwards', () => {
    let now = 2000
    const gen = new HLCGenerator(() => now, 'abcd1234')
    const a = gen.next()
    now = 1000 // clock goes backwards
    const b = gen.next()
    expect(b > a).toBe(true)
  })
})

describe('HLC observe', () => {
  it('advances past a remote HLC', () => {
    const gen = new HLCGenerator(() => 1000, 'abcd1234')
    gen.next() // 1000-0000
    gen.observe('0000000005000-0003-deadbeef')
    const hlc = gen.next()
    const { millis, counter } = parseHLC(hlc)
    expect(millis).toBe(5000)
    expect(counter).toBeGreaterThan(3)
  })

  it('does not go backwards from observe', () => {
    const gen = new HLCGenerator(() => 5000, 'abcd1234')
    gen.next() // 5000-0000
    gen.observe('0000000001000-0000-deadbeef') // older
    const hlc = gen.next()
    const { millis } = parseHLC(hlc)
    expect(millis).toBe(5000)
  })
})

describe('HLC comparison', () => {
  it('lexicographic order equals causal order', () => {
    expect(compareHLC('0000000001000-0000-abcd1234', '0000000002000-0000-abcd1234')).toBeLessThan(0)
    expect(compareHLC('0000000001000-0001-abcd1234', '0000000001000-0000-abcd1234')).toBeGreaterThan(0)
    expect(compareHLC('0000000001000-0000-abcd1234', '0000000001000-0000-abcd1234')).toBe(0)
  })
})

describe('HLCGenerator validation', () => {
  it('rejects invalid device ids', () => {
    expect(() => new HLCGenerator(() => 0, 'short')).toThrow(/device id/)
    expect(() => new HLCGenerator(() => 0, 'ABCD1234')).toThrow(/device id/)
    expect(() => new HLCGenerator(() => 0, '12345678901')).toThrow(/device id/)
  })
})
