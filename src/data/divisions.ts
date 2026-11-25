import type { DivisionId } from '../types/game'

/**
 * Formatos de liga:
 * - "2x20": Séries A e B com 20 clubes cada (padrão, como o Brasileirão real, 38 rodadas);
 * - "4x8": Séries A a D com 8 clubes cada (14 rodadas).
 */
export type LeagueFormat = '4x8' | '2x20'

export interface FormatRules {
  divisions: DivisionId[]
  teamsPerDivision: number
  /** Quantos sobem e quantos descem por divisão ao fim da temporada. */
  promotionSpots: number
  relegationSpots: number
}

export const LEAGUE_FORMATS: Record<LeagueFormat, FormatRules> = {
  '4x8': { divisions: ['A', 'B', 'C', 'D'], teamsPerDivision: 8, promotionSpots: 2, relegationSpots: 2 },
  '2x20': { divisions: ['A', 'B'], teamsPerDivision: 20, promotionSpots: 4, relegationSpots: 4 },
}

export const LEAGUE_FORMAT_LABELS: Record<LeagueFormat, string> = {
  '4x8': '4 séries × 8 clubes',
  '2x20': '2 séries × 20 clubes',
}

export const DEFAULT_FORMAT: LeagueFormat = '2x20'

/** Todas as séries que existem em algum formato, da mais forte para a mais fraca. */
export const ALL_DIVISIONS: DivisionId[] = ['A', 'B', 'C', 'D']

// Formato da carreira atual. Os valores abaixo são "live bindings": quem importa DIVISIONS vê a troca.
export let ACTIVE_FORMAT: LeagueFormat = DEFAULT_FORMAT
/** Séries do formato ativo, da mais forte para a mais fraca. */
export let DIVISIONS: DivisionId[] = LEAGUE_FORMATS[DEFAULT_FORMAT].divisions
/** Quantos sobem e quantos descem por divisão ao fim da temporada (formato ativo). */
export let PROMOTION_SPOTS = LEAGUE_FORMATS[DEFAULT_FORMAT].promotionSpots
export let RELEGATION_SPOTS = LEAGUE_FORMATS[DEFAULT_FORMAT].relegationSpots

/**
 * Ligas estrangeiras disputadas em paralelo às séries (só no 2×20, que também tem 38 rodadas): ficam fora da
 * pirâmide (ninguém sobe nem cai), fora da Copa do Brasil e da Libertadores.
 */
export const FOREIGN_DIVISIONS: DivisionId[] = ['ESP']

export function isForeignDivision(division: DivisionId) {
  return FOREIGN_DIVISIONS.includes(division)
}

let activeForeign: DivisionId[] = []
/** Todas as divisões disputadas na carreira atual: as séries do formato e as ligas estrangeiras presentes. */
export let LEAGUE_DIVISIONS: DivisionId[] = [...DIVISIONS]

/** Liga estrangeira presente na carreira (pelos clubes dela). */
export function setForeignDivisions(divisions: DivisionId[]) {
  activeForeign = FOREIGN_DIVISIONS.filter((d) => divisions.includes(d))
  LEAGUE_DIVISIONS = [...DIVISIONS, ...activeForeign]
}

/**
 * Nível de uma divisão para comparar clubes (0 = elite): uma liga estrangeira vale como a série mais alta.
 * Usado no mercado (só compra de série igual ou abaixo) e nas propostas de emprego.
 */
export function divisionLevel(division: DivisionId) {
  return isForeignDivision(division) ? 0 : DIVISIONS.indexOf(division)
}

/** A última série também rebaixa (2×20 com Série C fora da liga). */
export let BOTTOM_RELEGATION = false

export function setBottomRelegation(value: boolean) {
  BOTTOM_RELEGATION = value
}

/** Troca o formato ativo (ao começar ou carregar uma carreira). */
export function setActiveFormat(format: LeagueFormat) {
  const rules = LEAGUE_FORMATS[format]
  ACTIVE_FORMAT = format
  BOTTOM_RELEGATION = false
  DIVISIONS = rules.divisions
  LEAGUE_DIVISIONS = [...DIVISIONS, ...activeForeign]
  PROMOTION_SPOTS = rules.promotionSpots
  RELEGATION_SPOTS = rules.relegationSpots
}

/** Formato de uma liga pelos clubes: só Séries A e B com 20 cada é 2×20; o resto é 4×8 (ligas estrangeiras não contam). */
export function formatOfTeams(teams: { division: DivisionId }[]): LeagueFormat {
  const count = (d: DivisionId) => teams.filter((t) => t.division === d).length
  return count('C') === 0 && count('D') === 0 && count('A') === 20 && count('B') === 20 ? '2x20' : '4x8'
}

export function isLeagueFormat(value: unknown): value is LeagueFormat {
  return value === '4x8' || value === '2x20'
}

export const DIVISION_LABELS: Record<DivisionId, string> = {
  A: 'Série A',
  B: 'Série B',
  C: 'Série C',
  D: 'Série D',
  ESP: 'La Liga',
}

/** Ajuste de reputação ao subir ou cair de divisão. */
export const REPUTATION_SWING = 4

export const MIN_PLAYER_OVERALL = 30
export const MAX_PLAYER_OVERALL = 99

export function divisionAbove(division: DivisionId): DivisionId | null {
  return DIVISIONS[DIVISIONS.indexOf(division) - 1] ?? null
}

export function divisionBelow(division: DivisionId): DivisionId | null {
  const i = DIVISIONS.indexOf(division)
  return i < 0 ? null : (DIVISIONS[i + 1] ?? null)
}

export type TableZone = 'champion' | 'promotion' | 'relegation' | null

/** Zona de uma posição (1 = líder) numa tabela de `size` times. */
export function tableZone(division: DivisionId, position: number, size: number): TableZone {
  if (position === 1 && (division === DIVISIONS[0] || isForeignDivision(division))) return 'champion'
  if (divisionAbove(division) && position <= PROMOTION_SPOTS) return 'promotion'
  if (relegatesFrom(division) && position > size - RELEGATION_SPOTS) return 'relegation'
  return null
}

/** A série tem rebaixamento (para a série de baixo, ou para a Série C fora da liga no 2×20). */
export function relegatesFrom(division: DivisionId) {
  return !!divisionBelow(division) || (BOTTOM_RELEGATION && division === DIVISIONS.at(-1))
}

/**
 * Redistribui os clubes nas séries de um formato pela reputação (os mais fortes na Série A).
 * Mantém a ordem relativa e não altera os objetos originais.
 */
export function arrangeForFormat<T extends { division: DivisionId; reputation?: number }>(teams: T[], format: LeagueFormat): T[] {
  const rules = LEAGUE_FORMATS[format]
  const ranked = [...teams].sort(
    (a, b) => (b.reputation ?? 0) - (a.reputation ?? 0) || ALL_DIVISIONS.indexOf(a.division) - ALL_DIVISIONS.indexOf(b.division),
  )
  return ranked.map((t, i) => ({ ...t, division: rules.divisions[Math.floor(i / rules.teamsPerDivision)] ?? rules.divisions.at(-1)! }))
}
