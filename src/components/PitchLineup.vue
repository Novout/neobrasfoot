<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { isAvailable, unavailableReason } from '../data/discipline'
import { FORMATIONS, playingPosition, POSITION_ORDER, positionFit } from '../data/tactics'
import { effectiveRating, useGameStore } from '../stores/game'
import type { Player, Position } from '../types/game'

/**
 * Campo em <canvas> com os jogadores como camisas.
 * Arraste do banco para o campo (ou para cima de um titular, trocando), do campo para o banco,
 * ou de uma linha para outra do campo (o jogador é improvisado e rende menos fora da posição).
 */

const game = useGameStore()

const wrapper = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const width = ref(600)

/** Linha de cada posição no campo (fração da altura; o ataque fica em cima). */
const LINE_Y: Record<Position, number> = { ATA: 0.16, MEI: 0.41, DEF: 0.65, GOL: 0.86 }
const BENCH_CELL_W = 78
const BENCH_CELL_H = 84
const BENCH_TITLE_H = 34

interface Spot {
  key: string
  zone: 'pitch' | 'bench'
  player: Player | null
  /** Vaga vazia: posição que falta preencher na formação. */
  slotPosition?: Position
  /** Titular a mais na linha (não bate com a formação). */
  extra?: boolean
  /** Linha do campo em que a camisa está. */
  line?: Position
  x: number
  y: number
}

const shirt = computed(() => Math.max(28, Math.min(44, width.value / 14)))
// Em telas estreitas o campo fica mais "em pé" para as linhas não se espremerem.
const pitchH = computed(() => Math.round(Math.min(width.value * (width.value < 500 ? 1.1 : 0.72), 560)))

const benchPlayers = computed(() =>
  (game.managedTeam?.players ?? [])
    .filter((p) => !p.starter)
    .sort(
      (a, b) =>
        Number(isAvailable(b)) - Number(isAvailable(a)) ||
        POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
        effectiveRating(b) - effectiveRating(a),
    ),
)
const benchCols = computed(() => Math.max(1, Math.floor(width.value / BENCH_CELL_W)))
const height = computed(
  () => pitchH.value + BENCH_TITLE_H + Math.max(1, Math.ceil(benchPlayers.value.length / benchCols.value)) * BENCH_CELL_H,
)

const spots = computed<Spot[]>(() => {
  const list: Spot[] = []
  const required = FORMATIONS[game.tactic.formation]
  for (const pos of POSITION_ORDER) {
    const starters = game.starters.filter((p) => playingPosition(p) === pos).sort((a, b) => effectiveRating(b) - effectiveRating(a))
    const empty = Math.max(0, required[pos] - starters.length)
    const items: Omit<Spot, 'x' | 'y'>[] = [
      ...starters.map((p, i) => ({ key: p.id, zone: 'pitch' as const, player: p, extra: i >= required[pos], line: pos })),
      ...Array.from({ length: empty }, (_, i) => ({
        key: `vaga-${pos}-${i}`, zone: 'pitch' as const, player: null, slotPosition: pos, line: pos,
      })),
    ]
    items.forEach((item, i) =>
      list.push({ ...item, x: (width.value * (i + 1)) / (items.length + 1), y: pitchH.value * LINE_Y[pos] }),
    )
  }
  const cols = benchCols.value
  const cellW = width.value / cols
  benchPlayers.value.forEach((p, i) =>
    list.push({
      key: p.id,
      zone: 'bench',
      player: p,
      x: cellW * ((i % cols) + 0.5),
      y: pitchH.value + BENCH_TITLE_H + Math.floor(i / cols) * BENCH_CELL_H + shirt.value * 0.55,
    }),
  )
  return list
})

// --- Arrastar ---

const drag = ref<{ spot: Spot; x: number; y: number; moved: boolean } | null>(null)
const pointer = ref<{ x: number; y: number } | null>(null)
const hint = ref<string | null>(null)

function spotAt(x: number, y: number, ignoreKey?: string) {
  const r = shirt.value * 0.75
  return spots.value.find((s) => s.key !== ignoreKey && Math.abs(s.x - x) < r && y > s.y - r && y < s.y + r * 1.3) ?? null
}
const zoneAt = (y: number) => (y < pitchH.value ? 'pitch' : 'bench')

