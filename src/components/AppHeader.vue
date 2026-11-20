<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { formatMoney } from '../utils/random'
import TeamBadge from './TeamBadge.vue'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

function quit() {
  if (!confirm('Abandonar a carreira atual?')) return
  match.reset()
  game.endCareer()
  router.push({ name: 'home' })
}
</script>

<template>
  <header v-if="game.managedTeam" class="app-header">
    <div class="app-header__team">
      <TeamBadge :team="game.managedTeam" />
      <div>
        <strong>{{ game.managedTeam.name }}</strong>
        <small>{{ game.managerName }} · Temporada {{ game.season }} · Rodada {{ Math.min(game.round + 1, game.totalRounds) }}/{{ game.totalRounds }}</small>
      </div>
    </div>

    <nav class="app-header__nav">
      <RouterLink :to="{ name: 'dashboard' }">Dashboard</RouterLink>
      <RouterLink :to="{ name: 'market' }">
        Mercado
        <span v-if="game.transferOffers.length" class="nav-badge" :title="`${game.transferOffers.length} proposta(s) recebida(s)`">
          {{ game.transferOffers.length }}
        </span>
      </RouterLink>
      <RouterLink :to="{ name: 'pre-match' }">Pré-jogo</RouterLink>
      <RouterLink v-if="match.isReady" :to="{ name: 'matches' }">Partidas</RouterLink>
    </nav>

    <div class="app-header__meta">
      <span class="money">{{ formatMoney(game.budget) }}</span>
      <button class="btn btn--ghost" @click="quit">Sair</button>
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
.app-header__nav {
  display: flex;
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
.app-header__meta {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.money {
  font-weight: 700;
  color: var(--accent);
}
</style>
