<script setup lang="ts">
import { confidenceTone } from '../data/confidence'
import type { Confidence } from '../types/game'

withDefaults(defineProps<{ confidence: Confidence; compact?: boolean }>(), { compact: false })

const METERS = [
  { key: 'board', label: 'Diretoria', icon: '👔', hint: 'Cobra resultados, posição na tabela e finanças' },
  { key: 'club', label: 'Clube', icon: '📣', hint: 'Torcida e vestiário: resultados, ídolos vendidos, reforços, preço do ingresso' },
] as const
</script>

<template>
  <div class="meters" :class="{ compact }">
    <div
      v-for="m in METERS"
      :key="m.key"
      class="meter"
      :title="`${m.label}: ${confidence[m.key]}% · ${m.hint}. Em 0% o técnico é demitido.`"
    >
      <span class="meter__label">{{ m.icon }}<template v-if="!compact"> {{ m.label }}</template></span>
      <div class="meter__bar">
        <div :class="confidenceTone(confidence[m.key])" :style="{ width: `${confidence[m.key]}%` }" />
      </div>
      <span class="meter__value" :class="confidenceTone(confidence[m.key])">{{ confidence[m.key] }}%</span>
    </div>
  </div>
</template>

<style scoped>
.meters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.meters.compact {
  gap: 0.15rem;
  cursor: help;
}
.meter {
  display: grid;
  grid-template-columns: 6.5rem 1fr 3rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.compact .meter {
  grid-template-columns: 1.1rem 4.5rem 2.2rem;
  gap: 0.3rem;
  font-size: 0.7rem;
}
.meter__bar {
  height: 10px;
  border-radius: 5px;
  background: var(--surface-2);
  overflow: hidden;
}
.compact .meter__bar {
  height: 6px;
}
.meter__bar div {
  height: 100%;
  transition: width 0.3s;
}
.meter__bar .good {
  background: var(--good);
}
.meter__bar .warn {
  background: var(--warn);
}
.meter__bar .bad {
  background: var(--bad);
}
.meter__value {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.meter__value.good {
  color: var(--good);
}
.meter__value.warn {
  color: var(--warn);
}
.meter__value.bad {
  color: var(--bad);
}
</style>
