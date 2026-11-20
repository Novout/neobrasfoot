<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import HalftimePanel from '../components/HalftimePanel.vue'
import StarMark from '../components/StarMark.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS } from '../data/divisions'
import type { DivisionId, MatchEventType, MatchVenue } from '../types/game'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const speeds = [
  { label: '1x', ms: 400 },
  { label: '2x', ms: 200 },
  { label: '4x', ms: 80 },
]

// Todas as divisões jogam juntas; a aba escolhe qual acompanhar (padrão: a do clube).
const viewedDivision = ref<DivisionId | null>(null)
const shownDivision = computed(() => viewedDivision.value ?? game.managedDivision)

function matchDivision(m: { homeId: string }) {
  return game.getTeam(m.homeId)?.division
}

const EVENT_ICONS: Record<MatchEventType, string> = { gol: '⚽', amarelo: '🟨', vermelho: '🟥', lesao: '🩹', sub: '🔄' }

/** Rodada da Copa reúne clubes de todas as séries: sem abas de divisão. */
const isCup = computed(() => match.matches[0]?.competition === 'cup')

const sortedMatches = computed(() =>
  match.matches
    .filter((m) => isCup.value || matchDivision(m) === shownDivision.value)
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a))),
)

function goalsIn(division: DivisionId) {
  return match.matches
    .filter((m) => matchDivision(m) === division)
    .reduce((sum, m) => sum + m.homeGoals + m.awayGoals, 0)
}

function occupancy(venue: MatchVenue) {
  return Math.round((venue.attendance / Math.max(venue.capacity, 1)) * 100)
}

function isMine(m: { homeId: string; awayId: string }) {
  return m.homeId === game.managedTeamId || m.awayId === game.managedTeamId
}

function finishRound() {
  match.confirmRound()
  router.push({ name: 'dashboard' })
}

onMounted(() => {
  if (match.minute === 0) match.start()
})
onBeforeUnmount(() => match.stop())
</script>

