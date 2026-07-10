import { createRouter, createWebHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import TabsLayout from '@/views/TabsLayout.vue'

const routes: RouteRecordRaw[] = [
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
    name: 'trip-wizard',
    component: () => import('@/views/trips/TripWizardPage.vue'),
  },
  {
    path: '/trips/:tripId',
    name: 'trip-packing',
    component: () => import('@/views/trips/PackingListPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/repack',
    name: 'trip-repack',
    component: () => import('@/views/trips/RepackPage.vue'),
    props: true,
  },
  {
    path: '/import',
    name: 'import-wizard',
    component: () => import('@/views/import/ImportPage.vue'),
  },
  {
    path: '/portable-import',
    name: 'portable-import',
    component: () => import('@/views/import/PortableImportPage.vue'),
  },
  {
    path: '/series/:seriesId',
    name: 'series-profile',
    component: () => import('@/views/series/SeriesPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/clone',
    name: 'trip-clone',
    component: () => import('@/views/trips/ClonePage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/review',
    name: 'trip-review',
    component: () => import('@/views/trips/ReviewPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/analytics',
    name: 'trip-analytics',
    component: () => import('@/views/trips/AnalyticsPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/containers',
    name: 'trip-containers',
    component: () => import('@/views/trips/ContainerPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/conflicts',
    name: 'trip-conflicts',
    component: () => import('@/views/trips/ConflictLogPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/members',
    name: 'trip-members',
    component: () => import('@/views/trips/TripMembersPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/shopping',
    name: 'trip-shopping',
    component: () => import('@/views/trips/ShoppingPage.vue'),
    props: true,
  },
  {
    path: '/trips/:tripId/items/:itemId',
    name: 'item-detail',
    component: () => import('@/views/trips/ItemDetailPage.vue'),
    props: true,
  },
  {
    path: '/templates/:templateId',
    name: 'template-editor',
    component: () => import('@/views/templates/TemplateEditorPage.vue'),
    props: true,
  },
  {
    path: '/items/:itemId',
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
