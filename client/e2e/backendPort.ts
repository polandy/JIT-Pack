/**
 * The ports the e2e backends listen on — named here once, read by
 * `playwright.config.ts` (which boots the servers) and by `vite.config.ts`
 * (which proxies a preview origin to one of them). A second copy of a
 * default is how the two would drift apart (CODING_PRINCIPLES §4a).
 *
 * `E2E_API_PORT` is per-preview-process on purpose: both backend-backed
 * projects run their own `vite preview`, and each one is handed the port of
 * *its* backend in the environment — that is what lets the Single-User and
 * the multi-user instance exist side by side behind one config file.
 */
export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 8799)

/** The multi-user (`server` project) jitpackd, behind its own preview. */
export const E2E_SERVER_API_PORT = Number(process.env.E2E_SERVER_API_PORT ?? 8798)

/** The mock IdP that jitpackd brokers logins against (UI-Test-Spec §2.3). */
export const E2E_IDP_PORT = Number(process.env.E2E_IDP_PORT ?? 8797)
