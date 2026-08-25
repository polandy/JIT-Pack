/**
 * The refusal vocabulary the server speaks (Sync-API §5).
 *
 * A `rejected` mutation used to arrive as one word for five situations, so
 * the client parked it with nothing to say. The reasons are a closed set on
 * the wire and are mapped here — once — to the catalogue keys that turn
 * them into a sentence in the user's language.
 */
import { describe, it, expect } from 'vitest'

import { REJECTION_REASON, rejectionReasonKey } from '../rejectionReasons'
import { en } from '@/i18n/messages/en'
import { de } from '@/i18n/messages/de'

describe('rejectionReasonKey', () => {
  it('names a catalogue key for every reason the server can send', () => {
    for (const reason of Object.values(REJECTION_REASON)) {
      const key = rejectionReasonKey(reason)
      expect(key, `no key for ${reason}`).not.toBeNull()
      expect(en[key!], `no en copy for ${reason}`).toBeTruthy()
      expect(de[key!], `no de copy for ${reason}`).toBeTruthy()
    }
  })

  it('answers null for anything else, so a raw server string never becomes UI copy', () => {
    expect(rejectionReasonKey('unknown column: trip_items.nope')).toBeNull()
    expect(rejectionReasonKey('')).toBeNull()
  })
})
