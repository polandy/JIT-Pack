/**
 * G-2 — the status glyph in the app bar.
 *
 * Since the outbox became durable (B2, NFR-4.1) the queue outlives the
 * connection state that produced it: a reload leaves a queue behind, and a
 * master partition can drain while a trip's queue is still waiting for the
 * trip to be opened. The badge therefore counts the queue, not the state —
 * before, it hid the moment `state` stopped being `offline`, which said
 * "everything is sent" over a queue that was not.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import SyncIndicator from '../SyncIndicator.vue'

function mountIndicator(props: Partial<InstanceType<typeof SyncIndicator>['$props']> = {}) {
  return mount(SyncIndicator, {
    props: { state: 'synced', pendingCount: 0, label: 'Synced', ...props },
    global: { stubs: { IonIcon: true, IonBadge: { template: '<span><slot /></span>' } } },
  })
}

const badge = (w: ReturnType<typeof mountIndicator>) => w.find('[data-testid="sync-queue-count"]')

describe('SyncIndicator', () => {
  it('counts the queue while offline', () => {
    expect(badge(mountIndicator({ state: 'offline', pendingCount: 3 })).text()).toBe('3')
  })

  it('keeps counting a queue that has not gone out yet, whatever the glyph says', () => {
    expect(badge(mountIndicator({ state: 'synced', pendingCount: 2 })).text()).toBe('2')
  })

  it('shows nothing once the queue is empty', () => {
    expect(badge(mountIndicator({ state: 'offline', pendingCount: 0 })).exists()).toBe(false)
  })
})
