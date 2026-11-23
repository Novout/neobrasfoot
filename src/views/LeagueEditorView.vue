<script setup lang="ts">
import { computed, ref } from 'vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS, MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL } from '../data/divisions'
import {
  clearCustomLeague, downloadJson, getCustomLeague, LEAGUE_FORMAT, LEAGUE_FORMAT_VERSION, parseLeagueFile,
  saveCustomLeague, TEAMS_PER_DIVISION, teamsFromLeagueFile, teamsToLeagueFile,
  type LeagueFile, type LeagueFilePlayer, type LeagueFileTeam,
} from '../data/leagueFile'
import { FOOT_LABELS, playerFoot, type Foot } from '../data/feet'
import { playerSkills, SKILLS, SKILLS_BY_POSITION, type SkillId } from '../data/skills'
import { POSITION_ORDER } from '../data/tactics'
import { BRASILEIRAO_TEMPLATE_NAME } from '../data/templates/brasileirao'
import { brasileiraoLeague, getLeagueBase, LEAGUE_BASE_LABELS } from '../data/league'
import { createTeams, DIVISION_REPUTATION, generateSquadFor } from '../data/teams'
import type { DivisionId, Position } from '../types/game'
import { persistRefs } from '../utils/storage'

/** Liga com todos os elencos preenchidos (clubes sem jogadores ganham o elenco gerado). */
function toEditable(league: LeagueFile): LeagueFile {
  return teamsToLeagueFile(teamsFromLeagueFile(league), league)
}

/** Liga de clubes fictícios, com elencos sorteados. */
function generatedLeague(): LeagueFile {
  return teamsToLeagueFile(createTeams(), { name: LEAGUE_BASE_LABELS.gerada })
}

/** Sem liga do editor, o rascunho começa pela liga base das carreiras (Brasileirão, por padrão). */
const startLeague = () => {
  const custom = getCustomLeague()
  if (custom) return toEditable(custom)
  return getLeagueBase() === 'gerada' ? generatedLeague() : toEditable(brasileiraoLeague())
}

// Rascunho salvo no navegador: dá para sair do editor e voltar sem perder nada.
const draft = ref<LeagueFile>(startLeague())
/** Como o rascunho estava na última vez que foi salvo/aplicado como liga. */
const savedSnapshot = ref(JSON.stringify(draft.value.teams))
persistRefs('editor-liga', { draft, savedSnapshot }, 1)

const dirty = computed(() => JSON.stringify(draft.value.teams) !== savedSnapshot.value)

const division = ref<DivisionId>('A')
const selectedId = ref<string | null>(draft.value.teams.find((t) => t.division === 'A')?.id ?? null)
const message = ref<{ kind: 'good' | 'bad'; text: string } | null>(null)
const importErrors = ref<string[]>([])

const divisionTeams = computed(() => draft.value.teams.filter((t) => t.division === division.value))
const countBy = (d: DivisionId) => draft.value.teams.filter((t) => t.division === d).length
const team = computed(() => draft.value.teams.find((t) => t.id === selectedId.value) ?? null)

function selectDivision(d: DivisionId) {
  division.value = d
  if (team.value?.division !== d) selectedId.value = divisionTeams.value[0]?.id ?? null
}

// --- Validação ao vivo (as mesmas regras da importação) ---

const validation = computed(() => parseLeagueFile(JSON.stringify(draft.value)))
const isValid = computed(() => !!validation.value.league)
function errorsOf(t: LeagueFileTeam) {
  return validation.value.errors.filter((e) => e.startsWith(`"${t.name.trim()}":`))
}
const generalErrors = computed(() => validation.value.errors.filter((e) => !e.startsWith('"')))

// --- Elenco ---

const byPosition = (a: LeagueFilePlayer, b: LeagueFilePlayer) =>
  POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall

const squadSummary = computed(() => {
  const players = team.value?.players ?? []
  const avg = players.length ? Math.round(players.reduce((s, p) => s + (Number(p.overall) || 0), 0) / players.length) : 0
  const counts = Object.fromEntries(POSITION_ORDER.map((pos) => [pos, players.filter((p) => p.position === pos).length]))
  return { total: players.length, avg, counts: counts as Record<Position, number> }
})

function generatedPlayers(reputation: number, seed: string): LeagueFilePlayer[] {
  return generateSquadFor({ id: seed, reputation })
    .map((p) => ({
      name: p.name, position: p.position, age: p.age, overall: p.overall, ...(p.star ? { star: true } : {}), skills: playerSkills(p),
      foot: playerFoot(p),
    }))
    .sort(byPosition)
}

