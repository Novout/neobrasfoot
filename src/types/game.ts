import type { SkillId } from '../data/skills'

export type Position = 'GOL' | 'DEF' | 'MEI' | 'ATA'

export interface Player {
  id: string
  name: string
  position: Position
  age: number
  overall: number
  energy: number
  morale: number
  salary: number
  starter: boolean
  forSale: boolean
  /** Jogador estrela: OVR acima do normal e gasta menos energia. Ausente em saves antigos. */
  star?: boolean
  /** As 2 habilidades do jogador (da lista da posição). Ausente em saves antigos: ver playerSkills(). */
  skills?: SkillId[]
  /** Amarelos acumulados na temporada (zera ao cumprir suspensão por acúmulo). */
  yellowCards?: number
  /** Jogos que ainda precisa cumprir de suspensão. */
  suspension?: number
  /** Jogos que ainda vai ficar fora por lesão. */
  injury?: number
  /** Preço pedido pelo clube enquanto o jogador está à venda (ausente = valor de mercado). */
  askingPrice?: number
  /**
   * Posição em que o titular joga na escalação, quando diferente da sua (ex.: meia improvisado no ataque).
   * Ausente = joga na própria posição.
   */
  role?: Position
  /** Presente enquanto o jogador está emprestado: ele fica no elenco de `toTeamId` e volta para o dono. */
  loan?: PlayerLoan
}

export interface PlayerLoan {
  /** Clube dono do jogador, para onde ele volta. */
  ownerTeamId: string
  /** Clube onde está jogando agora. */
  toTeamId: string
  /** Rodadas do campeonato que faltam para voltar. */
  roundsLeft: number
  fee: number
}

export type DivisionId = 'A' | 'B' | 'C' | 'D'

export interface Team {
  id: string
  division: DivisionId
  name: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  reputation: number
  /** Nome do estádio definido numa liga importada (senão usa o nome padrão do clube). */
  stadiumName?: string
  players: Player[]
}

export type Formation = '4-4-2' | '4-3-3' | '3-5-2' | '5-3-2' | '4-5-1'
export type PlayStyle = 'defensivo' | 'equilibrado' | 'ofensivo'

export interface Tactic {
  formation: Formation
  style: PlayStyle
}

export interface Fixture {
  homeId: string
  awayId: string
}

export type MatchEventType = 'gol' | 'amarelo' | 'vermelho' | 'lesao' | 'sub'

export interface MatchEvent {
  minute: number
  /** Minuto dos acréscimos (ex.: 45+2 → minute 45, extra 2). */
  extra?: number
  teamId: string
  type: MatchEventType
  playerName: string
  /** Ausente em gols de partidas antigas. */
  playerId?: string
  star?: boolean
  /** Vermelho: veio do segundo amarelo. */
  secondYellow?: boolean
  /** Lesão: jogos que vai ficar fora. */
  games?: number
  /** Substituição: quem saiu (ausente quando o jogador entrou na vaga de um lesionado). */
  outName?: string
  outId?: string
  /** Substituição: entrou no lugar de um jogador que se lesionou. */
  replacesInjured?: boolean
}

export type Competition = 'league' | 'cup'

export interface PenaltyScore {
  home: number
  away: number
}

export interface CupTie {
  homeId: string
  awayId: string
  homeGoals: number | null
  awayGoals: number | null
  penalties: PenaltyScore | null
  winnerId: string | null
}

export interface CupRound {
  name: string
  ties: CupTie[]
}

export interface CupState {
  season: number
  rounds: CupRound[]
  /** Índice da próxima fase a ser jogada. */
  currentRound: number
  /** Para cada fase: quantas rodadas do campeonato precisam ter sido jogadas antes dela. */
  schedule: number[]
  championId: string | null
}

export interface LiveMatch {
  id: string
  competition: Competition
  /** Disputa de pênaltis (só em mata-mata empatado). */
  penalties: PenaltyScore | null
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  homeAttack: number
  homeDefense: number
  awayAttack: number
  awayDefense: number
  events: MatchEvent[]
  /**
   * Energia de cada jogador que entrou em campo, no momento em que saiu (ou no apito final).
   * Depois do jogo vira a energia real dele. Ausente em partidas salvas antes do desgaste ao vivo.
   */
  playedEnergy?: Record<string, number>
  /** Estádio do mandante e público do jogo (ausente em partidas salvas antes do recurso). */
  venue?: MatchVenue
  /** Faltas cometidas por cada time (ausente em partidas salvas antes do recurso). */
  fouls?: { home: number; away: number }
  /** Total de faltas ao fim do 1º tempo (para calcular os acréscimos do 2º). */
  firstHalfFouls?: number
  /** Acréscimos anunciados ao fim de cada tempo. */
  added?: { first?: number; second?: number }
}

export interface MatchVenue {
  name: string
  attendance: number
  capacity: number
}

export interface Confidence {
  /** Diretoria: cobra resultados, posição na tabela e finanças. */
  board: number
  /** Clube: torcida e vestiário. */
  club: number
}

export interface ConfidenceChange {
  season: number
  round: number
  board: number
  club: number
  reason: string
}

export interface Dismissal {
  teamId: string
  season: number
  round: number
  reason: string
}

export type TrophyKind = 'league' | 'cup'

export interface Trophy {
  kind: TrophyKind
  /** Série do título (só para `league`). */
  division?: DivisionId
  season: number
  /** Clube que o técnico comandava na conquista. */
  teamId: string
}

export interface Manager {
  id: string
  name: string
  /** Clube atual (null = sem clube). */
  teamId: string | null
  isPlayer: boolean
  trophies: Trophy[]
}

/** Proposta de um clube para o técnico assumir na próxima temporada. */
export interface JobOffer {
  teamId: string
  /** Série do clube na próxima temporada (já com acesso/rebaixamento). */
  division: DivisionId
  reason: string
}

/** Proposta de um clube da IA por um jogador do clube gerenciado. */
export interface TransferOffer {
  id: string
  playerId: string
  fromTeamId: string
  amount: number
}

export interface TransferRecord {
  playerName: string
  position: Position
  fromTeamId: string
  toTeamId: string
  amount: number
  season: number
  round: number
}

export type NegotiationResult =
  | { status: 'accepted'; message: string }
  | { status: 'counter'; message: string; askingPrice: number }
  | { status: 'rejected'; message: string }

export type StadiumUpgradeKey = 'seats' | 'comfort' | 'shops' | 'pitch'

export interface GateRecord {
  season: number
  round: number
  opponentId: string
  attendance: number
  capacity: number
  revenue: number
  /** Ausente em registros antigos (= campeonato). */
  competition?: Competition
}

export interface Stadium {
  name: string
  baseCapacity: number
  ticketPrice: number
  levels: Record<StadiumUpgradeKey, number>
  construction: { key: StadiumUpgradeKey; roundsLeft: number; totalRounds: number } | null
  history: GateRecord[]
}

export interface StandingRow {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}
