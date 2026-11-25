import type { DivisionId, JobOffer, Team } from '../types/game'
import { DIVISION_LABELS, divisionLevel, DIVISIONS, type TableZone } from './divisions'

export interface SeasonReview {
  position: number
  tableSize: number
  zone: TableZone
  /** Confrontos vencidos na Copa (5 = campeão). */
  cupWins: number
  cupChampion: boolean
  /** Nota da temporada: de -2 (desastre) a 5 (temporada histórica). */
  score: number
  headline: string
}

/** Nota da temporada do técnico, usada para decidir que clubes se interessam por ele. */
export function reviewSeason(
  division: DivisionId,
  position: number,
  tableSize: number,
  zone: TableZone,
  cupWins: number,
  cupChampion: boolean,
): SeasonReview {
  let score = 0
  let headline: string
  if (zone === 'champion') {
    score += 3
    headline = `Campeão da ${DIVISION_LABELS[division]}!`
  } else if (zone === 'promotion') {
    score += 2
    headline = `Acesso garantido em ${position}º lugar.`
  } else if (zone === 'relegation') {
    score -= 2
    headline = `Rebaixado em ${position}º lugar.`
  } else if (position <= tableSize / 2) {
    score += 1
    headline = `Boa campanha: ${position}º lugar.`
  } else {
    headline = `Temporada discreta: ${position}º lugar.`
  }
  if (cupChampion) {
    score += 2
    headline += ' E ainda levou a Copa do Brasil!'
  } else if (cupWins >= 3) {
    score += 1
    headline += ' Boa campanha na Copa.'
  }
  return { position, tableSize, zone, cupWins, cupChampion, score, headline }
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * Propostas de emprego para a próxima temporada.
 * Temporada boa atrai clubes da série de cima (os mais modestos dela); ruim, só da mesma série ou de baixo.
 * `divisionOf` dá a série de cada clube JÁ considerando acesso e rebaixamento.
 */
export function generateJobOffers(
  teams: Team[],
  currentTeamId: string,
  divisionOf: (teamId: string) => DivisionId,
  score: number,
): JobOffer[] {
  // A La Liga vale como a série mais alta: propostas de clubes do mesmo patamar (Série A ou La Liga).
  const base = divisionLevel(divisionOf(currentTeamId))
  const sameLevel = (teamId: string, division: DivisionId) => divisionLevel(divisionOf(teamId)) === divisionLevel(division)
  const at = (offset: number) => DIVISIONS[base + offset]
  const plan: { division: DivisionId | undefined; count: number; reason: string }[] =
    score >= 4
      ? [
          { division: at(-1), count: 2, reason: 'Quer um técnico vencedor para subir de patamar.' },
          { division: at(0), count: 2, reason: 'Impressionado com a sua temporada histórica.' },
        ]
      : score >= 2
        ? [
            { division: at(-1), count: 1, reason: 'Viu seu bom trabalho e aposta em você na série de cima.' },
            { division: at(0), count: 2, reason: 'Gostou do seu trabalho e quer você no comando.' },
          ]
        : score >= 0
          ? [
              { division: at(0), count: 2, reason: 'Busca um técnico para dar estabilidade ao clube.' },
              { division: at(1), count: 1, reason: 'Quer um técnico experiente para brigar pelo acesso.' },
            ]
          : [
              { division: at(0), count: 1, reason: 'Acredita que você merece uma nova chance.' },
              { division: at(1), count: 2, reason: 'Aposta em você para reconstruir o time.' },
            ]

  // Sem série acima (Série A) ou abaixo (Série D), a cota vai para a própria série.
  const sameDivision = plan.find((p) => p.division === at(0))
  for (const p of plan) {
    if (!p.division && sameDivision) {
      sameDivision.count += p.count
      p.count = 0
    }
  }

  const offers: JobOffer[] = []
  for (const { division, count, reason } of plan) {
    if (!division || count === 0) continue
    let pool = teams.filter((t) => t.id !== currentTeamId && sameLevel(t.id, division))
    // Na série de cima, só os clubes mais modestos arriscam num técnico vindo de baixo.
    if (DIVISIONS.indexOf(division) < base) {
      pool = [...pool].sort((a, b) => a.reputation - b.reputation).slice(0, Math.ceil(pool.length / 2))
    }
    for (const team of shuffle(pool).slice(0, count)) offers.push({ teamId: team.id, division: divisionOf(team.id), reason })
  }

  // Garantia: sempre há pelo menos duas opções além de ficar.
  if (offers.length < 2) {
    const extra = shuffle(teams.filter((t) => t.id !== currentTeamId && !offers.some((o) => o.teamId === t.id)))
      .filter((t) => Math.abs(divisionLevel(divisionOf(t.id)) - base) <= 1)
      .slice(0, 2 - offers.length)
    for (const t of extra) offers.push({ teamId: t.id, division: divisionOf(t.id), reason: 'Procura um novo técnico para a temporada.' })
  }
  return offers
}
