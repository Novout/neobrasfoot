<script setup lang="ts">
import { computed, ref } from 'vue'
import CountryTag from './CountryTag.vue'
import TeamBadge from './TeamBadge.vue'
import { roundName } from '../data/cup'
import { COUNTRY_NAMES, countryOf, GROUP_QUALIFIERS, groupOf, groupTable } from '../data/libertadores'
import { useGameStore } from '../stores/game'
import type { CupTie, LibertadoresState } from '../types/game'

/**
 * Fase de grupos (tabelas e jogos de cada grupo) e chave do mata-mata de um torneio: Libertadores ou Copa do Mundo.
 */
const props = defineProps<{
  state: LibertadoresState
  /** Time do técnico no torneio (destacado). */
  myId: string | null | undefined
  /** Torneio encerrado (nenhuma etapa fica marcada como a atual). */
  finished: boolean
  /** Palavra para a coluna dos times: "Clube" ou "Seleção". */
  teamWord?: string
}>()

const game = useGameStore()
const groupRounds = computed(() => props.state.groupRounds.length)
const teamWord = computed(() => props.teamWord ?? 'Clube')
const myGroup = computed(() => (props.myId ? groupOf(props.state, props.myId) : null))

const groups = computed(() =>
  props.state.groups.map((g, i) => ({
    ...g,
    table: groupTable(props.state, i),
    mine: g === myGroup.value,
    // Jogos do grupo, rodada a rodada.
    rounds: props.state.groupRounds.map((ties) => ties.filter((t) => g.teamIds.includes(t.homeId))),
  })),
)