<template>
  <div class="matches">
    <section class="card clock">
      <div class="clock__time">
        <span class="minute">{{ match.minute }}'</span>
        <span class="muted">{{ match.isFinished ? 'Fim de jogo' : match.halftime ? 'Intervalo' : match.running ? 'Bola rolando' : 'Pausado' }}</span>
      </div>
      <div class="progress"><div :style="{ width: `${(match.minute / 90) * 100}%` }" /></div>
      <div class="controls">
        <span v-if="match.halftime" class="muted">Faça as substituições abaixo e comece o 2º tempo.</span>
        <template v-else-if="!match.isFinished">
          <button class="btn btn--ghost" @click="match.running ? match.stop() : match.start()">
            {{ match.running ? '⏸ Pausar' : '▶ Continuar' }}
          </button>
          <button
            v-for="s in speeds"
            :key="s.ms"
            class="btn btn--sm"
            :class="{ 'btn--ghost': match.tickMs !== s.ms }"
            @click="match.setSpeed(s.ms)"
          >
            {{ s.label }}
          </button>
          <button class="btn btn--ghost" @click="match.simulateToEnd()">⏭ Simular até o fim</button>
        </template>
        <button v-else class="btn" @click="finishRound">Finalizar rodada</button>
      </div>
    </section>

    <HalftimePanel v-if="match.halftime" />

    <h2 class="round-title" :class="{ 'round-title--cup': isCup }">{{ isCup ? '🏆 ' : '' }}{{ game.nextEventLabel }}</h2>

    <nav v-if="!isCup" class="division-tabs">
      <button
        v-for="d in DIVISIONS"
        :key="d"
        class="btn btn--sm"
        :class="{ 'btn--ghost': shownDivision !== d }"
        @click="viewedDivision = d"
      >
        {{ DIVISION_LABELS[d] }}
        <span class="goals" :title="`${goalsIn(d)} gols nesta rodada`">⚽ {{ goalsIn(d) }}</span>
        <span v-if="d === game.managedDivision" title="Sua divisão">★</span>
      </button>
    </nav>

    <section class="match-list">
      <article v-for="m in sortedMatches" :key="m.id" class="card match" :class="{ 'match--mine': isMine(m) }">
        <div class="scoreboard">
          <div class="side">
            <span class="team-name">{{ game.getTeam(m.homeId)?.name }}</span>
            <TeamBadge :team="game.getTeam(m.homeId)!" :size="36" />
          </div>
          <div class="score">
            {{ m.homeGoals }} <span class="muted">x</span> {{ m.awayGoals }}
            <small v-if="m.penalties" class="penalties">pên. {{ m.penalties.home }} x {{ m.penalties.away }}</small>
          </div>
          <div class="side side--away">
            <TeamBadge :team="game.getTeam(m.awayId)!" :size="36" />
            <span class="team-name">{{ game.getTeam(m.awayId)?.name }}</span>
          </div>
        </div>
        <p v-if="m.venue" class="venue">
          🏟️ <span class="venue__name">{{ m.venue.name }}</span>
          <span class="venue__crowd" :title="`Capacidade: ${m.venue.capacity.toLocaleString('pt-BR')} lugares`">
            · {{ m.venue.attendance.toLocaleString('pt-BR') }} torcedores
            <span class="muted">({{ occupancy(m.venue) }}%)</span>
            <span v-if="occupancy(m.venue) >= 100" class="sold-out">lotado</span>
          </span>
        </p>
        <ul v-if="m.events.length" class="events">
          <li v-for="(e, i) in m.events" :key="i" :class="e.teamId === m.homeId ? 'home' : 'away'">
            {{ EVENT_ICONS[e.type] }} {{ e.minute }}' {{ e.playerName }}<StarMark :star="e.star" />
            <small v-if="e.type === 'vermelho' && e.secondYellow" class="muted"> (2º amarelo)</small>
            <small v-else-if="e.type === 'lesao'" class="muted"> (fora {{ e.games }} jogo{{ (e.games ?? 1) > 1 ? 's' : '' }})</small>
            <small v-else-if="e.type === 'sub'" class="muted"> {{ e.outName ? `(sai ${e.outName})` : '(vaga de lesionado)' }}</small>
          </li>
        </ul>
      </article>
    </section>
  </div>
</template>

<style scoped>
.matches {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.clock {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.clock__time {
  display: flex;
  flex-direction: column;
  min-width: 110px;
}
.minute {
  font-size: 2.2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.progress {
  flex: 1;
  min-width: 200px;
  height: 8px;
  background: var(--surface-2);
  border-radius: 4px;
  overflow: hidden;
}
.progress div {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s linear;
}
.controls {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.venue {
  margin: 0.5rem 0 0;
  text-align: center;
  font-size: 0.8rem;
  color: var(--muted);
}
.venue__name {
  color: var(--text);
  font-weight: 600;
}
.sold-out {
  margin-left: 0.3rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(234, 179, 8, 0.15);
  color: var(--warn);
}
.round-title {
  margin: 0;
  font-size: 1.1rem;
}
.round-title--cup {
  color: var(--warn);
}
.penalties {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  color: var(--warn);
}
.division-tabs {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.goals {
  margin-left: 0.35rem;
  font-size: 0.75rem;
  opacity: 0.8;
}
.match-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr));
  gap: 1rem;
}
.match--mine {
  grid-column: 1 / -1;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.scoreboard {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1rem;
}
.side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
}
.side--away {
  justify-content: flex-start;
}
.team-name {
  font-weight: 600;
}
.score {
  font-size: 1.8rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.match--mine .score {
  font-size: 2.4rem;
}
.events {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0.5rem 0 0;
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr 1fr;
  font-size: 0.85rem;
  gap: 0.2rem 1rem;
}
.events .home {
  grid-column: 1;
  text-align: right;
}
.events .away {
  grid-column: 2;
}
</style>
