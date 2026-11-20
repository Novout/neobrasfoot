<script setup lang="ts">
import { STAR_ENERGY_FACTOR, STAR_OVERALL_BOOST } from '../data/stars'

defineProps<{ star?: boolean }>()

const tooltip = `Jogador estrela: +${STAR_OVERALL_BOOST} de OVR e gasta ${Math.round(STAR_ENERGY_FACTOR * 100)}% da energia normal`
</script>

<template>
  <span v-if="star" class="star-mark" :title="tooltip" aria-label="Jogador estrela">★</span>
</template>

<style scoped>
.star-mark {
  margin-left: 0.25rem;
  color: #fbbf24;
  text-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
  cursor: help;
}
</style>
