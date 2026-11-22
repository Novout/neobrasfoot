import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LiveMatch, Player } from '../types/game'
import { energyCost } from '../data/stars'
import { playingPosition } from '../data/tactics'
import {
  DIRECT_RED_CHANCE, injuryChanceFor, isAvailable, pickCardedPlayer, pickInjuredPlayer, rollInjuryGames, SENT_OFF_PENALTY,
  YELLOW_CHANCE,
} from '../data/discipline'
import {
  bestTakers, eligibleKickers, goalkeeperOf, kickConversion, nextKickingTeam, PENALTY_FOUL_SHARE, shootoutDecided, shootoutScore,
  simulateShootout, takeKick, type ShootoutState,
} from '../data/penalties'
import { energyFactor, foulFactor, scorerFactor } from '../data/skills'
import { addedTime, FOUL_CHANCE, FOUL_STYLE_FACTOR, type HalfStoppages } from '../data/stoppage'
import { persistRefs } from '../utils/storage'
import { effectiveRating, FORMATION_MISMATCH_PENALTY, lineupStrength, useGameStore } from './game'
import { useTransferStore } from './transfers'

const MATCH_LENGTH = 90
const HALFTIME_MINUTE = 45
export const MAX_SUBSTITUTIONS = 3
// Um pouco abaixo de 0.015: os gols de pênalti (~0,2 por jogo) completam a média de ~3,5 gols.
const BASE_GOAL_CHANCE = 0.0136
const SCORER_WEIGHT: Record<Player['position'], number> = { GOL: 0, DEF: 1, MEI: 3, ATA: 6 }

