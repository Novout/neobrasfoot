import type { DivisionId, Position, Team } from '../types/game'
import {
  ALL_DIVISIONS, DIVISION_LABELS, formatOfTeams, isLeagueFormat, LEAGUE_FORMAT_LABELS, LEAGUE_FORMATS, MAX_PLAYER_OVERALL,
  MIN_PLAYER_OVERALL, type LeagueFormat,
} from './divisions'
import { FOOT_LABELS, isFoot, playerFoot, type Foot } from './feet'
import { isValidSkillFor, playerSkills, SKILLS_BY_POSITION, SKILLS_PER_PLAYER, type SkillId } from './skills'
import { stadiumNameFor } from './stadium'
import { POSITION_ORDER } from './tactics'
import { buildPlayer, DIVISION_REPUTATION, generateSquadFor } from './teams'
import { isValidCrest } from './crests'

/**
 * Arquivo de liga (importação/exportação). Exemplo mínimo de um clube:
 * { "name": "Meu FC", "division": "A" } — o resto é opcional e o elenco é gerado.
 */
export const LEAGUE_FORMAT = 'neobrasfoot-liga'
export const LEAGUE_FORMAT_VERSION = 1
/** Clubes por série no formato padrão (4×8). No formato 2×20 são 20 por série. */
export const TEAMS_PER_DIVISION = 8

export interface LeagueFilePlayer {
  name: string
  position: Position
  age: number
  overall: number
  star?: boolean
  /** 2 habilidades da lista da posição (opcional: sem elas o jogo sorteia). */
  skills?: SkillId[]
  /** Pé preferido: "D" destro, "E" canhoto, "A" ambidestro (opcional: sem ele o jogo sorteia). */
  foot?: Foot
}

export interface LeagueFileTeam {
  id?: string
  name: string
  shortName?: string
  division: DivisionId
  primaryColor?: string
  secondaryColor?: string
  reputation?: number
  stadiumName?: string
  /** Técnico do clube (opcional: sem ele o jogo inventa um nome). */
  manager?: string
  /** Escudo: link https://, caminho no jogo (escudos/x.png) ou imagem embutida (data:image/...). Opcional. */
  crest?: string
  players?: LeagueFilePlayer[]
}

export interface LeagueFile {
  format: typeof LEAGUE_FORMAT
  version: number
  exportedAt?: string
  /** Nome do addon (ex.: "Brasileirão 2026"), mostrado no menu inicial. */
  name?: string
  author?: string
  /** Formato das séries: "4x8" (A a D, 8 clubes cada) ou "2x20" (A e B, 20 cada). Sem ele, é deduzido dos clubes. */
  divisionFormat?: LeagueFormat
  teams: LeagueFileTeam[]
}

/** Formato de um arquivo de liga (declarado ou deduzido dos clubes). */
export function leagueFileFormat(league: Pick<LeagueFile, 'divisionFormat' | 'teams'>): LeagueFormat {
  return league.divisionFormat ?? formatOfTeams(league.teams)
}

const STORAGE_KEY = 'neobrasfoot:liga-personalizada'
const MIN_SQUAD = 16
const MAX_SQUAD = 30
const MIN_BY_POSITION: Record<Position, number> = { GOL: 2, DEF: 4, MEI: 4, ATA: 2 }
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// --- Exportação ---

export function teamsToLeagueFile(teams: Team[], info: { name?: string; author?: string } = {}): LeagueFile {
  return {
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    ...metaFields(info),
    divisionFormat: formatOfTeams(teams),
    teams: ALL_DIVISIONS.flatMap((d) => teams.filter((t) => t.division === d)).map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      division: t.division,
      primaryColor: t.primaryColor,
      secondaryColor: t.secondaryColor,
      reputation: t.reputation,
      stadiumName: stadiumNameFor(t),
      ...(t.managerName ? { manager: t.managerName } : {}),
      ...(t.crest ? { crest: t.crest } : {}),
      players: [...t.players]
        .sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall)
        .map((p) => ({
          name: p.name, position: p.position, age: p.age, overall: p.overall, ...(p.star ? { star: true } : {}), skills: playerSkills(p), foot: playerFoot(p),
        })),
    })),
  }
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function metaFields(info: { name?: unknown; author?: unknown }) {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined)
  const name = text(info.name)
  const author = text(info.author)
  return { ...(name ? { name } : {}), ...(author ? { author } : {}) }
}

