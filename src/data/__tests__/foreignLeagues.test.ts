import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { tableZone } from '../divisions'
import { withByeRounds } from '../fixtures'
import { setLeagueBase, setLeagueFormat } from '../league'
import { bundesligaTeams } from '../templates/bundesliga'
import { premierLeagueTeams } from '../templates/premierLeague'
import premierSquads from '../templates/premier-squads.json'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

describe('Premier League e Bundesliga: clubes reais', () => {
  it('Premier League: 20 clubes com elenco, técnico, estádio e escudo reais', () => {
    const teams = premierLeagueTeams()
    expect(teams).toHaveLength(20)
    expect(teams.every((t) => t.division === 'ENG')).toBe(true)
    for (const t of teams) {
      expect(t.players.length, t.id).toBeGreaterThanOrEqual(16)
      expect(t.stadiumName, t.id).toBeTruthy()
      // Escudo real baixado da Wikipédia (public/escudos/<id>.png).
      expect(t.crest, t.id).toBe(`escudos/${t.id}.png`)
    }
    // O estádio vem da ficha do clube na Wikipédia, quando ela informa.
    const fromData = (premierSquads as { clubs: Record<string, { stadium?: string }> }).clubs['en-man-united']?.stadium
    if (fromData) expect(teams.find((t) => t.id === 'en-man-united')!.stadiumName).toBe(fromData)
    expect(teams.filter((t) => t.managerName).length).toBeGreaterThanOrEqual(18)
  })

  it('Bundesliga: os 18 clubes reais, com escudo', () => {
    const teams = bundesligaTeams()
    expect(teams).toHaveLength(18)
    expect(teams.every((t) => t.division === 'GER' && t.players.length >= 16)).toBe(true)
    expect(teams.every((t) => t.crest === `escudos/${t.id}.png`)).toBe(true)
    expect(tableZone('GER', 1, 18)).toBe('champion')
    expect(tableZone('GER', 18, 18)).toBeNull()
  })

  it('34 rodadas nas 38 da temporada: 4 folgas espalhadas, nunca na primeira nem na última', () => {
    const rounds = Array.from({ length: 34 }, (_, i) => [i])
    const spread = withByeRounds(rounds, 38)
    expect(spread).toHaveLength(38)
    const byes = spread.map((r, i) => (r.length ? -1 : i)).filter((i) => i >= 0)
    expect(byes).toHaveLength(4)
    expect(byes.includes(0) || byes.includes(37)).toBe(false)
    // A ordem das rodadas é mantida.
    expect(spread.flat()).toEqual(rounds.flat())
    expect(withByeRounds(rounds, 34)).toBe(rounds)
  })
})

describe('Bundesliga na carreira', () => {
  it('clube alemão: joga 34 rodadas, acompanha as 4 folgas e a temporada termina', { timeout: 300_000 }, () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    const game = useGameStore()
    const match = useMatchStore()
    game.startCareer('de-bayern', 'Técnico')
    expect(game.managedDivision).toBe('GER')
    const myRounds = game.fixtures.filter((r) => r.some((f) => f.homeId === 'de-bayern' || f.awayId === 'de-bayern'))
    expect(myRounds).toHaveLength(34)

    let byes = 0
    let guard = 0
    while (!game.isSeasonOver && guard++ < 70) {
      if (game.nextEvent === 'league' && !game.nextFixture) byes++
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    expect(byes).toBe(4)
    expect(game.divisionStandings('GER').every((r) => r.played === 34)).toBe(true)
    expect(game.divisionStandings('ENG').every((r) => r.played === 38)).toBe(true)
  })
})
