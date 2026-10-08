/**
 * The person picker (FR-25.25/FR-7.5): who is this for?
 *
 * One sheet for the two things that are handed over — a packing row and, since
 * FR-7.7, a task. It was M4's private helper until the tasks got a screen of
 * their own; moved rather than copied, because the three-way answer below is
 * the kind of distinction that goes wrong the second time it is written.
 *
 * Resolves to the chosen assignment — `null` is *nobody*, which is a choice
 * like any other — or to `undefined` when the sheet was dismissed, because
 * „assign to nobody" and „never mind" must not arrive as the same value.
 */
import { actionSheetController } from '@ionic/vue'
import { personOutline, removeCircleOutline } from 'ionicons/icons'

import { t } from '@/i18n'
import type { TripParticipant } from '@/types/domain'

export async function pickAssignee(
  header: string,
  current: string | null,
  people: readonly TripParticipant[],
): Promise<string | null | undefined> {
  let picked: string | null | undefined
  const sheet = await actionSheetController.create({
    header,
    buttons: [
      ...people.map((person) => ({
        text: person.display_name,
        icon: personOutline,
        role: person.user_id === current ? 'selected' : undefined,
        handler: () => {
          picked = person.user_id
        },
      })),
      {
        text: t('item.assignedToNobody'),
        icon: removeCircleOutline,
        role: current === null ? 'selected' : undefined,
        handler: () => {
          picked = null
        },
      },
      { text: t('common.cancel'), role: 'cancel' },
    ],
  })
  await sheet.present()
  await sheet.onDidDismiss()
  return picked
}
