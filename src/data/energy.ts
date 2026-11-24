import type { Player } from '../types/game'
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
/** Quem jogou também recupera até a próxima partida (antes não recuperava nada). */
export const PLAYED_RECOVERY = 10
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
