<script setup lang="ts">
import PosTag from '../components/PosTag.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerStatus from '../components/PlayerStatus.vue'
import StarMark from '../components/StarMark.vue'
import SkillBadges from '../components/SkillBadges.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS } from '../data/divisions'
import { durationLabel, LOAN_DEVELOPMENT_AGE, LOAN_DURATIONS } from '../data/loans'
import { POSITION_ORDER } from '../data/tactics'
import { askingPriceOf, marketValue, MAX_SQUAD_SIZE, useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { MAX_ATTEMPTS_PER_ROUND, useTransferStore } from '../stores/transfers'
import type { DivisionId, NegotiationResult, Position } from '../types/game'
import { formatMoney } from '../utils/random'

type Tab = 'comprar' | 'vender' | 'emprestimos' | 'historico'
type SortKey = 'overall' | 'valueAsc' | 'valueDesc' | 'age'

const game = useGameStore()
const match = useMatchStore()
const transfers = useTransferStore()
const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 40

const tab = computed<Tab>({
  get: () => (['comprar', 'vender', 'emprestimos', 'historico'].includes(route.query.aba as string) ? (route.query.aba as Tab) : 'comprar'),
  set: (value) => router.replace({ query: { aba: value } }),
})
const marketClosed = computed(() => match.isReady)
const squadSize = computed(() => game.managedTeam?.players.length ?? 0)

// --- Comprar ---

const positionFilter = ref<Position | ''>('')
const divisionFilter = ref<DivisionId | ''>('')
const teamFilter = ref('')
const nameFilter = ref('')

/** Clubes da IA agrupados por divisão, para o select de clubes. */
const teamGroups = computed(() =>
  DIVISIONS.filter((d) => !divisionFilter.value || d === divisionFilter.value).map((d) => ({
    division: d,
    teams: game.teams.filter((t) => t.division === d && t.id !== game.managedTeamId),
  })),
)

watch(divisionFilter, (division) => {
  if (division && game.getTeam(teamFilter.value)?.division !== division) teamFilter.value = ''
})
const affordableOnly = ref(false)
const starsOnly = ref(false)
/** Esconde jogadores de clubes de séries acima, com quem seu clube não pode negociar. */
const negotiableOnly = ref(true)
const sortKey = ref<SortKey>('overall')
const visibleCount = ref(PAGE_SIZE)

const filteredPlayers = computed(() => {
  const name = nameFilter.value.trim().toLowerCase()
  const list = transfers.marketPlayers.filter(
    ({ player, team, value, locked }) =>
      (!positionFilter.value || player.position === positionFilter.value) &&
      (!divisionFilter.value || team.division === divisionFilter.value) &&
      (!teamFilter.value || team.id === teamFilter.value) &&
      (!name || player.name.toLowerCase().includes(name)) &&
      (!affordableOnly.value || value <= game.budget) &&
      (!starsOnly.value || !!player.star) &&
      (!negotiableOnly.value || !locked),
  )
  const sorters: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
    overall: (a, b) => b.player.overall - a.player.overall,
    valueAsc: (a, b) => a.value - b.value,
    valueDesc: (a, b) => b.value - a.value,
    age: (a, b) => a.player.age - b.player.age,
  }
  return list.sort(sorters[sortKey.value])
})

watch([positionFilter, divisionFilter, teamFilter, nameFilter, affordableOnly, starsOnly, negotiableOnly, sortKey], () => (visibleCount.value = PAGE_SIZE))

const selectedId = ref<string | null>(null)
const offerAmount = ref(0)
const negotiation = ref<NegotiationResult | null>(null)

const selected = computed(() => transfers.marketPlayers.find((m) => m.player.id === selectedId.value) ?? null)

function openNegotiation(playerId: string) {
  selectedId.value = playerId
  negotiation.value = null
  const entry = transfers.marketPlayers.find((m) => m.player.id === playerId)
  offerAmount.value = entry?.value ?? 0
}

function adjustOffer(factor: number) {
  if (selected.value) offerAmount.value = Math.round((selected.value.value * factor) / 1000) * 1000
}

function sendOffer(amount = offerAmount.value) {
  if (!selected.value || marketClosed.value) return
  const result = transfers.makeOffer(selected.value.player.id, selected.value.team.id, amount)
  negotiation.value = result
  if (result.status === 'accepted') selectedId.value = null
}

