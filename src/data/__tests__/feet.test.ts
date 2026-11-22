import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Player, Position } from '../../types/game'
import { useGameStore } from '../../stores/game'
import { footFit, lineupSides, orderLine, playerFoot, rollFoot, sideFits, sideOf, type Foot } from '../feet'
import { parseLeagueFile, teamsFromLeagueFile, teamsToLeagueFile } from '../leagueFile'
import { createTeams } from '../teams'

type P = Pick<Player, 'id' | 'foot' | 'lineupSlot' | 'position' | 'role'>
const p = (id: string, foot: Foot, position: Position = 'MEI', lineupSlot?: number): P => ({ id, foot, position, lineupSlot })

describe('pé e lado', () => {
  it('lados de cada linha: pontas e centro', () => {
    expect([0, 1].map((i) => sideOf(i, 2))).toEqual(['E', 'D'])
    expect([0, 1, 2].map((i) => sideOf(i, 3))).toEqual(['E', 'C', 'D'])
    expect([0, 1, 2, 3].map((i) => sideOf(i, 4))).toEqual(['E', 'C', 'C', 'D'])
    expect([0, 1, 2, 3, 4].map((i) => sideOf(i, 5))).toEqual(['E', 'E', 'C', 'D', 'D'])
    expect(sideOf(0, 1)).toBe('C')
  })

  it('destro rende mais pela direita, canhoto pela esquerda; o contrário rende menos', () => {
    expect(footFit('D', 'D')).toBeGreaterThan(1)
    expect(footFit('E', 'E')).toBeGreaterThan(1)
    expect(footFit('D', 'E')).toBeLessThan(1)
    expect(footFit('E', 'D')).toBeLessThan(1)
    expect(footFit('D', 'C')).toBe(1)
    // Ambidestro: bem dos dois lados, mas menos que o especialista do lado.
    expect(footFit('A', 'E')).toBeGreaterThan(1)
    expect(footFit('A', 'E')).toBeLessThan(footFit('E', 'E'))
  })

  it('maioria destra, como no futebol real', () => {
    const players = createTeams().flatMap((t) => t.players)
    const share = (f: Foot) => players.filter((x) => playerFoot(x) === f).length / players.length
    expect(share('D')).toBeGreaterThan(0.6)
    expect(share('E')).toBeGreaterThan(0.12)
    expect(share('A')).toBeLessThan(0.12)
    expect(rollFoot(0)).toBe('D')
    expect(rollFoot(0.8)).toBe('E')
    expect(rollFoot(0.99)).toBe('A')
  })

  it('sem arrumação do técnico, canhotos vão para a esquerda e destros para a direita', () => {
    const line = orderLine([p('d1', 'D'), p('e1', 'E'), p('a1', 'A')])
    expect(line.map((x) => x.id)).toEqual(['e1', 'a1', 'd1'])
  })

  it('a ordem escolhida pelo técnico é respeitada', () => {
    const line = orderLine([p('d1', 'D', 'MEI', 0), p('e1', 'E', 'MEI', 1)])
    expect(line.map((x) => x.id)).toEqual(['d1', 'e1'])
    const sides = lineupSides([p('d1', 'D', 'MEI', 0), p('e1', 'E', 'MEI', 1)])
    expect(sides.get('d1')).toBe('E')
    // Os dois no lado contrário ao pé.
    expect([...sideFits([p('d1', 'D', 'MEI', 0), p('e1', 'E', 'MEI', 1)]).values()].every((f) => f < 1)).toBe(true)
  })

  it('goleiro joga sempre no centro', () => {
    expect(lineupSides([p('g', 'E', 'GOL')]).get('g')).toBe('C')
  })

  it('pé vai e volta no arquivo de liga; valor inválido é recusado', () => {
    const teams = createTeams()
    const file = teamsToLeagueFile(teams)
    const back = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(file)).league!)
    const key = (list: Player[]) => list.map((x) => `${x.name}:${x.foot}`).sort()
    expect(key(back.find((t) => t.id === teams[0]!.id)!.players)).toEqual(key(teams[0]!.players))

    const bad = teamsToLeagueFile(teams)
    ;(bad.teams[0]!.players![0] as { foot: string }).foot = 'X'
    expect(parseLeagueFile(JSON.stringify(bad)).errors.some((e) => e.includes('"foot"'))).toBe(true)
  })
})

describe('lado na escalação do seu time', () => {
  let game: ReturnType<typeof useGameStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    game = useGameStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
  })

  it('arrumar a linha com cada um no lado do seu pé deixa o time mais forte que o contrário', () => {
    const line = game.starters.filter((x) => x.position === 'DEF')
    const byFoot = orderLine(line.map((x) => ({ ...x, lineupSlot: undefined })))
    game.arrangeLine(byFoot.map((x) => x.id))
    const good = game.teamStrength(game.managedTeamId!).defense
    game.arrangeLine([...byFoot].reverse().map((x) => x.id))
    const bad = game.teamStrength(game.managedTeamId!).defense
    const feet = line.map((x) => playerFoot(x))
    // Só faz diferença se a linha tiver pés diferentes nas pontas.
    if (new Set(feet).size > 1 || feet.includes('E')) expect(good).toBeGreaterThan(bad)
    else expect(good).toBeGreaterThanOrEqual(bad)
  })

  it('reserva que entra fica no lugar de quem saiu; escalação automática desfaz a arrumação', () => {
    const out = game.starters.find((x) => x.position === 'MEI')!
    const inn = game.managedTeam!.players.find((x) => !x.starter && x.position === 'MEI')!
    game.arrangeLine(game.starters.filter((x) => x.position === 'MEI').map((x) => x.id))
    const slot = out.lineupSlot
    game.substituteStarter(out.id, inn.id)
    expect(inn.lineupSlot).toBe(slot)
    game.autoSelectStarters()
    expect(game.managedTeam!.players.every((x) => x.lineupSlot === undefined)).toBe(true)
  })
})
