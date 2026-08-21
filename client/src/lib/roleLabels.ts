/**
 * Trip-membership roles (FR-4.5/4.7) as words a person reads.
 *
 * Hoisted out of the roster because the label used to be computed from the
 * stored value — `role.charAt(0).toUpperCase() + role.slice(1)` — which is a
 * spelling rule for English wire values, not a translation: it renders
 * "Editor" in every language and would render "Owner" as "Owner" forever.
 * An unknown role falls back to its own value rather than to a blank chip,
 * the same rule `attributeLabel` follows.
 */

import { t, type MessageKey } from '@/i18n'

/** The catalogue key for each `trip_members.role` value. */
export const ROLE_KEYS = {
  owner: 'role.owner',
  admin: 'role.admin',
  editor: 'role.editor',
} as const satisfies Record<string, MessageKey>

/** The localised name of a role, the raw value when it is not one we know. */
export function roleLabel(role: string): string {
  const key: MessageKey | undefined = (ROLE_KEYS as Record<string, MessageKey>)[role]
  return key ? t(key) : role
}