// --- Vender ---

// --- Empréstimos ---

const loanRounds = ref<number>(0)
const loanMessage = ref<string | null>(null)

const borrowBlocked = computed(() =>
  selected.value ? transfers.borrowBlocker(selected.value.player.id, selected.value.team.id, loanRounds.value) : null,
)

function borrow() {
  if (!selected.value || marketClosed.value) return
  const result = transfers.borrowPlayer(selected.value.player.id, selected.value.team.id, loanRounds.value)
  negotiation.value = result
  if (result.status === 'accepted') selectedId.value = null
}

/** Duração escolhida por jogador na lista de "emprestar" (padrão: até o fim da temporada). */
const lendRounds = ref<Record<string, number>>({})

function lend(playerId: string, playerName: string) {
  if (marketClosed.value) return
  const rounds = lendRounds.value[playerId] ?? 0
  const player = game.managedTeam?.players.find((p) => p.id === playerId)
  if (!player) return
  const total = transfers.resolveLoanRounds(rounds)
  if (!confirm(`Emprestar ${playerName} por ${durationLabel(total)}? Você recebe ${formatMoney(transfers.lendFee(player, rounds))}.`)) return
  loanMessage.value = transfers.lendPlayer(playerId, rounds) ?? `${playerName} foi emprestado por ${durationLabel(total)}.`
}

function returnEarly(playerId: string, playerName: string) {
  if (!confirm(`Devolver ${playerName} antes do prazo? A taxa já paga não volta.`)) return
  transfers.returnEarly(playerId)
  loanMessage.value = `${playerName} foi devolvido.`
}

/** Seus jogadores que podem ser emprestados (não estrelas emprestadas a você). */
const lendable = computed(() => mySquad.value.filter((p) => !p.loan))

const sellMessage = ref<string | null>(null)

const receivedOffers = computed(() =>
  game.transferOffers
    .map((offer) => ({
      offer,
      player: game.managedTeam?.players.find((p) => p.id === offer.playerId),
      buyer: game.getTeam(offer.fromTeamId),
    }))
    .filter((o) => o.player && o.buyer)
    .sort((a, b) => b.offer.amount - a.offer.amount),
)

const mySquad = computed(() =>
  [...(game.managedTeam?.players ?? [])].sort(
    (a, b) =>
      Number(b.forSale) - Number(a.forSale) ||
      POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
      b.overall - a.overall,
  ),
)

const PRICE_PRESETS = [
  { label: '-10%', factor: 0.9 },
  { label: 'Valor', factor: 1 },
  { label: '+15%', factor: 1.15 },
  { label: '+30%', factor: 1.3 },
]

const listedPlayers = computed(() => mySquad.value.filter((p) => p.forSale))

function accept(offerId: string, playerName: string, amount: number) {
  if (marketClosed.value || !confirm(`Vender ${playerName} por ${formatMoney(amount)}?`)) return
  sellMessage.value = transfers.acceptOffer(offerId) ?? `${playerName} vendido por ${formatMoney(amount)}.`
}

function quickSell(playerId: string, playerName: string) {
  const player = game.managedTeam?.players.find((p) => p.id === playerId)
  if (!player || marketClosed.value) return
  const price = transfers.quickSalePrice(player)
  if (!confirm(`Venda rápida de ${playerName} por ${formatMoney(price)} (abaixo do valor de mercado)?`)) return
  sellMessage.value = transfers.quickSell(playerId) ?? `${playerName} vendido por ${formatMoney(price)}.`
}
</script>

