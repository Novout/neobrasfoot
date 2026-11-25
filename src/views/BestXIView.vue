<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TeamBadge from '../components/TeamBadge.vue'
import StarMark from '../components/StarMark.vue'
import PosTag from '../components/PosTag.vue'
import { DIVISION_LABELS, LEAGUE_DIVISIONS } from '../data/divisions'
import { BEST_XI_SHAPE, MIN_APPS_SHARE, type BestXIEntry } from '../data/seasonStats'
import { useGameStore } from '../stores/game'
import type { DivisionId, Position } from '../types/game'

const game = useGameStore()

/** Temporada mostrada: 0 = a atual (parcial ou final); senão, uma das encerradas guardadas. */
const viewed = ref(0)
const options = computed(() => {
  const current = { season: game.season, year: game.currentYear, label: `${game.currentYear} (${game.isSeasonOver ? 'final' : 'parcial'})` }
  const past = game.bestXIHistory.filter((r) => r.season !== game.season).map((r) => ({ season: r.season, year: r.year, label: `${r.year}` }))
  return [current, ...past]
})

const record = computed(() => {
  if (viewed.value === 0 || viewed.value === game.season) return { divisions: game.bestXI, partial: !game.isSeasonOver }
  const saved = game.bestXIHistory.find((r) => r.season === viewed.value)
  return { divisions: saved?.divisions ?? {}, partial: false }
})

const divisions = computed(() => LEAGUE_DIVISIONS.filter((d) => record.value.divisions[d]))
const division = ref<DivisionId>(game.managedDivision)
watch(divisions, (list) => {
  if (!list.includes(division.value)) division.value = list[0] ?? 'A'
})

/** Linhas do campo, do ataque para o gol. */
const LINES: Position[] = ['ATA', 'MEI', 'DEF', 'GOL']
const lines = computed(() => {
  const entries = record.value.divisions[division.value] ?? []
  return LINES.map((pos) => {
    const players = entries.filter((e) => e.position === pos)
    if (pos !== 'DEF') return { pos, players }
    // Defesa como no campo: um lateral em cada ponta e os zagueiros no meio.
    const laterals = players.filter((e) => e.defRole === 'LAT')
    const centre = players.filter((e) => e.defRole !== 'LAT')
    return { pos, players: [...laterals.slice(0, 1), ...centre, ...laterals.slice(1)] }
  })
})
const total = computed(() => (record.value.divisions[division.value] ?? []).length)
const missing = computed(() => Object.values(BEST_XI_SHAPE).reduce((a, b) => a + b, 0) - total.value)

const minApps = computed(() => Math.max(1, Math.ceil(game.round * MIN_APPS_SHARE)))

function teamOf(e: BestXIEntry) {
  return game.getTeam(e.teamId) ?? game.reserveTeams.find((t) => t.id === e.teamId) ?? null
}

function stat(e: BestXIEntry) {
  if (e.position === 'GOL' || e.position === 'DEF') return `${e.cleanSheets} sem sofrer gol`
  return `${e.goals} gol${e.goals === 1 ? '' : 's'}`
}
</script>

<template>
  <div v-if="game.managedTeam" class="best">
    <section class="card best__header">
      <div>
        <h1>⭐ Seleção da temporada</h1>
        <p class="muted">
          Os melhores de cada série no campeonato, pela média de nota: 1 goleiro, 2 laterais, 2 zagueiros, 4 meias e 2 atacantes.
          <template v-if="record.partial">Parcial: vale quem jogou pelo menos {{ minApps }} das {{ game.round }} rodadas.</template>
        </p>
      </div>
      <label v-if="options.length > 1" class="season-pick">
        Temporada
        <select v-model.number="viewed">
          <option v-for="(o, i) in options" :key="o.season" :value="i === 0 ? 0 : o.season">{{ o.label }}</option>
        </select>
      </label>
    </section>

    <nav class="tabs">
      <button
        v-for="d in divisions"
        :key="d"
        class="btn btn--sm"
        :class="{ 'btn--ghost': division !== d }"
        @click="division = d"
      >
        {{ DIVISION_LABELS[d] }}<span v-if="d === game.managedDivision" title="Sua divisão"> ★</span>
      </button>
    </nav>

    <section class="card pitch-card">
      <p v-if="!total" class="muted empty">
        Ainda não há jogos suficientes nesta temporada. A seleção aparece depois das primeiras rodadas.
      </p>
      <div v-else class="pitch">
        <div v-for="line in lines" :key="line.pos" class="line">
          <article
            v-for="e in line.players"
            :key="e.playerId"
            class="player"
            :class="{ 'player--mine': e.teamId === game.managedTeamId }"
            :title="`${teamOf(e)?.name ?? ''} · ${e.apps} jogos · nota média ${e.rating.toFixed(2)}`"
          >
            <span class="player__rating">{{ e.rating.toFixed(1) }}</span>
            <TeamBadge v-if="teamOf(e)" :team="teamOf(e)!" :size="34" />
            <strong class="player__name">{{ e.name }}<StarMark :star="e.star" /></strong>
            <small class="player__club">
              <PosTag :player="{ id: e.playerId, position: e.position, defRole: e.defRole }" />
              {{ teamOf(e)?.shortName }}
            </small>
            <small class="muted">{{ e.apps }} jogos · {{ stat(e) }}</small>
          </article>
        </div>
      </div>
      <p v-if="total && missing > 0" class="muted small">
        Faltam {{ missing }} jogador(es): ainda há poucos com jogos suficientes em alguma posição.
      </p>
    </section>
  </div>
</template>

<style scoped>
.best {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.best__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 1rem;
}
.best__header h1 {
  margin: 0 0 0.25rem;
}
.best__header p {
  margin: 0;
}
.season-pick {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.tabs {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.pitch {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 0.75rem;
  border-radius: 10px;
  background:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px) 0 50% / 100% 50%,
    repeating-linear-gradient(90deg, #1e5631 0 60px, #1b4d2c 60px 120px);
  border: 2px solid rgba(255, 255, 255, 0.15);
}
.line {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.player {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  width: 150px;
  padding: 0.6rem 0.5rem 0.5rem;
  border-radius: 10px;
  background: rgba(10, 15, 12, 0.82);
  border: 1px solid var(--border);
  text-align: center;
}
.player--mine {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.player__rating {
  position: absolute;
  top: -0.55rem;
  right: -0.45rem;
  padding: 0.05rem 0.4rem;
  border-radius: 6px;
  background: var(--accent);
  color: #062312;
  font-weight: 800;
  font-size: 0.8rem;
}
.player__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.88rem;
}
.player__club {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
}
.player small.muted {
  font-size: 0.7rem;
}
.empty {
  text-align: center;
  margin: 1rem 0;
}
.small {
  font-size: 0.8rem;
  margin: 0.75rem 0 0;
}
@media (max-width: 620px) {
  .player {
    width: 132px;
  }
}
</style>
