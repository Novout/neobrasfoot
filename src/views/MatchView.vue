<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import HalftimePanel from '../components/HalftimePanel.vue'
import PenaltyPanel from '../components/PenaltyPanel.vue'
import StarMark from '../components/StarMark.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, LEAGUE_DIVISIONS } from '../data/divisions'
import { clockLabel } from '../data/stoppage'
import type { DivisionId, LiveMatch, MatchEventType, MatchVenue } from '../types/game'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { playGoalAgainst, playGoalFor, soundMuted } from '../utils/sounds'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const speeds = [
  { label: '1x', ms: 400 },
  { label: '2x', ms: 200 },
  { label: '4x', ms: 80 },
]

function matchDivision(m: { homeId: string }) {
  return game.getTeam(m.homeId)?.division
}

const EVENT_ICONS: Record<MatchEventType, string> = { gol: '⚽', amarelo: '🟨', vermelho: '🟥', lesao: '🩹', sub: '🔄', 'penalti-perdido': '❌' }

/** Rodada de copa (Copa do Brasil ou Libertadores) reúne clubes de todas as séries: sem abas de divisão. */
const isCup = computed(() => !!match.matches[0] && match.matches[0].competition !== 'league')
const CUP_ICONS: Record<string, string> = { cup: '🏆 ', libertadores: '🌎 ', champions: '⭐ ', worldcup: '🌍 ' }
const cupIcon = computed(() => CUP_ICONS[match.matches[0]?.competition ?? 'cup'] ?? '🏆 ')

/** Jogo do seu clube, em destaque no topo com todos os lances. */
const myMatch = computed(() => match.matches.find((m) => isMine(m)) ?? null)

/** Painel com todos os jogos ao mesmo tempo: uma coluna por série (na Copa, todos juntos). */
const columns = computed(() => {
  if (isCup.value) return [{ key: 'copa', label: null as string | null, division: null as DivisionId | null, matches: match.matches }]
  return (
    LEAGUE_DIVISIONS.map((d) => ({
      key: d,
      label: DIVISION_LABELS[d] as string | null,
      division: d as DivisionId | null,
      matches: match.matches.filter((m) => matchDivision(m) === d),
    }))
      // Liga sem jogos na rodada (folga da Bundesliga) não aparece.
      .filter((col) => col.matches.length > 0)
  )
})

/** Cartões abertos para ver todos os lances (os demais mostram só o resumo). */
const expanded = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

/** Autores dos gols em uma linha: "Pedro 12', Hulk 77' (p)". */
function scorers(m: LiveMatch, teamId: string) {
  return m.events
    .filter((e) => e.type === 'gol' && e.teamId === teamId)
    .map((e) => `${e.playerName.split(' ').slice(-1)[0]} ${clockLabel(e.minute, e.extra)}${e.penalty ? ' (p)' : ''}`)
    .join(', ')
}

const EVENT_DETAILS: Record<MatchEventType, string> = {
  gol: 'gol',
  amarelo: 'cartão amarelo',
  vermelho: 'expulso',
  lesao: 'lesionado',
  sub: 'entra',
  'penalti-perdido': 'perdeu o pênalti',
}

/** Último acontecimento do jogo, para a notificação à direita do cartão. */
function lastEvent(m: LiveMatch) {
  const e = m.events.at(-1)
  if (!e) return null
  let detail = EVENT_DETAILS[e.type]
  if (e.type === 'gol' && e.penalty) detail = 'gol de pênalti'
  if (e.type === 'vermelho' && e.secondYellow) detail = 'expulso (2º amarelo)'
  if (e.type === 'sub' && e.outName) detail = `entra no lugar de ${e.outName}`
  return {
    key: `${m.id}-${m.events.length}`,
    type: e.type,
    icon: EVENT_ICONS[e.type],
    clock: clockLabel(e.minute, e.extra),
    player: e.playerName,
    team: game.getTeam(e.teamId)?.shortName ?? '',
    detail,
  }
}

function redCards(m: LiveMatch, teamId: string) {
  return m.events.filter((e) => e.type === 'vermelho' && e.teamId === teamId).length
}

