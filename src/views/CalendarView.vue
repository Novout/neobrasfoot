<script setup lang="ts">
import { computed } from 'vue'
import TeamBadge from '../components/TeamBadge.vue'
import { formatDate, leagueEnd, leagueStart, MONTH_NAMES, monthOf, weekdayOf } from '../data/calendar'
import { CUP_NAME, cupPhases } from '../data/cup'
import { DIVISION_LABELS } from '../data/divisions'
import { groupOf, groupRoundCount, LIBERTADORES_NAME, stageName } from '../data/libertadores'
import { WORLD_CUP_NAME } from '../data/worldCup'
import type { LibertadoresState } from '../types/game'
import type { CalendarKind } from '../data/calendar'
import { useGameStore } from '../stores/game'
import type { Team } from '../types/game'

const game = useGameStore()

type Outcome = 'win' | 'draw' | 'loss'

interface Row {
  key: string
  date: string
  kind: CalendarKind
  label: string
  opponent: Team | null
  home: boolean | null
  /** Placar na visão do clube gerenciado ("2 x 1") e o resultado. */
  score: string | null
  outcome: Outcome | null
  note: string | null
  played: boolean
  next: boolean
}

const myId = computed(() => game.managedTeamId)

function leagueRow(index: number, date: string): Row {
  const played = index < game.round
  const result = game.leagueResults[index]
  const fixture = game.fixtures[index]?.find((f) => f.homeId === myId.value || f.awayId === myId.value)
  const homeId = result?.homeId ?? fixture?.homeId
  const awayId = result?.awayId ?? fixture?.awayId
  const home = homeId ? homeId === myId.value : null
  const opponent = homeId && awayId ? game.getTeam(home ? awayId : homeId) : null
  let score: string | null = null
  let outcome: Outcome | null = null
  if (result) {
    const mine = home ? result.homeGoals : result.awayGoals
    const theirs = home ? result.awayGoals : result.homeGoals
    score = `${mine} x ${theirs}`
    outcome = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw'
  }
  return {
    key: `L${index}`,
    date,
    kind: 'league',
    label: `${DIVISION_LABELS[game.managedDivision]} · Rodada ${index + 1}`,
    opponent,
    home,
    score,
    outcome,
    note: played && !result ? 'resultado não registrado' : null,
    played,
    next: game.nextEvent === 'league' && index === game.round,
  }
}

function cupRow(index: number, date: string): Row {
  const c = game.cup!
  const phase = cupPhases(c)[index]
  const drawn = c.rounds[index]
  const tie = drawn?.ties.find((t) => t.homeId === myId.value || t.awayId === myId.value)
  const played = index < c.currentRound || (c.championId !== null && index <= c.currentRound)
  let note: string | null = null
  if (!tie) {
    if (!drawn) note = 'adversário a definir'
    else if (index === 0 && c.byes?.includes(myId.value ?? '')) note = 'seu time entra direto na 1ª fase'
    else note = game.managedCupStatus?.state === 'absent' ? 'seu time não disputa a Copa' : 'seu time não está nesta fase'
  }
  const home = tie ? tie.homeId === myId.value : null
  let score: string | null = null
  let outcome: Outcome | null = null
  if (tie && tie.homeGoals !== null && tie.awayGoals !== null) {
    const mine = home ? tie.homeGoals : tie.awayGoals
    const theirs = home ? tie.awayGoals : tie.homeGoals
    const pens = tie.penalties ? ` (pên. ${home ? tie.penalties.home : tie.penalties.away}-${home ? tie.penalties.away : tie.penalties.home})` : ''
    score = `${mine} x ${theirs}${pens}`
    outcome = tie.winnerId === myId.value ? 'win' : 'loss'
  }
  return {
    key: `C${index}`,
    date,
    kind: 'cup',
    label: `${CUP_NAME} · ${phase?.name ?? ''}`,
    opponent: tie ? game.getTeam(home ? tie.awayId : tie.homeId) : null,
    home,
    score,
    outcome,
    note,
    played,
    next: game.nextEvent === 'cup' && index === c.currentRound,
  }
}

