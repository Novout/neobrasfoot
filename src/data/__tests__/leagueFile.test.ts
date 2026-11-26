import { describe, expect, it } from 'vitest'
import {
  clearCustomLeague, getCustomLeague, parseLeagueFile, saveCustomLeague, teamsFromLeagueFile,
  teamsToLeagueFile, type LeagueFile,
} from '../leagueFile'
import { baseLeagueTeams, getLeagueBase, getLeagueFormat, leagueTeams, setLeagueBase } from '../league'
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

describe('template Brasileirão', () => {
  it('é uma liga válida com 32 clubes reais, 8 por série', async () => {
    const { brasileiraoTemplate, BRASILEIRAO_TEMPLATE_NAME } = await import('../templates/brasileirao')
    const { league, errors } = parseLeagueFile(JSON.stringify(brasileiraoTemplate()))
    expect(errors).toEqual([])
    expect(league!.name).toBe(BRASILEIRAO_TEMPLATE_NAME)
    for (const d of ['A', 'B', 'C', 'D'] as const) expect(league!.teams.filter((t) => t.division === d)).toHaveLength(8)
    const teams = teamsFromLeagueFile(league!)
    expect(teams.find((t) => t.id === 'flamengo')?.stadiumName).toBe('Maracanã')
    // Elencos gerados, mais fortes nas séries de cima.
    const avg = (d: string) => {
      const ps = teams.filter((t) => t.division === d).flatMap((t) => t.players)
      return ps.reduce((s, p) => s + p.overall, 0) / ps.length
    }
    expect(avg('A')).toBeGreaterThan(avg('B'))
    expect(avg('C')).toBeGreaterThan(avg('D'))
  })

  it('usa os elencos reais baixados (com idade e OVR estimados) em todos os clubes', async () => {
    const { brasileiraoTemplate } = await import('../templates/brasileirao')
    const squads = (await import('../templates/brasileirao-squads.json')).default
    for (const team of brasileiraoTemplate().teams) {
      const real = squads.clubs[team.id as keyof typeof squads.clubs].players.map((p) => p.name)
      expect(team.players, team.name).toBeDefined()
      expect(team.players!.length).toBeLessThanOrEqual(30)
      // Todo jogador do template está no elenco real do clube.
      for (const p of team.players!) expect(real).toContain(p.name)
    }
  })

  it('OVR estimado: fama sobe, juventude e veterania descem', async () => {
    const { estimateOverall } = await import('../templates/brasileirao')
    expect(estimateOverall(70, 30, 27).overall).toBeGreaterThan(estimateOverall(70, 2, 27).overall)
    expect(estimateOverall(70, 10, 18).overall).toBeLessThan(estimateOverall(70, 10, 27).overall)
    expect(estimateOverall(70, 10, 37).overall).toBeLessThan(estimateOverall(70, 10, 27).overall)
    expect(estimateOverall(70, 60, 28).star).toBe(true)
    expect(estimateOverall(70, 60, 38).star).toBe(false)
  })

  it('cada chamada devolve uma cópia nova', async () => {
    const { brasileiraoTemplate } = await import('../templates/brasileirao')
    const a = brasileiraoTemplate()
    a.teams[0]!.name = 'Mudado'
    expect(brasileiraoTemplate().teams[0]!.name).toBe('Flamengo')
  })
})

describe('técnicos', () => {
  it('template Brasileirão traz os técnicos reais, que viram os técnicos da IA na carreira', async () => {
    const { brasileiraoTemplate } = await import('../templates/brasileirao')
    const { createManagers } = await import('../trophies')
    const squads = (await import('../templates/brasileirao-squads.json')).default
    const { league } = parseLeagueFile(JSON.stringify(brasileiraoTemplate()))
    const teams = teamsFromLeagueFile(league!)
    const withManager = teams.filter((t) => t.managerName)
    expect(withManager.length).toBeGreaterThanOrEqual(28)
    const clubs = squads.clubs as Record<string, { manager?: string }>
    for (const t of withManager) expect(t.managerName).toBe(clubs[t.id]!.manager)

    const managers = createManagers(teams, teams[0]!.id, 'Você')
    // O clube do jogador fica com você; os outros, com o técnico real.
    expect(managers.find((m) => m.teamId === teams[0]!.id)!.name).toBe('Você')
    for (const t of withManager.filter((t) => t.id !== teams[0]!.id)) {
      expect(managers.find((m) => m.teamId === t.id)!.name).toBe(t.managerName)
    }
    // Sem técnico na liga: nome inventado, sem repetir nenhum real.
    const names = managers.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('técnico vai e volta no arquivo de liga; liga sem técnico continua com nomes inventados', async () => {
    const { createManagers } = await import('../trophies')
    const file = teamsToLeagueFile(createTeams())
    file.teams[0]!.manager = '  Técnico Teste  '
    const teams = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(file)).league!)
    expect(teams[0]!.managerName).toBe('Técnico Teste')
    expect(teamsToLeagueFile(teams).teams.find((t) => t.id === teams[0]!.id)!.manager).toBe('Técnico Teste')
    const managers = createManagers(teams, teams[1]!.id, 'Você')
    expect(managers.find((m) => m.teamId === teams[0]!.id)!.name).toBe('Técnico Teste')
    expect(managers.find((m) => m.teamId === teams[2]!.id)!.name).toMatch(/^\S+ \S+$/)
  })
})

