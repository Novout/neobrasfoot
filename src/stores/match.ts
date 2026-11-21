import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LiveMatch, Player } from '../types/game'
import { simulatePenalties } from '../data/cup'
import { energyCost } from '../data/stars'
import { playingPosition } from '../data/tactics'
import {
  DIRECT_RED_CHANCE, injuryChanceFor, isAvailable, pickCardedPlayer, pickInjuredPlayer, rollInjuryGames, SENT_OFF_PENALTY,
  YELLOW_CHANCE,
} from '../data/discipline'
import { persistRefs } from '../utils/storage'
import { effectiveRating, FORMATION_MISMATCH_PENALTY, lineupStrength, useGameStore } from './game'
import { useTransferStore } from './transfers'

const MATCH_LENGTH = 90
const HALFTIME_MINUTE = 45
export const MAX_SUBSTITUTIONS = 3
const BASE_GOAL_CHANCE = 0.015
const SCORER_WEIGHT: Record<Player['position'], number> = { GOL: 0, DEF: 1, MEI: 3, ATA: 6 }

function pickScorer(starters: Player[]) {
  const total = starters.reduce((sum, p) => sum + SCORER_WEIGHT[playingPosition(p)], 0)
  let roll = Math.random() * total
  for (const p of starters) {
    roll -= SCORER_WEIGHT[playingPosition(p)]
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

  /** Intervalo em andamento: o jogo do seu time parou aos 45' para substituições. */
  const halftime = ref(false)
  /** O intervalo desta rodada já foi resolvido (não para de novo). */
  const halftimeDone = ref(false)
  /** Um jogador do seu time se lesionou: o jogo para para você decidir a substituição. */
  const injuryBreak = ref<{ playerName: string; minute: number } | null>(null)

  // A rodada em andamento também é salva, para que recarregar a página não refaça o resultado.
  persistRefs('round', { matches, lineups, minute, tickMs, halftime, halftimeDone, injuryBreak }, 2)

  const isReady = computed(() => matches.value.length > 0)
  const isFinished = computed(() => minute.value >= MATCH_LENGTH)

  // --- Intervalo e substituições ---
  // Aos 45' todos os times sentem o 1º tempo; a IA troca sozinha e o seu time para para você decidir.

  const managedMatch = computed(() => {
    const id = useGameStore().managedTeamId
    return matches.value.find((m) => m.homeId === id || m.awayId === id) ?? null
  })

  function teamEvents(m: LiveMatch, teamId: string, type: string) {
    return m.events.filter((e) => e.teamId === teamId && e.type === type)
  }

  /** Vagas deixadas por lesionados no 1º tempo (expulsos não são repostos). */
  function vacanciesFor(m: LiveMatch, teamId: string) {
    const reds = teamEvents(m, teamId, 'vermelho').length
    return Math.max(0, 11 - reds - (lineups.value[teamId]?.length ?? 0))
  }

  /** Reservas que podem entrar: disponíveis, fora de campo, e que não saíram nem foram expulsos/lesionados no jogo. */
  function benchFor(m: LiveMatch, teamId: string) {
    const team = useGameStore().getTeam(teamId)
    const onPitch = new Set((lineups.value[teamId] ?? []).map((p) => p.id))
    const usedUp = new Set(
      m.events.filter((e) => e.teamId === teamId && e.type !== 'gol' && e.type !== 'amarelo').flatMap((e) => [e.playerId, e.outId]),
    )
    return (team?.players ?? []).filter((p) => isAvailable(p) && !onPitch.has(p.id) && !usedUp.has(p.id))
  }

  /** Lesionados cujo lugar ainda não foi ocupado por ninguém. */
  function unreplacedInjured(m: LiveMatch, teamId: string) {
    const replaced = new Set(teamEvents(m, teamId, 'sub').map((e) => e.outId))
    return teamEvents(m, teamId, 'lesao').filter((e) => !replaced.has(e.playerId))
  }

  /** Troca: `outId` null = entra na vaga de um lesionado. Cada troca conta no limite de 3. */
  function substituteFor(m: LiveMatch, teamId: string, outId: string | null, inId: string) {
    if (teamEvents(m, teamId, 'sub').length >= MAX_SUBSTITUTIONS) return false
    const incoming = benchFor(m, teamId).find((p) => p.id === inId)
    if (!incoming) return false
    const lineup = lineups.value[teamId] ?? []
    const outgoing = outId ? lineup.find((p) => p.id === outId) : null
    if (outId && !outgoing) return false
    if (!outId && vacanciesFor(m, teamId) <= 0) return false
    if (outgoing) recordEnergy(m, outgoing)
    lineups.value[teamId] = [...lineup.filter((p) => p.id !== outId), { ...incoming }]
    // Na vaga de um lesionado, o evento registra quem ele substituiu.
    const injured = outId ? null : unreplacedInjured(m, teamId)[0]
    m.events.push({
      minute: minute.value,
      teamId,
      type: 'sub',
      ...eventPlayer(incoming),
      outName: outgoing?.name ?? injured?.playerName,
      outId: outgoing?.id ?? injured?.playerId,
      replacesInjured: !outgoing && !!injured,
    })
    return true
  }

  // --- Desgaste ao vivo ---

  /** Energia que o jogador perde por minuto em campo (90 minutos = o desgaste de uma partida inteira). */
  function drainPerMinute(p: Player) {
    return energyCost(p.age >= 30 ? 30 : 22, p.star) / MATCH_LENGTH
  }

  /** Guarda a energia de quem sai de campo (ou de todos no apito final): vira a energia real depois do jogo. */
  function recordEnergy(m: LiveMatch, p: Player) {
    m.playedEnergy = { ...(m.playedEnergy ?? {}), [p.id]: Math.round(p.energy) }
  }

  /** Um minuto de jogo: quem está em campo cansa, e a força dos dois times acompanha. */
  function drainAndRecompute(m: LiveMatch) {
    for (const teamId of [m.homeId, m.awayId]) {
      for (const p of lineups.value[teamId] ?? []) p.energy = Math.max(0, p.energy - drainPerMinute(p))
      recomputeStrength(m, teamId)
    }
  }

  /** Força de um time a partir de quem está em campo agora (com a energia do momento). Expulsões continuam pesando. */
  function recomputeStrength(m: LiveMatch, teamId: string) {
    const game = useGameStore()
    const onPitch = lineups.value[teamId] ?? []
    const reds = teamEvents(m, teamId, 'vermelho').length
    const s = lineupStrength(onPitch, game.tacticFor(teamId))
    // lineupStrength já reduz times com menos de 11; desfaz isso e aplica a regra da partida:
    // cada jogador a menos (expulso ou lesionado sem reposição) pesa como uma expulsão.
    const sizeFix = onPitch.length && onPitch.length < 11 ? 11 / onPitch.length : 1
    // Com menos de 11 a formação nunca "bate": essa penalidade não vale para quem está com um a menos.
    const shortHanded = onPitch.length < 11 && !s.matchesFormation ? 1 / FORMATION_MISMATCH_PENALTY : 1
    const factor = sizeFix * shortHanded * SENT_OFF_PENALTY ** (reds + vacanciesFor(m, teamId))
    if (m.homeId === teamId) {
      m.homeAttack = s.attack * factor * game.homeAdvantage(teamId)
      m.homeDefense = s.defense * factor
    } else {
      m.awayAttack = s.attack * factor
      m.awayDefense = s.defense * factor
    }
  }

  /** Vagas de lesionados ainda abertas: entra o melhor reserva da posição de quem se machucou. */
  function fillVacancies(m: LiveMatch, teamId: string) {
    const team = useGameStore().getTeam(teamId)
    const injuredPositions = teamEvents(m, teamId, 'lesao')
      .map((e) => team?.players.find((p) => p.id === e.playerId)?.position)
      .filter(Boolean)
    while (vacanciesFor(m, teamId) > 0) {
      const wanted = injuredPositions.shift()
      const pick = [...benchFor(m, teamId)].sort(
        (a, b) => Number(b.position === wanted) - Number(a.position === wanted) || effectiveRating(b) - effectiveRating(a),
      )[0]
      if (!pick || !substituteFor(m, teamId, null, pick.id)) break
    }
  }

  /** Técnico da IA no intervalo: completa vagas e troca até 3 titulares cansados por reservas que rendem mais. */
  function aiHalftime(m: LiveMatch, teamId: string) {
    fillVacancies(m, teamId)
    // A energia em campo já é a do momento (desgaste ao vivo).
    const tired = [...(lineups.value[teamId] ?? [])].sort((a, b) => effectiveRating(a) - effectiveRating(b))
    for (const p of tired) {
      if (teamEvents(m, teamId, 'sub').length >= MAX_SUBSTITUTIONS) break
      const current = effectiveRating(p)
      const best = benchFor(m, teamId)
        .filter((b) => b.position === p.position)
        .sort((a, b) => effectiveRating(b) - effectiveRating(a))[0]
      if (best && effectiveRating(best) > current + 2) substituteFor(m, teamId, p.id, best.id)
    }
    recomputeStrength(m, teamId)
  }

  /** Aos 45': a IA resolve o intervalo de todos os outros times; o seu jogo (se houver) para. */
  function startHalftime() {
    const myId = useGameStore().managedTeamId
    for (const m of matches.value) {
      for (const teamId of [m.homeId, m.awayId]) if (teamId !== myId) aiHalftime(m, teamId)
    }
    if (managedMatch.value) {
      halftime.value = true
      stop()
    } else {
      halftimeDone.value = true
    }
  }

  // Atalhos do clube gerenciado, usados pelo painel do intervalo.
  const subsUsed = computed(() => {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    return m && id ? teamEvents(m, id, 'sub').length : 0
  })
  const vacancies = computed(() => {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    return m && id ? vacanciesFor(m, id) : 0
  })
  const bench = computed(() => {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    return m && id ? benchFor(m, id) : []
  })

  /** Jogo do seu time parado esperando decisão (intervalo ou lesão). */
  const paused = computed(() => halftime.value || !!injuryBreak.value)

  function substitute(outId: string | null, inId: string) {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    return !!m && !!id && paused.value && substituteFor(m, id, outId, inId)
  }

  /**
   * Volta a jogar depois do intervalo ou da parada por lesão.
   * Vaga de lesionado não preenchida = o time segue com um a menos.
   */
  function resumeSecondHalf(autoStart = true) {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    if (!paused.value || !m || !id) return
    recomputeStrength(m, id)
    if (halftime.value) halftimeDone.value = true
    halftime.value = false
    injuryBreak.value = null
    if (autoStart) start()
  }

  /** Lesão no meio do jogo: a IA repõe na hora (se ainda tiver trocas); o seu time para para você decidir. */
  function handleInjury(m: LiveMatch, teamId: string, playerName: string) {
    if (teamId !== useGameStore().managedTeamId) {
      fillVacancies(m, teamId)
      recomputeStrength(m, teamId)
      return
    }
    if (teamEvents(m, teamId, 'sub').length < MAX_SUBSTITUTIONS && benchFor(m, teamId).length) {
      injuryBreak.value = { playerName, minute: minute.value }
    } else {
      // Sem trocas disponíveis: segue com um a menos.
      recomputeStrength(m, teamId)
    }
  }

  function setupRound() {
    const game = useGameStore()
    stop()
    minute.value = 0
    lineups.value = {}
    halftime.value = false
    halftimeDone.value = false
    injuryBreak.value = null
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
        // Público definido antes da bola rolar (usa a tabela da véspera do jogo).
        venue: game.matchVenue(f.homeId, f.awayId),
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
      drainAndRecompute(m)
    }
    // Intervalo: a IA faz as trocas dela; se o seu time está em campo, o jogo para para você decidir.
    if (minute.value === HALFTIME_MINUTE && !halftimeDone.value && !halftime.value) {
      startHalftime()
      if (halftime.value) {
        // O painel do intervalo já cobre uma lesão que aconteça neste mesmo minuto.
        injuryBreak.value = null
        return
      }
    }
    // Lesão no seu time: para o jogo para a substituição.
    if (injuryBreak.value) {
      stop()
      return
    }
    if (isFinished.value) {
      // Mata-mata não termina empatado: decide nos pênaltis ao apito final.
      for (const m of matches.value) {
        if (m.competition === 'cup' && m.homeGoals === m.awayGoals && !m.penalties) m.penalties = simulatePenalties()
        // Apito final: quem terminou em campo leva a energia que sobrou.
        for (const teamId of [m.homeId, m.awayId]) for (const p of lineups.value[teamId] ?? []) recordEnergy(m, p)
      }
      stop()
    }
  }

  /** Tira o jogador de campo (expulso ou lesionado): não marca nem leva mais cartões. */
  function removeFromPitch(m: LiveMatch, teamId: string, playerId: string) {
    const leaving = (lineups.value[teamId] ?? []).find((p) => p.id === playerId)
    if (leaving) recordEnergy(m, leaving)
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
      // Com um a menos, o time perde força (aplicada no recálculo deste mesmo minuto).
      removeFromPitch(m, teamId, p.id)
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
        removeFromPitch(m, teamId, p.id)
        handleInjury(m, teamId, p.name)
      }
    }
  }

  function start() {
    if (running.value || isFinished.value || !isReady.value || paused.value) return
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

  /**
   * Simula até o fim — mas para no intervalo do seu jogo, se ainda não passou por ele.
   * `skipHalftime` resolve o intervalo sem trocas (preenche só vagas de lesionados).
   */
  function simulateToEnd(skipHalftime = false) {
    stop()
    while (!isFinished.value) {
      if (paused.value) {
        if (!skipHalftime) return
        // Decisão automática: repõe lesionados com o melhor reserva (se houver troca) e segue.
        const m = managedMatch.value
        const id = useGameStore().managedTeamId
        if (m && id) fillVacancies(m, id)
        resumeSecondHalf(false)
      }
      tick()
    }
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
    halftime.value = false
    halftimeDone.value = false
    injuryBreak.value = null
  }

  return {
    matches, lineups, minute, running, tickMs, isReady, isFinished,
    halftime, injuryBreak, paused, managedMatch, subsUsed, vacancies, bench, substitute, resumeSecondHalf,
    setupRound, start, stop, setSpeed, simulateToEnd, confirmRound, reset,
  }
})