function localPoint(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onPointerDown(e: PointerEvent) {
  const { x, y } = localPoint(e)
  const spot = spotAt(x, y)
  if (!spot?.player) return
  if (spot.zone === 'bench' && !isAvailable(spot.player)) {
    hint.value = `${spot.player.name} não pode jogar: ${unavailableReason(spot.player)}.`
    return
  }
  canvas.value!.setPointerCapture(e.pointerId)
  drag.value = { spot, x, y, moved: false }
  hint.value = null
}

function onPointerMove(e: PointerEvent) {
  const p = localPoint(e)
  pointer.value = p
  if (drag.value) {
    drag.value.moved ||= Math.hypot(p.x - drag.value.spot.x, p.y - drag.value.spot.y) > 6
    drag.value.x = p.x
    drag.value.y = p.y
  }
}

function onPointerUp(e: PointerEvent) {
  const d = drag.value
  drag.value = null
  if (!d?.moved || !d.spot.player) return
  const { x, y } = localPoint(e)
  drop(d.spot, spotAt(x, y, d.spot.key), zoneAt(y), y)
}

function fitNote(p: Player, line: Position) {
  const fit = positionFit(p.position, line)
  return fit < 1 ? ` (${p.position} improvisado como ${line}: rende ${Math.round(fit * 100)}%)` : ''
}

/** Reserva entra no lugar de um titular, assumindo a linha dele. */
function swap(out: Player, inn: Player) {
  if (!isAvailable(inn)) {
    hint.value = `${inn.name} não pode jogar: ${unavailableReason(inn)}.`
    return
  }
  const line = playingPosition(out)
  game.substituteStarter(out.id, inn.id)
  hint.value = `🔄 ${inn.name} entra no lugar de ${out.name}${fitNote(inn, line)}.`
}

/** Linha do campo mais próxima da altura do ponteiro. */
function lineAt(y: number): Position {
  const frac = y / pitchH.value
  return POSITION_ORDER.reduce((best, pos) => (Math.abs(LINE_Y[pos] - frac) < Math.abs(LINE_Y[best] - frac) ? pos : best))
}

/** Titular sobrando numa linha (acima do que a formação pede): o mais fraco sai para dar lugar. */
function surplusStarter(): Player | null {
  const extras = spots.value.filter((s) => s.zone === 'pitch' && s.extra && s.player).map((s) => s.player!)
  return extras.sort((a, b) => effectiveRating(a) - effectiveRating(b))[0] ?? null
}

function drop(from: Spot, target: Spot | null, zone: 'pitch' | 'bench', y: number) {
  const player = from.player!
  if (from.zone === 'bench') {
    if (target?.zone === 'pitch' && target.player) return swap(target.player, player)
    if (zone !== 'pitch') return
    const line = target?.slotPosition ?? lineAt(y)
    if (game.starters.length >= 11) {
      // Ex.: trocou de 4-4-2 para 4-3-3 e a vaga de ATA está aberta: sai quem sobra no meio.
      const out = target?.slotPosition ? surplusStarter() : null
      if (!out) {
        hint.value = 'Já há 11 titulares: solte o reserva em cima de um titular (ou de uma vaga aberta) para trocar.'
        return
      }
      game.substituteStarter(out.id, player.id)
      game.setRole(player.id, line)
      hint.value = `🔄 ${player.name} entra como ${line} no lugar de ${out.name}${fitNote(player, line)}.`
      return
    }
    game.toggleStarter(player.id)
    game.setRole(player.id, line)
    hint.value = `✅ ${player.name} entrou no time titular${fitNote(player, line)}.`
    return
  }

  // Saindo do campo.
  if (target?.zone === 'bench' && target.player) return swap(player, target.player)
  if (zone === 'bench') {
    game.toggleStarter(player.id)
    hint.value = `${player.name} foi para o banco.`
    return
  }
  // Dentro do campo: troca de lugar com outro titular, ou muda de linha.
  if (target?.player && target.zone === 'pitch') {
    const mine = playingPosition(player)
    const theirs = playingPosition(target.player)
    if (mine === theirs) return
    game.setRole(player.id, theirs)
    game.setRole(target.player.id, mine)
    hint.value = `↔ ${player.name} e ${target.player.name} trocaram de posição.`
    return
  }
  const line = target?.slotPosition ?? lineAt(y)
  if (line === playingPosition(player)) return
  game.setRole(player.id, line)
  hint.value = `➡ ${player.name} passou a jogar como ${line}${fitNote(player, line)}.`
}

// --- Desenho ---

function textColorFor(hex: string) {
  const v = hex.replace('#', '')
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? '#111' : '#fff'
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0]!
}

function shirtPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const w = s / 2
  ctx.beginPath()
  ctx.moveTo(x - w * 0.35, y - w) // gola
  ctx.quadraticCurveTo(x, y - w * 0.7, x + w * 0.35, y - w)
  ctx.lineTo(x + w, y - w * 0.7) // ombro
  ctx.lineTo(x + w * 1.15, y - w * 0.15) // manga
  ctx.lineTo(x + w * 0.75, y - w * 0.05)
  ctx.lineTo(x + w * 0.75, y + w) // lateral
  ctx.lineTo(x - w * 0.75, y + w)
  ctx.lineTo(x - w * 0.75, y - w * 0.05)
  ctx.lineTo(x - w * 1.15, y - w * 0.15)
  ctx.lineTo(x - w, y - w * 0.7)
  ctx.closePath()
}

const theme = { orange: '#f97316', border: '#2a4536', muted: '#8fa89a', text: '#e8f1ec', accent: '#4ade80', warn: '#eab308', bad: '#ef4444', good: '#22c55e' }

function drawShirt(ctx: CanvasRenderingContext2D, spot: Spot, x: number, y: number, opts: { ghost?: boolean; target?: boolean } = {}) {
  const s = shirt.value
  const team = game.managedTeam!
  ctx.save()
  if (opts.ghost) ctx.globalAlpha = 0.25

  if (!spot.player) {
    // Vaga vazia na formação.
    shirtPath(ctx, x, y, s)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = opts.target ? theme.accent : 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = `600 ${Math.round(s * 0.28)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(spot.slotPosition!, x, y + s * 0.1)
    ctx.restore()
    return
  }

  const p = spot.player
  const available = isAvailable(p)
  if (!available && spot.zone === 'bench') ctx.globalAlpha *= 0.4

  if (opts.target) {
    ctx.beginPath()
    ctx.arc(x, y, s * 0.85, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(74, 222, 128, 0.25)'
    ctx.fill()
  }

  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  shirtPath(ctx, x, y, s)
  // Goleiro usa a cor secundária para se destacar, como no futebol de verdade.
  const fill = p.position === 'GOL' ? team.secondaryColor : team.primaryColor
  const trim = p.position === 'GOL' ? team.primaryColor : team.secondaryColor
  ctx.fillStyle = fill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 2
  const improvised = spot.zone === 'pitch' && playingPosition(p) !== p.position
  ctx.strokeStyle = !available ? theme.bad : spot.extra ? theme.warn : improvised ? theme.orange : trim
  ctx.stroke()

  // OVR no peito.
  ctx.fillStyle = textColorFor(fill)
  ctx.font = `700 ${Math.round(s * 0.36)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(p.overall), x, y + s * 0.12)

  if (p.star) {
    ctx.fillStyle = theme.warn
    ctx.font = `${Math.round(s * 0.32)}px system-ui, sans-serif`
    ctx.fillText('★', x + s * 0.55, y - s * 0.5)
  }
  if (!available) {
    ctx.font = `${Math.round(s * 0.32)}px system-ui, sans-serif`
    ctx.fillText(p.injury ? '🩹' : '🟥', x - s * 0.55, y - s * 0.5)
  }

  // Nome e energia embaixo da camisa.
  const nameY = y + s * 0.5 + 11
  ctx.font = `600 ${Math.max(10, Math.round(s * 0.28))}px system-ui, sans-serif`
  // No banco mostra a posição; no campo, só quando o jogador está improvisado (ex.: "MEI→ATA").
  const prefix = spot.zone === 'bench' ? `${p.position} ` : improvised ? `${p.position}→${playingPosition(p)} ` : ''
  const label = `${prefix}${shortName(p.name)}`
  const tw = ctx.measureText(label).width + 8
  ctx.fillStyle = improvised ? 'rgba(120, 53, 15, 0.9)' : 'rgba(0,0,0,0.55)'
  ctx.fillRect(x - tw / 2, nameY - 8, tw, 16)
  ctx.fillStyle = '#fff'
  ctx.fillText(label, x, nameY)

  const barW = s * 0.9
  const barY = nameY + 10
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(x - barW / 2, barY, barW, 3)
  ctx.fillStyle = p.energy >= 70 ? theme.good : p.energy >= 45 ? theme.warn : theme.bad
  ctx.fillRect(x - barW / 2, barY, (barW * p.energy) / 100, 3)
  ctx.restore()
}

function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const stripes = 8
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#2f7d43' : '#2a723d'
    ctx.fillRect(0, (h / stripes) * i, w, h / stripes + 1)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 2
  const m = 10
  ctx.strokeRect(m, m, w - m * 2, h - m * 2)
  // Meio-campo e círculo central (o campo mostra só o lado de quem ataca para cima).
  ctx.beginPath()
  ctx.moveTo(m, m)
  ctx.lineTo(w - m, m)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(w / 2, m, Math.min(w, h) * 0.13, 0, Math.PI)
  ctx.stroke()
  // Grande área, pequena área e gol.
  const boxW = w * 0.56
  const boxH = h * 0.2
  ctx.strokeRect((w - boxW) / 2, h - m - boxH, boxW, boxH)
  const smallW = w * 0.26
  const smallH = h * 0.08
  ctx.strokeRect((w - smallW) / 2, h - m - smallH, smallW, smallH)
  ctx.beginPath()
  ctx.arc(w / 2, h - m - boxH, w * 0.09, Math.PI, 0)
  ctx.stroke()
}

