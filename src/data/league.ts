import type { Team } from '../types/game'
import { DEFAULT_FORMAT, isLeagueFormat, type LeagueFormat } from './divisions'
import { getCustomLeague, parseLeagueFile, teamsFromLeagueFile, type LeagueFile } from './leagueFile'
import { createTeams } from './teams'
import { brasileiraoTemplate, BRASILEIRAO_TEMPLATE_NAME } from './templates/brasileirao'

/**
 * Liga base das carreiras novas: o Brasileirão com clubes e elencos reais (padrão) ou a liga de clubes
 * fictícios gerada automaticamente. Uma liga importada ou salva no editor tem prioridade sobre as duas.
 */
export type LeagueBase = 'brasileirao' | 'gerada'

const BASE_KEY = 'neobrasfoot:liga-base'
const FORMAT_KEY = 'neobrasfoot:liga-formato'

/** Formato das séries para carreiras novas: 4×8 (padrão) ou 2×20. Vale para o Brasileirão e para a liga gerada. */
export function getLeagueFormat(): LeagueFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY)
    return isLeagueFormat(v) ? v : DEFAULT_FORMAT
  } catch {
    return DEFAULT_FORMAT
  }
}

export function setLeagueFormat(format: LeagueFormat) {
  if (format === DEFAULT_FORMAT) localStorage.removeItem(FORMAT_KEY)
  else localStorage.setItem(FORMAT_KEY, format)
}

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
export function brasileiraoLeague(format: LeagueFormat = getLeagueFormat()): LeagueFile {
  return parseLeagueFile(JSON.stringify(brasileiraoTemplate(format))).league!
}

/** Clubes da liga base escolhida, no formato escolhido. */
export function baseLeagueTeams(base: LeagueBase = getLeagueBase(), format: LeagueFormat = getLeagueFormat()): Team[] {
  return base === 'gerada' ? createTeams(format) : teamsFromLeagueFile(brasileiraoLeague(format))
}

/** Clubes usados ao começar uma carreira: a liga importada/do editor, se houver, ou a liga base. */
export function leagueTeams(): Team[] {
  const custom = getCustomLeague()
  return custom ? teamsFromLeagueFile(custom) : baseLeagueTeams()
}
