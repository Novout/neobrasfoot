import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DivisionId, LiveMatch } from '../../types/game'
import { useGameStore } from '../../stores/game'
import { useTransferStore } from '../../stores/transfers'
import { createTeams } from '../teams'
import {
  EXPENSIVE_LOAN_VALUE, EXPENSIVE_SALE, loanHeadline, MAX_MATCH_HEADLINES, matchHeadlines, saleHeadline, upsetSize,
} from '../headlines'

const live = (id: string, homeGoals: number, awayGoals: number, home = 70, away = 70, extra: Partial<LiveMatch> = {}): LiveMatch => ({
  id, competition: 'league', penalties: null, homeId: `${id}-h`, awayId: `${id}-a`, homeGoals, awayGoals,
  homeAttack: home, homeDefense: home, awayAttack: away, awayDefense: away, events: [], ...extra,
})
const ctx = (division: (id: string) => DivisionId | undefined = () => 'A') => ({
  season: 1, round: 3, context: () => 'Série A · Rodada 3', teamName: (id: string) => id.toUpperCase(), division,
})

describe('manchetes dos jogos', () => {
  it('goleada vira manchete; placar apertado entre iguais não', () => {
    const list = matchHeadlines([live('m1', 5, 0), live('m2', 2, 1)], ctx())
    expect(list).toHaveLength(1)
    expect(list[0]!.kind).toBe('goleada')
    expect(list[0]!.title).toContain('M1-H')
  })

  it('zebra: o bem mais fraco vence o favorito', () => {
    const list = matchHeadlines([live('m1', 0, 1, 85, 60)], ctx())
    expect(list[0]!.kind).toBe('zebra')
    expect(list[0]!.title).toContain('M1-A')
    // O favorito vencer não é zebra.
    expect(matchHeadlines([live('m2', 1, 0, 85, 60)], ctx())).toEqual([])
  })

  it('na Copa, clube de série abaixo eliminando um de cima é zebra, mesmo nos pênaltis', () => {
    const m = live('c1', 1, 1, 60, 80, { competition: 'cup', penalties: { home: 5, away: 4 } })
    const div = (id: string) => (id.endsWith('-h') ? 'D' : 'A') as DivisionId
    expect(upsetSize(m, m.homeId, div)).toBe(3)
    const [h] = matchHeadlines([m], { ...ctx(div), winnerId: () => m.homeId })
    expect(h!.kind).toBe('zebra')
    expect(h!.text).toContain('pên. 5 x 4')
  })

  it('só as maiores manchetes da rodada', () => {
    const many = Array.from({ length: 10 }, (_, i) => live(`m${i}`, 4 + i, 0))
    const list = matchHeadlines(many, ctx())
    expect(list).toHaveLength(MAX_MATCH_HEADLINES)
    expect(list[0]!.id).toBe('m9-goleada')
  })
})

describe('manchetes do mercado', () => {
  const base = { season: 1, round: 2, playerName: 'Fulano', overall: 80, fromName: 'A', toName: 'B', fromTeamId: 'a', toTeamId: 'b' }

  it('só negócios caros viram notícia', () => {
    expect(saleHeadline({ ...base, fee: EXPENSIVE_SALE - 1000 })).toBeNull()
    expect(saleHeadline({ ...base, fee: EXPENSIVE_SALE })?.kind).toBe('venda')
    expect(loanHeadline({ ...base, value: EXPENSIVE_LOAN_VALUE - 1000, fee: 50_000, rounds: 4 })).toBeNull()
    expect(loanHeadline({ ...base, value: EXPENSIVE_LOAN_VALUE, fee: 50_000, rounds: 4 })?.kind).toBe('emprestimo')
  })
})

describe('giro da rodada na carreira', () => {
  let game: ReturnType<typeof useGameStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    game = useGameStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
  })

  it('venda cara entre clubes vira manchete, sem repetir', () => {
    const [from, to] = game.teams.filter((t) => t.id !== game.managedTeamId)
    const player = from!.players[0]!
    game.transferPlayer(player.id, from!.id, to!.id, EXPENSIVE_SALE * 2)
    expect(game.headlines[0]).toMatchObject({ kind: 'venda', teamIds: [from!.id, to!.id] })
    game.addHeadlines([game.headlines[0]!])
    expect(game.headlines).toHaveLength(1)
  })

  it('clubes da IA negociam entre si, respeitando elenco mínimo, vagas e a regra de séries', () => {
    const transfers = useTransferStore()
    const sizes = () => game.teams.map((t) => t.players.length)
    const mine = game.managedTeam!.players.map((p) => p.id)
    for (let i = 0; i < 40; i++) transfers.aiMarketRound()
    // O seu clube nunca entra nos negócios da IA.
    expect(game.managedTeam!.players.map((p) => p.id)).toEqual(mine)
    for (const n of sizes()) {
      expect(n).toBeGreaterThanOrEqual(16)
      expect(n).toBeLessThanOrEqual(30)
    }
    for (const t of game.teams) expect(t.players.filter((p) => p.position === 'GOL').length).toBeGreaterThanOrEqual(2)
  })
})