function draw() {
  const el = canvas.value
  const team = game.managedTeam
  if (!el || !team) return
  const w = width.value
  const h = height.value
  const dpr = window.devicePixelRatio || 1
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    el.style.height = `${h}px`
  }
  const ctx = el.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  drawPitch(ctx, w, pitchH.value)

  // Banco.
  const d = drag.value
  const overBench = d?.moved && d.spot.zone === 'pitch' && zoneAt(d.y) === 'bench'
  ctx.fillStyle = overBench ? 'rgba(74, 222, 128, 0.12)' : 'rgba(255,255,255,0.03)'
  ctx.fillRect(0, pitchH.value, w, h - pitchH.value)
  ctx.fillStyle = theme.muted
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`BANCO (${benchPlayers.value.length}) · arraste para o campo`, 10, pitchH.value + BENCH_TITLE_H / 2)

  const target = d?.moved ? spotAt(d.x, d.y, d.spot.key) : null
  for (const spot of spots.value) {
    const dragging = d?.moved && d.spot.key === spot.key
    drawShirt(ctx, spot, spot.x, spot.y, { ghost: dragging, target: target?.key === spot.key && (target.zone === 'pitch' || d!.spot.zone === 'pitch') })
  }
  if (d?.moved) drawShirt(ctx, d.spot, d.x, d.y)

  // Ficha do jogador sob o mouse.
  const hovered = !d && pointer.value ? spotAt(pointer.value.x, pointer.value.y) : null
  if (hovered?.player) drawTooltip(ctx, hovered.player, hovered.x, hovered.y)
}

function drawTooltip(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number) {
  const lines = [
    `${p.position} · ${p.name}${p.star ? ' ★' : ''}`,
    `OVR ${p.overall} · ${p.age} anos`,
    `Energia ${Math.round(p.energy)} · Moral ${Math.round(p.morale)}`,
    ...(p.starter && playingPosition(p) !== p.position
      ? [`Improvisado como ${playingPosition(p)}: rende ${Math.round(positionFit(p.position, playingPosition(p)) * 100)}%`]
      : []),
    ...(isAvailable(p) ? [] : [`Fora: ${unavailableReason(p)}`]),
  ]
  ctx.font = '12px system-ui, sans-serif'
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
  const h = lines.length * 16 + 10
  const bx = Math.min(Math.max(4, x - w / 2), width.value - w - 4)
  const by = y - shirt.value * 0.7 - h - 4 < 4 ? y + shirt.value + 20 : y - shirt.value * 0.7 - h - 4
  ctx.fillStyle = 'rgba(13, 23, 18, 0.94)'
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 1
  ctx.fillRect(bx, by, w, h)
  ctx.strokeRect(bx, by, w, h)
  ctx.fillStyle = theme.text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 6 + i * 16))
}

// Redesenha sempre que algo usado no desenho mudar (escalação, formação, arraste, mouse...).
watchEffect(draw, { flush: 'post' })

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.round(entry!.contentRect.width)))
  observer.observe(wrapper.value!)
  width.value = wrapper.value!.clientWidth
})
onBeforeUnmount(() => observer?.disconnect())

const cursor = computed(() => {
  if (drag.value?.moved) return 'grabbing'
  const s = pointer.value && spotAt(pointer.value.x, pointer.value.y)
  return s?.player && (s.zone === 'pitch' || isAvailable(s.player)) ? 'grab' : 'default'
})
</script>

<template>
  <div ref="wrapper" class="pitch">
    <canvas
      ref="canvas"
      :style="{ cursor }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="drag = null"
      @pointerleave="pointer = null"
    />
    <p class="pitch__hint" :class="{ muted: !hint }">
      {{ hint ?? 'Arraste reservas para o campo ou para cima de um titular, titulares para o banco, ou mova um titular para outra linha.' }}
    </p>
  </div>
</template>

<style scoped>
.pitch {
  width: 100%;
  margin: 0.75rem 0 0.5rem;
}
canvas {
  display: block;
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border);
  touch-action: none;
  user-select: none;
}
.pitch__hint {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  min-height: 1.2em;
}
</style>
