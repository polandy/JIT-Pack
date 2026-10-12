/**
 * M3 step 2 — the travelers (FR-2.5/2.5a, FR-1.9) and, with an OIDC session,
 * whom the trip is shared with and in which role (FR-4.5/4.7). In Single-User
 * and Local Mode there is no second account to share with (FR-17.3/FR-19.3/G-8).
 */
import { computed, onMounted, ref } from 'vue'

import { hasCollaborativeSession } from '@/mode'
import { useIdentity } from '@/composables/shared/useTripIdentity'
import { defaultTravelers } from '@/composables/useDefaultTravelers'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'

/**
 * The select's value for *nobody*: not `null`, which `IonSelect` reads as "no
 * value chosen" and answers with its placeholder (same as M22's picker).
 */
export const NO_ACCOUNT = ''

// FR-2.5a: the household's default travellers are the starting point of
// every trip; step 2 adds, renames and removes them exactly as before.
// A traveler may be an existing account (`linkedUserId`, FR-1.9). One added
// through the account picker is also a collaborator of the trip from its
// first moment (`member`), with `role`; a plain traveler may only be linked
// to the creator or to someone the trip is shared with anyway.
type TravelerRole = 'admin' | 'editor'
type WizardTraveler = {
  name: string
  linkedUserId: string
  member: boolean
  role: TravelerRole
}

/** Step 2's draft: the roster, the shares, and who may be linked to whom. */
export type WizardTravelers = ReturnType<typeof useWizardTravelers>

/** Builds {@link WizardTravelers}; call once, in the page's setup. */
export function useWizardTravelers() {
  const orchestrator = useOrchestrator()

  const travelers = ref<WizardTraveler[]>(
    // A default picked from the accounts (FR-2.5a) comes back as the picker
    // would add it: linked, and a collaborator from the trip's first moment.
    defaultTravelers().entries.value.map((e) => ({
      name: e.name,
      linkedUserId: e.userId ?? NO_ACCOUNT,
      member: e.userId !== null,
      role: 'editor',
    })),
  )

  function addTraveler() {
    travelers.value = [
      ...travelers.value,
      { name: '', linkedUserId: NO_ACCOUNT, member: false, role: 'editor' },
    ]
  }

  function removeTraveler(index: number) {
    travelers.value = travelers.value.filter((_, i) => i !== index)
  }

  /** Adds the account as a traveler named like it; the name stays editable. */
  function addAccountTraveler(userId: string) {
    const account = directory.value.find((u) => u.user_id === userId)
    if (!account || travelers.value.some((t) => t.linkedUserId === userId)) return
    travelers.value = [
      ...travelers.value,
      { name: account.display_name, linkedUserId: userId, member: true, role: 'editor' },
    ]
  }

  function setTravelerRole(index: number, role: TravelerRole) {
    travelers.value = travelers.value.map((t, i) => (i === index ? { ...t, role } : t))
  }

  /** Whether the row is the creator: Owner already, so it has no role to pick. */
  function isMe(userId: string): boolean {
    return userId !== NO_ACCOUNT && userId === myUserId.value
  }

  // --- Sharing & roles (FR-4.5/4.7) ---
  const collaborative = hasCollaborativeSession()

  const { directory, myUserId, load: loadIdentity } = useIdentity(orchestrator.identity)
  const shares = ref<{ userId: string; role: 'admin' | 'editor' }[]>([])

  onMounted(async () => {
    // Step 2 is the only reader, and it does not exist without a session to
    // share with — so the fetch is skipped rather than answered with nothing.
    if (!collaborative) return
    await loadIdentity()
  })

  /** Accounts still shareable: not me (Owner anyway), not already added, not already a linked traveler. */
  const shareCandidates = computed(() =>
    directory.value.filter(
      (u) =>
        u.user_id !== myUserId.value &&
        !shares.value.some((s) => s.userId === u.user_id) &&
        !travelers.value.some((t) => t.linkedUserId === u.user_id),
    ),
  )

  /** Accounts a traveler can still be: anyone not yet linked, the creator included. */
  const travelerAccountCandidates = computed(() =>
    directory.value.filter(
      (u) =>
        !travelers.value.some((t) => t.linkedUserId === u.user_id) &&
        !shares.value.some((s) => s.userId === u.user_id),
    ),
  )

  /** Everyone the trip is shared with: the plain shares plus the linked travelers (never the creator). */
  const allMembers = computed(() => [
    ...shares.value,
    ...travelers.value
      .filter((t) => t.member && t.linkedUserId !== NO_ACCOUNT && !isMe(t.linkedUserId))
      .map((t) => ({ userId: t.linkedUserId, role: t.role })),
  ])

  function addShare(userId: string) {
    if (!userId || shares.value.some((s) => s.userId === userId)) return
    shares.value = [...shares.value, { userId, role: 'editor' }]
  }

  function setShareRole(index: number, role: 'admin' | 'editor') {
    shares.value = shares.value.map((s, i) => (i === index ? { ...s, role } : s))
  }

  function removeShare(index: number) {
    shares.value = shares.value.filter((_, i) => i !== index)
  }

  function shareName(userId: string): string {
    return directory.value.find((u) => u.user_id === userId)?.display_name ?? userId
  }

  /**
   * Who a traveler may be recorded as while creating (FR-2.5, FR-1.9): the
   * creator and the accounts the trip is shared with — the trip's future
   * members, which is all the server accepts as a link (ADR-058). Myself is on
   * the list because the account being recorded is most often my own.
   */
  const linkableAccounts = computed(() => {
    const me = myUserId.value
    if (!collaborative || !me) return []
    const ids = [me, ...shares.value.map((s) => s.userId)]
    return ids.map((id) => ({ userId: id, name: shareName(id) }))
  })

  /** G-8: absent where it can mean nothing — nobody to be but oneself. */
  const canLinkTravelers = computed(() => linkableAccounts.value.length > 1)

  /** What row `index` may be linked to: not an account another traveler already is. */
  function linkableFor(index: number) {
    if (!canLinkTravelers.value) return []
    return linkableAccounts.value.filter(
      (a) => !travelers.value.some((t, i) => i !== index && t.linkedUserId === a.userId),
    )
  }

  /** A link whose account was un-shared after picking is dropped, not sent; a picked member is always kept. */
  function linkedAccountOf(traveler: WizardTraveler): string | null {
    if (traveler.member) return traveler.linkedUserId || null
    const stillLinkable = linkableAccounts.value.some((a) => a.userId === traveler.linkedUserId)
    return stillLinkable && traveler.linkedUserId !== NO_ACCOUNT ? traveler.linkedUserId : null
  }

  return {
    travelers,
    addTraveler,
    removeTraveler,
    addAccountTraveler,
    setTravelerRole,
    isMe,
    collaborative,
    shares,
    shareCandidates,
    travelerAccountCandidates,
    allMembers,
    addShare,
    setShareRole,
    removeShare,
    shareName,
    linkableFor,
    linkedAccountOf,
  }
}