/** Tempo que o fundo da partida fica na cor de quem marcou. */
const GOAL_FLASH_MS = 800

// Jogo que acabou de ter gol fica por um momento com o fundo na cor primária de quem marcou
// (a borda fica no verde padrão do jogo).
const flashing = ref(new Map<string, { primary: string }>())
const goalCounts = computed(() => Object.fromEntries(match.matches.map((m) => [m.id, m.homeGoals + m.awayGoals])))
const timers = new Map<string, ReturnType<typeof setTimeout>>()
watch(goalCounts, (now, before) => {
  for (const [id, n] of Object.entries(now)) {
    if (!before || n <= (before[id] ?? 0)) continue
    const m = match.matches.find((x) => x.id === id)
    const scorer = m?.events.filter((e) => e.type === 'gol').at(-1)
    const team = scorer && game.getTeam(scorer.teamId)
    if (!team) continue
    flashing.value = new Map(flashing.value).set(id, { primary: team.primaryColor })
    // Gol seguido no mesmo jogo: reinicia o tempo (e troca a cor, se foi do outro time).
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => {
        const next = new Map(flashing.value)
        next.delete(id)
        flashing.value = next
        timers.delete(id)
      }, GOAL_FLASH_MS),
    )
  }
})

/** Estilo do fundo de um jogo enquanto pisca o gol. */
function flashStyle(id: string) {
  const c = flashing.value.get(id)
  return c ? { '--goal-color': c.primary } : undefined
}

function goalsIn(division: DivisionId) {
  return match.matches
    .filter((m) => matchDivision(m) === division)
    .reduce((sum, m) => sum + m.homeGoals + m.awayGoals, 0)
}

function occupancy(venue: MatchVenue) {
  return Math.round((venue.attendance / Math.max(venue.capacity, 1)) * 100)
}

function isMine(m: { homeId: string; awayId: string }) {
  return m.homeId === game.lineupTeamId || m.awayId === game.lineupTeamId
}

/** Situação do relógio de um jogo: acréscimos anunciados ou tempo já encerrado enquanto outros seguem. */
function matchClock(m: LiveMatch) {
  if (match.isFinished) return null
  if (match.halfOverFor(m)) return match.period === 1 ? 'Fim do 1º tempo' : 'Encerrado'
  const added = match.period === 1 ? m.added?.first : m.added?.second
  return added !== undefined && !match.halftime ? `+${added}` : null
}

function finishRound() {
  match.confirmRound()
  router.push({ name: 'dashboard' })
}

// Som a cada gol da partida do seu clube (um por vez, mesmo se sair mais de um gol no mesmo minuto).
const myGoals = computed(() => match.managedMatch?.events.filter((e) => e.type === 'gol') ?? [])
watch(
  () => myGoals.value.length,
  (count, before) => {
    if (count <= before) return
    const last = myGoals.value[count - 1]!
    if (last.teamId === game.lineupTeamId) playGoalFor()
    else playGoalAgainst()
  },
)

onMounted(() => {
  if (match.minute === 0) match.start()
})
onBeforeUnmount(() => {
  match.stop()
  timers.forEach((t) => clearTimeout(t))
})
</script>

