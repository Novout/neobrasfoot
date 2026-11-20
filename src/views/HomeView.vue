<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS } from '../data/divisions'
import {
  clearCustomLeague, downloadJson, getCustomLeague, leagueTeams, parseLeagueFile, saveCustomLeague, teamsToLeagueFile,
} from '../data/leagueFile'
import type { DivisionId } from '../types/game'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

/** Clubes disponíveis para uma carreira nova (liga padrão ou importada). */
const teams = ref(leagueTeams())
const isCustomLeague = ref(!!getCustomLeague())
const selectedId = ref<string | null>(null)
const managerName = ref('')
const division = ref<DivisionId>('A')

const DIVISION_HINTS: Record<DivisionId, string> = {
  A: 'Elencos fortes, estádios maiores e muito caixa. Briga direta pelo título.',
  B: 'Bons times e o objetivo de subir para a elite.',
  C: 'Orçamento apertado: será preciso garimpar no mercado.',
  D: 'O desafio máximo: levar um time pequeno da última divisão até a Série A.',
}

const divisionTeams = computed(() => teams.value.filter((t) => t.division === division.value))

const selectedTeam = computed(() => teams.value.find((t) => t.id === selectedId.value) ?? null)

function averageOverall(teamId: string) {
  const team = teams.value.find((t) => t.id === teamId)!
  return Math.round(team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length)
}

function stars(reputation: number) {
  return Math.min(5, Math.max(1, Math.round((reputation - 38) / 9)))
}

// --- Liga: importar / exportar ---

const fileInput = ref<HTMLInputElement | null>(null)
const importErrors = ref<string[]>([])
const leagueMessage = ref<string | null>(null)

function refreshLeague() {
  teams.value = leagueTeams()
  isCustomLeague.value = !!getCustomLeague()
  selectedId.value = null
}

/** Exporta a carreira em andamento (elencos como estão agora) ou a liga usada nas carreiras novas. */
function exportLeague() {
  const source = game.hasCareer ? game.teams : teams.value
  const suffix = game.hasCareer ? `temporada-${game.season}` : new Date().toISOString().slice(0, 10)
  downloadJson(teamsToLeagueFile(source), `neobrasfoot-liga-${suffix}.json`)
  leagueMessage.value = game.hasCareer
    ? `Exportados os ${source.length} clubes da carreira atual (temporada ${game.season}).`
    : `Exportados os ${source.length} clubes da liga ${isCustomLeague.value ? 'importada' : 'padrão'}.`
}

async function importLeague(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importErrors.value = []
  leagueMessage.value = null
  const { league, errors } = parseLeagueFile(await file.text())
  if (!league) {
    importErrors.value = errors
    return
  }
  saveCustomLeague(league)
  refreshLeague()
  const generated = league.teams.filter((t) => !t.players).length
  leagueMessage.value =
    `Liga importada: ${league.teams.length} clubes` +
    (generated ? ` (${generated} com elenco gerado automaticamente)` : '') +
    '. Ela vale para as próximas carreiras.'
}

function restoreDefault() {
  if (!confirm('Voltar para a lista de clubes padrão nas próximas carreiras?')) return
  clearCustomLeague()
  refreshLeague()
  importErrors.value = []
  leagueMessage.value = 'Lista padrão restaurada.'
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
      <h1>⚽ Neobrasfoot</h1>
      <p class="muted">Escolha um clube, monte sua equipe e leve-o ao título.</p>
      <div class="hero-actions">
        <button v-if="game.hasCareer" class="btn btn--ghost" @click="router.push({ name: 'dashboard' })">
          Continuar carreira com {{ game.managedTeam?.name }}
        </button>
        <RouterLink class="btn create-link" :to="{ name: 'team-builder' }">✏️ Criar meu próprio clube</RouterLink>
      </div>
    </header>

    <section class="card league">
      <div class="league__info">
        <strong>Clubes: {{ isCustomLeague ? 'liga importada' : 'liga padrão' }}</strong>
        <small class="muted">
          A liga importada substitui a padrão nas próximas carreiras (8 clubes por série). A carreira em andamento não muda.
        </small>
      </div>
      <div class="league__actions">
        <button class="btn btn--ghost btn--sm" @click="fileInput?.click()">📥 Importar JSON</button>
        <button
          class="btn btn--ghost btn--sm"
          :title="game.hasCareer ? 'Exporta os clubes da carreira atual' : 'Exporta a liga em uso'"
          @click="exportLeague"
        >
          📤 Exportar JSON
        </button>
        <button v-if="isCustomLeague" class="btn btn--ghost btn--sm" @click="restoreDefault">Restaurar padrão</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importLeague" />
      </div>
      <p v-if="leagueMessage" class="league__message">{{ leagueMessage }}</p>
      <div v-if="importErrors.length" class="league__errors">
        <strong>Não foi possível importar:</strong>
        <ul>
          <li v-for="(e, i) in importErrors.slice(0, 12)" :key="i">{{ e }}</li>
          <li v-if="importErrors.length > 12">… e mais {{ importErrors.length - 12 }} problema(s).</li>
        </ul>
      </div>
    </section>

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
.hero-actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.create-link {
  text-decoration: none;
}
.league {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.league__info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.league__actions {
  display: flex;
  gap: 0.35rem;
}
.league__message {
  width: 100%;
  margin: 0;
  font-size: 0.85rem;
  color: var(--good);
}
.league__errors {
  width: 100%;
  font-size: 0.85rem;
  color: var(--bad);
}
.league__errors ul {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
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
