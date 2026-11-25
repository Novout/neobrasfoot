import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { cupDates, defaultStartYear, leagueDates, leagueEnd, leagueStart, seasonCalendar, weekdayOf } from '../calendar'
import { cupSchedule } from '../cup'
import { createTeams } from '../teams'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

describe('calendário', () => {
  it('o campeonato vai de abril ao começo de dezembro', () => {
    expect(leagueStart(2027)).toBe('2027-04-11')
    expect(leagueEnd(2027)).toBe('2027-12-05')
  })

  it('2×20 (38 rodadas): domingos e algumas quartas, em ordem, dentro do período', () => {
    const dates = leagueDates(2027, 38)
    expect(dates).toHaveLength(38)
    expect(new Set(dates).size).toBe(38)
    expect([...dates].sort()).toEqual(dates)
    expect(dates[0]).toBe('2027-04-11')
    expect(dates.at(-1)! <= '2027-12-05').toBe(true)
    for (const d of dates) expect([0, 3]).toContain(weekdayOf(d))
    expect(dates.filter((d) => weekdayOf(d) === 3).length).toBeGreaterThan(0)
  })

  it('4×8 (14 rodadas): só domingos, espalhadas de abril a dezembro', () => {
    const dates = leagueDates(2027, 14)
    expect(dates).toHaveLength(14)
    expect(dates.every((d) => weekdayOf(d) === 0)).toBe(true)
    expect(dates[0]).toBe('2027-04-11')
    expect(dates.at(-1)).toBe('2027-12-05')
  })

  it('cada fase da Copa cai entre a rodada depois da qual é jogada e a seguinte', () => {
    for (const [rounds, prelim] of [[14, false], [38, false], [38, true]] as const) {
      const league = leagueDates(2027, rounds)
      const schedule = cupSchedule(rounds, prelim)
      cupDates(league, schedule).forEach((date, i) => {
        const after = schedule[i]!
        expect(date > league[after - 1]!).toBe(true)
        if (league[after]) expect(date < league[after]!).toBe(true)
      })
    }
  })

  it('a ordem do calendário é a ordem em que o jogo joga as partidas', () => {
    const schedule = cupSchedule(38, true)
    const entries = seasonCalendar(2027, 38, schedule)
    entries.forEach((e, pos) => {
      if (e.kind !== 'cup') return
      const leagueBefore = entries.slice(0, pos).filter((x) => x.kind === 'league').length
      expect(leagueBefore).toBe(schedule[e.index])
    })
  })

  it('carreira nova começa no ano certo', () => {
    expect(defaultStartYear(new Date(2026, 10, 25))).toBe(2027)
    expect(defaultStartYear(new Date(2027, 1, 10))).toBe(2027)
  })
})

describe('calendário na carreira', () => {
  it('datas do próximo jogo, resultados por rodada e ano novo a cada temporada', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const match = useMatchStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
    const year = game.currentYear
    expect(game.calendar).toHaveLength(game.totalRounds + game.cup!.schedule.length)
    expect(game.nextEventDate).toBe(leagueDates(year, game.totalRounds)[0])

    match.setupRound()
    match.simulateToEnd(true)
    const m = match.managedMatch!
    match.confirmRound()
    expect(game.leagueResults[0]).toMatchObject({ homeId: m.homeId, awayId: m.awayId, homeGoals: m.homeGoals })
    expect(game.nextEventDate! > leagueDates(year, game.totalRounds)[0]!).toBe(true)

    game.round = game.totalRounds
    if (game.cup) game.cup.championId = game.managedTeamId
    game.nextSeason()
    expect(game.currentYear).toBe(year + 1)
    expect(game.leagueResults).toEqual({})
  })
})
