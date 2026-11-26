<script setup lang="ts">
import { computed } from 'vue'
import CountryTag from '../components/CountryTag.vue'
import TeamBadge from '../components/TeamBadge.vue'
import TournamentBoard from '../components/TournamentBoard.vue'
import { inRound, roundName } from '../data/cup'
import { DIVISION_LABELS, isForeignDivision } from '../data/divisions'
import { BRAZIL_SPOTS, GROUP_QUALIFIERS, groupOf, LIBERTADORES_NAME, LIBERTADORES_PRIZES, stageName } from '../data/libertadores'
import { useGameStore } from '../stores/game'
import { formatMoney } from '../utils/random'

const game = useGameStore()

const lib = computed(() => game.libertadores)
const myId = computed(() => game.managedTeamId)
const myGroup = computed(() => (lib.value && myId.value ? groupOf(lib.value, myId.value) : null))

const status = computed(() => {
  const s = game.managedLibertadoresStatus
  if (s.state === 'champion') return { tone: 'good', text: `🏆 Seu time é o campeão da ${LIBERTADORES_NAME}!` }
  if (s.state === 'eliminated') return { tone: 'bad', text: `Seu time foi eliminado ${inRound(s.stageName)}.` }
  if (s.state === 'absent' && game.managedTeam && isForeignDivision(game.managedTeam.division)) {
    return { tone: 'muted', text: `Clubes da ${DIVISION_LABELS[game.managedTeam.division]} não disputam a ${LIBERTADORES_NAME}.` }
  }
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

    <TournamentBoard :state="lib" :my-id="myId" :finished="game.libertadoresFinished" />
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
</style>
