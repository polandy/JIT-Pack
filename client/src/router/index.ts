import { createRouter, createWebHistory } from '@ionic/vue-router'

import { installOverlayBackGuard } from './overlayBackGuard'
import { installOriginStamp } from './originStamp'
import type { RouteRecordRaw } from 'vue-router'

/**
 * Route table. Every non-root route carries `meta.parent` — the
 * back-target contract of Navigation_Concept §7, binding since ADR-011:
 * with one header bar, `‹ back` is the only way out of a drill-down, so
 * the target comes from the route rather than from history, which a
 * cold-start deep link does not have. `backTarget.spec.ts` fails if a
 * route is added without one.
 *
 * A route that can be entered from anywhere — the settings gear, the
 * import flows — additionally carries `meta.acceptsFrom`: it is stamped
 * with its origin on the way in (originStamp.ts) and returns there,
 * keeping `parent` as the fallback for the entry that has no origin.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/tabs/dashboard',
  },
  // Flat, deliberately: every route lives in the one router outlet in
  // App.vue. The four anchors used to be children of an `IonTabs`
  // layout, which brought a *second* outlet with it — and crossing
  // between the two left the outgoing page on screen while the URL
  // changed underneath it (ADR-012). The `/tabs/` prefix stays so no
  // bookmark, link or test id has to move; it names the group, not a
  // layout.
  {
    path: '/tabs/',
    redirect: '/tabs/dashboard',
  },
  {
    path: '/tabs/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/DashboardPage.vue'),
  },
  {
    path: '/tabs/trips',
    name: 'trips',
    component: () => import('@/views/trips/TripListPage.vue'),
  },
  {
    path: '/tabs/templates',
    name: 'templates',
    component: () => import('@/views/templates/TemplateListPage.vue'),
  },
  {
    path: '/tabs/items',
    name: 'items',
    component: () => import('@/views/items/ItemInventoryPage.vue'),
  },
  {
    path: '/tabs/settings',
    name: 'settings',
    // A global action: the gear is offered on every screen, so no one
    // parent is true (ADR-011 amendment).
    meta: { parent: '/tabs/dashboard', acceptsFrom: true, titleKey: 'settings.title' },
    component: () => import('@/views/settings/SettingsPage.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginPage.vue'),
  },
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/auth/CallbackPage.vue'),
  },
  {
    path: '/trips/new',
    meta: { parent: '/tabs/trips', titleKey: 'trips.new' },
    name: 'trip-wizard',
    component: () => import('@/views/trips/TripWizardPage.vue'),
  },
  {
    // The packing list, and — through the alias — the item sheet over it
    // (UI-Spec M5). One route *record* on purpose: a second record would
    // mount a second copy of the list behind the sheet, because Ionic
    // keeps a page per matched record. With an alias only the params
    // change, so the list stays the one the user was already looking at.
    path: '/trips/:tripId',
    alias: '/trips/:tripId/items/:itemId',
    meta: {
      parent: '/tabs/trips',
      // With the sheet open, back closes it rather than leaving the trip.
      overlayParam: 'itemId',
      overlayParent: '/trips/:tripId',
    },
    name: 'trip-detail',
    component: () => import('@/views/trips/PackingListPage.vue'),
    props: true,
  },
  {
    path: '/import',
    // A flow: entered from M2 and from M9 (Navigation_Concept §7).
    meta: { parent: '/tabs/items', acceptsFrom: true, titleKey: 'items.importSpreadsheet' },
    name: 'import-wizard',
    component: () => import('@/views/import/ImportPage.vue'),
  },
  {
    path: '/portable-import',
    // A flow: entered from M2, M7 and Settings.
    meta: { parent: '/tabs/settings', acceptsFrom: true, titleKey: 'nav.title.importFile' },
    name: 'portable-import',
    component: () => import('@/views/import/PortableImportPage.vue'),
  },
  {
    path: '/series/:seriesId',
    meta: { parent: '/tabs/trips', titleKey: 'nav.title.series' },
    name: 'series-profile',
    component: () => import('@/views/series/SeriesPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/edit',
    meta: { parent: '/trips/:tripId', titleKey: 'tripEdit.title' },
    name: 'trip-edit',
    component: () => import('@/views/trips/TripEditPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/clone',
    meta: { parent: '/trips/:tripId', titleKey: 'trips.actionClone' },
    name: 'trip-clone',
    component: () => import('@/views/trips/ClonePage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/review',
    meta: { parent: '/trips/:tripId', titleKey: 'review.title' },
    name: 'trip-review',
    component: () => import('@/views/trips/ReviewPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/template',
    meta: { parent: '/trips/:tripId', titleKey: 'templateFromTrip.title' },
    name: 'trip-template',
    component: () => import('@/views/trips/TemplateFromTripPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/analytics',
    meta: { parent: '/trips/:tripId' },
    name: 'trip-analytics',
    component: () => import('@/views/trips/AnalyticsPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/containers',
    meta: { parent: '/trips/:tripId', titleKey: 'container.title' },
    name: 'trip-containers',
    component: () => import('@/views/trips/ContainerPage.vue'),
    props: true,
  },
  {
    // The master partition's log belongs to no trip, so it is offered on
    // every screen and returns to the one it was opened from (ADR-011
    // amendment) — the same shape as the settings gear.
    path: '/master/conflicts',
    name: 'master-conflicts',
    meta: { parent: '/tabs/dashboard', acceptsFrom: true, titleKey: 'conflicts.titleMaster' },
    component: () => import('@/views/trips/ConflictLogPage.vue'),
  },
  {
    // M23 (FR-24.3). Like the master conflict log beside it, it belongs to
    // no one screen — a retire can start in M9 or in M7 — so it is offered
    // from Settings and returns where it was opened from (ADR-011 amendment).
    path: '/master/retired',
    name: 'master-retired',
    meta: { parent: '/tabs/settings', acceptsFrom: true, titleKey: 'retired.title' },
    component: () => import('@/views/master/RetiredMasterPage.vue'),
  },
  {
    path: '/trips/:tripId/conflicts',
    meta: { parent: '/trips/:tripId', titleKey: 'conflicts.title' },
    name: 'trip-conflicts',
    component: () => import('@/views/trips/ConflictLogPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/members',
    meta: { parent: '/trips/:tripId', titleKey: 'members.title' },
    name: 'trip-members',
    component: () => import('@/views/trips/TripMembersPage.vue'),
    props: true,
  },
  {
    path: '/admin',
    meta: { parent: '/tabs/settings', acceptsFrom: true, titleKey: 'admin.title' },
    name: 'admin',
    component: () => import('@/views/settings/AdminPage.vue'),
  },
  {
    path: '/trips/:tripId/shopping',
    meta: { parent: '/trips/:tripId' },
    name: 'trip-shopping',
    component: () => import('@/views/trips/ShoppingPage.vue'),
    props: true,
  },
  {
    path: '/templates/:templateId',
    meta: { parent: '/tabs/templates', titleKey: 'nav.title.template' },
    name: 'template-editor',
    component: () => import('@/views/templates/TemplateEditorPage.vue'),
    props: true,
  },
  {
    // FR-24.5: creation is the editor in its minimal mode, so it is a route
    // rather than a prompt — and it must precede /items/:itemId, or "new"
    // would be read as an item id.
    path: '/items/new',
    meta: { parent: '/tabs/items', titleKey: 'nav.title.newItem' },
    name: 'item-create',
    component: () => import('@/views/items/ItemEditorPage.vue'),
  },
  {
    path: '/items/:itemId',
    meta: { parent: '/tabs/items', titleKey: 'nav.title.item' },
    name: 'item-editor',
    component: () => import('@/views/items/ItemEditorPage.vue'),
    props: true,
  },
]

/*
 * Development only (ADR-013): the component gallery, following the same
 * `import.meta.env.DEV` shape as src/dev/sampleTrip.ts. `import.meta.env.DEV`
 * is a compile-time constant, so both the route and the chunk behind it are
 * gone from a production bundle — nobody running an instance can reach it.
 */
if (import.meta.env.DEV) {
  routes.push({
    path: '/dev/gallery',
    meta: { parent: '/tabs/settings', acceptsFrom: true, titleKey: 'nav.title.gallery' },
    name: 'dev-gallery',
    component: () => import('@/dev/GalleryPage.vue'),
  })
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// A route of the fifth class records where it was entered from, before
// anything reads the back target off it (ADR-011 amendment).
installOriginStamp(router)

// Browser-back with an overlay open closes the overlay, like the chevron.
installOverlayBackGuard(router)

export default router
