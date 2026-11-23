import type { DivisionId, LiveMatch } from '../types/game'
import { formatMoney } from '../utils/random'
import { DIVISIONS } from './divisions'

/** Tipos de manchete do giro da rodada. */
export type HeadlineKind = 'goleada' | 'zebra' | 'venda' | 'emprestimo'

export interface Headline {
  id: string
  kind: HeadlineKind
  season: number
  /** Rodada do campeonato (as da Copa ficam na rodada do campeonato em que aconteceram). */
  round: number
  /** De onde veio: "Série A", "Copa · Quartas", "Mercado". */
  context: string
  title: string
  text: string
  /** Clubes envolvidos (para destacar quando um deles é o seu). */
  teamIds: string[]
}

export const HEADLINE_ICONS: Record<HeadlineKind, string> = { goleada: '⚽', zebra: '🦓', venda: '💰', emprestimo: '🔁' }
export const HEADLINE_LABELS: Record<HeadlineKind, string> = { goleada: 'Goleada', zebra: 'Zebra', venda: 'Venda', emprestimo: 'Empréstimo' }

/** Diferença mínima de gols para ser goleada. */
export const ROUT_MARGIN = 4
/** Na liga, o vencedor precisa ser pelo menos esse tanto mais fraco que o perdedor para ser zebra. */
export const UPSET_GAP = 0.12
/** Valor a partir do qual uma venda vira notícia. */
export const EXPENSIVE_SALE = 700_000
/** Valor de mercado a partir do qual um empréstimo vira notícia. */
export const EXPENSIVE_LOAN_VALUE = 700_000
/** Máximo de manchetes de jogos por rodada (as maiores goleadas e zebras primeiro). */
export const MAX_MATCH_HEADLINES = 3
/** Quantas manchetes ficam guardadas no save. */
export const MAX_HEADLINES = 60

export interface MatchHeadlineContext {
  season: number
  round: number
  /** "Série A", "Copa · Oitavas"... */
  context: (m: LiveMatch) => string
  teamName: (id: string) => string
  division: (id: string) => DivisionId | undefined
  /** Vencedor do jogo (na Copa pode ser nos pênaltis). */
  winnerId?: (m: LiveMatch) => string | null
}

const strength = (atk: number, def: number) => (atk + def) / 2
const score = (m: LiveMatch) => `${m.homeGoals} x ${m.awayGoals}${m.penalties ? ` (pên. ${m.penalties.home} x ${m.penalties.away})` : ''}`

/** Quão zebra foi o resultado: 0 = não foi; quanto maior, mais surpreendente. */
export function upsetSize(m: LiveMatch, winnerId: string | null, division: (id: string) => DivisionId | undefined): number {
  if (!winnerId) return 0
  const loserId = winnerId === m.homeId ? m.awayId : m.homeId
  const [wd, ld] = [division(winnerId), division(loserId)]
  // Clube de série abaixo eliminando um de cima (Copa): zebra, maior quanto mais séries de diferença.
  const levels = wd && ld ? DIVISIONS.indexOf(wd) - DIVISIONS.indexOf(ld) : 0
  if (levels > 0) return levels
  if (levels < 0) return 0
  const home = strength(m.homeAttack, m.homeDefense)
  const away = strength(m.awayAttack, m.awayDefense)
  const [w, l] = winnerId === m.homeId ? [home, away] : [away, home]
  const gap = l / Math.max(w, 1) - 1
  return gap >= UPSET_GAP ? gap : 0
}

/** Manchetes dos jogos de uma rodada: as maiores goleadas e zebras. */
export function matchHeadlines(matches: LiveMatch[], ctx: MatchHeadlineContext): Headline[] {
  const found: (Headline & { weight: number })[] = []
  for (const m of matches) {
    const diff = m.homeGoals - m.awayGoals
    const winnerId = ctx.winnerId?.(m) ?? (diff > 0 ? m.homeId : diff < 0 ? m.awayId : null)
    const loserId = winnerId === m.homeId ? m.awayId : m.homeId
    const winner = winnerId ? ctx.teamName(winnerId) : ''
    const loser = ctx.teamName(loserId)
    const base = { season: ctx.season, round: ctx.round, context: ctx.context(m), teamIds: [m.homeId, m.awayId] }
    const upset = upsetSize(m, winnerId, ctx.division)
    if (upset > 0) {
      const divisionUpset = ctx.division(winnerId!) !== ctx.division(loserId)
      found.push({
        ...base,
        id: `${m.id}-zebra`,
        kind: 'zebra',
        title: divisionUpset ? `${winner} elimina o ${loser}` : `Zebra: ${winner} surpreende o ${loser}`,
        text: `${ctx.teamName(m.homeId)} ${score(m)} ${ctx.teamName(m.awayId)}.${divisionUpset ? ' O time de série abaixo despacha o favorito.' : ' Ninguém apostava nesse resultado.'}`,
        // Zebras de séries diferentes valem mais que a diferença de força dentro da série.
        weight: 2 + upset * 10,
      })
    } else if (Math.abs(diff) >= ROUT_MARGIN) {
      found.push({
        ...base,
        id: `${m.id}-goleada`,
        kind: 'goleada',
        title: `${winner} atropela o ${loser}`,
        text: `Goleada de ${Math.max(m.homeGoals, m.awayGoals)} x ${Math.min(m.homeGoals, m.awayGoals)}: ${ctx.teamName(m.homeId)} ${score(m)} ${ctx.teamName(m.awayId)}.`,
        weight: Math.abs(diff) + Math.max(m.homeGoals, m.awayGoals) / 10,
      })
    }
  }
  return found
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_MATCH_HEADLINES)
    .map(({ weight: _w, ...h }) => h)
}

export interface TransferHeadlineInput {
  season: number
  round: number
  playerName: string
  overall: number
  fromName: string
  toName: string
  fromTeamId: string
  toTeamId: string
}

/** Manchete de venda, ou null se o valor não chama atenção. */
export function saleHeadline(input: TransferHeadlineInput & { fee: number }): Headline | null {
  if (input.fee < EXPENSIVE_SALE) return null
  return {
    id: `venda-${input.season}-${input.round}-${input.playerName}-${input.toTeamId}`,
    kind: 'venda',
    season: input.season,
    round: input.round,
    context: 'Mercado',
    title: `${input.toName} paga ${formatMoney(input.fee)} por ${input.playerName}`,
    text: `O ${input.fromName} vende ${input.playerName} (OVR ${input.overall}) ao ${input.toName}.`,
    teamIds: [input.fromTeamId, input.toTeamId],
  }
}

/** Manchete de empréstimo, ou null se o jogador não é caro. */
export function loanHeadline(input: TransferHeadlineInput & { value: number; fee: number; rounds: number }): Headline | null {
  if (input.value < EXPENSIVE_LOAN_VALUE) return null
  return {
    id: `emprestimo-${input.season}-${input.round}-${input.playerName}-${input.toTeamId}`,
    kind: 'emprestimo',
    season: input.season,
    round: input.round,
    context: 'Mercado',
    title: `${input.playerName} é emprestado ao ${input.toName}`,
    text: `Avaliado em ${formatMoney(input.value)}, ${input.playerName} (OVR ${input.overall}) deixa o ${input.fromName} por ${input.rounds} rodada${input.rounds > 1 ? 's' : ''} (taxa de ${formatMoney(input.fee)}).`,
    teamIds: [input.fromTeamId, input.toTeamId],
  }
}
