import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seasonCalendar } from '../calendar'
import { cupSchedule } from '../cup'
import { libertadoresSchedule } from '../libertadores'
import { createTeams } from '../teams'
import {
  confederationOf, createNationalTeams, createWorldCup, isWorldCupYear, nationalTeamOffers, NATIONS, nextWorldCupYear,
  worldCupSchedule, WORLD_CUP_GROUP_ROUNDS,
} from '../worldCup'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

describe('Copa do Mundo: seleções e regras', () => {
  it('a cada 4 anos (2030, 2034...)', () => {
    expect(isWorldCupYear(2030)).toBe(true)
    expect(isWorldCupYear(2027)).toBe(false)
    expect(nextWorldCupYear(2027)).toBe(2030)
    expect(nextWorldCupYear(2031)).toBe(2034)
  })

  it('32 seleções reais de todos os continentes, com convocados', () => {
    expect(NATIONS).toHaveLength(32)
    const teams = createNationalTeams()
    expect(new Set(teams.map((t) => t.id)).size).toBe(32)
    for (const t of teams) {
      expect(t.players.length, t.id).toBeGreaterThanOrEqual(16)
      expect(t.country, t.id).toBeTruthy()
      // Sem escudo: o distintivo usa as cores.
      expect(t.crest, t.id).toBeUndefined()
    }
    const count = (c: string) => NATIONS.filter((n) => n.confederation === c).length
    expect(count('UEFA')).toBe(13)
    expect(count('CONMEBOL')).toBe(6)
  })

  it('sorteio: no máximo uma seleção por continente em cada grupo (Europa: até duas); grupos em turno único', () => {
    const teams = createNationalTeams()
    for (let seed = 0; seed < 10; seed++) {
      const wc = createWorldCup(teams, 1, 38)
      expect(wc.groups).toHaveLength(8)
      for (const g of wc.groups) {
        const confeds = g.teamIds.map((id) => confederationOf(id)!)
        for (const c of new Set(confeds)) {
          expect(confeds.filter((x) => x === c).length).toBeLessThanOrEqual(c === 'UEFA' ? 2 : 1)
        }
      }
      expect(wc.groupRounds).toHaveLength(WORLD_CUP_GROUP_ROUNDS)
      expect(wc.groupRounds.every((r) => r.length === 16)).toBe(true)
    }
  })

  it('calendário: 7 etapas no meio do ano, sem cair no intervalo da Copa do Brasil e da Libertadores', () => {
    for (const [rounds, prelim] of [[14, false], [38, true]] as const) {
      const cup = cupSchedule(rounds, prelim)
      const lib = libertadoresSchedule(rounds, cup)
      const wc = worldCupSchedule(rounds, [...cup, ...lib])
      expect(wc).toHaveLength(7)
      expect(wc.every((r, i) => i === 0 || r >= wc[i - 1]!)).toBe(true)
      const entries = seasonCalendar(2030, rounds, cup, lib, wc)
      entries.forEach((e, pos) => {
        if (e.kind !== 'worldcup') return
        expect(entries.slice(0, pos).filter((x) => x.kind === 'league').length).toBe(wc[e.index])
      })
    }
  })

  it('convites pelo prestígio: técnico de clube grande pode ser chamado por uma seleção grande', () => {
    const top = new Set<string>()
    const modest = new Set<string>()
    for (let i = 0; i < 40; i++) {
      nationalTeamOffers(96).forEach((id) => top.add(id))
      nationalTeamOffers(70).forEach((id) => modest.add(id))
    }
    const rep = (id: string) => NATIONS.find((n) => n.id === id)!.reputation
    expect(Math.max(...[...top].map(rep))).toBeGreaterThanOrEqual(92)
    expect(Math.max(...[...modest].map(rep))).toBeLessThanOrEqual(72)
    expect(nationalTeamOffers(80)).toHaveLength(3)
  })
})

describe('Copa do Mundo na carreira', () => {
  afterEach(() => vi.useRealTimers())

  /** Carreira começando em 2030 (ano de Copa): o relógio do teste fica em novembro de 2029. */
  function careerIn2030() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2029, 10, 1))
    setActivePinia(createPinia())
    const game = useGameStore()
    const top = createTeams().filter((t) => t.division === 'A').sort((a, b) => b.reputation - a.reputation)[0]!
    game.startCareer(top.id, 'Técnico')
    return { game, match: useMatchStore() }
  }

  function play(game: ReturnType<typeof useGameStore>, match: ReturnType<typeof useMatchStore>, until: () => boolean, limit = 80) {
    let guard = 0
    while (!until() && guard++ < limit) {
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
  }

  it('treinando uma seleção: escala e joga a Copa sem deixar o clube', { timeout: 240_000 }, () => {
    const { game, match } = careerIn2030()
    expect(game.currentYear).toBe(2030)
    expect(game.worldCup).not.toBeNull()
    expect(game.nationalTeams).toHaveLength(32)
    expect(game.nationalOffers.length).toBeGreaterThan(0)
    const clubId = game.managedTeamId
    const nationId = game.nationalOffers[0]!
    expect(game.acceptNationalJob(nationId)).toBeNull()
    expect(game.nationalJob?.teamId).toBe(nationId)
    expect(game.nationalOffers).toEqual([])

    play(game, match, () => game.nextEvent === 'worldcup')
    // O próximo jogo é da seleção: escalação e adversário são dela; o clube continua o mesmo.
    expect(game.lineupTeamId).toBe(nationId)
    expect(game.coachingNational).toBe(true)
    expect(game.managedTeamId).toBe(clubId)
    expect(game.starters.every((p) => game.getTeam(nationId)!.players.includes(p))).toBe(true)
    expect(game.nextOpponent?.id.startsWith('nt-')).toBe(true)
    const clubBudget = game.budget
    game.autoSelectStarters()
    match.setupRound()
    expect(match.managedMatch?.homeId === nationId || match.managedMatch?.awayId === nationId).toBe(true)
    match.simulateToEnd(true)
    match.confirmRound()
    expect(game.worldCup!.stage).toBe(1)
    // A Copa não mexe no caixa do clube.
    expect(game.budget).toBe(clubBudget)
    expect(game.news.some((n) => n.includes('Copa do Mundo'))).toBe(true)

    play(game, match, () => game.isSeasonOver, 120)
    expect(game.isSeasonOver).toBe(true)
    const wc = game.worldCup!
    expect(wc.championId).toBeTruthy()
    expect(wc.knockout.map((r) => r.ties.length)).toEqual([8, 4, 2, 1])
    if (wc.championId === nationId) {
      expect(game.managers.find((m) => m.isPlayer)!.trophies.some((t) => t.kind === 'worldcup')).toBe(true)
    }

    // Temporada seguinte (2031): sem Copa e sem seleção.
    game.nextSeason()
    expect(game.currentYear).toBe(2031)
    expect(game.worldCup).toBeNull()
    expect(game.nationalJob).toBeNull()
    expect(game.lineupTeamId).toBe(game.managedTeamId)
  })

  it('sem aceitar convite: a Copa é simulada sozinha e o clube segue jogando', { timeout: 240_000 }, () => {
    const { game, match } = careerIn2030()
    game.declineNationalOffers()
    expect(game.nationalOffers).toEqual([])
    let guard = 0
    while (!game.isSeasonOver && guard++ < 60) {
      expect(game.nextEvent).not.toBe('worldcup')
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.worldCup!.championId).toBeTruthy()
  })
})