// --- Habilidades ---

/** Habilidades do jogador no editor: as escolhidas ou o sorteio que o jogo faria (id = clube + posição na lista). */
function skillsOf(p: LeagueFilePlayer, index: number): SkillId[] {
  return playerSkills({ id: `${team.value?.id}-${index}`, position: p.position, skills: p.skills })
}

function setSkill(p: LeagueFilePlayer, index: number, slot: number, skill: SkillId) {
  const current = [...skillsOf(p, index)]
  current[slot] = skill
  // Escolheu a mesma da outra vaga: troca as duas de lugar.
  if (current[0] === current[1]) current[1 - slot] = skillsOf(p, index)[slot]!
  p.skills = current
}

/** Pé do jogador no editor: o escolhido ou o sorteio que o jogo faria. */
function footOf(p: LeagueFilePlayer, index: number): Foot {
  return playerFoot({ id: `${team.value?.id}-${index}`, foot: p.foot })
}

/** Mudou de posição: as habilidades da posição antiga não valem mais. */
function changePosition(p: LeagueFilePlayer) {
  delete p.skills
}

function addPlayer() {
  if (!team.value) return
  team.value.players ??= []
  team.value.players.push({ name: 'Novo Jogador', position: 'MEI', age: 22, overall: team.value.reputation ?? 60 })
}

function removePlayer(index: number) {
  team.value?.players?.splice(index, 1)
}

function sortPlayers() {
  team.value?.players?.sort(byPosition)
}

function regenerateSquad() {
  if (!team.value) return
  if (!confirm(`Gerar um elenco novo para o ${team.value.name}? Os jogadores atuais serão substituídos.`)) return
  team.value.players = generatedPlayers(team.value.reputation ?? DIVISION_REPUTATION[team.value.division], `${team.value.id}-${Date.now()}`)
}

function useSquadAverage() {
  if (team.value) team.value.reputation = Math.min(95, Math.max(30, squadSummary.value.avg))
}

// --- Clubes ---

function addTeam() {
  const d = division.value
  let n = draft.value.teams.length + 1
  while (draft.value.teams.some((t) => t.id === `novo-clube-${n}` || t.name === `Novo Clube ${n}`)) n++
  const reputation = DIVISION_REPUTATION[d]
  const newTeam: LeagueFileTeam = {
    id: `novo-clube-${n}`,
    name: `Novo Clube ${n}`,
    shortName: 'NOV',
    division: d,
    primaryColor: '#607d8b',
    secondaryColor: '#ffffff',
    reputation,
    stadiumName: `Estádio do Novo Clube ${n}`,
    players: generatedPlayers(reputation, `novo-clube-${n}-${Date.now()}`),
  }
  draft.value.teams.push(newTeam)
  selectedId.value = newTeam.id!
}

function removeTeam() {
  if (!team.value || !confirm(`Remover o ${team.value.name} da liga?`)) return
  const index = draft.value.teams.findIndex((t) => t.id === selectedId.value)
  draft.value.teams.splice(index, 1)
  selectedId.value = divisionTeams.value[0]?.id ?? null
}

function changeDivision(d: DivisionId) {
  if (!team.value) return
  team.value.division = d
  division.value = d
}

// --- Importar / exportar / salvar ---

const fileInput = ref<HTMLInputElement | null>(null)

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  message.value = null
  importErrors.value = []
  const { league, errors } = parseLeagueFile(await file.text())
  if (!league) {
    importErrors.value = errors
    message.value = { kind: 'bad', text: `Não foi possível abrir "${file.name}".` }
    return
  }
  if (dirty.value && !confirm('Abrir o arquivo descarta as alterações não salvas do editor. Continuar?')) return
  draft.value = toEditable(league)
  selectDivision('A')
  message.value = {
    kind: 'good',
    text: `"${league.name ?? file.name}" aberto no editor (${league.teams.length} clubes). Revise e clique em "Salvar e usar" para jogar com ele.`,
  }
}

