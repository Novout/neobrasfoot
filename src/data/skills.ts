import type { Player, Position } from '../types/game'
import { createRng, hashString } from '../utils/random'

type Rng = ReturnType<typeof createRng>

/**
 * Habilidades: cada jogador tem 2, sorteadas de uma lista exclusiva da posição dele.
 * Os efeitos são pequenos e somam no time (só de quem está em campo).
 */

export type SkillId =
  // Goleiro
  | 'colocacao' | 'reflexos' | 'pegador-de-penaltis' | 'tiro-de-meta' | 'saida-do-gol'
  // Defensor
  | 'desarme' | 'marcacao' | 'cabeceio-defensivo' | 'jogo-limpo' | 'apoio-ao-ataque'
  // Meio-campo
  | 'passe' | 'visao-de-jogo' | 'chute-de-longe' | 'folego' | 'bola-parada'
  // Atacante
  | 'finalizacao' | 'cabeceio' | 'velocidade' | 'drible' | 'cobrador-de-penaltis'

export interface SkillDef {
  id: SkillId
  position: Position
  label: string
  icon: string
  description: string
  /** Bônus na força de ataque/defesa do time (0.03 = +3%). */
  attack?: number
  defense?: number
  /** Multiplica a chance de o jogador ser o autor de um gol. */
  scorer?: number
  /** Multiplica a chance de o jogador levar cartão. */
  cards?: number
  /** Multiplica a energia gasta em campo. */
  energy?: number
  /** Faltas: negativo = o time comete menos; `foulsDrawn` = o adversário comete mais. */
  fouls?: number
  foulsDrawn?: number
  /** Disputa de pênaltis: aumenta a conversão do time / reduz a do adversário. */
  penaltyTaking?: number
  penaltySaving?: number
}

