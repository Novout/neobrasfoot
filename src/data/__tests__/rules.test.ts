import { describe, expect, it } from 'vitest'
import { createRng, hashString } from '../../utils/random'
import { createCup, drawNextRound, simulatePenalties, tieWinner } from '../cup'
import { injuryChanceFor, isAvailable, rollInjuryGames, unavailableReason } from '../discipline'
import { divisionAbove, divisionBelow, tableZone } from '../divisions'
import { generateFixtures } from '../fixtures'
import { durationLabel, loanFee } from '../loans'
import { energyCost, starBoost } from '../stars'
import { FORMATIONS, playingPosition, positionFit } from '../tactics'
import { createTeams } from '../teams'
import { retirementChance, seasonProgression } from '../youth'

describe('táticas', () => {
  it('toda formação tem 11 jogadores e 1 goleiro', () => {
    for (const counts of Object.values(FORMATIONS)) {
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11)
      expect(counts.GOL).toBe(1)
    }
  })

  it('improvisado joga na linha escolhida; sem role, na própria posição', () => {
    expect(playingPosition({ position: 'MEI' })).toBe('MEI')
    expect(playingPosition({ position: 'MEI', role: 'ATA' })).toBe('ATA')
  })

  it('rendimento fora da posição cai com a distância', () => {
    expect(positionFit('ATA', 'ATA')).toBe(1)
    expect(positionFit('MEI', 'ATA')).toBe(0.85)
    expect(positionFit('DEF', 'MEI')).toBe(0.85)
    expect(positionFit('DEF', 'ATA')).toBe(0.7)
    expect(positionFit('GOL', 'DEF')).toBe(0.4)
    expect(positionFit('ATA', 'GOL')).toBe(0.4)
  })
})

describe('cartões e lesões', () => {
  it('suspensos e lesionados ficam indisponíveis, com o motivo', () => {
    expect(isAvailable({})).toBe(true)
    expect(unavailableReason({})).toBeNull()
    expect(isAvailable({ injury: 2 })).toBe(false)
    expect(unavailableReason({ injury: 2 })).toBe('Lesionado (2 jogos)')
    expect(unavailableReason({ suspension: 1 })).toBe('Suspenso (1 jogo)')
  })

  it('cansaço aumenta o risco de lesão', () => {
    expect(injuryChanceFor(50)).toBeCloseTo(injuryChanceFor(100) * 2)
    expect(injuryChanceFor(0)).toBeCloseTo(injuryChanceFor(100) * 3)
  })

  it('lesões duram de 1 a 6 jogos, a maioria curta', () => {
    expect(rollInjuryGames(0)).toBe(1)
    expect(rollInjuryGames(0.5)).toBe(2)
    expect(rollInjuryGames(0.8)).toBe(3)
    expect(rollInjuryGames(0.95)).toBe(4)
    expect(rollInjuryGames(0.99)).toBeGreaterThanOrEqual(5)
    expect(rollInjuryGames(0.99)).toBeLessThanOrEqual(6)
  })
})

describe('divisões', () => {
  it('sobe e desce entre as séries', () => {
    expect(divisionAbove('A')).toBeNull()
    expect(divisionAbove('B')).toBe('A')
    expect(divisionBelow('C')).toBe('D')
    expect(divisionBelow('D')).toBeNull()
  })

  it('zonas da tabela: título, acesso e rebaixamento', () => {
    expect(tableZone('A', 1, 8)).toBe('champion')
    expect(tableZone('A', 2, 8)).toBeNull()
    expect(tableZone('A', 7, 8)).toBe('relegation')
    expect(tableZone('B', 2, 8)).toBe('promotion')
    expect(tableZone('D', 8, 8)).toBeNull() // não há série abaixo da D
  })
})

describe('calendário', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `t${i}`)
  const fixtures = generateFixtures(ids)

  it('turno e returno: 14 rodadas com 4 jogos', () => {
    expect(fixtures).toHaveLength(14)
    for (const round of fixtures) expect(round).toHaveLength(4)
  })

  it('cada time joga uma vez por rodada e enfrenta todos em casa e fora', () => {
    for (const round of fixtures) {
      const playing = round.flatMap((g) => [g.homeId, g.awayId])
      expect(new Set(playing).size).toBe(8)
    }
    const pairs = fixtures.flat().map((g) => `${g.homeId}>${g.awayId}`)
    expect(new Set(pairs).size).toBe(8 * 7)
  })

  it('número ímpar de times: um folga por rodada', () => {
    const odd = generateFixtures(['a', 'b', 'c'])
    expect(odd).toHaveLength(6)
    for (const round of odd) expect(round).toHaveLength(1)
  })
})

