<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number }>()

const color = computed(() => (props.value >= 70 ? 'var(--good)' : props.value >= 40 ? 'var(--warn)' : 'var(--bad)'))
</script>

<template>
  <div class="stat-bar" :title="`${Math.round(value)}%`">
    <div class="stat-bar__fill" :style="{ width: `${value}%`, background: color }" />
    <span>{{ Math.round(value) }}</span>
  </div>
</template>

<style scoped>
.stat-bar {
  position: relative;
  width: 80px;
  height: 16px;
  background: var(--surface-2);
  border-radius: 4px;
  overflow: hidden;
}
.stat-bar__fill {
  height: 100%;
  transition: width 0.3s;
}
.stat-bar span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px #000;
}
</style>
