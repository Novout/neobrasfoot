import type { Team } from '../types/game'
import { DEFAULT_FORMAT, isLeagueFormat, type LeagueFormat } from './divisions'
import { getCustomLeague, parseLeagueFile, teamsFromLeagueFile, type LeagueFile } from './leagueFile'
import { createReserveTeams, createTeams } from './teams'
import { brasileiraoReserve, brasileiraoTemplate, BRASILEIRAO_TEMPLATE_NAME } from './templates/brasileirao'
import { LEAGUE_FORMAT as FILE_FORMAT, LEAGUE_FORMAT_VERSION } from './leagueFile'

/**
 * Liga base das carreiras novas: o Brasileirão com clubes e elencos reais (padrão) ou a liga de clubes
 * fictícios gerada automaticamente. Uma liga importada ou salva no editor tem prioridade sobre as duas.
 */
export type LeagueBase = 'brasileirao' | 'gerada'

const BASE_KEY = 'neobrasfoot:liga-base'
const FORMAT_KEY = 'neobrasfoot:liga-formato'

/** Formato das séries para carreiras novas: 2×20 (padrão) ou 4×8. Vale para o Brasileirão e para a liga gerada. */
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

/**
 * Série C (fora da liga) do formato 2×20: clubes que não jogam, mas sobem para a Série B no fim da temporada
 * no lugar dos 4 últimos. Só nas ligas base (Brasileirão e gerada); ligas importadas não têm.
 */
export function baseReserveTeams(base: LeagueBase = getLeagueBase(), format: LeagueFormat = getLeagueFormat()): Team[] {
  if (format !== '2x20') return []
  if (base === 'gerada') return createReserveTeams()
  return teamsFromLeagueFile({ format: FILE_FORMAT, version: LEAGUE_FORMAT_VERSION, teams: brasileiraoReserve() })
}

/** Série C das carreiras novas (vazia com liga importada/do editor). */
export function leagueReserveTeams(): Team[] {
  return getCustomLeague() ? [] : baseReserveTeams()
}

/** Clubes usados ao começar uma carreira: a liga importada/do editor, se houver, ou a liga base. */
export function leagueTeams(): Team[] {
  const custom = getCustomLeague()
  return custom ? teamsFromLeagueFile(custom) : baseLeagueTeams()
}
