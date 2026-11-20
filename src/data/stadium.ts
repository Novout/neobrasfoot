import type { Stadium, StadiumUpgradeKey, Team } from '../types/game'

export const MAX_UPGRADE_LEVEL = 5
export const MIN_TICKET_PRICE = 5
export const MAX_TICKET_PRICE = 200

const SEATS_PER_LEVEL = 5_000
const BASE_IDEAL_PRICE = 20
const BASE_SPEND_PER_FAN = 5
/** Cota de TV/bilheteria dividida recebida quando o time joga fora. */
export const AWAY_GAME_INCOME = 80_000

interface UpgradeConfig {
  label: string
  icon: string
  description: string
  baseCost: number
  /** Texto do efeito total para um nível. */
  effect: (level: number) => string
}

export const STADIUM_UPGRADES: Record<StadiumUpgradeKey, UpgradeConfig> = {
  seats: {
    label: 'Arquibancadas',
    icon: '🏟️',
    description: 'Amplia a capacidade. Vale a pena quando os jogos lotam.',
    baseCost: 1_000_000,
    effect: (level) => `+${(level * SEATS_PER_LEVEL).toLocaleString('pt-BR')} lugares`,
  },
  comfort: {
    label: 'Conforto e camarotes',
    icon: '💺',
    description: 'O torcedor aceita pagar ingressos mais caros.',
    baseCost: 1_000_000,
    effect: (level) => `+${level * 15}% no preço aceito`,
  },
  shops: {
    label: 'Lojas e bares',
    icon: '🍔',
    description: 'Cada torcedor presente gasta mais dentro do estádio.',
    baseCost: 900_000,
    effect: (level) => `R$ ${BASE_SPEND_PER_FAN + level * 4} gastos por torcedor`,
  },
  pitch: {
    label: 'Gramado e vestiários',
    icon: '🌱',
    description: 'Aumenta a vantagem de jogar em casa.',
    baseCost: 800_000,
    effect: (level) => `+${level * 3}% de força em casa`,
  },
}

export const UPGRADE_KEYS = Object.keys(STADIUM_UPGRADES) as StadiumUpgradeKey[]

export function upgradeCost(key: StadiumUpgradeKey, currentLevel: number) {
  return Math.round((STADIUM_UPGRADES[key].baseCost * 1.6 ** currentLevel) / 10_000) * 10_000
}

/** Rodadas de obra: níveis mais altos demoram mais. */
export function buildRounds(currentLevel: number) {
  return currentLevel + 1
}

export function createStadium(team: Pick<Team, 'name' | 'reputation'>): Stadium {
  return {
    name: `Estádio do ${team.name}`,
    baseCapacity: Math.round((15_000 + (team.reputation - 55) * 600) / 100) * 100,
    ticketPrice: BASE_IDEAL_PRICE,
    levels: { seats: 0, comfort: 0, shops: 0, pitch: 0 },
    construction: null,
    history: [],
  }
}

export function stadiumCapacity(stadium: Stadium) {
  return stadium.baseCapacity + stadium.levels.seats * SEATS_PER_LEVEL
}

/** Preço que o torcedor considera justo; acima dele o público cai. */
export function idealTicketPrice(stadium: Stadium) {
  return BASE_IDEAL_PRICE * (1 + 0.15 * stadium.levels.comfort)
}

export function spendPerFan(stadium: Stadium) {
  return BASE_SPEND_PER_FAN + stadium.levels.shops * 4
}

export function homeAdvantageBonus(stadium: Stadium) {
  return stadium.levels.pitch * 0.03
}

/** Custo de manutenção por rodada. */
export function stadiumUpkeep(stadium: Stadium) {
  const totalLevels = Object.values(stadium.levels).reduce((sum, l) => sum + l, 0)
  return stadiumCapacity(stadium) * 2 + totalLevels * 10_000
}

export interface GateContext {
  reputation: number
  /** 1 = líder. */
  tablePosition: number
  totalTeams: number
}

export interface GateEstimate {
  demand: number
  attendance: number
  capacity: number
  ticketRevenue: number
  spendRevenue: number
  total: number
}

export function estimateGate(stadium: Stadium, ctx: GateContext, ticketPrice = stadium.ticketPrice): GateEstimate {
  const capacity = stadiumCapacity(stadium)
  const form = ctx.totalTeams > 1 ? 1 - (ctx.tablePosition - 1) / (ctx.totalTeams - 1) : 0.5
  const performance = 0.8 + 0.4 * form
  const priceFactor = Math.min(1.5, (idealTicketPrice(stadium) / ticketPrice) ** 2)
  const demand = Math.round(ctx.reputation * 500 * performance * priceFactor)
  const attendance = Math.min(capacity, demand)
  const ticketRevenue = attendance * ticketPrice
  const spendRevenue = attendance * spendPerFan(stadium)
  return { demand, attendance, capacity, ticketRevenue, spendRevenue, total: ticketRevenue + spendRevenue }
}

/** Preço do ingresso que maximiza a renda total de um jogo. */
export function bestTicketPrice(stadium: Stadium, ctx: GateContext) {
  let best = MIN_TICKET_PRICE
  let bestTotal = -1
  for (let price = MIN_TICKET_PRICE; price <= MAX_TICKET_PRICE; price++) {
    const total = estimateGate(stadium, ctx, price).total
    if (total > bestTotal) {
      bestTotal = total
      best = price
    }
  }
  return best
}

/** Ganho de renda por jogo (com preço ideal antes e depois) se a melhoria subir um nível. */
export function upgradeGateGain(stadium: Stadium, key: StadiumUpgradeKey, ctx: GateContext) {
  const upgraded: Stadium = { ...stadium, levels: { ...stadium.levels, [key]: stadium.levels[key] + 1 } }
  const before = estimateGate(stadium, ctx, bestTicketPrice(stadium, ctx)).total
  const after = estimateGate(upgraded, ctx, bestTicketPrice(upgraded, ctx)).total
  return after - before
}
