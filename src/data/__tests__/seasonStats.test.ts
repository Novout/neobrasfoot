import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { LiveMatch, Player } from '../../types/game'
import { bestEleven, matchRating, recordMatch, type PlayerSeasonStats } from '../seasonStats'
import { createTeams } from '../teams'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

const player = (id: string, position: Player['position'], overall = 70): Player =>
  ({ id, name: id, position, overall, age: 25, energy: 100, morale: 70, salary: 1, starter: true, forSale: false }) as Player

const match = (homeGoals: number, awayGoals: number, events: LiveMatch['events'] = []): LiveMatch =>
  ({ id: 'm', competition: 'league', penalties: null, homeId: 'h', awayId: 'a', homeGoals, awayGoals, homeAttack: 1, homeDefense: 1, awayAttack: 1, awayDefense: 1, events }) as LiveMatch

describe('estatísticas da temporada', () => {
  it('nota da partida: gols, jogo sem sofrer gol e vitória sobem; cartões e gols sofridos descem', () => {
    const base = { position: 'MEI' as const, overall: 70, result: 0, goals: 0, conceded: 1, yellow: 0, red: 0 }
    expect(matchRating(base)).toBe(6)
    expect(matchRating({ ...base, goals: 2 })).toBeGreaterThan(matchRating({ ...base, goals: 1 }))
    expect(matchRating({ ...base, result: 1 })).toBeGreaterThan(matchRating(base))
    expect(matchRating({ ...base, red: 1 })).toBeLessThan(matchRating(base))
    expect(matchRating({ ...base, position: 'GOL', conceded: 0 })).toBeGreaterThan(matchRating({ ...base, position: 'GOL', conceded: 3 }))
    expect(matchRating({ ...base, goals: 9 })).toBe(10)
  })

  it('registra jogos, gols, jogos sem sofrer gol e cartões de quem entrou em campo', () => {
    const stats: Record<string, PlayerSeasonStats> = {}
    const gk = player('gk', 'GOL'), striker = player('st', 'ATA'), away = player('aw', 'DEF')
    recordMatch(
      stats,
      match(2, 0, [
        { minute: 10, teamId: 'h', type: 'gol', playerName: 'st', playerId: 'st' },
        { minute: 50, teamId: 'h', type: 'gol', playerName: 'st', playerId: 'st' },
        { minute: 70, teamId: 'a', type: 'amarelo', playerName: 'aw', playerId: 'aw' },
      ]),
      { h: [gk, striker], a: [away] },
      () => 'A',
    )
    expect(stats.st).toMatchObject({ apps: 1, goals: 2 })
    expect(stats.gk).toMatchObject({ apps: 1, cleanSheets: 1 })
    expect(stats.aw).toMatchObject({ apps: 1, yellow: 1, cleanSheets: 0 })
    expect(stats.st!.ratingSum).toBeGreaterThan(stats.aw!.ratingSum)
  })

  it('seleção: 1 goleiro, 4 defensores, 4 meias e 2 atacantes, só com jogos suficientes', () => {
    const stats: Record<string, PlayerSeasonStats> = {}
    const add = (id: string, position: Player['position'], apps: number, avg: number) =>
      (stats[id] = { playerId: id, name: id, position, teamId: 't', division: 'A', overall: 70, apps, goals: 0, cleanSheets: 0, yellow: 0, red: 0, ratingSum: apps * avg })
    for (let i = 0; i < 3; i++) add(`g${i}`, 'GOL', 10, 6 + i)
    for (let i = 0; i < 6; i++) add(`d${i}`, 'DEF', 10, 6 + i * 0.1)
    for (let i = 0; i < 6; i++) add(`m${i}`, 'MEI', 10, 6 + i * 0.1)
    for (let i = 0; i < 3; i++) add(`a${i}`, 'ATA', 10, 6 + i)
    add('craque-de-um-jogo', 'ATA', 1, 10)
    const xi = bestEleven(stats, 'A', 10)
    expect(xi.filter((e) => e.position === 'GOL').map((e) => e.playerId)).toEqual(['g2'])
    expect(xi.filter((e) => e.position === 'DEF')).toHaveLength(4)
    expect(xi.filter((e) => e.position === 'MEI')).toHaveLength(4)
    expect(xi.filter((e) => e.position === 'ATA').map((e) => e.playerId)).toEqual(['a2', 'a1'])
    expect(xi).toHaveLength(11)
    expect(bestEleven(stats, 'B', 10)).toEqual([])
  })
})

describe('seleção na carreira', () => {
  it('ao fim da temporada, cada série tem a sua seleção 1-4-4-2 guardada', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const m = useMatchStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
    let guard = 0
    while (!game.isSeasonOver && guard++ < 40) {
      game.autoSelectStarters()
      m.setupRound()
      m.simulateToEnd(true)
      m.confirmRound()
    }
    const record = game.bestXIHistory[0]!
    expect(record.season).toBe(1)
    for (const d of ['A', 'B', 'C', 'D'] as const) {
      const xi = record.divisions[d]!
      expect(xi, d).toHaveLength(11)
      expect(xi.filter((e) => e.position === 'GOL')).toHaveLength(1)
      expect(xi.filter((e) => e.position === 'DEF')).toHaveLength(4)
      expect(xi.filter((e) => e.position === 'MEI')).toHaveLength(4)
      expect(xi.filter((e) => e.position === 'ATA')).toHaveLength(2)
      // Todos da série certa.
      for (const e of xi) expect(game.getTeam(e.teamId)?.division, e.name).toBe(d)
    }
    expect(game.news.some((n) => n.includes('Seleção') || n.includes('seleção'))).toBe(true)
    // Nova temporada zera as estatísticas, mas a seleção antiga fica guardada.
    game.nextSeason()
    expect(game.seasonStats).toEqual({})
    expect(game.bestXIHistory[0]!.season).toBe(1)
  }, 120_000)
})
