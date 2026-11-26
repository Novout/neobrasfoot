<script setup lang="ts">
import { computed } from 'vue'
import CountryTag from '../components/CountryTag.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { CHAMPIONS_NAME } from '../data/champions'
import { CLUB_WORLD_CUP_NAME, CLUB_WORLD_CUP_PRIZES, GUEST_CLUBS } from '../data/clubWorldCup'
import { formatDate } from '../data/calendar'
import { LIBERTADORES_NAME } from '../data/libertadores'
import { useGameStore } from '../stores/game'
import type { CupTie } from '../types/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()

const cwc = computed(() => game.clubWorldCup)
const myId = computed(() => game.managedTeamId)

/** Os 4 participantes: campeões continentais (quando conhecidos) e os convidados. */
const entrants = computed(() => {
  const w = cwc.value
  if (!w) return []
  const region = (id: string) => GUEST_CLUBS.find((c) => c.id === id)?.region
  return [
    { label: `Campeão da ${LIBERTADORES_NAME}`, id: game.libertadores?.championId ?? null },
    { label: `Campeão da ${CHAMPIONS_NAME}`, id: game.champions?.championId ?? null },
    ...w.guests.map((id) => ({ label: region(id) === 'asia' ? 'Convidado da Arábia Saudita' : 'Convidado da África', id })),
  ]
})

/** Semifinais e final (as futuras ficam "a definir"). */
const columns = computed(() => {
  const w = cwc.value
  if (!w) return []
  return [
    { name: 'Semifinal', ties: w.rounds[0]?.ties ?? null, count: 2, index: 0 },
    { name: 'Final', ties: w.rounds[1]?.ties ?? null, count: 1, index: 1 },
  ].map((c) => ({ ...c, isCurrent: !game.clubWorldFinished && w.rounds.length > 0 && w.currentRound === c.index }))
})

/** Data de cada etapa no calendário da temporada. */
function stageDate(index: number) {
  return game.calendar.find((e) => e.kind === 'clubworld' && e.index === index)?.date ?? null
}

const status = computed(() => {
  const s = game.managedClubWorldStatus
  if (!s) {
    return {
      tone: 'muted',
      text: `Para jogar o ${CLUB_WORLD_CUP_NAME}, seu clube precisa ser campeão da ${LIBERTADORES_NAME} ou da ${CHAMPIONS_NAME}. Os jogos sem o seu clube são simulados sozinhos.`,
    }
  }
  if (s.state === 'champion') return { tone: 'good', text: `🏆 Seu time é campeão do ${CLUB_WORLD_CUP_NAME}!` }
  if (s.state === 'eliminated') return { tone: 'bad', text: `Seu time foi eliminado na ${s.roundName.toLowerCase()}.` }
  return { tone: 'accent', text: `Seu time está no ${CLUB_WORLD_CUP_NAME}. Próxima etapa: ${s.roundName}.` }
})

const prizes = [
  { label: 'Participação', value: CLUB_WORLD_CUP_PRIZES.entry },
  { label: 'Vencer a semifinal', value: CLUB_WORLD_CUP_PRIZES.semifinal },
  { label: 'Título', value: CLUB_WORLD_CUP_PRIZES.title },
  { label: 'Vice-campeão', value: CLUB_WORLD_CUP_PRIZES.runnerUp },
]

function sideClass(tie: CupTie, teamId: string) {
  return {
    winner: tie.winnerId === teamId,
    loser: tie.winnerId !== null && tie.winnerId !== teamId,
    mine: teamId === myId.value,
  }
}
const isMine = (tie: CupTie) => tie.homeId === myId.value || tie.awayId === myId.value
</script>

