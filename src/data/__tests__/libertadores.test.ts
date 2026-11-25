import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { seasonCalendar } from '../calendar'
import { cupSchedule } from '../cup'
import {
  BRAZIL_SPOTS, countryOf, createContinentalTeams, createLibertadores, drawGroups, drawRoundOf16, GROUP_ROUNDS, groupRoundsFor,
  groupTable, libertadoresSchedule, quickScore, SOUTH_AMERICAN_CLUBS, stageName, STAGE_COUNT,
} from '../libertadores'
import { createTeams } from '../teams'
import { brasileiraoTemplate } from '../templates/brasileirao'
import { createRng } from '../../utils/random'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'
import type { Team } from '../../types/game'

function participants(): Team[] {
  const brazil = createTeams().filter((t) => t.division === 'A').slice(0, BRAZIL_SPOTS)
  return [...brazil, ...createContinentalTeams()]
}

describe('Libertadores: dados e sorteio', () => {
  it('28 clubes reais do continente, de fora do Brasil, com elencos completos e nomes em espanhol', () => {
    const teams = createContinentalTeams()
    expect(teams).toHaveLength(28)
    expect(new Set(teams.map((t) => t.id)).size).toBe(28)
    expect(teams.every((t) => t.country && t.country !== 'BRA')).toBe(true)
    expect(teams.every((t) => t.players.length === 22)).toBe(true)
    // Nenhum id repete os do Brasileirão.
    const brazilIds = new Set(brasileiraoTemplate('2x20').teams.map((t) => t.id))
    expect(teams.some((t) => brazilIds.has(t.id))).toBe(false)
    // Mesmo clube, mesmos jogadores a cada temporada.
    expect(createContinentalTeams()[0]!.players.map((p) => p.name)).toEqual(teams[0]!.players.map((p) => p.name))
    expect(SOUTH_AMERICAN_CLUBS.find((c) => c.id === 'sa-river-plate')?.country).toBe('ARG')
  })

  it('8 grupos de 4, sem dois clubes do mesmo país no mesmo grupo', () => {
    const teams = participants()
    const byId = new Map(teams.map((t) => [t.id, t]))
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed)
      const groups = drawGroups(teams, rng.next)
      expect(groups).toHaveLength(8)
      expect(groups.every((g) => g.teamIds.length === 4)).toBe(true)
      expect(new Set(groups.flatMap((g) => g.teamIds)).size).toBe(32)
      for (const g of groups) {
        const countries = g.teamIds.map((id) => countryOf(byId.get(id)))
        expect(new Set(countries).size).toBe(countries.length)
      }
    }
  })

  it('turno e returno: 6 rodadas, cada clube joga uma vez por rodada, 3 em casa, e enfrenta cada rival 2 vezes', () => {
    const groups = drawGroups(participants())
    const rounds = groupRoundsFor(groups)
    expect(rounds).toHaveLength(GROUP_ROUNDS)
    for (const ties of rounds) {
      expect(ties).toHaveLength(16)
      expect(new Set(ties.flatMap((t) => [t.homeId, t.awayId])).size).toBe(32)
    }
    const all = rounds.flat()
    for (const id of groups.flatMap((g) => g.teamIds)) {
      expect(all.filter((t) => t.homeId === id)).toHaveLength(3)
      expect(all.filter((t) => t.awayId === id)).toHaveLength(3)
    }
    const g = groups[0]!
    for (const a of g.teamIds) {
      for (const b of g.teamIds) if (a !== b) expect(all.filter((t) => t.homeId === a && t.awayId === b)).toHaveLength(1)
    }
  })

  it('passam os 2 primeiros: o 1º de um grupo pega o 2º do grupo vizinho e joga em casa', () => {
    const lib = createLibertadores(participants(), 1, 38)
    // Resultados fixos: em cada grupo, o clube da posição 0 vence todos, o da 1 vence os de 2 e 3...
    for (const tie of lib.groupRounds.flat()) {
      const g = lib.groups.find((x) => x.teamIds.includes(tie.homeId))!
      const rank = (id: string) => g.teamIds.indexOf(id)
      tie.homeGoals = rank(tie.homeId) < rank(tie.awayId) ? 2 : 0
      tie.awayGoals = rank(tie.homeId) < rank(tie.awayId) ? 0 : 1
    }
    const table = groupTable(lib, 0)
    expect(table.map((r) => r.teamId)).toEqual(lib.groups[0]!.teamIds)
    expect(table[0]!.points).toBe(18)
    const r16 = drawRoundOf16(lib)
    expect(r16.name).toBe('Oitavas de final')
    expect(r16.ties[0]).toMatchObject({ homeId: lib.groups[0]!.teamIds[0], awayId: lib.groups[1]!.teamIds[1] })
    expect(r16.ties[1]).toMatchObject({ homeId: lib.groups[1]!.teamIds[0], awayId: lib.groups[0]!.teamIds[1] })
    expect(r16.ties).toHaveLength(8)
  })

  it('etapas: grupos, oitavas, quartas, semifinal e final; calendário sem bater com a Copa', () => {
    expect(STAGE_COUNT).toBe(10)
    expect(stageName(0)).toBe('Fase de grupos · 1ª rodada')
    expect([6, 7, 8, 9].map(stageName)).toEqual(['Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'])
    for (const [rounds, prelim] of [[14, false], [38, true]] as const) {
      const cup = cupSchedule(rounds, prelim)
      const lib = libertadoresSchedule(rounds, cup)
      expect(lib).toHaveLength(10)
      expect(lib.every((r, i) => r >= 1 && r < rounds && (i === 0 || r >= lib[i - 1]!))).toBe(true)
      expect(lib.some((r) => cup.includes(r))).toBe(false)
      // Cada jogo da Libertadores fica entre a rodada depois da qual é jogado e a seguinte, sem repetir data.
      const entries = seasonCalendar(2027, rounds, cup, lib)
      entries.forEach((e, pos) => {
        if (e.kind !== 'libertadores') return
        expect(entries.slice(0, pos).filter((x) => x.kind === 'league').length).toBe(lib[e.index])
      })
      const midweek = entries.filter((e) => e.kind !== 'league').map((e) => e.date)
      expect(new Set(midweek).size).toBe(midweek.length)
    }
  })

  it('placar simulado na hora: o mais forte vence mais', () => {
    const rng = createRng(7)
    let strongWins = 0
    let weakWins = 0
    for (let i = 0; i < 400; i++) {
      const s = quickScore({ attack: 90, defense: 90 }, { attack: 70, defense: 70 }, rng.next)
      if (s.home > s.away) strongWins++
      if (s.home < s.away) weakWins++
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2)
  })
})

