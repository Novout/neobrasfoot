import type { DefRole, DivisionId, Player, Position, Team } from '../types/game'
import { createRng, hashString } from '../utils/random'
import { isFoot, playerFoot, type Foot } from './feet'
import { balanceDefRoles, isDefRole } from './defense'
import { defaultSkills, isValidSkillFor, SKILLS_PER_PLAYER, type SkillId } from './skills'
import { arrangeForFormat, MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL, type LeagueFormat } from './divisions'
import { STAR_CHANCE, STAR_OVERALL_BOOST, STAR_SALARY_FACTOR, starBoost } from './stars'

type TeamSeed = Omit<Team, 'players'>

/**
 * Clubes fictícios. A reputação define o nível do elenco gerado:
 * Série A ~70-80, B ~60-68, C ~50-58, D ~40-48.
 */
const TEAM_SEEDS: TeamSeed[] = [
  // Série A
  { id: 'atletico-serrano', division: 'A', name: 'Atlético Serrano', shortName: 'ATS', primaryColor: '#c62828', secondaryColor: '#ffffff', reputation: 80 },
  { id: 'uniao-litoral', division: 'A', name: 'União Litoral', shortName: 'ULI', primaryColor: '#1565c0', secondaryColor: '#ffeb3b', reputation: 78 },
  { id: 'esporte-planalto', division: 'A', name: 'Esporte Planalto', shortName: 'EPL', primaryColor: '#2e7d32', secondaryColor: '#ffffff', reputation: 77 },
  { id: 'operario-vale', division: 'A', name: 'Operário do Vale', shortName: 'OPV', primaryColor: '#212121', secondaryColor: '#ffffff', reputation: 75 },
  { id: 'real-cerrado', division: 'A', name: 'Real Cerrado', shortName: 'RCE', primaryColor: '#6a1b9a', secondaryColor: '#ffd54f', reputation: 74 },
  { id: 'ferroviario-norte', division: 'A', name: 'Ferroviário Norte', shortName: 'FEN', primaryColor: '#ef6c00', secondaryColor: '#000000', reputation: 72 },
  { id: 'sociedade-ribeira', division: 'A', name: 'Sociedade Ribeira', shortName: 'SRI', primaryColor: '#00838f', secondaryColor: '#ffffff', reputation: 71 },
  { id: 'juventude-campos', division: 'A', name: 'Juventude dos Campos', shortName: 'JUC', primaryColor: '#f9a825', secondaryColor: '#1b5e20', reputation: 70 },
  // Série B
  { id: 'estrela-sertao', division: 'B', name: 'Estrela do Sertão', shortName: 'ESE', primaryColor: '#b71c1c', secondaryColor: '#ffc107', reputation: 68 },
  { id: 'comercial-mare', division: 'B', name: 'Comercial Maré Alta', shortName: 'CMA', primaryColor: '#0d47a1', secondaryColor: '#ffffff', reputation: 67 },
  { id: 'tupa-ec', division: 'B', name: 'Tupã Esporte Clube', shortName: 'TEC', primaryColor: '#33691e', secondaryColor: '#fdd835', reputation: 66 },
  { id: 'ipe-fc', division: 'B', name: 'Ipê Futebol Clube', shortName: 'IPE', primaryColor: '#ad1457', secondaryColor: '#ffffff', reputation: 64 },
  { id: 'aurora-serra', division: 'B', name: 'Aurora da Serra', shortName: 'AUS', primaryColor: '#ff8f00', secondaryColor: '#3e2723', reputation: 63 },
  { id: 'ventania-fc', division: 'B', name: 'Ventania FC', shortName: 'VEN', primaryColor: '#90a4ae', secondaryColor: '#0d47a1', reputation: 62 },
  { id: 'coroados-ac', division: 'B', name: 'Coroados AC', shortName: 'COR', primaryColor: '#4a148c', secondaryColor: '#ffffff', reputation: 61 },
  { id: 'pinheiral-ec', division: 'B', name: 'Pinheiral EC', shortName: 'PIN', primaryColor: '#1b5e20', secondaryColor: '#000000', reputation: 60 },
  // Série C
  { id: 'pedra-branca', division: 'C', name: 'Atlético Pedra Branca', shortName: 'APB', primaryColor: '#eceff1', secondaryColor: '#c62828', reputation: 58 },
  { id: 'mangueiral-fc', division: 'C', name: 'Mangueiral FC', shortName: 'MAN', primaryColor: '#e65100', secondaryColor: '#2e7d32', reputation: 57 },
  { id: 'canarinho-brejo', division: 'C', name: 'Canarinho do Brejo', shortName: 'CAB', primaryColor: '#fdd835', secondaryColor: '#1565c0', reputation: 56 },
  { id: 'industrial-vale-verde', division: 'C', name: 'Industrial Vale Verde', shortName: 'IVV', primaryColor: '#455a64', secondaryColor: '#76ff03', reputation: 54 },
  { id: 'lagoa-seca', division: 'C', name: 'Lagoa Seca EC', shortName: 'LAS', primaryColor: '#0277bd', secondaryColor: '#e0f7fa', reputation: 53 },
  { id: 'tropical-fc', division: 'C', name: 'Tropical FC', shortName: 'TRO', primaryColor: '#00c853', secondaryColor: '#ff6d00', reputation: 52 },
  { id: 'carcara-ac', division: 'C', name: 'Carcará AC', shortName: 'CAR', primaryColor: '#5d4037', secondaryColor: '#ffffff', reputation: 51 },
  { id: 'unidos-colina', division: 'C', name: 'Unidos da Colina', shortName: 'UDC', primaryColor: '#283593', secondaryColor: '#e53935', reputation: 50 },
  // Série D
  { id: 'boa-esperanca', division: 'D', name: 'Boa Esperança FC', shortName: 'BOE', primaryColor: '#43a047', secondaryColor: '#ffffff', reputation: 48 },
  { id: 'serrinha-ec', division: 'D', name: 'Serrinha EC', shortName: 'SER', primaryColor: '#8d6e63', secondaryColor: '#fff3e0', reputation: 47 },
  { id: 'tamandua-ac', division: 'D', name: 'Tamanduá AC', shortName: 'TAM', primaryColor: '#6d4c41', secondaryColor: '#ffca28', reputation: 46 },
  { id: 'riachao-fc', division: 'D', name: 'Riachão FC', shortName: 'RIA', primaryColor: '#26c6da', secondaryColor: '#004d40', reputation: 45 },
  { id: 'palmital-ec', division: 'D', name: 'Palmital EC', shortName: 'PAL', primaryColor: '#827717', secondaryColor: '#ffffff', reputation: 44 },
  { id: 'cajueiro-fc', division: 'D', name: 'Cajueiro FC', shortName: 'CAJ', primaryColor: '#d84315', secondaryColor: '#fff176', reputation: 43 },
  { id: 'porto-pedras', division: 'D', name: 'Porto das Pedras', shortName: 'PDP', primaryColor: '#37474f', secondaryColor: '#4fc3f7', reputation: 42 },
  { id: 'jatoba-ec', division: 'D', name: 'Jatobá EC', shortName: 'JAT', primaryColor: '#3e2723', secondaryColor: '#a5d6a7', reputation: 40 },
]

