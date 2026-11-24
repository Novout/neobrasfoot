import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTeams } from '../../data/teams'
import type { Player } from '../../types/game'
import {
  askingPriceOf, effectiveRating, FORMATION_MISMATCH_PENALTY, lineupStrength, marketValue, normalizeAskingPrice, useGameStore,
} from '../game'

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: Math.random().toString(36).slice(2), name: 'Fulano', position: 'MEI', age: 25, overall: 70, energy: 100, morale: 100,
    salary: 1000, starter: true, forSale: false, ...overrides,
  }
}

/**
 * 11 titulares que batem com o 4-4-2. Ids fixos: as habilidades (sorteadas pelo id) são as mesmas
 * em toda chamada, para comparar só o que o teste muda.
 */
function lineup442(overall = 70) {
  const positions = ['GOL', 'DEF', 'DEF', 'DEF', 'DEF', 'MEI', 'MEI', 'MEI', 'MEI', 'ATA', 'ATA'] as const
  return positions.map((position, i) => player({ id: `t${i}`, position, overall }))
}

const TACTIC = { formation: '4-4-2', style: 'equilibrado' } as const

describe('força do time', () => {
  it('energia e moral reduzem o rendimento', () => {
    expect(effectiveRating(player({ overall: 80 }))).toBeCloseTo(88)
    expect(effectiveRating(player({ overall: 80, energy: 0 }))).toBeLessThan(effectiveRating(player({ overall: 80, energy: 50 })))
  })

  it('formação errada perde rendimento', () => {
    const ok = lineupStrength(lineup442(), TACTIC)
    expect(ok.matchesFormation).toBe(true)
    const wrong = lineupStrength(lineup442(), { ...TACTIC, formation: '4-3-3' })
    expect(wrong.matchesFormation).toBe(false)
    expect(wrong.attack).toBeCloseTo(ok.attack * FORMATION_MISMATCH_PENALTY)
  })

  it('improvisado completa a formação, mas rende menos', () => {
    // 4-3-3 com um meia improvisado no ataque.
    const starters = lineup442()
    starters.find((p) => p.position === 'MEI')!.role = 'ATA'
    const improvised = lineupStrength(starters, { ...TACTIC, formation: '4-3-3' })
    expect(improvised.matchesFormation).toBe(true)
    const natural = lineupStrength(lineup442(), TACTIC)
    expect(improvised.attack).toBeLessThan(natural.attack)
    // Melhor que deixar a formação errada.
    expect(improvised.attack).toBeGreaterThan(lineupStrength(lineup442(), { ...TACTIC, formation: '4-3-3' }).attack)
  })

  it('sem goleiro a defesa desaba; estilo ofensivo ataca mais e defende pior', () => {
    const noKeeper = lineup442()
    noKeeper[0]!.position = 'DEF'
    expect(lineupStrength(noKeeper, TACTIC).defense).toBeLessThan(lineupStrength(lineup442(), TACTIC).defense * 0.7)
    const offensive = lineupStrength(lineup442(), { ...TACTIC, style: 'ofensivo' })
    const balanced = lineupStrength(lineup442(), TACTIC)
    expect(offensive.attack).toBeGreaterThan(balanced.attack)
    expect(offensive.defense).toBeLessThan(balanced.defense)
  })
})

describe('mercado', () => {
  it('jovens e estrelas valem mais; veteranos menos', () => {
    const base = marketValue(player({ age: 26 }))
    expect(marketValue(player({ age: 21 }))).toBeGreaterThan(base)
    expect(marketValue(player({ age: 33 }))).toBeLessThan(base)
    expect(marketValue(player({ age: 26, star: true }))).toBeGreaterThan(base)
  })

  it('preço pedido tem mínimo e é arredondado', () => {
    expect(normalizeAskingPrice(1)).toBe(10_000)
    expect(normalizeAskingPrice(1_234_567)).toBe(1_235_000)
    const p = player()
    expect(askingPriceOf(p)).toBe(marketValue(p))
    expect(askingPriceOf({ ...p, askingPrice: 50_000 })).toBe(50_000)
  })
})

