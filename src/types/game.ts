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

export interface StandingRow {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}
