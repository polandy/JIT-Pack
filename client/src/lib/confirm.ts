/**
 * The confirmation dialog, asked in one place.
 *
 * Ten call sites had written the same `alertController.create` by hand and
 * read the answer back in three different ways: the dismissal role
 * (`'destructive'`, `'confirm'`), a boolean returned from the caller's own
 * wrapper, and a `handler` that performed the action from inside the
 * alert. The third is the one that costs: the action then runs *before*
 * the alert is dismissed, so a caller that also navigates does it under a
 * dialog that is still on screen, and nothing about the call site says so.
 *
 * One protocol here — the promise resolves to whether the user confirmed,
 * and the caller acts afterwards. `role` stays a parameter because it is
 * not decoration: on iOS a destructive button is red, and the two dialogs
 * that ask to *take over* rather than to delete must not be.
 */
import { alertController } from '@ionic/vue'

import { t } from '@/i18n'

/** What a confirmation says; the cancel button is worded here. */
export interface ConfirmOptions {
  /** The question, as a title. */
  header?: string
  /** What confirming will do — a sentence, where the title is a name. */
  message?: string
  /** The confirming button's label; never "OK" (G-16). */
  confirmLabel: string
  /** Put on the `ion-alert` element, for a case that has to find this one. */
  testid?: string
}

async function ask(options: ConfirmOptions, role: 'destructive' | 'confirm'): Promise<boolean> {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: options.confirmLabel, role },
    ],
  })
  if (options.testid) alert.setAttribute('data-testid', options.testid)
  await alert.present()
  const { role: chosen } = await alert.onDidDismiss()
  return chosen === role
}

/** Asks before something is removed or deactivated. */
export function confirmDestructive(options: ConfirmOptions): Promise<boolean> {
  return ask(options, 'destructive')
}

/** Asks before something is taken over or given up — nothing is deleted. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return ask(options, 'confirm')
}

/** What a prompt asks for, and what it does with the answer. */
export interface PromptOptions {
  header?: string
  message?: string
  /** The text the field opens with. */
  value: string
  placeholder?: string
  confirmLabel: string
  testid?: string
  /**
   * Called with the trimmed answer. Returning `false` keeps the alert open
   * *with the typed text* — the idiom both prompts use for a name that is
   * already taken, because dismissing would throw the edit away. Anything
   * else closes it.
   */
  onConfirm: (value: string) => boolean | void | Promise<boolean | void>
}

/**
 * A one-field prompt. The input carries `aria-label="name"`, which is how
 * both existing call sites and their e2e cases address it.
 */
export async function promptText(options: PromptOptions): Promise<void> {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    inputs: [
      {
        name: 'name',
        value: options.value,
        placeholder: options.placeholder,
        attributes: { 'aria-label': 'name' },
      },
    ],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: options.confirmLabel,
        handler: async (values: { name?: string }) => {
          const answer = await options.onConfirm(values.name?.trim() ?? '')
          return answer === false ? false : true
        },
      },
    ],
  })
  if (options.testid) alert.setAttribute('data-testid', options.testid)
  await alert.present()
}