function slug(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function exportFile() {
  const file: LeagueFile = {
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    ...(draft.value.name?.trim() ? { name: draft.value.name.trim() } : {}),
    ...(draft.value.author?.trim() ? { author: draft.value.author.trim() } : {}),
    teams: DIVISIONS.flatMap((d) => draft.value.teams.filter((t) => t.division === d)),
  }
  downloadJson(file, `${slug(draft.value.name ?? '') || 'liga'}.neobrasfoot.json`)
  if (!isValid.value) {
    message.value = { kind: 'bad', text: 'Exportado, mas a liga ainda tem problemas: ela só poderá ser importada depois de corrigida.' }
  }
}

function save() {
  const league = validation.value.league
  if (!league) return
  saveCustomLeague(league)
  savedSnapshot.value = JSON.stringify(draft.value.teams)
  message.value = { kind: 'good', text: 'Liga salva! Ela vale para as próximas carreiras (a carreira em andamento não muda).' }
}

function discardChanges() {
  if (!confirm('Descartar as alterações e voltar para a liga em uso?')) return
  draft.value = startLeague()
  savedSnapshot.value = JSON.stringify(draft.value.teams)
  selectDivision(division.value)
  message.value = null
}

function loadGenerated() {
  if (!confirm('Substituir o rascunho por uma liga gerada (clubes fictícios)?')) return
  draft.value = generatedLeague()
  selectDivision('A')
  message.value = { kind: 'good', text: 'Liga gerada carregada no editor: clubes fictícios com elencos sorteados. Edite e clique em "Salvar e usar".' }
}

function loadBrasileirao() {
  if (!confirm(`Substituir o rascunho pelo template "${BRASILEIRAO_TEMPLATE_NAME}"?`)) return
  draft.value = toEditable(brasileiraoLeague())
  selectDivision('A')
  message.value = {
    kind: 'good',
    text: 'Brasileirão carregado: 32 clubes reais nas Séries A a D, com os elencos atuais. Edite à vontade e clique em "Salvar e usar".',
  }
}

const baseLabel = () => LEAGUE_BASE_LABELS[getLeagueBase()]

function useDefaultInCareers() {
  if (!confirm(`Usar "${baseLabel()}" nas próximas carreiras? O rascunho do editor continua guardado.`)) return
  clearCustomLeague()
  message.value = { kind: 'good', text: `As próximas carreiras voltam a usar "${baseLabel()}".` }
}

const isCustomInUse = computed(() => {
  // Recalcula depois de salvar/restaurar.
  void savedSnapshot.value
  void message.value
  return !!getCustomLeague()
})
</script>

<template>
  <section class="editor">
    <header class="editor__header">
      <div>
        <h1>🛠️ Editor de times</h1>
        <p class="muted">
          Monte seu próprio "addon": edite clubes, cores, estádios e elencos, exporte em JSON para compartilhar ou importe
          o arquivo de outra pessoa.
        </p>
      </div>
      <RouterLink class="btn btn--ghost" :to="{ name: 'home' }">← Menu inicial</RouterLink>
    </header>

    <section class="card meta">
      <label>
        Nome do addon
        <input v-model="draft.name" type="text" maxlength="60" placeholder="Ex.: Brasileirão 2026" />
      </label>
      <label>
        Autor
        <input v-model="draft.author" type="text" maxlength="60" placeholder="Opcional" />
      </label>
      <div class="meta__actions">
        <button class="btn btn--ghost btn--sm" @click="fileInput?.click()">📥 Importar JSON</button>
        <button class="btn btn--ghost btn--sm" @click="exportFile">📤 Exportar JSON</button>
        <button class="btn btn--ghost btn--sm" title="32 clubes reais do futebol brasileiro, 8 por série" @click="loadBrasileirao">
          🇧🇷 Carregar Brasileirão
        </button>
        <button class="btn btn--ghost btn--sm" title="Clubes fictícios com elencos sorteados" @click="loadGenerated">🎲 Carregar liga gerada</button>
        <button v-if="dirty" class="btn btn--ghost btn--sm" @click="discardChanges">Descartar alterações</button>
        <button class="btn btn--sm" :disabled="!isValid || !dirty" @click="save">💾 Salvar e usar</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importFile" />
      </div>
      <div class="meta__status small">
        <span v-if="dirty" class="warn">● Alterações não salvas</span>
        <span v-else class="good">✓ Tudo salvo</span>
        <span class="muted">
          · Em uso nas próximas carreiras: {{ isCustomInUse ? 'liga do editor' : baseLabel() }}
          <button v-if="isCustomInUse" class="link" @click="useDefaultInCareers">(voltar para {{ baseLabel() }})</button>
        </span>
      </div>
      <p v-if="message" class="meta__message small" :class="message.kind">{{ message.text }}</p>
      <ul v-if="importErrors.length" class="errors small">
        <li v-for="(e, i) in importErrors.slice(0, 12)" :key="i">{{ e }}</li>
        <li v-if="importErrors.length > 12">… e mais {{ importErrors.length - 12 }} problema(s).</li>
      </ul>
    </section>

    <section v-if="!isValid" class="card problems small">
      <strong>⚠️ A liga precisa de ajustes antes de ser salva ({{ validation.errors.length }}):</strong>
      <ul class="errors">
        <li v-for="(e, i) in validation.errors.slice(0, 8)" :key="i">{{ e }}</li>
        <li v-if="validation.errors.length > 8">… e mais {{ validation.errors.length - 8 }}.</li>
      </ul>
    </section>

    <nav class="divisions">
      <button
        v-for="d in DIVISIONS"
        :key="d"
        class="btn btn--sm"
        :class="{ 'btn--ghost': division !== d }"
        @click="selectDivision(d)"
      >
        {{ DIVISION_LABELS[d] }}
        <span :class="countBy(d) === TEAMS_PER_DIVISION ? '' : 'count-bad'">({{ countBy(d) }}/{{ TEAMS_PER_DIVISION }})</span>
      </button>
    </nav>
    <p v-for="e in generalErrors.filter((e) => e.includes(DIVISION_LABELS[division]))" :key="e" class="bad small center">{{ e }}</p>

    <div class="layout">
      <aside class="card teams">
        <button
          v-for="t in divisionTeams"
          :key="t.id"
          class="team-row"
          :class="{ selected: t.id === selectedId, invalid: errorsOf(t).length }"
          @click="selectedId = t.id ?? null"
        >
          <TeamBadge :team="{ shortName: t.shortName ?? '', primaryColor: t.primaryColor ?? '#607d8b', secondaryColor: t.secondaryColor ?? '#fff' }" :size="30" />
          <span class="team-row__name">{{ t.name || '(sem nome)' }}</span>
          <span v-if="errorsOf(t).length" title="Este clube tem problemas">⚠️</span>
        </button>
        <p v-if="!divisionTeams.length" class="muted small">Nenhum clube nesta série.</p>
        <button class="btn btn--ghost btn--sm" @click="addTeam">+ Novo clube</button>
      </aside>

      <section v-if="team" class="card team-form">
        <div class="team-form__top">
          <TeamBadge :team="{ shortName: team.shortName ?? '', primaryColor: team.primaryColor ?? '#607d8b', secondaryColor: team.secondaryColor ?? '#fff' }" :size="56" />
          <div class="fields">
            <label>Nome <input v-model="team.name" type="text" maxlength="40" /></label>
            <label>Sigla <input v-model="team.shortName" type="text" maxlength="4" class="short" @input="team.shortName = team.shortName?.toUpperCase()" /></label>
            <label>
              Série
              <select :value="team.division" @change="changeDivision(($event.target as HTMLSelectElement).value as DivisionId)">
                <option v-for="d in DIVISIONS" :key="d" :value="d">{{ DIVISION_LABELS[d] }}</option>
              </select>
            </label>
            <label>Cor 1 <input v-model="team.primaryColor" type="color" /></label>
            <label>Cor 2 <input v-model="team.secondaryColor" type="color" /></label>
            <label class="wide">Estádio <input v-model="team.stadiumName" type="text" maxlength="50" /></label>
            <label class="wide">
              Técnico
              <input v-model="team.manager" type="text" maxlength="40" placeholder="Vazio = nome inventado pelo jogo" />
            </label>
            <label>
              Reputação
              <input v-model.number="team.reputation" type="number" min="30" max="95" class="num" />
              <button class="link small" title="Usa a média de OVR do elenco" @click="useSquadAverage">= média</button>
            </label>
          </div>
        </div>

        <ul v-if="errorsOf(team).length" class="errors small">
          <li v-for="e in errorsOf(team)" :key="e">{{ e.replace(`"${team.name.trim()}": `, '') }}</li>
        </ul>

        <div class="squad__header">
          <h3>Elenco</h3>
          <span class="muted small">
            {{ squadSummary.total }} jogadores · média {{ squadSummary.avg }} ·
            <template v-for="pos in POSITION_ORDER" :key="pos">{{ pos }} {{ squadSummary.counts[pos] }} </template>
          </span>
          <div class="squad__actions">
            <button class="btn btn--ghost btn--sm" @click="sortPlayers">Ordenar</button>
            <button class="btn btn--ghost btn--sm" @click="regenerateSquad">🎲 Gerar elenco</button>
            <button class="btn btn--ghost btn--sm" @click="addPlayer">+ Jogador</button>
          </div>
        </div>

        <table class="squad">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Nome</th>
              <th>Idade</th>
              <th>OVR</th>
              <th title="Jogador estrela">★</th>
              <th title="2 habilidades da lista da posição">Habilidades</th>
              <th title="Pé preferido: destro rende mais pela direita, canhoto pela esquerda">Pé</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in team.players" :key="i">
              <td>
                <select v-model="p.position" class="pos-select" :class="`pos--${p.position}`" @change="changePosition(p)">
                  <option v-for="pos in POSITION_ORDER" :key="pos" :value="pos">{{ pos }}</option>
                </select>
              </td>
              <td><input v-model="p.name" type="text" maxlength="30" /></td>
              <td><input v-model.number="p.age" type="number" min="16" max="45" class="num" /></td>
              <td><input v-model.number="p.overall" type="number" :min="MIN_PLAYER_OVERALL" :max="MAX_PLAYER_OVERALL" class="num" /></td>
              <td><input v-model="p.star" type="checkbox" /></td>
              <td class="skills-cell" data-col="habilidades">
                <select
                  v-for="slot in [0, 1]"
                  :key="slot"
                  class="skill-select"
                  :value="skillsOf(p, i)[slot]"
                  :title="SKILLS[skillsOf(p, i)[slot]!].description"
                  @change="setSkill(p, i, slot, ($event.target as HTMLSelectElement).value as SkillId)"
                >
                  <option v-for="s in SKILLS_BY_POSITION[p.position]" :key="s" :value="s">{{ SKILLS[s].icon }} {{ SKILLS[s].label }}</option>
                </select>
              </td>
              <td>
                <select class="skill-select" :value="footOf(p, i)" @change="p.foot = ($event.target as HTMLSelectElement).value as Foot">
                  <option v-for="(label, f) in FOOT_LABELS" :key="f" :value="f">{{ label }}</option>
                </select>
              </td>
              <td><button class="link bad" title="Remover jogador" @click="removePlayer(i)">✕</button></td>
            </tr>
          </tbody>
        </table>

        <footer class="team-form__footer">
          <button class="btn btn--ghost btn--sm bad" @click="removeTeam">Remover clube</button>
        </footer>
      </section>
      <section v-else class="card muted">Selecione ou crie um clube.</section>
    </div>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.editor__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.editor__header h1 {
  margin: 0 0 0.25rem;
}
.editor__header p {
  margin: 0;
  max-width: 60ch;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}
.meta label,
.fields label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.meta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-left: auto;
}
.meta__status,
.meta__message,
.meta .errors {
  width: 100%;
  margin: 0;
}
.problems {
  border-color: var(--warn);
}
.errors {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
  color: var(--bad);
}
.divisions {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.count-bad {
  color: var(--bad);
  font-weight: 700;
}
.center {
  text-align: center;
  margin: 0;
}
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 850px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.teams {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.team-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  font: inherit;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.team-row:hover {
  background: var(--surface-2);
}
.team-row.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.team-row.invalid {
  border-color: var(--bad);
}
.team-row__name {
  flex: 1;
  font-size: 0.88rem;
}
.team-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.team-form__top {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  flex: 1;
}
.fields .wide {
  flex: 1 1 220px;
}
.fields label:has(.link) {
  position: relative;
}
.short {
  width: 4.5rem;
  text-transform: uppercase;
}
.num {
  width: 4.2rem;
}
input[type='color'] {
  width: 3rem;
  height: 2rem;
  padding: 0;
  border: none;
  background: none;
}
.squad__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}
.squad__header h3 {
  margin: 0;
}
.squad__actions {
  display: flex;
  gap: 0.3rem;
  margin-left: auto;
}
.squad {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.squad th {
  text-align: left;
  color: var(--muted);
  font-weight: 500;
  padding: 0.2rem 0.3rem;
}
.squad td {
  padding: 0.15rem 0.3rem;
  border-top: 1px solid var(--border);
}
.skills-cell {
  white-space: nowrap;
}
.skill-select {
  font-size: 0.75rem;
  padding: 0.2rem 0.3rem;
  max-width: 9.5rem;
}
.skill-select + .skill-select {
  margin-left: 0.25rem;
}
.squad td input[type='text'] {
  width: 100%;
}
.pos-select {
  font-weight: 700;
}
.team-form__footer {
  display: flex;
  justify-content: flex-end;
}
.link {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
}
.small {
  font-size: 0.82rem;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.warn {
  color: var(--warn);
}
</style>
