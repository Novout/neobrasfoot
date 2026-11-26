/**
 * Calendário da temporada: datas reais para as rodadas do campeonato e as fases da Copa.
 *
 * - O campeonato vai de abril ao começo de dezembro, como o Brasileirão, com jogos aos domingos.
 *   Se houver mais rodadas que domingos (2×20: 38 rodadas), algumas vão para quarta-feira.
 *   Com poucas rodadas (4×8: 14), elas ficam espalhadas pelo mesmo período.
 * - Cada fase da Copa cai entre a rodada depois da qual ela é jogada e a seguinte (normalmente a quarta).
 *
 * Datas no formato "AAAA-MM-DD", sempre calculadas em UTC (sem problemas de fuso).
 */

export type IsoDate = string

const DAY = 24 * 60 * 60 * 1000

const toIso = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10)
const fromIso = (iso: IsoDate) => Date.parse(`${iso}T00:00:00Z`)

/** Primeiro domingo na data ou depois dela. */
function sundayOnOrAfter(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month, day))
  return d.getTime() + ((7 - d.getUTCDay()) % 7) * DAY
}

/** Início do campeonato: primeiro domingo a partir de 5 de abril. */
export function leagueStart(year: number) {
  return toIso(sundayOnOrAfter(year, 3, 5))
}

/** Fim do campeonato: primeiro domingo de dezembro. */
export function leagueEnd(year: number) {
  return toIso(sundayOnOrAfter(year, 11, 1))
}

/** Ano de uma temporada: a temporada 1 é a do ano em que a carreira começou. */
export function seasonYear(startYear: number, season: number) {
  return startYear + season - 1
}

/** Ano da primeira temporada de uma carreira nova: a partir de outubro já vale o próximo ano. */
export function defaultStartYear(now = new Date()) {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()
}

/** Datas das rodadas do campeonato (uma por rodada, em ordem). */
export function leagueDates(year: number, rounds: number): IsoDate[] {
  if (rounds <= 0) return []
  const first = fromIso(leagueStart(year))
  const last = fromIso(leagueEnd(year))
  const sundays: number[] = []
  for (let t = first; t <= last; t += 7 * DAY) sundays.push(t)

  // Menos rodadas que domingos: espalha as rodadas pelo período inteiro.
  if (rounds <= sundays.length) {
    if (rounds === 1) return [toIso(sundays[0]!)]
    const step = (sundays.length - 1) / (rounds - 1)
    return Array.from({ length: rounds }, (_, i) => toIso(sundays[Math.round(i * step)]!))
  }

  // Mais rodadas que domingos: as que sobram vão para quartas-feiras espalhadas pela temporada.
  const extra = Math.min(rounds - sundays.length, sundays.length - 1)
  const midweekWeeks = new Set(Array.from({ length: extra }, (_, i) => Math.round(((i + 1) * (sundays.length - 1)) / (extra + 1))))
  const dates: number[] = []
  sundays.forEach((sunday, week) => {
    if (midweekWeeks.has(week)) dates.push(sunday - 4 * DAY) // quarta-feira antes do domingo
    dates.push(sunday)
  })
  return dates.slice(0, rounds).map(toIso)
}

/**
 * Data de um jogo de meio de semana. `afterRounds` = rodadas do campeonato jogadas antes dele.
 * O jogo fica entre essa rodada e a próxima: de domingo a domingo, na quarta; se a próxima for no meio
 * da semana, no meio do intervalo. Depois da última rodada, três dias depois.
 * `slot` > 0: outro jogo no mesmo intervalo (Copa e Libertadores), um dia depois a cada vez, sem passar da rodada seguinte.
 */
function midweekDate(league: IsoDate[], afterRounds: number, slot = 0): IsoDate {
  const prev = league[afterRounds - 1]
  const next = league[afterRounds]
  if (!prev) return next ? toIso(fromIso(next) - (4 - Math.min(slot, 3)) * DAY) : league[0] ?? ''
  if (!next) return toIso(fromIso(prev) + (3 + slot) * DAY)
  const gap = Math.round((fromIso(next) - fromIso(prev)) / DAY)
  const base = Math.max(1, Math.min(3, Math.floor(gap / 2)))
  return toIso(fromIso(prev) + Math.max(1, Math.min(gap - 1, base + slot)) * DAY)
}

/** Datas das fases da Copa. `schedule[i]` = rodadas do campeonato jogadas antes da fase i. */
export function cupDates(league: IsoDate[], schedule: number[]): IsoDate[] {
  return schedule.map((afterRounds) => midweekDate(league, afterRounds))
}

export type CalendarKind = 'league' | 'cup' | 'libertadores' | 'champions' | 'worldcup'

export interface CalendarEntry {
  kind: CalendarKind
  /** Rodada do campeonato, fase da Copa ou etapa da Libertadores (0 = primeira). */
  index: number
  date: IsoDate
}

/**
 * Calendário completo da temporada, em ordem de data (copas antes da rodada do mesmo dia, se houver).
 * Copa e Libertadores no mesmo intervalo entre rodadas ficam em dias seguidos (a Copa primeiro).
 */
export function seasonCalendar(
  year: number,
  leagueRounds: number,
  cupSchedule: number[],
  libertadoresSchedule: number[] = [],
  worldCupSchedule: number[] = [],
  championsSchedule: number[] = [],
): CalendarEntry[] {
  const league = leagueDates(year, leagueRounds)
  const slots = new Map<number, number>()
  const midweek = (kind: Exclude<CalendarKind, 'league'>, schedule: number[]) =>
    schedule.map((afterRounds, index) => {
      const slot = slots.get(afterRounds) ?? 0
      slots.set(afterRounds, slot + 1)
      return { kind, index, date: midweekDate(league, afterRounds, slot) }
    })
  const order: Record<CalendarKind, number> = { cup: 0, libertadores: 1, champions: 2, worldcup: 3, league: 4 }
  return [
    ...league.map((date, index) => ({ kind: 'league' as const, index, date })),
    ...midweek('cup', cupSchedule),
    ...midweek('libertadores', libertadoresSchedule),
    ...midweek('champions', championsSchedule),
    ...midweek('worldcup', worldCupSchedule),
  ].sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.index - b.index)
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** "dom, 11/abr" (ou com o ano: "dom, 11/abr/2027"). */
export function formatDate(iso: IsoDate, withYear = false) {
  const d = new Date(fromIso(iso))
  const base = `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}/${MONTHS[d.getUTCMonth()]}`
  return withYear ? `${base}/${d.getUTCFullYear()}` : base
}

export function monthOf(iso: IsoDate) {
  return new Date(fromIso(iso)).getUTCMonth()
}

export function weekdayOf(iso: IsoDate) {
  return new Date(fromIso(iso)).getUTCDay()
}
