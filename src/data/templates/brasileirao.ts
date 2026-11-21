import type { Position } from '../../types/game'
import { LEAGUE_FORMAT, LEAGUE_FORMAT_VERSION, type LeagueFile, type LeagueFilePlayer, type LeagueFileTeam } from '../leagueFile'
import { POSITION_ORDER } from '../tactics'
import { generateSquadFor } from '../teams'
import squads from './brasileirao-squads.json'

/**
 * Template opcional com clubes reais do futebol brasileiro, 8 por série.
 * As séries são uma divisão aproximada por força/tradição (não a tabela oficial de um ano específico).
 *
 * Elencos reais: vêm de brasileirao-squads.json, baixado da Wikipédia/Wikidata por
 * `npm run update-brasileirao`. Idade e OVR são calculados aqui (estimativas do jogo, editáveis no editor).
 */

type TemplateTeam = Required<Pick<LeagueFileTeam, 'id' | 'name' | 'shortName' | 'division' | 'primaryColor' | 'secondaryColor' | 'reputation' | 'stadiumName'>>

const TEAMS: TemplateTeam[] = [
  // Série A
  { id: 'flamengo', name: 'Flamengo', shortName: 'FLA', division: 'A', primaryColor: '#c4122e', secondaryColor: '#000000', reputation: 90, stadiumName: 'Maracanã' },
  { id: 'palmeiras', name: 'Palmeiras', shortName: 'PAL', division: 'A', primaryColor: '#006437', secondaryColor: '#ffffff', reputation: 89, stadiumName: 'Allianz Parque' },
  { id: 'botafogo', name: 'Botafogo', shortName: 'BOT', division: 'A', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 85, stadiumName: 'Estádio Nilton Santos' },
  { id: 'sao-paulo', name: 'São Paulo', shortName: 'SAO', division: 'A', primaryColor: '#d71920', secondaryColor: '#ffffff', reputation: 83, stadiumName: 'Morumbi' },
  { id: 'corinthians', name: 'Corinthians', shortName: 'COR', division: 'A', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Neo Química Arena' },
  { id: 'atletico-mg', name: 'Atlético Mineiro', shortName: 'CAM', division: 'A', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 82, stadiumName: 'Arena MRV' },
  { id: 'fluminense', name: 'Fluminense', shortName: 'FLU', division: 'A', primaryColor: '#870a28', secondaryColor: '#00613c', reputation: 80, stadiumName: 'Maracanã' },
  { id: 'internacional', name: 'Internacional', shortName: 'INT', division: 'A', primaryColor: '#e5050f', secondaryColor: '#ffffff', reputation: 80, stadiumName: 'Beira-Rio' },

  // Série B
  { id: 'gremio', name: 'Grêmio', shortName: 'GRE', division: 'B', primaryColor: '#0d80bf', secondaryColor: '#000000', reputation: 74, stadiumName: 'Arena do Grêmio' },
  { id: 'cruzeiro', name: 'Cruzeiro', shortName: 'CRU', division: 'B', primaryColor: '#003da5', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Mineirão' },
  { id: 'vasco', name: 'Vasco da Gama', shortName: 'VAS', division: 'B', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 71, stadiumName: 'São Januário' },
  { id: 'bahia', name: 'Bahia', shortName: 'BAH', division: 'B', primaryColor: '#005ca9', secondaryColor: '#e30613', reputation: 71, stadiumName: 'Arena Fonte Nova' },
  { id: 'fortaleza', name: 'Fortaleza', shortName: 'FOR', division: 'B', primaryColor: '#0033a0', secondaryColor: '#e30613', reputation: 69, stadiumName: 'Castelão' },
  { id: 'athletico-pr', name: 'Athletico Paranaense', shortName: 'CAP', division: 'B', primaryColor: '#c8102e', secondaryColor: '#000000', reputation: 68, stadiumName: 'Arena da Baixada' },
  { id: 'santos', name: 'Santos', shortName: 'SAN', division: 'B', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 67, stadiumName: 'Vila Belmiro' },
  { id: 'bragantino', name: 'Bragantino', shortName: 'RBB', division: 'B', primaryColor: '#d50032', secondaryColor: '#ffffff', reputation: 66, stadiumName: 'Nabi Abi Chedid' },

  // Série C
  { id: 'vitoria', name: 'Vitória', shortName: 'VIT', division: 'C', primaryColor: '#e30613', secondaryColor: '#000000', reputation: 62, stadiumName: 'Barradão' },
  { id: 'sport', name: 'Sport', shortName: 'SPT', division: 'C', primaryColor: '#d71920', secondaryColor: '#000000', reputation: 61, stadiumName: 'Ilha do Retiro' },
  { id: 'ceara', name: 'Ceará', shortName: 'CEA', division: 'C', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 60, stadiumName: 'Arena Castelão' },
  { id: 'juventude', name: 'Juventude', shortName: 'JUV', division: 'C', primaryColor: '#00843d', secondaryColor: '#ffffff', reputation: 58, stadiumName: 'Alfredo Jaconi' },
  { id: 'goias', name: 'Goiás', shortName: 'GOI', division: 'C', primaryColor: '#006b3f', secondaryColor: '#ffffff', reputation: 58, stadiumName: 'Estádio da Serrinha' },
  { id: 'coritiba', name: 'Coritiba', shortName: 'CFC', division: 'C', primaryColor: '#00544d', secondaryColor: '#ffffff', reputation: 57, stadiumName: 'Couto Pereira' },
  { id: 'america-mg', name: 'América Mineiro', shortName: 'AME', division: 'C', primaryColor: '#00843d', secondaryColor: '#000000', reputation: 56, stadiumName: 'Arena Independência' },
  { id: 'cuiaba', name: 'Cuiabá', shortName: 'CUI', division: 'C', primaryColor: '#006b3f', secondaryColor: '#ffd200', reputation: 55, stadiumName: 'Arena Pantanal' },

  // Série D
  { id: 'ponte-preta', name: 'Ponte Preta', shortName: 'PON', division: 'D', primaryColor: '#000000', secondaryColor: '#ffffff', reputation: 52, stadiumName: 'Moisés Lucarelli' },
  { id: 'guarani', name: 'Guarani', shortName: 'GUA', division: 'D', primaryColor: '#00843d', secondaryColor: '#ffffff', reputation: 51, stadiumName: 'Brinco de Ouro' },
  { id: 'paysandu', name: 'Paysandu', shortName: 'PAY', division: 'D', primaryColor: '#00a3e0', secondaryColor: '#ffffff', reputation: 50, stadiumName: 'Curuzu' },
  { id: 'remo', name: 'Remo', shortName: 'REM', division: 'D', primaryColor: '#002d72', secondaryColor: '#ffffff', reputation: 50, stadiumName: 'Baenão' },
  { id: 'nautico', name: 'Náutico', shortName: 'NAU', division: 'D', primaryColor: '#d71920', secondaryColor: '#ffffff', reputation: 48, stadiumName: 'Aflitos' },
  { id: 'santa-cruz', name: 'Santa Cruz', shortName: 'STC', division: 'D', primaryColor: '#d71920', secondaryColor: '#000000', reputation: 47, stadiumName: 'Arruda' },
  { id: 'crb', name: 'CRB', shortName: 'CRB', division: 'D', primaryColor: '#d71920', secondaryColor: '#ffffff', reputation: 46, stadiumName: 'Rei Pelé' },
  { id: 'avai', name: 'Avaí', shortName: 'AVA', division: 'D', primaryColor: '#0055a5', secondaryColor: '#ffffff', reputation: 45, stadiumName: 'Ressacada' },
]

// --- Elencos reais ---

interface RawPlayer {
  name: string
  position: string
  birthDate?: string
  /** Em quantas Wikipédias o jogador tem artigo: indica o quanto ele é conhecido. */
  fame: number
}

/** Data dos elencos (as idades são calculadas nela, para o template não mudar sozinho com o tempo). */
export const SQUADS_DATE: string = squads.fetchedAt
const RAW: Record<string, { players: RawPlayer[] }> = squads.clubs

const MAX_SQUAD = 30
const MIN_BY_POSITION: Record<Position, number> = { GOL: 2, DEF: 4, MEI: 4, ATA: 2 }
const MAX_GOALKEEPERS = 4
/** Sem data de nascimento quase sempre é jogador da base recém-promovido. */
const UNKNOWN_AGE = 20

function ageOn(birthDate: string | undefined, reference: string) {
  if (!birthDate) return UNKNOWN_AGE
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number]
  const [ry, rm, rd] = reference.split('-').map(Number) as [number, number, number]
  return ry - y - (rm < m || (rm === m && rd < d) ? 1 : 0)
}

/** Jovens ainda não chegaram ao auge; veteranos já caíram. */
function ageAdjustment(age: number) {
  if (age <= 19) return -6
  if (age <= 21) return -3
  if (age <= 24) return -1
  if (age <= 30) return 0
  if (age <= 33) return -1
  if (age <= 35) return -3
  return -5
}

/** Jogadores muito conhecidos (muitas Wikipédias) e ainda em atividade de alto nível viram estrelas. */
const STAR_FAME = 40
const STAR_MAX_AGE = 35
const STAR_BONUS = 4

/**
 * OVR estimado pelo nível do clube, pela fama do jogador (escala logarítmica) e pela idade.
 * Depois, `realSquad` recentra a média do elenco no nível do clube.
 */
export function estimateOverall(reputation: number, fame: number, age: number) {
  const fameScore = Math.log2(1 + fame)
  const star = fame >= STAR_FAME && age <= STAR_MAX_AGE
  const overall = 0.55 * reputation + 0.45 * 55 + 3.5 * fameScore + ageAdjustment(age) + (star ? STAR_BONUS : 0)
  return { overall: Math.max(35, Math.min(95, Math.round(overall))), star }
}

/** Elenco real do clube, limitado a 30 jogadores e com o mínimo por posição. */
function realSquad(teamId: string, reputation: number): LeagueFilePlayer[] | undefined {
  const raw = RAW[teamId]?.players
  if (!raw?.length) return undefined
  const players = raw
    .filter((p) => POSITION_ORDER.includes(p.position as Position))
    .map((p) => {
      const age = Math.max(16, Math.min(45, ageOn(p.birthDate, SQUADS_DATE)))
      const { overall, star } = estimateOverall(reputation, p.fame, age)
      return { name: p.name.slice(0, 30), position: p.position as Position, age, overall, ...(star ? { star: true } : {}) }
    })
    .sort((a, b) => b.overall - a.overall)

  // Primeiro garante o mínimo de cada posição; depois completa com os melhores até 30.
  const chosen = new Set<LeagueFilePlayer>()
  for (const pos of POSITION_ORDER) players.filter((p) => p.position === pos).slice(0, MIN_BY_POSITION[pos]).forEach((p) => chosen.add(p))
  for (const p of players) {
    if (chosen.size >= MAX_SQUAD) break
    if (p.position === 'GOL' && [...chosen].filter((c) => c.position === 'GOL').length >= MAX_GOALKEEPERS) continue
    chosen.add(p)
  }
  const squad = [...chosen].sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall)

  // Calibra a média do elenco com a de um elenco gerado pelo jogo para a mesma reputação:
  // mantém o equilíbrio de salários, valores e finanças; fama e idade só definem quem é melhor dentro do clube.
  const mean = (list: { overall: number }[]) => list.reduce((sum, p) => sum + p.overall, 0) / list.length
  const shift = Math.round(mean(generateSquadFor({ id: teamId, reputation })) - mean(squad))
  for (const p of squad) p.overall = Math.max(35, Math.min(95, p.overall + shift))

  // Clube com elenco desfalcado demais na fonte: o jogo gera um elenco fictício.
  return squad.length >= 16 && POSITION_ORDER.every((pos) => squad.filter((p) => p.position === pos).length >= MIN_BY_POSITION[pos])
    ? squad
    : undefined
}

import { BRASILEIRAO_TEMPLATE_NAME } from './names'
export { BRASILEIRAO_TEMPLATE_NAME }

/** Nova cópia a cada chamada (o editor altera o rascunho direto). */
export function brasileiraoTemplate(): LeagueFile {
  return {
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    name: BRASILEIRAO_TEMPLATE_NAME,
    teams: TEAMS.map((t) => ({ ...t, players: realSquad(t.id, t.reputation) })),
  }
}
