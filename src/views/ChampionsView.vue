<script setup lang="ts">
import { computed } from 'vue'
import CountryTag from '../components/CountryTag.vue'
import TeamBadge from '../components/TeamBadge.vue'
import TournamentBoard from '../components/TournamentBoard.vue'
import { CHAMPIONS_NAME, CHAMPIONS_PRIZES, CHAMPIONS_SPOTS_PER_LEAGUE } from '../data/champions'
import { inRound, roundName } from '../data/cup'
import { DIVISION_LABELS, isForeignDivision } from '../data/divisions'
import { GROUP_QUALIFIERS, groupOf, stageName } from '../data/libertadores'
import { useGameStore } from '../stores/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()

const ucl = computed(() => game.champions)
const myId = computed(() => game.managedTeamId)
const myGroup = computed(() => (ucl.value && myId.value ? groupOf(ucl.value, myId.value) : null))

const status = computed(() => {
  const s = game.managedChampionsStatus
  if (s.state === 'champion') return { tone: 'good', text: `🏆 Seu time é o campeão da ${CHAMPIONS_NAME}!` }
  if (s.state === 'eliminated') return { tone: 'bad', text: `Seu time foi eliminado ${inRound(s.stageName)}.` }
  const team = game.managedTeam
  if (s.state === 'absent' && team && isForeignDivision(team.division)) {
    return {
      tone: 'muted',
      text: `Seu time não disputa a ${CHAMPIONS_NAME} nesta temporada. Termine entre os ${CHAMPIONS_SPOTS_PER_LEAGUE} primeiros da ${DIVISION_LABELS[team.division]} para se classificar.`,
    }
  }
  if (s.state === 'absent') {
    return { tone: 'muted', text: `A ${CHAMPIONS_NAME} é dos clubes europeus: clubes brasileiros disputam a Libertadores.` }
  }
  return { tone: 'accent', text: `Seu time está no Grupo ${myGroup.value?.name} e segue vivo. Próxima etapa: ${s.stageName}.` }
})

const nextInfo = computed(() => {
  const l = ucl.value
  if (!l || game.championsFinished) return null
  if (game.nextEvent === 'champions') return `A próxima partida é da ${CHAMPIONS_NAME}: ${stageName(l.stage)}.`
  const after = l.schedule[l.stage]!
  return `${stageName(l.stage)} depois da rodada ${after} do campeonato (faltam ${Math.max(0, after - game.round)} rodada(s)).`
})

const prizes = computed(() => [
  { label: 'Disputar a fase de grupos', value: CHAMPIONS_PRIZES.entry },
  { label: 'Vitória / empate nos grupos', value: null, text: `${formatMoney(CHAMPIONS_PRIZES.groupWin)} / ${formatMoney(CHAMPIONS_PRIZES.groupDraw)}` },
  ...CHAMPIONS_PRIZES.knockout.map((value, i) => {
    const name = roundName(2 ** (3 - i))
    return { label: i === 3 ? 'Título' : `Vencer ${inRound(name)}`, value }
  }),
  { label: 'Vice-campeão', value: CHAMPIONS_PRIZES.runnerUp },
])
</script>

<template>
  <div v-if="ucl" class="ucl">
    <section class="card ucl__header">
      <div>
        <h1>⭐ {{ CHAMPIONS_NAME }} {{ game.currentYear }}</h1>
        <p class="muted">
          32 clubes: os {{ CHAMPIONS_SPOTS_PER_LEAGUE }} primeiros da La Liga, da Premier League e da Bundesliga e 20 clubes de outras
          ligas da Europa. Fase de grupos em turno e returno (passam os {{ GROUP_QUALIFIERS }} primeiros de cada grupo) e depois
          mata-mata em jogo único até a final; empate vai para os pênaltis.
        </p>
        <p :class="status.tone"><strong>{{ status.text }}</strong></p>
        <p v-if="nextInfo" class="muted small">{{ nextInfo }}</p>
        <p v-if="status.tone === 'muted'" class="muted small">
          Os jogos sem o seu time são simulados automaticamente quando a data chega.
        </p>
        <p v-if="ucl.championId" class="champion">
          Campeão: <TeamBadge :team="game.getTeam(ucl.championId)!" :size="28" />
          <strong>{{ game.getTeam(ucl.championId)?.name }}</strong> <CountryTag :team="game.getTeam(ucl.championId)" />
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

    <TournamentBoard :state="ucl" :my-id="myId" :finished="game.championsFinished" />
  </div>
  <section v-else class="card">
    <h1>⭐ {{ CHAMPIONS_NAME }}</h1>
    <p class="muted">A {{ CHAMPIONS_NAME }} só existe em carreiras com as ligas europeias (formato 2 séries × 20 clubes).</p>
  </section>
</template>

<style scoped>
.ucl {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.ucl__header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.ucl__header > div {
  flex: 1;
  min-width: 260px;
}
.ucl__header h1 {
  margin-bottom: 0.25rem;
}
.ucl__header p {
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
</style>
