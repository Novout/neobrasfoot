import type { Player } from '../types/game'
import { energyFactor } from './skills'
import { energyCost } from './stars'

/**
 * Desgaste e recuperação de energia (0 a 100). Valores anteriores entre parênteses.
 * A ideia: um titular que joga toda rodada cansa aos poucos e precisa de descanso de vez em quando,
 * em vez de chegar ao fim da temporada esgotado.
 */

/** Energia gasta numa partida inteira (22). */
export const MATCH_ENERGY = 15
/** Energia gasta numa partida inteira por quem tem 30 anos ou mais (30). */
export const VETERAN_MATCH_ENERGY = 21
export const VETERAN_AGE = 30
/**
 * Quem jogou também recupera até a próxima partida (antes não recuperava nada): uma parte do desgaste
 * de um jogo inteiro dele. Proporcional, e não fixa, para que todos cansem um pouco a cada jogo —
 * inclusive estrelas e quem tem Fôlego, que gastam pouco e com uma recuperação fixa nunca cansavam.
 */
export const PLAYED_RECOVERY_SHARE = 0.65
/** Quem não jogou recupera até a próxima partida (20). */
export const REST_RECOVERY = 25
/** Custo extra de entrar no meio do jogo, além dos minutos jogados (20). */
export const SUB_ENTRY_ENERGY = 8
/** Energia gasta num treino (15). */
export const TRAINING_ENERGY = 12

/** Desgaste de uma partida inteira para o jogador (estrelas gastam menos). */
export function matchEnergyCost(p: Pick<Player, 'age' | 'star'>) {
  return energyCost(p.age >= VETERAN_AGE ? VETERAN_MATCH_ENERGY : MATCH_ENERGY, p.star)
}

/** Desgaste real de um jogo inteiro, já com as habilidades (ex.: Fôlego gasta 30% menos). */
export function fullMatchDrain(p: Pick<Player, 'id' | 'age' | 'star' | 'position' | 'skills'>) {
  return matchEnergyCost(p) * energyFactor(p)
}

/** Quanto quem jogou recupera até a próxima partida: sempre menos do que gasta num jogo inteiro. */
export function playedRecovery(p: Pick<Player, 'id' | 'age' | 'star' | 'position' | 'skills'>) {
  return Math.round(fullMatchDrain(p) * PLAYED_RECOVERY_SHARE)
}
