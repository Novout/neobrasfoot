<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS } from '../data/divisions'
import { createTeams } from '../data/teams'
import type { DivisionId } from '../types/game'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const teams = createTeams()
const selectedId = ref<string | null>(null)
const managerName = ref('')
const division = ref<DivisionId>('A')

const DIVISION_HINTS: Record<DivisionId, string> = {
  A: 'Elencos fortes, estádios maiores e muito caixa. Briga direta pelo título.',
  B: 'Bons times e o objetivo de subir para a elite.',
  C: 'Orçamento apertado: será preciso garimpar no mercado.',
  D: 'O desafio máximo: levar um time pequeno da última divisão até a Série A.',
}

const divisionTeams = computed(() => teams.filter((t) => t.division === division.value))

const selectedTeam = computed(() => teams.find((t) => t.id === selectedId.value) ?? null)

function averageOverall(teamId: string) {
  const team = teams.find((t) => t.id === teamId)!
  return Math.round(team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length)
}

function stars(reputation: number) {
  return Math.min(5, Math.max(1, Math.round((reputation - 38) / 9)))
}

function startCareer() {
  if (!selectedId.value) return
  if (game.hasCareer && !confirm(`Isso substitui a carreira atual com o ${game.managedTeam?.name}. Continuar?`)) return
  match.reset()
  game.startCareer(selectedId.value, managerName.value)
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <section class="home">
    <header class="home__hero">
      <h1>⚽ Neobrassfot</h1>
      <p class="muted">Escolha um clube, monte sua equipe e leve-o ao título.</p>
      <button v-if="game.hasCareer" class="btn btn--ghost" @click="router.push({ name: 'dashboard' })">
        Continuar carreira com {{ game.managedTeam?.name }}
      </button>
    </header>

    <nav class="divisions">
      <button
        v-for="d in DIVISIONS"
        :key="d"
        class="btn"
        :class="{ 'btn--ghost': division !== d }"
        @click="division = d"
      >
        {{ DIVISION_LABELS[d] }}
      </button>
    </nav>
    <p class="muted division-hint">{{ DIVISION_HINTS[division] }}</p>

    <div class="home__grid">
      <button
        v-for="team in divisionTeams"
        :key="team.id"
        class="team-card"
        :class="{ 'team-card--selected': team.id === selectedId }"
        :style="{ '--team-color': team.primaryColor }"
        @click="selectedId = team.id"
      >
        <TeamBadge :team="team" :size="56" />
        <div class="team-card__info">
          <strong>{{ team.name }}</strong>
          <span class="stars">{{ '★'.repeat(stars(team.reputation)) }}<span class="muted">{{ '★'.repeat(5 - stars(team.reputation)) }}</span></span>
          <small class="muted">Média do elenco: {{ averageOverall(team.id) }}</small>
        </div>
      </button>
    </div>

    <footer class="home__footer card">
      <label>
        Nome do treinador
        <input v-model="managerName" type="text" placeholder="Seu nome" maxlength="30" />
      </label>
      <div class="home__selected">
        <template v-if="selectedTeam">
          Clube escolhido: <strong>{{ selectedTeam.name }}</strong>
          <span class="muted">({{ DIVISION_LABELS[selectedTeam.division] }})</span>
        </template>
        <span v-else class="muted">Selecione um clube acima</span>
      </div>
      <button class="btn" :disabled="!selectedTeam" @click="startCareer">Iniciar carreira</button>
    </footer>
  </section>
</template>

<style scoped>
.home__hero {
  text-align: center;
  margin: 2rem 0;
}
.home__hero h1 {
  font-size: 2.6rem;
}
.divisions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.division-hint {
  text-align: center;
  margin: 0.75rem 0 1.25rem;
}
.home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}
.team-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--surface);
  border: 2px solid var(--border);
  border-left: 6px solid var(--team-color);
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}
.team-card:hover {
  transform: translateY(-2px);
}
.team-card--selected {
  border-color: var(--accent);
  border-left-color: var(--team-color);
  background: var(--surface-2);
}
.team-card__info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.stars {
  color: var(--warn);
  letter-spacing: 2px;
}
.home__footer {
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.home__footer label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.home__selected {
  flex: 1;
}
</style>
