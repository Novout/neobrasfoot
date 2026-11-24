import type { Formation, Marking, Player, PlayStyle, Position, Tactic } from '../types/game'

export const FORMATIONS: Record<Formation, Record<Position, number>> = {
  '4-4-2': { GOL: 1, DEF: 4, MEI: 4, ATA: 2 },
  '4-3-3': { GOL: 1, DEF: 4, MEI: 3, ATA: 3 },
  '3-5-2': { GOL: 1, DEF: 3, MEI: 5, ATA: 2 },
  '5-3-2': { GOL: 1, DEF: 5, MEI: 3, ATA: 2 },
  '4-5-1': { GOL: 1, DEF: 4, MEI: 5, ATA: 1 },
}

/** attack multiplica as chances de marcar; defense multiplica as chances de sofrer. */
export const PLAY_STYLES: Record<PlayStyle, { label: string; attack: number; defense: number }> = {
  defensivo: { label: 'Defensivo', attack: 0.8, defense: 0.75 },
  equilibrado: { label: 'Equilibrado', attack: 1, defense: 1 },
  ofensivo: { label: 'Ofensivo', attack: 1.25, defense: 1.2 },
}

/**
 * Marcação: `concede` multiplica a chance de sofrer gol (como o `defense` do estilo), `cards` a de levar
 * cartão e `fouls` a de cometer falta (e, com ela, pênaltis contra).
 */
export const MARKINGS: Record<Marking, { label: string; concede: number; cards: number; fouls: number; hint: string }> = {
  leve: {
    label: 'Leve',
    concede: 1.1,
    cards: 0.55,
    fouls: 0.85,
    hint: 'Menos faltas e cartões, mas o adversário encontra mais espaço: mais chance de sofrer gol.',
  },
  media: { label: 'Média', concede: 1, cards: 1, fouls: 1, hint: 'Equilíbrio entre proteger o gol e evitar cartões.' },
  forte: {
    label: 'Forte',
    concede: 0.9,
    cards: 1.7,
    fouls: 1.2,
    hint: 'Menos chance de sofrer gol, mas mais faltas, cartões (e pênaltis contra).',
  },
}

export function markingOf(t: Pick<Tactic, 'marking'>): Marking {
  return t.marking ?? 'media'
}

export const POSITION_ORDER: Position[] = ['GOL', 'DEF', 'MEI', 'ATA']

/** Posição em que o jogador atua na escalação (a dele, se não foi improvisado). */
export function playingPosition(p: Pick<Player, 'position' | 'role'>): Position {
  return p.role ?? p.position
}

/**
 * Rendimento de um jogador fora da posição: vizinha (DEF↔MEI, MEI↔ATA) 85%, duas linhas (DEF↔ATA) 70%,
 * e goleiro na linha (ou jogador de linha no gol) só 40%.
 */
export function positionFit(natural: Position, role: Position) {
  if (natural === role) return 1
  if (natural === 'GOL' || role === 'GOL') return 0.4
  return Math.abs(POSITION_ORDER.indexOf(natural) - POSITION_ORDER.indexOf(role)) === 1 ? 0.85 : 0.7
}
