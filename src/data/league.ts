import type { Team } from '../types/game'
import { getCustomLeague, parseLeagueFile, teamsFromLeagueFile, type LeagueFile } from './leagueFile'
import { createTeams } from './teams'
import { brasileiraoTemplate, BRASILEIRAO_TEMPLATE_NAME } from './templates/brasileirao'

/**
 * Liga base das carreiras novas: o Brasileirão com clubes e elencos reais (padrão) ou a liga de clubes
 * fictícios gerada automaticamente. Uma liga importada ou salva no editor tem prioridade sobre as duas.
 */
export type LeagueBase = 'brasileirao' | 'gerada'

const BASE_KEY = 'neobrasfoot:liga-base'

export const LEAGUE_BASE_LABELS: Record<LeagueBase, string> = {
  brasileirao: BRASILEIRAO_TEMPLATE_NAME,
  gerada: 'Liga gerada (clubes fictícios)',
}

export function getLeagueBase(): LeagueBase {
  try {
    return localStorage.getItem(BASE_KEY) === 'gerada' ? 'gerada' : 'brasileirao'
  } catch {
    return 'brasileirao'
  }
}

export function setLeagueBase(base: LeagueBase) {
  if (base === 'gerada') localStorage.setItem(BASE_KEY, base)
  else localStorage.removeItem(BASE_KEY)
}

/** O template do Brasileirão já validado (com os mesmos padrões de uma liga importada). */
export function brasileiraoLeague(): LeagueFile {
  return parseLeagueFile(JSON.stringify(brasileiraoTemplate())).league!
}

/** Clubes da liga base escolhida. */
export function baseLeagueTeams(base: LeagueBase = getLeagueBase()): Team[] {
  return base === 'gerada' ? createTeams() : teamsFromLeagueFile(brasileiraoLeague())
}

/** Clubes usados ao começar uma carreira: a liga importada/do editor, se houver, ou a liga base. */
export function leagueTeams(): Team[] {
  const custom = getCustomLeague()
  return custom ? teamsFromLeagueFile(custom) : baseLeagueTeams()
}
