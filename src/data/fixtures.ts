import type { Fixture } from '../types/game'

const BYE = '__folga__'

/** Gera tabela em turno e returno pelo método do círculo. */
export function generateFixtures(teamIds: string[]): Fixture[][] {
  const ids = [...teamIds]
  if (ids.length % 2 !== 0) ids.push(BYE)
  const n = ids.length
  const firstLeg: Fixture[][] = []

  for (let round = 0; round < n - 1; round++) {
    const games: Fixture[] = []
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]!
      const b = ids[n - 1 - i]!
      if (a === BYE || b === BYE) continue
      games.push(round % 2 === 0 ? { homeId: a, awayId: b } : { homeId: b, awayId: a })
    }
    firstLeg.push(games)
    ids.splice(1, 0, ids.pop()!)
  }

  const secondLeg = firstLeg.map((games) => games.map((g) => ({ homeId: g.awayId, awayId: g.homeId })))
  return [...firstLeg, ...secondLeg]
}