<template>
  <div v-if="cwc" class="cwc">
    <section class="card cwc__header">
      <div>
        <h1>🌐 {{ CLUB_WORLD_CUP_NAME }} {{ game.currentYear }}</h1>
        <p class="muted">
          Em dezembro, depois do campeonato: os campeões da {{ LIBERTADORES_NAME }} e da {{ CHAMPIONS_NAME }}, um clube da Arábia
          Saudita e um da África. Semifinais e final em jogo único; empate vai para os pênaltis.
        </p>
        <p :class="status.tone"><strong>{{ status.text }}</strong></p>
        <p v-if="!cwc.rounds.length" class="muted small">As semifinais são sorteadas quando os dois campeões continentais forem conhecidos.</p>
        <p v-if="cwc.championId" class="champion">
          Campeão do mundo: <TeamBadge :team="game.getTeam(cwc.championId)!" :size="28" />
          <strong>{{ game.getTeam(cwc.championId)?.name }}</strong> <CountryTag :team="game.getTeam(cwc.championId)" />
        </p>
      </div>
      <table class="prizes">
        <thead>
          <tr><th>Premiação</th><th class="num">Valor</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in prizes" :key="p.label">
            <td>{{ p.label }}</td>
            <td class="num">{{ formatMoney(p.value) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="entrants">
      <article v-for="e in entrants" :key="e.label" class="card entrant" :class="{ 'entrant--mine': e.id && e.id === myId }">
        <small class="muted">{{ e.label }}</small>
        <template v-if="e.id && game.getTeam(e.id)">
          <div class="entrant__team">
            <TeamBadge :team="game.getTeam(e.id)!" :size="36" />
            <strong>{{ game.getTeam(e.id)?.name }}</strong>
            <CountryTag :team="game.getTeam(e.id)" />
          </div>
          <small class="muted">
            {{ game.getTeam(e.id)?.stadiumName }}
            <template v-if="game.getTeam(e.id)?.managerName"> · técnico {{ game.getTeam(e.id)?.managerName }}</template>
          </small>
        </template>
        <span v-else class="muted">A definir</span>
      </article>
    </section>

    <section class="bracket">
      <div v-for="col in columns" :key="col.name" class="bracket__col" :class="{ current: col.isCurrent }">
        <header>
          <strong>{{ col.name }}</strong>
          <small v-if="stageDate(col.index)" class="muted">{{ formatDate(stageDate(col.index)!) }}</small>
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
                  <TeamBadge v-if="team" :team="team" :size="22" />
                  <span class="tie__name">{{ team?.name }} <CountryTag :team="team" /></span>
                  <span class="tie__score">
                    {{ side === 'home' ? (tie.homeGoals ?? '') : (tie.awayGoals ?? '') }}
                    <small v-if="tie.penalties" class="muted">({{ side === 'home' ? tie.penalties.home : tie.penalties.away }})</small>
                  </span>
                </template>
              </div>
            </article>
          </template>
          <template v-else>
            <article v-for="i in col.count" :key="i" class="tie tie--empty">
              <div class="tie__side muted">A definir</div>
              <div class="tie__side muted">A definir</div>
            </article>
          </template>
        </div>
      </div>
    </section>
  </div>
  <section v-else class="card">
    <h1>🌐 {{ CLUB_WORLD_CUP_NAME }}</h1>
    <p class="muted">
      O {{ CLUB_WORLD_CUP_NAME }} só existe em carreiras com a {{ LIBERTADORES_NAME }} e a {{ CHAMPIONS_NAME }} (formato 2 séries × 20
      clubes).
    </p>
  </section>
</template>

<style scoped>
.cwc {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.cwc__header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.cwc__header > div {
  flex: 1;
  min-width: 260px;
}
.cwc__header h1 {
  margin-bottom: 0.25rem;
}
.cwc__header p {
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
  min-width: 260px;
  font-size: 0.85rem;
}
.entrants {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.entrant {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
}
.entrant--mine {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.entrant__team {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.bracket {
  display: grid;
  grid-template-columns: repeat(2, minmax(200px, 1fr));
  gap: 0.75rem;
}
.bracket__col {
  display: flex;
  flex-direction: column;
}
.bracket__col header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
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
  gap: 0.5rem;
}
.tie {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.88rem;
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
  gap: 0.45rem;
  padding: 0.35rem 0.55rem;
  min-height: 2rem;
}
.tie__side + .tie__side {
  border-top: 1px solid var(--border);
}
.tie__name {
  flex: 1;
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
@media (max-width: 560px) {
  .bracket {
    grid-template-columns: 1fr;
  }
}
</style>
