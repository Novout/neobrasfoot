import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTeams } from '../../data/teams'
import { createRng } from '../../utils/random'
import { useGameStore } from '../game'
import { MAX_SUBSTITUTIONS, useMatchStore } from '../match'

describe('rodada ao vivo', () => {
  let game: ReturnType<typeof useGameStore>
  let match: ReturnType<typeof useMatchStore>
  const teamId = createTeams()[0]!.id

  beforeEach(() => {
    // Sorteios da partida (gols, cartões, lesões) com semente fixa: o teste não depende da sorte.
    const rng = createRng(2026)
    vi.spyOn(Math, 'random').mockImplementation(rng.next)
    setActivePinia(createPinia())
    game = useGameStore()
    match = useMatchStore()
    game.startCareer(teamId, 'Técnico Teste')
    match.setupRound()
  })
  afterEach(() => vi.restoreAllMocks())

  /** Avança até o intervalo, resolvendo paradas por lesão no caminho. */
  function playToHalftime() {
    match.simulateToEnd()
    while (match.injuryBreak) {
      match.resumeSecondHalf(false)
      match.simulateToEnd()
    }
  }

  it('monta todos os jogos da rodada, incluindo o do clube', () => {
    expect(match.isReady).toBe(true)
    expect(match.matches.length).toBe(16) // 4 jogos em cada uma das 4 séries
    expect(match.managedMatch).not.toBeNull()
  })

  it('para no intervalo do jogo do clube', () => {
    playToHalftime()
    expect(match.halftime).toBe(true)
    expect(match.minute).toBe(45)
    expect(match.isFinished).toBe(false)
  })

  it('energia cai durante o jogo', () => {
    playToHalftime()
    const onPitch = match.lineups[teamId]!
    for (const p of onPitch) expect(p.energy).toBeLessThan(100)
  })

  it('substituição no intervalo troca o jogador e conta o limite', () => {
    playToHalftime()
    const out = match.lineups[teamId]!.find((p) => p.position !== 'GOL')!
    for (let i = 0; i < MAX_SUBSTITUTIONS + 1; i++) {
      const bench = match.bench.find((p) => p.position !== 'GOL')
      const current = match.lineups[teamId]!.find((p) => p.position !== 'GOL' && p.id !== out.id) ?? out
      if (bench) match.substitute(i === 0 ? out.id : current.id, bench.id)
    }
    expect(match.subsUsed).toBe(MAX_SUBSTITUTIONS)
    expect(match.lineups[teamId]!.some((p) => p.id === out.id)).toBe(false)
    // Só as trocas do seu time (o adversário também mexe no intervalo).
    expect(match.managedMatch!.events.filter((e) => e.type === 'sub' && e.teamId === teamId)).toHaveLength(MAX_SUBSTITUTIONS)
  })

  it('rodada completa atualiza tabela, rodada e energia dos jogadores', () => {
    match.simulateToEnd(true)
    expect(match.isFinished).toBe(true)
    const m = match.managedMatch!
    const goals = m.events.filter((e) => e.type === 'gol')
    expect(goals.filter((e) => e.teamId === m.homeId)).toHaveLength(m.homeGoals)
    expect(goals.filter((e) => e.teamId === m.awayId)).toHaveLength(m.awayGoals)
    const played = m.playedEnergy!

    match.confirmRound()
    expect(game.round).toBe(1)
    expect(match.matches).toHaveLength(0)
    const row = game.standings.find((r) => r.teamId === teamId)!
    expect(row.played).toBe(1)
    expect(row.goalsFor).toBe(m.homeId === teamId ? m.homeGoals : m.awayGoals)
    // Quem jogou fica com a energia do fim do jogo; os outros descansam.
    for (const p of game.managedTeam!.players) {
      if (played[p.id] !== undefined) expect(p.energy).toBe(played[p.id])
    }
  })

  it('cada jogo tem faltas e acréscimos nos dois tempos', () => {
    match.simulateToEnd(true)
    for (const m of match.matches) {
      expect(m.fouls!.home + m.fouls!.away).toBeGreaterThan(0)
      expect(m.added!.first).toBeGreaterThanOrEqual(1)
      expect(m.added!.first).toBeLessThanOrEqual(6)
      expect(m.added!.second).toBeGreaterThanOrEqual(2)
      expect(m.added!.second).toBeLessThanOrEqual(10)
      // Nada acontece depois do fim dos acréscimos do próprio jogo.
      for (const e of m.events.filter((e) => e.extra)) {
        expect(e.extra!).toBeLessThanOrEqual(e.minute <= 45 ? m.added!.first! : m.added!.second!)
      }
    }
    // A rodada só termina quando o jogo com mais acréscimos acaba.
    expect(match.minute).toBe(90)
    expect(match.extra).toBe(Math.max(...match.matches.map((m) => m.added!.second!)))
  })

  it('o 1º tempo vai até o fim dos acréscimos e o intervalo volta o relógio a 45', () => {
    playToHalftime()
    const longest = Math.max(...match.matches.map((m) => m.added!.first!))
    // O jogo com mais acréscimos chegou ao último minuto deles.
    const lastStoppage = Math.max(0, ...match.matches.flatMap((m) => m.events.filter((e) => e.minute === 45 && e.extra).map((e) => e.extra!)))
    expect(lastStoppage).toBeLessThanOrEqual(longest)
    expect(match.halftime).toBe(true)
    expect(match.minute).toBe(45)
    expect(match.extra).toBe(0)
    match.resumeSecondHalf(false)
    expect(match.period).toBe(2)
    for (const m of match.matches) expect(match.halfOverFor(m)).toBe(false)
  })

  it('total de pontos distribuídos bate com os resultados', () => {
    match.simulateToEnd(true)
    const draws = match.matches.filter((m) => m.homeGoals === m.awayGoals).length
    const expected = (match.matches.length - draws) * 3 + draws * 2
    match.confirmRound()
    const points = game.standings.reduce((sum, r) => sum + r.wins * 3 + r.draws, 0)
    expect(points).toBe(expected)
  })
})
