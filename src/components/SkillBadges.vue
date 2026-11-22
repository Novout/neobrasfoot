<script setup lang="ts">
import { computed } from 'vue'
import { playerSkills, SKILLS } from '../data/skills'
import type { Player } from '../types/game'

/** Ícones das 2 habilidades do jogador; o nome e o efeito aparecem ao passar o mouse. */
const props = withDefaults(defineProps<{ player: Pick<Player, 'id' | 'position' | 'skills'>; labels?: boolean }>(), {
  labels: false,
})

const skills = computed(() => playerSkills(props.player).map((id) => SKILLS[id]))
</script>

<template>
  <span class="skills">
    <span v-for="s in skills" :key="s.id" class="skill" :class="{ 'skill--label': labels }" :title="`${s.label}: ${s.description}`">
      {{ s.icon }}<template v-if="labels"> {{ s.label }}</template>
    </span>
  </span>
</template>

<style scoped>
.skills {
  display: inline-flex;
  gap: 0.15rem;
  margin-left: 0.3rem;
  vertical-align: middle;
}
.skill {
  font-size: 0.75rem;
  line-height: 1;
  cursor: help;
  filter: saturate(0.85);
}
.skill--label {
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 0.72rem;
  color: var(--text);
  white-space: nowrap;
}
</style>
