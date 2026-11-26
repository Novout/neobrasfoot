import type { Player } from '../types/game'
import { defRoleOf } from './defense'

/**
 * Numeração das camisas: cada jogador de um elenco tem um número único de 1 a 99.
 * Quem chega sem número (ou com um número já usado no clube) recebe um típico da posição,
 * e os melhores do elenco ficam com os clássicos (1 no gol, 9 no ataque, 10 no meio...).
 */

export const MIN_SHIRT_NUMBER = 1
export const MAX_SHIRT_NUMBER = 99

type NumberedPlayer = Pick<Player, 'id' | 'position' | 'defRole' | 'overall'> & { number?: number }

export function isShirtNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_SHIRT_NUMBER && (value as number) <= MAX_SHIRT_NUMBER
}

/** Números tradicionais de cada função, do mais desejado ao menos. */
const PREFERRED: Record<'GOL' | 'LAT' | 'ZAG' | 'MEI' | 'ATA', number[]> = {
  GOL: [1, 12, 23, 13, 31, 33, 40],
  LAT: [2, 6, 13, 16, 22, 26, 27, 32],
  ZAG: [4, 3, 14, 15, 24, 25, 28, 34],
  MEI: [5, 8, 10, 15, 16, 17, 18, 20, 21, 25],
  ATA: [9, 11, 7, 19, 20, 21, 29, 30, 99],
}

function preferredFor(p: NumberedPlayer) {
  return PREFERRED[p.position === 'DEF' ? (defRoleOf(p) ?? 'ZAG') : p.position]
}

/**
 * Garante números únicos e válidos no elenco, sem mexer em quem já tem um.
 * Em número repetido, fica com ele quem aparece primeiro na lista (quem já estava no clube);
 * os demais recebem o primeiro número livre da sua posição (os de maior OVR escolhem antes), ou o menor livre.
 * Devolve os jogadores que ganharam número novo.
 */
export function assignShirtNumbers<T extends NumberedPlayer>(players: T[]): T[] {
  const taken = new Set<number>()
  const missing: T[] = []
  for (const p of players) {
    if (isShirtNumber(p.number) && !taken.has(p.number)) taken.add(p.number)
    else missing.push(p)
  }
  missing.sort((a, b) => b.overall - a.overall)
  for (const p of missing) {
    const number =
      preferredFor(p).find((n) => !taken.has(n)) ??
      Array.from({ length: MAX_SHIRT_NUMBER }, (_, i) => i + MIN_SHIRT_NUMBER).find((n) => !taken.has(n))
    if (number === undefined) {
      // Elenco com 99 jogadores numerados: não há o que dar (não acontece com o limite de 30).
      delete p.number
      continue
    }
    p.number = number
    taken.add(number)
  }
  return missing
}

/**
 * Troca o número de um jogador. Se outro jogador do elenco já usa o número, os dois trocam de camisa.
 * Devolve o jogador que cedeu o número (ou null), ou uma mensagem de erro.
 */
export function changeShirtNumber<T extends NumberedPlayer>(
  players: T[],
  playerId: string,
  number: number,
): { swappedWith: T | null } | { error: string } {
  if (!isShirtNumber(number)) return { error: `O número precisa ser um inteiro de ${MIN_SHIRT_NUMBER} a ${MAX_SHIRT_NUMBER}.` }
  const player = players.find((p) => p.id === playerId)
  if (!player) return { error: 'Jogador não está no elenco.' }
  if (player.number === number) return { swappedWith: null }
  const holder = players.find((p) => p.id !== playerId && p.number === number) ?? null
  if (holder) {
    if (isShirtNumber(player.number)) holder.number = player.number
    else delete holder.number
  }
  player.number = number
  // Quem cedeu o número e o jogador não tinha um: recebe um livre.
  if (holder && !isShirtNumber(holder.number)) assignShirtNumbers(players)
  return { swappedWith: holder }
}
