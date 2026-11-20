<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ConfidenceMeters from '../components/ConfidenceMeters.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS } from '../data/divisions'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { formatMoney } from '../utils/random'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const oldTeam = computed(() => (game.dismissal ? game.getTeam(game.dismissal.teamId) : null))

const offers = computed(() =>
  game.jobOffers
    .map((o) => ({ offer: o, team: game.getTeam(o.teamId) }))
    .filter((o) => o.team)
    .map(({ offer, team }) => ({
      offer,
      team: team!,
      squadAverage: Math.round(team!.players.reduce((sum, p) => sum + p.overall, 0) / team!.players.length),
      position: game.divisionStandings(team!.division).findIndex((r) => r.teamId === team!.id) + 1,
      budget: team!.reputation * 100_000,
    })),
)

function accept(teamId: string, name: string) {
  if (!confirm(`Assumir o ${name}? Você começa com a confiança da diretoria e do clube renovada.`)) return
  match.reset()
  game.acceptJobAfterDismissal(teamId)
  router.push({ name: 'dashboard' })
}

function retire() {
  if (!confirm('Encerrar a carreira? O save atual será descartado.')) return
  match.reset()
  game.endCareer()
  router.push({ name: 'home' })
}
</script>

<template>
  <div v-if="game.dismissal && oldTeam" class="dismissed">
    <section class="card hero">
      <TeamBadge :team="oldTeam" :size="64" />
      <div>
        <h1>❌ Você foi demitido</h1>
        <p>
          O <strong>{{ oldTeam.name }}</strong> encerrou o seu trabalho na temporada {{ game.dismissal.season }},
          rodada {{ game.dismissal.round }}.
        </p>
        <p class="reason">“{{ game.dismissal.reason }}”</p>
      </div>
      <ConfidenceMeters :confidence="game.confidence" class="hero__meters" />
    </section>

    <section class="card">
      <h2>Propostas para recomeçar</h2>
      <p class="muted small">
        Depois de uma demissão, só clubes da mesma série ou de séries abaixo se interessam. Suas taças continuam na
        sua prateleira.
      </p>
      <div class="offers">
        <article v-for="o in offers" :key="o.team.id" class="offer" :style="{ '--team-color': o.team.primaryColor }">
          <header>
            <TeamBadge :team="o.team" :size="44" />
            <div>
              <strong>{{ o.team.name }}</strong>
              <small class="muted">{{ DIVISION_LABELS[o.team.division] }} · {{ o.position }}º lugar</small>
            </div>
          </header>
          <p class="muted small reason-small">“{{ o.offer.reason }}”</p>
          <dl>
            <dt>Média do elenco</dt><dd>{{ o.squadAverage }}</dd>
            <dt>Caixa inicial</dt><dd>{{ formatMoney(o.budget) }}</dd>
          </dl>
          <button class="btn" @click="accept(o.team.id, o.team.name)">Assumir o {{ o.team.shortName }}</button>
        </article>
      </div>
    </section>

    <button class="btn btn--danger retire" @click="retire">Encerrar a carreira</button>
  </div>
</template>

<style scoped>
.dismissed {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 960px;
  margin: 0 auto;
}
.hero {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
  border-color: var(--bad);
}
.hero h1 {
  margin: 0 0 0.25rem;
  color: var(--bad);
}
.hero p {
  margin: 0.2rem 0;
}
.hero > div {
  flex: 1;
  min-width: 260px;
}
.hero__meters {
  min-width: 280px;
}
.reason {
  font-style: italic;
  color: var(--muted);
}
.small {
  font-size: 0.85rem;
}
.offers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  gap: 0.75rem;
}
.offer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-top: 4px solid var(--team-color);
  border-radius: 8px;
  background: var(--surface-2);
}
.offer header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.offer header small {
  display: block;
}
.reason-small {
  margin: 0;
  font-style: italic;
}
dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.2rem 0.5rem;
  margin: 0;
  font-size: 0.85rem;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
}
.offer .btn {
  margin-top: auto;
}
.retire {
  align-self: flex-start;
}
</style>
