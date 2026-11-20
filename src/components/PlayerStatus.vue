<script setup lang="ts">
import { computed } from 'vue'
import { injuryGames, suspensionGames, YELLOWS_FOR_SUSPENSION } from '../data/discipline'
import type { Player } from '../types/game'

const props = defineProps<{ player: Pick<Player, 'injury' | 'suspension' | 'yellowCards'> }>()

const injury = computed(() => injuryGames(props.player))
const suspension = computed(() => suspensionGames(props.player))
const yellows = computed(() => props.player.yellowCards ?? 0)
const games = (n: number) => `${n} jogo${n > 1 ? 's' : ''}`
</script>

<template>
  <span v-if="injury" class="status status--injury" :title="`Lesionado: fora por mais ${games(injury)}`">🩹 {{ injury }}</span>
  <span v-if="suspension" class="status status--red" :title="`Suspenso: cumpre mais ${games(suspension)}`">🟥 {{ suspension }}</span>
  <span
    v-if="yellows && !suspension"
    class="status status--yellow"
    :title="`${yellows} amarelo(s) acumulado(s); com ${YELLOWS_FOR_SUSPENSION} cumpre suspensão`"
  >
    🟨 {{ yellows }}
  </span>
</template>

<style scoped>
.status {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: help;
}
.status--injury {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}
.status--red {
  background: rgba(239, 68, 68, 0.25);
  color: #fecaca;
}
.status--yellow {
  background: rgba(234, 179, 8, 0.15);
  color: var(--warn);
}
</style>
