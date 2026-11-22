import { describe, expect, it } from 'vitest'
import type { Player, Position } from '../../types/game'
import { createRng } from '../../utils/random'
import { parseLeagueFile, teamsFromLeagueFile, teamsToLeagueFile } from '../leagueFile'
import {
  BASE_PENALTY_CONVERSION, cardFactor, energyFactor, foulFactor, penaltyConversion, playerSkills, rollSkills, scorerFactor,
  SKILLS, SKILLS_BY_POSITION, teamSkillBonus, type SkillId,
} from '../skills'
import { buildPlayer, createTeams } from '../teams'

type SkillPlayer = Pick<Player, 'id' | 'position' | 'skills'>
const p = (position: Position, skills: SkillId[], id = Math.random().toString(36)): SkillPlayer => ({ id, position, skills })

describe('catálogo de habilidades', () => {
  it('cada posição tem sua lista exclusiva', () => {
    const all = Object.values(SKILLS_BY_POSITION).flat()
    expect(new Set(all).size).toBe(all.length)
    for (const [pos, list] of Object.entries(SKILLS_BY_POSITION)) {
      expect(list.length).toBeGreaterThanOrEqual(4)
      for (const id of list) expect(SKILLS[id].position).toBe(pos)
    }
    expect(SKILLS_BY_POSITION.GOL).toEqual(expect.arrayContaining(['colocacao', 'pegador-de-penaltis', 'tiro-de-meta']))
  })

  it('sorteia 2 habilidades diferentes da posição', () => {
    const rng = createRng(7)
    for (const pos of ['GOL', 'DEF', 'MEI', 'ATA'] as const) {
      for (let i = 0; i < 30; i++) {
        const skills = rollSkills(pos, rng)
        expect(skills).toHaveLength(2)
        expect(skills[0]).not.toBe(skills[1])
        for (const s of skills) expect(SKILLS[s].position).toBe(pos)
      }
    }
  })

  it('todo jogador gerado nasce com 2 habilidades da sua posição', () => {
    for (const player of createTeams().flatMap((t) => t.players)) {
      expect(player.skills).toHaveLength(2)
      for (const s of player.skills!) expect(SKILLS[s].position).toBe(player.position)
    }
  })

  it('save antigo sem habilidades recebe sempre as mesmas; inválidas são ignoradas', () => {
    const old = { id: 'jogador-antigo', position: 'MEI' as const }
    expect(playerSkills(old)).toEqual(playerSkills(old))
    expect(playerSkills({ ...old, skills: ['colocacao', 'reflexos'] })).toEqual(playerSkills(old))
    expect(playerSkills({ ...old, skills: ['passe', 'folego'] })).toEqual(['passe', 'folego'])
  })

  it('habilidades informadas são mantidas ao criar o jogador', () => {
    const player = buildPlayer({ name: 'Teste', position: 'ATA', age: 25, overall: 70, skills: ['drible', 'velocidade'] }, 'x-1', 70)
    expect(player.skills).toEqual(['drible', 'velocidade'])
  })
})

describe('efeitos', () => {
  const lineup = (gk: SkillId[], def: SkillId[], mei: SkillId[], ata: SkillId[]) => [
    p('GOL', gk), ...Array.from({ length: 4 }, () => p('DEF', def)), ...Array.from({ length: 4 }, () => p('MEI', mei)),
    ...Array.from({ length: 2 }, () => p('ATA', ata)),
  ]

  it('time com habilidades ofensivas ataca mais; defensivas, defende mais', () => {
    const offensive = teamSkillBonus(lineup(['tiro-de-meta', 'saida-do-gol'], ['apoio-ao-ataque', 'desarme'], ['passe', 'visao-de-jogo'], ['finalizacao', 'velocidade']))
    const defensive = teamSkillBonus(lineup(['colocacao', 'reflexos'], ['desarme', 'marcacao'], ['folego', 'chute-de-longe'], ['cobrador-de-penaltis', 'cabeceio']))
    expect(offensive.attack).toBeGreaterThan(1)
    expect(offensive.attack).toBeGreaterThan(defensive.attack)
    expect(defensive.defense).toBeGreaterThan(offensive.defense)
    expect(defensive.defense).toBeGreaterThan(1)
  })

  it('bônus é relativo a um time médio (não infla os gols do jogo)', () => {
    const teams = createTeams()
    const bonuses = teams.map((t) => teamSkillBonus(t.players.slice(0, 22)))
    const avg = (k: 'attack' | 'defense') => bonuses.reduce((s, b) => s + b[k], 0) / bonuses.length
    // 22 jogadores = o dobro de uma escalação: só confere que o ataque e a defesa sobem juntos.
    expect(Math.abs(avg('attack') - avg('defense'))).toBeLessThan(0.08)
  })

  it('artilheiros, cartões e fôlego', () => {
    expect(scorerFactor(p('ATA', ['finalizacao', 'cabeceio']))).toBeCloseTo(2.25)
    expect(scorerFactor(p('MEI', ['passe', 'folego']))).toBe(1)
    expect(cardFactor(p('DEF', ['jogo-limpo', 'desarme']))).toBeCloseTo(0.4)
    expect(energyFactor(p('MEI', ['folego', 'passe']))).toBeCloseTo(0.7)
  })

  it('jogo limpo reduz faltas; dribladores do adversário aumentam', () => {
    const clean = [p('DEF', ['jogo-limpo', 'desarme']), p('DEF', ['jogo-limpo', 'marcacao'])]
    const neutral = [p('DEF', ['desarme', 'marcacao'])]
    const dribblers = [p('ATA', ['drible', 'velocidade']), p('ATA', ['drible', 'finalizacao'])]
    expect(foulFactor(clean, neutral)).toBeLessThan(1)
    expect(foulFactor(neutral, dribblers)).toBeGreaterThan(1)
  })

  it('pênaltis: cobradores convertem mais e o pegador de pênaltis defende mais', () => {
    const plain = [p('GOL', ['colocacao', 'reflexos']), p('ATA', ['velocidade', 'drible'])]
    const takers = [p('ATA', ['cobrador-de-penaltis', 'drible']), p('MEI', ['bola-parada', 'passe'])]
    const stopper = [p('GOL', ['pegador-de-penaltis', 'reflexos'])]
    expect(penaltyConversion(plain, plain)).toBeCloseTo(BASE_PENALTY_CONVERSION)
    expect(penaltyConversion(takers, plain)).toBeGreaterThan(BASE_PENALTY_CONVERSION)
    expect(penaltyConversion(plain, stopper)).toBeLessThan(BASE_PENALTY_CONVERSION)
  })
})

describe('habilidades no arquivo de liga', () => {
  it('exporta e importa as habilidades de cada jogador', () => {
    const teams = createTeams()
    const back = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(teamsToLeagueFile(teams))).league!)
    const original = teams[0]!.players
    const imported = back.find((t) => t.id === teams[0]!.id)!.players
    // O arquivo ordena por posição: compara jogador a jogador pelo nome.
    const key = (list: Player[]) => list.map((x) => `${x.name}:${x.skills!.join('+')}`).sort()
    expect(key(imported)).toEqual(key(original))
  })

  it('recusa habilidade de outra posição', () => {
    const file = teamsToLeagueFile(createTeams())
    const keeper = file.teams[0]!.players!.find((x) => x.position === 'GOL')!
    keeper.skills = ['finalizacao', 'drible']
    const { errors } = parseLeagueFile(JSON.stringify(file))
    expect(errors.some((e) => e.includes(`${keeper.name}: "skills"`))).toBe(true)
  })
})
