import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { seasonCalendar } from '../calendar'
import { createClubWorldCup, createGuestTeams, drawFinal, drawSemifinals, GUEST_CLUBS, pickGuests } from '../clubWorldCup'
import { setLeagueBase, setLeagueFormat } from '../league'
import { createRng } from '../../utils/random'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

describe('Mundial de Clubes: convidados e chave', () => {
  it('8 clubes reais da Arábia Saudita e da África, com elenco, técnico e estádio', () => {
    const teams = createGuestTeams()
    expect(teams).toHaveLength(8)
    for (const t of teams) {
      expect(t.players.length, t.id).toBeGreaterThanOrEqual(16)
      expect(t.stadiumName, t.id).toBeTruthy()
      expect(t.country, t.id).toBeTruthy()
      expect(t.crest, t.id).toBeUndefined()
    }
    expect(GUEST_CLUBS.filter((c) => c.region === 'asia')).toHaveLength(4)
    expect(GUEST_CLUBS.filter((c) => c.region === 'africa')).toHaveLength(4)
  })

  it('um convidado árabe e um africano; cada campeão continental pega um convidado na semifinal', () => {
    const rng = createRng(3)
    for (let i = 0; i < 20; i++) {
      const [asia, africa] = pickGuests(rng.next)
      expect(GUEST_CLUBS.find((c) => c.id === asia)?.region).toBe('asia')
      expect(GUEST_CLUBS.find((c) => c.id === africa)?.region).toBe('africa')
    }
    const state = createClubWorldCup(1, ['sa-al-hilal', 'af-al-ahly'], 38)
    expect(state.schedule).toEqual([38, 38])
    const semis = drawSemifinals(state, 'flamengo', 'en-man-city', rng.next)
    expect(semis.name).toBe('Semifinal')
    expect(semis.ties.map((t) => t.homeId)).toEqual(['flamengo', 'en-man-city'])
    expect(semis.ties.map((t) => t.awayId).sort()).toEqual(['af-al-ahly', 'sa-al-hilal'])
    semis.ties[0]!.winnerId = 'flamengo'
    semis.ties[1]!.winnerId = 'sa-al-hilal'
    const final = drawFinal(semis, rng.next)
    expect(final.name).toBe('Final')
    expect([final.ties[0]!.homeId, final.ties[0]!.awayId].sort()).toEqual(['flamengo', 'sa-al-hilal'])
  })

  it('calendário: semifinais e final em dezembro, depois da última rodada', () => {
    const entries = seasonCalendar(2027, 38, [], [], [], [], [38, 38])
    const cwc = entries.filter((e) => e.kind === 'clubworld')
    expect(cwc).toHaveLength(2)
    expect(cwc.every((e) => e.date.startsWith('2027-12'))).toBe(true)
    expect(entries.at(-1)!.kind).toBe('clubworld')
    expect(cwc[0]!.date < cwc[1]!.date).toBe(true)
  })
})

describe('Mundial de Clubes na carreira', () => {
  it('temporada sem o seu clube no Mundial: ele é simulado e a temporada termina com um campeão', { timeout: 400_000 }, () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    const game = useGameStore()
    const match = useMatchStore()
    game.startCareer('juventude', 'Técnico')
    expect(game.clubWorldCup).not.toBeNull()
    expect(game.guestTeams).toHaveLength(8)
    let guard = 0
    while (!game.isSeasonOver && guard++ < 70) {
      expect(game.nextEvent).not.toBe('clubworld')
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    const w = game.clubWorldCup!
    expect(w.rounds.map((r) => r.ties.length)).toEqual([2, 1])
    const semifinalists = w.rounds[0]!.ties.flatMap((t) => [t.homeId, t.awayId])
    expect(semifinalists).toContain(game.libertadores!.championId)
    expect(semifinalists).toContain(game.champions!.championId)
    expect(w.championId).toBeTruthy()
  })

  it('seu clube campeão da Liga dos Campeões: joga o Mundial ao vivo', { timeout: 120_000 }, () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    const game = useGameStore()
    const match = useMatchStore()
    game.startCareer('en-man-city', 'Técnico')
    // Fim de temporada forçado, com o seu clube campeão da Liga dos Campeões.
    game.round = game.totalRounds
    game.cup!.championId = game.cup!.rounds[0]!.ties[0]!.homeId
    game.libertadores!.championId = game.libertadores!.groups[0]!.teamIds[0]!
    game.champions!.championId = 'en-man-city'
    game.maybeDrawClubWorldCup()
    expect(game.nextEvent).toBe('clubworld')
    expect(game.nextOpponent).not.toBeNull()
    expect(game.managedClubWorldStatus?.state).toBe('alive')
    const budget = game.budget
    let guard = 0
    while (!game.isSeasonOver && guard++ < 4) {
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.closeShootout?.()
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    expect(game.clubWorldCup!.championId).toBeTruthy()
    expect(game.budget).toBeGreaterThan(budget)
    if (game.clubWorldCup!.championId === 'en-man-city') {
      expect(game.managers.find((m) => m.isPlayer)!.trophies.some((t) => t.kind === 'clubworld')).toBe(true)
    }
  })
})