describe('liga base das carreiras', () => {
  it('sem escolha, o padrão é o Brasileirão com clubes reais no formato 2×20', () => {
    localStorage.clear()
    expect(getLeagueBase()).toBe('brasileirao')
    expect(getLeagueFormat()).toBe('2x20')
    const teams = leagueTeams()
    // 40 clubes nas Séries A e B e mais os 20 da La Liga, disputada em paralelo.
    expect(teams.filter((t) => t.division === 'A' || t.division === 'B')).toHaveLength(40)
    // Ligas estrangeiras em paralelo: La Liga e Premier League (20) e Bundesliga (18).
    expect(teams.filter((t) => t.division === 'ESP')).toHaveLength(20)
    expect(teams.filter((t) => t.division === 'ENG')).toHaveLength(20)
    expect(teams.filter((t) => t.division === 'GER')).toHaveLength(18)
    expect(teams.some((t) => t.id === 'flamengo')).toBe(true)
  })

  it('a liga gerada é opcional e fica guardada', () => {
    setLeagueBase('gerada')
    expect(getLeagueBase()).toBe('gerada')
    expect(leagueTeams().map((t) => t.id)).toEqual(createTeams().map((t) => t.id))
    setLeagueBase('brasileirao')
    expect(getLeagueBase()).toBe('brasileirao')
    expect(baseLeagueTeams().some((t) => t.id === 'palmeiras')).toBe(true)
  })

  it('liga do editor/importada tem prioridade sobre a base', () => {
    setLeagueBase('brasileirao')
    const file = defaultFile()
    file.teams[0]!.name = 'Clube do Editor'
    saveCustomLeague(parseLeagueFile(JSON.stringify(file)).league!)
    expect(leagueTeams().some((t) => t.name === 'Clube do Editor')).toBe(true)
    clearCustomLeague()
    expect(leagueTeams().some((t) => t.id === 'flamengo')).toBe(true)
  })
})

describe('escudos', () => {
  it('todos os clubes do Brasileirão têm escudo, e o arquivo existe em public/', async () => {
    const files = Object.keys(import.meta.glob('/public/escudos/*.png'))
    const { brasileiraoLeague } = await import('../league')
    const teams = teamsFromLeagueFile(brasileiraoLeague())
    for (const t of teams) {
      expect(t.crest, t.name).toBe(`escudos/${t.id}.png`)
      expect(files, t.name).toContain(`/public/${t.crest}`)
    }
  })

  it('escudo vai e volta no arquivo de liga; valor inválido é recusado', async () => {
    const { isValidCrest } = await import('../crests')
    const file = defaultFile()
    file.teams[0]!.crest = 'https://exemplo.com/escudo.png'
    file.teams[1]!.crest = 'data:image/png;base64,iVBORw0KGgo='
    const teams = teamsFromLeagueFile(parseLeagueFile(JSON.stringify(file)).league!)
    expect(teams.find((t) => t.name === file.teams[0]!.name)!.crest).toBe('https://exemplo.com/escudo.png')
    expect(teamsToLeagueFile(teams).teams.find((t) => t.name === file.teams[1]!.name)!.crest).toMatch(/^data:image\/png/)

    expect(isValidCrest('javascript:alert(1)')).toBe(false)
    expect(isValidCrest('../segredo.png')).toBe(false)
    expect(isValidCrest('data:text/html;base64,AAAA')).toBe(false)
    file.teams[2]!.crest = 'javascript:alert(1)'
    expect(parseLeagueFile(JSON.stringify(file)).errors.some((e) => e.includes('"crest"'))).toBe(true)
  })

  it('sem escudo, o clube continua com o distintivo de cores', async () => {
    const { crestSrc } = await import('../crests')
    expect(crestSrc(undefined)).toBeNull()
    expect(crestSrc('escudos/flamengo.png')).toBe('/escudos/flamengo.png')
    expect(teamsFromLeagueFile(parseLeagueFile(JSON.stringify(defaultFile())).league!).every((t) => !t.crest)).toBe(true)
  })
})

describe('escudo do clube criado', () => {
  it('a foto enviada vira o escudo do clube na liga', async () => {
    const { createTeamsWithCustom, CUSTOM_TEAM_ID } = await import('../teams')
    const base = createTeams()
    const draft = {
      name: 'Meu Clube', shortName: 'MEU', primaryColor: '#000000', secondaryColor: '#ffffff', division: 'D' as const,
      players: base[0]!.players.map((p) => ({ name: p.name, position: p.position, age: p.age, overall: p.overall })),
    }
    const withPhoto = createTeamsWithCustom({ ...draft, crest: 'data:image/png;base64,iVBORw0KGgo=' }, base).teams
    expect(withPhoto.find((t) => t.id === CUSTOM_TEAM_ID)!.crest).toMatch(/^data:image\/png/)
    const without = createTeamsWithCustom(draft, base).teams
    expect(without.find((t) => t.id === CUSTOM_TEAM_ID)!.crest).toBeUndefined()
  })
})
