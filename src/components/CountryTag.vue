<script setup lang="ts">
import { computed } from 'vue'
import { COUNTRY_NAMES, countryOf } from '../data/libertadores'
import type { Team } from '../types/game'

/** Sigla do país de um clube (ARG, URU...), para a Libertadores. Clubes da liga são do Brasil. */
const props = defineProps<{ team: Pick<Team, 'country'> | null | undefined }>()
const code = computed(() => countryOf(props.team))
</script>

<template>
  <span class="country" :class="{ 'country--bra': code === 'BRA' }" :title="COUNTRY_NAMES[code] ?? code">{{ code }}</span>
</template>

<style scoped>
.country {
  display: inline-block;
  padding: 0 0.25rem;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1.4;
  color: var(--muted);
  border: 1px solid var(--border);
  vertical-align: middle;
}
.country--bra {
  color: var(--good);
  border-color: color-mix(in srgb, var(--good) 45%, transparent);
}
</style>
