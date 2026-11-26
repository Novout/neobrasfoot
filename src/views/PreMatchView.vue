<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatBar from '../components/StatBar.vue'
import PitchLineup from '../components/PitchLineup.vue'
import PlayerStatus from '../components/PlayerStatus.vue'
import StarMark from '../components/StarMark.vue'
import SkillBadges from '../components/SkillBadges.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { isAvailable, unavailableReason } from '../data/discipline'
import { defenseSplit } from '../data/defense'
import CountryTag from '../components/CountryTag.vue'
import PosTag from '../components/PosTag.vue'
import ShirtNumber from '../components/ShirtNumber.vue'
import { FORMATIONS, markingOf, MARKINGS, PLAY_STYLES, playingPosition, POSITION_ORDER } from '../data/tactics'
import { effectiveRating, useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import type { Formation, Marking, PlayStyle } from '../types/game'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const formations = Object.keys(FORMATIONS) as Formation[]

/** O que mudou na escalação ao trocar a formação (o jogo ajusta os titulares sozinho). */
const lineupChanges = ref<{ formation: Formation; changes: string[] } | null>(null)
function changeFormation(formation: Formation) {
  const changes = game.setFormation(formation)
  lineupChanges.value = { formation, changes }
}
/** Campo com camisas para arrastar ou a lista clássica por posição. */
const lineupView = ref<'campo' | 'lista'>('campo')
const styles = Object.keys(PLAY_STYLES) as PlayStyle[]
const markings = Object.keys(MARKINGS) as Marking[]
const marking = computed(() => markingOf(game.tactic))

const required = computed(() => FORMATIONS[game.tactic.formation])
const startersByPos = computed(() =>
  Object.fromEntries(POSITION_ORDER.map((pos) => [pos, game.starters.filter((p) => playingPosition(p) === pos).length])),
)

const groups = computed(() =>
  POSITION_ORDER.map((pos) => ({
    pos,
    players: (game.managedTeam?.players ?? [])
      .filter((p) => p.position === pos)
      .sort((a, b) => effectiveRating(b) - effectiveRating(a)),
  })),
)

const myStrength = computed(() => game.managedTeamId && game.teamStrength(game.managedTeamId))
const oppStrength = computed(() => game.nextOpponent && game.teamStrength(game.nextOpponent.id))

const problems = computed(() => {
  const list: string[] = []
  if (game.starters.length !== 11) list.push(`Escale exatamente 11 titulares (${game.starters.length}/11).`)
  if (startersByPos.value.GOL !== 1) list.push('É preciso ter exatamente 1 goleiro.')
  for (const p of game.starters.filter((s) => !isAvailable(s))) list.push(`${p.name} não pode jogar: ${unavailableReason(p)}.`)
  return list
})

/** Fase da Copa em que o clube já foi eliminado: só acompanha os outros jogos. */
const spectating = computed(() => game.nextEvent === 'cup' && !game.nextFixture)
const canPlay = computed(() => spectating.value || (problems.value.length === 0 && !!game.nextFixture))

function play() {
  if (!canPlay.value) return
  match.setupRound()
  router.push({ name: 'matches' })
}
</script>

<template>
  <div v-if="game.managedTeam" class="prematch">
    <section class="card prematch__lineup">
      <div class="lineup-header">
        <h2>Escalação</h2>
        <span class="count" :class="{ ok: game.starters.length === 11 }">{{ game.starters.length }}/11</span>
        <div class="view-toggle">
          <button class="btn btn--sm" :class="{ 'btn--ghost': lineupView !== 'campo' }" @click="lineupView = 'campo'">Campo</button>
          <button class="btn btn--sm" :class="{ 'btn--ghost': lineupView !== 'lista' }" @click="lineupView = 'lista'">Lista</button>
        </div>
        <button class="btn btn--ghost btn--sm" @click="game.autoSelectStarters()">Escalação automática</button>
      </div>

      <PitchLineup v-if="lineupView === 'campo'" />

      <div v-for="group in lineupView === 'lista' ? groups : []" :key="group.pos" class="pos-group">
        <h3>
          <span class="pos" :class="`pos--${group.pos}`">{{ group.pos }}</span>
          <span :class="startersByPos[group.pos] === required[group.pos] ? 'ok' : 'warn'">
            {{ startersByPos[group.pos] }}/{{ required[group.pos] }}
          </span>
          <small v-if="group.pos === 'DEF'" class="muted def-split">
            {{ defenseSplit(required.DEF).LAT ? `${defenseSplit(required.DEF).LAT} laterais + ` : '' }}{{ defenseSplit(required.DEF).ZAG }} zagueiros
          </small>
        </h3>
        <ul>
          <li
            v-for="p in group.players"
            :key="p.id"
            class="player-row"
            :class="{ starter: p.starter, unavailable: !isAvailable(p) }"
            :title="unavailableReason(p) ?? ''"
            @click="game.toggleStarter(p.id)"
          >
            <input type="checkbox" :checked="p.starter" tabindex="-1" />
            <span class="name">
              <ShirtNumber :number="p.number" />
              <PosTag v-if="p.position === 'DEF'" :player="p" />
              {{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" /><PlayerStatus :player="p" />
              <span v-if="p.forSale" class="for-sale" title="Listado para venda">à venda</span>
            </span>
            <span class="muted">{{ p.age }}a</span>
            <strong>{{ p.overall }}</strong>
            <StatBar :value="p.energy" />
          </li>
        </ul>
      </div>
    </section>

    <aside class="prematch__side">
      <div v-if="game.nextOpponent" class="card versus" :class="{ 'versus--cup': game.nextEvent === 'cup' || game.nextEvent === 'libertadores' }">
        <h3>{{ game.nextEventLabel }}</h3>
        <p v-if="game.nextEvent === 'cup' || (game.nextEvent === 'libertadores' && game.libertadoresKnockout)" class="muted small">
          Jogo único: se empatar, decide nos pênaltis.
        </p>
        <p v-else-if="game.nextEvent === 'libertadores'" class="muted small">Fase de grupos: passam os 2 primeiros de cada grupo.</p>
        <div class="versus__teams">
          <div>
            <TeamBadge :team="game.managedTeam" :size="56" />
            <strong>{{ game.managedTeam.name }}</strong>
          </div>
          <span class="muted">x</span>
          <div>
            <TeamBadge :team="game.nextOpponent" :size="56" />
            <strong>{{ game.nextOpponent.name }} <CountryTag v-if="game.nextOpponent.country" :team="game.nextOpponent" /></strong>
          </div>
        </div>
        <table v-if="myStrength && oppStrength" class="compare">
          <tbody>
            <tr>
              <td class="num">{{ myStrength.attack.toFixed(1) }}</td>
              <th>Ataque</th>
              <td>{{ oppStrength.attack.toFixed(1) }}</td>
            </tr>
            <tr>
              <td class="num">{{ myStrength.defense.toFixed(1) }}</td>
              <th>Defesa</th>
              <td>{{ oppStrength.defense.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="spectating" class="card">
        <h3>{{ game.nextEventLabel }}</h3>
        <p class="muted">Seu time está fora da Copa. Inicie a rodada para acompanhar os outros jogos.</p>
      </div>
      <div v-else class="card">
        <p>Não há jogos pendentes nesta temporada.</p>
        <button class="btn" @click="router.push({ name: 'dashboard' })">Voltar ao dashboard</button>
      </div>

      <div class="card">
        <h3>Táticas</h3>
        <label class="field">
          Formação
          <select :value="game.tactic.formation" @change="changeFormation(($event.target as HTMLSelectElement).value as Formation)">
            <option v-for="f in formations" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <div class="field">
          Estilo de jogo
          <div class="styles">
            <button
              v-for="s in styles"
              :key="s"
              class="btn btn--sm"
              :class="{ 'btn--ghost': game.tactic.style !== s }"
              @click="game.setStyle(s)"
            >
              {{ PLAY_STYLES[s].label }}
            </button>
          </div>
        </div>
        <div class="field">
          Marcação
          <div class="styles">
            <button
              v-for="mk in markings"
              :key="mk"
              class="btn btn--sm"
              :class="{ 'btn--ghost': marking !== mk }"
              :title="MARKINGS[mk].hint"
              @click="game.setMarking(mk)"
            >
              {{ MARKINGS[mk].label }}
            </button>
          </div>
          <small class="muted marking-hint">{{ MARKINGS[marking].hint }}</small>
        </div>
        <div v-if="lineupChanges?.changes.length" class="lineup-changes small">
          <strong>Escalação ajustada para o {{ lineupChanges.formation }}:</strong>
          <ul>
            <li v-for="c in lineupChanges.changes" :key="c">{{ c }}</li>
          </ul>
        </div>
        <p v-else-if="lineupChanges" class="muted small">Os titulares já cabiam no {{ lineupChanges.formation }}: nada mudou.</p>
        <p v-if="myStrength && !myStrength.matchesFormation" class="warn small">
          Os titulares não batem com a formação {{ game.tactic.formation }} — o time perde rendimento.
        </p>
      </div>

      <div class="card">
        <ul v-if="problems.length && !spectating" class="problems">
          <li v-for="msg in problems" :key="msg">{{ msg }}</li>
        </ul>
        <button class="btn play" :disabled="!canPlay" @click="play">Iniciar rodada ▶</button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.prematch {
  display: grid;
  /* minmax(0, …): sem isso o tamanho interno do canvas alarga a coluna. */
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .prematch {
    grid-template-columns: minmax(0, 1fr);
  }
}
.prematch__side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.lineup-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.lineup-header h2 {
  margin: 0;
}
.view-toggle {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}
.count {
  font-weight: 700;
  color: var(--warn);
}
.ok {
  color: var(--good);
}
.warn {
  color: var(--warn);
}
.small {
  font-size: 0.85rem;
}
.pos-group h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.95rem;
}
.pos-group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: 0.35rem;
}
.def-split {
  font-size: 0.78rem;
  font-weight: 400;
}
.player-row {
  display: grid;
  grid-template-columns: auto 1fr auto 2rem auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
}
.player-row.unavailable {
  opacity: 0.45;
  cursor: not-allowed;
}
.player-row.starter {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.for-sale {
  margin-left: 0.3rem;
  font-size: 0.7rem;
  color: var(--bad);
}
.player-row input {
  pointer-events: none;
  accent-color: var(--accent);
}
.versus--cup {
  border-color: var(--warn);
}
.versus--cup h3 {
  color: var(--warn);
}
.versus {
  text-align: center;
}
.versus__teams {
  display: flex;
  align-items: center;
  justify-content: space-around;
}
.versus__teams > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  max-width: 120px;
}
.compare {
  margin-top: 1rem;
}
.compare th {
  text-align: center;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
}
.styles {
  display: flex;
  gap: 0.35rem;
}
.marking-hint {
  font-size: 0.75rem;
  line-height: 1.3;
}
.lineup-changes {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--text);
}
.lineup-changes ul {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
}
.problems {
  color: var(--warn);
  font-size: 0.85rem;
  padding-left: 1rem;
  margin-top: 0;
}
.play {
  width: 100%;
  padding: 0.75rem;
  font-size: 1.05rem;
}
</style>
