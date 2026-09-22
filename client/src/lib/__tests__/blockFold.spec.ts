// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBlockFold } from '../blockFold'

describe('useBlockFold (FR-7.10): the fold is remembered per block', () => {
  beforeEach(() => localStorage.clear())

  it('starts open', () => {
    expect(useBlockFold('tasks').open.value).toBe(true)
  })

  it('remembers a fold across a reload, for that block alone', () => {
    useBlockFold('tasks').toggle()
    expect(useBlockFold('tasks').open.value).toBe(false)
    expect(useBlockFold('shopping').open.value).toBe(true)
  })

  it('opens again when toggled back, and remembers that too', () => {
    const block = useBlockFold('tasks')
    block.toggle()
    block.toggle()
    expect(useBlockFold('tasks').open.value).toBe(true)
  })

  it('stays usable, and open, where storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const block = useBlockFold('tasks')
    expect(block.open.value).toBe(true)
    block.toggle()
    expect(block.open.value).toBe(false)
    vi.restoreAllMocks()
  })
})