/**
 * Etapa de um torneio com grupos e mata-mata (Libertadores ou Copa do Mundo), do ponto de vista do time do técnico
 * nele (o clube na Libertadores, a seleção na Copa). Só aparece no calendário de quem disputa o torneio.
 */
function tournamentRow(kind: 'libertadores' | 'worldcup', l: LibertadoresState, teamId: string | null, name: string, index: number, date: string): Row {
  const rounds = groupRoundCount(l)
  const ties = index < rounds ? l.groupRounds[index] : l.knockout[index - rounds]?.ties
  const tie = ties?.find((t) => t.homeId === teamId || t.awayId === teamId)
  const played = index < l.stage || (l.championId !== null && index <= l.stage)
  const home = tie ? tie.homeId === teamId : null
  let score: string | null = null
  let outcome: Outcome | null = null
  if (tie && tie.homeGoals !== null && tie.awayGoals !== null) {
    const mine = home ? tie.homeGoals : tie.awayGoals
    const theirs = home ? tie.awayGoals : tie.homeGoals
    const pens = tie.penalties ? ` (pên. ${home ? tie.penalties.home : tie.penalties.away}-${home ? tie.penalties.away : tie.penalties.home})` : ''
    score = `${mine} x ${theirs}${pens}`
    outcome = tie.winnerId === teamId ? 'win' : tie.winnerId ? 'loss' : 'draw'
  }
  let note: string | null = null
  if (!tie) note = ties ? 'seu time não está nesta fase' : 'adversário a definir'
  return {
    key: `L${index}-${kind}`,
    date,
    kind,
    label: `${name} · ${stageName(index, rounds)}`,
    opponent: tie ? game.getTeam(home ? tie.awayId : tie.homeId) : null,
    home,
    score,
    outcome,
    note,
    played,
    next: game.nextEvent === kind && index === l.stage,
  }
}

function libertadoresRow(index: number, date: string): Row {
  return tournamentRow('libertadores', game.libertadores!, myId.value, LIBERTADORES_NAME, index, date)
}

/** Jogos da Copa do Mundo da seleção que o técnico treina. */
function worldCupRow(index: number, date: string): Row {
  return tournamentRow('worldcup', game.worldCup!, game.nationalJob?.teamId ?? null, WORLD_CUP_NAME, index, date)
}

/** O clube gerenciado disputa a Libertadores desta temporada. */
const inLibertadores = computed(() => !!game.libertadores && !!myId.value && !!groupOf(game.libertadores, myId.value))

/** Compromissos da temporada agrupados por mês. */
const months = computed(() => {
  const rows = game.calendar
    .filter((e) => e.kind !== 'libertadores' || inLibertadores.value)
    // Copa do Mundo: só para quem treina uma seleção nela.
    .filter((e) => e.kind !== 'worldcup' || (!!game.worldCup && !!game.nationalJob))
    .map((e) =>
      e.kind === 'league'
        ? leagueRow(e.index, e.date)
        : e.kind === 'cup'
          ? cupRow(e.index, e.date)
          : e.kind === 'libertadores'
            ? libertadoresRow(e.index, e.date)
            : worldCupRow(e.index, e.date),
    )
  const groups: { month: number; rows: Row[] }[] = []
  for (const row of rows) {
    const month = monthOf(row.date)
    if (groups.at(-1)?.month !== month) groups.push({ month, rows: [] })
    groups.at(-1)!.rows.push(row)
  }
  return groups
})

const totals = computed(() => {
  const rows = months.value.flatMap((m) => m.rows)
  return {
    league: rows.filter((r) => r.kind === 'league').length,
    midweek: rows.filter((r) => r.kind === 'league' && weekdayOf(r.date) !== 0).length,
    cup: rows.filter((r) => r.kind === 'cup').length,
    libertadores: rows.filter((r) => r.kind === 'libertadores').length,
  }
})

const OUTCOME_LABEL: Record<Outcome, string> = { win: 'V', draw: 'E', loss: 'D' }
</script>

