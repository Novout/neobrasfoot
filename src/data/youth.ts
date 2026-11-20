import type { Player, Position, Team } from '../types/game'
import { createRng } from '../utils/random'
import { MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL } from './divisions'
import { STAR_CHANCE, STAR_OVERALL_BOOST } from './stars'
import { buildPlayer, randomPlayerName, SQUAD_TEMPLATE } from './teams'

type Rng = ReturnType<typeof createRng>

/** Composição mínima por posição que a base repõe a cada temporada. */
const TARGET_BY_POSITION: Record<Position, number> = SQUAD_TEMPLATE.reduce(
  (acc, pos) => ({ ...acc, [pos]: (acc[pos] ?? 0) + 1 }),
  {} as Record<Position, number>,
)

/** Chance de pendurar as chuteiras ao fim da temporada, pela idade já atualizada. */
export function retirementChance(age: number) {
  if (age < 34) return 0
  if (age === 34) return 0.2
  if (age === 35) return 0.35
  if (age === 36) return 0.55
  if (age === 37) return 0.75
  return 1
}

/**
 * Evolução anual pela idade: jovens crescem rápido, auge estável, veteranos caem.
 * Valores médios por temporada: ≤21 +3, 22–24 +1,5, 25–29 0, 30–31 −1, 32+ −2,5.
 */
export function seasonProgression(age: number, rng: Rng) {
  if (age <= 21) return rng.int(2, 4)
  if (age <= 24) return rng.int(1, 2)
  if (age <= 29) return rng.int(-1, 1)
  if (age <= 31) return rng.int(-2, 0)
  return rng.int(-3, -2)
}

export function applyProgression(player: Player, rng: Rng) {
  player.overall = Math.max(MIN_PLAYER_OVERALL, Math.min(MAX_PLAYER_OVERALL, player.overall + seasonProgression(player.age, rng)))
}

/**
 * Jovem da base: 17 a 19 anos, abaixo do nível do clube hoje (ele cresce com as temporadas).
 * Também pode nascer estrela, com a mesma chance da geração normal.
 */
export function createYouthPlayer(team: Team, position: Position, id: string, rng: Rng): Player {
  const star = rng.next() < STAR_CHANCE
  const overall = team.reputation - 12 + rng.int(-4, 5) + (star ? STAR_OVERALL_BOOST : 0)
  const player = buildPlayer({ name: randomPlayerName(rng), position, age: rng.int(17, 19), overall, star }, id, 70)
  return player
}

/** Jovens que a base sobe por temporada; vagas além disso são preenchidas com jogadores sem clube. */
export const YOUTH_PER_SEASON = 3

/** Jogador sem clube contratado para completar o elenco: idade variada, já no nível do clube. */
export function createFreeAgent(team: Team, position: Position, id: string, rng: Rng): Player {
  const star = rng.next() < STAR_CHANCE
  const overall = team.reputation + rng.int(-8, 4) + (star ? STAR_OVERALL_BOOST : 0)
  return buildPlayer({ name: randomPlayerName(rng), position, age: rng.int(22, 31), overall, star }, id, 70)
}

export interface SquadRenewal {
  retired: Player[]
  promoted: Player[]
  signed: Player[]
}

/**
 * Fim de temporada num elenco: aposentadorias e reposição pela base, mantendo
 * ao menos a composição padrão por posição (3 GOL, 7 DEF, 7 MEI, 5 ATA).
 */
export function renewSquad(team: Team, season: number, rng: Rng): SquadRenewal {
  const retired = team.players.filter((p) => rng.next() < retirementChance(p.age))
  team.players = team.players.filter((p) => !retired.includes(p))

  const promoted: Player[] = []
  const signed: Player[] = []
  // Vagas em ordem aleatória, para a base não favorecer sempre a mesma posição.
  const gaps = (Object.keys(TARGET_BY_POSITION) as Position[])
    .flatMap((position) => {
      const missing = TARGET_BY_POSITION[position] - team.players.filter((p) => p.position === position).length
      return Array.from({ length: Math.max(0, missing) }, () => position)
    })
    .sort(() => rng.next() - 0.5)
  gaps.forEach((position, i) => {
    const id = `${team.id}-s${season}-${i}`
    // Poucos jovens por ano evitam que o elenco inteiro tenha a mesma idade (e se aposente junto).
    if (i < YOUTH_PER_SEASON) promoted.push(createYouthPlayer(team, position, `${id}-base`, rng))
    else signed.push(createFreeAgent(team, position, id, rng))
  })
  team.players.push(...promoted, ...signed)
  return { retired, promoted, signed }
}
