<script setup lang="ts">
import { computed } from 'vue'
import {
  bestTicketPrice, buildRounds, estimateGate, homeAdvantageBonus, idealTicketPrice, MAX_TICKET_PRICE, MAX_UPGRADE_LEVEL,
  MIN_TICKET_PRICE, spendPerFan, STADIUM_UPGRADES, stadiumCapacity, stadiumUpkeep, UPGRADE_KEYS, upgradeCost, upgradeGateGain,
} from '../data/stadium'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import type { StadiumUpgradeKey } from '../types/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()
const match = useMatchStore()

const stadium = computed(() => game.stadium)
const estimate = computed(() => game.gateEstimate)
const occupancy = computed(() => (estimate.value ? estimate.value.attendance / estimate.value.capacity : 0))
const suggestedPrice = computed(() => (stadium.value ? bestTicketPrice(stadium.value, game.gateContext) : 0))
const suggestedTotal = computed(() =>
  stadium.value ? estimateGate(stadium.value, game.gateContext, suggestedPrice.value).total : 0,
)
const nextHomeGame = computed(() => {
  const idx = game.fixtures.findIndex(
    (round, i) => i >= game.round && round.some((f) => f.homeId === game.managedTeamId),
  )
  if (idx < 0) return null
  const fixture = game.fixtures[idx]!.find((f) => f.homeId === game.managedTeamId)!
  return { round: idx + 1, opponent: game.getTeam(fixture.awayId) }
})

const upgrades = computed(() => {
  const st = stadium.value
  if (!st) return []
  return UPGRADE_KEYS.map((key) => {
    const level = st.levels[key]
    const maxed = level >= MAX_UPGRADE_LEVEL
    return {
      key,
      config: STADIUM_UPGRADES[key],
      level,
      maxed,
      cost: maxed ? 0 : upgradeCost(key, level),
      rounds: buildRounds(level),
      gain: maxed || key === 'pitch' ? 0 : upgradeGateGain(st, key, game.gateContext),
      blocker: game.upgradeBlocker(key),
      building: st.construction?.key === key,
    }
  })
})

function onPriceInput(event: Event) {
  game.setTicketPrice(Number((event.target as HTMLInputElement).value))
}

function build(key: StadiumUpgradeKey, label: string, cost: number) {
  if (confirm(`Iniciar obra de ${label} por ${formatMoney(cost)}?`)) game.startStadiumUpgrade(key)
}
</script>

