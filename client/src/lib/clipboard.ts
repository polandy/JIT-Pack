/**
 * Copying one string to the clipboard (FR-23.7).
 *
 * It lives here rather than inline in the component for the ordinary reason:
 * a component that reaches for `navigator.clipboard` itself cannot be unit
 * tested, and this is the first place in the app that copies anything.
 *
 * The caller must not depend on it succeeding. `navigator.clipboard` exists
 * only in a secure context and can be refused by permission, so the surface
 * that offers a copy has to show the value as text as well — which is also
 * what makes "shown exactly once" mean shown to the *person*.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Refused or unavailable — fall through to the older path rather than
      // reporting a failure the fallback might not have.
    }
  }
  return legacyCopy(text)
}

/**
 * The pre-Clipboard-API path, for a page served over plain http — a
 * self-hosted instance on a LAN address is exactly that case.
 */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  // Off-screen rather than hidden: an element with `display: none` cannot be
  // selected, and the selection is what execCommand copies.
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  try {
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
