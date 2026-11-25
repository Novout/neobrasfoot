<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TeamBadge from '../components/TeamBadge.vue'
import { ALL_DIVISIONS, DIVISION_LABELS, DIVISIONS, REPUTATION_SWING } from '../data/divisions'
import { createStadium, stadiumCapacity } from '../data/stadium'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import type { DivisionId, Team } from '../types/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

// Saves que já estavam no fim da temporada antes deste recurso ainda não têm propostas.
onMounted(() => game.ensureJobOffers())

const review = computed(() => game.seasonReview)

const rating = computed(() => {
  const score = review.value?.score ?? 0
  if (score >= 4) return { label: 'Excelente', tone: 'good' }
  if (score >= 2) return { label: 'Boa', tone: 'good' }
  if (score >= 0) return { label: 'Regular', tone: 'muted' }
  return { label: 'Ruim', tone: 'bad' }
})

interface ClubCard {
  team: Team
  nextDivision: DivisionId
  movement: 'up' | 'down' | null
  finalPosition: number
  squadAverage: number
  stars: number
  budget: number
  stadiumName: string
  capacity: number
  reason?: string
}

function clubCard(team: Team, reason?: string): ClubCard {
  const isCurrent = team.id === game.managedTeamId
  const nextDivision = game.projectedDivision(team.id)
  // Série C (fora da liga) conta como a série abaixo da última.
  const diff = ALL_DIVISIONS.indexOf(nextDivision) - ALL_DIVISIONS.indexOf(team.division)
  const venue = isCurrent && game.stadium ? game.stadium : createStadium(team)
  // A reputação muda com acesso/rebaixamento; o caixa do clube novo segue a reputação da próxima temporada.
  const nextReputation = team.reputation + (diff < 0 ? REPUTATION_SWING : diff > 0 ? -REPUTATION_SWING : 0)
  return {
    team,
    nextDivision,
    movement: diff < 0 ? 'up' : diff > 0 ? 'down' : null,
    finalPosition: game.divisionStandings(team.division).findIndex((r) => r.teamId === team.id) + 1,
    squadAverage: Math.round(team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length),
    stars: team.players.filter((p) => p.star).length,
    budget: isCurrent ? game.budget : nextReputation * 100_000,
    stadiumName: venue.name,
    capacity: stadiumCapacity(venue),
    reason,
  }
}

const current = computed(() => (game.managedTeam ? clubCard(game.managedTeam) : null))
const offers = computed(() =>
  game.jobOffers
    .map((o) => {
      const team = game.getTeam(o.teamId)
      return team ? clubCard(team, o.reason) : null
    })
    .filter((c): c is ClubCard => c !== null)
    .sort((a, b) => DIVISIONS.indexOf(a.nextDivision) - DIVISIONS.indexOf(b.nextDivision) || b.squadAverage - a.squadAverage),
)

function stay() {
  match.reset()
  game.nextSeason()
  router.push({ name: 'dashboard' })
}