<template>
  <div class="market">
    <header class="market__header">
      <h1>Mercado de transferências</h1>
      <div class="market__summary">
        <span>Caixa: <strong class="money">{{ formatMoney(game.budget) }}</strong></span>
        <span>Elenco: <strong>{{ squadSize }}/{{ MAX_SQUAD_SIZE }}</strong></span>
      </div>
    </header>

    <p v-if="marketClosed" class="card banner">
      ⏸ Mercado fechado: há uma rodada em andamento.
      <RouterLink :to="{ name: 'matches' }">Voltar às partidas</RouterLink>
    </p>

    <nav class="tabs">
      <button class="btn btn--sm" :class="{ 'btn--ghost': tab !== 'comprar' }" @click="tab = 'comprar'">Comprar</button>
      <button class="btn btn--sm" :class="{ 'btn--ghost': tab !== 'vender' }" @click="tab = 'vender'">
        Vender
        <span v-if="receivedOffers.length" class="count">{{ receivedOffers.length }}</span>
      </button>
      <button class="btn btn--sm" :class="{ 'btn--ghost': tab !== 'emprestimos' }" @click="tab = 'emprestimos'">
        Empréstimos
        <span v-if="game.managedLoans.incoming.length + game.managedLoans.outgoing.length" class="count">
          {{ game.managedLoans.incoming.length + game.managedLoans.outgoing.length }}
        </span>
      </button>
      <button class="btn btn--sm" :class="{ 'btn--ghost': tab !== 'historico' }" @click="tab = 'historico'">Histórico</button>
    </nav>

    <!-- COMPRAR -->
    <div v-if="tab === 'comprar'" class="buy">
      <section class="card">
        <div class="filters">
          <input v-model="nameFilter" type="text" placeholder="Buscar jogador" />
          <select v-model="positionFilter">
            <option value="">Todas as posições</option>
            <option v-for="pos in POSITION_ORDER" :key="pos" :value="pos">{{ pos }}</option>
          </select>
          <select v-model="divisionFilter">
            <option value="">Todas as séries</option>
            <option v-for="d in DIVISIONS" :key="d" :value="d">{{ DIVISION_LABELS[d] }}</option>
          </select>
          <select v-model="teamFilter">
            <option value="">Todos os clubes</option>
            <optgroup v-for="g in teamGroups" :key="g.division" :label="DIVISION_LABELS[g.division]">
              <option v-for="t in g.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
            </optgroup>
          </select>
          <select v-model="sortKey">
            <option value="overall">Melhor OVR</option>
            <option value="valueAsc">Mais baratos</option>
            <option value="valueDesc">Mais caros</option>
            <option value="age">Mais jovens</option>
          </select>
          <label class="check"><input v-model="affordableOnly" type="checkbox" /> Cabe no caixa</label>
          <label class="check"><input v-model="starsOnly" type="checkbox" /> Só estrelas ★</label>
          <label class="check" title="Clubes de séries acima não negociam com o seu">
            <input v-model="negotiableOnly" type="checkbox" /> Só negociáveis
          </label>
        </div>

        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Nome</th>
              <th>Clube</th>
              <th class="num">Idade</th>
              <th class="num">OVR</th>
              <th class="num">Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="{ player, team, value, locked } in filteredPlayers.slice(0, visibleCount)"
              :key="player.id"
              :class="{ selected: player.id === selectedId, locked: !!locked }"
            >
              <td><PosTag :player="player" /></td>
              <td>
                {{ player.name }}<StarMark :star="player.star" /><SkillBadges :player="player" /><PlayerStatus :player="player" />
                <span v-if="player.starter" class="tag" title="Titular no clube atual">T</span>
              </td>
              <td>
                <span class="club" :title="`${team.name} · ${DIVISION_LABELS[team.division]}`">
                  <TeamBadge :team="team" :size="22" /> {{ team.shortName }}
                  <span class="division-tag">{{ team.division }}</span>
                  <span v-if="locked" class="lock" :title="locked">🔒</span>
                </span>
              </td>
              <td class="num">{{ player.age }}</td>
              <td class="num"><strong>{{ player.overall }}</strong></td>
              <td class="num" :class="{ expensive: value > game.budget }">{{ formatMoney(value) }}</td>
              <td>
                <button
                  class="btn btn--sm"
                  :disabled="marketClosed || !!locked"
                  :title="locked ?? ''"
                  @click="openNegotiation(player.id)"
                >
                  Negociar
                </button>
              </td>
            </tr>
            <tr v-if="!filteredPlayers.length">
              <td colspan="7" class="muted">Nenhum jogador encontrado com esses filtros.</td>
            </tr>
          </tbody>
        </table>
        <button
          v-if="filteredPlayers.length > visibleCount"
          class="btn btn--ghost more"
          @click="visibleCount += PAGE_SIZE"
        >
          Mostrar mais ({{ filteredPlayers.length - visibleCount }})
        </button>
      </section>

      <aside class="card negotiation">
        <template v-if="selected">
          <div class="negotiation__player">
            <TeamBadge :team="selected.team" :size="44" />
            <div>
              <strong>{{ selected.player.name }}<StarMark :star="selected.player.star" /><SkillBadges :player="selected.player" labels /><PlayerStatus :player="selected.player" /></strong>
              <small class="muted">
                {{ selected.player.position }} · {{ selected.player.age }} anos · OVR {{ selected.player.overall }}
              </small>
              <small class="muted">{{ selected.team.name }}{{ selected.player.starter ? ' · titular' : '' }}</small>
            </div>
          </div>
          <dl>
            <dt>Valor de mercado</dt>
            <dd>{{ formatMoney(selected.value) }}</dd>
            <dt>Salário</dt>
            <dd>{{ formatMoney(selected.player.salary) }} / rodada</dd>
            <dt>Propostas restantes</dt>
            <dd>{{ transfers.attemptsLeft(selected.player.id) }} de {{ MAX_ATTEMPTS_PER_ROUND }} nesta rodada</dd>
          </dl>

          <label class="offer">
            Sua proposta
            <input v-model.number="offerAmount" type="number" min="0" step="10000" />
          </label>
          <div class="presets">
            <button class="btn btn--sm btn--ghost" @click="adjustOffer(0.9)">-10%</button>
            <button class="btn btn--sm btn--ghost" @click="adjustOffer(1)">Valor</button>
            <button class="btn btn--sm btn--ghost" @click="adjustOffer(1.15)">+15%</button>
            <button class="btn btn--sm btn--ghost" @click="adjustOffer(1.35)">+35%</button>
          </div>
          <p class="muted small">= {{ formatMoney(offerAmount || 0) }}</p>
          <button
            class="btn send"
            :disabled="marketClosed || transfers.attemptsLeft(selected.player.id) <= 0 || offerAmount <= 0"
            @click="sendOffer()"
          >
            Enviar proposta
          </button>

          <div class="loan-box">
            <h4>Ou peça emprestado</h4>
            <div class="loan-row">
              <select v-model.number="loanRounds">
                <option v-for="d in LOAN_DURATIONS" :key="d" :value="d">
                  {{ d === 0 ? `Até o fim da temporada (${game.roundsLeftInSeason})` : durationLabel(d) }}
                </option>
              </select>
              <span class="small">Taxa {{ formatMoney(transfers.borrowFee(selected.player, loanRounds)) }}</span>
            </div>
            <p v-if="borrowBlocked" class="small warn">{{ borrowBlocked }}</p>
            <button class="btn btn--ghost btn--sm send" :disabled="marketClosed || !!borrowBlocked" @click="borrow">
              Pedir emprestado
            </button>
          </div>
        </template>
        <p v-else-if="!negotiation" class="muted">
          Escolha um jogador e clique em <strong>Negociar</strong>. Titulares custam mais caro, e cada clube aceita no
          máximo {{ MAX_ATTEMPTS_PER_ROUND }} propostas por jogador a cada rodada.
        </p>

        <div v-if="negotiation" class="result" :class="`result--${negotiation.status}`">
          <p>{{ negotiation.message }}</p>
          <button
            v-if="negotiation.status === 'counter' && selected"
            class="btn btn--sm"
            :disabled="negotiation.askingPrice > game.budget"
            @click="sendOffer(negotiation.askingPrice)"
          >
            Pagar {{ formatMoney(negotiation.askingPrice) }}
          </button>
        </div>
      </aside>
    </div>

    <!-- VENDER -->
    <div v-else-if="tab === 'vender'" class="sell">
      <p v-if="sellMessage" class="card result">{{ sellMessage }}</p>

      <section class="card">
        <h2>Propostas recebidas</h2>
        <p class="muted small">
          Propostas abaixo do preço pedido pelos jogadores à venda (e, às vezes, pelos seus destaques).
          Propostas não respondidas expiram na rodada seguinte.
        </p>
        <table v-if="receivedOffers.length">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>Clube interessado</th>
              <th class="num">Valor de mercado</th>
              <th class="num">Proposta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ offer, player, buyer } in receivedOffers" :key="offer.id">
              <td>
                <PosTag :player="player!" />
                {{ player!.name }}<StarMark :star="player!.star" /> <span class="muted">({{ player!.overall }})</span>
              </td>
              <td><span class="club"><TeamBadge :team="buyer!" :size="22" /> {{ buyer!.name }}</span></td>
              <td class="num muted">{{ formatMoney(marketValue(player!)) }}</td>
              <td class="num" :class="offer.amount >= marketValue(player!) ? 'good' : 'warn'">
                <strong>{{ formatMoney(offer.amount) }}</strong>
                <small v-if="player!.forSale" class="muted block">
                  {{ Math.round((offer.amount / askingPriceOf(player!)) * 100) }}% do pedido
                </small>
              </td>
              <td class="actions">
                <button class="btn btn--sm" :disabled="marketClosed" @click="accept(offer.id, player!.name, offer.amount)">
                  Aceitar
                </button>
                <button class="btn btn--sm btn--ghost" @click="transfers.rejectOffer(offer.id)">Recusar</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">Nenhuma proposta no momento. Liste jogadores abaixo e aguarde a próxima rodada.</p>
      </section>

      <section class="card">
        <h2>À venda ({{ listedPlayers.length }})</h2>
        <p class="muted small">
          Defina quanto quer por cada jogador. Ao fim de cada rodada, se algum clube valorizar o jogador acima do
          preço pedido, ele é vendido na hora por esse preço. Os que chegarem perto mandam propostas. Quanto mais
          caro, menos interessados.
        </p>
        <table v-if="listedPlayers.length">
          <thead>
            <tr>
              <th>Jogador</th>
              <th class="num">Valor de mercado</th>
              <th>Preço pedido</th>
              <th class="num">% do valor</th>
              <th>Interesse</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in listedPlayers" :key="p.id">
              <td>
                <PosTag :player="p" />
                {{ p.name }}<StarMark :star="p.star" /> <span class="muted">({{ p.overall }})</span>
              </td>
              <td class="num muted">{{ formatMoney(marketValue(p)) }}</td>
              <td>
                <div class="price-edit">
                  <input
                    type="number"
                    min="10000"
                    step="10000"
                    class="price-input"
                    :value="askingPriceOf(p)"
                    @change="game.setAskingPrice(p.id, Number(($event.target as HTMLInputElement).value))"
                  />
                  <button
                    v-for="preset in PRICE_PRESETS"
                    :key="preset.label"
                    class="btn btn--sm btn--ghost"
                    :title="`${Math.round(preset.factor * 100)}% do valor de mercado`"
                    @click="game.setAskingPrice(p.id, marketValue(p) * preset.factor)"
                  >
                    {{ preset.label }}
                  </button>
                </div>
              </td>
              <td class="num">{{ Math.round(transfers.saleInterest(p).ratio * 100) }}%</td>
              <td>
                <span :class="['interest', transfers.saleInterest(p).tone]">{{ transfers.saleInterest(p).label }}</span>
              </td>
              <td>
                <button class="btn btn--sm btn--ghost" @click="game.toggleForSale(p.id)">Retirar</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">Nenhum jogador à venda. Use "Colocar à venda" no elenco abaixo.</p>
      </section>

      <section class="card">
        <h2>Meu elenco</h2>
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Nome</th>
              <th class="num">Idade</th>
              <th class="num">OVR</th>
              <th class="num">Valor</th>
              <th class="num">Venda rápida</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in mySquad" :key="p.id" :class="{ listed: p.forSale }">
              <td><PosTag :player="p" /></td>
              <td>
                {{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" /><PlayerStatus :player="p" />
                <span v-if="p.starter" class="tag">T</span>
                <span v-if="p.forSale" class="tag tag--sale">À venda · {{ formatMoney(askingPriceOf(p)) }}</span>
              </td>
              <td class="num">{{ p.age }}</td>
              <td class="num"><strong>{{ p.overall }}</strong></td>
              <td class="num">{{ formatMoney(marketValue(p)) }}</td>
              <td class="num muted">{{ formatMoney(transfers.quickSalePrice(p)) }}</td>
              <td class="actions">
                <span v-if="p.loan" class="muted small">Emprestado de {{ game.getTeam(p.loan.ownerTeamId)?.shortName }}</span>
                <template v-else>
                  <button
                    class="btn btn--sm btn--ghost"
                    :title="p.forSale ? '' : 'Entra na lista pelo valor de mercado; ajuste o preço em À venda'"
                    @click="game.toggleForSale(p.id)"
                  >
                    {{ p.forSale ? 'Retirar da venda' : 'Colocar à venda' }}
                  </button>
                  <button class="btn btn--sm btn--danger" :disabled="marketClosed" @click="quickSell(p.id, p.name)">
                    Venda rápida
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <!-- EMPRÉSTIMOS -->
    <div v-else-if="tab === 'emprestimos'" class="sell">
      <p v-if="loanMessage" class="card result">{{ loanMessage }}</p>

      <section class="card">
        <h2>Emprestados ao seu clube ({{ game.managedLoans.incoming.length }})</h2>
        <p class="muted small">
          Para pegar alguém emprestado, use <strong>Negociar</strong> na aba Comprar. Clubes não emprestam titulares nem
          estrelas. Você paga a taxa e o salário enquanto o jogador estiver aqui.
        </p>
        <table v-if="game.managedLoans.incoming.length">
          <thead>
            <tr><th>Jogador</th><th>Dono</th><th class="num">Volta em</th><th class="num">Taxa paga</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="{ player, loan } in game.managedLoans.incoming" :key="player.id">
              <td>
                <PosTag :player="player" />
                {{ player.name }}<StarMark :star="player.star" /> <span class="muted">({{ player.overall }})</span>
              </td>
              <td><span class="club"><TeamBadge :team="game.getTeam(loan.ownerTeamId)!" :size="22" /> {{ game.getTeam(loan.ownerTeamId)?.name }}</span></td>
              <td class="num">{{ durationLabel(loan.roundsLeft) }}</td>
              <td class="num bad">-{{ formatMoney(loan.fee) }}</td>
              <td><button class="btn btn--sm btn--ghost" @click="returnEarly(player.id, player.name)">Devolver</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">Nenhum jogador emprestado ao seu clube.</p>
      </section>

      <section class="card">
        <h2>Seus jogadores emprestados ({{ game.managedLoans.outgoing.length }})</h2>
        <p class="muted small">
          Eles jogam por outro clube e voltam no fim do prazo ou da temporada. Jovens de até {{ LOAN_DEVELOPMENT_AGE }}
          anos podem evoluir com os minutos em campo.
        </p>
        <table v-if="game.managedLoans.outgoing.length">
          <thead>
            <tr><th>Jogador</th><th>Jogando no</th><th class="num">Volta em</th><th class="num">Taxa recebida</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="{ player, loan } in game.managedLoans.outgoing" :key="player.id">
              <td>
                <PosTag :player="player" />
                {{ player.name }}<StarMark :star="player.star" /> <span class="muted">({{ player.overall }}, {{ player.age }}a)</span>
              </td>
              <td><span class="club"><TeamBadge :team="game.getTeam(loan.toTeamId)!" :size="22" /> {{ game.getTeam(loan.toTeamId)?.name }}</span></td>
              <td class="num">{{ durationLabel(loan.roundsLeft) }}</td>
              <td class="num good">+{{ formatMoney(loan.fee) }}</td>
              <td><button class="btn btn--sm btn--ghost" @click="returnEarly(player.id, player.name)">Chamar de volta</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">Nenhum jogador seu emprestado.</p>
      </section>

      <section class="card">
        <h2>Emprestar um jogador</h2>
        <p class="muted small">Um clube mais modesto, que precisa de reforço, fica com ele e paga uma taxa menor.</p>
        <table>
          <thead>
            <tr><th>Pos</th><th>Nome</th><th class="num">Idade</th><th class="num">OVR</th><th>Duração</th><th class="num">Você recebe</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="p in lendable" :key="p.id">
              <td><PosTag :player="p" /></td>
              <td>
                {{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" /><PlayerStatus :player="p" />
                <span v-if="p.starter" class="tag">T</span>
                <span v-if="p.age <= LOAN_DEVELOPMENT_AGE" class="tag" title="Pode evoluir no empréstimo">jovem</span>
              </td>
              <td class="num">{{ p.age }}</td>
              <td class="num"><strong>{{ p.overall }}</strong></td>
              <td>
                <select :value="lendRounds[p.id] ?? 0" @change="lendRounds[p.id] = Number(($event.target as HTMLSelectElement).value)">
                  <option v-for="d in LOAN_DURATIONS" :key="d" :value="d">
                    {{ d === 0 ? 'Fim da temporada' : durationLabel(d) }}
                  </option>
                </select>
              </td>
              <td class="num">{{ formatMoney(transfers.lendFee(p, lendRounds[p.id] ?? 0)) }}</td>
              <td>
                <button
                  class="btn btn--sm btn--ghost"
                  :disabled="marketClosed || !!transfers.lendBlocker(p.id)"
                  :title="transfers.lendBlocker(p.id) ?? ''"
                  @click="lend(p.id, p.name)"
                >
                  Emprestar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <!-- HISTÓRICO -->
    <section v-else class="card">
      <h2>Histórico de transferências</h2>
      <table v-if="game.transferHistory.length">
        <thead>
          <tr>
            <th>Quando</th>
            <th>Jogador</th>
            <th>De</th>
            <th>Para</th>
            <th class="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(t, i) in game.transferHistory" :key="i">
            <td class="muted">T{{ t.season }} · R{{ t.round }}</td>
            <td><span class="pos" :class="`pos--${t.position}`">{{ t.position }}</span> {{ t.playerName }}</td>
            <td>{{ game.getTeam(t.fromTeamId)?.name }}</td>
            <td>{{ game.getTeam(t.toTeamId)?.name }}</td>
            <td class="num" :class="t.toTeamId === game.managedTeamId ? 'bad' : 'good'">
              {{ t.toTeamId === game.managedTeamId ? '-' : '+' }}{{ formatMoney(t.amount) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Nenhuma transferência ainda.</p>
    </section>
  </div>
</template>

<style scoped>
.market {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.market__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.market__header h1 {
  margin: 0;
}
.market__summary {
  display: flex;
  gap: 1.5rem;
}
.money {
  color: var(--accent);
}
.banner {
  border-color: var(--warn);
  color: var(--warn);
  margin: 0;
}
.banner a {
  color: inherit;
  margin-left: 0.5rem;
}
.tabs {
  display: flex;
  gap: 0.35rem;
}
.count {
  margin-left: 0.3rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--warn);
  color: #1a1400;
  font-size: 0.7rem;
}
.buy {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .buy {
    grid-template-columns: 1fr;
  }
}
.buy > section,
.sell > section {
  overflow-x: auto;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.filters input[type='text'] {
  flex: 1;
  min-width: 160px;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.club {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}
.division-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0 0.25rem;
  border-radius: 3px;
  background: var(--surface-2);
  color: var(--muted);
}
tr.locked td {
  opacity: 0.5;
}
.lock {
  cursor: help;
}
tr.selected td {
  background: var(--accent-soft);
}
tr.listed td {
  background: rgba(239, 68, 68, 0.06);
}
.expensive {
  color: var(--bad);
}
.good {
  color: var(--good);
}
.warn {
  color: var(--warn);
}
.bad {
  color: var(--bad);
}
.small {
  font-size: 0.85rem;
}
.more {
  margin-top: 0.75rem;
  width: 100%;
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
.loan-box {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border);
}
.loan-box h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}
.loan-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.price-edit {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}
.price-input {
  width: 8rem;
  text-align: right;
}
.interest {
  font-weight: 700;
  font-size: 0.8rem;
}
.accent {
  color: var(--accent);
}
.block {
  display: block;
  font-weight: 400;
}
.actions {
  white-space: nowrap;
}
.actions > * + * {
  margin-left: 0.25rem;
}
.negotiation {
  position: sticky;
  top: 5.5rem;
}
.negotiation__player {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.negotiation__player small {
  display: block;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.75rem;
  font-size: 0.9rem;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  text-align: right;
}
.offer {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.presets {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.5rem;
}
.send {
  width: 100%;
}
.result {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.result p {
  margin: 0 0 0.5rem;
}
.result--accepted {
  border-color: var(--good);
  color: var(--good);
}
.result--counter {
  border-color: var(--warn);
  color: var(--warn);
}
.result--rejected {
  border-color: var(--bad);
  color: var(--bad);
}
.sell {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.sell > .result {
  margin: 0;
}
</style>
