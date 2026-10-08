import { vi } from 'vitest'

import type { IdentitySource } from '@/stores/identityStore'

/**
 * The two calls `useIdentity` makes, for a mount spec whose screen names
 * somebody (ADR-047).
 *
 * Shared for the reason `tripScreenStub` is: a spec that omits one of them
 * fails on a `TypeError` inside `onMounted` rather than on an assertion,
 * which reads as a broken test instead of the missing seam it is. Spread it
 * first and override the half the spec is actually about.
 */
export function identityStub(): IdentitySource {
  return {
    fetchUsers: vi.fn(async () => []),
    fetchMe: vi.fn(async () => ({
      user_id: 'u1',
      display_name: 'Andy',
      is_instance_admin: false,
    })),
  }
}
