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
    ],
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