<template>
  <div v-if="game.managedTeam" class="calendar">
    <section class="card calendar__header">
      <div>
        <h1>📅 Calendário {{ game.currentYear }}</h1>
        <p class="muted">
          Campeonato de {{ formatDate(leagueStart(game.currentYear)) }} a {{ formatDate(leagueEnd(game.currentYear)) }}:
          {{ totals.league }} rodadas<template v-if="totals.midweek"> ({{ totals.midweek }} no meio de semana)</template>
          · {{ totals.cup }} fases da {{ CUP_NAME }}<template v-if="totals.libertadores">
            e {{ totals.libertadores }} jogos da {{ LIBERTADORES_NAME }}</template> no meio de semana.
        </p>
      </div>
      <div v-if="game.nextEventDate" class="calendar__next">
        <small class="muted">Próximo jogo</small>
        <strong>{{ formatDate(game.nextEventDate, true) }}</strong>
        <small>{{ game.nextEventLabel }}</small>
      </div>
      <div v-else class="calendar__next">
        <strong>Temporada encerrada</strong>
      </div>
    </section>

    <section v-for="group in months" :key="group.month" class="card month">
      <h2>{{ MONTH_NAMES[group.month] }}</h2>
      <ul>
        <li
          v-for="row in group.rows"
          :key="row.key"
          class="row"
          :class="[`row--${row.kind}`, { 'row--played': row.played, 'row--next': row.next }]"
        >
          <span class="row__date">{{ formatDate(row.date) }}</span>
          <span class="row__comp" :class="{ 'row__comp--cup': row.kind === 'cup', 'row__comp--lib': row.kind === 'libertadores' || row.kind === 'worldcup' }">
            {{ { cup: '🏆 ', libertadores: '🌎 ', worldcup: '🌍 ', league: '' }[row.kind] }}{{ row.label }}
          </span>
          <span class="row__match">
            <template v-if="row.opponent">
              <span class="muted">{{ row.home ? 'Casa' : 'Fora' }} ·</span>
              <TeamBadge :team="row.opponent" :size="22" />
              <span class="row__opp">{{ row.opponent.name }}</span>
            </template>
            <span v-else class="muted">{{ row.note }}</span>
          </span>
          <span class="row__result">
            <template v-if="row.score">
              <span class="outcome" :class="`outcome--${row.outcome}`">{{ OUTCOME_LABEL[row.outcome!] }}</span>
              {{ row.score }}
            </template>
            <span v-else-if="row.next" class="tag-next">próximo</span>
            <span v-else-if="row.note && row.opponent" class="muted">{{ row.note }}</span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.calendar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.calendar__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}
.calendar__header h1 {
  margin: 0 0 0.25rem;
}
.calendar__header p {
  margin: 0;
}
.calendar__next {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}
.calendar__next strong {
  font-size: 1.1rem;
  color: var(--accent);
}
.month h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.month ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.row {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 14rem) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border-left: 3px solid var(--border);
  background: var(--surface-2);
  font-size: 0.88rem;
}
.row--cup {
  border-left-color: var(--warn);
}
.row--played {
  opacity: 0.7;
}
.row--next {
  outline: 1px solid var(--accent);
  opacity: 1;
}
.row__date {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.row__comp {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__comp--cup {
  color: var(--warn);
}
.row__comp--lib {
  color: #fb923c;
}
.row__match {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.row__opp {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__result {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.outcome {
  display: inline-grid;
  place-items: center;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 4px;
  font-size: 0.72rem;
  color: #0b0f0d;
}
.outcome--win {
  background: var(--good);
}
.outcome--draw {
  background: var(--muted);
}
.outcome--loss {
  background: var(--bad);
  color: #fff;
}
.tag-next {
  padding: 0 0.4rem;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.75rem;
}
@media (max-width: 700px) {
  .row {
    grid-template-columns: 5.5rem minmax(0, 1fr) auto;
  }
  .row__comp {
    grid-column: 2 / -1;
    grid-row: 1;
  }
  .row__match {
    grid-column: 1 / 3;
  }
}
</style>
