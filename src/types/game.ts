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
}

export interface Team {
  id: string
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

export interface MatchEvent {
  minute: number
  teamId: string
  type: 'gol'
  playerName: string
}

export interface LiveMatch {
  id: string
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  homeAttack: number
  homeDefense: number
  awayAttack: number
  awayDefense: number
  events: MatchEvent[]
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

export interface StandingRow {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}