const list: SkillDef[] = [
  // Goleiro
  { id: 'colocacao', position: 'GOL', label: 'Colocação', icon: '📐', description: 'Bem posicionado, fecha o ângulo: defesa do time +3%.', defense: 0.03 },
  { id: 'reflexos', position: 'GOL', label: 'Reflexos', icon: '⚡', description: 'Defesas difíceis à queima-roupa: defesa do time +3%.', defense: 0.03 },
  { id: 'pegador-de-penaltis', position: 'GOL', label: 'Pegador de pênaltis', icon: '🧤', description: 'Nas disputas de pênaltis, o adversário converte bem menos.', penaltySaving: 0.1 },
  { id: 'tiro-de-meta', position: 'GOL', label: 'Tiro de meta', icon: '🦶', description: 'Reposição longa e precisa que inicia contra-ataques: ataque do time +2%.', attack: 0.02 },
  { id: 'saida-do-gol', position: 'GOL', label: 'Saída do gol', icon: '🏃', description: 'Corta cruzamentos e sai nos pés do atacante: defesa do time +2%.', defense: 0.02 },
  // Defensor
  { id: 'desarme', position: 'DEF', label: 'Desarme', icon: '🛡️', description: 'Rouba a bola limpo: defesa do time +2,5%.', defense: 0.025 },
  { id: 'marcacao', position: 'DEF', label: 'Marcação', icon: '🔒', description: 'Não desgruda do atacante: defesa do time +2,5%.', defense: 0.025 },
  { id: 'cabeceio-defensivo', position: 'DEF', label: 'Cabeceio', icon: '🗿', description: 'Ganha pelo alto: defesa +1% e muito mais gols de bola parada.', defense: 0.01, scorer: 3 },
  { id: 'jogo-limpo', position: 'DEF', label: 'Jogo limpo', icon: '🤝', description: 'Marca sem falta: leva 60% menos cartões e o time comete menos faltas.', cards: 0.4, fouls: -0.06 },
  { id: 'apoio-ao-ataque', position: 'DEF', label: 'Apoio ao ataque', icon: '↗️', description: 'Lateral que chega à frente: ataque do time +2%.', attack: 0.02, scorer: 1.5 },
  // Meio-campo
  { id: 'passe', position: 'MEI', label: 'Passe', icon: '🎯', description: 'Passes precisos: ataque do time +2,5%.', attack: 0.025 },
  { id: 'visao-de-jogo', position: 'MEI', label: 'Visão de jogo', icon: '👁️', description: 'Enxerga o passe decisivo: ataque do time +2,5%.', attack: 0.025 },
  { id: 'chute-de-longe', position: 'MEI', label: 'Chute de longe', icon: '💥', description: 'Arrisca de fora da área: ataque +1% e o dobro de chance de marcar.', attack: 0.01, scorer: 2 },
  { id: 'folego', position: 'MEI', label: 'Fôlego', icon: '🫁', description: 'Corre o jogo todo: gasta 30% menos energia em campo.', energy: 0.7 },
  { id: 'bola-parada', position: 'MEI', label: 'Bola parada', icon: '🚩', description: 'Faltas e escanteios perigosos: ataque +1,5% e mais pênaltis convertidos.', attack: 0.015, penaltyTaking: 0.03 },
  // Atacante
  { id: 'finalizacao', position: 'ATA', label: 'Finalização', icon: '⚽', description: 'Não perdoa: ataque do time +3% e mais gols dele.', attack: 0.03, scorer: 1.5 },
  { id: 'cabeceio', position: 'ATA', label: 'Cabeceio', icon: '🎈', description: 'Forte pelo alto: ataque +1,5% e mais gols de cabeça.', attack: 0.015, scorer: 1.5 },
  { id: 'velocidade', position: 'ATA', label: 'Velocidade', icon: '💨', description: 'Ganha na corrida: ataque do time +2,5%.', attack: 0.025 },
  { id: 'drible', position: 'ATA', label: 'Drible', icon: '🌀', description: 'Passa pelo marcador: ataque +2% e sofre mais faltas.', attack: 0.02, foulsDrawn: 0.08 },
  { id: 'cobrador-de-penaltis', position: 'ATA', label: 'Cobrador de pênaltis', icon: '🥅', description: 'Frio na marca da cal: o time converte mais nas disputas de pênaltis.', penaltyTaking: 0.05 },
]

export const SKILLS = Object.fromEntries(list.map((s) => [s.id, s])) as Record<SkillId, SkillDef>
export const SKILLS_BY_POSITION: Record<Position, SkillId[]> = {
  GOL: list.filter((s) => s.position === 'GOL').map((s) => s.id),
  DEF: list.filter((s) => s.position === 'DEF').map((s) => s.id),
  MEI: list.filter((s) => s.position === 'MEI').map((s) => s.id),
  ATA: list.filter((s) => s.position === 'ATA').map((s) => s.id),
}
export const SKILLS_PER_PLAYER = 2

/** Sorteia 2 habilidades diferentes da lista da posição. */
export function rollSkills(position: Position, rng: Rng): SkillId[] {
  const pool = [...SKILLS_BY_POSITION[position]]
  const chosen: SkillId[] = []
  while (chosen.length < SKILLS_PER_PLAYER && pool.length) chosen.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!)
  return chosen
}

/** Sorteio fixo por jogador: saves antigos e jogadores sem habilidades recebem sempre as mesmas. */
export function defaultSkills(id: string, position: Position) {
  return rollSkills(position, createRng(hashString(`${id}:habilidades`)))
}

/** Habilidades válidas do jogador (2, da lista da posição dele). */
export function playerSkills(p: Pick<Player, 'id' | 'position' | 'skills'>): SkillId[] {
  const valid = (p.skills ?? []).filter((s, i, all) => SKILLS[s]?.position === p.position && all.indexOf(s) === i)
  return valid.length === SKILLS_PER_PLAYER ? valid : defaultSkills(p.id, p.position)
}

