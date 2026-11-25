<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import SavesPanel from '../components/SavesPanel.vue'
import TeamBadge from '../components/TeamBadge.vue'
import {
  DEFAULT_FORMAT, DIVISION_LABELS, FOREIGN_DIVISIONS, formatOfTeams, LEAGUE_FORMAT_LABELS, LEAGUE_FORMATS, type LeagueFormat,
} from '../data/divisions'
import { clearCustomLeague, getCustomLeague, parseLeagueFile, saveCustomLeague } from '../data/leagueFile'
import {
  getLeagueBase, getLeagueFormat, LEAGUE_BASE_LABELS, leagueTeams, setLeagueBase, setLeagueFormat, type LeagueBase,
} from '../data/league'
import type { DivisionId } from '../types/game'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import { canInstall, promptInstall } from '../utils/pwa'
import { prepareNewCareer } from '../utils/saveSlots'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

/** Versão do jogo (do package.json, via vite-plugin-package-version). */
const appVersion = import.meta.env.PACKAGE_VERSION

/** Clubes disponíveis para uma carreira nova (Brasileirão, liga gerada ou liga importada). */
const teams = ref(leagueTeams())
const isCustomLeague = ref(!!getCustomLeague())
const leagueName = ref(getCustomLeague()?.name ?? null)
const leagueBase = ref<LeagueBase>(getLeagueBase())
/** Formato escolhido para o Brasileirão e a liga gerada (uma liga importada tem o seu próprio). */
const leagueFormat = ref<LeagueFormat>(getLeagueFormat())
/** Séries da liga mostrada (pelo formato dos próprios clubes) e a liga estrangeira, se houver. */
const divisions = computed(() => [
  ...LEAGUE_FORMATS[formatOfTeams(teams.value)].divisions,
  ...FOREIGN_DIVISIONS.filter((d) => teams.value.some((t) => t.division === d)),
])
const selectedId = ref<string | null>(null)
const managerName = ref('')
const division = ref<DivisionId>('A')

