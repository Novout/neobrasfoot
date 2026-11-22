<script setup lang="ts">
import { computed } from 'vue'
import { FOOT_LABELS, playerFoot } from '../data/feet'
import { playerSkills, SKILLS } from '../data/skills'
import type { Player } from '../types/game'

/** Ícones das 2 habilidades do jogador; o nome e o efeito aparecem ao passar o mouse. */
const props = withDefaults(defineProps<{ player: Pick<Player, 'id' | 'position' | 'skills' | 'foot'>; labels?: boolean }>(), {
  labels: false,
})

const skills = computed(() => playerSkills(props.player).map((id) => SKILLS[id]))
const foot = computed(() => playerFoot(props.player))
const footTitle = computed(() =>
  foot.value === 'A'
    ? 'Ambidestro: rende bem pelos dois lados do campo'
    : `${FOOT_LABELS[foot.value]}: rende mais pela ${foot.value === 'D' ? 'direita' : 'esquerda'} e menos pela ${foot.value === 'D' ? 'esquerda' : 'direita'}`,
)
</script>

<template>
  <span class="skills">
    <span class="foot" :class="`foot--${foot}`" :title="footTitle">{{ labels ? FOOT_LABELS[foot] : foot === 'A' ? 'AMB' : foot }}</span>
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
.foot {
  align-self: center;
  padding: 0 0.25rem;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1.4;
  cursor: help;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
}
.foot--E {
  color: #93c5fd;
  border-color: rgba(147, 197, 253, 0.4);
}
.foot--A {
  color: var(--warn);
  border-color: rgba(234, 179, 8, 0.4);
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
