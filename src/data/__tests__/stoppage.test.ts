import { describe, expect, it } from 'vitest'
import { addedTime, clockLabel, type HalfStoppages } from '../stoppage'

const calm: HalfStoppages = { fouls: 6, cards: 0, injuries: 0, goals: 0, subs: 0 }

describe('acréscimos', () => {
  it('mais faltas, mais acréscimos', () => {
    const few = addedTime(2, calm, 0.5)
    const many = addedTime(2, { ...calm, fouls: 30 }, 0.5)
    expect(many).toBeGreaterThan(few)
  })

  it('cartões, lesões, gols e trocas também atrasam o jogo', () => {
    const base = addedTime(2, calm, 0.5)
    expect(addedTime(2, { ...calm, injuries: 2 }, 0.5)).toBeGreaterThan(base)
    expect(addedTime(2, { ...calm, cards: 3, goals: 3, subs: 4 }, 0.5)).toBeGreaterThan(base)
  })

  it('respeita os limites de cada tempo', () => {
    const none: HalfStoppages = { fouls: 0, cards: 0, injuries: 0, goals: 0, subs: 0 }
    const chaos: HalfStoppages = { fouls: 80, cards: 10, injuries: 5, goals: 8, subs: 6 }
    expect(addedTime(1, none, 0)).toBe(1)
    expect(addedTime(2, none, 0)).toBe(2)
    expect(addedTime(1, chaos, 1)).toBe(6)
    expect(addedTime(2, chaos, 1)).toBe(10)
  })

  it('formata o relógio com os acréscimos', () => {
    expect(clockLabel(30)).toBe("30'")
    expect(clockLabel(45, 2)).toBe("45+2'")
    expect(clockLabel(90, 0)).toBe("90'")
  })
})
