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

/** Escudo escuro (ex.: Tottenham, azul-marinho): ganha um fundo claro para aparecer no tema escuro. */
const dark = ref(false)
watch(src, (value) => (dark.value = value ? (darkCrests.get(value) ?? false) : false), { immediate: true })

function onLoad(event: Event) {
  const img = event.target as HTMLImageElement
  const key = img.getAttribute('src') ?? ''
  if (!darkCrests.has(key)) darkCrests.set(key, isDarkImage(img))
  dark.value = darkCrests.get(key)!
}
</script>

<script lang="ts">
/** Resultado da análise de cada escudo (por endereço), para não medir a mesma imagem várias vezes. */
const darkCrests = new Map<string, boolean>()

/**
 * Brilho médio dos pixels visíveis do escudo (0 = preto, 1 = branco), numa cópia pequena da imagem.
 * Escudos com brilho baixo somem no fundo escuro do jogo. Imagens de outro site que bloqueiam a leitura
 * (canvas "contaminado") contam como claras.
 */
function isDarkImage(img: HTMLImageElement): boolean {
  try {
    const side = 32
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = side
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, side, side)
    const { data } = ctx.getImageData(0, 0, side, side)
    let weight = 0
    let light = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]! / 255
      if (alpha < 0.2) continue
      const luminance = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255
      weight += alpha
      light += luminance * alpha
    }
    return weight > 0 && light / weight < DARK_LUMINANCE
  } catch {
    return false
  }
}

/** Abaixo deste brilho médio o escudo é considerado escuro. */
const DARK_LUMINANCE = 0.3
</script>

<template>
  <img
    v-if="src"
    class="crest"
    :class="{ 'crest--dark': dark }"
    :src="src"
    :alt="team.name ? `Escudo do ${team.name}` : team.shortName"
    :title="team.name"
    :width="size"
    :height="size"
    :style="dark ? { padding: `${Math.max(2, Math.round(size * 0.1))}px` } : undefined"
    loading="lazy"
    decoding="async"
    @load="onLoad"
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
/* Escudo escuro: disco claro atrás (o padding, proporcional ao tamanho, vem do componente). */
.crest--dark {
  box-sizing: border-box;
  border-radius: 50%;
  background: radial-gradient(circle, #ffffff 0%, #e8eef0 70%, #cfd8dc 100%);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}
</style>
