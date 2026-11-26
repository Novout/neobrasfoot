<script setup lang="ts">
import PosTag from './PosTag.vue'
import ShirtNumber from './ShirtNumber.vue'
import { computed, ref } from 'vue'
import { clockLabel } from '../data/stoppage'
import { PLAY_STYLES, POSITION_ORDER } from '../data/tactics'
import { effectiveRating, useGameStore } from '../stores/game'
import { MAX_SUBSTITUTIONS, useMatchStore } from '../stores/match'
import type { Player, PlayStyle } from '../types/game'
import StarMark from './StarMark.vue'
import SkillBadges from './SkillBadges.vue'
import StatBar from './StatBar.vue'
import TeamBadge from './TeamBadge.vue'

const game = useGameStore()
const match = useMatchStore()

/** Quem sai: id do jogador em campo, ou 'vaga' para preencher o lugar de um lesionado. */
// Parada por lesão já abre com a vaga do lesionado selecionada.
const outSelection = ref<string | null>(match.injuryBreak ? 'vaga' : null)
const inSelection = ref<string | null>(null)

const m = computed(() => match.managedMatch)
const myId = computed(() => game.managedTeamId ?? '')
const opponent = computed(() => (m.value ? game.getTeam(m.value.homeId === myId.value ? m.value.awayId : m.value.homeId) : null))
const score = computed(() => {
  if (!m.value) return ''
  const mine = m.value.homeId === myId.value ? m.value.homeGoals : m.value.awayGoals
  const theirs = m.value.homeId === myId.value ? m.value.awayGoals : m.value.homeGoals
  return `${mine} x ${theirs}`
})

const byPosition = (a: Player, b: Player) =>
  POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || effectiveRating(b) - effectiveRating(a)

const onPitch = computed(() => [...(match.lineups[myId.value] ?? [])].sort(byPosition))
const bench = computed(() => [...match.bench].sort(byPosition))

/** Amarelados no 1º tempo (correm risco de expulsão). */
const booked = computed(
  () => new Set(m.value?.events.filter((e) => e.teamId === myId.value && e.type === 'amarelo').map((e) => e.playerId) ?? []),
)
/** Quem se machucou no 1º tempo e deixou vaga. */
/** Lesionados cujo lugar ainda está vago. */
const injured = computed(() => {
  const events = m.value?.events.filter((e) => e.teamId === myId.value) ?? []
  const replaced = new Set(events.filter((e) => e.type === 'sub').map((e) => e.outId))
  return events.filter((e) => e.type === 'lesao' && !replaced.has(e.playerId))
})

const resumeLabel = computed(() => {
  const short = match.vacancies > 0 ? ' com um a menos' : ''
  return match.injuryBreak ? `▶ Continuar o jogo${short}` : `▶ Começar o 2º tempo${short}`
})

const subsLeft = computed(() => MAX_SUBSTITUTIONS - match.subsUsed)
const canConfirm = computed(
  () => subsLeft.value > 0 && !!inSelection.value && (outSelection.value === 'vaga' ? match.vacancies > 0 : !!outSelection.value),
)
const noGoalkeeper = computed(() => !onPitch.value.some((p) => p.position === 'GOL'))

function confirmSub() {
  if (!canConfirm.value) return
  match.substitute(outSelection.value === 'vaga' ? null : outSelection.value, inSelection.value!)
  outSelection.value = null
  inSelection.value = null
}

const styles = Object.keys(PLAY_STYLES) as PlayStyle[]
</script>

<template>
  <section v-if="m && opponent" class="card halftime">
    <header class="halftime__header">
      <div>
        <h2 v-if="match.injuryBreak">🩹 {{ match.injuryBreak.playerName }} se lesionou ({{ clockLabel(match.injuryBreak.minute, match.injuryBreak.extra) }})</h2>
        <h2 v-else>⏸ Intervalo</h2>
        <p class="muted">
          <TeamBadge :team="game.managedTeam!" :size="20" /> {{ game.managedTeam?.shortName }}
          <strong class="score">{{ score }}</strong>
          {{ opponent.shortName }} <TeamBadge :team="opponent" :size="20" />
        </p>
      </div>
      <div class="halftime__meta">
        <span :class="subsLeft ? 'good' : 'bad'">
          {{ subsLeft ? `Substituições restantes: ${subsLeft} de ${MAX_SUBSTITUTIONS}` : 'Sem substituições restantes' }}
        </span>
        <div class="styles">
          <span class="muted small">Estilo:</span>
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
    </header>

    <div class="columns">
      <div>
        <h3>Em campo · sai</h3>
        <ul class="list">
          <li
            v-for="p in onPitch"
            :key="p.id"
            :class="{ selected: outSelection === p.id }"
            @click="outSelection = outSelection === p.id ? null : p.id"
          >
            <PosTag :player="p" />
            <span class="name">
              <ShirtNumber :number="p.number" />{{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" />
              <span v-if="booked.has(p.id)" title="Amarelado: pode ser expulso">🟨</span>
            </span>
            <strong>{{ p.overall }}</strong>
            <StatBar :value="p.energy" />
          </li>
          <li
            v-for="(e, i) in injured.slice(0, match.vacancies)"
            :key="`vaga-${i}`"
            class="vacancy"
            :class="{ selected: outSelection === 'vaga' }"
            @click="outSelection = outSelection === 'vaga' ? null : 'vaga'"
          >
            🩹 <span class="name">Vaga de {{ e.playerName }} (lesionado)</span>
          </li>
        </ul>
      </div>

      <div>
        <h3>Banco · entra</h3>
        <ul class="list">
          <li
            v-for="p in bench"
            :key="p.id"
            :class="{ selected: inSelection === p.id }"
            @click="inSelection = inSelection === p.id ? null : p.id"
          >
            <PosTag :player="p" />
            <span class="name"><ShirtNumber :number="p.number" />{{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" /></span>
            <strong>{{ p.overall }}</strong>
            <StatBar :value="p.energy" />
          </li>
          <li v-if="!bench.length" class="muted">Nenhum reserva disponível.</li>
        </ul>
      </div>
    </div>

    <p v-if="noGoalkeeper" class="warn small">⚠️ Seu time está sem goleiro: a defesa vai sofrer muito no 2º tempo.</p>
    <p v-if="match.vacancies" class="muted small">
      Vaga aberta: se ninguém entrar, o time segue com um a menos (a força cai como numa expulsão).
    </p>

    <footer class="halftime__actions">
      <button class="btn btn--ghost" :disabled="!canConfirm" @click="confirmSub">🔄 Fazer substituição</button>
      <button class="btn" @click="match.resumeSecondHalf()">{{ resumeLabel }}</button>
    </footer>
  </section>
</template>

<style scoped>
.halftime {
  border-color: var(--warn);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.halftime__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.halftime__header h2 {
  margin: 0 0 0.25rem;
  color: var(--warn);
}
.halftime__header p {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
}
.score {
  font-size: 1.2rem;
  color: var(--text);
}
.halftime__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
}
.styles {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 800px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
.columns h3 {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 340px;
  overflow-y: auto;
}
.list li {
  display: grid;
  grid-template-columns: auto 1fr 2rem auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}
.list li:hover {
  background: var(--surface-2);
}
.list li.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.list li.vacancy {
  grid-template-columns: auto 1fr;
  border-style: dashed;
  color: var(--bad);
}
.halftime__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
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
