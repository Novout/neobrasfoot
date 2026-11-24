<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TeamBadge from '../components/TeamBadge.vue'
import { crestFromFile } from '../data/crests'
import { DIVISION_LABELS, formatOfTeams, LEAGUE_FORMATS, MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL } from '../data/divisions'
import { leagueTeams } from '../data/league'
import { createStadium, stadiumCapacity } from '../data/stadium'
import { POSITION_ORDER } from '../data/tactics'
import {
  DIVISION_REPUTATION, generateRealisticSquad, overallForLevel, randomPlayerName, realisticPlayerDraft,
  talentFromOverall, teamReplacedBy, type CustomTeamDraft,
} from '../data/teams'
import { MAX_SQUAD_SIZE, MIN_GOALKEEPERS, MIN_SQUAD_SIZE, useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import type { DivisionId, Position } from '../types/game'
import { createRng, formatMoney } from '../utils/random'
import { persistRefs } from '../utils/storage'
import { prepareNewCareer } from '../utils/saveSlots'
import { STAR_OVERALL_BOOST } from '../data/stars'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const MIN_AGE = 16
const MAX_AGE = 40
/** Mínimo por posição para conseguir escalar um 4-4-2 com reservas no gol. */
const MIN_BY_POSITION: Record<Position, number> = { GOL: MIN_GOALKEEPERS, DEF: 4, MEI: 4, ATA: 2 }

// --- Referência das séries ---

// Liga em uso nas carreiras novas (padrão ou importada).
const referenceTeams = leagueTeams()
/** Séries do formato dessa liga (4×8 ou 2×20). */
const divisions = LEAGUE_FORMATS[formatOfTeams(referenceTeams)].divisions
const divisionAverages = Object.fromEntries(
  divisions.map((d) => {
    const players = referenceTeams.filter((t) => t.division === d).flatMap((t) => t.players)
    return [d, players.reduce((sum, p) => sum + p.overall, 0) / players.length]
  }),
) as Record<DivisionId, number>
/** Nível (média de OVR) típico de cada série, usado nos atalhos da barra. */
const levelPresets = Object.fromEntries(divisions.map((d) => [d, Math.round(divisionAverages[d])])) as Record<DivisionId, number>

// --- Rascunho ---

// --- Escudo (foto do computador) ---

const crestInput = ref<HTMLInputElement | null>(null)
const crestError = ref<string | null>(null)

/** A imagem escolhida vira um PNG quadrado de 128 px, salvo junto com o rascunho do clube. */
async function uploadCrest(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  crestError.value = null
  try {
    draft.value.crest = await crestFromFile(file)
  } catch (err) {
    crestError.value = (err as Error).message
  }
}

function removeCrest() {
  draft.value.crest = undefined
  crestError.value = null
}

/** O clube criado começa na última série do formato (Série D no 4×8, Série B no 2×20). */
const lowestDivision = divisions.at(-1)!

function emptyDraft(): CustomTeamDraft {
  return {
    name: '',
    shortName: '',
    primaryColor: '#1e88e5',
    secondaryColor: '#ffffff',
    division: lowestDivision,
    players: generateRealisticSquad(levelPresets[lowestDivision]),
  }
}

const draft = ref<CustomTeamDraft>(emptyDraft())
const managerName = ref('')
/** Nível do elenco: a média de OVR que a barra controla. */
const targetLevel = ref(levelPresets[lowestDivision])
// O rascunho fica salvo para não se perder ao recarregar a página.
persistRefs('team-builder', { draft, managerName, targetLevel })
// Rascunho de outro formato (ex.: Série D salva e agora a liga é 2×20): vai para a última série deste.
if (!divisions.includes(draft.value.division)) draft.value.division = lowestDivision

// Rascunhos antigos não têm talento: deduz a partir do OVR atual, com o nível igual à média do elenco.
if (draft.value.players.some((p) => p.talent === undefined)) {
  const players = draft.value.players
  targetLevel.value = Math.round(players.reduce((sum, p) => sum + p.overall, 0) / Math.max(players.length, 1))
  players.forEach((p) => (p.talent ??= talentFromOverall(p.overall, targetLevel.value, p.age, p.star)))
}

// A barra recalcula o OVR de todos: nível do elenco + talento do jogador + efeito da idade.
watch(targetLevel, (level) => {
  for (const p of draft.value.players) {
    p.overall = overallForLevel(level, p.talent ?? 0, p.age, p.star)
  }
})

/** OVR ou idade editados à mão: guarda o novo talento para a barra respeitar a mudança. */
function syncTalent(index: number) {
  const p = draft.value.players[index]
  if (!p || !Number.isFinite(p.overall) || !Number.isFinite(p.age)) return
  p.talent = talentFromOverall(p.overall, targetLevel.value, p.age, p.star)
}

const squadAverage = computed(() => {
  const players = draft.value.players
  return players.length ? players.reduce((sum, p) => sum + (Number(p.overall) || 0), 0) / players.length : 0
})

/** Série cujo nível médio é o mais próximo do elenco criado. */
const equivalentDivision = computed(() =>
  divisions.reduce((best, d) =>
    Math.abs(divisionAverages[d] - squadAverage.value) < Math.abs(divisionAverages[best] - squadAverage.value) ? d : best,
  ),
)

const balanceHint = computed(() => {
  const diff = squadAverage.value - divisionAverages[draft.value.division]
  if (diff > 8) return { tone: 'good', text: 'Elenco bem mais forte que a média da série: favorito ao acesso.' }
  if (diff < -8) return { tone: 'bad', text: 'Elenco bem mais fraco que a média da série: risco real de rebaixamento.' }
  return { tone: 'muted', text: 'Elenco no nível da série: temporada equilibrada.' }
})

const replacedTeam = computed(() => teamReplacedBy(referenceTeams, draft.value.division))
const preview = computed(() => {
  const reputation = DIVISION_REPUTATION[draft.value.division]
  return { reputation, budget: reputation * 100_000, capacity: stadiumCapacity(createStadium({ name: '', reputation })) }
})

// --- Ações do elenco ---

/** A série é escolhida à parte do nível: dá para montar um time forte numa série baixa. */
function chooseDivision(division: DivisionId) {
  draft.value.division = division
}

function regenerateSquad() {
  if (!confirm('Substituir todo o elenco por jogadores aleatórios desse nível?')) return
  draft.value.players = generateRealisticSquad(targetLevel.value)
}

function addPlayer(position: Position) {
  const players = draft.value.players
  const lastIndex = players.map((p) => p.position).lastIndexOf(position)
  const newPlayer = realisticPlayerDraft(position, targetLevel.value, createRng(Date.now()))
  players.splice(lastIndex >= 0 ? lastIndex + 1 : players.length, 0, newPlayer)
}

function removePlayer(index: number) {
  draft.value.players.splice(index, 1)
}

/** Estrela soma (ou tira) o bônus de OVR mantendo o talento do jogador. */
function toggleStar(index: number) {
  const p = draft.value.players[index]
  if (!p) return
  p.star = !p.star
  p.overall = overallForLevel(targetLevel.value, p.talent ?? 0, p.age, p.star)
}

function rerollName(index: number) {
  draft.value.players[index]!.name = randomPlayerName(createRng(Date.now() + index))
}

function resetDraft() {
  if (!confirm('Descartar o clube em criação e começar do zero?')) return
  draft.value = emptyDraft()
  targetLevel.value = levelPresets.D
}

// --- Validação ---

const countByPosition = computed(() =>
  Object.fromEntries(POSITION_ORDER.map((pos) => [pos, draft.value.players.filter((p) => p.position === pos).length])) as Record<
    Position,
    number
  >,
)

const problems = computed(() => {
  const list: string[] = []
  const d = draft.value
  if (d.name.trim().length < 3) list.push('Dê um nome ao clube (mínimo 3 letras).')
  if (!/^[A-Za-zÀ-ú]{3}$/.test(d.shortName.trim())) list.push('A sigla precisa ter exatamente 3 letras.')
  if (d.players.length < MIN_SQUAD_SIZE || d.players.length > MAX_SQUAD_SIZE) {
    list.push(`O elenco precisa ter entre ${MIN_SQUAD_SIZE} e ${MAX_SQUAD_SIZE} jogadores (tem ${d.players.length}).`)
  }
  for (const pos of POSITION_ORDER) {
    if (countByPosition.value[pos] < MIN_BY_POSITION[pos]) list.push(`Mínimo de ${MIN_BY_POSITION[pos]} jogadores na posição ${pos}.`)
  }
  if (d.players.some((p) => !p.name.trim())) list.push('Todos os jogadores precisam de nome.')
  if (d.players.some((p) => !(p.overall >= MIN_PLAYER_OVERALL && p.overall <= MAX_PLAYER_OVERALL))) {
    list.push(`A força (OVR) deve ficar entre ${MIN_PLAYER_OVERALL} e ${MAX_PLAYER_OVERALL}.`)
  }
  if (d.players.some((p) => !(p.age >= MIN_AGE && p.age <= MAX_AGE))) list.push(`A idade deve ficar entre ${MIN_AGE} e ${MAX_AGE} anos.`)
  return list
})

function startCareer() {
  if (problems.value.length) return
  if (!prepareNewCareer(game, match)) return
  game.startCustomCareer(draft.value, managerName.value)
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="builder">
    <header class="builder__header">
      <div>
        <h1>Criar meu clube</h1>
        <p class="muted">Monte o clube, os jogadores e a força do elenco, e escolha a série em que ele começa.</p>
      </div>
      <div class="builder__header-actions">
        <button class="btn btn--ghost btn--sm" @click="resetDraft">Recomeçar</button>
        <RouterLink class="btn btn--ghost btn--sm" :to="{ name: 'home' }">← Voltar</RouterLink>
      </div>
    </header>

    <div class="builder__grid">
      <aside class="builder__side">
        <section class="card">
          <h2>Clube</h2>
          <div class="identity">
            <button
              class="crest-pick"
              type="button"
              :title="draft.crest ? 'Trocar a foto do escudo' : 'Carregar uma foto do computador para o escudo'"
              @click="crestInput?.click()"
            >
              <TeamBadge
                :team="{
                  shortName: draft.shortName.toUpperCase() || '???',
                  primaryColor: draft.primaryColor,
                  secondaryColor: draft.secondaryColor,
                  crest: draft.crest,
                  name: draft.name,
                }"
                :size="72"
              />
              <span class="crest-pick__hint">📷</span>
            </button>
            <div class="identity__fields">
              <label>Nome<input v-model="draft.name" type="text" maxlength="30" placeholder="Ex.: Esporte Clube Aurora" /></label>
              <label>Sigla<input v-model="draft.shortName" type="text" maxlength="3" placeholder="ECA" class="short" /></label>
            </div>
          </div>
          <div class="colors">
            <label>Cor principal <input v-model="draft.primaryColor" type="color" /></label>
            <label>Cor secundária <input v-model="draft.secondaryColor" type="color" /></label>
          </div>
          <div class="crest-actions">
            <button class="btn btn--ghost btn--sm" type="button" @click="crestInput?.click()">
              📷 {{ draft.crest ? 'Trocar foto do escudo' : 'Carregar foto do escudo' }}
            </button>
            <button v-if="draft.crest" class="btn btn--ghost btn--sm" type="button" @click="removeCrest">Remover foto</button>
            <input ref="crestInput" type="file" accept="image/*" hidden @change="uploadCrest" />
          </div>
          <p v-if="crestError" class="small bad">{{ crestError }}</p>
          <p v-else class="small muted crest-note">PNG, JPG ou SVG do computador. Sem foto, o escudo usa as cores e a sigla.</p>
        </section>

        <section class="card">
          <h2>Divisão inicial</h2>
          <div class="divisions">
            <button
              v-for="d in divisions"
              :key="d"
              class="btn btn--sm"
              :class="{ 'btn--ghost': draft.division !== d }"
              @click="chooseDivision(d)"
            >
              {{ DIVISION_LABELS[d] }}
            </button>
          </div>
          <dl>
            <dt>Caixa inicial</dt>
            <dd>{{ formatMoney(preview.budget) }}</dd>
            <dt>Estádio</dt>
            <dd>{{ preview.capacity.toLocaleString('pt-BR') }} lugares</dd>
            <dt>Sai da série</dt>
            <dd>{{ replacedTeam.name }}</dd>
          </dl>
          <p class="muted small">Seu clube entra no lugar do time mais fraco da {{ DIVISION_LABELS[draft.division] }}.</p>
        </section>

        <section class="card">
          <h2>Força do elenco</h2>
          <div class="level">
            <span>Nível do elenco</span>
            <strong>{{ targetLevel }}</strong>
          </div>
          <input v-model.number="targetLevel" type="range" :min="MIN_PLAYER_OVERALL + 5" :max="MAX_PLAYER_OVERALL - 5" />
          <div class="presets">
            <button
              v-for="d in divisions"
              :key="d"
              class="btn btn--sm"
              :class="{ 'btn--ghost': targetLevel !== levelPresets[d] }"
              :title="`Média típica da ${DIVISION_LABELS[d]}`"
              @click="targetLevel = levelPresets[d]"
            >
              Nível {{ d }} ({{ levelPresets[d] }})
            </button>
          </div>
          <p class="muted small">
            A barra recalcula o OVR de todos os jogadores. Cada um mantém seu talento (acima ou abaixo da média) e a
            idade pesa: jovens ainda evoluindo, auge entre 26 e 30 anos, queda depois dos 33.
          </p>
          <div class="level-actions">
            <button class="btn btn--sm btn--ghost" @click="regenerateSquad">Sortear novo elenco</button>
          </div>

          <table class="compare">
            <tbody>
              <tr v-for="d in divisions" :key="d" :class="{ chosen: d === draft.division }">
                <td>Média da {{ DIVISION_LABELS[d] }}</td>
                <td class="num">{{ divisionAverages[d].toFixed(1) }}</td>
              </tr>
              <tr class="mine">
                <td>Média do seu elenco</td>
                <td class="num">{{ squadAverage.toFixed(1) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="small">
            Nível equivalente: <strong>{{ DIVISION_LABELS[equivalentDivision] }}</strong>.
            <span :class="balanceHint.tone">{{ balanceHint.text }}</span>
          </p>
        </section>
      </aside>

      <section class="card players">
        <div class="players__header">
          <h2>Jogadores ({{ draft.players.length }}/{{ MAX_SQUAD_SIZE }})</h2>
          <div class="add">
            <button
              v-for="pos in POSITION_ORDER"
              :key="pos"
              class="btn btn--ghost btn--sm"
              :disabled="draft.players.length >= MAX_SQUAD_SIZE"
              @click="addPlayer(pos)"
            >
              + {{ pos }}
            </button>
          </div>
        </div>
        <p class="muted small counts">
          <span v-for="pos in POSITION_ORDER" :key="pos" :class="{ bad: countByPosition[pos] < MIN_BY_POSITION[pos] }">
            {{ pos }}: {{ countByPosition[pos] }} (mín. {{ MIN_BY_POSITION[pos] }})
          </span>
        </p>

        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Nome</th>
              <th class="num">Idade</th>
              <th class="num">OVR</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in draft.players" :key="i">
              <td>
                <select v-model="p.position" class="pos-select" :class="`pos--${p.position}`">
                  <option v-for="pos in POSITION_ORDER" :key="pos" :value="pos">{{ pos }}</option>
                </select>
              </td>
              <td class="name-cell">
                <input v-model="p.name" type="text" maxlength="28" :class="{ invalid: !p.name.trim() }" />
                <button class="icon-btn" title="Sortear outro nome" @click="rerollName(i)">🎲</button>
                <button
                  class="icon-btn star-toggle"
                  :class="{ on: p.star }"
                  :title="p.star ? `Remover estrela (−${STAR_OVERALL_BOOST} OVR)` : `Tornar estrela (+${STAR_OVERALL_BOOST} OVR, gasta metade da energia)`"
                  @click="toggleStar(i)"
                >
                  {{ p.star ? '★' : '☆' }}
                </button>
              </td>
              <td class="num">
                <input v-model.number="p.age" type="number" :min="MIN_AGE" :max="MAX_AGE" class="num-input"
                  :class="{ invalid: !(p.age >= MIN_AGE && p.age <= MAX_AGE) }" @change="syncTalent(i)" />
              </td>
              <td class="num">
                <input v-model.number="p.overall" type="number" :min="MIN_PLAYER_OVERALL" :max="MAX_PLAYER_OVERALL" class="num-input"
                  :class="{ invalid: !(p.overall >= MIN_PLAYER_OVERALL && p.overall <= MAX_PLAYER_OVERALL) }"
                  @change="syncTalent(i)" />
              </td>
              <td>
                <button class="icon-btn" title="Remover jogador" @click="removePlayer(i)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <footer class="card builder__footer">
      <label>
        Nome do treinador
        <input v-model="managerName" type="text" placeholder="Seu nome" maxlength="30" />
      </label>
      <ul v-if="problems.length" class="problems">
        <li v-for="msg in problems" :key="msg">{{ msg }}</li>
      </ul>
      <span v-else class="good">Tudo pronto!</span>
      <button class="btn" :disabled="problems.length > 0" @click="startCareer">Começar carreira</button>
    </footer>
  </div>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.builder__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}
.builder__header h1 {
  margin-bottom: 0.25rem;
}
.builder__header p {
  margin: 0;
}
.builder__header-actions {
  display: flex;
  gap: 0.4rem;
}
.builder__header-actions a {
  text-decoration: none;
}
.builder__grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .builder__grid {
    grid-template-columns: 1fr;
  }
}
.builder__side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--muted);
}
.identity {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.identity__fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.short {
  width: 5rem;
  text-transform: uppercase;
}
.crest-pick {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 50%;
}
.crest-pick__hint {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 0.75rem;
}
.crest-pick:hover .crest-pick__hint {
  border-color: var(--accent);
}
.crest-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}
.crest-note {
  margin: 0.35rem 0 0;
}
.colors {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
}
input[type='color'] {
  width: 64px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
.divisions,
.presets,
.level-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.level-actions {
  margin-top: 0.6rem;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem;
  margin: 0.9rem 0 0.4rem;
  font-size: 0.9rem;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  text-align: right;
}
.small {
  font-size: 0.85rem;
}
.level {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.level strong {
  font-size: 1.4rem;
  color: var(--accent);
}
input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
  margin: 0.4rem 0 0.6rem;
}
.compare {
  margin-top: 0.9rem;
}
.compare tr.chosen td {
  color: var(--accent);
}
.compare tr.mine td {
  font-weight: 700;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.players {
  overflow-x: auto;
}
.players__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.players__header h2 {
  margin: 0;
}
.add {
  display: flex;
  gap: 0.3rem;
}
.counts {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.players td {
  padding: 0.25rem 0.4rem;
}
.pos-select {
  font-weight: 700;
  font-size: 0.75rem;
  padding: 0.25rem;
  border: none;
  color: #fff;
}
.name-cell {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}
.name-cell input {
  flex: 1;
  min-width: 140px;
}
.num-input {
  width: 4.2rem;
  text-align: right;
}
.invalid {
  border-color: var(--bad) !important;
}
.icon-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.95rem;
  padding: 0.2rem 0.35rem;
  border-radius: 4px;
}
.star-toggle.on {
  color: #fbbf24;
  text-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.builder__footer {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
  position: sticky;
  bottom: 0.75rem;
}
.builder__footer label {
  flex-direction: row;
  align-items: center;
  color: var(--text);
  font-size: 1rem;
}
.problems {
  flex: 1;
  margin: 0;
  padding-left: 1rem;
  color: var(--warn);
  font-size: 0.85rem;
}
.builder__footer > .good {
  flex: 1;
}
</style>
