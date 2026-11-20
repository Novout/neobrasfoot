import type { TableZone } from './divisions'

/** Confiança inicial numa carreira nova e ao assumir um clube novo. */
export const START_CONFIDENCE = 60
export const NEW_JOB_CONFIDENCE = 55
/** Abaixo disso, o jogo avisa que o cargo está ameaçado. */
export const WARNING_CONFIDENCE = 25

export interface ConfidenceDelta {
  board: number
  club: number
}

/**
 * Resultado de uma partida do campeonato.
 * A torcida (clube) reage mais forte, principalmente em casa; a diretoria pesa a obrigação:
 * perder sendo favorito dói mais, vencer sendo azarão vale mais.
 * `strengthGap` > 0 = seu time era favorito.
 */
export function leagueMatchDelta(result: number, isHome: boolean, margin: number, strengthGap: number): ConfidenceDelta {
  const favorite = strengthGap > 3
  const underdog = strengthGap < -3
  if (result > 0) {
    return { board: underdog ? 4 : 2, club: isHome ? 5 : 4 }
  }
  if (result === 0) {
    return { board: favorite ? -2 : underdog ? 1 : 0, club: isHome ? -2 : 0 }
  }
  const heavy = margin >= 3 ? 3 : 0
  return { board: (favorite ? -5 : underdog ? -2 : -3) - heavy, club: (isHome ? -6 : -4) - heavy }
}

/** Ao longo do campeonato a diretoria compara a posição atual com a esperada para o elenco. */
export function tableDriftDelta(expectedPosition: number, currentPosition: number): number {
  return Math.max(-2, Math.min(2, Math.round((expectedPosition - currentPosition) * 0.5)))
}

/** Balanço do fim da temporada. */
export function seasonEndDelta(zone: TableZone, position: number, expectedPosition: number, cupChampion: boolean): ConfidenceDelta {
  let board = (expectedPosition - position) * 3
  let club = (expectedPosition - position) * 2
  if (zone === 'champion') { board += 20; club += 20 }
  else if (zone === 'promotion') { board += 15; club += 15 }
  else if (zone === 'relegation') { board -= 30; club -= 20 }
  if (cupChampion) { board += 15; club += 15 }
  return { board, club }
}

export function confidenceTone(value: number) {
  if (value >= 60) return 'good'
  if (value >= WARNING_CONFIDENCE) return 'warn'
  return 'bad'
}