/** Clubes fictícios extras, usados só no formato 2×20 (40 clubes). */
const EXTRA_TEAM_SEEDS: TeamSeed[] = [
  { id: 'gaviao-norte', division: 'D', name: 'Gavião do Norte', shortName: 'GAV', primaryColor: '#1a237e', secondaryColor: '#ffca28', reputation: 50 },
  { id: 'maracaja-ec', division: 'D', name: 'Maracajá EC', shortName: 'MCJ', primaryColor: '#ff6f00', secondaryColor: '#212121', reputation: 48 },
  { id: 'brisa-mar', division: 'D', name: 'Brisa do Mar FC', shortName: 'BRM', primaryColor: '#0097a7', secondaryColor: '#ffffff', reputation: 46 },
  { id: 'ipiranga-ac', division: 'D', name: 'Ipiranga AC', shortName: 'IPI', primaryColor: '#2e7d32', secondaryColor: '#fdd835', reputation: 45 },
  { id: 'serra-azul', division: 'D', name: 'Serra Azul EC', shortName: 'SAZ', primaryColor: '#1565c0', secondaryColor: '#ffffff', reputation: 44 },
  { id: 'vale-sol', division: 'D', name: 'Vale do Sol FC', shortName: 'VDS', primaryColor: '#f57f17', secondaryColor: '#4e342e', reputation: 42 },
  { id: 'pantaneiro-fc', division: 'D', name: 'Pantaneiro FC', shortName: 'PAN', primaryColor: '#558b2f', secondaryColor: '#000000', reputation: 41 },
  { id: 'cacique-ec', division: 'D', name: 'Cacique EC', shortName: 'CAC', primaryColor: '#8e24aa', secondaryColor: '#ffffff', reputation: 39 },
]

