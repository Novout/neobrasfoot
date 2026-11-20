<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatBar from '../components/StatBar.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { POSITION_ORDER } from '../data/tactics'
import { marketValue, useGameStore } from '../stores/game'
import { useTransferStore } from '../stores/transfers'
import type { Position } from '../types/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()
const transfers = useTransferStore()
const router = useRouter()

const positionFilter = ref<Position | 'TODOS'>('TODOS')

const squad = computed(() => {
  const players = game.managedTeam?.players ?? []
  return players
    .filter((p) => positionFilter.value === 'TODOS' || p.position === positionFilter.value)
    .sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall)
})

const isHome = computed(() => game.nextFixture?.homeId === game.managedTeamId)

function standingPoints(row: { wins: number; draws: number }) {
  return row.wins * 3 + row.draws
}
</script>

<template>
  <div v-if="game.managedTeam" class="dashboard">
    <section class="dashboard__main">
      <div class="card">
        <div class="squad-header">
          <h2>Elenco ({{ game.managedTeam.players.length }})</h2>
          <div class="filters">
            <button
              v-for="pos in ['TODOS', ...POSITION_ORDER] as const"
              :key="pos"
              class="btn btn--sm"
              :class="{ 'btn--ghost': positionFilter !== pos }"
              @click="positionFilter = pos"
            >
              {{ pos }}
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Nome</th>
              <th class="num">Idade</th>
              <th class="num">OVR</th>
              <th>Energia</th>
              <th>Moral</th>
              <th class="num">Salário</th>
              <th class="num">Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in squad" :key="p.id" :class="{ 'for-sale': p.forSale }">
              <td><span class="pos" :class="`pos--${p.position}`">{{ p.position }}</span></td>
              <td>
                {{ p.name }}
                <span v-if="p.starter" class="tag" title="Titular">T</span>
                <span v-if="p.forSale" class="tag tag--sale">À venda</span>
              </td>
              <td class="num">{{ p.age }}</td>
              <td class="num"><strong>{{ p.overall }}</strong></td>
              <td><StatBar :value="p.energy" /></td>
              <td><StatBar :value="p.morale" /></td>
              <td class="num">{{ formatMoney(p.salary) }}</td>
              <td class="num">{{ formatMoney(marketValue(p)) }}</td>
              <td class="actions">
                <button
                  class="btn btn--sm"
                  :disabled="game.trainedThisRound.includes(p.id) || p.energy < 20"
                  title="Chance de evoluir; gasta 15 de energia (1x por rodada)"
                  @click="game.trainPlayer(p.id)"
                >
                  Treinar
                </button>
                <button class="btn btn--sm btn--ghost" :disabled="p.energy >= 100" title="+25 energia" @click="game.restPlayer(p.id)">
                  Descansar
                </button>
                <button class="btn btn--sm btn--ghost" @click="game.toggleForSale(p.id)">
                  {{ p.forSale ? 'Retirar' : 'Listar' }}
                </button>
                <RouterLink
                  v-if="transfers.offersByPlayer[p.id]"
                  class="btn btn--sm offers-link"
                  :to="{ name: 'market', query: { aba: 'vender' } }"
                >
                  {{ transfers.offersByPlayer[p.id]!.length }} proposta(s)
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside class="dashboard__side">
      <div class="card next-match">
        <template v-if="game.isSeasonOver">
          <h3>Temporada encerrada</h3>
          <p>
            Campeão: <strong>{{ game.getTeam(game.sortedStandings[0]!.teamId)?.name }}</strong>
          </p>
          <button class="btn" @click="game.nextSeason()">Iniciar temporada {{ game.season + 1 }}</button>
        </template>
        <template v-else-if="game.nextOpponent">
          <h3>Próximo jogo · Rodada {{ game.round + 1 }}</h3>
          <div class="versus">
            <TeamBadge :team="isHome ? game.managedTeam : game.nextOpponent" :size="48" />
            <span class="muted">x</span>
            <TeamBadge :team="isHome ? game.nextOpponent : game.managedTeam" :size="48" />
          </div>
          <p class="muted">{{ isHome ? 'Em casa' : 'Fora de casa' }} contra <strong>{{ game.nextOpponent.name }}</strong></p>
          <button class="btn" @click="router.push({ name: 'pre-match' })">Ir para o pré-jogo</button>
        </template>
      </div>

      <div class="card">
        <h3>Finanças</h3>
        <p>Caixa: <strong>{{ formatMoney(game.budget) }}</strong></p>
        <p class="muted">Folha por rodada: {{ formatMoney(game.payroll) }}</p>
      </div>

      <div class="card">
        <h3>Classificação</h3>
        <table>
          <thead>
            <tr><th>#</th><th>Clube</th><th class="num">J</th><th class="num">SG</th><th class="num">P</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in game.sortedStandings"
              :key="row.teamId"
              :class="{ mine: row.teamId === game.managedTeamId }"
            >
              <td>{{ i + 1 }}</td>
              <td>{{ game.getTeam(row.teamId)?.name }}</td>
              <td class="num">{{ row.played }}</td>
              <td class="num">{{ row.goalsFor - row.goalsAgainst }}</td>
              <td class="num"><strong>{{ standingPoints(row) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Notícias</h3>
        <ul class="news">
          <li v-for="(item, i) in game.news" :key="i">{{ item }}</li>
          <li v-if="!game.news.length" class="muted">Nada por enquanto.</li>
        </ul>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .dashboard {
    grid-template-columns: 1fr;
  }
}
.dashboard__main {
  overflow-x: auto;
}
.dashboard__side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.squad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.filters {
  display: flex;
  gap: 0.25rem;
}
.actions {
  white-space: nowrap;
}
.actions > * + * {
  margin-left: 0.25rem;
}
.tag {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
}
.tag--sale {
  background: rgba(239, 68, 68, 0.15);
  color: var(--bad);
}
.offers-link {
  text-decoration: none;
  background: var(--warn);
}
tr.for-sale td {
  opacity: 0.75;
}
tr.mine td {
  color: var(--accent);
  font-weight: 700;
}
.versus {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 0.5rem 0;
}
.next-match {
  text-align: center;
}
.news {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 220px;
  overflow-y: auto;
}
</style>