<template>
  <div v-if="stadium && estimate && game.managedTeam" class="stadium">
    <section class="card hero" :style="{ '--team-color': game.managedTeam.primaryColor }">
      <div>
        <h1>{{ stadium.name }}</h1>
        <p class="muted">
          {{ stadiumCapacity(stadium).toLocaleString('pt-BR') }} lugares ·
          vantagem em casa +{{ Math.round((0.1 + homeAdvantageBonus(stadium)) * 100) }}% ·
          manutenção {{ formatMoney(stadiumUpkeep(stadium)) }}/rodada
        </p>
      </div>
      <div v-if="nextHomeGame" class="hero__next">
        <small class="muted">Próximo jogo em casa</small>
        <strong>Rodada {{ nextHomeGame.round }} · {{ nextHomeGame.opponent?.name }}</strong>
      </div>
    </section>

    <div class="grid">
      <section class="card tickets">
        <h2>Bilheteria</h2>
        <label class="price">
          <span>Preço do ingresso</span>
          <strong>{{ formatMoney(stadium.ticketPrice) }}</strong>
        </label>
        <input
          type="range"
          :min="MIN_TICKET_PRICE"
          :max="Math.min(MAX_TICKET_PRICE, 120)"
          :value="stadium.ticketPrice"
          @input="onPriceInput"
        />
        <p class="muted small">
          Preço justo para o torcedor: ~{{ formatMoney(idealTicketPrice(stadium)) }}. Mais caro afasta o público.
        </p>
        <button
          class="btn btn--ghost btn--sm"
          :disabled="stadium.ticketPrice === suggestedPrice"
          @click="game.setTicketPrice(suggestedPrice)"
        >
          Usar preço que maximiza a renda ({{ formatMoney(suggestedPrice) }} → {{ formatMoney(suggestedTotal) }})
        </button>

        <div class="occupancy">
          <div class="occupancy__bar">
            <div :style="{ width: `${occupancy * 100}%` }" :class="{ full: occupancy >= 0.99 }" />
          </div>
          <span>
            {{ estimate.attendance.toLocaleString('pt-BR') }} / {{ estimate.capacity.toLocaleString('pt-BR') }}
            ({{ Math.round(occupancy * 100) }}%)
          </span>
        </div>
        <p v-if="estimate.demand > estimate.capacity" class="small warn">
          Procura de {{ estimate.demand.toLocaleString('pt-BR') }} torcedores: o estádio vai lotar e
          {{ (estimate.demand - estimate.capacity).toLocaleString('pt-BR') }} ficarão de fora.
        </p>

        <dl>
          <dt>Ingressos</dt>
          <dd>{{ formatMoney(estimate.ticketRevenue) }}</dd>
          <dt>Consumo ({{ formatMoney(spendPerFan(stadium)) }}/torcedor)</dt>
          <dd>{{ formatMoney(estimate.spendRevenue) }}</dd>
          <dt class="total">Renda estimada por jogo em casa</dt>
          <dd class="total">{{ formatMoney(estimate.total) }}</dd>
        </dl>
        <p class="muted small">
          O público também cresce quando o time sobe na tabela. Fora de casa, o clube recebe uma cota fixa.
        </p>
      </section>

      <section class="card">
        <h2>Melhorias</h2>
        <div v-if="stadium.construction" class="construction">
          🚧 Em obras: <strong>{{ STADIUM_UPGRADES[stadium.construction.key].label }}</strong> —
          {{ stadium.construction.roundsLeft }} rodada(s) restante(s)
          <div class="occupancy__bar">
            <div
              :style="{
                width: `${((stadium.construction.totalRounds - stadium.construction.roundsLeft) / stadium.construction.totalRounds) * 100}%`,
              }"
            />
          </div>
        </div>

        <div class="upgrades">
          <article v-for="u in upgrades" :key="u.key" class="upgrade" :class="{ building: u.building }">
            <header>
              <span class="icon">{{ u.config.icon }}</span>
              <div>
                <strong>{{ u.config.label }}</strong>
                <div class="pips" :title="`Nível ${u.level} de ${MAX_UPGRADE_LEVEL}`">
                  <span v-for="i in MAX_UPGRADE_LEVEL" :key="i" :class="{ on: i <= u.level, next: u.building && i === u.level + 1 }" />
                </div>
              </div>
            </header>
            <p class="muted small">{{ u.config.description }}</p>
            <p class="small">
              Atual: {{ u.level ? u.config.effect(u.level) : 'sem melhorias' }}
              <template v-if="!u.maxed"><br />Próximo: <strong>{{ u.config.effect(u.level + 1) }}</strong></template>
            </p>
            <p v-if="u.gain > 0" class="small good">≈ +{{ formatMoney(u.gain) }} por jogo em casa</p>
            <footer>
              <template v-if="u.maxed"><span class="good small">Nível máximo</span></template>
              <template v-else>
                <span class="small">{{ formatMoney(u.cost) }} · {{ u.rounds }} rodada(s)</span>
                <button
                  class="btn btn--sm"
                  :disabled="!!u.blocker || match.isReady"
                  :title="u.blocker ?? (match.isReady ? 'Rodada em andamento' : '')"
                  @click="build(u.key, u.config.label, u.cost)"
                >
                  {{ u.building ? 'Em obras' : 'Construir' }}
                </button>
              </template>
            </footer>
          </article>
        </div>
      </section>
    </div>

    <section class="card">
      <h2>Últimos jogos em casa</h2>
      <table v-if="stadium.history.length">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Adversário</th>
            <th class="num">Público</th>
            <th class="num">Ocupação</th>
            <th class="num">Renda</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(g, i) in stadium.history" :key="i">
            <td class="muted">T{{ g.season }} · {{ g.competition === 'cup' ? 'Copa' : g.competition === 'libertadores' ? 'Libertadores' : `R${g.round}` }}</td>
            <td>{{ game.getTeam(g.opponentId)?.name }}</td>
            <td class="num">{{ g.attendance.toLocaleString('pt-BR') }}</td>
            <td class="num">{{ Math.round((g.attendance / g.capacity) * 100) }}%</td>
            <td class="num good">{{ formatMoney(g.revenue) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Nenhum jogo em casa ainda nesta carreira.</p>
    </section>
  </div>
</template>

<style scoped>
.stadium {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  border-left: 6px solid var(--team-color);
}
.hero h1 {
  margin: 0 0 0.25rem;
}
.hero p {
  margin: 0;
}
.hero__next {
  display: flex;
  flex-direction: column;
  text-align: right;
}
.grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.price {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.price strong {
  font-size: 1.4rem;
  color: var(--accent);
}
input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
  margin: 0.5rem 0;
}
.small {
  font-size: 0.85rem;
}
.good {
  color: var(--good);
}
.warn {
  color: var(--warn);
}
.occupancy {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1rem 0 0.25rem;
  font-size: 0.85rem;
  white-space: nowrap;
}
.occupancy__bar {
  flex: 1;
  height: 10px;
  background: var(--surface-2);
  border-radius: 5px;
  overflow: hidden;
}
.occupancy__bar div {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.occupancy__bar div.full {
  background: var(--warn);
}
dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.35rem 1rem;
  margin: 1rem 0 0.5rem;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  text-align: right;
}
.total {
  padding-top: 0.4rem;
  border-top: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
}
dd.total {
  color: var(--accent);
}
.construction {
  padding: 0.75rem;
  margin-bottom: 1rem;
  border: 1px dashed var(--warn);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.upgrades {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  gap: 0.75rem;
}
.upgrade {
  display: flex;
  flex-direction: column;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}
.upgrade.building {
  border-color: var(--warn);
}
.upgrade header {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}
.upgrade p {
  margin: 0.5rem 0 0;
}
.icon {
  font-size: 1.6rem;
}
.pips {
  display: flex;
  gap: 3px;
  margin-top: 0.25rem;
}
.pips span {
  width: 14px;
  height: 6px;
  border-radius: 2px;
  background: var(--border);
}
.pips span.on {
  background: var(--accent);
}
.pips span.next {
  background: var(--warn);
}
.upgrade footer {
  margin-top: auto;
  padding-top: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}
</style>
