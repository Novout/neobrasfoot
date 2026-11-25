<script setup lang="ts">
import PosTag from '../components/PosTag.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatBar from '../components/StatBar.vue'
import ConfidenceMeters from '../components/ConfidenceMeters.vue'
import HeadlinesFeed from '../components/HeadlinesFeed.vue'
import PlayerStatus from '../components/PlayerStatus.vue'
import SaveControls from '../components/SaveControls.vue'
import StarMark from '../components/StarMark.vue'
import SkillBadges from '../components/SkillBadges.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS, isForeignDivision, LEAGUE_DIVISIONS, relegatesFrom, tableZone } from '../data/divisions'
import { stadiumUpkeep } from '../data/stadium'
import { POSITION_ORDER } from '../data/tactics'
import { askingPriceOf, canTrain, marketValue, trainingEnergyCost, useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { useTransferStore } from '../stores/transfers'
import type { DivisionId, Player, Position } from '../types/game'
import { defRoleOf } from '../data/defense'
import { formatMoney } from '../utils/random'
import { formatDate } from '../data/calendar'

const game = useGameStore()
const transfers = useTransferStore()
const match = useMatchStore()
const router = useRouter()

const positionFilter = ref<Position | 'TODOS'>('TODOS')

function defRoleRank(p: Player) {
  return defRoleOf(p) === 'ZAG' ? 1 : 0
}

const squad = computed(() => {
  const players = game.managedTeam?.players ?? []
  return players
    .filter((p) => positionFilter.value === 'TODOS' || p.position === positionFilter.value)
    .sort(
      (a, b) =>
        POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
        // Na defesa, todos os laterais primeiro e depois todos os zagueiros.
        defRoleRank(a) - defRoleRank(b) ||
        b.overall - a.overall,
    )
})

const isHome = computed(() => game.nextFixture?.homeId === game.managedTeamId)

// Divisão exibida na tabela; acompanha a do clube até o usuário escolher outra.
const viewedDivision = ref<DivisionId | null>(null)
const tableDivision = computed(() => viewedDivision.value ?? game.managedDivision)
const table = computed(() => game.divisionStandings(tableDivision.value))
const myPosition = computed(() => game.sortedStandings.findIndex((r) => r.teamId === game.managedTeamId) + 1)
/** Fase da Copa sem o clube gerenciado: só simula e acompanha. */
function watchCupRound() {
  match.setupRound()
  router.push({ name: 'matches' })
}

const myZone = computed(() => tableZone(game.managedDivision, myPosition.value, game.sortedStandings.length))

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
              <td><PosTag :player="p" /></td>
              <td>
                {{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" /><PlayerStatus :player="p" />
                <span v-if="p.starter" class="tag" title="Titular">T</span>
                <RouterLink v-if="p.forSale" class="tag tag--sale" :to="{ name: 'market', query: { aba: 'vender' } }" title="Ajustar o preço no Mercado">À venda · {{ formatMoney(askingPriceOf(p)) }}</RouterLink>
                <RouterLink
                  v-if="p.loan"
                  class="tag tag--loan"
                  :to="{ name: 'market', query: { aba: 'emprestimos' } }"
                  :title="`Emprestado pelo ${game.getTeam(p.loan.ownerTeamId)?.name}`"
                >
                  🔁 {{ p.loan.roundsLeft }} rod.
                </RouterLink>
                <!-- Fica junto do nome (sempre visível): na coluna de ações ele alargava a tabela e era cortado. -->
                <RouterLink
                  v-if="transfers.offersByPlayer[p.id]"
                  class="tag tag--offers"
                  :to="{ name: 'market', query: { aba: 'vender' } }"
                  title="Ver propostas no Mercado"
                >
                  💰 {{ transfers.offersByPlayer[p.id]!.length }} proposta(s)
                </RouterLink>
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
                  :disabled="game.trainedThisRound.includes(p.id) || !canTrain(p)"
                  :title="`Chance de evoluir; gasta ${trainingEnergyCost(p)} de energia (1x por rodada)`"
                  @click="game.trainPlayer(p.id)"
                >
                  Treinar
                </button>
                <button class="btn btn--sm btn--ghost" :disabled="p.energy >= 100" title="+25 energia" @click="game.restPlayer(p.id)">
                  Descansar
                </button>
                <button
                  v-if="!p.loan"
                  class="btn btn--sm btn--ghost"
                  :title="p.forSale ? 'Retirar da venda' : 'Colocar à venda pelo valor de mercado (ajuste o preço no Mercado)'"
                  @click="game.toggleForSale(p.id)"
                >
                  {{ p.forSale ? 'Retirar' : 'Vender' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside class="dashboard__side">
      <!-- Salvar (cópia) e carregar: só no modo de múltiplos saves. -->
      <SaveControls />

      <div class="card next-match">
        <template v-if="game.isSeasonOver">
          <h3>Temporada encerrada</h3>
          <p>
            Campeão da {{ DIVISION_LABELS[game.managedDivision] }}:
            <strong>{{ game.getTeam(game.sortedStandings[0]!.teamId)?.name }}</strong>
          </p>
          <p>
            Seu time terminou em <strong>{{ myPosition }}º</strong>
            <span v-if="myZone === 'champion'" class="good"> — campeão! 🏆</span>
            <span v-else-if="myZone === 'promotion'" class="good"> — acesso garantido! 🎉</span>
            <span v-else-if="myZone === 'relegation'" class="bad"> — rebaixado.</span>
          </p>
          <p v-if="game.cup?.championId">
            Campeão da Copa do Brasil: <strong>{{ game.getTeam(game.cup.championId)?.name }}</strong>
            <span v-if="game.cup.championId === game.managedTeamId" class="good"> 🏆</span>
          </p>
          <p v-if="game.libertadores?.championId">
            Campeão da Libertadores: <strong>{{ game.getTeam(game.libertadores.championId)?.name }}</strong>
            <span v-if="game.libertadores.championId === game.managedTeamId" class="good"> 🏆</span>
          </p>
          <RouterLink class="btn btn--ghost best-link" :to="{ name: 'best-xi' }">⭐ Ver a seleção da temporada</RouterLink>
          <RouterLink class="btn window-link" :to="{ name: 'manager-market' }">
            💼 Abrir janela de técnicos
            <span v-if="game.jobOffers.length" class="offers-count">{{ game.jobOffers.length }} propostas</span>
          </RouterLink>
        </template>
        <template v-else-if="game.nextEvent === 'cup' && !game.nextOpponent">
          <h3>{{ game.nextEventLabel }}</h3>
          <p class="muted">Seu time está fora da Copa, mas a fase precisa ser disputada para o calendário seguir.</p>
          <button class="btn" @click="watchCupRound">Acompanhar a rodada da Copa</button>
        </template>
        <template v-else-if="game.nextOpponent">
          <h3 :class="{ 'cup-title': game.nextEvent === 'cup', 'libertadores-title': game.nextEvent === 'libertadores' }">{{ game.nextEventLabel }}</h3>
          <p v-if="game.nextEventDate" class="muted match-date">
            📅 {{ formatDate(game.nextEventDate, true) }} ·
            <RouterLink :to="{ name: 'calendar' }">ver calendário</RouterLink>
          </p>
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
        <h3>Confiança no técnico</h3>
        <ConfidenceMeters :confidence="game.confidence" />
        <p class="muted small-note">Se qualquer um chegar a 0%, você é demitido.</p>
        <ul v-if="game.confidenceLog.length" class="confidence-log">
          <li v-for="(c, i) in game.confidenceLog.slice(0, 5)" :key="i">
            <span class="log-reason">{{ c.reason }}</span>
            <span v-if="c.board" :class="c.board > 0 ? 'good' : 'bad'" title="Diretoria">👔{{ c.board > 0 ? '+' : '' }}{{ c.board }}</span>
            <span v-if="c.club" :class="c.club > 0 ? 'good' : 'bad'" title="Clube">📣{{ c.club > 0 ? '+' : '' }}{{ c.club }}</span>
          </li>
        </ul>
      </div>

      <HeadlinesFeed :headlines="game.headlines" :my-team-id="game.managedTeamId" />

      <div class="card">
        <h3>Finanças</h3>
        <p>Caixa: <strong>{{ formatMoney(game.budget) }}</strong></p>
        <p class="muted">Folha por rodada: {{ formatMoney(game.payroll) }}</p>
        <template v-if="game.stadium && game.gateEstimate">
          <p class="muted">Manutenção do estádio: {{ formatMoney(stadiumUpkeep(game.stadium)) }}</p>
          <p>Renda por jogo em casa: <strong class="good">{{ formatMoney(game.gateEstimate.total) }}</strong></p>
          <RouterLink class="btn btn--ghost btn--sm" :to="{ name: 'stadium' }">
            {{ game.stadium.construction ? '🚧 Ver obras do estádio' : 'Gerenciar estádio' }}
          </RouterLink>
        </template>
      </div>

      <div class="card">
        <div class="table-header">
          <h3>Classificação</h3>
          <select :value="tableDivision" @change="viewedDivision = ($event.target as HTMLSelectElement).value as DivisionId">
            <option v-for="d in LEAGUE_DIVISIONS" :key="d" :value="d">{{ DIVISION_LABELS[d] }}</option>
          </select>
        </div>
        <table class="standings">
          <thead>
            <tr><th>#</th><th>Clube</th><th class="num">J</th><th class="num">SG</th><th class="num">P</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in table"
              :key="row.teamId"
              :class="[{ mine: row.teamId === game.managedTeamId }, tableZone(tableDivision, i + 1, table.length) ? `zone-${tableZone(tableDivision, i + 1, table.length)}` : '']"
            >
              <td>{{ i + 1 }}</td>
              <td>{{ game.getTeam(row.teamId)?.name }}</td>
              <td class="num">{{ row.played }}</td>
              <td class="num">{{ row.goalsFor - row.goalsAgainst }}</td>
              <td class="num"><strong>{{ standingPoints(row) }}</strong></td>
            </tr>
          </tbody>
        </table>
        <RouterLink class="partial-best" :to="{ name: 'best-xi' }">⭐ Seleção da temporada{{ game.isSeasonOver ? '' : ' (parcial)' }}</RouterLink>
        <p class="legend">
          <span v-if="tableDivision === DIVISIONS[0] || isForeignDivision(tableDivision)" class="zone-champion">Campeão</span>
          <span v-else class="zone-promotion">Acesso</span>
          <span v-if="relegatesFrom(tableDivision)" class="zone-relegation">Rebaixamento</span>
        </p>
      </div>

      <div class="card">
        <h3>Notícias do clube</h3>
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
/* Treinar, Descansar e Vender só aparecem com o mouse sobre a linha (o aviso de propostas fica sempre visível). */
.actions > button {
  opacity: 0;
  transition: opacity 0.12s;
}
tr:hover .actions > button,
.actions:focus-within > button {
  opacity: 1;
}
/* Telas de toque não têm hover: mantém os botões visíveis. */
@media (hover: none) {
  .actions > button {
    opacity: 1;
  }
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
.tag--loan {
  background: rgba(96, 165, 250, 0.15);
  color: #93c5fd;
}
a.tag {
  text-decoration: none;
}
.tag--sale {
  background: rgba(239, 68, 68, 0.15);
  color: var(--bad);
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.window-link {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
}
.offers-count {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.8;
}
.small-note {
  font-size: 0.75rem;
  margin: 0.5rem 0;
}
.confidence-log {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.confidence-log li {
  display: flex;
  gap: 0.35rem;
  align-items: baseline;
}
.log-reason {
  flex: 1;
  color: var(--muted);
}
.cup-title {
  color: var(--warn);
}
.libertadores-title {
  color: #fb923c;
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.table-header h3 {
  margin: 0;
}
.table-header select {
  padding: 0.25rem 0.4rem;
  font-size: 0.85rem;
}
.standings tr td:first-child {
  border-left: 3px solid transparent;
}
.standings tr.zone-champion td:first-child {
  border-left-color: var(--warn);
}
.standings tr.zone-promotion td:first-child {
  border-left-color: var(--good);
}
.standings tr.zone-relegation td:first-child {
  border-left-color: var(--bad);
}
.legend {
  display: flex;
  gap: 1rem;
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--muted);
}
.legend span::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 0.3rem;
  border-radius: 2px;
  vertical-align: -1px;
}
.legend .zone-champion::before {
  background: var(--warn);
}
.legend .zone-promotion::before {
  background: var(--good);
}
.legend .zone-relegation::before {
  background: var(--bad);
}
.tag--offers {
  white-space: nowrap;
  background: var(--warn);
  color: #1a1200;
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
.best-link {
  display: inline-block;
  margin-bottom: 0.5rem;
  text-decoration: none;
}
.partial-best {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--accent);
}
.match-date {
  margin: -0.4rem 0 0.25rem;
  font-size: 0.82rem;
}
.match-date a {
  color: var(--accent);
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