<template>
  <div class="matches">
    <section class="card clock">
      <div class="clock__time">
        <span class="minute">{{ clockLabel(match.minute, match.extra) }}</span>
        <span class="muted">{{ match.shootout ? 'Pênaltis' : match.isFinished ? 'Fim de jogo' : match.halftime ? 'Intervalo' : match.injuryBreak ? 'Parado: lesão' : match.penaltyBreak ? 'Pênalti!' : match.running ? 'Bola rolando' : 'Pausado' }}</span>
        <span v-if="match.addedNow !== null && !match.isFinished && !match.halftime" class="added-board" title="Maior acréscimo da rodada: cada jogo tem o seu">
          Acréscimos: até +{{ match.addedNow }}
        </span>
      </div>
      <div class="progress"><div :style="{ width: `${(match.minute / 90) * 100}%` }" /></div>
      <div class="controls">
        <span v-if="match.paused" class="muted">
          {{
            match.halftime
              ? 'Faça as substituições abaixo e comece o 2º tempo.'
              : match.penaltyBreak
                ? 'Pênalti a seu favor: escolha o batedor abaixo.'
                : 'Um jogador se machucou: escolha quem entra abaixo.'
          }}
        </span>
        <span v-else-if="match.shootout && !match.shootout.done" class="muted">Disputa de pênaltis: escolha os batedores abaixo.</span>
        <span v-else-if="match.shootout" class="muted">Disputa encerrada.</span>
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
        <button v-else-if="match.roundComplete" class="btn" @click="finishRound">Finalizar rodada</button>
        <button
          class="btn btn--ghost btn--sm"
          :title="soundMuted ? 'Ligar os sons de gol' : 'Desligar os sons de gol'"
          @click="soundMuted = !soundMuted"
        >
          {{ soundMuted ? '🔇' : '🔊' }}
        </button>
      </div>
    </section>

    <HalftimePanel v-if="match.halftime || match.injuryBreak" :key="match.injuryBreak ? 'lesao-' + match.injuryBreak.minute : 'intervalo'" />
    <PenaltyPanel v-if="match.penaltyBreak || match.shootout" />

    <h2 class="round-title" :class="{ 'round-title--cup': isCup }">{{ isCup ? cupIcon : '' }}{{ game.nextEventLabel }}</h2>

    <section v-if="myMatch" class="match-list">
      <article
        v-for="m in [myMatch]"
        :key="m.id"
        class="card match match--mine"
        :class="{ 'match--flash': flashing.has(m.id) }"
        :style="flashStyle(m.id)"
      >
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
        <p v-if="m.fouls" class="match-stats">
          <span title="Faltas cometidas (mandante x visitante)">Faltas {{ m.fouls.home }} x {{ m.fouls.away }}</span>
          <span v-if="m.added?.first !== undefined" class="muted" title="Acréscimos de cada tempo">
            · Acréscimos: 1º +{{ m.added.first }}<template v-if="m.added.second !== undefined"> · 2º +{{ m.added.second }}</template>
          </span>
          <span v-if="matchClock(m)" class="match-clock">{{ matchClock(m) }}</span>
        </p>
        <div v-if="m.shootout?.length" class="shootout-line" title="Disputa de pênaltis">
          <span v-for="side in [m.homeId, m.awayId]" :key="side" class="shootout-line__side">
            <span v-for="(k, i) in m.shootout.filter((x) => x.teamId === side)" :key="i" :class="k.scored ? 'good' : 'bad'" :title="k.playerName">
              {{ k.scored ? '●' : '○' }}
            </span>
          </span>
        </div>
        <ul v-if="m.events.length" class="events">
          <li v-for="(e, i) in m.events" :key="i" :class="e.teamId === m.homeId ? 'home' : 'away'">
            {{ EVENT_ICONS[e.type] }} {{ clockLabel(e.minute, e.extra) }} {{ e.playerName }}<StarMark :star="e.star" />
            <small v-if="e.type === 'gol' && e.penalty" class="muted"> (pênalti)</small>
            <small v-else-if="e.type === 'penalti-perdido'" class="muted"> perdeu o pênalti{{ e.savedBy ? ` (defesa de ${e.savedBy})` : ' (para fora)' }}</small>
            <small v-else-if="e.type === 'vermelho' && e.secondYellow" class="muted"> (2º amarelo)</small>
            <small v-else-if="e.type === 'lesao'" class="muted"> (fora {{ e.games }} jogo{{ (e.games ?? 1) > 1 ? 's' : '' }})</small>
            <small v-else-if="e.type === 'sub'" class="muted"> {{ e.replacesInjured ? `(no lugar de ${e.outName}, lesionado)` : e.outName ? `(sai ${e.outName})` : '(vaga de lesionado)' }}</small>
          </li>
        </ul>
      </article>
    </section>

    <!-- Todos os jogos numa coluna só: cada cartão largo traz estádio, placar e o último lance. -->
    <section class="board">
      <div v-for="col in columns" :key="col.key" class="board__col">
        <h3 v-if="col.label && col.division" class="board__title" :class="{ 'board__title--mine': col.division === game.managedDivision }">
          {{ col.label }}
          <span v-if="col.division === game.managedDivision" title="Sua divisão">★</span>
          <span class="goals" :title="`${goalsIn(col.division)} gols nesta rodada`">⚽ {{ goalsIn(col.division) }}</span>
        </h3>
        <div class="board__list">
          <article
            v-for="m in col.matches"
            :key="m.id"
            class="wide"
            :class="{ 'wide--mine': isMine(m), 'wide--flash': flashing.has(m.id) }"
            :style="flashStyle(m.id)"
            :title="expanded.has(m.id) ? 'Clique para recolher' : 'Clique para ver os lances'"
            @click="toggle(m.id)"
          >
            <div class="wide__venue">
              <template v-if="m.venue">
                <span class="wide__stadium" :title="m.venue.name">🏟️ {{ m.venue.name }}</span>
                <span class="muted" :title="`Capacidade: ${m.venue.capacity.toLocaleString('pt-BR')} lugares`">
                  {{ m.venue.attendance.toLocaleString('pt-BR') }} torcedores
                  <span v-if="occupancy(m.venue) >= 100" class="sold-out">lotado</span>
                  <template v-else>({{ occupancy(m.venue) }}%)</template>
                </span>
              </template>
            </div>

            <div class="wide__game">
              <div class="wide__row">
                <span class="wide__team" :title="game.getTeam(m.homeId)?.name">{{ game.getTeam(m.homeId)?.name }}</span>
                <TeamBadge :team="game.getTeam(m.homeId)!" :size="24" />
                <strong class="wide__score">{{ m.homeGoals }}<span class="muted">-</span>{{ m.awayGoals }}</strong>
                <TeamBadge :team="game.getTeam(m.awayId)!" :size="24" />
                <span class="wide__team wide__team--away" :title="game.getTeam(m.awayId)?.name">{{ game.getTeam(m.awayId)?.name }}</span>
              </div>
              <div class="wide__meta">
                <span class="wide__scorers wide__scorers--home">
                  <span v-if="redCards(m, m.homeId)" class="red">🟥{{ redCards(m, m.homeId) > 1 ? redCards(m, m.homeId) : '' }}</span>
                  {{ scorers(m, m.homeId) }}
                </span>
                <span class="wide__center">
                  <span v-if="m.penalties" class="pens">pên. {{ m.penalties.home }}-{{ m.penalties.away }}</span>
                  <span v-else-if="matchClock(m)" class="match-clock">{{ matchClock(m) }}</span>
                </span>
                <span class="wide__scorers">
                  {{ scorers(m, m.awayId) }}
                  <span v-if="redCards(m, m.awayId)" class="red">🟥{{ redCards(m, m.awayId) > 1 ? redCards(m, m.awayId) : '' }}</span>
                </span>
              </div>
            </div>

            <div class="wide__last">
              <!-- A chave muda a cada lance novo: a notificação reaparece com uma animação curta. -->
              <span v-if="lastEvent(m)" :key="lastEvent(m)!.key" class="notice" :class="`notice--${lastEvent(m)!.type}`">
                <span class="notice__icon">{{ lastEvent(m)!.icon }}</span>
                <span class="notice__text">
                  <strong>{{ lastEvent(m)!.clock }} {{ lastEvent(m)!.player }}</strong>
                  <small>{{ lastEvent(m)!.detail }} · {{ lastEvent(m)!.team }}</small>
                </span>
              </span>
              <span v-else class="notice notice--empty muted">Sem lances ainda</span>
            </div>

            <ul v-if="expanded.has(m.id) && m.events.length" class="events events--mini">
              <li v-for="(e, i) in m.events" :key="i" :class="e.teamId === m.homeId ? 'home' : 'away'">
                {{ EVENT_ICONS[e.type] }} {{ clockLabel(e.minute, e.extra) }} {{ e.playerName }}
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.matches {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.clock {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
  padding: 0.6rem 1.1rem;
}
.clock__time {
  display: flex;
  flex-direction: column;
  min-width: 110px;
}
.shootout-line {
  display: flex;
  justify-content: space-between;
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  letter-spacing: 1px;
}
.shootout-line .good {
  color: var(--good);
}
.shootout-line .bad {
  color: var(--bad);
}
.added-board {
  align-self: flex-start;
  margin-top: 0.2rem;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  background: var(--warn);
  color: #1a1200;
  font-size: 0.75rem;
  font-weight: 700;
}
.match-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.match-clock {
  margin-left: auto;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--warn);
  font-weight: 700;
}
.minute {
  font-size: 1.9rem;
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
  flex-wrap: wrap;
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
.goals {
  margin-left: 0.35rem;
  font-size: 0.75rem;
  opacity: 0.8;
}
.match-list {
  display: grid;
}
.match--mine {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  padding: 0.6rem 1rem;
  transition: background-color 0.4s;
}
.match--mine .events {
  max-height: 5.2rem;
  overflow-y: auto;
}

/* Painel com todos os jogos: uma coluna só, as séries uma embaixo da outra. */
.board {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.board__title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.board__title--mine {
  color: var(--accent);
}
.board__title .goals {
  margin-left: auto;
  text-transform: none;
}
.board__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

/* Cartão largo: estádio à esquerda, jogo no centro, último lance à direita. */
.wide {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 0.82rem;
  transition: border-color 0.2s, background-color 0.4s;
}
.wide:hover {
  border-color: var(--muted);
}
.wide--mine {
  border-color: var(--accent);
}
/* Gol: fundo na cor primária de quem marcou, misturada ao fundo para o texto continuar legível. */
.wide--flash,
.match--flash {
  background: color-mix(in srgb, var(--goal-color) 30%, var(--surface));
  border-color: var(--accent);
  /* Só a borda de 1px (sem o anel extra que a deixava grossa) e um brilho leve na cor do time. */
  box-shadow: 0 0 14px color-mix(in srgb, var(--goal-color) 40%, transparent);
  transition: none;
}
.wide--flash .wide__team,
.wide--flash .wide__score,
.match--flash .team-name,
.match--flash .score {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
.wide__venue {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.3;
}
.wide__venue > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wide__stadium {
  font-weight: 600;
}
.wide__game {
  min-width: 0;
}
.wide__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr);
  align-items: center;
  gap: 0.4rem;
}
.wide__team {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-weight: 600;
}
.wide__team--away {
  text-align: left;
}
.wide__score {
  min-width: 2.8rem;
  text-align: center;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}
.wide__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 0.4rem;
  min-height: 1rem;
  font-size: 0.68rem;
  color: var(--muted);
}
.wide__scorers {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wide__scorers--home {
  text-align: right;
}
.wide__center {
  text-align: center;
}
.wide__center .match-clock {
  margin-left: 0;
}
.wide__last {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}
/* Notificação do último lance; a cor da borda indica o tipo. */
.notice {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border-left: 3px solid var(--border);
  background: var(--surface-2);
  animation: notice-in 0.6s ease-out;
}
.notice--gol {
  border-left-color: var(--good);
}
.notice--amarelo {
  border-left-color: var(--warn);
}
.notice--vermelho,
.notice--penalti-perdido {
  border-left-color: var(--bad);
}
.notice--lesao {
  border-left-color: #f97316;
}
.notice--sub {
  border-left-color: #60a5fa;
}
.notice--empty {
  border-left-color: transparent;
  background: transparent;
  font-size: 0.72rem;
  animation: none;
}
.notice__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}
.notice__text strong,
.notice__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice__text strong {
  font-size: 0.75rem;
}
.notice__text small {
  font-size: 0.68rem;
  color: var(--muted);
}
@keyframes notice-in {
  from {
    opacity: 0;
    transform: translateX(8px);
    background: var(--accent-soft);
  }
}
.pens {
  color: var(--warn);
  font-weight: 700;
}
.red {
  font-size: 0.6rem;
}
.events--mini {
  grid-column: 1 / -1;
  margin-top: 0.2rem;
  padding-top: 0.3rem;
  font-size: 0.72rem;
}
/* Telas estreitas: o placar fica em cima; estádio e último lance embaixo, lado a lado. */
@media (max-width: 760px) {
  .wide {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .wide__game {
    grid-column: 1 / -1;
    grid-row: 1;
  }
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
  font-size: 2rem;
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
