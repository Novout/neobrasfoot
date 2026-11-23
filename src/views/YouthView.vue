<script setup lang="ts">
import { computed } from 'vue'
import YouthAcademy from '../components/YouthAcademy.vue'
import { POSITION_ORDER } from '../data/tactics'
import { useGameStore } from '../stores/game'

const game = useGameStore()

/** Quantos jogadores o elenco tem em cada posição (ajuda a decidir quem subir). */
const byPosition = computed(() =>
  POSITION_ORDER.map((pos) => ({ pos, count: game.managedTeam?.players.filter((p) => p.position === pos).length ?? 0 })),
)
</script>

<template>
  <div v-if="game.managedTeam" class="youth">
    <header class="youth__header">
      <div>
        <h1>🎓 Base do {{ game.managedTeam.name }}</h1>
        <p class="muted">Temporada {{ game.academy?.season ?? game.season }} · a próxima geração chega no fim da temporada.</p>
      </div>
      <div class="squad-mix">
        <span class="muted">Seu elenco:</span>
        <span v-for="g in byPosition" :key="g.pos" class="squad-mix__item">
          <span class="pos" :class="`pos--${g.pos}`">{{ g.pos }}</span> {{ g.count }}
        </span>
      </div>
    </header>

    <YouthAcademy />
  </div>
</template>

<style scoped>
.youth {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.youth__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.youth__header h1 {
  margin: 0 0 0.25rem;
}
.youth__header p {
  margin: 0;
}
.squad-mix {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
}
.squad-mix__item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
}
</style>
