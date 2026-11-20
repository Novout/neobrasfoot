<script setup lang="ts">
import type { Team } from '../types/game'

withDefaults(defineProps<{ team: Pick<Team, 'shortName' | 'primaryColor' | 'secondaryColor'>; size?: number }>(), {
  size: 40,
})
</script>

<template>
  <span
    class="badge"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${size * 0.3}px`,
      background: `linear-gradient(135deg, ${team.primaryColor} 55%, ${team.secondaryColor} 55%)`,
    }"
  >
    {{ team.shortName }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
