import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCup, cupPhases, cupPrize, cupSchedule, PRELIMINARY_NAME, PRELIMINARY_PRIZE } from '../../data/cup'
import { seasonEndDelta, tableDriftDelta } from '../../data/confidence'
import { DIVISIONS, formatOfTeams, PROMOTION_SPOTS, tableZone } from '../../data/divisions'
import { setLeagueBase, setLeagueFormat } from '../../data/league'
import { parseLeagueFile, teamsFromLeagueFile, teamsToLeagueFile } from '../../data/leagueFile'
import { createTeams } from '../../data/teams'
import { brasileiraoTemplate } from '../../data/templates/brasileirao'
import { useGameStore } from '../game'
import { useMatchStore } from '../match'

const NEW_CLUBS = ['mirassol', 'criciuma', 'atletico-go', 'chapecoense', 'operario-pr', 'vila-nova', 'novorizontino', 'amazonas']

describe('formato 2 séries × 20 clubes', () => {
  it('Brasileirão 2×20: 40 clubes reais, 20 por série, os mais fortes na Série A', () => {
    const { league, errors } = parseLeagueFile(JSON.stringify(brasileiraoTemplate('2x20')))
    expect(errors).toEqual([])
    expect(league!.divisionFormat).toBe('2x20')
    const teams = teamsFromLeagueFile(league!)
    expect(teams).toHaveLength(40)
    expect(teams.filter((t) => t.division === 'A')).toHaveLength(20)
    expect(teams.filter((t) => t.division === 'B')).toHaveLength(20)
    const minA = Math.min(...teams.filter((t) => t.division === 'A').map((t) => t.reputation))
    const maxB = Math.max(...teams.filter((t) => t.division === 'B').map((t) => t.reputation))
    expect(minA).toBeGreaterThanOrEqual(maxB)
    // Os 8 clubes novos vêm com elenco real, técnico e escudo.
    for (const id of NEW_CLUBS) {
      const t = teams.find((x) => x.id === id)!
      expect(t, id).toBeDefined()
      expect(t.players.length, id).toBeGreaterThanOrEqual(16)
      expect(t.managerName, id).toBeTruthy()
      expect(t.crest, id).toBe(`escudos/${id}.png`)
    }
  })

  it('o formato 4×8 continua com os 32 clubes de antes', () => {
    const teams = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(brasileiraoTemplate())).league!)
    expect(teams).toHaveLength(32)
    expect(teams.some((t) => NEW_CLUBS.includes(t.id))).toBe(false)
    expect(formatOfTeams(teams)).toBe('4x8')
  })

  it('liga gerada 2×20 tem 40 clubes fictícios', () => {
    const teams = createTeams('2x20')
    expect(teams).toHaveLength(40)
    expect(new Set(teams.map((t) => t.id)).size).toBe(40)
    expect(formatOfTeams(teams)).toBe('2x20')
  })

  it('arquivo de liga: 2×20 vai e volta; clube na Série C num 2×20 é recusado', () => {
    const file = teamsToLeagueFile(createTeams('2x20'))
    expect(file.divisionFormat).toBe('2x20')
    expect(parseLeagueFile(JSON.stringify(file)).errors).toEqual([])
    file.teams[0]!.division = 'C'
    const { errors } = parseLeagueFile(JSON.stringify(file))
    expect(errors.some((e) => e.includes('não existe a Série C'))).toBe(true)
  })

  it('Copa com os 40 clubes: os 16 mais fracos jogam a fase preliminar, os outros 24 entram na 1ª fase', () => {
    const teams = createTeams('2x20')
    const cup = createCup(teams, 1, 0, 38)
    const prelim = cup.rounds[0]!
    expect(prelim.name).toBe(PRELIMINARY_NAME)
    expect(prelim.ties).toHaveLength(8)
    expect(cup.byes).toHaveLength(24)
    // Todo clube está em exatamente um lugar: na preliminar ou entre os que entram direto.
    const inPrelim = prelim.ties.flatMap((t) => [t.homeId, t.awayId])
    expect(new Set([...inPrelim, ...cup.byes!]).size).toBe(40)
    // Quem entra direto é mais forte que quem joga a preliminar (série, depois reputação).
    const rep = (id: string) => teams.find((t) => t.id === id)!
    expect(cup.byes!.every((id) => rep(id).division === 'A' || inPrelim.every((p) => rep(p).reputation <= rep(id).reputation))).toBe(true)
    // 6 fases: preliminar + 1ª fase, oitavas, quartas, semi e final.
    expect(cupPhases(cup).map((p) => p.ties)).toEqual([8, 16, 8, 4, 2, 1])
    expect(cup.schedule).toEqual(cupSchedule(38, true))
    expect(cupSchedule(38, true)).toEqual([2, 5, 14, 22, 30, 35])
    expect(cupPrize(cup, 0)).toBe(PRELIMINARY_PRIZE)
    // No 4×8 nada muda: 32 clubes direto na 1ª fase.
    const classic = createCup(createTeams(), 1)
    expect(classic.byes).toBeUndefined()
    expect(classic.rounds[0]!.ties).toHaveLength(16)
    expect(cupSchedule(14)).toEqual([2, 5, 8, 11, 13])
  })

  it('balanço da diretoria na escala do tamanho da série', () => {
    // 5 posições acima do esperado numa série de 20 valem como 2 numa de 8.
    expect(tableDriftDelta(10, 5, 20)).toBe(tableDriftDelta(4, 2, 8))
    expect(seasonEndDelta(null, 5, 10, false, 20).board).toBe(seasonEndDelta(null, 2, 4, false, 8).board)
  })
})

