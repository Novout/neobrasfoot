<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import StatBar from '../components/StatBar.vue'
import StarMark from '../components/StarMark.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { FORMATIONS, PLAY_STYLES, POSITION_ORDER } from '../data/tactics'
import { effectiveRating, useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import type { Formation, PlayStyle } from '../types/game'

const game = useGameStore()
const match = useMatchStore()
const router = useRouter()

const formations = Object.keys(FORMATIONS) as Formation[]
const styles = Object.keys(PLAY_STYLES) as PlayStyle[]

const required = computed(() => FORMATIONS[game.tactic.formation])
const startersByPos = computed(() =>
  Object.fromEntries(POSITION_ORDER.map((pos) => [pos, game.starters.filter((p) => p.position === pos).length])),
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
        <button class="btn btn--ghost btn--sm" @click="game.autoSelectStarters()">Escalação automática</button>
      </div>

      <div v-for="group in groups" :key="group.pos" class="pos-group">
        <h3>
          <span class="pos" :class="`pos--${group.pos}`">{{ group.pos }}</span>
          <span :class="startersByPos[group.pos] === required[group.pos] ? 'ok' : 'warn'">
            {{ startersByPos[group.pos] }}/{{ required[group.pos] }}
          </span>
        </h3>
        <ul>
          <li
            v-for="p in group.players"
            :key="p.id"
            class="player-row"
            :class="{ starter: p.starter }"
            @click="game.toggleStarter(p.id)"
          >
            <input type="checkbox" :checked="p.starter" tabindex="-1" />
            <span class="name">
              {{ p.name }}<StarMark :star="p.star" />
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
      <div v-if="game.nextOpponent" class="card versus" :class="{ 'versus--cup': game.nextEvent === 'cup' }">
        <h3>{{ game.nextEventLabel }}</h3>
        <p v-if="game.nextEvent === 'cup'" class="muted small">Jogo único: se empatar, decide nos pênaltis.</p>
        <div class="versus__teams">
          <div>
            <TeamBadge :team="game.managedTeam" :size="56" />
            <strong>{{ game.managedTeam.name }}</strong>
          </div>
          <span class="muted">x</span>
          <div>
            <TeamBadge :team="game.nextOpponent" :size="56" />
            <strong>{{ game.nextOpponent.name }}</strong>
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
          <select :value="game.tactic.formation" @change="game.setFormation(($event.target as HTMLSelectElement).value as Formation)">
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
  grid-template-columns: 1fr 340px;
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .prematch {
    grid-template-columns: 1fr;
  }
}
.prematch__side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.lineup-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.lineup-header h2 {
  margin: 0;
}
.lineup-header .btn {
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
