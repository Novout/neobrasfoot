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
      path: '/editor-times',
      name: 'league-editor',
      component: () => import('../views/LeagueEditorView.vue'),
      meta: { title: 'Editor de times' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresCareer: true, title: 'Dashboard' },
    },
    {
      path: '/clubes',
      name: 'clubs',
      component: () => import('../views/ClubsView.vue'),
      meta: { requiresCareer: true, title: 'Clubes' },
    },
    {
      path: '/trofeus',
      name: 'trophies',
      component: () => import('../views/TrophiesView.vue'),
      meta: { requiresCareer: true, title: 'Troféus' },
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
      path: '/selecao',
      name: 'best-xi',
      component: () => import('../views/BestXIView.vue'),
      meta: { requiresCareer: true, title: 'Seleção da temporada' },
    },
    {
      path: '/calendario',
      name: 'calendar',
      component: () => import('../views/CalendarView.vue'),
      meta: { requiresCareer: true, title: 'Calendário' },
    },
    {
      path: '/base',
      name: 'youth',
      component: () => import('../views/YouthView.vue'),
      meta: { requiresCareer: true, title: 'Base' },
    },
    {
      path: '/copa',
      name: 'cup',
      component: () => import('../views/CupView.vue'),
      meta: { requiresCareer: true, title: 'Copa do Brasil' },
    },
    {
      path: '/champions',
      name: 'champions',
      component: () => import('../views/ChampionsView.vue'),
      meta: { requiresCareer: true, title: 'Liga dos Campeões' },
    },
    {
      path: '/copa-do-mundo',
      name: 'world-cup',
      component: () => import('../views/WorldCupView.vue'),
      meta: { requiresCareer: true, title: 'Copa do Mundo' },
    },
    {
      path: '/libertadores',
      name: 'libertadores',
      component: () => import('../views/LibertadoresView.vue'),
      meta: { requiresCareer: true, title: 'Libertadores' },
    },
    {
      path: '/janela-tecnicos',
      name: 'manager-market',
      component: () => import('../views/ManagerMarketView.vue'),
      meta: { requiresCareer: true, title: 'Janela de técnicos' },
      // Só abre com a temporada encerrada.
      beforeEnter: () => {
        if (!useGameStore().isSeasonOver) return { name: 'dashboard' }
      },
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
    {
      path: '/demitido',
      name: 'dismissed',
      component: () => import('../views/DismissedView.vue'),
      meta: { requiresCareer: true, title: 'Demitido' },
      beforeEnter: () => {
        if (!useGameStore().dismissal) return { name: 'dashboard' }
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const game = useGameStore()
  if (to.meta.requiresCareer && !game.hasCareer) return { name: 'home' }
  // Demitido: o jogo fica na tela de demissão até escolher um clube novo ou encerrar a carreira.
  if (game.dismissal && to.meta.requiresCareer && to.name !== 'dismissed') return { name: 'dismissed' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Neobrasfoot` : 'Neobrasfoot'
})

export default router
