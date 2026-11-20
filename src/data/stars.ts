/** Chance de um jogador gerado nascer estrela (~20 em toda a liga, menos de 1 por clube). */
export const STAR_CHANCE = 0.03
/** Pontos de OVR a mais que uma estrela recebe ao ser gerada. */
export const STAR_OVERALL_BOOST = 6
/** Fração da energia normal que uma estrela gasta em jogos e treinos. */
export const STAR_ENERGY_FACTOR = 0.5
/** Estrelas valem e ganham mais. */
export const STAR_VALUE_FACTOR = 1.3
export const STAR_SALARY_FACTOR = 1.3

export function starBoost(star: boolean | undefined) {
  return star ? STAR_OVERALL_BOOST : 0
}

/** Energia gasta por um esforço, já reduzida para estrelas. */
export function energyCost(base: number, star: boolean | undefined) {
  return star ? Math.round(base * STAR_ENERGY_FACTOR) : base
}