const FIRST_NAMES = [
  'Lucas', 'Gabriel', 'Mateus', 'Rafael', 'Thiago', 'Bruno', 'Diego', 'Felipe', 'Caio', 'Renan',
  'Igor', 'Vitor', 'André', 'Danilo', 'Eduardo', 'Gustavo', 'Henrique', 'João', 'Leandro', 'Marcos',
  'Nathan', 'Otávio', 'Paulo', 'Rodrigo', 'Samuel', 'Tiago', 'Wesley', 'Yuri', 'Alan', 'Murilo',
  'Davi', 'Enzo', 'Fábio', 'Hugo', 'Kauã', 'Luan', 'Pedro', 'Ruan', 'Sérgio', 'Vinícius',
]
const LAST_NAMES = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Ribeiro', 'Almeida', 'Carvalho',
  'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Moura', 'Teixeira', 'Freitas', 'Cardoso', 'Nunes', 'Batista',
  'Araújo', 'Campos', 'Dias', 'Farias', 'Macedo', 'Pires', 'Queiroz', 'Ramos', 'Siqueira', 'Vieira',
]

/** Composição do elenco: 3 GOL, 7 DEF, 7 MEI, 5 ATA = 22 jogadores. */
export const SQUAD_TEMPLATE: Position[] = [
  ...Array<Position>(3).fill('GOL'),
  ...Array<Position>(7).fill('DEF'),
  ...Array<Position>(7).fill('MEI'),
  ...Array<Position>(5).fill('ATA'),
]

/** Dados editáveis de um jogador antes de entrar no jogo. */
export interface PlayerDraft {
  name: string
  position: Position
  age: number
  overall: number
  /**
   * Quanto o jogador fica acima (+) ou abaixo (−) do nível do elenco, sem contar a idade.
   * Usado pelo editor de clube para recalcular o OVR quando o nível muda.
   */
  talent?: number
  /** Jogador estrela (o bônus de OVR já está incluído em `overall`). */
  star?: boolean
  /** Habilidades escolhidas (ex.: liga importada); sem isso são sorteadas. */
  skills?: SkillId[]
  /** Pé preferido (ex.: liga importada); sem isso é sorteado. */
  foot?: Foot
  /** Defensores: lateral ou zagueiro (sem isso o elenco é equilibrado automaticamente). */
  defRole?: DefRole
}

type Rng = ReturnType<typeof createRng>

function clampOverall(value: number) {
  return Math.max(MIN_PLAYER_OVERALL, Math.min(MAX_PLAYER_OVERALL, Math.round(value)))
}

