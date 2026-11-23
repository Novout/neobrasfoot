<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { crestSrc } from '../data/crests'
import type { Team } from '../types/game'

const props = withDefaults(
  defineProps<{ team: Pick<Team, 'shortName' | 'primaryColor' | 'secondaryColor'> & Partial<Pick<Team, 'crest' | 'name'>>; size?: number }>(),
  { size: 40 },
)

/** Imagem que não carregou (link quebrado, offline sem cache): volta ao distintivo com as cores. */
const failed = ref(false)
const src = computed(() => (failed.value ? null : crestSrc(props.team.crest)))
watch(() => props.team.crest, () => (failed.value = false))
</script>

<template>
  <img
    v-if="src"
    class="crest"
    :src="src"
    :alt="team.name ? `Escudo do ${team.name}` : team.shortName"
    :title="team.name"
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
    @error="failed = true"
  />
  <span
    v-else
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
.crest {
  flex-shrink: 0;
  object-fit: contain;
  /* Escudos escuros continuam visíveis sobre o fundo escuro. */
  filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.35)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}
</style>
