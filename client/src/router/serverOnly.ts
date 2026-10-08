import type { NavigationGuardWithThis } from 'vue-router'

import { readMode } from '@/mode'

import { backTarget } from './backTarget'

/**
 * G-8 for a typed URL: a screen only a server can fill is not entered in
 * Local Mode. Its ⋮ entry is already hidden there, so without this the one
 * way in is the address bar — and the screen it reached spoke of a server the
 * device has never had (UX-21). The route answers with its back target, the
 * screen whose ⋮ would have held the entry.
 */
export const serverOnly: NavigationGuardWithThis<undefined> = (to) =>
  readMode() === 'server' || (backTarget(to) ?? false)