export function randomPlayerName(rng: Rng = createRng(Date.now())) {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`
}

/** Jogador aleatório em torno de um nível (reputação) informado. */
export function randomPlayerDraft(position: Position, level: number, rng: Rng): PlayerDraft {
  const star = rollStar(rng)
  const overall = clampOverall(level + rng.int(-12, 8) + starBoost(star))
  return { name: randomPlayerName(rng), position, age: rng.int(18, 35), overall, star }
}

/** Sorteio raro de jogador estrela. */
function rollStar(rng: Rng) {
  return rng.next() < STAR_CHANCE
}

// --- Modelo de força usado no editor de clube ---

/** Curva de idade: jovens ainda em formação, auge entre 26 e 30, queda depois dos 33. */
export function ageAdjustment(age: number): number {
  if (age <= 19) return -4
  if (age <= 22) return -2
  if (age <= 25) return 0
  if (age <= 30) return 2
  if (age <= 32) return 0
  if (age <= 34) return -2
  return -4
}

/** Média da curva nas idades sorteadas (18–35), descontada para o nível bater com a média do elenco. */
const AGE_CURVE_MEAN = Array.from({ length: 18 }, (_, i) => ageAdjustment(18 + i)).reduce((s, v) => s + v, 0) / 18

function ageEffect(age: number) {
  return ageAdjustment(age) - AGE_CURVE_MEAN
}

/**
 * Talento com distribuição aproximadamente normal (desvio ~5): a maioria perto do nível,
 * poucos craques e poucos jogadores bem abaixo.
 */
function randomTalent(rng: Rng) {
  const bell = (rng.next() + rng.next() + rng.next()) / 3 - 0.5 // -0,5 .. 0,5, concentrado no centro
  return Math.round(Math.max(-14, Math.min(12, bell * 30)) * 10) / 10
}

/** OVR de um jogador para um nível de elenco, considerando talento, idade e o bônus de estrela. */
export function overallForLevel(level: number, talent: number, age: number, star = false) {
  return clampOverall(level + talent + ageEffect(age) + starBoost(star))
}

/** Talento implícito de um jogador com OVR definido manualmente, para um dado nível. */
export function talentFromOverall(overall: number, level: number, age: number, star = false) {
  return overall - level - ageEffect(age) - starBoost(star)
}

export function realisticPlayerDraft(position: Position, level: number, rng: Rng): PlayerDraft {
  const age = rng.int(18, 35)
  const talent = randomTalent(rng)
  const star = rollStar(rng)
  return { name: randomPlayerName(rng), position, age, talent, star, overall: overallForLevel(level, talent, age, star) }
}

/** Elenco de 22 jogadores cuja média fica próxima do nível informado. */
export function generateRealisticSquad(level: number, seed: number = Date.now()): PlayerDraft[] {
  const rng = createRng(seed)
  return SQUAD_TEMPLATE.map((position) => realisticPlayerDraft(position, level, rng))
}

/** Habilidades informadas (se forem 2 válidas da posição) ou o sorteio fixo do jogador. */
function skillsFor(draft: PlayerDraft, id: string): SkillId[] {
  const given = [...new Set(draft.skills ?? [])].filter((s) => isValidSkillFor(draft.position, s))
  return given.length === SKILLS_PER_PLAYER ? given : defaultSkills(id, draft.position)
}

export function buildPlayer(draft: PlayerDraft, id: string, morale: number): Player {
  const overall = clampOverall(draft.overall)
  return {
    id,
    name: draft.name.trim(),
    position: draft.position,
    age: draft.age,
    overall,
    energy: 100,
    morale,
    salary: Math.round((overall * overall * (draft.star ? STAR_SALARY_FACTOR : 1)) / 10) * 10,
    starter: false,
    forSale: false,
    star: draft.star ?? false,
    skills: skillsFor(draft, id),
    foot: isFoot(draft.foot) ? draft.foot : playerFoot({ id }),
    ...(draft.position === 'DEF' && isDefRole(draft.defRole) ? { defRole: draft.defRole } : {}),
  }
}

/**
 * Saves anteriores às estrelas: sorteia estrelas uma única vez nos elencos existentes,
 * com a mesma chance e o mesmo bônus da geração normal.
 */
export function assignStarsToLegacyTeams(teams: Team[]) {
  if (teams.some((t) => t.players.some((p) => p.star !== undefined))) return false
  const rng = createRng(Date.now())
  for (const p of teams.flatMap((t) => t.players)) {
    p.star = rollStar(rng)
    if (p.star) {
      p.overall = clampOverall(p.overall + STAR_OVERALL_BOOST)
      p.salary = Math.round((p.overall * p.overall * STAR_SALARY_FACTOR) / 10) * 10
    }
  }
  return true
}

function generatePlayers(seed: TeamSeed): Player[] {
  const rng = createRng(hashString(seed.id))
  const players = SQUAD_TEMPLATE.map((position, index) =>
    buildPlayer(randomPlayerDraft(position, seed.reputation, rng), `${seed.id}-${index}`, rng.int(60, 90)),
  )
  // 7 defensores: 3 laterais e 4 zagueiros.
  players.filter((p) => p.position === 'DEF').forEach((p, i) => (p.defRole = i % 2 === 1 && i < 6 ? 'LAT' : 'ZAG'))
  return players
}

/** Elenco gerado (determinístico pelo id) para um clube sem jogadores definidos. */
export function generateSquadFor(seed: Pick<Team, 'id' | 'reputation'>): Player[] {
  return generatePlayers(seed as TeamSeed)
}

/** Série C (fora da liga) da liga gerada no formato 2×20: sobem no fim da temporada. */
const RESERVE_TEAM_SEEDS: TeamSeed[] = [
  { id: 'aguia-dourada', division: 'C', name: 'Águia Dourada EC', shortName: 'AGD', primaryColor: '#ffb300', secondaryColor: '#3e2723', reputation: 40 },
  { id: 'rio-claro-fc', division: 'C', name: 'Rio Claro do Sul', shortName: 'RCS', primaryColor: '#0288d1', secondaryColor: '#ffffff', reputation: 39 },
  { id: 'uniao-mineira', division: 'C', name: 'União Mineira', shortName: 'UMI', primaryColor: '#424242', secondaryColor: '#ef5350', reputation: 38 },
  { id: 'colonial-ac', division: 'C', name: 'Colonial AC', shortName: 'COL', primaryColor: '#2e7d32', secondaryColor: '#fff176', reputation: 37 },
]

/** Clubes fictícios da Série C (fora da liga), usados só no formato 2×20. */
export function createReserveTeams(): Team[] {
  return RESERVE_TEAM_SEEDS.map((seed) => ({ ...seed, players: generatePlayers(seed) }))
}

/** Liga de clubes fictícios. No formato 2×20 entram mais 8 clubes e as séries são refeitas pela reputação. */
export function createTeams(format: LeagueFormat = '4x8'): Team[] {
  const seeds = format === '4x8' ? TEAM_SEEDS : arrangeForFormat([...TEAM_SEEDS, ...EXTRA_TEAM_SEEDS], format)
  return seeds.map((seed) => ({ ...seed, players: generatePlayers(seed) }))
}

// --- Clube personalizado ---

export const CUSTOM_TEAM_ID = 'meu-clube'

/** Reputação típica de cada série, usada pelo clube criado pelo jogador. */
export const DIVISION_REPUTATION: Record<DivisionId, number> = { A: 75, B: 64, C: 54, D: 44, ESP: 80 }

export interface CustomTeamDraft {
  name: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  division: DivisionId
  players: PlayerDraft[]
  /** Escudo enviado pelo jogador (imagem embutida, já reduzida). Sem ele, o distintivo usa as cores. */
  crest?: string
}

/** O clube de menor reputação da série, que sai para dar lugar ao clube criado. */
export function teamReplacedBy(teams: Team[], division: DivisionId) {
  return teamsByDivision(teams, division).sort((a, b) => a.reputation - b.reputation)[0]!
}

/** Monta a liga com o clube personalizado no lugar do mais fraco da série escolhida. */
/** `base`: a liga em uso (a padrão ou uma importada). */
export function createTeamsWithCustom(draft: CustomTeamDraft, base: Team[] = createTeams()): { teams: Team[]; replaced: Team } {
  const teams = base
  const replaced = teamReplacedBy(teams, draft.division)
  const custom: Team = {
    id: CUSTOM_TEAM_ID,
    division: draft.division,
    name: draft.name.trim(),
    shortName: draft.shortName.trim().toUpperCase(),
    primaryColor: draft.primaryColor,
    secondaryColor: draft.secondaryColor,
    reputation: DIVISION_REPUTATION[draft.division],
    ...(draft.crest ? { crest: draft.crest } : {}),
    players: withBalancedDefense(draft.players.map((p, i) => buildPlayer(p, `${CUSTOM_TEAM_ID}-${i}`, 75))),
  }
  return { teams: teams.map((t) => (t.id === replaced.id ? custom : t)), replaced }
}

/** Defensores sem função definida recebem lateral/zagueiro, mantendo o elenco equilibrado. */
export function withBalancedDefense(players: Player[]) {
  balanceDefRoles(players)
  return players
}

export function teamsByDivision(teams: Team[], division: DivisionId) {
  return teams.filter((t) => t.division === division)
}
