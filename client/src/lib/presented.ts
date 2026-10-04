/**
 * The attribute an overlay carries once it has finished arriving.
 *
 * Three kinds of overlay write it — `SheetModal` on Ionic's `did-present`,
 * `presentToast` after `present()` resolves, and every action sheet through
 * {@link markPresentedActionSheets} — which is what makes it a name rather
 * than a literal (CODING_PRINCIPLES §4a). All describe one state: the enter
 * animation has played, so the element's box is the box it keeps.
 *
 * The Playwright suite deliberately spells the string out instead of importing
 * this. A case that imported it would follow a rename automatically and stay
 * green while the contract it exists to pin had moved — the same fault as an
 * assertion that cannot fail.
 */
export const PRESENTED_ATTRIBUTE = 'data-presented'

/** The event Ionic fires on an action sheet once its enter animation has played. */
const ACTION_SHEET_DID_PRESENT = 'ionActionSheetDidPresent'

/**
 * Mark every action sheet that finishes arriving with
 * {@link PRESENTED_ATTRIBUTE}. Action sheets come from a dozen
 * `actionSheetController.create` call sites; one listener on the document
 * covers them all, where a wrapper would have to be threaded through each.
 * A button tapped while the sheet still slides in can see its pointer-down
 * and pointer-up land on different rows, so a test waits for this mark
 * before it chooses.
 */
export function markPresentedActionSheets(target: EventTarget = document): void {
  target.addEventListener(ACTION_SHEET_DID_PRESENT, (event) => {
    if (event.target instanceof Element) event.target.setAttribute(PRESENTED_ATTRIBUTE, 'true')
  })
}
