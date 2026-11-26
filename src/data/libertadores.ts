import type { CupRound, CupTie, LibertadoresGroup, LibertadoresState, Team } from '../types/game'
import { createRng, hashString } from '../utils/random'
import { roundName } from './cup'
import { generateSquadFor } from './teams'

/**
 * Libertadores: os 4 primeiros da Série A disputam o torneio sul-americano com 28 clubes reais do continente.
 * Fase de grupos (8 grupos de 4, turno e returno; passam os 2 primeiros) e depois mata-mata em jogo único
 * (oitavas, quartas, semifinal e final; empate vai para os pênaltis).
 */

export const LIBERTADORES_NAME = 'Libertadores'
/** Vagas do Brasil: os primeiros da Série A na temporada anterior. */
export const BRAZIL_SPOTS = 4
export const GROUP_COUNT = 8
export const GROUP_SIZE = 4
/** Rodadas da fase de grupos (turno e returno entre 4 clubes). */
export const GROUP_ROUNDS = 6
/** Classificados de cada grupo para as oitavas. */
export const GROUP_QUALIFIERS = 2
/** Etapas do torneio: 6 rodadas de grupos + oitavas, quartas, semifinal e final. */
export const STAGE_COUNT = GROUP_ROUNDS + 4
export const GROUP_STAGE_NAME = 'Fase de grupos'

/** Momento de cada etapa na temporada (fração do campeonato), como no calendário real: grupos até junho, final em novembro. */
const STAGE_TIMING = [0.08, 0.13, 0.18, 0.24, 0.29, 0.34, 0.55, 0.66, 0.77, 0.88]

/** Premiação do clube gerenciado. */
export const LIBERTADORES_PRIZES = {
  /** Por disputar a fase de grupos. */
  entry: 1_000_000,
  groupWin: 300_000,
  groupDraw: 100_000,
  /** Por vencer cada fase do mata-mata (o último valor é o título). */
  knockout: [1_500_000, 2_000_000, 3_000_000, 8_000_000],
  runnerUp: 4_000_000,
}

export const COUNTRY_NAMES: Record<string, string> = {
  BRA: 'Brasil', ARG: 'Argentina', URU: 'Uruguai', PAR: 'Paraguai', CHI: 'Chile', ECU: 'Equador', COL: 'Colômbia',
  PER: 'Peru', BOL: 'Bolívia', VEN: 'Venezuela',
}

type ClubSeed = Pick<Team, 'id' | 'name' | 'shortName' | 'primaryColor' | 'secondaryColor' | 'reputation' | 'stadiumName'> & {
  country: string
}

/**
 * Clubes reais do continente (fora do Brasil). A reputação usa a mesma escala da liga
 * (os grandes do Brasileirão ficam perto de 90) e define o nível do elenco gerado.
 */
