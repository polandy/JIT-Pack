import { onUnmounted, ref, type Ref } from 'vue'

/** G-9's breakpoint, the width at which a detail stands beside its list. */
const DESKTOP_QUERY = '(min-width: 900px)'

/**
 * G-9: below the breakpoint a list's detail is a bottom sheet; at or above it
 * a persistent side panel beside the list, so selecting another row swaps the
 * panel's content instead of covering the list. Follows the window as it is
 * resized; call in a component's setup.
 */
export function useDesktopLayout(): Ref<boolean> {
  const breakpoint = window.matchMedia(DESKTOP_QUERY)
  const isDesktop = ref(breakpoint.matches)
  const onBreakpoint = (event: MediaQueryListEvent) => (isDesktop.value = event.matches)
  breakpoint.addEventListener('change', onBreakpoint)
  onUnmounted(() => breakpoint.removeEventListener('change', onBreakpoint))
  return isDesktop
}