function pickScorer(starters: Player[]) {
  // Posição em que joga x habilidades (finalização, cabeceio, chute de longe...).
  const weight = (p: Player) => SCORER_WEIGHT[playingPosition(p)] * scorerFactor(p)
  const total = starters.reduce((sum, p) => sum + weight(p), 0)
  let roll = Math.random() * total
  for (const p of starters) {
    roll -= weight(p)
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
  const injuryBreak = ref<{ playerName: string; minute: number; extra?: number } | null>(null)
  /** Minuto dos acréscimos em andamento (0 = tempo normal). O relógio fica em 45' ou 90' enquanto isso. */
  const extra = ref(0)

  // A rodada em andamento também é salva, para que recarregar a página não refaça o resultado.
  /** Pênalti a favor do seu time: o jogo para para você escolher o batedor. */
  const penaltyBreak = ref<{ minute: number; extra?: number } | null>(null)
  /** Disputa de pênaltis do seu jogo de copa (cobrança a cobrança). `done` = decidida, esperando você fechar. */
  const shootout = ref<(ShootoutState & { matchId: string; done: boolean }) | null>(null)
  /** O apito final já foi processado (energia de quem terminou em campo e pênaltis). */
  const finalWhistleDone = ref(false)

  persistRefs(
    'round',
    { matches, lineups, minute, extra, tickMs, halftime, halftimeDone, injuryBreak, penaltyBreak, shootout, finalWhistleDone },
    2,
  )

  const isReady = computed(() => matches.value.length > 0)
  /** 1º ou 2º tempo (o 2º começa quando o intervalo é resolvido). */
  const period = computed<1 | 2>(() => (halftimeDone.value ? 2 : 1))

  /** Maior acréscimo anunciado no tempo: o relógio da rodada corre até o último jogo terminar. */
  function maxAdded(half: 1 | 2) {
    return Math.max(0, ...matches.value.map((m) => (half === 1 ? m.added?.first : m.added?.second) ?? 0))
  }
  const isFinished = computed(() => halftimeDone.value && minute.value >= MATCH_LENGTH && extra.value >= maxAdded(2))

  /** Acréscimos anunciados no tempo atual (para o relógio), ou null antes da placa subir. */
  const addedNow = computed(() => {
    const end = period.value === 1 ? HALFTIME_MINUTE : MATCH_LENGTH
    const announced = matches.value.some((m) => (period.value === 1 ? m.added?.first : m.added?.second) !== undefined)
    return minute.value === end && announced ? maxAdded(period.value) : null
  })

  /** Este jogo ainda está em andamento no minuto atual (cada um tem seus acréscimos). */
  function inPlay(m: LiveMatch, half: 1 | 2 = period.value) {
    if (extra.value === 0) return true
    return extra.value <= ((half === 1 ? m.added?.first : m.added?.second) ?? 0)
  }

  /** O tempo deste jogo já acabou enquanto outros ainda jogam os acréscimos. */
  function halfOverFor(m: LiveMatch) {
    return extra.value > 0 && !inPlay(m)
  }

  /** Minuto para os eventos: 45+2 nos acréscimos (no intervalo o relógio volta a 45'). */
  function stamp() {
    return { minute: minute.value, ...(extra.value ? { extra: extra.value } : {}) }
  }

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
      ...stamp(),
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
    return (energyCost(p.age >= 30 ? 30 : 22, p.star) * energyFactor(p)) / MATCH_LENGTH
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
    // Acabaram os acréscimos do 1º tempo: o relógio volta a 45' (trocas do intervalo ficam em 45').
    extra.value = 0
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
  const paused = computed(() => halftime.value || !!injuryBreak.value || !!penaltyBreak.value)
  /** Rodada pronta para confirmar: tempo esgotado e sem disputa de pênaltis em andamento. */
  const roundComplete = computed(() => isFinished.value && !shootout.value)

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
    // Parada no último minuto: o apito final acontece agora.
    if (isFinished.value) finalWhistle()
    else if (autoStart) start()
  }

  /** Lesão no meio do jogo: a IA repõe na hora (se ainda tiver trocas); o seu time para para você decidir. */
  function handleInjury(m: LiveMatch, teamId: string, playerName: string) {
    if (teamId !== useGameStore().managedTeamId) {
      fillVacancies(m, teamId)
      recomputeStrength(m, teamId)
      return
    }
    if (teamEvents(m, teamId, 'sub').length < MAX_SUBSTITUTIONS && benchFor(m, teamId).length) {
      injuryBreak.value = { playerName, ...stamp() }
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
    penaltyBreak.value = null
    shootout.value = null
    finalWhistleDone.value = false
    extra.value = 0
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
        fouls: { home: 0, away: 0 },
        added: {},
        // Público definido antes da bola rolar (usa a tabela da véspera do jogo).
        venue: game.matchVenue(f.homeId, f.awayId),
      }
    })
  }

  /** O que atrasou o jogo num tempo: base para os acréscimos. */
  function halfStoppages(m: LiveMatch, half: 1 | 2): HalfStoppages {
    // Eventos do 1º tempo vão até 45+x; os do 2º começam no 46'. Trocas do intervalo (45') não contam.
    const events = m.events.filter((e) => (half === 1 ? e.minute <= HALFTIME_MINUTE : e.minute > HALFTIME_MINUTE))
    const count = (...types: string[]) => events.filter((e) => types.includes(e.type)).length
    const totalFouls = (m.fouls?.home ?? 0) + (m.fouls?.away ?? 0)
    return {
      fouls: half === 1 ? totalFouls : totalFouls - (m.firstHalfFouls ?? 0),
      cards: count('amarelo', 'vermelho'),
      injuries: count('lesao'),
      goals: count('gol'),
      subs: count('sub'),
      penalties: count('penalti-perdido') + events.filter((e) => e.type === 'gol' && e.penalty).length,
    }
  }

  /** Placa do quarto árbitro ao fim do tempo regulamentar. */
  function announceAdded(m: LiveMatch, half: 1 | 2) {
    const minutes = addedTime(half, halfStoppages(m, half))
    m.added = half === 1 ? { ...m.added, first: minutes } : { ...m.added, second: minutes }
  }

  /** Faltas do minuto: times defensivos param mais o jogo. */
  function rollFouls(m: LiveMatch) {
    const game = useGameStore()
    m.fouls ??= { home: 0, away: 0 }
    const home = lineups.value[m.homeId] ?? []
    const away = lineups.value[m.awayId] ?? []
    // Jogo limpo do time diminui; dribladores do adversário aumentam.
    if (Math.random() < FOUL_CHANCE * FOUL_STYLE_FACTOR[game.tacticFor(m.homeId).style] * foulFactor(home, away)) {
      m.fouls.home++
      // Falta dentro da área: pênalti para o adversário.
      if (Math.random() < PENALTY_FOUL_SHARE) awardPenalty(m, m.awayId)
    }
    if (Math.random() < FOUL_CHANCE * FOUL_STYLE_FACTOR[game.tacticFor(m.awayId).style] * foulFactor(away, home)) {
      m.fouls.away++
      if (Math.random() < PENALTY_FOUL_SHARE) awardPenalty(m, m.homeId)
    }
  }

  // --- Pênaltis durante o jogo ---

  const opponentOf = (m: LiveMatch, teamId: string) => (teamId === m.homeId ? m.awayId : m.homeId)

  /** Pênalti marcado: o seu time para para escolher o batedor; a IA manda o melhor. */
  function awardPenalty(m: LiveMatch, teamId: string) {
    const lineup = lineups.value[teamId] ?? []
    if (!lineup.length) return
    if (teamId === useGameStore().managedTeamId && !injuryBreak.value && !penaltyBreak.value) {
      penaltyBreak.value = stamp()
      return
    }
    const keeper = goalkeeperOf(lineups.value[opponentOf(m, teamId)] ?? [])
    resolvePenalty(m, teamId, bestTakers(lineup, keeper)[0]!)
  }

  function resolvePenalty(m: LiveMatch, teamId: string, taker: Player) {
    const keeper = goalkeeperOf(lineups.value[opponentOf(m, teamId)] ?? [])
    if (Math.random() < kickConversion(taker, keeper)) {
      if (teamId === m.homeId) m.homeGoals++
      else m.awayGoals++
      m.events.push({ ...stamp(), teamId, type: 'gol', penalty: true, ...eventPlayer(taker) })
    } else {
      // O goleiro defende na maioria das vezes; às vezes a bola vai para fora.
      const saved = keeper && Math.random() < 0.7
      m.events.push({ ...stamp(), teamId, type: 'penalti-perdido', ...eventPlayer(taker), ...(saved ? { savedBy: (keeper as Player).name } : {}) })
    }
  }

  /** Batedores do seu time para o pênalti, do melhor para o pior, com a chance de cada um. */
  const penaltyTakers = computed(() => {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    if (!m || !id) return []
    const keeper = goalkeeperOf(lineups.value[opponentOf(m, id)] ?? [])
    return bestTakers(lineups.value[id] ?? [], keeper).map((p) => ({ player: p, chance: kickConversion(p, keeper) }))
  })

  /** Você escolheu o batedor: cobra e o jogo continua. */
  function takePenalty(playerId: string, autoStart = true) {
    const m = managedMatch.value
    const id = useGameStore().managedTeamId
    const taker = (id && lineups.value[id]?.find((p) => p.id === playerId)) || null
    if (!penaltyBreak.value || !m || !id || !taker) return false
    resolvePenalty(m, id, taker)
    penaltyBreak.value = null
    if (isFinished.value) finalWhistle()
    else if (autoStart) start()
    return true
  }

  // --- Disputa de pênaltis (copa) ---

  /** Opções de batedor do seu time na disputa: quem ainda não bateu nesta volta, com a chance contra o goleiro. */
  const shootoutTakers = computed(() => {
    const s = shootout.value
    const id = useGameStore().managedTeamId
    if (!s || !id) return []
    const keeper = goalkeeperOf(lineups.value[s.homeId === id ? s.awayId : s.homeId] ?? [])
    return bestTakers(eligibleKickers(s, id, lineups.value[id] ?? []), keeper).map((p) => ({ player: p, chance: kickConversion(p, keeper) }))
  })

  /** Cobranças da IA até chegar a vez do seu time (ou a disputa acabar). */
  function aiKicks() {
    const s = shootout.value
    const id = useGameStore().managedTeamId
    if (!s) return
    while (!shootoutDecided(s) && nextKickingTeam(s) !== id) {
      const teamId = nextKickingTeam(s)
      const keeper = goalkeeperOf(lineups.value[teamId === s.homeId ? s.awayId : s.homeId] ?? [])
      const taker = bestTakers(eligibleKickers(s, teamId, lineups.value[teamId] ?? []), keeper)[0]
      if (!taker) break
      takeKick(s, teamId, taker, keeper)
    }
    checkShootoutEnd()
  }

  function checkShootoutEnd() {
    const s = shootout.value
    if (!s || !shootoutDecided(s)) return
    const m = matches.value.find((x) => x.id === s.matchId)
    if (m) {
      m.penalties = shootoutScore(s)
      m.shootout = [...s.kicks]
    }
    s.done = true
  }

  /** Sua cobrança na disputa: o jogador escolhido bate, e a IA responde. */
  function shootoutKick(playerId: string) {
    const s = shootout.value
    const id = useGameStore().managedTeamId
    if (!s || s.done || !id || nextKickingTeam(s) !== id) return null
    const taker = eligibleKickers(s, id, lineups.value[id] ?? []).find((p) => p.id === playerId)
    if (!taker) return null
    const keeper = goalkeeperOf(lineups.value[s.homeId === id ? s.awayId : s.homeId] ?? [])
    const kick = takeKick(s, id, taker, keeper)
    checkShootoutEnd()
    if (!s.done) aiKicks()
    return kick
  }

  /** Decide a disputa automaticamente (sempre o melhor batedor disponível). */
  function autoShootout() {
    const s = shootout.value
    const id = useGameStore().managedTeamId
    // Limite de segurança: uma morte súbita sem fim é praticamente impossível, mas não pode travar o jogo.
    for (let guard = 0; s && !s.done && guard < 200; guard++) {
      if (nextKickingTeam(s) === id) {
        const best = shootoutTakers.value[0]
        if (!best) break
        shootoutKick(best.player.id)
      } else aiKicks()
    }
  }

  /** Fecha o painel da disputa já decidida. */
  function closeShootout() {
    if (shootout.value?.done) shootout.value = null
  }

  /**
   * Apito final de todos os jogos: guarda a energia de quem terminou em campo e decide os mata-matas empatados
   * (a IA sozinha; o seu jogo abre a disputa de pênaltis para você escolher os batedores).
   */
  function finalWhistle() {
    if (finalWhistleDone.value) return
    finalWhistleDone.value = true
    const id = useGameStore().managedTeamId
    for (const m of matches.value) {
      for (const teamId of [m.homeId, m.awayId]) for (const p of lineups.value[teamId] ?? []) recordEnergy(m, p)
      if (m.competition !== 'cup' || m.homeGoals !== m.awayGoals || m.penalties) continue
      const home = lineups.value[m.homeId] ?? []
      const away = lineups.value[m.awayId] ?? []
      if (m.homeId === id || m.awayId === id) {
        shootout.value = { matchId: m.id, homeId: m.homeId, awayId: m.awayId, firstId: Math.random() < 0.5 ? m.homeId : m.awayId, kicks: [], done: false }
        aiKicks()
      } else {
        const s = simulateShootout(m.homeId, m.awayId, home, away)
        m.penalties = shootoutScore(s)
        m.shootout = s.kicks
      }
    }
    stop()
  }

  function tick() {
    if (isFinished.value) {
      stop()
      return
    }
    const half = period.value
    const end = half === 1 ? HALFTIME_MINUTE : MATCH_LENGTH
    // Tempo normal avança o relógio; depois dos 45'/90' contam os acréscimos.
    if (minute.value < end) {
      minute.value++
      extra.value = 0
    } else {
      extra.value++
    }
    for (const m of matches.value) {
      // Jogo que já esgotou os acréscimos espera os outros terminarem o tempo.
      if (!inPlay(m, half)) continue
      if (Math.random() < goalChance(m.homeAttack, m.awayDefense)) {
        m.homeGoals++
        m.events.push({ ...stamp(), teamId: m.homeId, type: 'gol', ...scorerInfo(lineups.value[m.homeId]) })
      }
      if (Math.random() < goalChance(m.awayAttack, m.homeDefense)) {
        m.awayGoals++
        m.events.push({ ...stamp(), teamId: m.awayId, type: 'gol', ...scorerInfo(lineups.value[m.awayId]) })
      }
      rollFouls(m)
      rollDiscipline(m, 'home')
      rollDiscipline(m, 'away')
      drainAndRecompute(m)
    }
    // Fim do tempo regulamentar: cada jogo ganha seus acréscimos, conforme o tempo que perdeu.
    if (minute.value === end && extra.value === 0) for (const m of matches.value) announceAdded(m, half)
    const halfOver = minute.value === end && extra.value >= maxAdded(half)

    // Intervalo: a IA faz as trocas dela; se o seu time está em campo, o jogo para para você decidir.
    if (half === 1 && halfOver && !halftime.value) {
      for (const m of matches.value) m.firstHalfFouls = (m.fouls?.home ?? 0) + (m.fouls?.away ?? 0)
      startHalftime()
      if (halftime.value) {
        // O painel do intervalo já cobre uma lesão que aconteça neste mesmo minuto.
        injuryBreak.value = null
        return
      }
    }
    // Lesão no seu time: para o jogo para a substituição.
    // Lesão ou pênalti a favor do seu time: para o jogo para você decidir.
    if (injuryBreak.value || penaltyBreak.value) {
      stop()
      return
    }
    if (isFinished.value) finalWhistle()
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
    const at = stamp()
    // Todo cartão nasce de uma falta.
    const foul = () => {
      m.fouls ??= { home: 0, away: 0 }
      m.fouls[side]++
    }

    const sendOff = (p: Player, secondYellow: boolean) => {
      m.events.push({ ...at, teamId, type: 'vermelho', secondYellow, ...eventPlayer(p) })
      // Com um a menos, o time perde força (aplicada no recálculo deste mesmo minuto).
      removeFromPitch(m, teamId, p.id)
    }

    if (Math.random() < YELLOW_CHANCE) {
      const booked = new Set(m.events.filter((e) => e.type === 'amarelo' && e.teamId === teamId).map((e) => e.playerId!))
      const p = pickCardedPlayer(onPitch, booked)
      if (p) {
        const alreadyBooked = booked.has(p.id)
        foul()
        m.events.push({ ...at, teamId, type: 'amarelo', ...eventPlayer(p) })
        if (alreadyBooked) sendOff(p, true)
      }
    } else if (Math.random() < DIRECT_RED_CHANCE) {
      const p = pickCardedPlayer(onPitch)
      if (p) {
        foul()
        sendOff(p, false)
      }
    }

    const current = lineups.value[teamId] ?? []
    const avgEnergy = current.reduce((sum, p) => sum + p.energy, 0) / Math.max(current.length, 1)
    if (current.length && Math.random() < injuryChanceFor(avgEnergy)) {
      const p = pickInjuredPlayer(current)
      if (p) {
        m.events.push({ ...at, teamId, type: 'lesao', games: rollInjuryGames(), ...eventPlayer(p) })
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
        // Decisão automática: o melhor batedor no pênalti; lesionados repostos pelo melhor reserva.
        if (penaltyBreak.value) {
          takePenalty(penaltyTakers.value[0]!.player.id, false)
          continue
        }
        const m = managedMatch.value
        const id = useGameStore().managedTeamId
        if (m && id) fillVacancies(m, id)
        resumeSecondHalf(false)
        continue
      }
      tick()
    }
    if (skipHalftime) {
      finalWhistle()
      autoShootout()
      closeShootout()
    }
  }

  /** Aplica os resultados na carreira e limpa a rodada. */
  function confirmRound() {
    if (!isFinished.value) return
    // Rodadas salvas antes do apito final ser separado: processa agora.
    finalWhistle()
    if (shootout.value) return
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
    extra.value = 0
    halftime.value = false
    halftimeDone.value = false
    injuryBreak.value = null
    penaltyBreak.value = null
    shootout.value = null
    finalWhistleDone.value = false
  }

  return {
    matches, lineups, minute, extra, period, addedNow, halfOverFor, running, tickMs, isReady, isFinished,
    halftime, injuryBreak, paused, managedMatch, subsUsed, vacancies, bench, substitute, resumeSecondHalf,
    setupRound, start, stop, setSpeed, simulateToEnd, confirmRound, reset,
    penaltyBreak, penaltyTakers, takePenalty, shootout, shootoutTakers, shootoutKick, autoShootout, closeShootout, roundComplete,
  }
})
