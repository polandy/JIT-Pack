/// <reference types="vite/client" />

// Injected by vite.config.ts's `define` (git describe / rev-parse, or the
// Docker build's APP_VERSION/APP_COMMIT args) — read by the Settings "About"
// section (M17).
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
