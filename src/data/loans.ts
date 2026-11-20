/** Durações oferecidas (em rodadas do campeonato); 0 = até o fim da temporada. */
export const LOAN_DURATIONS = [3, 7, 0] as const

/** Taxa de empréstimo por rodada, em fração do valor de mercado (7 rodadas ≈ 14%). */
export const LOAN_FEE_PER_ROUND = 0.02
/** Quem cede um jogador seu recebe menos: o clube da IA está fazendo um favor de dar minutos. */
export const LOAN_OUT_FEE_PER_ROUND = 0.01

/** Jovens emprestados ganham minutos: chance de +1 de OVR a cada rodada fora. */
export const LOAN_DEVELOPMENT_AGE = 23
export const LOAN_DEVELOPMENT_CHANCE = 0.15

export function loanFee(value: number, rounds: number, perRound = LOAN_FEE_PER_ROUND) {
  return Math.round((value * perRound * rounds) / 1000) * 1000
}

export function durationLabel(rounds: number) {
  return `${rounds} rodada${rounds > 1 ? 's' : ''}`
}
