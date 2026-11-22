import { describe, expect, it } from 'vitest'
import type { PenaltyKick, Player } from '../../types/game'
import { createRng } from '../../utils/random'
import {
  bestTakers, eligibleKickers, kickConversion, nextKickingTeam, shootoutDecided, shootoutScore, simulateShootout, type ShootoutState,
} from '../penalties'

type Kicker = Pick<Player, 'id' | 'name' | 'position' | 'skills' | 'overall' | 'energy'>
const kicker = (over: Partial<Kicker> = {}): Kicker => ({
  id: Math.random().toString(36), name: 'Batedor', position: 'ATA', skills: ['velocidade', 'drible'], overall: 70, energy: 100, ...over,
})
const keeper = (over: Partial<Kicker> = {}) => kicker({ position: 'GOL', skills: ['colocacao', 'tiro-de-meta'], ...over })

function state(kicks: [string, boolean][], firstId = 'h'): ShootoutState {
  return {
    homeId: 'h', awayId: 'a', firstId,
    kicks: kicks.map(([teamId, scored], i): PenaltyKick => ({ teamId, scored, playerId: `${teamId}${i}`, playerName: 'x' })),
  }
}

describe('cobrança de pênalti', () => {
  it('batedor melhor e com habilidade converte mais', () => {
    const gk = keeper()
    expect(kickConversion(kicker({ overall: 85 }), gk)).toBeGreaterThan(kickConversion(kicker({ overall: 60 }), gk))
    expect(kickConversion(kicker({ skills: ['cobrador-de-penaltis', 'drible'] }), gk)).toBeGreaterThan(kickConversion(kicker(), gk))
  })

  it('pegador de pênaltis defende mais; goleiro batendo e cansaço atrapalham', () => {
    const taker = kicker()
    expect(kickConversion(taker, keeper({ skills: ['pegador-de-penaltis', 'reflexos'] }))).toBeLessThan(kickConversion(taker, keeper()))
    expect(kickConversion(kicker({ position: 'GOL', skills: ['colocacao', 'reflexos'] }), keeper())).toBeLessThan(kickConversion(taker, keeper()))
    expect(kickConversion(kicker({ energy: 20 }), keeper())).toBeLessThan(kickConversion(taker, keeper()))
  })

  it('o melhor batedor vem primeiro', () => {
    const list = [kicker({ overall: 60 }), kicker({ overall: 80, skills: ['cobrador-de-penaltis', 'finalizacao'] }), kicker({ overall: 70 })]
    expect(bestTakers(list, keeper())[0]).toBe(list[1])
  })
})

describe('disputa de pênaltis', () => {
  it('alterna as cobranças a partir de quem começa', () => {
    expect(nextKickingTeam(state([], 'a'))).toBe('a')
    expect(nextKickingTeam(state([['a', true]], 'a'))).toBe('h')
  })

  it('acaba antes das 5 quando um lado não alcança mais o outro', () => {
    // 3 x 0 depois de 3 cobranças cada: o visitante só teria mais 2.
    const s = state([['h', true], ['a', false], ['h', true], ['a', false], ['h', true], ['a', false]])
    expect(shootoutDecided(s)).toBe(true)
    expect(shootoutScore(s)).toEqual({ home: 3, away: 0 })
  })

  it('empate nas 5 vai para a morte súbita, que só acaba com o mesmo número de cobranças', () => {
    const five = Array.from({ length: 10 }, (_, i): [string, boolean] => [i % 2 ? 'a' : 'h', true])
    expect(shootoutDecided(state(five))).toBe(false)
    expect(shootoutDecided(state([...five, ['h', true]]))).toBe(false)
    expect(shootoutDecided(state([...five, ['h', true], ['a', false]]))).toBe(true)
    expect(shootoutDecided(state([...five, ['h', true], ['a', true]]))).toBe(false)
  })

  it('ninguém bate de novo antes de todos do time terem batido', () => {
    const team = [kicker({ id: 'p1' }), kicker({ id: 'p2' })]
    const s: ShootoutState = { homeId: 'h', awayId: 'a', firstId: 'h', kicks: [] }
    s.kicks.push({ teamId: 'h', playerId: 'p1', playerName: 'x', scored: true })
    expect(eligibleKickers(s, 'h', team).map((p) => p.id)).toEqual(['p2'])
    s.kicks.push({ teamId: 'h', playerId: 'p2', playerName: 'x', scored: true })
    expect(eligibleKickers(s, 'h', team).map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('disputa simulada sempre tem vencedor e respeita as regras', () => {
    const rng = createRng(3)
    const team = () => [keeper(), ...Array.from({ length: 10 }, () => kicker())]
    for (let i = 0; i < 300; i++) {
      const s = simulateShootout('h', 'a', team(), team(), rng.next)
      const { home, away } = shootoutScore(s)
      expect(home).not.toBe(away)
      expect(shootoutDecided(s)).toBe(true)
      const homeKicks = s.kicks.filter((k) => k.teamId === 'h').length
      const awayKicks = s.kicks.filter((k) => k.teamId === 'a').length
      expect(Math.abs(homeKicks - awayKicks)).toBeLessThanOrEqual(1)
    }
  })
})
