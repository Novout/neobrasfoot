import type { DefRole, Player } from '../types/game'
import { createRng, hashString } from '../utils/random'
import { orderLine } from './feet'
import { playingPosition } from './tactics'

/**
 * Defensores se dividem em laterais (LAT, nas pontas da linha) e zagueiros (ZAG, no meio).
 * A linha da defesa continua sendo uma só ("DEF") para o motor de jogo; a função define onde cada um rende mais.
 */

export const DEF_ROLES: DefRole[] = ['LAT', 'ZAG']
export const DEF_ROLE_LABELS: Record<DefRole, string> = { LAT: 'Lateral', ZAG: 'Zagueiro' }
/** Rendimento de um defensor fora da função (lateral no meio da zaga ou zagueiro na lateral). */
export const DEF_ROLE_MISFIT = 0.9
/** Fração de laterais entre os defensores de um elenco, quando é preciso sortear. */
const LATERAL_SHARE = 0.42

export function isDefRole(value: unknown): value is DefRole {
  return value === 'LAT' || value === 'ZAG'
}

/** Função de um defensor (null para outras posições). Saves antigos sem a função sorteiam de forma fixa. */
export function defRoleOf(p: Pick<Player, 'id' | 'position' | 'defRole'>): DefRole | null {
  if (p.position !== 'DEF') return null
  if (isDefRole(p.defRole)) return p.defRole
  return createRng(hashString(`${p.id}:lateral`)).next() < LATERAL_SHARE ? 'LAT' : 'ZAG'
}

/** Posição mostrada nas telas: LAT/ZAG para defensores, a própria para os outros. */
export function positionLabel(p: Pick<Player, 'id' | 'position' | 'defRole'>): string {
  return defRoleOf(p) ?? p.position
}

/** Opções de posição nos editores: a defesa aparece separada em lateral e zagueiro. */
export type PositionChoice = 'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA'
export const POSITION_CHOICES: PositionChoice[] = ['GOL', 'LAT', 'ZAG', 'MEI', 'ATA']

export function positionChoiceOf(p: { position: Player['position']; defRole?: DefRole }): PositionChoice {
  return p.position === 'DEF' ? (isDefRole(p.defRole) ? p.defRole : 'ZAG') : p.position
}

/** Aplica a escolha do editor: LAT/ZAG viram defensor com a função; as outras limpam a função. */
export function applyPositionChoice(p: { position: Player['position']; defRole?: DefRole }, choice: PositionChoice) {
  if (choice === 'LAT' || choice === 'ZAG') {
    p.position = 'DEF'
    p.defRole = choice
  } else {
    p.position = choice
    delete p.defRole
  }
}

/** Quantos laterais e zagueiros uma linha de N defensores pede (3 = só zagueiros; os alas jogam no meio). */
export function defenseSplit(count: number): Record<DefRole, number> {
  if (count <= 3) return { LAT: 0, ZAG: count }
  return { LAT: 2, ZAG: count - 2 }
}

/** Função de cada lugar da linha de defesa, da esquerda para a direita: laterais nas pontas. */
export function defSlotRoles(count: number): DefRole[] {
  const { LAT } = defenseSplit(count)
  return Array.from({ length: count }, (_, i) => (LAT && (i === 0 || i === count - 1) ? 'LAT' : 'ZAG'))
}

type LineDefender = Pick<Player, 'id' | 'foot' | 'lineupSlot' | 'position' | 'role' | 'defRole'>

/** Lugar (LAT/ZAG) em que cada titular da defesa está jogando, pela ordem da linha. */
export function defenseSlots<T extends LineDefender>(starters: T[]): Map<string, DefRole> {
  const line = orderLine(starters.filter((p) => playingPosition(p) === 'DEF'))
  const roles = defSlotRoles(line.length)
  return new Map(line.map((p, i) => [p.id, roles[i]!]))
}

/** Rendimento de cada defensor pela função do lugar em que joga (fora dela rende DEF_ROLE_MISFIT). */
export function defenseFits<T extends LineDefender>(starters: T[]): Map<string, number> {
  const slots = defenseSlots(starters)
  const fits = new Map<string, number>()
  for (const p of starters) {
    const slot = slots.get(p.id)
    const role = defRoleOf(p)
    // Só defensores de origem: quem vem de outra linha já perde rendimento pelo improviso.
    if (slot && role) fits.set(p.id, slot === role ? 1 : DEF_ROLE_MISFIT)
  }
  return fits
}

/**
 * Garante uma divisão razoável de laterais e zagueiros num elenco: quem não tem função definida recebe uma,
 * buscando ~40% de laterais e pelo menos 2 de cada (se houver defensores suficientes).
 */
export function balanceDefRoles(players: Pick<Player, 'id' | 'position' | 'defRole' | 'overall'>[]) {
  const defenders = players.filter((p) => p.position === 'DEF')
  const free = defenders.filter((p) => !isDefRole(p.defRole)).sort((a, b) => a.id.localeCompare(b.id))
  const count = (role: DefRole) => defenders.filter((p) => p.defRole === role).length
  const minEach = Math.min(2, Math.floor(defenders.length / 2))
  const targetLat = Math.max(minEach, Math.round(defenders.length * LATERAL_SHARE))
  for (const p of free) p.defRole = count('LAT') < targetLat ? 'LAT' : 'ZAG'
  // Com funções vindas dos dados reais, pode faltar uma delas: converte os de função menos certa.
  for (const role of DEF_ROLES) {
    const other: DefRole = role === 'LAT' ? 'ZAG' : 'LAT'
    while (count(role) < minEach && count(other) > minEach) {
      const moved = defenders.filter((p) => p.defRole === other).sort((a, b) => a.overall - b.overall)[0]!
      moved.defRole = role
    }
  }
}
