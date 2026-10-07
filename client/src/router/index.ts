import { createRouter, createWebHistory } from '@ionic/vue-router'

import { installOverlayBackGuard } from './overlayBackGuard'
import { installOriginStamp } from './originStamp'
import { TRIP_OPEN_ROUTE } from './tripOpening'
import {
  IDEA_QUERY_PARAM,
  ITEM_ID_PARAM,
  ITEM_QUERY_PARAM,
  LINE_QUERY_PARAM,
  PATH,
  SERIES_ID_PARAM,
  TEMPLATE_ID_PARAM,
  TRIP_ID_PARAM,
  THREAD_ID_PARAM,
  EXCURSION_ID_PARAM,
  itemPath,
  seriesPath,
  templatePath,
  tripNotesPath,
  tripExcursionsPath,
  tripIdeasPath,
  tripOpenPath,
  tripPath,
  tripSubPath,
} from './paths'
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
 * `meta.acceptsLinkedFrom` honours an origin only where a link carried one
 * (FR-29.13's bridge from an idea); nothing stamps it.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: PATH.dashboard,
  },
  // Flat, deliberately: every route lives in the one router outlet in
  // App.vue. The four anchors are not children of an `IonTabs`
  // layout, which would bring a *second* outlet with it — and crossing
  // between the two leaves the outgoing page on screen while the URL
  // changes underneath it (ADR-012). The `/tabs/` prefix stays so no
  // bookmark, link or test id has to move; it names the group, not a
  // layout.
  {
    path: '/tabs/',
    redirect: PATH.dashboard,
  },
  {
    path: PATH.dashboard,
    name: 'dashboard',
    component: () => import('@/views/dashboard/DashboardPage.vue'),
  },
  {
    path: PATH.trips,
    name: 'trips',
    component: () => import('@/views/trips/TripListPage.vue'),
  },
  {
    path: PATH.templates,
    name: 'templates',
    component: () => import('@/views/templates/TemplateListPage.vue'),
  },
  {
    path: PATH.items,
    name: 'items',
    component: () => import('@/views/items/ItemInventoryPage.vue'),
  },
  {
    path: PATH.settings,
    name: 'settings',
    // A global action: the gear is offered on every screen, so no one
    // parent is true (ADR-011 amendment).
    meta: { parent: PATH.dashboard, acceptsFrom: true, titleKey: 'settings.title' },
    component: () => import('@/views/settings/SettingsPage.vue'),
  },
  {
    path: PATH.login,
    name: 'login',
    component: () => import('@/views/auth/LoginPage.vue'),
  },
  {
    path: PATH.authCallback,
    name: 'auth-callback',
    component: () => import('@/views/auth/CallbackPage.vue'),
  },
  {
    path: PATH.newTrip,
    meta: { parent: PATH.trips, titleKey: 'trips.new' },
    name: 'trip-wizard',
    component: () => import('@/views/trips/TripWizardPage.vue'),
  },
  {
    // The packing list, and — through `?item=` — the item sheet or panel
    // over it (UI-Spec M5, ADR-046). The item is a query rather than a
    // path parameter because Ionic keeps one page per matched *path*: a
    // second record, and equally an alias with its own parameter, mounted
    // a second copy of the list on every open.
    path: tripPath(TRIP_ID_PARAM),
    meta: {
      parent: PATH.trips,
      // With the sheet open, back closes it rather than leaving the trip.
      overlayQuery: ITEM_QUERY_PARAM,
      overlayParent: tripPath(TRIP_ID_PARAM),
      tripView: 'packing',
    },
    name: 'trip-detail',
    component: () => import('@/views/trips/PackingListPage.vue'),
    props: true,
  },
  {
    path: PATH.importSpreadsheet,
    // A flow: entered from M2 and from M9 (Navigation_Concept §7).
    meta: { parent: PATH.items, acceptsFrom: true, titleKey: 'items.importSpreadsheet' },
    name: 'import-wizard',
    component: () => import('@/views/import/ImportPage.vue'),
  },
  {
    path: PATH.importFile,
    // A flow: entered from M2, M7 and Settings.
    meta: { parent: PATH.settings, acceptsFrom: true, titleKey: 'nav.title.importFile' },
    name: 'portable-import',
    component: () => import('@/views/import/PortableImportPage.vue'),
  },
  {
    path: seriesPath(SERIES_ID_PARAM),
    meta: { parent: PATH.trips, titleKey: 'nav.title.series' },
    name: 'series-profile',
    component: () => import('@/views/series/SeriesPage.vue'),
    props: true,
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'edit'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'tripEdit.title' },
    name: 'trip-edit',
    component: () => import('@/views/trips/TripEditPage.vue'),
    props: true,
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'clone'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'trips.actionClone' },
    name: 'trip-clone',
    component: () => import('@/views/trips/ClonePage.vue'),
    props: true,
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'review'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'review.title' },
    name: 'trip-review',
    component: () => import('@/views/trips/ReviewPage.vue'),
    props: true,
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'template'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'templateFromTrip.title' },
    name: 'trip-template',
    component: () => import('@/views/trips/TemplateFromTripPage.vue'),
    props: true,
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'analytics'),
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'analytics' },
    name: 'trip-analytics',
    component: () => import('@/views/trips/AnalyticsPage.vue'),
    props: true,
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'containers'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'container.title', tripView: 'luggage' },
    name: 'trip-containers',
    component: () => import('@/views/trips/ContainerPage.vue'),
    props: true,
  },
  {
    // The master partition's log belongs to no trip, so it is offered on
    // every screen and returns to the one it was opened from (ADR-011
    // amendment) — the same shape as the settings gear.
    path: PATH.masterConflicts,
    name: 'master-conflicts',
    meta: { parent: PATH.dashboard, acceptsFrom: true, titleKey: 'conflicts.titleMaster' },
    component: () => import('@/views/trips/ConflictLogPage.vue'),
  },
  {
    // M23 (FR-24.3). Like the master conflict log beside it, it belongs to
    // no one screen — a retire can start in M9 or in M7 — so it is offered
    // from Settings and returns where it was opened from (ADR-011 amendment).
    path: PATH.masterRetired,
    name: 'master-retired',
    meta: { parent: PATH.settings, acceptsFrom: true, titleKey: 'retired.title' },
    component: () => import('@/views/master/RetiredMasterPage.vue'),
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'conflicts'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'conflicts.title' },
    name: 'trip-conflicts',
    component: () => import('@/views/trips/ConflictLogPage.vue'),
    props: true,
  },
  {
    // M30 (FR-32.2): reached from every trip view's ⋮.
    path: tripSubPath(TRIP_ID_PARAM, 'activity'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'activity.title' },
    name: 'trip-activity',
    props: true,
    component: () => import('@/views/activity/ActivityLogPage.vue'),
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'members'),
    meta: { parent: tripPath(TRIP_ID_PARAM), titleKey: 'members.title' },
    name: 'trip-members',
    component: () => import('@/views/trips/TripMembersPage.vue'),
    props: true,
  },
  {
    path: PATH.admin,
    meta: { parent: PATH.settings, acceptsFrom: true, titleKey: 'admin.title' },
    name: 'admin',
    component: () => import('@/views/settings/AdminPage.vue'),
  },
  {
    path: tripSubPath(TRIP_ID_PARAM, 'shopping'),
    // FR-29.13: entered from an idea to make something of it, back is the idea.
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'shopping', acceptsLinkedFrom: true },
    name: 'trip-shopping',
    component: () => import('@/shopping/ShoppingPage.vue'),
    props: true,
  },
  {
    // M25 (FR-7.7): every task of the trip, in its two phases.
    path: tripSubPath(TRIP_ID_PARAM, 'tasks'),
    // FR-29.13: entered from an idea to make something of it, back is the idea.
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'tasks', acceptsLinkedFrom: true },
    name: 'trip-tasks',
    component: () => import('@/views/trips/TripTasksPage.vue'),
    props: true,
  },
  {
    // M26 (FR-7.13): the trip's notes, as threads — a view of their own.
    path: tripSubPath(TRIP_ID_PARAM, 'notes'),
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'notes' },
    name: 'trip-notes',
    component: () => import('@/views/trips/TripNotesPage.vue'),
    props: true,
  },
  {
    // M28 (§3.29): the trip's ideas — the planner module's board. One idea's
    // sheet over it is `?idea=`, as M5's is `?item=` over M4.
    path: tripIdeasPath(TRIP_ID_PARAM),
    meta: {
      parent: tripPath(TRIP_ID_PARAM),
      overlayQuery: IDEA_QUERY_PARAM,
      overlayParent: tripIdeasPath(TRIP_ID_PARAM),
      tripView: 'ideas',
    },
    name: 'trip-ideas',
    component: () => import('@/planner/IdeasPage.vue'),
    props: true,
  },
  {
    // M29 (FR-29.15): the trip's day plan — the planner module's second screen.
    path: tripSubPath(TRIP_ID_PARAM, 'dayplan'),
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'dayplan', acceptsLinkedFrom: true },
    name: 'trip-dayplan',
    component: () => import('@/planner/DayPlanPage.vue'),
    props: true,
  },
  {
    // M31 (§3.33): the trip's meal plan — the meals module's screen.
    path: tripSubPath(TRIP_ID_PARAM, 'meals'),
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'meals' },
    name: 'trip-meals',
    component: () => import('@/meals/MealPlanPage.vue'),
    props: true,
  },
  {
    // FR-29.7: the trip opened on the view its dates decide. Never rendered —
    // `installTripOpening` redirects it before it matches a page; the
    // component is only what a router with no guard installed would show.
    path: tripOpenPath(TRIP_ID_PARAM),
    meta: { parent: PATH.trips },
    name: TRIP_OPEN_ROUTE,
    component: () => import('@/views/trips/PackingListPage.vue'),
    props: true,
  },
  {
    // M27 (FR-31): the trip's excursions, each with its own small list.
    path: tripExcursionsPath(TRIP_ID_PARAM),
    // FR-29.13: entered from an idea to make something of it, back is the idea.
    meta: { parent: tripPath(TRIP_ID_PARAM), tripView: 'excursions', acceptsLinkedFrom: true },
    name: 'trip-excursions',
    component: () => import('@/views/trips/TripExcursionsPage.vue'),
    props: true,
  },
  {
    // One excursion's list (FR-31.6), under M27 and still in its view; a
    // line's sheet over it is `?line=`, as M5's is `?item=` over M4.
    path: tripExcursionsPath(TRIP_ID_PARAM, EXCURSION_ID_PARAM),
    meta: {
      parent: tripExcursionsPath(TRIP_ID_PARAM),
      // FR-29.13: one made from an idea opens here and still returns to it.
      acceptsLinkedFrom: true,
      overlayQuery: LINE_QUERY_PARAM,
      overlayParent: tripExcursionsPath(TRIP_ID_PARAM, EXCURSION_ID_PARAM),
      tripView: 'excursions',
    },
    name: 'trip-excursion',
    component: () => import('@/views/trips/TripExcursionPage.vue'),
    props: true,
  },
  {
    // M26's thread view (FR-7.13): one conversation, returning to the list.
    path: tripNotesPath(TRIP_ID_PARAM, THREAD_ID_PARAM),
    meta: { parent: tripNotesPath(TRIP_ID_PARAM) },
    name: 'trip-note-thread',
    component: () => import('@/views/trips/TripNoteThreadPage.vue'),
    props: true,
  },
  {
    path: templatePath(TEMPLATE_ID_PARAM),
    meta: { parent: PATH.templates, titleKey: 'nav.title.template' },
    name: 'template-editor',
    component: () => import('@/views/templates/TemplateEditorPage.vue'),
    props: true,
  },
  {
    // FR-24.5: creation is the editor in its minimal mode, so it is a route
    // rather than a prompt — and it must precede /items/:itemId, or "new"
    // would be read as an item id.
    path: PATH.newItem,
    meta: { parent: PATH.items, titleKey: 'nav.title.newItem' },
    name: 'item-create',
    component: () => import('@/views/items/ItemEditorPage.vue'),
  },
  {
    // M24 (FR-24.12). Reached from M9 only, so it returns there; like
    // /items/new it must precede /items/:itemId.
    path: PATH.inventoryCleanup,
    meta: { parent: PATH.items, titleKey: 'cleanup.title' },
    name: 'inventory-cleanup',
    component: () => import('@/views/items/InventoryCleanupPage.vue'),
  },
  {
    // M30 for the inventory (FR-32.2), reached from M9's ⋮; like
    // /items/cleanup it must precede /items/:itemId.
    path: PATH.inventoryActivity,
    meta: { parent: PATH.items, titleKey: 'activity.titleInventory' },
    name: 'inventory-activity',
    component: () => import('@/views/activity/ActivityLogPage.vue'),
  },
  {
    path: itemPath(ITEM_ID_PARAM),
    meta: { parent: PATH.items, titleKey: 'nav.title.item' },
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
    path: PATH.devGallery,
    meta: { parent: PATH.settings, acceptsFrom: true, titleKey: 'nav.title.gallery' },
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