// --- Importação e validação ---

function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ParseResult {
  league: LeagueFile | null
  errors: string[]
}

/** Lê e valida o JSON. Aceita o formato completo ou só a lista de clubes. Preenche o que é opcional. */
export function parseLeagueFile(text: string): ParseResult {
  const errors: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { league: null, errors: [`O arquivo não é um JSON válido: ${(err as Error).message}`] }
  }
  const list = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.teams) ? raw.teams : null
  if (!list) return { league: null, errors: ['O JSON precisa ter uma lista "teams" (ou ser a própria lista de clubes).'] }

  const usedIds = new Set<string>()
  const usedNames = new Set<string>()
  const teams: LeagueFileTeam[] = []

  list.forEach((item, index) => {
    const where = isObject(item) && typeof item.name === 'string' && item.name.trim() ? `"${item.name.trim()}"` : `clube nº ${index + 1}`
    const fail = (msg: string) => errors.push(`${where}: ${msg}`)
    if (!isObject(item)) return fail('precisa ser um objeto.')

    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (name.length < 2 || name.length > 40) return fail('"name" é obrigatório (2 a 40 caracteres).')
    if (usedNames.has(name.toLowerCase())) return fail('nome repetido.')
    usedNames.add(name.toLowerCase())

    const division = item.division as DivisionId
    if (!ALL_DIVISIONS.includes(division)) return fail('"division" precisa ser "A", "B", "C" ou "D".')

    let id = typeof item.id === 'string' && item.id.trim() ? slugify(item.id) : slugify(name)
    if (!id) id = `clube-${index + 1}`
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)

    const shortRaw = typeof item.shortName === 'string' ? item.shortName.trim().toUpperCase() : ''
    const shortName = /^[A-ZÀ-Ú0-9]{2,4}$/.test(shortRaw) ? shortRaw : slugify(name).replace(/-/g, '').slice(0, 3).toUpperCase()
    const color = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback)
    const hasCrest = typeof item.crest === 'string' && item.crest.trim() !== ''
    if (hasCrest && !isValidCrest(item.crest)) {
      return fail('"crest" precisa ser um link https://, um caminho de imagem do jogo ou uma imagem embutida (data:image/...) pequena.')
    }

    let players: LeagueFilePlayer[] | undefined
    if (item.players !== undefined) {
      if (!Array.isArray(item.players)) return fail('"players" precisa ser uma lista.')
      if (item.players.length < MIN_SQUAD || item.players.length > MAX_SQUAD) {
        return fail(`precisa ter entre ${MIN_SQUAD} e ${MAX_SQUAD} jogadores (tem ${item.players.length}).`)
      }
      players = []
      for (const [i, p] of item.players.entries()) {
        const label = `jogador nº ${i + 1}`
        if (!isObject(p)) return fail(`${label} precisa ser um objeto.`)
        const pName = typeof p.name === 'string' ? p.name.trim() : ''
        if (!pName) return fail(`${label} sem "name".`)
        if (!POSITION_ORDER.includes(p.position as Position)) return fail(`${pName}: "position" precisa ser GOL, DEF, MEI ou ATA.`)
        if (!Number.isInteger(p.age) || (p.age as number) < 16 || (p.age as number) > 45) return fail(`${pName}: "age" entre 16 e 45.`)
        if (typeof p.overall !== 'number' || p.overall < MIN_PLAYER_OVERALL || p.overall > MAX_PLAYER_OVERALL) {
          return fail(`${pName}: "overall" entre ${MIN_PLAYER_OVERALL} e ${MAX_PLAYER_OVERALL}.`)
        }
        let skills: SkillId[] | undefined
        if (p.skills !== undefined) {
          const list = Array.isArray(p.skills) ? [...new Set(p.skills)] : []
          if (list.length !== SKILLS_PER_PLAYER || !list.every((s) => isValidSkillFor(p.position as Position, s))) {
            return fail(`${pName}: "skills" precisa ter ${SKILLS_PER_PLAYER} habilidades diferentes de ${p.position}: ${SKILLS_BY_POSITION[p.position as Position].join(', ')}.`)
          }
          skills = list as SkillId[]
        }
        if (p.foot !== undefined && !isFoot(p.foot)) {
          return fail(`${pName}: "foot" precisa ser "D" (${FOOT_LABELS.D}), "E" (${FOOT_LABELS.E}) ou "A" (${FOOT_LABELS.A}).`)
        }
        players.push({
          name: pName, position: p.position as Position, age: p.age as number, overall: Math.round(p.overall), star: p.star === true,
          ...(skills ? { skills } : {}),
          ...(isFoot(p.foot) ? { foot: p.foot } : {}),
        })
      }
      for (const pos of POSITION_ORDER) {
        const count = players.filter((p) => p.position === pos).length
        if (count < MIN_BY_POSITION[pos]) return fail(`precisa de pelo menos ${MIN_BY_POSITION[pos]} jogadores na posição ${pos} (tem ${count}).`)
      }
    }

    const average = players ? players.reduce((s, p) => s + p.overall, 0) / players.length : null
    const reputation =
      typeof item.reputation === 'number' && item.reputation >= 30 && item.reputation <= 95
        ? Math.round(item.reputation)
        : Math.round(average ?? DIVISION_REPUTATION[division])

    teams.push({
      id,
      name,
      shortName,
      division,
      primaryColor: color(item.primaryColor, '#607d8b'),
      secondaryColor: color(item.secondaryColor, '#ffffff'),
      reputation,
      stadiumName: typeof item.stadiumName === 'string' && item.stadiumName.trim() ? item.stadiumName.trim().slice(0, 50) : undefined,
      manager: typeof item.manager === 'string' && item.manager.trim() ? item.manager.trim().slice(0, 40) : undefined,
      crest: hasCrest ? (item.crest as string).trim() : undefined,
      players,
    })
  })

  // O calendário, o acesso/rebaixamento e a Copa dependem do número exato de clubes por série.
  const declared = isObject(raw) && isLeagueFormat(raw.divisionFormat) ? raw.divisionFormat : null
  const divisionFormat = declared ?? formatOfTeams(teams)
  const rules = LEAGUE_FORMATS[divisionFormat]
  for (const d of ALL_DIVISIONS) {
    const count = teams.filter((t) => t.division === d).length
    if (!rules.divisions.includes(d)) {
      if (count) errors.push(`No formato ${LEAGUE_FORMAT_LABELS[divisionFormat]} não existe a ${DIVISION_LABELS[d]} (tem ${count} clube(s)).`)
    } else if (count !== rules.teamsPerDivision) {
      errors.push(`A ${DIVISION_LABELS[d]} precisa ter exatamente ${rules.teamsPerDivision} clubes (tem ${count}).`)
    }
  }

  return errors.length
    ? { league: null, errors }
    : {
        league: { format: LEAGUE_FORMAT, version: LEAGUE_FORMAT_VERSION, ...metaFields(isObject(raw) ? raw : {}), divisionFormat, teams },
        errors: [],
      }
}

// --- Liga personalizada salva no navegador ---

export function getCustomLeague(): LeagueFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    // Revalida: um arquivo salvo por uma versão antiga do jogo não pode quebrar o início de carreira.
    return parseLeagueFile(raw).league
  } catch {
    return null
  }
}

export function saveCustomLeague(league: LeagueFile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(league))
}

export function clearCustomLeague() {
  localStorage.removeItem(STORAGE_KEY)
}

/** Clubes de uma liga importada, prontos para uma carreira. */
export function teamsFromLeagueFile(league: LeagueFile): Team[] {
  return league.teams.map((t) => {
    const team: Team = {
      id: t.id!,
      division: t.division,
      name: t.name,
      shortName: t.shortName!,
      primaryColor: t.primaryColor!,
      secondaryColor: t.secondaryColor!,
      reputation: t.reputation!,
      stadiumName: t.stadiumName,
      managerName: t.manager,
      crest: t.crest,
      players: [],
    }
    team.players = t.players
      ? t.players.map((p, i) => buildPlayer(p, `${team.id}-${i}`, 70))
      : generateSquadFor(team)
    return team
  })
}
