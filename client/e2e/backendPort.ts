/**
 * The port the e2e backend (`jitpackd-e2e`) listens on — named once, read by
 * both `playwright.config.ts` (which boots the server there) and
 * `vite.config.ts` (which proxies the preview origin to it). A second copy
 * of the default is how the two would drift apart (CODING_PRINCIPLES §4a).
 */
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 8799)
