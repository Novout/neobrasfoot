<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { formatMoney } from '../utils/random'
import { formatDate } from '../data/calendar'
import ConfidenceMeters from './ConfidenceMeters.vue'
import TeamBadge from './TeamBadge.vue'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

/** Volta ao menu principal sem apagar nada: a carreira continua salva (e aparece em "Continuar carreira"). */
function goToMenu() {
  match.stop()
  router.push({ name: 'home' })
}
</script>

<template>
  <header v-if="game.managedTeam" class="app-header">
    <div class="app-header__team">
      <TeamBadge :team="game.managedTeam" />
      <div>
        <strong>{{ game.managedTeam.name }}</strong>
        <small>
          {{ game.managerName }} · Temporada {{ game.currentYear }} · Próximo:
          <span :class="{ 'cup-next': game.nextEvent === 'cup' || game.nextEvent === 'libertadores' || game.nextEvent === 'worldcup' }">{{ game.nextEventLabel }}</span>
          <template v-if="game.nextEventDate"> · {{ formatDate(game.nextEventDate) }}</template>
        </small>
      </div>
    </div>

    <nav class="app-header__nav">
      <RouterLink :to="{ name: 'dashboard' }">Dashboard</RouterLink>
      <RouterLink :to="{ name: 'clubs' }">Clubes</RouterLink>
      <RouterLink :to="{ name: 'trophies' }">Troféus</RouterLink>
      <RouterLink :to="{ name: 'market' }">
        Mercado
        <span v-if="game.transferOffers.length" class="nav-badge" :title="`${game.transferOffers.length} proposta(s) recebida(s)`">
          {{ game.transferOffers.length }}
        </span>
      </RouterLink>
      <RouterLink :to="{ name: 'youth' }">
        Base
        <span
          v-if="game.academy?.players.length"
          class="nav-badge nav-badge--youth"
          :title="`${game.academy.players.length} jovem(ns) esperando uma chance`"
        >
          {{ game.academy.players.length }}
        </span>
      </RouterLink>
      <RouterLink :to="{ name: 'stadium' }">
        Estádio
        <span v-if="game.stadium?.construction" class="nav-badge nav-badge--build" title="Obra em andamento">🚧</span>
      </RouterLink>
      <RouterLink :to="{ name: 'calendar' }">Calendário</RouterLink>
      <RouterLink :to="{ name: 'cup' }">
        Copa
        <span v-if="game.nextEvent === 'cup'" class="nav-badge nav-badge--build" title="Próximo jogo é da Copa">🏆</span>
      </RouterLink>
      <RouterLink :to="{ name: 'libertadores' }">
        Libertadores
        <span v-if="game.nextEvent === 'libertadores'" class="nav-badge nav-badge--build" title="Próximo jogo é da Libertadores">🌎</span>
      </RouterLink>
      <RouterLink :to="{ name: 'world-cup' }">
        Copa do Mundo
        <span v-if="game.nextEvent === 'worldcup' && game.coachingNational" class="nav-badge nav-badge--build" title="Próximo jogo é da sua seleção">🌍</span>
        <span v-else-if="game.nationalOffers.length" class="nav-badge" :title="`${game.nationalOffers.length} convite(s) de seleção`">
          {{ game.nationalOffers.length }}
        </span>
      </RouterLink>
      <RouterLink :to="{ name: 'pre-match' }">Pré-jogo</RouterLink>
      <RouterLink v-if="match.isReady" :to="{ name: 'matches' }">Partidas</RouterLink>
    </nav>

    <div class="app-header__meta">
      <ConfidenceMeters v-if="!game.dismissal" :confidence="game.confidence" compact />
      <span class="money">{{ formatMoney(game.budget) }}</span>
      <button class="btn btn--ghost" title="Volta ao menu principal; a carreira continua salva" @click="goToMenu">Menu</button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.app-header__team {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.app-header__team small {
  display: block;
  color: var(--muted);
}
/* As abas quebram linha quando não cabem: nenhuma fica escondida. */
.app-header__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.app-header__nav a {
  white-space: nowrap;
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
}
.app-header__nav a.router-link-active {
  background: var(--accent-soft);
  color: var(--accent);
}
.nav-badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.2rem;
  height: 1.2rem;
  margin-left: 0.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--warn);
  color: #1a1400;
  font-size: 0.7rem;
  font-weight: 800;
}
.cup-next {
  color: var(--warn);
  font-weight: 600;
}
.nav-badge--youth {
  background: var(--surface-2);
  color: var(--muted);
}
.nav-badge--build {
  background: transparent;
}
.app-header__meta {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.money {
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
}

/* Telas estreitas: em cima o clube, o caixa e Menu; embaixo as abas (em quantas linhas precisarem). */
@media (max-width: 900px) {
  .app-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'team meta'
      'nav nav';
    gap: 0.4rem 0.75rem;
    padding: 0.5rem 0.75rem 0;
  }
  .app-header__team {
    grid-area: team;
    min-width: 0;
    gap: 0.5rem;
  }
  .app-header__team > div {
    min-width: 0;
  }
  .app-header__team strong,
  .app-header__team small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-header__team small {
    font-size: 0.72rem;
  }
  .app-header__meta {
    grid-area: meta;
    gap: 0.5rem;
  }
  .app-header__meta .btn {
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
  }
  .money {
    font-size: 0.85rem;
  }
  .app-header__nav {
    grid-area: nav;
    gap: 0.15rem;
    padding-bottom: 0.45rem;
  }
  .app-header__nav a {
    padding: 0.3rem 0.6rem;
    font-size: 0.85rem;
  }
}
/* Celular: os medidores de confiança ficam no Dashboard, para sobrar espaço ao nome do clube. */
@media (max-width: 520px) {
  .app-header__meta :deep(.meters) {
    display: none;
  }
  .app-header__nav a {
    padding: 0.25rem 0.45rem;
    font-size: 0.8rem;
  }
}
</style>
