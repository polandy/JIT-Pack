/**
 * The attribute an overlay carries once it has finished arriving.
 *
 * Two kinds of overlay write it — `SheetModal` on Ionic's `did-present`, and
 * `presentToast` after `present()` resolves — which is what makes it a name
 * rather than a literal (CODING_PRINCIPLES §4a). Both describe one state: the
 * enter animation has played, so the element's box is the box it keeps.
 *
 * The Playwright suite deliberately spells the string out instead of importing
 * this. A case that imported it would follow a rename automatically and stay
 * green while the contract it exists to pin had moved — the same fault as an
 * assertion that cannot fail.
 */
export const PRESENTED_ATTRIBUTE = 'data-presented'
