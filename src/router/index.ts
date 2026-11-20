import { createRouter, createWebHistory } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import HomeView from '../views/HomeView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    requiresCareer?: boolean
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Escolha seu time' } },
    {
      path: '/criar-clube',
      name: 'team-builder',
      component: () => import('../views/TeamBuilderView.vue'),
      meta: { title: 'Criar clube' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresCareer: true, title: 'Dashboard' },
    },
    {
      path: '/mercado',
      name: 'market',
      component: () => import('../views/TransferMarketView.vue'),
      meta: { requiresCareer: true, title: 'Mercado' },
    },
    {
      path: '/estadio',
      name: 'stadium',
      component: () => import('../views/StadiumView.vue'),
      meta: { requiresCareer: true, title: 'Estádio' },
    },
    {
      path: '/pre-jogo',
      name: 'pre-match',
      component: () => import('../views/PreMatchView.vue'),
      meta: { requiresCareer: true, title: 'Pré-jogo' },
    },
    {
      path: '/partidas',
      name: 'matches',
      component: () => import('../views/MatchView.vue'),
      meta: { requiresCareer: true, title: 'Partidas' },
      beforeEnter: () => {
        if (!useMatchStore().isReady) return { name: 'pre-match' }
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresCareer && !useGameStore().hasCareer) return { name: 'home' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Neobrassfot` : 'Neobrassfot'
})

export default router
