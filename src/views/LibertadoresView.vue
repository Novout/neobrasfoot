<script setup lang="ts">
import { computed, ref } from 'vue'
import CountryTag from '../components/CountryTag.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { inRound, roundName } from '../data/cup'
import {
  BRAZIL_SPOTS, COUNTRY_NAMES, countryOf, GROUP_QUALIFIERS, GROUP_ROUNDS, groupOf, groupTable, LIBERTADORES_NAME, LIBERTADORES_PRIZES,
  STAGE_COUNT, stageName,
} from '../data/libertadores'
import { useGameStore } from '../stores/game'
import type { CupTie } from '../types/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()

const lib = computed(() => game.libertadores)
const myId = computed(() => game.managedTeamId)
const myGroup = computed(() => (lib.value && myId.value ? groupOf(lib.value, myId.value) : null))

const groups = computed(() => {
  const l = lib.value
  if (!l) return []
  return l.groups.map((g, i) => ({
    ...g,
    table: groupTable(l, i),
    mine: g === myGroup.value,
    // Jogos do grupo, rodada a rodada.
    rounds: l.groupRounds.map((ties) => ties.filter((t) => g.teamIds.includes(t.homeId))),
  }))
})

/** Grupos abertos para ver os jogos (o do seu clube começa aberto). */
const openGroups = ref(new Set<string>(myGroup.value ? [myGroup.value.name] : []))
const isOpen = (name: string) => openGroups.value.has(name)
function toggle(name: string) {
  const next = new Set(openGroups.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  openGroups.value = next
}

/** Mata-mata: fases sorteadas e futuras (vazias) para desenhar a chave completa. */
const bracket = computed(() => {
  const l = lib.value
  if (!l) return []
  return Array.from({ length: STAGE_COUNT - GROUP_ROUNDS }, (_, i) => {
    const stage = GROUP_ROUNDS + i
    const tieCount = 2 ** (STAGE_COUNT - 1 - stage)
    return {
      stage,
      name: roundName(tieCount),
      tieCount,
      ties: l.knockout[i]?.ties ?? null,
      afterLeagueRound: l.schedule[stage],
      isCurrent: !game.libertadoresFinished && l.stage === stage,
    }
  })
})

const status = computed(() => {
  const s = game.managedLibertadoresStatus
  if (s.state === 'champion') return { tone: 'good', text: `🏆 Seu time é o campeão da ${LIBERTADORES_NAME}!` }
  if (s.state === 'eliminated') return { tone: 'bad', text: `Seu time foi eliminado ${inRound(s.stageName)}.` }
  if (s.state === 'absent') {
    return {
      tone: 'muted',
      text: `Seu time não disputa a ${LIBERTADORES_NAME} nesta temporada. Termine entre os ${BRAZIL_SPOTS} primeiros da Série A para se classificar.`,
    }
  }
  return { tone: 'accent', text: `Seu time está no Grupo ${myGroup.value?.name} e segue vivo. Próxima etapa: ${s.stageName}.` }
})

const nextInfo = computed(() => {
  const l = lib.value
  if (!l || game.libertadoresFinished) return null
  if (game.nextEvent === 'libertadores') return `A próxima partida é da ${LIBERTADORES_NAME}: ${stageName(l.stage)}.`
  const after = l.schedule[l.stage]!
  return `${stageName(l.stage)} depois da rodada ${after} do campeonato (faltam ${Math.max(0, after - game.round)} rodada(s)).`
})

const prizes = computed(() => [
  { label: 'Disputar a fase de grupos', value: LIBERTADORES_PRIZES.entry },
  { label: 'Vitória / empate nos grupos', value: null, text: `${formatMoney(LIBERTADORES_PRIZES.groupWin)} / ${formatMoney(LIBERTADORES_PRIZES.groupDraw)}` },
  ...LIBERTADORES_PRIZES.knockout.map((value, i) => {
    const name = roundName(2 ** (3 - i))
    return { label: i === 3 ? 'Título' : `Vencer ${inRound(name)}`, value }
  }),
  { label: 'Vice-campeão', value: LIBERTADORES_PRIZES.runnerUp },
])

function teamLabel(id: string) {
  const t = game.getTeam(id)
  return t ? `${t.name} · ${COUNTRY_NAMES[countryOf(t)]}` : ''
}

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
  <div v-if="lib" class="lib">
    <section class="card lib__header">
      <div>
        <h1>🌎 {{ LIBERTADORES_NAME }} {{ game.currentYear }}</h1>
        <p class="muted">
          32 clubes: os {{ BRAZIL_SPOTS }} primeiros da Série A e 28 clubes do continente. Fase de grupos em turno e returno
          (passam os {{ GROUP_QUALIFIERS }} primeiros de cada grupo) e depois mata-mata em jogo único até a final; empate vai para os pênaltis.
        </p>
        <p :class="status.tone"><strong>{{ status.text }}</strong></p>
        <p v-if="nextInfo" class="muted small">{{ nextInfo }}</p>
        <p v-if="status.tone === 'muted'" class="muted small">
          Os jogos sem o seu time são simulados automaticamente quando a data chega.
        </p>
        <p v-if="lib.championId" class="champion">
          Campeão: <TeamBadge :team="game.getTeam(lib.championId)!" :size="28" />
          <strong>{{ game.getTeam(lib.championId)?.name }}</strong> <CountryTag :team="game.getTeam(lib.championId)" />
        </p>
      </div>
      <table class="prizes">
        <thead>
          <tr><th>Premiação</th><th class="num">Valor</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in prizes" :key="p.label">
            <td>{{ p.label }}</td>
            <td class="num">{{ p.value !== null ? formatMoney(p.value) : p.text }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <h2 class="section-title">
      Fase de grupos
      <small class="muted">rodadas após as rodadas {{ lib.schedule.slice(0, GROUP_ROUNDS).join(', ') }} do campeonato</small>
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
              <th>#</th><th>Clube</th><th class="num">J</th><th class="num">V</th><th class="num">E</th><th class="num">D</th>
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
          <li v-for="(ties, r) in g.rounds" :key="r" :class="{ current: lib.stage === r && !game.libertadoresFinished }">
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
.lib {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.lib__header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.lib__header > div {
  flex: 1;
  min-width: 260px;
}
.lib__header h1 {
  margin-bottom: 0.25rem;
}
.lib__header p {
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
