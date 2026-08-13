import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import TabsLayout from '@/views/TabsLayout.vue'

/**
 * Route table. Every non-root route carries `meta.parent` — the
 * back-target contract of Navigation_Concept §7, binding since ADR-011:
 * with one header bar, `‹ back` is the only way out of a drill-down, so
 * the target comes from the route rather than from history, which a
 * cold-start deep link does not have. `backTarget.spec.ts` fails if a
 * route is added without one.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/tabs/dashboard',
  },
  {
    path: '/tabs/',
    component: TabsLayout,
    children: [
      {
        path: '',
        redirect: '/tabs/dashboard',
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardPage.vue'),
      },
      {
        path: 'trips',
        name: 'trips',
        component: () => import('@/views/trips/TripListPage.vue'),
      },
      {
        path: 'templates',
        name: 'templates',
        component: () => import('@/views/templates/TemplateListPage.vue'),
      },
      {
        path: 'items',
        name: 'items',
        component: () => import('@/views/items/ItemInventoryPage.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        meta: { parent: '/tabs/dashboard', title: 'Settings' },
        component: () => import('@/views/settings/SettingsPage.vue'),
      },
    ],
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
    meta: { parent: '/tabs/trips', title: 'New trip' },
    name: 'trip-wizard',
    component: () => import('@/views/trips/TripWizardPage.vue'),
  },
  {
    path: '/trips/:tripId',
    meta: { parent: '/tabs/trips' },
    name: 'trip-packing',
    component: () => import('@/views/trips/PackingListPage.vue'),
    props: true,
  },
  {
    path: '/import',
    meta: { parent: '/tabs/items', title: 'Import spreadsheet' },
    name: 'import-wizard',
    component: () => import('@/views/import/ImportPage.vue'),
  },
  {
    path: '/portable-import',
    meta: { parent: '/tabs/settings', title: 'Import file' },
    name: 'portable-import',
    component: () => import('@/views/import/PortableImportPage.vue'),
  },
  {
    path: '/series/:seriesId',
    meta: { parent: '/tabs/trips', title: 'Series' },
    name: 'series-profile',
    component: () => import('@/views/series/SeriesPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/clone',
    meta: { parent: '/trips/:tripId', title: 'Clone trip' },
    name: 'trip-clone',
    component: () => import('@/views/trips/ClonePage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/review',
    meta: { parent: '/trips/:tripId', title: 'Review' },
    name: 'trip-review',
    component: () => import('@/views/trips/ReviewPage.vue'),
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
    meta: { parent: '/trips/:tripId', title: 'Luggage' },
    name: 'trip-containers',
    component: () => import('@/views/trips/ContainerPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/conflicts',
    meta: { parent: '/trips/:tripId', title: 'Conflict log' },
    name: 'trip-conflicts',
    component: () => import('@/views/trips/ConflictLogPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/members',
    meta: { parent: '/trips/:tripId', title: 'Members' },
    name: 'trip-members',
    component: () => import('@/views/trips/TripMembersPage.vue'),
    props: true,
  },
  {
    path: '/admin',
    meta: { parent: '/tabs/settings', title: 'User administration' },
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
    path: '/trips/:tripId/items/:itemId',
    meta: { parent: '/trips/:tripId' },
    name: 'item-detail',
    component: () => import('@/views/trips/ItemDetailPage.vue'),
    props: true,
  },
  {
    path: '/templates/:templateId',
    meta: { parent: '/tabs/templates', title: 'Template' },
    name: 'template-editor',
    component: () => import('@/views/templates/TemplateEditorPage.vue'),
    props: true,
  },
  {
    path: '/items/:itemId',
    meta: { parent: '/tabs/items', title: 'Item' },
    name: 'item-editor',
    component: () => import('@/views/items/ItemEditorPage.vue'),
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