function accept(card: ClubCard) {
  const msg =
    `Assumir o ${card.team.name} na ${DIVISION_LABELS[card.nextDivision]}?\n\n` +
    `Você deixa o ${game.managedTeam?.name}: o caixa (${formatMoney(game.budget)}) e o estádio ficam lá. ` +
    `O novo clube começa com ${formatMoney(card.budget)}.`
  if (!confirm(msg)) return
  match.reset()
  game.nextSeason(card.team.id)
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div v-if="current && review" class="window">
    <section class="card review">
      <div>
        <h1>💼 Janela de técnicos</h1>
        <p class="muted">Fim da temporada {{ game.season }}. Escolha onde você vai trabalhar na próxima.</p>
      </div>
      <div class="review__score">
        <span class="muted small">Avaliação da temporada</span>
        <strong :class="rating.tone">{{ rating.label }}</strong>
        <span class="small">{{ review.headline }}</span>
      </div>
    </section>

    <section class="clubs">
      <article class="card club club--current">
        <span class="club__tag">Seu clube atual</span>
        <header>
          <TeamBadge :team="current.team" :size="52" />
          <div>
            <h2>{{ current.team.name }}</h2>
            <span :class="['division', current.movement]">
              {{ DIVISION_LABELS[current.nextDivision] }}
              <template v-if="current.movement === 'up'">▲ subiu</template>
              <template v-else-if="current.movement === 'down'">▼ caiu</template>
            </span>
          </div>
        </header>
        <dl>
          <dt>Posição final</dt><dd>{{ current.finalPosition }}º na {{ DIVISION_LABELS[current.team.division] }}</dd>
          <dt>Média do elenco</dt><dd>{{ current.squadAverage }}</dd>
          <dt>Estrelas</dt><dd>{{ current.stars ? '★'.repeat(current.stars) : '—' }}</dd>
          <dt>Caixa</dt><dd>{{ formatMoney(current.budget) }}</dd>
          <dt>Estádio</dt><dd>{{ current.stadiumName }} ({{ current.capacity.toLocaleString('pt-BR') }})</dd>
        </dl>
        <p v-if="game.managedFallsOut" class="falls-out">
          O {{ current.team.name }} caiu para a Série C, que não é disputada no jogo. Escolha um dos clubes que querem você.
        </p>
        <button v-else class="btn" @click="stay">Ficar e iniciar a temporada {{ game.season + 1 }}</button>
      </article>

      <article v-for="card in offers" :key="card.team.id" class="card club" :style="{ '--team-color': card.team.primaryColor }">
        <span class="club__tag club__tag--offer">Proposta</span>
        <header>
          <TeamBadge :team="card.team" :size="52" />
          <div>
            <h2>{{ card.team.name }}</h2>
            <span :class="['division', card.movement]">
              {{ DIVISION_LABELS[card.nextDivision] }}
              <template v-if="card.movement === 'up'">▲ subiu</template>
              <template v-else-if="card.movement === 'down'">▼ caiu</template>
            </span>
          </div>
        </header>
        <p class="reason">“{{ card.reason }}”</p>
        <dl>
          <dt>Posição final</dt><dd>{{ card.finalPosition }}º na {{ DIVISION_LABELS[card.team.division] }}</dd>
          <dt>Média do elenco</dt>
          <dd :class="card.squadAverage > current.squadAverage ? 'good' : card.squadAverage < current.squadAverage ? 'bad' : ''">
            {{ card.squadAverage }}
          </dd>
          <dt>Estrelas</dt><dd>{{ card.stars ? '★'.repeat(card.stars) : '—' }}</dd>
          <dt>Caixa inicial</dt><dd>{{ formatMoney(card.budget) }}</dd>
          <dt>Estádio</dt><dd>{{ card.stadiumName }} ({{ card.capacity.toLocaleString('pt-BR') }})</dd>
        </dl>
        <button class="btn btn--ghost" @click="accept(card)">Aceitar proposta</button>
      </article>
    </section>

    <p class="muted small note">
      Ao trocar de clube, o caixa e as melhorias do estádio ficam no clube antigo. Suas táticas e o histórico de
      transferências vão com você.
    </p>
  </div>
</template>

<style scoped>
.falls-out {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
  font-size: 0.85rem;
}
.window {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.review {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}
.review h1 {
  margin-bottom: 0.25rem;
}
.review p {
  margin: 0;
}
.review__score {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  gap: 0.15rem;
}
.review__score strong {
  font-size: 1.5rem;
}
.small {
  font-size: 0.85rem;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.clubs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 1rem;
}
.club {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-top: 4px solid var(--team-color, var(--border));
}
.club--current {
  border-color: var(--accent);
}
.club__tag {
  position: absolute;
  top: 0.6rem;
  right: 0.75rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent);
}
.club__tag--offer {
  color: var(--warn);
}
.club header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.club h2 {
  margin: 0;
  font-size: 1.1rem;
}
.division {
  font-size: 0.85rem;
  color: var(--muted);
}
.division.up {
  color: var(--good);
}
.division.down {
  color: var(--bad);
}
.reason {
  margin: 0;
  font-style: italic;
  font-size: 0.85rem;
  color: var(--muted);
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.75rem;
  margin: 0;
  font-size: 0.85rem;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  text-align: right;
}
.club .btn {
  margin-top: auto;
}
.note {
  margin: 0;
}
</style>
