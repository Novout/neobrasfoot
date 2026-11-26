import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { DIVISIONS, LEAGUE_DIVISIONS, tableZone } from '../divisions'
import { baseLeagueTeams, setLeagueBase, setLeagueFormat } from '../league'
import { groupOf } from '../libertadores'
import { generateJobOffers } from '../managerMarket'
import { laLigaTeams } from '../templates/laliga'
import { useGameStore } from '../../stores/game'
import { useMatchStore } from '../../stores/match'

describe('La Liga: clubes e elencos reais', () => {
  it('20 clubes da 1ª divisão espanhola, com elenco e técnico reais', () => {
    const teams = laLigaTeams()
    expect(teams).toHaveLength(20)
    expect(teams.every((t) => t.division === 'ESP')).toBe(true)
    expect(new Set(teams.map((t) => t.id)).size).toBe(20)
    for (const t of teams) {
      expect(t.players.length, t.id).toBeGreaterThanOrEqual(16)
      expect(t.managerName, t.id).toBeTruthy()
      // Sem escudo: o distintivo usa as cores.
      expect(t.crest, t.id).toBeUndefined()
    }
    // Elenco real (não gerado): os nomes vêm dos dados baixados.
    const madrid = teams.find((t) => t.id === 'es-real-madrid')!
    expect(madrid.players.some((p) => p.name === 'Thibaut Courtois')).toBe(true)
  })

  it('entra só no formato 2×20 (38 rodadas, como as séries)', () => {
    expect(baseLeagueTeams('brasileirao', '2x20').filter((t) => t.division === 'ESP')).toHaveLength(20)
    expect(baseLeagueTeams('gerada', '2x20').filter((t) => t.division === 'ESP')).toHaveLength(20)
    expect(baseLeagueTeams('brasileirao', '4x8').some((t) => t.division === 'ESP')).toBe(false)
  })

  it('tabela: o 1º é campeão; ninguém sobe nem cai', () => {
    expect(tableZone('ESP', 1, 20)).toBe('champion')
    expect(tableZone('ESP', 4, 20)).toBeNull()
    expect(tableZone('ESP', 20, 20)).toBeNull()
  })
})

describe('La Liga na janela de técnicos', () => {
  const teams = baseLeagueTeams('brasileirao', '2x20')
  const divisionOf = (id: string) => teams.find((t) => t.id === id)!.division
  /** Divisões dos clubes que fizeram proposta em várias janelas (o sorteio dos clubes muda a cada vez). */
  function offerDivisions(teamId: string, score: number, windows = 60) {
    const seen = new Set<string>()
    for (let i = 0; i < windows; i++) for (const o of generateJobOffers(teams, teamId, divisionOf, score)) seen.add(divisionOf(o.teamId))
    return seen
  }

  it('técnico da Série A pode receber proposta de clube da La Liga', () => {
    expect(offerDivisions('palmeiras', 2).has('ESP')).toBe(true)
  })

  it('técnico da Série B com ótima temporada pode ir direto para a La Liga', () => {
    const fromB = teams.find((t) => t.division === 'B')!.id
    expect(offerDivisions(fromB, 4).has('ESP')).toBe(true)
  })

  it('aceitar a proposta de um clube espanhol: o técnico muda de país na virada', () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer('palmeiras', 'Técnico')
    // Fim de temporada forçado: campeonato e copas encerrados.
    game.round = game.totalRounds
    game.cup!.championId = game.cup!.rounds[0]!.ties[0]!.homeId
    game.libertadores!.championId = game.libertadores!.groups[0]!.teamIds[0]!
    if (game.champions) game.champions.championId = game.champions.groups[0]!.teamIds[0]!
    if (game.clubWorldCup) game.clubWorldCup.championId = game.clubWorldCup.guests[0]!
    expect(game.isSeasonOver).toBe(true)
    game.ensureJobOffers()
    game.jobOffers.push({ teamId: 'es-sevilla', division: 'ESP', reason: 'teste' })
    game.nextSeason('es-sevilla')
    expect(game.managedTeam?.name).toBe('Sevilla')
    expect(game.managedDivision).toBe('ESP')
    expect(game.managerOf('es-sevilla')?.isPlayer).toBe(true)
    expect(game.stadium?.name).toBe('Ramón Sánchez-Pizjuán')
    expect(game.managedCupStatus?.state).toBe('absent')
    expect(game.fixtures[0]!.some((f) => f.homeId === 'es-sevilla' || f.awayId === 'es-sevilla')).toBe(true)
  })

  it('técnico de clube espanhol pode receber proposta do Brasil', () => {
    const divisions = offerDivisions('es-getafe', 0)
    expect(divisions.has('A')).toBe(true)
    expect(divisions.has('B')).toBe(true)
  })
})

describe('La Liga na carreira', () => {
  it('jogando com um clube espanhol: fora da Copa e da Libertadores, e a liga segue na virada', { timeout: 240_000 }, () => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer('es-real-madrid', 'Técnico')
    expect(game.managedTeam?.division).toBe('ESP')
    expect(LEAGUE_DIVISIONS).toEqual([...DIVISIONS, 'ESP', 'ENG', 'GER'])
    expect(game.fixtures).toHaveLength(38)
    // Cada rodada tem 10 jogos da La Liga, todos entre clubes espanhóis.
    const spanish = new Set(game.teams.filter((t) => t.division === 'ESP').map((t) => t.id))
    for (const round of game.fixtures) {
      const laLiga = round.filter((f) => spanish.has(f.homeId))
      expect(laLiga).toHaveLength(10)
      expect(laLiga.every((f) => spanish.has(f.awayId))).toBe(true)
    }
    // Fora das copas.
    const cupIds = [...game.cup!.rounds[0]!.ties.flatMap((t) => [t.homeId, t.awayId]), ...(game.cup!.byes ?? [])]
    expect(cupIds.some((id) => spanish.has(id))).toBe(false)
    expect(game.managedCupStatus?.state).toBe('absent')
    expect([...spanish].some((id) => groupOf(game.libertadores!, id))).toBe(false)
    expect(game.managedLibertadoresStatus.state).toBe('absent')

    const match = useMatchStore()
    let guard = 0
    while (!game.isSeasonOver && guard++ < 60) {
      // A Copa é só acompanhada (como qualquer clube fora dela); a Libertadores é simulada sozinha.
      expect(game.nextEvent).not.toBe('libertadores')
      if (game.nextEvent === 'cup') expect(game.nextFixture).toBeNull()
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    expect(game.divisionStandings('ESP')).toHaveLength(20)
    expect(game.bestXI.ESP?.length).toBeGreaterThan(0)
    const champion = game.divisionStandings('ESP')[0]!.teamId
    const championManager = game.managerOf(champion)
    expect(championManager?.trophies.some((t) => t.division === 'ESP')).toBe(true)

    game.nextSeason()
    // Ninguém entra nem sai da La Liga, e as séries brasileiras seguem com 20 clubes.
    expect(game.teams.filter((t) => t.division === 'ESP').map((t) => t.id).sort()).toEqual([...spanish].sort())
    expect(game.teams.filter((t) => t.division === 'A')).toHaveLength(20)
    expect(game.teams.filter((t) => t.division === 'B')).toHaveLength(20)
  })
})