/** Grupos abertos para ver os jogos (o do seu time começa aberto). */
const openGroups = ref(new Set<string>(myGroup.value ? [myGroup.value.name] : []))
const isOpen = (name: string) => openGroups.value.has(name)
function toggle(name: string) {
  const next = new Set(openGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  openGroups.value = next
}

/** Mata-mata: fases sorteadas e futuras (vazias) para desenhar a chave completa (oitavas até a final). */
const bracket = computed(() =>
  Array.from({ length: 4 }, (_, i) => {
    const stage = groupRounds.value + i
    const tieCount = 2 ** (3 - i)
    return {
      stage,
      name: roundName(tieCount),
      tieCount,
      ties: props.state.knockout[i]?.ties ?? null,
      afterLeagueRound: props.state.schedule[stage],
      isCurrent: !props.finished && props.state.stage === stage,
    }
  }),
)

function teamLabel(id: string) {
  const t = game.getTeam(id)
  return t ? `${t.name} · ${COUNTRY_NAMES[countryOf(t)] ?? countryOf(t)}` : ''
}

function sideClass(tie: CupTie, teamId: string) {
  return {
    winner: tie.winnerId === teamId,
    loser: tie.winnerId !== null && tie.winnerId !== teamId,
    mine: teamId === props.myId,
  }
}

const isMine = (tie: CupTie) => tie.homeId === props.myId || tie.awayId === props.myId
</script>

<template>
  <div class="board">
  <h2 class="section-title">
    Fase de grupos
    <small class="muted">rodadas após as rodadas {{ state.schedule.slice(0, groupRounds).join(', ') }} do campeonato</small>
  </h2>
  <section class="groups">
    <article v-for="g in groups" :key="g.name" class="card group" :class="{ 'group--mine': g.mine }">
      <header class="group__header">
        <h3>Grupo {{ g.name }}</h3>
        <button class="btn btn--sm btn--ghost" @click="toggle(g.name)">{{ isOpen(g.name) ? 'Ocultar jogos' : 'Ver jogos' }}</button>
      </header>
      <table class="group__table">
        <thead>
          <tr>
            <th>#</th><th>{{ teamWord }}</th><th class="num">J</th><th class="num">V</th><th class="num">E</th><th class="num">D</th>
            <th class="num">SG</th><th class="num">P</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in g.table"
            :key="row.teamId"
            :class="{ qualified: i < GROUP_QUALIFIERS, mine: row.teamId === myId }"
          >
            <td>{{ i + 1 }}</td>
            <td class="club" :title="teamLabel(row.teamId)">
              <TeamBadge :team="game.getTeam(row.teamId)!" :size="20" />
              <span class="club__name">{{ game.getTeam(row.teamId)?.name }}</span>
              <CountryTag :team="game.getTeam(row.teamId)" />
            </td>
            <td class="num">{{ row.played }}</td>
            <td class="num">{{ row.wins }}</td>
            <td class="num">{{ row.draws }}</td>
            <td class="num">{{ row.losses }}</td>
            <td class="num">{{ row.goalsFor - row.goalsAgainst }}</td>
            <td class="num"><strong>{{ row.points }}</strong></td>
          </tr>
        </tbody>
      </table>
      <ol v-if="isOpen(g.name)" class="group__rounds">
        <li v-for="(ties, r) in g.rounds" :key="r" :class="{ current: state.stage === r && !finished }">
          <span class="muted round-label">{{ r + 1 }}ª</span>
          <span v-for="(t, k) in ties" :key="k" class="game" :class="{ 'game--mine': isMine(t) }">
            {{ game.getTeam(t.homeId)?.shortName }}
            <strong>{{ t.homeGoals ?? '' }} x {{ t.awayGoals ?? '' }}</strong>
            {{ game.getTeam(t.awayId)?.shortName }}
          </span>
        </li>
      </ol>
    </article>
  </section>

  <h2 class="section-title">Mata-mata</h2>
  <section class="bracket">
    <div v-for="col in bracket" :key="col.stage" class="bracket__col" :class="{ current: col.isCurrent }">
      <header>
        <strong>{{ col.name }}</strong>
        <small class="muted">após a rodada {{ col.afterLeagueRound }}</small>
      </header>
      <div class="bracket__ties">
        <template v-if="col.ties">
          <article v-for="(tie, i) in col.ties" :key="i" class="tie" :class="{ 'tie--mine': isMine(tie) }">
            <div
              v-for="side in (['home', 'away'] as const)"
              :key="side"
              class="tie__side"
              :class="sideClass(tie, side === 'home' ? tie.homeId : tie.awayId)"
            >
              <template v-for="team in [game.getTeam(side === 'home' ? tie.homeId : tie.awayId)]" :key="team?.id">
                <TeamBadge v-if="team" :team="team" :size="20" />
                <span class="tie__name" :title="team ? teamLabel(team.id) : ''">
                  {{ team?.shortName }} <CountryTag :team="team" />
                </span>
                <span class="tie__score">
                  {{ side === 'home' ? (tie.homeGoals ?? '') : (tie.awayGoals ?? '') }}
                  <small v-if="tie.penalties" class="muted">({{ side === 'home' ? tie.penalties.home : tie.penalties.away }})</small>
                </span>
              </template>
            </div>
          </article>
        </template>
        <template v-else>
          <article v-for="i in col.tieCount" :key="i" class="tie tie--empty">
            <div class="tie__side muted">A definir</div>
            <div class="tie__side muted">A definir</div>
          </article>
        </template>
      </div>
    </div>
  </section>
  </div>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.section-title {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin: 0.5rem 0 0;
}
.section-title small {
  font-size: 0.8rem;
  font-weight: 400;
}
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.75rem;
  align-items: start;
}
.group {
  padding: 0.75rem;
}
.group--mine {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.group__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}
.group__header h3 {
  margin: 0;
}
.group__table {
  font-size: 0.82rem;
}
.group__table td,
.group__table th {
  padding: 0.25rem 0.3rem;
}
.group__table tr td:first-child {
  border-left: 3px solid transparent;
}
.group__table tr.qualified td:first-child {
  border-left-color: var(--good);
}
.group__table tr.mine td {
  color: var(--accent);
  font-weight: 700;
}
.club {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 170px;
}
.club__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group__rounds {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0.5rem 0 0;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
}
.group__rounds li {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: baseline;
}
.group__rounds li.current .round-label {
  color: var(--accent);
  font-weight: 700;
}
.round-label {
  width: 1.6rem;
}
.game--mine {
  color: var(--accent);
}
.bracket {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}
.bracket__col {
  display: flex;
  flex-direction: column;
  min-width: 150px;
}
.bracket__col header {
  display: flex;
  flex-direction: column;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.bracket__col.current header {
  border-color: var(--accent);
  color: var(--accent);
}
.bracket__ties {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: 0.35rem;
}
.tie {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.82rem;
}
.tie--mine {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.tie--empty {
  opacity: 0.45;
}
.tie__side {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.45rem;
  min-height: 1.8rem;
}
.tie__side + .tie__side {
  border-top: 1px solid var(--border);
}
.tie__name {
  flex: 1;
  white-space: nowrap;
}
.tie__score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.tie__side.winner {
  font-weight: 700;
}
.tie__side.loser {
  opacity: 0.5;
}
.tie__side.mine .tie__name {
  color: var(--accent);
}
</style>