export const SOUTH_AMERICAN_CLUBS: ClubSeed[] = [
  // Argentina
  { id: 'sa-river-plate', name: 'River Plate', shortName: 'RIV', country: 'ARG', primaryColor: '#e30613', secondaryColor: '#ffffff', reputation: 85, stadiumName: 'Estadio Monumental' },
  { id: 'sa-boca-juniors', name: 'Boca Juniors', shortName: 'BOC', country: 'ARG', primaryColor: '#003a70', secondaryColor: '#f2b705', reputation: 85, stadiumName: 'La Bombonera' },
  { id: 'sa-racing', name: 'Racing Club', shortName: 'RAC', country: 'ARG', primaryColor: '#6cace4', secondaryColor: '#ffffff', reputation: 79, stadiumName: 'El Cilindro' },
  { id: 'sa-estudiantes', name: 'Estudiantes', shortName: 'EST', country: 'ARG', primaryColor: '#e30613', secondaryColor: '#ffffff', reputation: 77, stadiumName: 'Estadio UNO' },
  { id: 'sa-velez', name: 'Vélez Sarsfield', shortName: 'VEL', country: 'ARG', primaryColor: '#1e3a8a', secondaryColor: '#ffffff', reputation: 76, stadiumName: 'José Amalfitani' },
  { id: 'sa-talleres', name: 'Talleres', shortName: 'TAL', country: 'ARG', primaryColor: '#0b2341', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Mario Alberto Kempes' },
  { id: 'sa-independiente', name: 'Independiente', shortName: 'IND', country: 'ARG', primaryColor: '#d71920', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Libertadores de América' },
  { id: 'sa-san-lorenzo', name: 'San Lorenzo', shortName: 'SLO', country: 'ARG', primaryColor: '#1d3f8c', secondaryColor: '#d71920', reputation: 73, stadiumName: 'Pedro Bidegain' },
  // Uruguai
  { id: 'sa-penarol', name: 'Peñarol', shortName: 'PEÑ', country: 'URU', primaryColor: '#111111', secondaryColor: '#f6c700', reputation: 76, stadiumName: 'Campeón del Siglo' },
  { id: 'sa-nacional', name: 'Nacional', shortName: 'NAC', country: 'URU', primaryColor: '#1e40af', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'Gran Parque Central' },
  // Paraguai
  { id: 'sa-olimpia', name: 'Olimpia', shortName: 'OLI', country: 'PAR', primaryColor: '#111111', secondaryColor: '#ffffff', reputation: 72, stadiumName: 'Defensores del Chaco' },
  { id: 'sa-cerro-porteno', name: 'Cerro Porteño', shortName: 'CCP', country: 'PAR', primaryColor: '#c8102e', secondaryColor: '#00205b', reputation: 72, stadiumName: 'La Nueva Olla' },
  { id: 'sa-libertad', name: 'Libertad', shortName: 'LIB', country: 'PAR', primaryColor: '#1f2937', secondaryColor: '#e5e7eb', reputation: 71, stadiumName: 'Dr. Nicolás Leoz' },
  // Chile
  { id: 'sa-colo-colo', name: 'Colo-Colo', shortName: 'CC', country: 'CHI', primaryColor: '#111111', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Monumental David Arellano' },
  { id: 'sa-u-de-chile', name: 'Universidad de Chile', shortName: 'UCH', country: 'CHI', primaryColor: '#0033a0', secondaryColor: '#e30613', reputation: 72, stadiumName: 'Estadio Nacional' },
  { id: 'sa-u-catolica', name: 'Universidad Católica', shortName: 'UCA', country: 'CHI', primaryColor: '#1d4ed8', secondaryColor: '#ffffff', reputation: 70, stadiumName: 'Claro Arena' },
  // Equador
  { id: 'sa-ldu', name: 'LDU Quito', shortName: 'LDU', country: 'ECU', primaryColor: '#b91c1c', secondaryColor: '#ffffff', reputation: 75, stadiumName: 'Rodrigo Paz Delgado' },
  { id: 'sa-independiente-del-valle', name: 'Independiente del Valle', shortName: 'IDV', country: 'ECU', primaryColor: '#111827', secondaryColor: '#1d4ed8', reputation: 76, stadiumName: 'Banco Guayaquil' },
  { id: 'sa-barcelona-sc', name: 'Barcelona SC', shortName: 'BSC', country: 'ECU', primaryColor: '#facc15', secondaryColor: '#111111', reputation: 71, stadiumName: 'Monumental Banco Pichincha' },
  // Colômbia
  { id: 'sa-atletico-nacional', name: 'Atlético Nacional', shortName: 'ATN', country: 'COL', primaryColor: '#15803d', secondaryColor: '#ffffff', reputation: 74, stadiumName: 'Atanasio Girardot' },
  { id: 'sa-millonarios', name: 'Millonarios', shortName: 'MIL', country: 'COL', primaryColor: '#1d4ed8', secondaryColor: '#ffffff', reputation: 71, stadiumName: 'El Campín' },
  { id: 'sa-america-cali', name: 'América de Cali', shortName: 'AME', country: 'COL', primaryColor: '#dc2626', secondaryColor: '#ffffff', reputation: 70, stadiumName: 'Pascual Guerrero' },
  // Peru
  { id: 'sa-sporting-cristal', name: 'Sporting Cristal', shortName: 'SCR', country: 'PER', primaryColor: '#38bdf8', secondaryColor: '#ffffff', reputation: 70, stadiumName: 'Alberto Gallardo' },
  { id: 'sa-universitario', name: 'Universitario', shortName: 'UNI', country: 'PER', primaryColor: '#7f1d1d', secondaryColor: '#fef3c7', reputation: 71, stadiumName: 'Estadio Monumental U' },
  { id: 'sa-alianza-lima', name: 'Alianza Lima', shortName: 'ALI', country: 'PER', primaryColor: '#1e3a8a', secondaryColor: '#ffffff', reputation: 70, stadiumName: 'Alejandro Villanueva' },
  // Bolívia
  { id: 'sa-bolivar', name: 'Bolívar', shortName: 'BOL', country: 'BOL', primaryColor: '#38bdf8', secondaryColor: '#ffffff', reputation: 69, stadiumName: 'Hernando Siles' },
  { id: 'sa-the-strongest', name: 'The Strongest', shortName: 'STR', country: 'BOL', primaryColor: '#facc15', secondaryColor: '#111111', reputation: 68, stadiumName: 'Hernando Siles' },
  // Venezuela
  { id: 'sa-deportivo-tachira', name: 'Deportivo Táchira', shortName: 'DTA', country: 'VEN', primaryColor: '#facc15', secondaryColor: '#111111', reputation: 66, stadiumName: 'Pueblo Nuevo' },
]

const FIRST_NAMES = [
  'Juan', 'Matías', 'Santiago', 'Nicolás', 'Agustín', 'Facundo', 'Lautaro', 'Franco', 'Joaquín', 'Tomás',
  'Diego', 'Martín', 'Sebastián', 'Gonzalo', 'Federico', 'Emiliano', 'Ignacio', 'Rodrigo', 'Cristian', 'Andrés',
  'Felipe', 'Camilo', 'Kevin', 'Brian', 'Alexis', 'Ezequiel', 'Maximiliano', 'Luciano', 'Leandro', 'Jhon',
]
const LAST_NAMES = [
  'González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Gómez', 'Pérez', 'Sánchez', 'Romero', 'Díaz',
  'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Aguirre',
  'Castro', 'Vargas', 'Rojas', 'Morales', 'Ortiz', 'Suárez', 'Cabrera', 'Villalba', 'Paredes', 'Quintero',
]

/**
 * Clubes estrangeiros da Libertadores, com elencos gerados pelo nível do clube e nomes em espanhol.
 * Determinístico pelo id: o mesmo clube tem os mesmos jogadores a cada temporada.
 */
export function createContinentalTeams(): Team[] {
  return SOUTH_AMERICAN_CLUBS.map(({ country, ...seed }) => {
    const rng = createRng(hashString(`${seed.id}:nomes`))
    const players = generateSquadFor(seed).map((p) => ({ ...p, name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}` }))
    // A série não vale para eles (não disputam a liga); fica a mais alta por padrão.
    return { ...seed, division: 'A' as const, country, players }
  })
}

/** País do clube: o informado nos estrangeiros; os da liga são do Brasil. */
export function countryOf(team: Pick<Team, 'country'> | null | undefined) {
  return team?.country ?? 'BRA'
}


/**
 * Rodadas do campeonato antes de cada etapa, espalhadas pela temporada.
 * Evita cair no mesmo intervalo de uma fase da Copa (`avoid`), quando dá.
 */
export function libertadoresSchedule(leagueRounds: number, avoid: number[] = []): number[] {
  return stageSchedule(STAGE_TIMING, leagueRounds, avoid)
}

/**
 * Rodadas do campeonato jogadas antes de cada etapa de um torneio, pela fração da temporada (`timing`)
 * em que cada etapa acontece. Fica fora dos intervalos ocupados (`avoid`) quando dá.
 */
export function stageSchedule(timing: number[], leagueRounds: number, avoid: number[] = []): number[] {
  const last = Math.max(1, leagueRounds - 1)
  const busy = new Set(avoid)
  const schedule: number[] = []
  for (const share of timing) {
    let r = Math.min(last, Math.max(1, Math.round(share * leagueRounds), schedule.at(-1) ?? 1))
    while (busy.has(r) && r < last) r++
    schedule.push(r)
  }
  return schedule
}

function emptyTie(homeId: string, awayId: string): CupTie {
  return { homeId, awayId, homeGoals: null, awayGoals: null, penalties: null, winnerId: null }
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/** Regra de separação no sorteio: a chave de cada time (país, continente) e quantos da mesma chave cabem num grupo. */
export interface DrawRule {
  keyOf: (team: Team) => string
  maxPerGroup: (key: string) => number
}

/** Libertadores: no máximo um clube de cada país por grupo. */
const COUNTRY_RULE: DrawRule = { keyOf: (t) => countryOf(t), maxPerGroup: () => 1 }

/**
 * Sorteio dos grupos por potes (os 8 mais fortes como cabeças de chave, e assim por diante): cada grupo recebe
 * um time de cada pote, respeitando a regra de separação (por padrão, sem dois clubes do mesmo país no mesmo
 * grupo), com busca com retrocesso sobre a ordem sorteada. Se não houver como, sorteia sem a restrição.
 */
export function drawGroups(participants: Team[], random: () => number = Math.random, rule: DrawRule = COUNTRY_RULE): LibertadoresGroup[] {
  const ranked = [...participants].sort((a, b) => b.reputation - a.reputation)
  const keyOf = rule.keyOf
  // Dentro de cada pote, a ordem é sorteada; os mais "difíceis" (chaves com mais times) vão primeiro.
  const countryCount = new Map<string, number>()
  for (const t of ranked) countryCount.set(keyOf(t), (countryCount.get(keyOf(t)) ?? 0) + 1)
  const order = Array.from({ length: GROUP_SIZE }, (_, i) => ranked.slice(i * GROUP_COUNT, (i + 1) * GROUP_COUNT))
    .flatMap((pot) => shuffle(pot, random).sort((a, b) => countryCount.get(keyOf(b))! - countryCount.get(keyOf(a))!))
  const groups: Team[][] = Array.from({ length: GROUP_COUNT }, () => [])
  const groupOrder = shuffle([...groups.keys()], random)
  let steps = 0

  function place(k: number): boolean {
    if (k === order.length) return true
    if (++steps > 50_000) return false
    const team = order[k]!
    const pot = Math.floor(k / GROUP_COUNT)
    for (const g of groupOrder) {
      const group = groups[g]!
      // Um time por pote em cada grupo, sem passar do limite da mesma chave (país ou continente).
      const key = keyOf(team)
      if (group.length !== pot || group.filter((t) => keyOf(t) === key).length >= rule.maxPerGroup(key)) continue
      group.push(team)
      if (place(k + 1)) return true
      group.pop()
    }
    return false
  }

  if (!place(0)) {
    groups.forEach((g) => (g.length = 0))
    order.forEach((t, k) => groups[groupOrder[k % GROUP_COUNT]!]!.push(t))
  }
  return groups.map((teams, i) => ({ name: String.fromCharCode(65 + i), teamIds: teams.map((t) => t.id) }))
}

/** Turno e returno de um grupo de 4: 6 rodadas de 2 jogos (o returno inverte o mando). */
const GROUP_PAIRINGS: [number, number][][] = [
  [[0, 3], [1, 2]],
  [[2, 0], [3, 1]],
  [[0, 1], [2, 3]],
]

/** Jogos da fase de grupos por rodada: turno e returno (6 rodadas) ou só turno (3, como na Copa do Mundo). */
export function groupRoundsFor(groups: LibertadoresGroup[], doubleRoundRobin = true): CupTie[][] {
  const firstLeg = GROUP_PAIRINGS.map((pairs) =>
    groups.flatMap((g) => pairs.map(([h, a]) => emptyTie(g.teamIds[h]!, g.teamIds[a]!))),
  )
  if (!doubleRoundRobin) return firstLeg
  const secondLeg = firstLeg.map((ties) => ties.map((t) => emptyTie(t.awayId, t.homeId)))
  return [...firstLeg, ...secondLeg]
}

/**
 * Cria a Libertadores da temporada. `playedLeagueRounds` empurra o calendário quando ela começa
 * com o campeonato em andamento (saves antigos).
 */
export function createLibertadores(
  participants: Team[],
  season: number,
  leagueRounds: number,
  cupSchedule: number[] = [],
  playedLeagueRounds = 0,
  random: () => number = Math.random,
): LibertadoresState {
  const groups = drawGroups(participants, random)
  return {
    season,
    groups,
    groupRounds: groupRoundsFor(groups),
    knockout: [],
    stage: 0,
    schedule: libertadoresSchedule(leagueRounds, cupSchedule).map((r) => Math.max(r, playedLeagueRounds)),
    championId: null,
  }
}

export interface GroupRow {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

/** Classificação de um grupo: pontos, vitórias, saldo e gols marcados. */
export function groupTable(state: Pick<LibertadoresState, 'groups' | 'groupRounds'>, groupIndex: number): GroupRow[] {
  const group = state.groups[groupIndex]!
  const rows = new Map<string, GroupRow>(
    group.teamIds.map((id) => [id, { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]),
  )
  for (const tie of state.groupRounds.flat()) {
    const home = rows.get(tie.homeId)
    const away = rows.get(tie.awayId)
    if (!home || !away || tie.homeGoals === null || tie.awayGoals === null) continue
    home.played++
    away.played++
    home.goalsFor += tie.homeGoals
    home.goalsAgainst += tie.awayGoals
    away.goalsFor += tie.awayGoals
    away.goalsAgainst += tie.homeGoals
    if (tie.homeGoals > tie.awayGoals) {
      home.wins++
      away.losses++
      home.points += 3
    } else if (tie.homeGoals < tie.awayGoals) {
      away.wins++
      home.losses++
      away.points += 3
    } else {
      home.draws++
      away.draws++
      home.points++
      away.points++
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor,
  )
}

/**
 * Oitavas: o 1º de cada grupo pega o 2º do grupo vizinho (A×B, C×D...) e joga em casa.
 * A ordem dos confrontos forma a chave: os vencedores dos confrontos 1 e 2 se enfrentam nas quartas, e assim por diante.
 */
export function drawRoundOf16(state: Pick<LibertadoresState, 'groups' | 'groupRounds'>): CupRound {
  const tables = state.groups.map((_, i) => groupTable(state, i))
  const ties: CupTie[] = []
  for (let i = 0; i < tables.length; i += 2) {
    const a = tables[i]!
    const b = tables[i + 1]!
    ties.push(emptyTie(a[0]!.teamId, b[1]!.teamId), emptyTie(b[0]!.teamId, a[1]!.teamId))
  }
  return { name: roundName(ties.length), ties }
}

/** Próxima fase do mata-mata pela chave: vencedor do confronto 1 x vencedor do 2, e assim por diante. */
export function nextKnockoutRound(previous: CupRound, random: () => number = Math.random): CupRound {
  const winners = previous.ties.map((t) => t.winnerId!)
  const ties: CupTie[] = []
  for (let i = 0; i + 1 < winners.length; i += 2) {
    // Mando sorteado (na final, jogo único com mando de um dos dois).
    const [home, away] = random() < 0.5 ? [winners[i]!, winners[i + 1]!] : [winners[i + 1]!, winners[i]!]
    ties.push(emptyTie(home, away))
  }
  return { name: roundName(ties.length), ties }
}

/** Rodadas da fase de grupos do torneio (6 na Libertadores, 3 na Copa do Mundo). */
export const groupRoundCount = (state: Pick<LibertadoresState, 'groupRounds'>) => state.groupRounds.length
export const isGroupStage = (state: Pick<LibertadoresState, 'stage' | 'groupRounds'>) => state.stage < groupRoundCount(state)
export const isFinished = (state: Pick<LibertadoresState, 'championId'>) => state.championId !== null

/** Jogos da etapa atual. */
export function currentTies(state: LibertadoresState): CupTie[] {
  if (isFinished(state)) return []
  if (isGroupStage(state)) return state.groupRounds[state.stage] ?? []
  return state.knockout[state.stage - groupRoundCount(state)]?.ties ?? []
}

/** Nome de uma etapa: "Fase de grupos · 3ª rodada", "Oitavas de final"... (`groupRounds`: rodadas dos grupos). */
export function stageName(stage: number, groupRounds = GROUP_ROUNDS) {
  if (stage < groupRounds) return `${GROUP_STAGE_NAME} · ${stage + 1}ª rodada`
  return roundName(2 ** (groupRounds + 3 - stage))
}

/** Grupo de um clube (ou null se ele não disputa). */
export function groupOf(state: Pick<LibertadoresState, 'groups'>, teamId: string) {
  return state.groups.find((g) => g.teamIds.includes(teamId)) ?? null
}

export function participantIds(state: Pick<LibertadoresState, 'groups'>) {
  return state.groups.flatMap((g) => g.teamIds)
}

/** Sorteia um número de gols com média `mean` (distribuição de Poisson). */
function poisson(mean: number, random: () => number) {
  const limit = Math.exp(-mean)
  let k = 0
  let p = random()
  while (p > limit) {
    k++
    p *= random()
  }
  return k
}

/**
 * Placar de um jogo simulado na hora (sem acompanhar ao vivo), pela força dos times:
 * a mesma proporção ataque/defesa do motor de jogo, com média de ~1,5 gol por time entre iguais.
 */
export function quickScore(
  home: { attack: number; defense: number },
  away: { attack: number; defense: number },
  random: () => number = Math.random,
) {
  const mean = (attack: number, defense: number) => Math.min(5, Math.max(0.15, 1.5 * (attack / Math.max(defense, 1)) ** 2))
  return { home: poisson(mean(home.attack, away.defense), random), away: poisson(mean(away.attack, home.defense), random) }
}
