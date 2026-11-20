<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS } from '../data/divisions'
import {
  managerRanking, PLAYER_MANAGER_ID, TROPHY_POINTS, TROPHY_STYLE, trophyKey, trophyLabel, trophyPoints,
} from '../data/trophies'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const ranking = computed(() => managerRanking(game.managers))

/** Técnico aberto na prateleira (vem da URL; padrão: você). */
const selectedId = computed(() => (route.query.tecnico as string) || PLAYER_MANAGER_ID)
const selected = computed(() => ranking.value.find((r) => r.manager.id === selectedId.value) ?? ranking.value[0] ?? null)
const selectedPosition = computed(() => ranking.value.findIndex((r) => r.manager.id === selected.value?.manager.id) + 1)

function select(id: string) {
  router.replace({ query: { tecnico: id } })
}

/** Taças da prateleira, das mais importantes para as menos, e das mais recentes para as antigas. */
const shelf = computed(() =>
  [...(selected.value?.manager.trophies ?? [])].sort((a, b) => trophyPoints(b) - trophyPoints(a) || b.season - a.season),
)

const KEYS = ['A', 'cup', 'B', 'C', 'D'] as const
</script>

<template>
  <div class="trophies">
    <section v-if="selected" class="card shelf-card">
      <header class="shelf-header">
        <div>
          <h1>
            🏆 Prateleira de {{ selected.manager.name }}
            <span v-if="selected.manager.isPlayer" class="you">você</span>
          </h1>
          <p class="muted">
            <template v-if="selected.manager.teamId">
              Técnico do <strong>{{ game.getTeam(selected.manager.teamId)?.name }}</strong> ·
            </template>
            {{ selectedPosition }}º no ranking · {{ selected.points }} pontos · {{ selected.total }}
            troféu{{ selected.total === 1 ? '' : 's' }}
          </p>
        </div>
        <TeamBadge v-if="selected.manager.teamId" :team="game.getTeam(selected.manager.teamId)!" :size="56" />
      </header>

      <div class="shelf">
        <article
          v-for="(t, i) in shelf"
          :key="i"
          class="trophy"
          :style="{ '--trophy-color': TROPHY_STYLE[trophyKey(t)].color }"
          :title="`${trophyLabel(t)} · temporada ${t.season} · ${trophyPoints(t)} pontos`"
        >
          <span class="trophy__icon">{{ TROPHY_STYLE[trophyKey(t)].icon }}</span>
          <strong>{{ TROPHY_STYLE[trophyKey(t)].name }}</strong>
          <small>Temporada {{ t.season }}</small>
          <small class="trophy__team">
            <TeamBadge :team="game.getTeam(t.teamId)!" :size="16" /> {{ game.getTeam(t.teamId)?.shortName }}
          </small>
        </article>
        <p v-if="!shelf.length" class="empty muted">
          Prateleira vazia. Ganhe uma das séries ou a Copa do Brasil para colocar a primeira taça aqui.
        </p>
      </div>
      <div class="shelf__wood" />
    </section>

    <section class="card">
      <h2>Ranking de técnicos</h2>
      <p class="muted small">
        Pontos por conquista:
        <span v-for="k in KEYS" :key="k" class="points-chip">
          {{ TROPHY_STYLE[k].icon }} {{ TROPHY_STYLE[k].name }} {{ TROPHY_POINTS[k] }}
        </span>
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Técnico</th>
            <th>Clube atual</th>
            <th v-for="k in KEYS" :key="k" class="num" :title="TROPHY_STYLE[k].name">{{ TROPHY_STYLE[k].icon }} {{ k === 'cup' ? 'Copa' : k }}</th>
            <th class="num">Troféus</th>
            <th class="num">Pontos</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in ranking"
            :key="row.manager.id"
            :class="{ mine: row.manager.isPlayer, active: row.manager.id === selected?.manager.id }"
            @click="select(row.manager.id)"
          >
            <td>{{ i + 1 }}</td>
            <td>{{ row.manager.name }}<span v-if="row.manager.isPlayer" class="you">você</span></td>
            <td>
              <span v-if="row.manager.teamId" class="club">
                <TeamBadge :team="game.getTeam(row.manager.teamId)!" :size="20" />
                {{ game.getTeam(row.manager.teamId)?.name }}
                <small class="muted">{{ DIVISION_LABELS[game.getTeam(row.manager.teamId)!.division] }}</small>
              </span>
            </td>
            <td v-for="k in KEYS" :key="k" class="num" :class="{ muted: !row.counts[k] }">{{ row.counts[k] || '–' }}</td>
            <td class="num">{{ row.total }}</td>
            <td class="num"><strong>{{ row.points }}</strong></td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.trophies {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.shelf-card {
  padding-bottom: 0;
  overflow: hidden;
}
.shelf-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.shelf-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
}
.shelf-header p {
  margin: 0;
}
.you {
  margin-left: 0.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 700;
  vertical-align: middle;
  background: var(--accent-soft);
  color: var(--accent);
}
.shelf {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  min-height: 150px;
  margin-top: 1rem;
  padding: 0 0.5rem;
  overflow-x: auto;
}
.shelf__wood {
  height: 14px;
  margin: 0 -1.25rem;
  background: linear-gradient(#8b5a2b, #5c3a1a);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}
.trophy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 96px;
  padding: 0.5rem 0.4rem 0.4rem;
  border-radius: 8px 8px 0 0;
  border: 1px solid var(--trophy-color);
  border-bottom: none;
  background: linear-gradient(to top, color-mix(in srgb, var(--trophy-color) 18%, transparent), transparent);
  text-align: center;
  cursor: default;
}
.trophy__icon {
  font-size: 2.4rem;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--trophy-color) 60%, transparent));
}
.trophy strong {
  font-size: 0.75rem;
  color: var(--trophy-color);
}
.trophy small {
  font-size: 0.68rem;
  color: var(--muted);
}
.trophy__team {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.empty {
  align-self: center;
  margin: auto;
}
.small {
  font-size: 0.82rem;
}
.points-chip {
  display: inline-block;
  margin: 0 0.4rem 0.3rem 0;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  background: var(--surface-2);
}
.club {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}
tbody tr {
  cursor: pointer;
}
tbody tr:hover td {
  background: var(--surface-2);
}
tr.mine td {
  color: var(--accent);
}
tr.active td {
  background: var(--accent-soft);
}
</style>
