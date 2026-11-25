import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { Player } from '../../types/game'
import { useGameStore } from '../../stores/game'
import {
  applyPositionChoice, balanceDefRoles, defenseFits, defenseSlots, defenseSplit, defRoleOf, defSlotRoles, DEF_ROLE_MISFIT,
  positionChoiceOf, positionLabel,
} from '../defense'
import { orderLine } from '../feet'
import { parseLeagueFile, teamsFromLeagueFile, teamsToLeagueFile } from '../leagueFile'
import { createTeams } from '../teams'

const def = (id: string, defRole: 'LAT' | 'ZAG', foot: 'D' | 'E' = 'D', lineupSlot?: number) =>
  ({ id, position: 'DEF', defRole, foot, lineupSlot }) as Pick<Player, 'id' | 'position' | 'defRole' | 'foot' | 'lineupSlot' | 'role'>

describe('laterais e zagueiros', () => {
  it('4 defensores = 2 laterais e 2 zagueiros; 5 = 2 + 3; 3 = só zagueiros', () => {
    expect(defenseSplit(4)).toEqual({ LAT: 2, ZAG: 2 })
    expect(defenseSplit(5)).toEqual({ LAT: 2, ZAG: 3 })
    expect(defenseSplit(3)).toEqual({ LAT: 0, ZAG: 3 })
    expect(defSlotRoles(4)).toEqual(['LAT', 'ZAG', 'ZAG', 'LAT'])
    expect(defSlotRoles(5)).toEqual(['LAT', 'ZAG', 'ZAG', 'ZAG', 'LAT'])
  })

  it('sem arrumação do técnico, os laterais vão para as pontas (canhoto à esquerda)', () => {
    const line = orderLine([def('z1', 'ZAG'), def('ld', 'LAT', 'D'), def('z2', 'ZAG', 'E'), def('le', 'LAT', 'E')])
    expect(line[0]!.id).toBe('le')
    expect(line[3]!.id).toBe('ld')
    const slots = defenseSlots(line)
    expect(slots.get('le')).toBe('LAT')
    expect(slots.get('z1')).toBe('ZAG')
  })

  it('defensor fora da função rende menos', () => {
    // O técnico pôs os laterais no meio da linha e os zagueiros nas pontas.
    const fits = defenseFits([def('z1', 'ZAG', 'D', 0), def('l1', 'LAT', 'D', 1), def('l2', 'LAT', 'D', 2), def('z2', 'ZAG', 'D', 3)])
    expect([...fits.values()].every((f) => f === DEF_ROLE_MISFIT)).toBe(true)
    const ok = defenseFits([def('l1', 'LAT', 'D', 0), def('z1', 'ZAG', 'D', 1), def('z2', 'ZAG', 'D', 2), def('l2', 'LAT', 'D', 3)])
    expect([...ok.values()].every((f) => f === 1)).toBe(true)
  })

  it('posição mostrada e escolha nos editores', () => {
    expect(positionLabel({ id: 'a', position: 'DEF', defRole: 'LAT' })).toBe('LAT')
    expect(positionLabel({ id: 'a', position: 'MEI' })).toBe('MEI')
    const p: { position: Player['position']; defRole?: 'LAT' | 'ZAG' } = { position: 'MEI' }
    applyPositionChoice(p, 'ZAG')
    expect(p).toEqual({ position: 'DEF', defRole: 'ZAG' })
    expect(positionChoiceOf(p)).toBe('ZAG')
    applyPositionChoice(p, 'ATA')
    expect(p).toEqual({ position: 'ATA' })
  })

  it('elencos gerados e equilibrados têm laterais e zagueiros', () => {
    for (const team of createTeams()) {
      const roles = team.players.filter((p) => p.position === 'DEF').map((p) => p.defRole)
      expect(roles.filter((r) => r === 'LAT')).toHaveLength(3)
      expect(roles.filter((r) => r === 'ZAG')).toHaveLength(4)
    }
    // Só zagueiros nos dados: o equilíbrio garante ao menos 2 laterais.
    const squad = Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, position: 'DEF' as const, defRole: 'ZAG' as 'LAT' | 'ZAG', overall: 60 + i }))
    balanceDefRoles(squad)
    expect(squad.filter((p) => p.defRole === 'LAT').length).toBeGreaterThanOrEqual(2)
  })

  it('a função vai e volta no arquivo de liga; valor inválido é recusado', () => {
    const teams = createTeams()
    const file = teamsToLeagueFile(teams)
    const back = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(file)).league!)
    const key = (list: Player[]) => list.filter((p) => p.position === 'DEF').map((p) => `${p.name}:${p.defRole}`).sort()
    expect(key(back.find((t) => t.id === teams[0]!.id)!.players)).toEqual(key(teams[0]!.players))
    const bad = teamsToLeagueFile(teams)
    ;(bad.teams[0]!.players!.find((p) => p.position === 'MEI') as { defRole?: string }).defRole = 'LAT'
    expect(parseLeagueFile(JSON.stringify(bad)).errors.some((e) => e.includes('"defRole"'))).toBe(true)
  })
})

describe('defesa na carreira', () => {
  it('escalação automática: 2 laterais e 2 zagueiros no 4-4-2; 3 zagueiros no 3-5-2', () => {
    setActivePinia(createPinia())
    const game = useGameStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
    const roles = () => game.starters.filter((p) => p.position === 'DEF').map((p) => defRoleOf(p))
    expect(roles().filter((r) => r === 'LAT')).toHaveLength(2)
    expect(roles().filter((r) => r === 'ZAG')).toHaveLength(2)
    game.setFormation('3-5-2')
    game.autoSelectStarters()
    expect(roles().every((r) => r === 'ZAG')).toBe(true)
    // Trocar para 4-4-2 traz um lateral de volta (o reserva da função que falta).
    game.setFormation('4-4-2')
    expect(game.starters).toHaveLength(11)
    expect(roles().filter((r) => r === 'LAT').length).toBeGreaterThanOrEqual(1)
  })
})
