<script setup lang="ts">
import { computed, ref } from 'vue'
import { HEADLINE_ICONS, HEADLINE_LABELS, type Headline, type HeadlineKind } from '../data/headlines'

const props = defineProps<{ headlines: Headline[]; myTeamId: string | null }>()

type Filter = 'todas' | 'jogos' | 'mercado'
const FILTERS: Record<Filter, { label: string; kinds: HeadlineKind[] }> = {
  todas: { label: 'Todas', kinds: ['goleada', 'zebra', 'venda', 'emprestimo'] },
  jogos: { label: '⚽ Jogos', kinds: ['goleada', 'zebra'] },
  mercado: { label: '💰 Mercado', kinds: ['venda', 'emprestimo'] },
}
const filter = ref<Filter>('todas')
/** Quantas rodadas aparecem (as mais recentes primeiro). */
const roundsShown = ref(2)

const groups = computed(() => {
  const kinds = FILTERS[filter.value].kinds
  const map = new Map<string, { key: string; label: string; items: Headline[] }>()
  for (const h of props.headlines) {
    if (!kinds.includes(h.kind)) continue
    const key = `${h.season}-${h.round}`
    if (!map.has(key)) map.set(key, { key, label: `Temporada ${h.season} · Rodada ${h.round}`, items: [] })
    map.get(key)!.items.push(h)
  }
  return [...map.values()]
})
const visible = computed(() => groups.value.slice(0, roundsShown.value))

const isMine = (h: Headline) => !!props.myTeamId && h.teamIds.includes(props.myTeamId)
</script>

<template>
  <div class="card headlines">
    <div class="headlines__head">
      <h3>📰 Giro da rodada</h3>
      <div class="headlines__filters">
        <button
          v-for="(f, key) in FILTERS"
          :key="key"
          class="chip"
          :class="{ 'chip--on': filter === key }"
          @click="filter = key; roundsShown = 2"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <p v-if="!groups.length" class="muted empty">
      Nenhuma manchete ainda. Goleadas, zebras e negócios caros da liga aparecem aqui a cada rodada.
    </p>

    <section v-for="g in visible" :key="g.key" class="round">
      <h4>{{ g.label }}</h4>
      <article v-for="h in g.items" :key="h.id" class="item" :class="[`item--${h.kind}`, { 'item--mine': isMine(h) }]">
        <span class="item__icon" :title="HEADLINE_LABELS[h.kind]">{{ HEADLINE_ICONS[h.kind] }}</span>
        <div>
          <p class="item__context">
            {{ HEADLINE_LABELS[h.kind] }} · {{ h.context }}
            <span v-if="isMine(h)" class="tag-mine">seu clube</span>
          </p>
          <strong class="item__title">{{ h.title }}</strong>
          <p class="item__text">{{ h.text }}</p>
        </div>
      </article>
    </section>

    <button v-if="groups.length > roundsShown" class="more" @click="roundsShown += 3">Ver rodadas anteriores</button>
  </div>
</template>

<style scoped>
.headlines__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.headlines__head h3 {
  margin: 0;
}
.headlines__filters {
  display: flex;
  gap: 0.25rem;
}
.chip {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.chip--on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.empty {
  font-size: 0.85rem;
  margin: 0.75rem 0 0;
}
.round h4 {
  margin: 0.85rem 0 0.4rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.item {
  display: grid;
  grid-template-columns: 1.6rem 1fr;
  gap: 0.4rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  border-left: 3px solid var(--border);
  background: var(--surface-2);
  margin-bottom: 0.35rem;
}
.item--goleada {
  border-left-color: var(--good);
}
.item--zebra {
  border-left-color: var(--warn);
}
.item--venda {
  border-left-color: #60a5fa;
}
.item--emprestimo {
  border-left-color: #c084fc;
}
.item--mine {
  outline: 1px solid var(--accent);
}
.item__icon {
  font-size: 1.1rem;
  line-height: 1.4;
}
.item__context {
  margin: 0;
  font-size: 0.7rem;
  color: var(--muted);
}
.item__title {
  display: block;
  font-size: 0.85rem;
  line-height: 1.25;
}
.item__text {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.tag-mine {
  margin-left: 0.25rem;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.more {
  width: 100%;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  padding: 0.35rem;
  border-radius: 6px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.more:hover {
  color: var(--text);
}
</style>
