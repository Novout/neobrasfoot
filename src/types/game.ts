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
  /** Amarelos acumulados na temporada (zera ao cumprir suspensão por acúmulo). */
  yellowCards?: number
  /** Jogos que ainda precisa cumprir de suspensão. */
  suspension?: number
  /** Jogos que ainda vai ficar fora por lesão. */
  injury?: number
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

export type MatchEventType = 'gol' | 'amarelo' | 'vermelho' | 'lesao'

export interface MatchEvent {
  minute: number
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
  /** Estádio do mandante e público do jogo (ausente em partidas salvas antes do recurso). */
  venue?: MatchVenue
}

export interface MatchVenue {
  name: string
  attendance: number
  capacity: number
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