describe('Copa do Brasil', () => {
  const teams = createTeams()

  it('1ª fase põe A/B contra C/D, com o menor em casa', () => {
    const cup = createCup(teams, 1)
    const division = (id: string) => teams.find((t) => t.id === id)!.division
    const ties = cup.rounds[0]!.ties
    expect(ties).toHaveLength(16)
    for (const tie of ties) {
      expect(['C', 'D']).toContain(division(tie.homeId))
      expect(['A', 'B']).toContain(division(tie.awayId))
    }
  })

  it('próximas fases sorteiam os vencedores em pares', () => {
    const round = drawNextRound(['a', 'b', 'c', 'd'])
    expect(round.ties).toHaveLength(2)
    expect(round.ties.flatMap((t) => [t.homeId, t.awayId]).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('pênaltis nunca terminam empatados', () => {
    for (let i = 0; i < 200; i++) {
      const p = simulatePenalties()
      expect(p.home).not.toBe(p.away)
    }
  })

  it('vencedor do confronto: gols, depois pênaltis', () => {
    expect(tieWinner('a', 'b', 2, 1, null)).toBe('a')
    expect(tieWinner('a', 'b', 0, 1, null)).toBe('b')
    expect(tieWinner('a', 'b', 1, 1, null)).toBeNull()
    expect(tieWinner('a', 'b', 1, 1, { home: 3, away: 4 })).toBe('b')
  })
})

describe('estrelas, empréstimos e base', () => {
  it('estrela ganha OVR e gasta metade da energia', () => {
    expect(starBoost(true)).toBeGreaterThan(0)
    expect(starBoost(false)).toBe(0)
    expect(energyCost(22, false)).toBe(22)
    expect(energyCost(22, true)).toBe(11)
  })

  it('taxa de empréstimo proporcional às rodadas, arredondada em milhares', () => {
    expect(loanFee(1_000_000, 7)).toBe(140_000)
    expect(loanFee(1_234_567, 1) % 1000).toBe(0)
    expect(durationLabel(1)).toBe('1 rodada')
    expect(durationLabel(3)).toBe('3 rodadas')
  })

  it('aposentadoria só a partir dos 34 e certa aos 38', () => {
    expect(retirementChance(33)).toBe(0)
    expect(retirementChance(34)).toBeGreaterThan(0)
    expect(retirementChance(38)).toBe(1)
  })

  it('jovens evoluem e veteranos caem', () => {
    const rng = createRng(1)
    for (let i = 0; i < 50; i++) {
      expect(seasonProgression(19, rng)).toBeGreaterThan(0)
      expect(seasonProgression(33, rng)).toBeLessThan(0)
    }
  })
})

describe('aleatoriedade determinística', () => {
  it('mesma semente gera a mesma sequência', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect(Array.from({ length: 5 }, a.next)).toEqual(Array.from({ length: 5 }, b.next))
    expect(hashString('flamengo')).toBe(hashString('flamengo'))
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('elencos padrão são sempre os mesmos', () => {
    expect(createTeams()[0]!.players.map((p) => p.overall)).toEqual(createTeams()[0]!.players.map((p) => p.overall))
  })
})

describe('cansaço', () => {
  it('quem joga cansa menos do que recupera descansando, e veteranos cansam mais', async () => {
    const { fullMatchDrain, matchEnergyCost, playedRecovery, REST_RECOVERY } = await import('../energy')
    const young = matchEnergyCost({ age: 24, star: false })
    const veteran = matchEnergyCost({ age: 33, star: false })
    expect(veteran).toBeGreaterThan(young)
    expect(matchEnergyCost({ age: 24, star: true })).toBeLessThan(young)
    // Todo titular que joga um jogo inteiro termina a rodada com menos energia — inclusive estrelas
    // e meias com Fôlego, que gastam pouco (antes recuperavam tudo e ficavam sempre em 100%).
    const base = { id: 'x', position: 'MEI' as const }
    const cases = [
      { ...base, age: 24, star: false },
      { ...base, age: 33, star: false },
      { ...base, age: 24, star: true },
      { ...base, age: 24, star: true, skills: ['folego', 'passe'] as never },
      { ...base, age: 24, star: false, skills: ['folego', 'passe'] as never },
    ]
    for (const p of cases) {
      const net = Math.round(fullMatchDrain(p)) - playedRecovery(p)
      expect(net, JSON.stringify(p)).toBeGreaterThanOrEqual(2)
      expect(playedRecovery(p)).toBeLessThan(REST_RECOVERY)
    }
    // Jovem comum ainda perde pouco por jogo (não zera a energia em poucas rodadas).
    expect(Math.round(fullMatchDrain(cases[0]!)) - playedRecovery(cases[0]!)).toBeLessThanOrEqual(6)
  })
})

describe('marcação', () => {
  it('forte protege mais o gol e leva mais cartões; leve o contrário; média é neutra', async () => {
    const { MARKINGS, markingOf } = await import('../tactics')
    expect(markingOf({})).toBe('media')
    expect(MARKINGS.media).toMatchObject({ concede: 1, cards: 1, fouls: 1 })
    expect(MARKINGS.forte.concede).toBeLessThan(1)
    expect(MARKINGS.forte.cards).toBeGreaterThan(1)
    expect(MARKINGS.leve.concede).toBeGreaterThan(1)
    expect(MARKINGS.leve.cards).toBeLessThan(1)
  })

  it('a marcação muda a defesa do time na força calculada', async () => {
    const { lineupStrength } = await import('../../stores/game')
    const { createTeams } = await import('../teams')
    const players = createTeams()[0]!.players
    const pick = (pos: string, n: number) => players.filter((p) => p.position === pos).slice(0, n)
    const starters = [...pick('GOL', 1), ...pick('DEF', 4), ...pick('MEI', 4), ...pick('ATA', 2)]
    const def = (marking: 'leve' | 'media' | 'forte') =>
      lineupStrength(starters, { formation: '4-4-2', style: 'equilibrado', marking }).defense
    expect(def('forte')).toBeGreaterThan(def('media'))
    expect(def('leve')).toBeLessThan(def('media'))
    // Saves antigos (sem marcação) jogam como "média".
    expect(lineupStrength(starters, { formation: '4-4-2', style: 'equilibrado' }).defense).toBe(def('media'))
  })
})
