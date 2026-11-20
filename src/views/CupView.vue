<script setup lang="ts">
import { computed } from 'vue'
import TeamBadge from '../components/TeamBadge.vue'
import { CUP_NAME, CUP_PRIZES, CUP_RUNNER_UP_PRIZE, CUP_SCHEDULE, inRound, roundName } from '../data/cup'
import { DIVISION_LABELS } from '../data/divisions'
import { useGameStore } from '../stores/game'
import type { CupTie } from '../types/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()

const cup = computed(() => game.cup)

/** Fases já sorteadas + fases futuras ainda vazias, para desenhar a chave completa. */
const columns = computed(() => {
  const c = cup.value
  if (!c) return []
  const firstTies = c.rounds[0]?.ties.length ?? 16
  const total = Math.log2(firstTies) + 1
  return Array.from({ length: total }, (_, i) => {
    const tieCount = firstTies / 2 ** i
    const drawn = c.rounds[i]
    return {
      index: i,
      name: drawn?.name ?? roundName(tieCount),
      ties: drawn?.ties ?? null,
      tieCount,
      afterLeagueRound: c.schedule[i] ?? CUP_SCHEDULE[i],
      isCurrent: !game.cupFinished && i === c.currentRound,
    }
  })
})

const status = computed(() => {
  const s = game.managedCupStatus
  if (!s) return null
  if (s.state === 'champion') return { tone: 'good', text: '🏆 Seu time é o campeão da Copa!' }
  if (s.state === 'eliminated') return { tone: 'bad', text: `Seu time foi eliminado ${inRound(s.roundName)}.` }
  return { tone: 'accent', text: `Seu time segue vivo. Próxima fase: ${s.roundName}.` }
})

const nextPhaseInfo = computed(() => {
  const c = cup.value
  if (!c || game.cupFinished) return null
  const after = c.schedule[c.currentRound]!
  if (game.nextEvent === 'cup') return 'A próxima partida é desta fase da Copa.'
  return `Próxima fase depois da rodada ${after} do campeonato (faltam ${after - game.round} rodada(s)).`
})

function isMine(tie: CupTie) {
  return tie.homeId === game.managedTeamId || tie.awayId === game.managedTeamId
}

function sideClass(tie: CupTie, teamId: string) {
  return {
    winner: tie.winnerId === teamId,
    loser: tie.winnerId !== null && tie.winnerId !== teamId,
    mine: teamId === game.managedTeamId,
  }
}

const prizes = computed(() =>
  columns.value.map((col, i) => ({
    name: col.name,
    value: CUP_PRIZES[i] ?? 0,
    label: i === columns.value.length - 1 ? 'Título' : `Vencer ${inRound(col.name)}`,
  })),
)
</script>

<template>
  <div v-if="cup" class="cup">
    <section class="card cup__header">
      <div>
        <h1>🏆 {{ CUP_NAME }} {{ cup.season }}</h1>
        <p class="muted">Mata-mata em jogo único com os 32 clubes. Empate vai para os pênaltis.</p>
        <p v-if="status" :class="status.tone"><strong>{{ status.text }}</strong></p>
        <p v-if="nextPhaseInfo" class="muted small">{{ nextPhaseInfo }}</p>
        <p v-if="cup.championId" class="champion">
          Campeão: <TeamBadge :team="game.getTeam(cup.championId)!" :size="28" />
          <strong>{{ game.getTeam(cup.championId)?.name }}</strong>
        </p>
      </div>
      <table class="prizes">
        <thead>
          <tr><th>Premiação</th><th class="num">Valor</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in prizes" :key="p.name">
            <td>{{ p.label }}</td>
            <td class="num">{{ formatMoney(p.value) }}</td>
          </tr>
          <tr>
            <td>Vice-campeão</td>
            <td class="num">{{ formatMoney(CUP_RUNNER_UP_PRIZE) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="bracket">
      <div v-for="col in columns" :key="col.index" class="bracket__col" :class="{ current: col.isCurrent }">
        <header>
          <strong>{{ col.name }}</strong>
          <small class="muted">após a rodada {{ col.afterLeagueRound }}</small>
        </header>
        <div class="bracket__ties">
          <template v-if="col.ties">
            <article v-for="(tie, i) in col.ties" :key="i" class="tie" :class="{ 'tie--mine': isMine(tie) }">
              <div v-for="side in (['home', 'away'] as const)" :key="side" class="tie__side" :class="sideClass(tie, side === 'home' ? tie.homeId : tie.awayId)">
                <template v-for="team in [game.getTeam(side === 'home' ? tie.homeId : tie.awayId)]" :key="team?.id">
                  <TeamBadge v-if="team" :team="team" :size="20" />
                  <span class="tie__name" :title="team ? `${team.name} · ${DIVISION_LABELS[team.division]}` : ''">
                    {{ team?.shortName }}<small class="muted division">{{ team?.division }}</small>
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
.cup {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.cup__header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.cup__header h1 {
  margin-bottom: 0.25rem;
}
.cup__header p {
  margin: 0.35rem 0;
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
.accent {
  color: var(--accent);
}
.champion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.prizes {
  width: auto;
  min-width: 280px;
  font-size: 0.85rem;
}
.bracket {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
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
.division {
  margin-left: 0.3rem;
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
