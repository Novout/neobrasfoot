import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { assignShirtNumbers, changeShirtNumber } from '../shirtNumbers'
import { createTeams } from '../teams'
import { useGameStore } from '../../stores/game'
import type { Player } from '../../types/game'

type P = Pick<Player, 'id' | 'position' | 'defRole' | 'overall' | 'number'>
const p = (id: string, position: Player['position'], overall: number, extra: Partial<P> = {}): P => ({ id, position, overall, ...extra })

const unique = (players: { number?: number }[]) => new Set(players.map((x) => x.number)).size === players.length

describe('numeração das camisas', () => {
  it('números típicos da posição, com os melhores pegando os clássicos', () => {
    const squad = [
      p('g1', 'GOL', 80), p('g2', 'GOL', 70),
      p('a1', 'ATA', 85), p('a2', 'ATA', 75),
      p('m1', 'MEI', 88),
      p('l1', 'DEF', 70, { defRole: 'LAT' }), p('z1', 'DEF', 72, { defRole: 'ZAG' }),
    ]
    assignShirtNumbers(squad)
    const num = (id: string) => squad.find((x) => x.id === id)!.number
    expect(num('g1')).toBe(1)
    expect(num('g2')).toBe(12)
    expect(num('a1')).toBe(9)
    expect(num('a2')).toBe(11)
    expect(num('m1')).toBe(5)
    expect(num('l1')).toBe(2)
    expect(num('z1')).toBe(4)
  })

  it('quem já tem número mantém; repetido fica com quem estava antes no elenco', () => {
    const squad = [p('velho', 'ATA', 70, { number: 9 }), p('novo', 'ATA', 90, { number: 9 }), p('outro', 'MEI', 60, { number: 77 })]
    const changed = assignShirtNumbers(squad)
    expect(squad[0]!.number).toBe(9)
    expect(squad[1]!.number).toBe(11)
    expect(squad[2]!.number).toBe(77)
    expect(changed.map((x) => x.id)).toEqual(['novo'])
  })

  it('número inválido é corrigido; todos os elencos gerados ficam com números únicos de 1 a 99', () => {
    const squad = [p('x', 'MEI', 70, { number: 150 }), p('y', 'MEI', 70, { number: 0 })]
    assignShirtNumbers(squad)
    expect(squad.every((x) => x.number! >= 1 && x.number! <= 99)).toBe(true)
    for (const team of createTeams()) {
      assignShirtNumbers(team.players)
      expect(unique(team.players), team.id).toBe(true)
    }
  })

  it('trocar para um número usado: os dois trocam de camisa', () => {
    const squad = [p('a', 'ATA', 80, { number: 9 }), p('b', 'ATA', 70, { number: 21 })]
    const result = changeShirtNumber(squad, 'b', 9)
    expect('swappedWith' in result && result.swappedWith?.id).toBe('a')
    expect(squad.map((x) => x.number)).toEqual([21, 9])
    expect(changeShirtNumber(squad, 'a', 0)).toHaveProperty('error')
    expect(changeShirtNumber(squad, 'a', 100)).toHaveProperty('error')
    expect(changeShirtNumber(squad, 'a', 7.5)).toHaveProperty('error')
  })
})

describe('numeração na carreira', () => {
  it('elenco numerado ao começar; a troca no seu elenco vale e o jogador mantém o número', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
    for (const team of game.teams) expect(unique(team.players), team.id).toBe(true)
    const [first, second] = game.managedTeam!.players
    const firstNumber = first!.number!
    expect(game.setShirtNumber(second!.id, firstNumber)).toBeNull()
    expect(game.managedTeam!.players.find((x) => x.id === second!.id)!.number).toBe(firstNumber)
    expect(game.managedTeam!.players.find((x) => x.id === first!.id)!.number).not.toBe(firstNumber)
    expect(unique(game.managedTeam!.players)).toBe(true)
    expect(game.setShirtNumber(first!.id, 0)).toMatch(/1 a 99/)
  })

  it('jogador transferido leva o número se estiver livre no clube novo', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
    const seller = game.teams.find((t) => t.id !== game.managedTeamId)!
    const player = seller.players[0]!
    const mine = game.managedTeam!
    // Libera o número dele no seu elenco para conferir que ele chega com o mesmo.
    const clash = mine.players.find((x) => x.number === player.number)
    if (clash) clash.number = 98
    game.transferPlayer(player.id, seller.id, mine.id, 0)
    expect(mine.players.find((x) => x.id === player.id)!.number).toBe(player.number)
    expect(unique(mine.players)).toBe(true)
  })
})