export function isValidSkillFor(position: Position, skill: unknown): skill is SkillId {
  return typeof skill === 'string' && SKILLS[skill as SkillId]?.position === position
}

const skillsOn = (players: Pick<Player, 'id' | 'position' | 'skills'>[]) => players.flatMap((p) => playerSkills(p).map((s) => SKILLS[s]))
const sum = (defs: SkillDef[], key: 'attack' | 'defense' | 'fouls' | 'foulsDrawn' | 'penaltyTaking' | 'penaltySaving') =>
  defs.reduce((total, d) => total + (d[key] ?? 0), 0)

/** Escalação de referência (1-4-4-2) para calcular o bônus de um time "médio". */
const REFERENCE_LINEUP: Record<Position, number> = { GOL: 1, DEF: 4, MEI: 4, ATA: 2 }

/** Bônus esperado de um time com habilidades médias: cada jogador tem 2 das 5 da posição. */
function expectedBonus(key: 'attack' | 'defense') {
  return (Object.keys(REFERENCE_LINEUP) as Position[]).reduce((total, pos) => {
    const pool = SKILLS_BY_POSITION[pos].map((id) => SKILLS[id][key] ?? 0)
    const mean = pool.reduce((a, b) => a + b, 0) / pool.length
    return total + REFERENCE_LINEUP[pos] * SKILLS_PER_PLAYER * mean
  }, 0)
}
const EXPECTED = { attack: expectedBonus('attack'), defense: expectedBonus('defense') }

/**
 * Multiplicadores de ataque e defesa que as habilidades de quem está em campo dão ao time.
 * Relativos a um time médio (= 1): habilidades acima da média reforçam, abaixo enfraquecem,
 * sem mudar o equilíbrio geral de gols do jogo.
 */
export function teamSkillBonus(onPitch: Pick<Player, 'id' | 'position' | 'skills'>[]) {
  const defs = skillsOn(onPitch)
  return {
    attack: (1 + sum(defs, 'attack')) / (1 + EXPECTED.attack),
    defense: (1 + sum(defs, 'defense')) / (1 + EXPECTED.defense),
  }
}

/** Fator das faltas cometidas por um time: jogo limpo diminui, dribladores do adversário aumentam. */
export function foulFactor(team: Pick<Player, 'id' | 'position' | 'skills'>[], opponent: Pick<Player, 'id' | 'position' | 'skills'>[]) {
  return Math.max(0.5, 1 + sum(skillsOn(team), 'fouls') + sum(skillsOn(opponent), 'foulsDrawn'))
}

/** Peso do jogador no sorteio de quem faz o gol / de quem leva cartão. */
export function scorerFactor(p: Pick<Player, 'id' | 'position' | 'skills'>) {
  return playerSkills(p).reduce((f, s) => f * (SKILLS[s].scorer ?? 1), 1)
}
export function cardFactor(p: Pick<Player, 'id' | 'position' | 'skills'>) {
  return playerSkills(p).reduce((f, s) => f * (SKILLS[s].cards ?? 1), 1)
}
export function energyFactor(p: Pick<Player, 'id' | 'position' | 'skills'>) {
  return playerSkills(p).reduce((f, s) => f * (SKILLS[s].energy ?? 1), 1)
}

export const BASE_PENALTY_CONVERSION = 0.75

/** Conversão de cada lado numa disputa de pênaltis: cobradores do time contra o goleiro adversário. */
export function penaltyConversion(takers: Pick<Player, 'id' | 'position' | 'skills'>[], keepers: Pick<Player, 'id' | 'position' | 'skills'>[]) {
  const goalkeeper = keepers.filter((p) => p.position === 'GOL')
  const conversion = BASE_PENALTY_CONVERSION + sum(skillsOn(takers), 'penaltyTaking') - sum(skillsOn(goalkeeper), 'penaltySaving')
  return Math.max(0.5, Math.min(0.92, conversion))
}
