import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { seasonCalendar } from '../calendar'
import { CHAMPIONS_SPOTS_PER_LEAGUE, championsSchedule, createChampions, createEuropeanTeams, EUROPEAN_CLUBS } from '../champions'
import { cupSchedule } from '../cup'
import { setLeagueBase, setLeagueFormat } from '../league'
import { countryOf, groupOf, libertadoresSchedule } from '../libertadores'
import { bundesligaTeams } from '../templates/bundesliga'
import { laLigaTeams } from '../templates/laliga'
import { premierLeagueTeams } from '../templates/premierLeague'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

describe('Liga dos Campeões: clubes e sorteio', () => {
  it('20 clubes europeus reais com elenco, técnico e estádio', () => {
    const teams = createEuropeanTeams()
    expect(teams).toHaveLength(20)
    expect(new Set(teams.map((t) => t.id)).size).toBe(20)
    for (const t of teams) {
      expect(t.players.length, t.id).toBeGreaterThanOrEqual(16)
      expect(t.stadiumName, t.id).toBeTruthy()
      expect(t.country, t.id).toBeTruthy()
      expect(t.crest, t.id).toBeUndefined()
    }
    expect(teams.filter((t) => t.managerName).length).toBeGreaterThanOrEqual(18)
    expect(EUROPEAN_CLUBS.find((c) => c.id === 'fr-psg')?.country).toBe('FRA')
  })

  it('país dos clubes das ligas estrangeiras pela divisão; grupos sem dois clubes do mesmo país', () => {
    const qualified = [laLigaTeams(), premierLeagueTeams(), bundesligaTeams()].flatMap((l) =>
      [...l].sort((a, b) => b.reputation - a.reputation).slice(0, CHAMPIONS_SPOTS_PER_LEAGUE),
    )
    expect(countryOf(qualified[0])).toBe('ESP')
    expect(countryOf(qualified[4])).toBe('ENG')
    expect(countryOf(qualified[8])).toBe('GER')
    const participants = [...qualified, ...createEuropeanTeams()]
    expect(participants).toHaveLength(32)
    const byId = new Map(participants.map((t) => [t.id, t]))
    for (let i = 0; i < 10; i++) {
      const ucl = createChampions(participants, 1, 38)
      expect(ucl.groups).toHaveLength(8)
      for (const g of ucl.groups) {
        const countries = g.teamIds.map((id) => countryOf(byId.get(id)))
        expect(new Set(countries).size, countries.join(',')).toBe(countries.length)
      }
    }
  })

  it('calendário: 10 etapas fora dos intervalos da Copa do Brasil e da Libertadores', () => {
    const cup = cupSchedule(38, true)
    const lib = libertadoresSchedule(38, cup)
    const ucl = championsSchedule(38, [...cup, ...lib])
    expect(ucl).toHaveLength(10)
    expect(ucl.every((r, i) => r >= 1 && r < 38 && (i === 0 || r >= ucl[i - 1]!))).toBe(true)
    const entries = seasonCalendar(2027, 38, cup, lib, [], ucl)
    entries.forEach((e, pos) => {
      if (e.kind !== 'champions') return
      expect(entries.slice(0, pos).filter((x) => x.kind === 'league').length).toBe(ucl[e.index])
    })
  })
})

describe('Liga dos Campeões na carreira', () => {
  it('clube da Premier League classificado: joga ao vivo, e os classificados mudam na virada', { timeout: 400_000 }, () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    const game = useGameStore()
    const match = useMatchStore()
    game.startCareer('en-man-city', 'Técnico')
    const ucl = game.champions!
    expect(ucl.groups.flatMap((g) => g.teamIds)).toHaveLength(32)
    expect(groupOf(ucl, 'en-man-city')).not.toBeNull()
    expect(game.managedChampionsStatus.state).toBe('alive')
    // Clubes brasileiros ficam de fora.
    const brazilian = new Set(game.teams.filter((t) => t.division === 'A' || t.division === 'B').map((t) => t.id))
    expect(ucl.groups.flatMap((g) => g.teamIds).some((id) => brazilian.has(id))).toBe(false)

    let guard = 0
    while (game.nextEvent !== 'champions' && guard++ < 20) {
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.nextOpponent).not.toBeNull()
    const budget = game.budget
    game.autoSelectStarters()
    match.setupRound()
    match.simulateToEnd(true)
    match.confirmRound()
    expect(game.champions!.stage).toBe(1)
    expect(game.budget).toBeGreaterThan(budget)

    guard = 0
    while (!game.isSeasonOver && guard++ < 90) {
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    expect(game.champions!.championId).toBeTruthy()
    expect(game.champions!.knockout.map((r) => r.ties.length)).toEqual([8, 4, 2, 1])

    const top = ['ESP', 'ENG', 'GER'].flatMap((d) => game.divisionStandings(d as 'ESP').slice(0, 4).map((r) => r.teamId))
    game.nextSeason()
    const next = game.champions!.groups.flatMap((g) => g.teamIds)
    expect(top.every((id) => next.includes(id))).toBe(true)
  })

  it('formato 4×8 (sem ligas estrangeiras): não há Liga dos Campeões', () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('4x8')
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer('flamengo', 'Técnico')
    expect(game.champions).toBeNull()
  })
})
