<script setup lang="ts">
import PosTag from './PosTag.vue'
import { computed } from 'vue'
import { nextKickingTeam, shootoutScore } from '../data/penalties'
import { clockLabel } from '../data/stoppage'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
import type { PenaltyKick } from '../types/game'
import { playGoalAgainst, playGoalFor } from '../utils/sounds'
import SkillBadges from './SkillBadges.vue'
import StarMark from './StarMark.vue'
import TeamBadge from './TeamBadge.vue'

/** Escolha do batedor: pênalti durante o jogo ou disputa de pênaltis da copa. */
const game = useGameStore()
const match = useMatchStore()

const myId = computed(() => game.managedTeamId ?? '')
const m = computed(() => match.managedMatch)
const opponent = computed(() => (m.value ? game.getTeam(m.value.homeId === myId.value ? m.value.awayId : m.value.homeId) : null))
const percent = (chance: number) => `${Math.round(chance * 100)}%`

// --- Disputa ---
const s = computed(() => match.shootout)
const score = computed(() => (s.value ? shootoutScore(s.value) : null))
const myScore = computed(() => (s.value && score.value ? (s.value.homeId === myId.value ? score.value.home : score.value.away) : 0))
const theirScore = computed(() => (s.value && score.value ? (s.value.homeId === myId.value ? score.value.away : score.value.home) : 0))
const myKicks = computed(() => s.value?.kicks.filter((k) => k.teamId === myId.value) ?? [])
const theirKicks = computed(() => s.value?.kicks.filter((k) => k.teamId !== myId.value) ?? [])
const myTurn = computed(() => !!s.value && !s.value.done && nextKickingTeam(s.value) === myId.value)
/** Marcadores das 5 cobranças regulares (e das alternadas, na morte súbita). */
const slots = (kicks: PenaltyKick[]) => Math.max(5, kicks.length)
const won = computed(() => myScore.value > theirScore.value)

function kick(playerId: string) {
  const before = s.value?.kicks.length ?? 0
  const mine = match.shootoutKick(playerId)
  if (!mine) return
  // Som da sua cobrança e, se a IA respondeu, da dela.
  if (mine.scored) playGoalFor()
  const answer = s.value?.kicks.slice(before + 1).find((k) => k.teamId !== myId.value)
  if (answer?.scored) setTimeout(playGoalAgainst, 700)
}

function takePenalty(playerId: string) {
  match.takePenalty(playerId)
}
</script>

