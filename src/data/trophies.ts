import type { Manager, Team, Trophy } from '../types/game'
import { createRng, hashString } from '../utils/random'
import { DIVISION_LABELS } from './divisions'

export const PLAYER_MANAGER_ID = 'tecnico-jogador'

/** Pontos de cada conquista no ranking de técnicos. */
export const TROPHY_POINTS = { A: 10, B: 6, C: 4, D: 3, cup: 8 } as const

export function trophyKey(t: Trophy): keyof typeof TROPHY_POINTS {
  return t.kind === 'cup' ? 'cup' : (t.division ?? 'D')
}

export function trophyPoints(t: Trophy) {
  return TROPHY_POINTS[trophyKey(t)]
}

export function trophyLabel(t: Trophy) {
  return t.kind === 'cup' ? 'Copa do Brasil' : `Campeão da ${DIVISION_LABELS[t.division ?? 'D']}`
}

/** Ícone e cor da taça na prateleira. */
export const TROPHY_STYLE: Record<keyof typeof TROPHY_POINTS, { icon: string; color: string; name: string }> = {
  A: { icon: '🏆', color: '#fbbf24', name: 'Série A' },
  cup: { icon: '🏆', color: '#60a5fa', name: 'Copa do Brasil' },
  B: { icon: '🥈', color: '#cbd5e1', name: 'Série B' },
  C: { icon: '🥉', color: '#d97706', name: 'Série C' },
  D: { icon: '🎖️', color: '#a3a3a3', name: 'Série D' },
}

const FIRST = ['Adilson', 'Brás', 'Cláudio', 'Dorival', 'Evaristo', 'Fabiano', 'Geraldo', 'Hélio', 'Ivo', 'Jairo',
  'Lauro', 'Moacir', 'Nelson', 'Osmar', 'Péricles', 'Rubens', 'Silvano', 'Telmo', 'Valdir', 'Wanderlei',
  'Abel', 'Celso', 'Edson', 'Gilmar', 'Júlio', 'Luiz', 'Milton', 'Otacílio', 'Renato', 'Sebastião']
const LAST = ['Antunes', 'Bragança', 'Coutinho', 'Damasceno', 'Esteves', 'Fontoura', 'Guimarães', 'Henriques',
  'Lacerda', 'Meireles', 'Nogueira', 'Pacheco', 'Quintela', 'Rezende', 'Salgado', 'Tavares', 'Valadares', 'Xavier']

/** Técnicos da liga: um por clube da IA, mais o jogador. Nomes fixos por clube. */
export function createManagers(teams: Team[], playerTeamId: string, playerName: string): Manager[] {
  const used = new Set<string>()
  const ai = teams
    .filter((t) => t.id !== playerTeamId)
    .map((t) => {
      const rng = createRng(hashString(`tecnico-${t.id}`))
      let name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`
      while (used.has(name)) name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`
      used.add(name)
      return { id: `tecnico-${t.id}`, name, teamId: t.id, isPlayer: false, trophies: [] as Trophy[] }
    })
  return [{ id: PLAYER_MANAGER_ID, name: playerName, teamId: playerTeamId, isPlayer: true, trophies: [] }, ...ai]
}

export interface RankingRow {
  manager: Manager
  points: number
  counts: Record<keyof typeof TROPHY_POINTS, number>
  total: number
}

export function managerRanking(managers: Manager[]): RankingRow[] {
  return managers
    .map((manager) => {
      const counts = { A: 0, B: 0, C: 0, D: 0, cup: 0 }
      for (const t of manager.trophies) counts[trophyKey(t)]++
      return {
        manager,
        counts,
        total: manager.trophies.length,
        points: manager.trophies.reduce((sum, t) => sum + trophyPoints(t), 0),
      }
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.counts.A - a.counts.A ||
        b.counts.cup - a.counts.cup ||
        b.total - a.total ||
        Number(b.manager.isPlayer) - Number(a.manager.isPlayer) ||
        a.manager.name.localeCompare(b.manager.name),
    )
}