const DIVISION_HINTS: Record<DivisionId, string> = {
  A: 'Elencos fortes, estádios maiores e muito caixa. Briga direta pelo título.',
  B: 'Bons times e o objetivo de subir para a elite.',
  C: 'Orçamento apertado: será preciso garimpar no mercado.',
  D: 'O desafio máximo: levar um time pequeno da última divisão até a Série A.',
  ESP: 'Clubes reais da 1ª divisão espanhola, disputada ao mesmo tempo que as séries. Sem acesso nem rebaixamento, e fora da Copa do Brasil e da Libertadores.',
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

const importErrors = ref<string[]>([])
const leagueMessage = ref<string | null>(null)

function refreshLeague() {
  teams.value = leagueTeams()
  isCustomLeague.value = !!getCustomLeague()
  leagueName.value = getCustomLeague()?.name ?? null
  leagueBase.value = getLeagueBase()
  leagueFormat.value = getLeagueFormat()
  if (!divisions.value.includes(division.value)) division.value = 'A'
  selectedId.value = null
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
    `${league.name ? `"${league.name}" importada` : 'Liga importada'}: ${league.teams.length} clubes` +
    (generated ? ` (${generated} com elenco gerado automaticamente)` : '') +
    '. Ela vale para as próximas carreiras.'
}

const FORMAT_MESSAGES: Record<LeagueFormat, string> = {
  '4x8': 'Formato 4 séries × 8 clubes: Séries A a D, 14 rodadas, 2 sobem e 2 descem.',
  '2x20': 'Formato 2 séries × 20 clubes: Séries A e B, 38 rodadas, 4 sobem e 4 descem.',
}

/** Troca o formato das séries (vale para o Brasileirão e a liga gerada; descarta a liga importada, se houver). */
function chooseFormat(format: LeagueFormat) {
  if (!isCustomLeague.value && leagueFormat.value === format) return
  if (isCustomLeague.value && !confirm(`Deixar de usar "${leagueName.value ?? 'liga importada'}" e jogar no formato ${LEAGUE_FORMAT_LABELS[format]}?`)) return
  clearCustomLeague()
  setLeagueFormat(format)
  refreshLeague()
  importErrors.value = []
  leagueMessage.value = FORMAT_MESSAGES[format]
}

const BASE_MESSAGES: Record<LeagueBase, string> = {
  brasileirao: 'Brasileirão ativado: clubes reais com seus elencos. Vale para as próximas carreiras.',
  gerada: 'Liga gerada ativada: clubes fictícios com elencos sorteados. Vale para as próximas carreiras.',
}

/** Troca a liga base (Brasileirão é o padrão; a liga gerada é a opção). Descarta a liga importada, se houver. */
function chooseBase(base: LeagueBase) {
  if (!isCustomLeague.value && leagueBase.value === base) return
  if (isCustomLeague.value && !confirm(`Deixar de usar "${leagueName.value ?? 'liga importada'}" e jogar com: ${LEAGUE_BASE_LABELS[base]}?`)) return
  clearCustomLeague()
  setLeagueBase(base)
  refreshLeague()
  importErrors.value = []
  leagueMessage.value = BASE_MESSAGES[base]
}

/** Apaga a carreira do save em uso (antes era o "Sair" do cabeçalho, que apagava sem querer). */
function abandonCareer() {
  const ok = confirm(
    `Abandonar a carreira com o ${game.managedTeam?.name}? Ela será apagada deste save e não dá para desfazer.` +
      ' (Para só voltar ao menu, use o botão Menu dentro do jogo: a carreira continua salva.)',
  )
  if (!ok) return
  match.reset()
  game.endCareer()
}

function startCareer() {
  if (!selectedId.value) return
  // Save único: confirma a substituição. Vários saves: a carreira atual fica guardada e a nova ganha um save.
  if (!prepareNewCareer(game, match)) return
  game.startCareer(selectedId.value, managerName.value)
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <section class="home">
    <header class="home__hero">
      <a
        class="github-link"
        href="https://github.com/Novout/neobrasfoot"
        target="_blank"
        rel="noopener noreferrer"
        title="Código do Neobrasfoot no GitHub"
        aria-label="Código do Neobrasfoot no GitHub"
      >
        <svg viewBox="0 0 16 16" width="26" height="26" aria-hidden="true" fill="currentColor">
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
      </a>
      <h1>⚽ Neobrasfoot</h1>
      <p class="muted">
        Escolha um clube, monte sua equipe e leve-o ao título.
        <span v-if="appVersion" class="version" title="Versão do jogo">v{{ appVersion }}</span>
      </p>
      <div class="hero-actions">
        <button v-if="game.hasCareer" class="btn btn--ghost" @click="router.push({ name: 'dashboard' })">
          Continuar carreira com {{ game.managedTeam?.name }}
        </button>
        <button
          v-if="game.hasCareer"
          class="btn btn--ghost btn--sm abandon"
          title="Apaga a carreira deste save (não dá para desfazer)"
          @click="abandonCareer"
        >
          Abandonar carreira
        </button>
        <RouterLink class="btn create-link" :to="{ name: 'team-builder' }">✏️ Criar meu próprio clube</RouterLink>
        <button v-if="canInstall" class="btn btn--ghost" title="Instala o Neobrasfoot como um app no computador (funciona offline)" @click="promptInstall">
          📲 Instalar o jogo
        </button>
      </div>
    </header>

    <SavesPanel />

    <section class="card league">
      <div class="league__info">
        <strong>Clubes: {{ isCustomLeague ? (leagueName ?? 'liga importada') : LEAGUE_BASE_LABELS[leagueBase] }}</strong>
        <small class="muted">
          O Brasileirão com clubes reais é o padrão. Prefere clubes fictícios? Use a liga gerada. Uma liga do editor ou
          importada substitui as duas. Vale para as próximas carreiras; a carreira em andamento não muda.
        </small>
      </div>
      <div class="league__actions">
        <div class="league__bases" role="group" aria-label="Liga das próximas carreiras">
          <button
            class="btn btn--sm"
            :class="{ 'btn--ghost': isCustomLeague || leagueBase !== 'brasileirao' }"
            title="Clubes reais do Brasileirão com os elencos atuais, 8 por série"
            @click="chooseBase('brasileirao')"
          >
            🇧🇷 Brasileirão (padrão)
          </button>
          <button
            class="btn btn--sm"
            :class="{ 'btn--ghost': isCustomLeague || leagueBase !== 'gerada' }"
            title="Clubes fictícios com elencos sorteados automaticamente"
            @click="chooseBase('gerada')"
          >
            🎲 Liga gerada
          </button>
        </div>
        <div class="league__bases" role="group" aria-label="Formato das séries">
          <button
            v-for="f in (['2x20', '4x8'] as const)"
            :key="f"
            class="btn btn--sm"
            :class="{ 'btn--ghost': isCustomLeague || leagueFormat !== f }"
            :title="f === '4x8' ? 'Séries A a D com 8 clubes cada (14 rodadas)' : 'Séries A e B com 20 clubes cada (38 rodadas), como o Brasileirão real'"
            @click="chooseFormat(f)"
          >
            {{ LEAGUE_FORMAT_LABELS[f] }}{{ f === DEFAULT_FORMAT ? ' (padrão)' : '' }}
          </button>
        </div>
        <RouterLink class="btn btn--sm btn--ghost create-link" :to="{ name: 'league-editor' }">🛠️ Editor de times</RouterLink>
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
        v-for="d in divisions"
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
/* Grade de 3 colunas: o título no centro e o ícone do GitHub na mesma linha, encostado à direita. */
.home__hero {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  text-align: center;
  margin: 2rem 0;
}
.home__hero > * {
  grid-column: 1 / -1;
}
.home__hero > h1 {
  grid-column: 2;
  grid-row: 1;
}
.github-link {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  /* Compensa a margem de baixo do título para ficar no centro dele. */
  margin-bottom: 12px;
  display: inline-flex;
  padding: 0.35rem;
  border-radius: 8px;
  color: var(--muted);
  transition: color 0.15s, background 0.15s;
}
.github-link:hover {
  color: var(--text, #fff);
  background: var(--surface-2);
}
.home__hero h1 {
  font-size: 2.6rem;
}
.version {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0 0.4rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 1.3rem;
  font-variant-numeric: tabular-nums;
}
.hero-actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.abandon {
  align-self: center;
  color: var(--muted);
}
.abandon:hover {
  color: var(--bad);
  border-color: var(--bad);
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
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.league__bases {
  display: flex;
  gap: 0.25rem;
  padding-right: 0.35rem;
  margin-right: 0.1rem;
  border-right: 1px solid var(--border);
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
  max-width: 100%;
}
.home__footer input {
  min-width: 0;
  flex: 1;
}
/* No celular o rótulo fica em cima e o campo ocupa a largura toda, sem vazar da tela. */
@media (max-width: 600px) {
  .home__hero h1 {
    font-size: 1.8rem;
    white-space: nowrap;
  }
  .home__footer {
    gap: 0.75rem;
  }
  .home__footer label {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
  }
  .home__footer input {
    width: 100%;
    box-sizing: border-box;
  }
  .home__footer .btn {
    width: 100%;
  }
}
.home__selected {
  flex: 1;
}
</style>
