import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTeams } from '../../data/teams'
import { ACADEMY_SIZE, renewSquad } from '../../data/youth'
import { createRng } from '../../utils/random'
import { MAX_SQUAD_SIZE, useGameStore } from '../game'

describe('categorias de base', () => {
  let game: ReturnType<typeof useGameStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    game = useGameStore()
    game.startCareer(createTeams()[0]!.id, 'Técnico')
  })

  it('a carreira começa com uma lista de jovens com OVR, idade e posição', () => {
    const list = game.academy!.players
    expect(game.academy!.teamId).toBe(game.managedTeamId)
    expect(list).toHaveLength(ACADEMY_SIZE)
    for (const p of list) {
      expect(p.age).toBeGreaterThanOrEqual(17)
      expect(p.age).toBeLessThanOrEqual(19)
      expect(p.overall).toBeGreaterThan(0)
      expect(['GOL', 'DEF', 'MEI', 'ATA']).toContain(p.position)
    }
    expect(list.some((p) => p.position === 'GOL')).toBe(true)
  })

  it('subir um jovem leva ele ao elenco e tira da lista', () => {
    const before = game.managedTeam!.players.length
    const youth = game.academy!.players[0]!
    expect(game.promoteYouth(youth.id)).toBeNull()
    expect(game.managedTeam!.players).toHaveLength(before + 1)
    expect(game.managedTeam!.players.find((p) => p.id === youth.id)?.starter).toBe(false)
    expect(game.academy!.players.some((p) => p.id === youth.id)).toBe(false)
    expect(game.promoteYouth(youth.id)).toMatch(/não está na base/)
  })

  it('com o elenco cheio, ninguém sobe', () => {
    const team = game.managedTeam!
    while (team.players.length < MAX_SQUAD_SIZE) team.players.push({ ...team.players[0]!, id: `extra-${team.players.length}` })
    expect(game.promoteYouth(game.academy!.players[0]!.id)).toMatch(/Elenco cheio/)
  })

  it('na virada de temporada, a lista é renovada e seu clube não recebe jovens sozinho', () => {
    const oldIds = game.academy!.players.map((p) => p.id)
    game.round = game.totalRounds
    if (game.cup) game.cup.championId = game.cup.championId ?? game.managedTeamId
    game.nextSeason()
    expect(game.academy!.season).toBe(game.season)
    expect(game.academy!.players).toHaveLength(ACADEMY_SIZE)
    expect(game.academy!.players.some((p) => oldIds.includes(p.id))).toBe(false)
    // Ninguém da base entrou sozinho no seu elenco (os ids da base terminam com "-base").
    expect(game.managedTeam!.players.some((p) => p.id.endsWith('-base'))).toBe(false)
    expect(game.news.some((n) => n.includes('Nova geração na base'))).toBe(true)
  })
})

describe('renovação do elenco sem a base automática', () => {
  it('mantém ao menos 16 jogadores e 2 goleiros', () => {
    const team = createTeams()[0]!
    // Elenco envelhecido: quase todos se aposentam.
    team.players.forEach((p) => (p.age = 38))
    const { promoted } = renewSquad(team, 2, createRng(1), { youth: false })
    expect(promoted).toEqual([])
    expect(team.players.length).toBeGreaterThanOrEqual(16)
    expect(team.players.filter((p) => p.position === 'GOL').length).toBeGreaterThanOrEqual(2)
  })

  it('clubes da IA continuam subindo jovens sozinhos', () => {
    const team = createTeams()[1]!
    team.players.forEach((p) => (p.age = 38))
    expect(renewSquad(team, 2, createRng(1)).promoted.length).toBeGreaterThan(0)
  })
})