describe('Libertadores na carreira', () => {
  function playUntil(done: () => boolean, limit = 80) {
    const game = useGameStore()
    const match = useMatchStore()
    let guard = 0
    while (!done() && guard++ < limit) {
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
  }

  it('clube classificado: joga os grupos ao vivo, e a temporada só acaba com o campeão', { timeout: 240_000 }, () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    // Na 1ª temporada vão os 4 de maior reputação da Série A.
    const top = createTeams().filter((t) => t.division === 'A').sort((a, b) => b.reputation - a.reputation)[0]!
    game.startCareer(top.id, 'Técnico')
    const lib = game.libertadores!
    expect(lib.groups.flatMap((g) => g.teamIds)).toHaveLength(32)
    expect(game.managedLibertadoresStatus.state).toBe('alive')
    expect(game.continentalTeams).toHaveLength(28)
    expect(game.getTeam('sa-boca-juniors')?.name).toBe('Boca Juniors')

    playUntil(() => game.nextEvent === 'libertadores')
    expect(game.round).toBe(lib.schedule[0])
    expect(game.nextOpponent).not.toBeNull()
    const budget = game.budget
    playUntil(() => game.nextEvent !== 'libertadores', 1)
    expect(game.libertadores!.stage).toBe(1)
    expect(game.budget).toBeGreaterThan(budget)
    expect(game.news.some((n) => n.includes('Libertadores'))).toBe(true)

    playUntil(() => game.isSeasonOver, 120)
    expect(game.isSeasonOver).toBe(true)
    const done = game.libertadores!
    expect(done.championId).toBeTruthy()
    expect(done.knockout.map((r) => r.ties.length)).toEqual([8, 4, 2, 1])
    expect(done.groupRounds.flat().every((t) => t.homeGoals !== null)).toBe(true)
    // Os 4 primeiros da Série A vão para a Libertadores da próxima temporada.
    const qualified = game.divisionStandings('A').slice(0, BRAZIL_SPOTS).map((r) => r.teamId)
    game.nextSeason()
    const next = game.libertadores!
    expect(next.season).toBe(2)
    expect(next.championId).toBeNull()
    const brazil = next.groups.flatMap((g) => g.teamIds).filter((id) => !id.startsWith('sa-'))
    expect(brazil.sort()).toEqual([...qualified].sort())
  })

  it('clube fora da Libertadores: as etapas são simuladas sozinhas, sem parar a temporada', { timeout: 120_000 }, () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    const weakest = createTeams().filter((t) => t.division === 'D')[0]!
    game.startCareer(weakest.id, 'Técnico')
    expect(game.managedLibertadoresStatus.state).toBe('absent')
    const match = useMatchStore()
    let guard = 0
    while (!game.isSeasonOver && guard++ < 40) {
      expect(game.nextEvent).not.toBe('libertadores')
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    expect(game.libertadores!.championId).toBeTruthy()
  })
})
