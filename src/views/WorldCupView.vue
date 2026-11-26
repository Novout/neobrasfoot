<script setup lang="ts">
import { computed, ref } from 'vue'
import CountryTag from '../components/CountryTag.vue'
import TeamBadge from '../components/TeamBadge.vue'
import TournamentBoard from '../components/TournamentBoard.vue'
import { inRound } from '../data/cup'
import { stageName } from '../data/libertadores'
import {
  CONFEDERATION_LABELS, confederationOf, nextWorldCupYear, WORLD_CUP_GROUP_ROUNDS, WORLD_CUP_NAME,
} from '../data/worldCup'
import { useGameStore } from '../stores/game'

const game = useGameStore()

const wc = computed(() => game.worldCup)
const job = computed(() => game.nationalJob)
const jobTeam = computed(() => (job.value ? game.getTeam(job.value.teamId) : null))
const offers = computed(() => game.nationalOffers.map((id) => game.getTeam(id)).filter((t) => !!t))

/** Próxima Copa (quando não é ano de Copa). */
const nextYear = computed(() => nextWorldCupYear(game.currentYear + 1))

const message = ref<string | null>(null)
function accept(teamId: string) {
  message.value = game.acceptNationalJob(teamId)
}

const status = computed(() => {
  const s = game.nationalJobStatus
  const name = jobTeam.value?.name
  if (!s || !name) return null
  if (s.state === 'champion') return { tone: 'good', text: `🏆 O ${name} é campeão do mundo com você!` }
  if (s.state === 'eliminated') return { tone: 'bad', text: `O ${name} foi eliminado ${inRound(s.stageName)}.` }
  return { tone: 'accent', text: `Você treina o ${name} nesta Copa. Próxima etapa: ${s.stageName}.` }
})

const nextInfo = computed(() => {
  const w = wc.value
  if (!w || game.worldCupFinished) return null
  const label = stageName(w.stage, WORLD_CUP_GROUP_ROUNDS)
  if (game.nextEvent === 'worldcup') return `O próximo jogo é da ${WORLD_CUP_NAME}: ${label}.`
  const after = w.schedule[w.stage]!
  return `${label} depois da rodada ${after} do campeonato (faltam ${Math.max(0, after - game.round)} rodada(s)).`
})

function squadAverage(teamId: string) {
  const players = game.getTeam(teamId)?.players ?? []
  return players.length ? Math.round(players.reduce((s, p) => s + p.overall, 0) / players.length) : 0
}
</script>

<template>
  <div class="wc">
    <section class="card wc__header">
      <div>
        <h1>🌍 {{ WORLD_CUP_NAME }}<template v-if="wc"> {{ game.currentYear }}</template></h1>
        <p class="muted">
          32 seleções com os convocados reais, a cada 4 anos, em junho e julho. Fase de grupos em turno único (passam os 2
          primeiros de cada grupo) e depois mata-mata em jogo único até a final; empate vai para os pênaltis.
        </p>
        <template v-if="wc">
          <p v-if="status" :class="status.tone"><strong>{{ status.text }}</strong></p>
          <p v-else class="muted">
            <strong>Você não treina nenhuma seleção nesta Copa.</strong> Os jogos são simulados automaticamente quando a data chega.
          </p>
          <p v-if="nextInfo" class="muted small">{{ nextInfo }}</p>
          <p v-if="wc.championId" class="champion">
            Campeão do mundo: <TeamBadge :team="game.getTeam(wc.championId)!" :size="28" />
            <strong>{{ game.getTeam(wc.championId)?.name }}</strong>
          </p>
        </template>
        <p v-else class="accent">
          <strong>Não é ano de Copa.</strong> A próxima {{ WORLD_CUP_NAME }} é em {{ nextYear }}: no começo daquela temporada,
          seleções podem convidar você para treiná-las na Copa, sem deixar o seu clube.
        </p>
      </div>
    </section>

    <!-- Convites: treinar uma seleção na Copa sem deixar o clube. -->
    <section v-if="wc && offers.length" class="card offers">
      <h2>📨 Convites de seleções</h2>
      <p class="muted">
        Aceite para treinar a seleção na {{ WORLD_CUP_NAME }} (escalação, tática e substituições como no clube). Você continua no
        {{ game.managedTeam?.name }}. Os convites valem até a Copa começar.
      </p>
      <div class="offers__list">
        <article v-for="t in offers" :key="t!.id" class="offer">
          <TeamBadge :team="t!" :size="40" />
          <div class="offer__info">
            <strong>{{ t!.name }} <CountryTag :team="t" /></strong>
            <small class="muted">
              {{ CONFEDERATION_LABELS[confederationOf(t!.id)!] }} · média dos convocados {{ squadAverage(t!.id) }}
              <template v-if="t!.managerName"> · hoje com {{ t!.managerName }}</template>
            </small>
          </div>
          <button class="btn btn--sm" :disabled="!game.canAcceptNationalJob" @click="accept(t!.id)">Aceitar</button>
        </article>
      </div>
      <button class="btn btn--sm btn--ghost" @click="game.declineNationalOffers()">Recusar todos</button>
      <p v-if="message" class="bad small">{{ message }}</p>
    </section>

    <template v-if="wc">
      <TournamentBoard :state="wc" :my-id="job?.teamId" :finished="game.worldCupFinished" team-word="Seleção" />
    </template>
  </div>
</template>

<style scoped>
.wc {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.wc__header h1 {
  margin-bottom: 0.25rem;
}
.wc__header p {
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
.offers h2 {
  margin: 0 0 0.25rem;
}
.offers__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.6rem;
  margin: 0.75rem 0;
}
.offer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.offer__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
</style>