describe('carreira no formato 2×20', () => {
  let game: ReturnType<typeof useGameStore>
  beforeEach(() => {
    setLeagueBase('brasileirao')
    setLeagueFormat('2x20')
    setActivePinia(createPinia())
    game = useGameStore()
    game.startCareer('mirassol', 'Técnico')
  })

  it('séries A e B, 38 rodadas com 20 jogos cada, 4 sobem e 4 descem', () => {
    expect(DIVISIONS).toEqual(['A', 'B'])
    expect(PROMOTION_SPOTS).toBe(4)
    expect(game.teams).toHaveLength(40)
    expect(game.fixtures).toHaveLength(38)
    expect(game.fixtures.every((r) => r.length === 20)).toBe(true)
    expect(game.cup!.rounds[0]!.ties).toHaveLength(8)
    expect(game.cup!.byes).toHaveLength(24)
    expect(tableZone('A', 17, 20)).toBe('relegation')
    expect(tableZone('B', 4, 20)).toBe('promotion')
    // Com a Série C fora da liga, os 4 últimos da B também caem.
    expect(tableZone('B', 20, 20)).toBe('relegation')
    expect(tableZone('B', 16, 20)).toBeNull()
  })

  it('uma temporada inteira: a Copa termina e a virada mantém 20 clubes por série', () => {
    const match = useMatchStore()
    let guard = 0
    while (!game.isSeasonOver && guard++ < 60) {
      game.autoSelectStarters()
      match.setupRound()
      match.simulateToEnd(true)
      match.confirmRound()
    }
    expect(game.isSeasonOver).toBe(true)
    expect(game.cup!.championId).toBeTruthy()
    // Depois da preliminar, a 1ª fase tem os 24 que entraram direto e os 8 vencedores.
    const cup = game.cup!
    expect(cup.rounds.map((r) => r.ties.length)).toEqual([8, 16, 8, 4, 2, 1])
    const firstPhase = cup.rounds[1]!.ties.flatMap((t) => [t.homeId, t.awayId])
    expect(cup.byes!.every((id) => firstPhase.includes(id))).toBe(true)
    expect(cup.rounds[0]!.ties.every((t) => firstPhase.includes(t.winnerId!))).toBe(true)
    const before = Object.fromEntries(game.teams.map((t) => [t.id, t.division]))
    const reserveBefore = game.reserveTeams.map((t) => t.id)
    const lastOfB = game.divisionStandings('B').slice(-4).map((r) => r.teamId)
    const managerStays = !lastOfB.includes(game.managedTeamId!)
    game.nextSeason()
    const moved = game.teams.filter((t) => before[t.id] && before[t.id] !== t.division)
    expect(moved.filter((t) => t.division === 'A')).toHaveLength(4)
    expect(moved.filter((t) => t.division === 'B')).toHaveLength(4)
    // Os 4 últimos da Série B saem da liga para a Série C, e os 4 da Série C sobem para a B.
    expect(lastOfB.every((id) => !game.teams.some((t) => t.id === id))).toBe(true)
    expect(game.reserveTeams.map((t) => t.id).sort()).toEqual([...lastOfB].sort())
    expect(reserveBefore.every((id) => game.getTeam(id)?.division === 'B')).toBe(true)
    if (managerStays) expect(game.managedTeam).not.toBeNull()
    // Quem sobe chega com o técnico real dele.
    expect(game.managerOf('ferroviaria')?.name).toBeTruthy()
    expect(game.teams.filter((t) => t.division === 'A')).toHaveLength(20)
    expect(game.teams.filter((t) => t.division === 'B')).toHaveLength(20)
    expect(game.fixtures).toHaveLength(38)
  }, 240_000)

  it('começa com a Série C: 4 clubes reais com elenco, técnico e escudo', () => {
    expect(game.reserveTeams.map((t) => t.id).sort()).toEqual(['athletic-mg', 'botafogo-sp', 'ferroviaria', 'volta-redonda'])
    for (const t of game.reserveTeams) {
      expect(t.division).toBe('C')
      expect(t.players.length, t.id).toBeGreaterThanOrEqual(16)
      expect(t.managerName, t.id).toBeTruthy()
      expect(t.crest, t.id).toBe(`escudos/${t.id}.png`)
    }
    // Não jogam: fora da tabela, do calendário e da Copa.
    expect(game.teams.some((t) => t.division === 'C')).toBe(false)
    expect(game.standings).toHaveLength(40)
    expect(tableZone('B', 17, 20)).toBe('relegation')
  })

  it('seu clube caindo para a Série C: não dá para ficar, e o técnico assume outro clube', () => {
    // Coloca o seu clube na Série B e força a última colocação.
    setLeagueBase('brasileirao')
    setActivePinia(createPinia())
    game = useGameStore()
    game.startCareer('amazonas', 'Técnico')
    const myRow = game.standings.find((r) => r.teamId === 'amazonas')!
    for (const r of game.standings) if (game.getTeam(r.teamId)?.division === 'B' && r !== myRow) r.wins = 10
    game.round = game.totalRounds
    if (game.cup) game.cup.championId = game.cup.rounds[0]!.ties[0]!.homeId
    if (game.libertadores) game.libertadores.championId = game.libertadores.groups[0]!.teamIds[0]!
    expect(game.managedFallsOut).toBe(true)
    game.nextSeason()
    expect(game.managedTeamId).not.toBe('amazonas')
    expect(game.managedTeam).not.toBeNull()
    expect(game.reserveTeams.some((t) => t.id === 'amazonas')).toBe(true)
  })
})
