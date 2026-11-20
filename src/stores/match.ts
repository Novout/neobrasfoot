import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LiveMatch, Player } from '../types/game'
import { simulatePenalties } from '../data/cup'
import {
  DIRECT_RED_CHANCE, injuryChanceFor, isAvailable, pickCardedPlayer, pickInjuredPlayer, rollInjuryGames, SENT_OFF_PENALTY,
  YELLOW_CHANCE,
} from '../data/discipline'
import { persistRefs } from '../utils/storage'
import { useGameStore } from './game'
import { useTransferStore } from './transfers'

const MATCH_LENGTH = 90
const BASE_GOAL_CHANCE = 0.015
const SCORER_WEIGHT: Record<Player['position'], number> = { GOL: 0, DEF: 1, MEI: 3, ATA: 6 }

function pickScorer(starters: Player[]) {
  const total = starters.reduce((sum, p) => sum + SCORER_WEIGHT[p.position], 0)
  let roll = Math.random() * total
  for (const p of starters) {
    roll -= SCORER_WEIGHT[p.position]
    if (roll <= 0) return p
  }
  return starters[0]
}

function scorerInfo(starters: Player[] | undefined) {
  const scorer = pickScorer(starters ?? [])
  return { playerName: scorer?.name ?? 'Desconhecido', playerId: scorer?.id, star: scorer?.star ?? false }
}

function eventPlayer(p: Player) {
  return { playerName: p.name, playerId: p.id, star: p.star ?? false }
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

  // A rodada em andamento também é salva, para que recarregar a página não refaça o resultado.
  persistRefs('round', { matches, lineups, minute, tickMs }, 2)

  const isReady = computed(() => matches.value.length > 0)
  const isFinished = computed(() => minute.value >= MATCH_LENGTH)

  function setupRound() {
    const game = useGameStore()
    stop()
    minute.value = 0
    lineups.value = {}
    const competition = game.nextEvent ?? 'league'
    matches.value = game.currentFixtures.map((f, index) => {
      const home = game.teamStrength(f.homeId)
      const away = game.teamStrength(f.awayId)
      for (const id of [f.homeId, f.awayId]) {
        // Suspensos e lesionados nunca entram em campo, mesmo se marcados como titulares.
        lineups.value[id] = game.getTeam(id)!.players.filter((p) => p.starter && isAvailable(p)).map((p) => ({ ...p }))
      }
      return {
        id: `${competition}-${game.season}-${game.round}-${index}`,
        competition,
        penalties: null,
        homeId: f.homeId,
        awayId: f.awayId,
        homeGoals: 0,
        awayGoals: 0,
        homeAttack: home.attack * game.homeAdvantage(f.homeId),
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
        m.events.push({ minute: minute.value, teamId: m.homeId, type: 'gol', ...scorerInfo(lineups.value[m.homeId]) })
      }
      if (Math.random() < goalChance(m.awayAttack, m.homeDefense)) {
        m.awayGoals++
        m.events.push({ minute: minute.value, teamId: m.awayId, type: 'gol', ...scorerInfo(lineups.value[m.awayId]) })
      }
      rollDiscipline(m, 'home')
      rollDiscipline(m, 'away')
    }
    if (isFinished.value) {
      // Mata-mata não termina empatado: decide nos pênaltis ao apito final.
      for (const m of matches.value) {
        if (m.competition === 'cup' && m.homeGoals === m.awayGoals && !m.penalties) m.penalties = simulatePenalties()
      }
      stop()
    }
  }

  /** Tira o jogador de campo (expulso ou lesionado): não marca nem leva mais cartões. */
  function removeFromPitch(teamId: string, playerId: string) {
    lineups.value[teamId] = (lineups.value[teamId] ?? []).filter((p) => p.id !== playerId)
  }

  /** Cartões e lesões de um lado da partida neste minuto. */
  function rollDiscipline(m: LiveMatch, side: 'home' | 'away') {
    const teamId = side === 'home' ? m.homeId : m.awayId
    const onPitch = lineups.value[teamId] ?? []
    if (!onPitch.length) return
    const at = minute.value

    const sendOff = (p: Player, secondYellow: boolean) => {
      m.events.push({ minute: at, teamId, type: 'vermelho', secondYellow, ...eventPlayer(p) })
      removeFromPitch(teamId, p.id)
      // Com um a menos, o time perde força no ataque e na defesa até o fim.
      if (side === 'home') {
        m.homeAttack *= SENT_OFF_PENALTY
        m.homeDefense *= SENT_OFF_PENALTY
      } else {
        m.awayAttack *= SENT_OFF_PENALTY
        m.awayDefense *= SENT_OFF_PENALTY
      }
    }

    if (Math.random() < YELLOW_CHANCE) {
      const booked = new Set(m.events.filter((e) => e.type === 'amarelo' && e.teamId === teamId).map((e) => e.playerId!))
      const p = pickCardedPlayer(onPitch, booked)
      if (p) {
        const alreadyBooked = booked.has(p.id)
        m.events.push({ minute: at, teamId, type: 'amarelo', ...eventPlayer(p) })
        if (alreadyBooked) sendOff(p, true)
      }
    } else if (Math.random() < DIRECT_RED_CHANCE) {
      const p = pickCardedPlayer(onPitch)
      if (p) sendOff(p, false)
    }

    const current = lineups.value[teamId] ?? []
    const avgEnergy = current.reduce((sum, p) => sum + p.energy, 0) / Math.max(current.length, 1)
    if (current.length && Math.random() < injuryChanceFor(avgEnergy)) {
      const p = pickInjuredPlayer(current)
      if (p) {
        m.events.push({ minute: at, teamId, type: 'lesao', games: rollInjuryGames(), ...eventPlayer(p) })
        // Sai machucado; o substituto entra sem alterar a força (não há banco simulado).
        removeFromPitch(teamId, p.id)
      }
    }
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
    const wasLeague = matches.value[0]?.competition !== 'cup'
    useGameStore().applyRoundResults(matches.value)
    // Propostas de transferência chegam só após rodadas do campeonato (uma janela por rodada).
    if (wasLeague) useTransferStore().generateOffers()
    reset()
  }

  function reset() {
    stop()
    matches.value = []
    lineups.value = {}
    minute.value = 0
  }

  return {
    matches, minute, running, tickMs, isReady, isFinished,
    setupRound, start, stop, setSpeed, simulateToEnd, confirmRound, reset,
  }
})
