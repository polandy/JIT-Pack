import { createApp } from 'vue'
import { IonicVue } from '@ionic/vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

/* Ionic core + utility styles */
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

/* App-owned theme (Addendum 3.21): Catppuccin, dark by default in every
 * mode and independent of the OS preference — deliberately replaces
 * Ionic's prefers-color-scheme palette (FR-21.1). */
import './theme/catppuccin.css'
/* The second table (G-13): the two self-hosted faces, the type scale, and
 * the display-type roles. */
import './theme/typography.css'
/* The third (G-14): radius, elevation and the card they add up to. Loads
 * after the palette because its shadows are cast in the flavour's ink. */
import './theme/surfaces.css'
import { initTheme } from './theme/theme'

/* Language (NFR-4.12): English default, German fully supported. Resolved
 * before mount for the same reason as the theme — the first paint should
 * already be in the user's language, not switch under them. */
import { initLocale } from './i18n'

/* App shell + push worker (NFR-4.13/NFR-4.6): registered unconditionally at
 * start, not only when push is enabled. Production only — the dev server has
 * no built bundle to precache, and a worker caching Vite's module graph turns
 * every source edit into a stale-cache hunt. */
import { registerAppServiceWorker } from './pwa/register'

initTheme()
initLocale()
if (import.meta.env.PROD) registerAppServiceWorker()

const app = createApp(App)

app.use(IonicVue)
app.use(createPinia())
app.use(router)

router.isReady().then(() => {
  app.mount('#app')
})
