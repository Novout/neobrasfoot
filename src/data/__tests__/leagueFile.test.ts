import { describe, expect, it } from 'vitest'
import {
  clearCustomLeague, getCustomLeague, leagueTeams, parseLeagueFile, saveCustomLeague, teamsFromLeagueFile,
  teamsToLeagueFile, type LeagueFile,
} from '../leagueFile'
import { createTeams } from '../teams'

const defaultFile = () => teamsToLeagueFile(createTeams(), { name: 'Brasileirão Teste', author: 'Eu' })

describe('arquivo de liga (addon)', () => {
  it('exporta a liga padrão num arquivo válido, com nome e autor', () => {
    const file = defaultFile()
    expect(file.teams).toHaveLength(32)
    const { league, errors } = parseLeagueFile(JSON.stringify(file))
    expect(errors).toEqual([])
    expect(league?.name).toBe('Brasileirão Teste')
    expect(league?.author).toBe('Eu')
  })

  it('ida e volta preserva clubes e jogadores', () => {
    const original = createTeams()
    const back = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(teamsToLeagueFile(original))).league!)
    expect(back.map((t) => t.name)).toEqual(expect.arrayContaining(original.map((t) => t.name)))
    const first = original[0]!
    const same = back.find((t) => t.id === first.id)!
    expect(same.players.map((p) => p.overall).sort()).toEqual(first.players.map((p) => p.overall).sort())
  })

  it('aceita clube só com nome e série, gerando o elenco', () => {
    const file = defaultFile()
    file.teams[0] = { name: 'Clube Mínimo', division: file.teams[0]!.division }
    const { league } = parseLeagueFile(JSON.stringify(file))
    const team = teamsFromLeagueFile(league!).find((t) => t.name === 'Clube Mínimo')!
    expect(team.shortName).toBe('CLU')
    expect(team.players.length).toBeGreaterThanOrEqual(16)
  })

  it('aceita só a lista de clubes, sem o envelope', () => {
    expect(parseLeagueFile(JSON.stringify(defaultFile().teams)).league).not.toBeNull()
  })

  it('recusa JSON inválido', () => {
    const { league, errors } = parseLeagueFile('{ isso não é json')
    expect(league).toBeNull()
    expect(errors[0]).toMatch(/JSON válido/)
  })

  it('exige 8 clubes por série', () => {
    const file = defaultFile()
    file.teams[0]!.division = file.teams[0]!.division === 'A' ? 'B' : 'A'
    const { league, errors } = parseLeagueFile(JSON.stringify(file))
    expect(league).toBeNull()
    expect(errors.some((e) => /exatamente 8 clubes/.test(e))).toBe(true)
  })

  it('aponta o clube com problema no elenco', () => {
    const file = defaultFile()
    const team = file.teams[0]!
    team.players = team.players!.filter((p) => p.position !== 'GOL').concat(team.players!.find((p) => p.position === 'GOL')!)
    while (team.players.length < 16) team.players.push({ name: 'Extra', position: 'MEI', age: 20, overall: 60 })
    const { errors } = parseLeagueFile(JSON.stringify(file))
    expect(errors).toContain(`"${team.name}": precisa de pelo menos 2 jogadores na posição GOL (tem 1).`)
  })

  it('valida idade, OVR e nomes repetidos', () => {
    const file = defaultFile()
    file.teams[0]!.players![0]!.age = 60
    file.teams[1]!.players![0]!.overall = 120
    file.teams[2]!.name = file.teams[3]!.name
    const { errors } = parseLeagueFile(JSON.stringify(file))
    expect(errors.some((e) => e.includes('"age" entre 16 e 45'))).toBe(true)
    expect(errors.some((e) => e.includes('"overall" entre'))).toBe(true)
    expect(errors.some((e) => e.includes('nome repetido'))).toBe(true)
  })

  it('liga salva substitui a padrão nas próximas carreiras', () => {
    const file: LeagueFile = defaultFile()
    file.teams[0]!.name = 'Renomeado FC'
    saveCustomLeague(parseLeagueFile(JSON.stringify(file)).league!)
    expect(getCustomLeague()?.name).toBe('Brasileirão Teste')
    expect(leagueTeams().some((t) => t.name === 'Renomeado FC')).toBe(true)
    clearCustomLeague()
    expect(getCustomLeague()).toBeNull()
    expect(leagueTeams().some((t) => t.name === 'Renomeado FC')).toBe(false)
  })
})