<template>
  <section v-if="m && opponent" class="card penalty">
    <!-- Pênalti durante o jogo -->
    <template v-if="match.penaltyBreak">
      <header class="penalty__header">
        <h2>⚽ Pênalti para o seu time! ({{ clockLabel(match.penaltyBreak.minute, match.penaltyBreak.extra) }})</h2>
        <p class="muted">Falta na área. Escolha quem vai bater — a chance considera o batedor, as habilidades e o goleiro do {{ opponent.shortName }}.</p>
      </header>
      <ul class="takers">
        <li v-for="(t, i) in match.penaltyTakers" :key="t.player.id">
          <PosTag :player="t.player" />
          <span class="name">{{ t.player.name }}<StarMark :star="t.player.star" /><SkillBadges :player="t.player" /></span>
          <strong>{{ t.player.overall }}</strong>
          <span class="chance" :class="{ best: i === 0 }">{{ percent(t.chance) }}</span>
          <button class="btn btn--sm" @click="takePenalty(t.player.id)">Bater</button>
        </li>
      </ul>
    </template>

    <!-- Disputa de pênaltis -->
    <template v-else-if="s">
      <header class="penalty__header">
        <h2>🥅 Disputa de pênaltis</h2>
        <p class="muted">
          Empate no tempo normal: 5 cobranças para cada lado e, se continuar igual, morte súbita.
          {{ s.firstId === myId ? 'Seu time começa batendo.' : `O ${opponent.shortName} começa batendo.` }}
        </p>
      </header>

      <div class="board">
        <div class="board__row">
          <TeamBadge :team="game.managedTeam!" :size="26" />
          <span class="board__team">{{ game.managedTeam?.shortName }}</span>
          <span class="kicks">
            <span
              v-for="i in slots(myKicks)"
              :key="i"
              class="kick"
              :class="myKicks[i - 1] ? (myKicks[i - 1]!.scored ? 'kick--goal' : 'kick--miss') : ''"
              :title="myKicks[i - 1] ? `${myKicks[i - 1]!.playerName}: ${myKicks[i - 1]!.scored ? 'gol' : 'perdeu'}` : ''"
            >{{ myKicks[i - 1] ? (myKicks[i - 1]!.scored ? '✓' : '✗') : '' }}</span>
          </span>
          <strong class="board__score">{{ myScore }}</strong>
        </div>
        <div class="board__row">
          <TeamBadge :team="opponent" :size="26" />
          <span class="board__team">{{ opponent.shortName }}</span>
          <span class="kicks">
            <span
              v-for="i in slots(theirKicks)"
              :key="i"
              class="kick"
              :class="theirKicks[i - 1] ? (theirKicks[i - 1]!.scored ? 'kick--goal' : 'kick--miss') : ''"
              :title="theirKicks[i - 1] ? `${theirKicks[i - 1]!.playerName}: ${theirKicks[i - 1]!.scored ? 'gol' : 'perdeu'}` : ''"
            >{{ theirKicks[i - 1] ? (theirKicks[i - 1]!.scored ? '✓' : '✗') : '' }}</span>
          </span>
          <strong class="board__score">{{ theirScore }}</strong>
        </div>
      </div>

      <ol v-if="s.kicks.length" class="history">
        <li v-for="(k, i) in s.kicks" :key="i" :class="k.teamId === myId ? 'mine' : 'theirs'">
          {{ k.scored ? '⚽' : '❌' }} {{ k.playerName }} <span class="muted">({{ game.getTeam(k.teamId)?.shortName }})</span>
        </li>
      </ol>

      <template v-if="s.done">
        <p class="result" :class="won ? 'good' : 'bad'">
          {{ won ? `🏆 Classificado! Vitória por ${myScore} x ${theirScore} nos pênaltis.` : `Eliminado nos pênaltis (${myScore} x ${theirScore}).` }}
        </p>
        <footer class="penalty__actions">
          <button class="btn" @click="match.closeShootout()">Continuar</button>
        </footer>
      </template>
      <template v-else-if="myTurn">
        <h3>Escolha o próximo batedor</h3>
        <ul class="takers">
          <li v-for="(t, i) in match.shootoutTakers" :key="t.player.id">
            <PosTag :player="t.player" />
            <span class="name">{{ t.player.name }}<StarMark :star="t.player.star" /><SkillBadges :player="t.player" /></span>
            <strong>{{ t.player.overall }}</strong>
            <span class="chance" :class="{ best: i === 0 }">{{ percent(t.chance) }}</span>
            <button class="btn btn--sm" @click="kick(t.player.id)">Bater</button>
          </li>
        </ul>
        <footer class="penalty__actions">
          <button class="btn btn--ghost btn--sm" title="Os melhores batedores cobram até o fim" @click="match.autoShootout()">⏭ Simular o resto da disputa</button>
        </footer>
      </template>
    </template>
  </section>
</template>

<style scoped>
.penalty {
  border-color: var(--warn);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.penalty__header h2 {
  margin: 0 0 0.25rem;
  color: var(--warn);
}
.penalty__header p {
  margin: 0;
  font-size: 0.85rem;
}
h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
}
.takers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
  gap: 0.3rem;
}
.takers li {
  display: grid;
  grid-template-columns: auto 1fr 2rem 3rem auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.85rem;
}
.chance {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.chance.best {
  color: var(--good);
  font-weight: 700;
}
.board {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  border-radius: 8px;
  background: var(--surface-2);
}
.board__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.board__team {
  width: 3rem;
  font-weight: 700;
}
.board__score {
  margin-left: auto;
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
}
.kicks {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.kick {
  display: inline-grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  border: 2px solid var(--border);
  font-size: 0.75rem;
  font-weight: 800;
}
.kick--goal {
  background: var(--good);
  border-color: var(--good);
  color: #062312;
}
.kick--miss {
  background: var(--bad);
  border-color: var(--bad);
  color: #fff;
}
.history {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.9rem;
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.8rem;
}
.history .mine {
  color: var(--accent);
}
.result {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.penalty__actions {
  display: flex;
  justify-content: flex-end;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
</style>