describe('carreira e escalação', () => {
  let game: ReturnType<typeof useGameStore>
  const teamId = createTeams()[0]!.id

  beforeEach(() => {
    setActivePinia(createPinia())
    game = useGameStore()
    game.startCareer(teamId, 'Técnico Teste')
  })

  it('começa a carreira com 11 titulares e calendário montado', () => {
    expect(game.hasCareer).toBe(true)
    expect(game.managedTeamId).toBe(teamId)
    expect(game.starters).toHaveLength(11)
    expect(game.fixtures.length).toBeGreaterThan(0)
    expect(game.nextOpponent).not.toBeNull()
  })

  it('não deixa escalar o 12º titular nem um lesionado', () => {
    const reserve = game.managedTeam!.players.find((p) => !p.starter)!
    game.toggleStarter(reserve.id)
    expect(reserve.starter).toBe(false)

    const starter = game.starters[1]!
    game.toggleStarter(starter.id)
    expect(game.starters).toHaveLength(10)
    reserve.injury = 2
    game.toggleStarter(reserve.id)
    expect(reserve.starter).toBe(false)
  })

  it('setRole improvisa e volta à posição; sair do time limpa a função', () => {
    const mei = game.starters.find((p) => p.position === 'MEI')!
    game.setRole(mei.id, 'ATA')
    expect(mei.role).toBe('ATA')
    game.setRole(mei.id, 'MEI')
    expect(mei.role).toBeUndefined()
    game.setRole(mei.id, 'DEF')
    game.toggleStarter(mei.id)
    expect(mei.role).toBeUndefined()
  })

  it('reserva que entra assume a posição de quem saiu', () => {
    const out = game.starters.find((p) => p.position === 'ATA')!
    const inn = game.managedTeam!.players.find((p) => !p.starter && p.position === 'MEI')!
    expect(game.substituteStarter(out.id, inn.id)).toBe(true)
    expect(out.starter).toBe(false)
    expect(inn.starter).toBe(true)
    expect(inn.role).toBe('ATA')
    expect(game.starters).toHaveLength(11)
  })

  it('trocar a formação ajusta os titulares sozinho (todas as formações, ida e volta)', () => {
    const forms = ['4-3-3', '3-5-2', '5-3-2', '4-5-1', '4-4-2'] as const
    for (const f of forms) {
      const changes = game.setFormation(f)
      expect(game.starters, f).toHaveLength(11)
      expect(game.teamStrength(teamId).matchesFormation, f).toBe(true)
      expect(Array.isArray(changes)).toBe(true)
    }
  })

  it('ao trocar a formação, prefere o reserva da posição e mexe o mínimo na escalação', () => {
    game.setFormation('4-4-2')
    const before = new Set(game.starters.map((p) => p.id))
    const changes = game.setFormation('4-3-3')
    const after = game.starters
    // Saiu um meia e entrou um atacante: os outros 10 continuam.
    expect(after.filter((p) => before.has(p.id))).toHaveLength(10)
    const newcomer = after.find((p) => !before.has(p.id))!
    expect(newcomer.position).toBe('ATA')
    expect(newcomer.role).toBeUndefined()
    expect(changes.some((c) => c.includes(newcomer.name))).toBe(true)
  })

  it('sem reserva da posição, improvisa o titular que sobra na linha vizinha', () => {
    game.setFormation('4-4-2')
    // Tira os atacantes reservas do elenco disponível (ex.: lesionados).
    for (const p of game.managedTeam!.players.filter((x) => !x.starter && x.position === 'ATA')) p.injury = 5
    const changes = game.setFormation('4-3-3')
    expect(game.starters).toHaveLength(11)
    expect(game.teamStrength(teamId).matchesFormation).toBe(true)
    const improvised = game.starters.find((p) => p.role === 'ATA')!
    expect(improvised.position).toBe('MEI')
    expect(changes.some((c) => c.includes('passou a jogar como ATA'))).toBe(true)
  })

  it('escalação automática desfaz improvisos e respeita a formação', () => {
    game.setFormation('4-3-3')
    game.setRole(game.starters.find((p) => p.position === 'MEI')!.id, 'ATA')
    game.autoSelectStarters()
    expect(game.starters.every((p) => !p.role)).toBe(true)
    expect(game.starters.filter((p) => p.position === 'ATA')).toHaveLength(3)
    expect(game.teamStrength(teamId).matchesFormation).toBe(true)
  })

  it('treino gasta energia e só vale uma vez por rodada; descanso recupera', () => {
    const p = game.starters[0]!
    p.energy = 80
    game.trainPlayer(p.id)
    const afterTraining = p.energy
    expect(afterTraining).toBeLessThan(80)
    game.trainPlayer(p.id)
    expect(p.energy).toBe(afterTraining)
    game.restPlayer(p.id)
    expect(p.energy).toBe(Math.min(100, afterTraining + 25))
  })

  it('colocar à venda define o preço pedido; retirar limpa', () => {
    const p = game.managedTeam!.players[5]!
    game.toggleForSale(p.id, 123_456)
    expect(p.forSale).toBe(true)
    expect(p.askingPrice).toBe(123_000)
    game.toggleForSale(p.id)
    expect(p.forSale).toBe(false)
    expect(p.askingPrice).toBeUndefined()
  })

  it('a carreira fica salva e volta ao recriar a store', () => {
    const budget = game.budget
    setActivePinia(createPinia())
    const reloaded = useGameStore()
    expect(reloaded.managedTeamId).toBe(teamId)
    expect(reloaded.budget).toBe(budget)
  })
})

describe('carreira com a liga padrão (Brasileirão)', () => {
  it('começa com um clube real e o elenco real', async () => {
    const { setLeagueBase } = await import('../../data/league')
    setLeagueBase('brasileirao')
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer('flamengo', 'Técnico')
    expect(game.managedTeam?.name).toBe('Flamengo')
    expect(game.teams).toHaveLength(32)
    expect(game.managerOf('palmeiras')?.name).toBeTruthy()
  })
})
