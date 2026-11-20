import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LiveMatch, Player } from '../types/game'
import { useGameStore } from './game'

const MATCH_LENGTH = 90
const BASE_GOAL_CHANCE = 0.015
const HOME_ADVANTAGE = 1.1
const SCORER_WEIGHT: Record<Player['position'], number> = { GOL: 0, DEF: 1, MEI: 3, ATA: 6 }

function pickScorer(starters: Player[]) {
  const total = starters.reduce((sum, p) => sum + SCORER_WEIGHT[p.position], 0)
  let roll = Math.random() * total
  for (const p of starters) {
    roll -= SCORER_WEIGHT[p.position]
    if (roll <= 0) return p.name
  }
  return starters[0]?.name ?? 'Desconhecido'
}

function goalChance(attack: number, defense: number) {
  return BASE_GOAL_CHANCE * (attack / Math.max(defense, 1)) ** 2
}

export const useMatchStore = defineStore('match', () => {
  const matches = ref<LiveMatch[]>([])
  const lineups = ref<Record<string, Player[]>>({})
  const minute = ref(0)
  const running = ref(false)
  const tickMs = ref(250)
  let timer: ReturnType<typeof setInterval> | null = null

  const isReady = computed(() => matches.value.length > 0)
  const isFinished = computed(() => minute.value >= MATCH_LENGTH)

  function setupRound() {
    const game = useGameStore()
    stop()
    minute.value = 0
    lineups.value = {}
    matches.value = game.currentFixtures.map((f, index) => {
      const home = game.teamStrength(f.homeId)
      const away = game.teamStrength(f.awayId)
      for (const id of [f.homeId, f.awayId]) {
        lineups.value[id] = game.getTeam(id)!.players.filter((p) => p.starter).map((p) => ({ ...p }))
      }
      return {
        id: `r${game.round}-${index}`,
        homeId: f.homeId,
        awayId: f.awayId,
        homeGoals: 0,
        awayGoals: 0,
        homeAttack: home.attack * HOME_ADVANTAGE,
        homeDefense: home.defense,
        awayAttack: away.attack,
        awayDefense: away.defense,
        events: [],
      }
    })
  }

  function tick() {
    if (isFinished.value) {
      stop()
      return
    }
    minute.value++
    for (const m of matches.value) {
      if (Math.random() < goalChance(m.homeAttack, m.awayDefense)) {
        m.homeGoals++
        m.events.push({ minute: minute.value, teamId: m.homeId, type: 'gol', playerName: pickScorer(lineups.value[m.homeId] ?? []) })
      }
      if (Math.random() < goalChance(m.awayAttack, m.homeDefense)) {
        m.awayGoals++
        m.events.push({ minute: minute.value, teamId: m.awayId, type: 'gol', playerName: pickScorer(lineups.value[m.awayId] ?? []) })
      }
    }
    if (isFinished.value) stop()
  }

  function start() {
    if (running.value || isFinished.value || !isReady.value) return
    running.value = true
    timer = setInterval(tick, tickMs.value)
  }

  function stop() {
    running.value = false
    if (timer) clearInterval(timer)
    timer = null
  }

  function setSpeed(ms: number) {
    tickMs.value = ms
    if (running.value) {
      stop()
      start()
    }
  }

  function simulateToEnd() {
    stop()
    while (!isFinished.value) tick()
  }

  /** Aplica os resultados na carreira e limpa a rodada. */
  function confirmRound() {
    if (!isFinished.value) return
    useGameStore().applyRoundResults(matches.value)
    matches.value = []
    lineups.value = {}
    minute.value = 0
  }

  return {
    matches, minute, running, tickMs, isReady, isFinished,
    setupRound, start, stop, setSpeed, simulateToEnd, confirmRound,
  }
})
