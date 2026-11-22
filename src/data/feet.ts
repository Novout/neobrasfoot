import type { Player } from '../types/game'
import { createRng, hashString } from '../utils/random'
import { playingPosition, POSITION_ORDER } from './tactics'

/**
 * Pé preferido e lado do campo. Destro rende mais pela direita, canhoto pela esquerda;
 * no lado "errado" rende um pouco menos. Ambidestros jogam bem dos dois lados. O centro é neutro.
 */

/** D = destro, E = canhoto, A = ambidestro. */
export type Foot = 'D' | 'E' | 'A'
/** Lado do campo na linha (visto de quem ataca): E = esquerda, C = centro, D = direita. */
export type Side = 'E' | 'C' | 'D'

export const FOOT_LABELS: Record<Foot, string> = { D: 'Destro', E: 'Canhoto', A: 'Ambidestro' }
export const SIDE_LABELS: Record<Side, string> = { E: 'esquerda', C: 'centro', D: 'direita' }

/** Como no futebol real: a maioria é destra. */
export const FOOT_CHANCES: Record<Foot, number> = { D: 0.72, E: 0.22, A: 0.06 }

/** Rendimento conforme o pé e o lado. */
export const SIDE_BONUS = 1.05
export const WRONG_SIDE = 0.96
export const AMBIDEXTROUS_SIDE = 1.03

export function rollFoot(roll: number): Foot {
  if (roll < FOOT_CHANCES.D) return 'D'
  if (roll < FOOT_CHANCES.D + FOOT_CHANCES.E) return 'E'
  return 'A'
}

type FootPlayer = Pick<Player, 'id' | 'foot'>

/** Pé do jogador (saves antigos: sorteio fixo pelo id, sempre o mesmo). */
export function playerFoot(p: FootPlayer): Foot {
  return p.foot === 'D' || p.foot === 'E' || p.foot === 'A' ? p.foot : rollFoot(createRng(hashString(`${p.id}:pe`)).next())
}

/** Lado de quem está na posição `index` (0 = mais à esquerda) de uma linha com `count` jogadores. */
export function sideOf(index: number, count: number): Side {
  const x = (index + 1) / (count + 1)
  if (x < 0.4) return 'E'
  if (x > 0.6) return 'D'
  return 'C'
}

export function footFit(foot: Foot, side: Side) {
  if (side === 'C') return 1
  if (foot === 'A') return AMBIDEXTROUS_SIDE
  return foot === side ? SIDE_BONUS : WRONG_SIDE
}

/** Preferência de lado quando o técnico não arrumou a linha: canhotos à esquerda, destros à direita. */
const DEFAULT_RANK: Record<Foot, number> = { E: 0, A: 1, D: 2 }

type LinePlayer = Pick<Player, 'id' | 'foot' | 'lineupSlot'>

/**
 * Ordem da linha da esquerda para a direita: quem tem lugar definido pelo técnico (`lineupSlot`) fica nele;
 * os demais (IA, jogador que acabou de entrar) vão para o lado do seu pé.
 */
export function orderLine<T extends LinePlayer>(players: T[]): T[] {
  const placed = players.filter((p) => p.lineupSlot !== undefined).sort((a, b) => a.lineupSlot! - b.lineupSlot!)
  const free = players.filter((p) => p.lineupSlot === undefined).sort((a, b) => DEFAULT_RANK[playerFoot(a)] - DEFAULT_RANK[playerFoot(b)])
  const left = free.filter((p) => playerFoot(p) === 'E')
  const middle = free.filter((p) => playerFoot(p) === 'A')
  const right = free.filter((p) => playerFoot(p) === 'D')
  // Os livres entram nas pontas, conforme o pé, sem tirar os já posicionados do lugar relativo.
  return [...left, ...placed.slice(0, Math.ceil(placed.length / 2)), ...middle, ...placed.slice(Math.ceil(placed.length / 2)), ...right]
}

/** Lado de cada titular (goleiro sempre no centro), pela ordem das linhas. */
export function lineupSides<T extends LinePlayer & Pick<Player, 'position' | 'role'>>(starters: T[]) {
  const sides = new Map<string, Side>()
  for (const pos of POSITION_ORDER) {
    const line = orderLine(starters.filter((p) => playingPosition(p) === pos))
    line.forEach((p, i) => sides.set(p.id, pos === 'GOL' ? 'C' : sideOf(i, line.length)))
  }
  return sides
}

/** Rendimento de cada titular pelo lado em que joga. */
export function sideFits<T extends LinePlayer & Pick<Player, 'position' | 'role'>>(starters: T[]) {
  const sides = lineupSides(starters)
  return new Map(starters.map((p) => [p.id, footFit(playerFoot(p), sides.get(p.id) ?? 'C')]))
}

export function isFoot(value: unknown): value is Foot {
  return value === 'D' || value === 'E' || value === 'A'
}
