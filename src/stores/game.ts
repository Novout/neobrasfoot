import { defineStore } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
import {
  createCup, CUP_NAME, cupPrize, CUP_RUNNER_UP_PRIZE, inRound, nextCupRound, tieWinner,
} from '../data/cup'
import {
  leagueMatchDelta, NEW_JOB_CONFIDENCE, seasonEndDelta, START_CONFIDENCE, tableDriftDelta, WARNING_CONFIDENCE,
} from '../data/confidence'
import { generateFixtures } from '../data/fixtures'
import {
  BRAZIL_SPOTS, createContinentalTeams, createLibertadores, currentTies as libertadoresTies, drawRoundOf16, GROUP_ROUNDS,
  groupOf, groupTable, isGroupStage, LIBERTADORES_NAME, LIBERTADORES_PRIZES, nextKnockoutRound, quickScore,
  stageName,
} from '../data/libertadores'
import {
  DIRECT_RED_SUSPENSION, injuryGames, isAvailable, SECOND_YELLOW_SUSPENSION, YELLOWS_FOR_SUSPENSION,
} from '../data/discipline'
import { LOAN_DEVELOPMENT_AGE, LOAN_DEVELOPMENT_CHANCE } from '../data/loans'
import { baseReserveTeams, leagueReserveTeams, leagueTeams } from '../data/league'
import { balanceDefRoles, defenseFits, defenseSplit, defRoleOf, DEF_ROLE_MISFIT } from '../data/defense'
import { bestEleven, recordMatch, type BestXIEntry, type BestXIRecord, type PlayerSeasonStats } from '../data/seasonStats'
import { BRASILEIRAO_CRESTS } from '../data/crests'
import { createManagers, trophyLabel } from '../data/trophies'
import { applyProgression, createAcademy, renewSquad } from '../data/youth'
import { generateJobOffers, reviewSeason } from '../data/managerMarket'
import { energyCost, STAR_VALUE_FACTOR } from '../data/stars'
import { matchEnergyCost, playedRecovery, REST_RECOVERY, SUB_ENTRY_ENERGY, TRAINING_ENERGY } from '../data/energy'
import { shootoutScore, simulateShootout } from '../data/penalties'
import { teamSkillBonus } from '../data/skills'
import { sideFits } from '../data/feet'
import { FORMATIONS, markingOf, MARKINGS, PLAY_STYLES, playingPosition, POSITION_ORDER, positionFit } from '../data/tactics'
import {
  AWAY_GAME_INCOME, bestTicketPrice, idealTicketPrice, buildRounds, createStadium, estimateGate, gateRevenue, homeAdvantageBonus,
  matchAttendance,
  MAX_TICKET_PRICE, MAX_UPGRADE_LEVEL, stadiumCapacity,
  MIN_TICKET_PRICE, STADIUM_UPGRADES, stadiumUpkeep, upgradeCost, type GateContext,
} from '../data/stadium'
import {
  DIVISION_LABELS, DIVISIONS, divisionAbove, divisionBelow, MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL, PROMOTION_SPOTS,
  RELEGATION_SPOTS, REPUTATION_SWING, tableZone, formatOfTeams, setActiveFormat, ACTIVE_FORMAT, setBottomRelegation,
} from '../data/divisions'
import {
  assignStarsToLegacyTeams, createTeamsWithCustom, CUSTOM_TEAM_ID, teamsByDivision, type CustomTeamDraft,
} from '../data/teams'
import type {
  Academy, Competition, LibertadoresState, Marking, Confidence, ConfidenceChange, CupState, CupTie, Dismissal, DivisionId, JobOffer, Manager, MatchVenue, Trophy, Fixture, Formation, LiveMatch, Player, PlayStyle, Stadium, StadiumUpgradeKey, StandingRow, Tactic, Team, TransferOffer,
  TransferRecord, Position,
} from '../types/game'
import { clamp, createRng, formatMoney, hashString } from '../utils/random'
import { persistRefs, updateSaveSummary } from '../utils/storage'
import { defaultStartYear, seasonCalendar, seasonYear as yearOfSeason, type CalendarEntry, type IsoDate } from '../data/calendar'
import { loanHeadline, matchHeadlines, MAX_HEADLINES, saleHeadline, type Headline } from '../data/headlines'

export const MIN_SQUAD_SIZE = 16
export const MAX_SQUAD_SIZE = 30
export const MIN_GOALKEEPERS = 2
const BASE_HOME_ADVANTAGE = 1.1
const AI_TACTIC: Tactic = { formation: '4-4-2', style: 'equilibrado' }


/** Energia que um treino consome (estrelas gastam menos). */
export function trainingEnergyCost(player: Player) {
  return energyCost(TRAINING_ENERGY, player.star)
}

/** O jogador precisa de uma folga de energia além do custo do treino. */
export function canTrain(player: Player) {
  return injuryGames(player) === 0 && player.energy >= trainingEnergyCost(player) + 5
}

/** Preço mínimo aceito ao listar e arredondamento para milhares. */
const MIN_ASKING_PRICE = 10_000
export function normalizeAskingPrice(price: number) {
  return Math.max(MIN_ASKING_PRICE, Math.round(price / 1000) * 1000)
}

/** Preço pedido efetivo de um jogador listado (saves antigos: valor de mercado). */
export function askingPriceOf(player: Player) {
  return player.askingPrice ?? marketValue(player)
}

export function marketValue(player: Player) {
  const ageFactor = player.age <= 23 ? 1.3 : player.age >= 31 ? 0.6 : 1
  const starFactor = player.star ? STAR_VALUE_FACTOR : 1
  return Math.round((player.overall ** 2.5 * 20 * ageFactor * starFactor) / 1000) * 1000
}

/** Rendimento efetivo do jogador considerando energia e moral. */
export function effectiveRating(player: Player) {
  return player.overall * (0.6 + 0.4 * (player.energy / 100)) * (0.9 + 0.2 * (player.morale / 100))
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
}

/**
 * Escolhe os melhores 11 disponíveis respeitando a formação; jogadores à venda só entram se faltar opção.
 * Se suspensões/lesões deixarem uma posição sem gente, completa com o melhor disponível de linha.
 */
function pickBestLineup(players: Player[], formation: Formation): Set<string> {
  const chosen = new Set<string>()
  const available = players.filter(isAvailable)
  const byPreference = (a: Player, b: Player) =>
    Number(a.forSale) - Number(b.forSale) || effectiveRating(b) - effectiveRating(a)
  for (const position of POSITION_ORDER) {
    const count = FORMATIONS[formation][position]
    const pool = available.filter((p) => p.position === position).sort(byPreference)
    if (position === 'DEF') {
      // Laterais e zagueiros na quantidade da formação; faltando um tipo, completa com o outro.
      const split = defenseSplit(count)
      for (const role of ['LAT', 'ZAG'] as const) {
        pool.filter((p) => defRoleOf(p) === role).slice(0, split[role]).forEach((p) => chosen.add(p.id))
      }
      pool.filter((p) => !chosen.has(p.id)).slice(0, count - pool.filter((p) => chosen.has(p.id)).length).forEach((p) => chosen.add(p.id))
      continue
    }
    pool.slice(0, count).forEach((p) => chosen.add(p.id))
  }
  available
    .filter((p) => !chosen.has(p.id) && p.position !== 'GOL')
    .sort(byPreference)
    .slice(0, Math.max(0, 11 - chosen.size))
    .forEach((p) => chosen.add(p.id))
  return chosen
}

/** Força perdida quando os titulares não batem com a formação escolhida. */
export const FORMATION_MISMATCH_PENALTY = 0.92

export function lineupStrength(starters: Player[], tactic: Tactic) {
  // Improvisados contam na linha em que jogam, com o rendimento reduzido.
  // Pé x lado: destro pela direita e canhoto pela esquerda rendem mais; no lado contrário, menos.
  const sides = sideFits(starters)
  const roles = defenseFits(starters)
  const byPos = (pos: Player['position']) =>
    starters
      .filter((p) => playingPosition(p) === pos)
      .map((p) => effectiveRating(p) * positionFit(p.position, pos) * (sides.get(p.id) ?? 1) * (roles.get(p.id) ?? 1))
  const gol = byPos('GOL')
  const def = byPos('DEF')
  const mei = byPos('MEI')
  const ata = byPos('ATA')

  let attack = average(ata) * 0.6 + average(mei) * 0.4
  let defense = average(def) * 0.6 + average(gol) * 0.25 + average(mei) * 0.15

  const required = FORMATIONS[tactic.formation]
  const matchesFormation = POSITION_ORDER.every((pos) => byPos(pos).length === required[pos])
  if (!matchesFormation) {
    attack *= FORMATION_MISMATCH_PENALTY
    defense *= FORMATION_MISMATCH_PENALTY
  }
  if (gol.length === 0) defense *= 0.6
  if (starters.length < 11) {
    attack *= starters.length / 11
    defense *= starters.length / 11
  }

  // Habilidades de quem está em campo (passe, desarme, colocação...).
  const skills = teamSkillBonus(starters)
  attack *= skills.attack
  defense *= skills.defense

  const style = PLAY_STYLES[tactic.style]
  const marking = MARKINGS[markingOf(tactic)]
  return { attack: attack * style.attack, defense: defense / style.defense / marking.concede, matchesFormation }
}

export const useGameStore = defineStore('game', () => {
  const teams = ref<Team[]>([])
  const managedTeamId = ref<string | null>(null)
  const managerName = ref('')
  const budget = ref(0)
  const season = ref(1)
  const round = ref(0)
  const fixtures = ref<Fixture[][]>([])
  const standings = ref<StandingRow[]>([])
  const tactic = ref<Tactic>({ formation: '4-4-2', style: 'equilibrado', marking: 'media' })
  const trainedThisRound = ref<string[]>([])
  const news = ref<string[]>([])
  /** Giro da rodada: goleadas, zebras e negócios caros da liga inteira. */
  const headlines = ref<Headline[]>([])
  /** Categorias de base do clube gerenciado: jovens que o técnico pode subir ao elenco. Renovada a cada temporada. */
  const academy = ref<Academy | null>(null)
  /**
   * Série C (fora da liga) do formato 2×20: clubes que não jogam a temporada. No fim dela, os 4 últimos da
   * Série B caem para cá e 4 daqui sobem para o lugar deles.
   */
  const reserveTeams = ref<Team[]>([])
  /** Estatísticas de cada jogador no campeonato desta temporada (jogos, gols, notas...). */
  const seasonStats = ref<Record<string, PlayerSeasonStats>>({})
  /** Seleções das temporadas encerradas (uma por série), da mais recente para a mais antiga. */
  const bestXIHistory = ref<BestXIRecord[]>([])
  /** Ano da temporada 1 da carreira (o calendário da temporada N é desse ano + N − 1). */
  const calendarStartYear = ref<number | null>(null)
  /** Resultados do clube gerenciado no campeonato desta temporada, por rodada (0 = primeira). */
  const leagueResults = ref<Record<number, { homeId: string; awayId: string; homeGoals: number; awayGoals: number }>>({})
  const transferOffers = ref<TransferOffer[]>([])
  const transferHistory = ref<TransferRecord[]>([])
  /** Propostas já feitas por jogador nesta rodada (limita a barganha). */
  const negotiationAttempts = ref<Record<string, number>>({})
  const stadium = ref<Stadium | null>(null)
  const cup = ref<CupState | null>(null)
  /** Libertadores da temporada (os 4 primeiros da Série A anterior + clubes do continente). */
  const libertadores = ref<LibertadoresState | null>(null)
  /** Clubes estrangeiros da Libertadores (não disputam a liga). */
  const continentalTeams = ref<Team[]>([])
  /** Classificados do Brasil para a próxima Libertadores (definidos na virada da temporada). */
  const libertadoresQualified = ref<string[]>([])
  /** Propostas da janela de técnicos (abertas no fim da temporada). */
  const jobOffers = ref<JobOffer[]>([])
  /** Técnicos da liga (o jogador e um por clube da IA), cada um com sua prateleira de troféus. */
  const managers = ref<Manager[]>([])
  /** Última temporada cujos troféus já foram entregues (evita premiar duas vezes). */
  const trophiesAwardedSeason = ref(0)
  /** Confiança da diretoria e do clube (torcida e vestiário), de 0 a 100. Chegar a 0 = demissão. */
  const confidence = ref<Confidence>({ board: START_CONFIDENCE, club: START_CONFIDENCE })
  const confidenceLog = ref<ConfidenceChange[]>([])
  /** Preenchido quando o técnico é demitido; o jogo fica na tela de demissão até ele escolher. */
  const dismissal = ref<Dismissal | null>(null)

  // Versão 2: introdução das divisões (saves de divisão única são descartados).
  persistRefs('career', {
    teams, managedTeamId, managerName, budget, season, round, fixtures, standings, tactic, trainedThisRound, news,
    transferOffers, transferHistory, negotiationAttempts, stadium, cup, jobOffers, managers, trophiesAwardedSeason,
    confidence, confidenceLog, dismissal, headlines, academy, calendarStartYear, leagueResults, reserveTeams,
    seasonStats, bestXIHistory, libertadores, continentalTeams, libertadoresQualified,
  }, 2)

  // O formato da liga (4×8 ou 2×20) vem dos próprios clubes da carreira salva.
  if (managedTeamId.value) setActiveFormat(formatOfTeams(teams.value))

  const hasCareer = computed(() => managedTeamId.value !== null)
  const managedTeam = computed(() => teams.value.find((t) => t.id === managedTeamId.value) ?? null)
  const starters = computed(() => managedTeam.value?.players.filter((p) => p.starter) ?? [])
  /** Rodadas do campeonato (a Copa não conta). */
  const totalRounds = computed(() => fixtures.value.length)

  // Saves anteriores à Copa: cria a Copa da temporada atual, encaixada nas rodadas restantes.
  if (hasCareer.value && !cup.value) cup.value = createCup(teams.value, season.value, round.value, fixtures.value.length)
  // Saves anteriores aos troféus: cria os técnicos com prateleiras vazias.
  if (hasCareer.value && !managers.value.length && managedTeamId.value) {
    managers.value = createManagers(teams.value, managedTeamId.value, managerName.value)
  }
  // Carreiras do Brasileirão anteriores aos escudos: os clubes reais ganham o escudo baixado.
  if (hasCareer.value) {
    for (const t of teams.value) if (t.crest === undefined && BRASILEIRAO_CRESTS[t.id]) t.crest = BRASILEIRAO_CRESTS[t.id]
  }
  // Saves anteriores à lista da base (ou de outro clube): gera a lista do clube atual.
  if (hasCareer.value && managedTeamId.value && academy.value?.teamId !== managedTeamId.value) refreshAcademy()
  // Saves anteriores às estrelas: sorteia as estrelas dos elencos existentes uma única vez.
  if (hasCareer.value && assignStarsToLegacyTeams(teams.value)) {
    const mine = teams.value.find((t) => t.id === managedTeamId.value)?.players.filter((p) => p.star) ?? []
    news.value.unshift(
      mine.length
        ? `Novidade: jogadores estrela! Seu elenco tem ${mine.map((p) => p.name).join(', ')}.`
        : 'Novidade: jogadores estrela chegaram à liga. Procure-os no mercado!',
    )
  }

  const cupFinished = computed(() => !cup.value || cup.value.championId !== null)
  const currentCupRound = computed(() => (cupFinished.value ? null : (cup.value!.rounds[cup.value!.currentRound] ?? null)))
  const leagueFinished = computed(() => round.value >= totalRounds.value)
  const libertadoresFinished = computed(() => !libertadores.value || libertadores.value.championId !== null)
  /** A etapa atual da Libertadores é de mata-mata (empate vai para os pênaltis). */
  const libertadoresKnockout = computed(() => !!libertadores.value && !isGroupStage(libertadores.value))
  const isSeasonOver = computed(() => hasCareer.value && leagueFinished.value && cupFinished.value && libertadoresFinished.value)

  /**
   * Próximo compromisso: uma fase de copa entra quando o calendário chega nela.
   * Copa e Libertadores no mesmo intervalo: vai primeiro a que foi marcada antes (empate: a Copa).
   */
  const nextEvent = computed<Competition | null>(() => {
    if (!hasCareer.value || isSeasonOver.value) return null
    const c = cup.value
    const l = libertadores.value
    const cupAt = c && !cupFinished.value ? c.schedule[c.currentRound]! : Infinity
    const libAt = l && !libertadoresFinished.value ? l.schedule[l.stage]! : Infinity
    const due = (at: number) => at !== Infinity && (round.value >= at || leagueFinished.value)
    if (due(cupAt) && (!due(libAt) || cupAt <= libAt)) return 'cup'
    if (due(libAt)) return 'libertadores'
    return leagueFinished.value ? null : 'league'
  })

  const currentFixtures = computed<Fixture[]>(() => {
    if (nextEvent.value === 'cup') return currentCupRound.value?.ties.map((t) => ({ homeId: t.homeId, awayId: t.awayId })) ?? []
    if (nextEvent.value === 'libertadores') {
      return libertadores.value ? libertadoresTies(libertadores.value).map((t) => ({ homeId: t.homeId, awayId: t.awayId })) : []
    }
    return fixtures.value[round.value] ?? []
  })

  /** Ex.: "Série B · Rodada 5", "Copa do Brasil · Quartas de final" ou "Libertadores · Fase de grupos · 2ª rodada". */
  const nextEventLabel = computed(() => {
    if (nextEvent.value === 'cup') return `${CUP_NAME} · ${currentCupRound.value?.name ?? ''}`
    if (nextEvent.value === 'libertadores') return `${LIBERTADORES_NAME} · ${stageName(libertadores.value?.stage ?? 0)}`
    if (nextEvent.value === 'league') return `${DIVISION_LABELS[managedTeam.value?.division ?? 'A']} · Rodada ${round.value + 1}`
    return 'Temporada encerrada'
  })

  // Resumo do save em uso (clube, temporada, rodada), mostrado na lista de saves.
  watch(
    () => {
      const t = managedTeam.value
      if (!t) return null
      return {
        club: t.name,
        shortName: t.shortName,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        ...(t.crest && !t.crest.startsWith('data:') ? { crest: t.crest } : {}),
        manager: managerName.value,
        season: season.value,
        label: nextEventLabel.value,
      }
    },
    (summary) => updateSaveSummary(summary),
    { immediate: true },
  )

  // Saves no 2×20 anteriores à Série C: cria a dela pela liga base que a carreira usa.
  if (hasCareer.value && !reserveTeams.value.length && formatOfTeams(teams.value) === '2x20') {
    const ids = new Set(teams.value.map((t) => t.id))
    const base = ids.has('flamengo') ? 'brasileirao' : ids.has('atletico-serrano') ? 'gerada' : null
    if (base) {
      reserveTeams.value = baseReserveTeams(base, '2x20').filter((t) => !ids.has(t.id))
      addReserveManagers()
    }
  }

  // Saves anteriores à divisão da defesa: define laterais e zagueiros de cada elenco (uma vez só).
  if (hasCareer.value) {
    for (const t of [...teams.value, ...reserveTeams.value]) {
      if (t.players.some((p) => p.position === 'DEF' && !p.defRole)) balanceDefRoles(t.players)
    }
  }

  // --- Calendário ---

  // Saves anteriores ao calendário: a temporada atual fica no ano que vem (ou neste, até setembro).
  if (hasCareer.value && calendarStartYear.value === null) calendarStartYear.value = defaultStartYear() - (season.value - 1)

  /** Ano da temporada atual. */
  const currentYear = computed(() => yearOfSeason(calendarStartYear.value ?? defaultStartYear(), season.value))
  /** Datas de todas as rodadas e fases da Copa da temporada, em ordem. */
  const calendar = computed<CalendarEntry[]>(() =>
    seasonCalendar(currentYear.value, totalRounds.value, cup.value?.schedule ?? [], libertadores.value?.schedule ?? []),
  )
  /** Data do próximo compromisso (rodada do campeonato ou fase da Copa). */
  const nextEventDate = computed<IsoDate | null>(() => {
    const event = nextEvent.value
    if (!event) return null
    const index = event === 'league' ? round.value : event === 'cup' ? (cup.value?.currentRound ?? 0) : (libertadores.value?.stage ?? 0)
    return calendar.value.find((e) => e.kind === event && e.index === index)?.date ?? null
  })

  /** Situação do clube gerenciado na Copa desta temporada. */
  const managedCupStatus = computed(() => {
    const c = cup.value
    const id = managedTeamId.value
    if (!c || !id) return null
    // Clube que pulou a fase preliminar: espera a 1ª fase.
    const skipped = c.byes?.includes(id) ?? false
    if (!skipped && !c.rounds[0]?.ties.some((t) => t.homeId === id || t.awayId === id)) {
      return { state: 'absent' as const, roundName: c.rounds[0]?.name ?? '' }
    }
    if (c.championId === id) return { state: 'champion' as const, roundName: 'Final' }
    for (const r of c.rounds) {
      const tie: CupTie | undefined = r.ties.find((t) => t.homeId === id || t.awayId === id)
      if (tie?.winnerId && tie.winnerId !== id) return { state: 'eliminated' as const, roundName: r.name }
    }
    return { state: 'alive' as const, roundName: c.rounds[c.currentRound]?.name ?? '' }
  })
  /** Situação do clube gerenciado na Libertadores desta temporada. */
  const managedLibertadoresStatus = computed(() => {
    const l = libertadores.value
    const id = managedTeamId.value
    if (!l || !id || !groupOf(l, id)) return { state: 'absent' as const, stageName: '' }
    if (l.championId === id) return { state: 'champion' as const, stageName: 'Final' }
    if (l.stage >= GROUP_ROUNDS) {
      const alive = l.knockout.every((r) => r.ties.some((t) => (t.homeId === id || t.awayId === id) && (!t.winnerId || t.winnerId === id)))
      if (!alive) {
        const out = l.knockout.find((r) => r.ties.some((t) => (t.homeId === id || t.awayId === id) && t.winnerId && t.winnerId !== id))
        return { state: 'eliminated' as const, stageName: out?.name ?? 'Fase de grupos' }
      }
    }
    return { state: 'alive' as const, stageName: stageName(l.stage) }
  })
  const nextFixture = computed(
    () => currentFixtures.value.find((f) => f.homeId === managedTeamId.value || f.awayId === managedTeamId.value) ?? null,
  )
  const nextOpponent = computed(() => {
    const f = nextFixture.value
    if (!f) return null
    return getTeam(f.homeId === managedTeamId.value ? f.awayId : f.homeId)
  })
  const payroll = computed(() => managedTeam.value?.players.reduce((sum, p) => sum + p.salary, 0) ?? 0)

  // Saves anteriores ao estádio: cria um estádio padrão para a carreira existente.
  if (managedTeam.value && !stadium.value) stadium.value = createStadium(managedTeam.value)

  const managedDivision = computed<DivisionId>(() => managedTeam.value?.division ?? 'A')

  /** Classificação ordenada de uma divisão. */
  function divisionStandings(division: DivisionId) {
    return standings.value
      .filter((r) => getTeam(r.teamId)?.division === division)
      .sort((a, b) => {
        const pts = (r: StandingRow) => r.wins * 3 + r.draws
        return (
          pts(b) - pts(a) ||
          b.wins - a.wins ||
          b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
          b.goalsFor - a.goalsFor
        )
      })
  }

  /** Classificação da divisão do clube gerenciado. */
  const sortedStandings = computed(() => divisionStandings(managedDivision.value))

  /** Contexto de público de qualquer clube: reputação e posição atual na tabela da sua série. */
  function gateContextFor(teamId: string): GateContext {
    const team = getTeam(teamId)
    const table = team ? divisionStandings(team.division) : []
    const position = table.findIndex((r) => r.teamId === teamId) + 1
    return {
      reputation: team?.reputation ?? 0,
      tablePosition: position || Math.ceil(table.length / 2),
      totalTeams: table.length,
    }
  }

  /** Contexto usado para estimar o público do clube gerenciado. */
  const gateContext = computed<GateContext>(() => gateContextFor(managedTeamId.value ?? ''))
  const gateEstimate = computed(() => (stadium.value ? estimateGate(stadium.value, gateContext.value) : null))

  /**
   * Estádio e público de um jogo, calculados quando a rodada começa.
   * O clube gerenciado usa o próprio estádio (melhorias e preço do ingresso);
   * os da IA usam um estádio padrão pelo tamanho do clube.
   */
  function matchVenue(homeId: string, awayId: string): MatchVenue | undefined {
    const home = getTeam(homeId)
    const away = getTeam(awayId)
    if (!home || !away) return undefined
    const ctx = gateContextFor(homeId)
    const isManaged = homeId === managedTeamId.value && stadium.value
    const venue = isManaged ? stadium.value! : createStadium(home)
    // Clubes da IA cobram o ingresso que maximiza a renda, então nem sempre lotam.
    if (!isManaged) venue.ticketPrice = bestTicketPrice(venue, ctx)
    return {
      name: venue.name,
      attendance: matchAttendance(venue, ctx, away.reputation),
      capacity: stadiumCapacity(venue),
    }
  }

  /** Clube da liga ou, se não for, um estrangeiro da Libertadores. */
  function getTeam(id: string) {
    return teams.value.find((t) => t.id === id) ?? continentalTeams.value.find((t) => t.id === id) ?? null
  }

  function addNews(message: string) {
    news.value.unshift(message)
    news.value = news.value.slice(0, 20)
  }

  /** Guarda manchetes novas no topo (sem repetir) e descarta as mais antigas. */
  function addHeadlines(items: (Headline | null)[]) {
    const fresh = items.filter((h): h is Headline => !!h && !headlines.value.some((x) => x.id === h.id))
    if (!fresh.length) return
    headlines.value = [...fresh, ...headlines.value].slice(0, MAX_HEADLINES)
  }

  function findManagedPlayer(playerId: string) {
    return managedTeam.value?.players.find((p) => p.id === playerId) ?? null
  }

  function applyLineup(team: Team, formation: Formation) {
    const chosen = pickBestLineup(team.players, formation)
    team.players.forEach((p) => {
      p.starter = chosen.has(p.id)
      delete p.role
      delete p.lineupSlot
    })
  }

  function startCareer(teamId: string, name: string) {
    beginCareer(leagueTeams(), teamId, name, leagueReserveTeams())
  }

  /** Começa a carreira com um clube criado pelo jogador, no lugar do mais fraco da série. */
  function startCustomCareer(draft: CustomTeamDraft, name: string) {
    const { teams: league, replaced } = createTeamsWithCustom(draft, leagueTeams())
    beginCareer(league, CUSTOM_TEAM_ID, name, leagueReserveTeams())
    addNews(`O ${replaced.name} deixa a ${DIVISION_LABELS[draft.division]} para dar lugar ao ${draft.name.trim()}.`)
  }

  function beginCareer(league: Team[], teamId: string, name: string, reserve: Team[] = []) {
    calendarStartYear.value = defaultStartYear()
    setActiveFormat(formatOfTeams(league))
    // Depois do formato: a Série C só vale no 2×20 (e marca a zona de rebaixamento da última série).
    reserveTeams.value = reserve
    teams.value = league
    managedTeamId.value = teamId
    managerName.value = name.trim() || 'Treinador'
    season.value = 1
    round.value = 0
    tactic.value = { formation: '4-4-2', style: 'equilibrado', marking: 'media' }
    news.value = []
    headlines.value = []
    bestXIHistory.value = []
    transferOffers.value = []
    transferHistory.value = []
    negotiationAttempts.value = {}
    jobOffers.value = []
    libertadoresQualified.value = []
    startSeason()
    const team = managedTeam.value!
    budget.value = team.reputation * 100_000
    stadium.value = createStadium(team)
    managers.value = createManagers(teams.value, teamId, managerName.value)
    addReserveManagers()
    trophiesAwardedSeason.value = 0
    resetConfidence(START_CONFIDENCE)
    dismissal.value = null
    refreshAcademy()
    addNews(`${managerName.value} assume o comando do ${team.name}!`)
  }

  function startSeason() {
    round.value = 0
    trainedThisRound.value = []
    leagueResults.value = {}
    seasonStats.value = {}
    // Cada divisão tem seu turno e returno; todas jogam a mesma rodada ao mesmo tempo.
    const perDivision = DIVISIONS.map((d) => generateFixtures(teamsByDivision(teams.value, d).map((t) => t.id)))
    const totalRounds = Math.max(...perDivision.map((r) => r.length))
    fixtures.value = Array.from({ length: totalRounds }, (_, i) => perDivision.flatMap((rounds) => rounds[i] ?? []))
    standings.value = teams.value.map((t) => ({
      teamId: t.id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    }))
    teams.value.forEach((t) => {
      // Nova temporada: energia cheia e cartões zerados (lesões continuam valendo).
      t.players.forEach((p) => {
        p.energy = 100
        p.yellowCards = 0
        p.suspension = 0
      })
      applyLineup(t, t.id === managedTeamId.value ? tactic.value.formation : AI_TACTIC.formation)
    })
    cup.value = createCup(teams.value, season.value, 0, totalRounds)
    startLibertadores(0)
  }

  /**
   * Libertadores da temporada: os classificados do Brasil (os 4 primeiros da Série A anterior; na 1ª temporada,
   * os de maior reputação) e os clubes do continente, com elencos renovados.
   * `playedRounds` empurra o calendário quando ela começa com o campeonato em andamento (saves antigos).
   */
  function startLibertadores(playedRounds: number) {
    continentalTeams.value = createContinentalTeams()
    continentalTeams.value.forEach((t) => applyLineup(t, AI_TACTIC.formation))
    const topFlight = teams.value.filter((t) => t.division === DIVISIONS[0])
    const qualified = libertadoresQualified.value.map((id) => getTeam(id)).filter((t): t is Team => !!t && !t.country)
    const brazil = (qualified.length === BRAZIL_SPOTS ? qualified : [...topFlight].sort((a, b) => b.reputation - a.reputation))
      .slice(0, BRAZIL_SPOTS)
    libertadores.value = createLibertadores(
      [...brazil, ...continentalTeams.value],
      season.value,
      fixtures.value.length,
      cup.value?.schedule ?? [],
      playedRounds,
      // Sorteio com gerador próprio: não mexe na sequência de Math.random usada pelas partidas.
      createRng(hashString(`libertadores-${season.value}`) ^ Date.now()).next,
    )
    libertadoresQualified.value = []
    const id = managedTeamId.value
    if (id && brazil.some((t) => t.id === id)) {
      const group = groupOf(libertadores.value, id)!
      const rivals = group.teamIds.filter((x) => x !== id).map((x) => getTeam(x)?.name).join(', ')
      addNews(`🌎 ${LIBERTADORES_NAME}: seu time caiu no Grupo ${group.name}, com ${rivals}.`)
    }
  }

  /** Quem sobe e quem cai, pela classificação final de cada divisão (sem aplicar). */
  function computeSeasonMoves() {
    const moves: { team: Team; to: DivisionId; up: boolean }[] = []
    for (const division of DIVISIONS) {
      const table = divisionStandings(division)
      const above = divisionAbove(division)
      const below = divisionBelow(division)
      if (above) {
        table.slice(0, PROMOTION_SPOTS).forEach((r) => moves.push({ team: getTeam(r.teamId)!, to: above, up: true }))
      }
      if (below) {
        table.slice(-RELEGATION_SPOTS).forEach((r) => moves.push({ team: getTeam(r.teamId)!, to: below, up: false }))
      } else if (hasReserve()) {
        // Última série do 2×20: os últimos caem para a Série C, que fica fora da liga.
        table.slice(-RELEGATION_SPOTS).forEach((r) => moves.push({ team: getTeam(r.teamId)!, to: 'C', up: false }))
      }
    }
    return moves
  }

  /** Há Série C para trocar clubes com a última série (só no 2×20 das ligas base). */
  function hasReserve() {
    // Lê a Série C primeiro: assim o watchEffect abaixo volta a rodar quando ela muda.
    return reserveTeams.value.length >= RELEGATION_SPOTS && ACTIVE_FORMAT === '2x20'
  }

  // A tabela mostra a zona de rebaixamento da última série quando há Série C.
  watchEffect(() => setBottomRelegation(hasReserve()), { flush: 'sync' })

  /** O clube gerenciado cai para a Série C (fora da liga) nesta virada: precisa trocar de clube. */
  const managedFallsOut = computed(
    () => !!managedTeamId.value && isSeasonOver.value && projectedDivision(managedTeamId.value) === 'C',
  )

  /** Técnicos para os clubes da Série C (quem sobe já chega com o seu técnico). */
  function addReserveManagers() {
    const missing = reserveTeams.value.filter((t) => !managers.value.some((m) => m.teamId === t.id))
    if (!missing.length) return
    managers.value.push(...createManagers(missing, '__ninguem__', '').filter((m) => !m.isPlayer))
  }

  /**
   * Troca com a Série C: quem caiu sai da liga e 4 clubes de lá sobem para a última série
   * (os mais fortes têm mais chance; quem acabou de cair não volta na mesma virada).
   */
  function exchangeWithReserve() {
    const out = teams.value.filter((t) => t.division === 'C')
    if (!out.length) return
    const last = DIVISIONS.at(-1)!
    const pool = [...reserveTeams.value]
    const promoted: Team[] = []
    while (promoted.length < out.length && pool.length) {
      const total = pool.reduce((sum, t) => sum + t.reputation ** 2, 0)
      let roll = Math.random() * total
      const index = pool.findIndex((t) => (roll -= t.reputation ** 2) <= 0)
      promoted.push(...pool.splice(index < 0 ? pool.length - 1 : index, 1))
    }
    for (const t of promoted) {
      t.division = last
      t.players.forEach((p) => {
        p.forSale = false
        delete p.loan
      })
      applyLineup(t, AI_TACTIC.formation)
    }
    teams.value = [...teams.value.filter((t) => t.division !== 'C'), ...promoted]
    reserveTeams.value = [...pool, ...out]
    addReserveManagers()
    addNews(`⬇️ Caem para a Série C: ${out.map((t) => t.name).join(', ')}.`)
    addNews(`⬆️ Sobem da Série C para a ${DIVISION_LABELS[last]}: ${promoted.map((t) => t.name).join(', ')}.`)
  }

  /** Série de um clube na próxima temporada (já com acesso e rebaixamento). */
  function projectedDivision(teamId: string): DivisionId {
    const move = computeSeasonMoves().find((m) => m.team.id === teamId)
    return move?.to ?? getTeam(teamId)?.division ?? 'D'
  }

  /** Avaliação da temporada do técnico (só faz sentido com a temporada encerrada). */
  const seasonReview = computed(() => {
    if (!isSeasonOver.value || !managedTeamId.value) return null
    const table = sortedStandings.value
    const position = table.findIndex((r) => r.teamId === managedTeamId.value) + 1
    const zone = tableZone(managedDivision.value, position, table.length)
    const cupWins = cup.value?.rounds.flatMap((r) => r.ties).filter((t) => t.winnerId === managedTeamId.value).length ?? 0
    const cupChampion = cup.value?.championId === managedTeamId.value
    return reviewSeason(managedDivision.value, position, table.length, zone, cupWins, cupChampion)
  })

  /** Abre a janela de técnicos: gera as propostas uma vez por temporada encerrada. */
  function ensureJobOffers() {
    if (!seasonReview.value || jobOffers.value.length || !managedTeamId.value) return
    const divisions = new Map(teams.value.map((t) => [t.id, projectedDivision(t.id)]))
    const last = DIVISIONS.at(-1)!
    const staying = teams.value.filter((t) => t.id === managedTeamId.value || divisions.get(t.id) !== 'C')
    jobOffers.value = generateJobOffers(
      staying,
      managedTeamId.value,
      (id) => {
        const d = divisions.get(id) ?? last
        return d === 'C' ? last : d
      },
      seasonReview.value.score,
    )
    addNews(`💼 Janela de técnicos aberta: ${jobOffers.value.length} clubes querem contratar você.`)
  }

  /** Acesso e rebaixamento com base na classificação final de cada divisão. */
  function applyPromotionsAndRelegations() {
    const moves = computeSeasonMoves()
    // Aplica só depois de calcular tudo, para um time não subir e cair na mesma virada.
    for (const { team, to, up } of moves) {
      team.division = to
      team.reputation = clamp(team.reputation + (up ? REPUTATION_SWING : -REPUTATION_SWING), 30, 95)
      if (team.id === managedTeamId.value) {
        addNews(up ? `🎉 Acesso! O ${team.name} vai disputar a ${DIVISION_LABELS[to]}.` : `Rebaixado: o ${team.name} cai para a ${DIVISION_LABELS[to]}.`)
      }
    }
  }

  /**
   * O técnico troca de clube. O caixa e o estádio são do clube: o novo começa com o caixa
   * inicial pelo tamanho dele e com o próprio estádio; o antigo passa a ser da IA.
   */
  function switchClub(newTeamId: string) {
    const oldTeam = managedTeam.value
    const newTeam = getTeam(newTeamId)
    if (!oldTeam || !newTeam || newTeam.id === oldTeam.id) return
    oldTeam.players.forEach((p) => {
      p.forSale = false
      p.askingPrice = undefined
    })
    managedTeamId.value = newTeam.id
    budget.value = newTeam.reputation * 100_000
    stadium.value = createStadium(newTeam)
    transferOffers.value = []
    negotiationAttempts.value = {}
    // O técnico da IA do clube novo assume o clube que você deixou.
    const replaced = managers.value.find((m) => !m.isPlayer && m.teamId === newTeam.id)
    if (replaced) replaced.teamId = oldTeam.id
    const me = managers.value.find((m) => m.isPlayer)
    if (me) me.teamId = newTeam.id
    addNews(`🤝 ${managerName.value} deixa o ${oldTeam.name} e é o novo técnico do ${newTeam.name}!`)
    if (replaced) addNews(`${replaced.name} deixa o ${newTeam.name} e assume o ${oldTeam.name}.`)
    resetConfidence(NEW_JOB_CONFIDENCE)
    refreshAcademy()
  }

  /** Vira a temporada; com `newTeamId`, o técnico assume outro clube (janela de técnicos). */
  function nextSeason(newTeamId?: string) {
    // Seu clube caiu para a Série C (fora da liga): não dá para ficar nele.
    if (!newTeamId && managedFallsOut.value) {
      ensureJobOffers()
      newTeamId = jobOffers.value[0]?.teamId
    }
    // Vagas na próxima Libertadores: os primeiros da Série A, antes do acesso e do rebaixamento.
    libertadoresQualified.value = divisionStandings(DIVISIONS[0]).slice(0, BRAZIL_SPOTS).map((r) => r.teamId)
    // Emprestados voltam antes de qualquer troca de clube ou de série.
    returnAllLoans()
    applyPromotionsAndRelegations()
    if (newTeamId) switchClub(newTeamId)
    exchangeWithReserve()
    jobOffers.value = []
    season.value++
    renewSquads()
    startSeason()
    addNews(`Começa a temporada ${season.value}, agora na ${DIVISION_LABELS[managedDivision.value]}!`)
  }

  /**
   * Virada de temporada nos elencos: todos fazem aniversário e evoluem (ou caem) pela idade,
   * veteranos se aposentam e a base repõe as vagas com jovens.
   */
  function renewSquads() {
    const rng = createRng(hashString(`temporada-${season.value}`) ^ Date.now())
    // A Série C também envelhece e se renova (como clubes da IA).
    for (const team of [...teams.value, ...reserveTeams.value]) {
      for (const p of team.players) {
        p.age++
        applyProgression(p, rng)
      }
      // No seu clube a base não sobe ninguém sozinha: você escolhe na lista da base.
      const mine = team.id === managedTeamId.value
      const { retired, promoted, signed } = renewSquad(team, season.value, rng, { youth: !mine })
      if (!mine) continue
      // Quem se aposentou sai de qualquer lista de venda ou proposta.
      transferOffers.value = transferOffers.value.filter((o) => !retired.some((p) => p.id === o.playerId))
      if (retired.length) addNews(`👋 Aposentaram-se: ${retired.map((p) => `${p.name} (${p.age})`).join(', ')}.`)
      if (promoted.length) {
        const names = promoted.map((p) => `${p.name}${p.star ? ' ★' : ''} (${p.position}, ${p.overall})`).join(', ')
        addNews(`🎓 Subiram da base: ${names}.`)
      }
      if (signed.length) {
        const names = signed.map((p) => `${p.name}${p.star ? ' ★' : ''} (${p.position}, ${p.age} anos, ${p.overall})`).join(', ')
        addNews(`✍️ Sem clube, contratados para completar o elenco: ${names}.`)
      }
    }
    const dismissed = academy.value?.players.length ?? 0
    refreshAcademy()
    addNews(
      `🎓 Nova geração na base: ${academy.value?.players.length ?? 0} jovens esperando uma chance` +
        (dismissed ? ` (${dismissed} da turma anterior foram dispensados).` : '.'),
    )
  }

  // --- Categorias de base ---

  /** Gera a lista da base do clube gerenciado para a temporada atual (a anterior é dispensada). */
  function refreshAcademy() {
    const team = managedTeam.value
    if (!team) {
      academy.value = null
      return
    }
    const rng = createRng(hashString(`base-${team.id}-${season.value}`) ^ Date.now())
    academy.value = { teamId: team.id, season: season.value, players: createAcademy(team, season.value, rng) }
  }

  /** Por que o jovem não pode subir agora (ou null se pode). */
  function youthBlocker(playerId: string): string | null {
    if (!academy.value?.players.some((p) => p.id === playerId)) return 'Jogador não está na base.'
    if (!managedTeamId.value || !hasSquadRoom(managedTeamId.value)) return `Elenco cheio (${MAX_SQUAD_SIZE} jogadores): libere uma vaga antes.`
    return null
  }

  /** Sobe um jovem da base para o elenco principal. */
  function promoteYouth(playerId: string): string | null {
    const blocker = youthBlocker(playerId)
    if (blocker) return blocker
    const player = academy.value!.players.find((p) => p.id === playerId)!
    academy.value!.players = academy.value!.players.filter((p) => p.id !== playerId)
    managedTeam.value!.players.push({ ...player, starter: false })
    addNews(`🎓 ${player.name}${player.star ? ' ★' : ''} sobe da base (${player.position}, ${player.age} anos, OVR ${player.overall}).`)
    return null
  }

  // --- Confiança e demissão ---

  function resetConfidence(value: number) {
    confidence.value = { board: value, club: value }
    confidenceLog.value = []
  }

  /** Altera os medidores, registra o motivo, avisa quando o cargo fica ameaçado e demite em 0%. */
  function changeConfidence(board: number, club: number, reason: string) {
    if (!managedTeamId.value || dismissal.value || (board === 0 && club === 0)) return
    const before = { ...confidence.value }
    confidence.value = {
      board: clamp(Math.round(before.board + board), 0, 100),
      club: clamp(Math.round(before.club + club), 0, 100),
    }
    confidenceLog.value.unshift({ season: season.value, round: round.value + 1, board, club, reason })
    confidenceLog.value = confidenceLog.value.slice(0, 20)

    const crossed = (key: keyof Confidence) => before[key] > WARNING_CONFIDENCE && confidence.value[key] <= WARNING_CONFIDENCE
    if (crossed('board')) addNews('⚠️ A diretoria está insatisfeita: seu cargo está ameaçado.')
    if (crossed('club')) addNews('⚠️ A torcida e o vestiário perderam a paciência: seu cargo está ameaçado.')

    if (confidence.value.board <= 0) dismiss('A diretoria perdeu a confiança no seu trabalho.')
    else if (confidence.value.club <= 0) dismiss('A torcida e o elenco não aceitam mais o seu comando.')
  }

  /** Posição que a diretoria espera: o ranking de reputação do clube dentro da série. */
  function expectedPosition(teamId: string) {
    const team = getTeam(teamId)
    if (!team) return 0
    return teamsByDivision(teams.value, team.division)
      .sort((a, b) => b.reputation - a.reputation)
      .findIndex((t) => t.id === teamId) + 1
  }

  /** Demitido: clubes da mesma série ou de séries abaixo oferecem vaga (ou o técnico encerra a carreira). */
  function dismiss(reason: string) {
    const team = managedTeam.value
    if (!team) return
    // Rodada como o jogador vê (1 a N); no balanço do fim da temporada fica na última.
    dismissal.value = { teamId: team.id, season: season.value, round: Math.min(round.value + 1, totalRounds.value), reason }
    addNews(`❌ ${managerName.value} foi demitido do ${team.name}. ${reason}`)
    jobOffers.value = generateJobOffers(teams.value, team.id, (id) => getTeam(id)?.division ?? 'D', -2)
  }

  /** Depois da demissão: assume outro clube (no meio ou no fim da temporada). */
  function acceptJobAfterDismissal(teamId: string) {
    if (!dismissal.value) return
    if (isSeasonOver.value) nextSeason(teamId)
    else {
      switchClub(teamId)
      jobOffers.value = []
      relineupAiTeams()
      if (managedTeam.value) applyLineup(managedTeam.value, tactic.value.formation)
    }
    dismissal.value = null
  }

  /** Reação do clube a uma transferência do seu elenco. */
  function reactToTransfer(player: Player, direction: 'in' | 'out') {
    const team = managedTeam.value
    if (!team) return
    const others = team.players.filter((p) => p.id !== player.id)
    const average = others.reduce((sum, p) => sum + p.overall, 0) / Math.max(others.length, 1)
    if (direction === 'out') {
      const topThree = [...team.players, player].sort((a, b) => b.overall - a.overall).slice(0, 3).some((p) => p.id === player.id)
      if (player.star || topThree) changeConfidence(0, player.star ? -8 : -5, `Venda de ${player.name}, um dos destaques`)
    } else if (player.star) {
      changeConfidence(1, 6, `Chegada da estrela ${player.name}`)
    } else if (player.overall >= average + 5) {
      changeConfidence(0, 3, `Reforço de peso: ${player.name}`)
    }
  }

  function endCareer() {
    dismissal.value = null
    managedTeamId.value = null
    teams.value = []
    fixtures.value = []
    standings.value = []
  }

  // --- Controle de jogadores ---

  function trainPlayer(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player || trainedThisRound.value.includes(playerId) || !canTrain(player)) return
    trainedThisRound.value.push(playerId)
    player.energy = clamp(player.energy - trainingEnergyCost(player), 0, 100)
    const chance = player.age <= 23 ? 0.45 : player.age <= 29 ? 0.25 : 0.1
    if (Math.random() < chance) {
      player.overall = clamp(player.overall + 1, MIN_PLAYER_OVERALL, MAX_PLAYER_OVERALL)
      player.morale = clamp(player.morale + 3, 0, 100)
      addNews(`${player.name} evoluiu no treino (OVR ${player.overall}).`)
    }
  }

  function restPlayer(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player) return
    player.energy = clamp(player.energy + 25, 0, 100)
    player.morale = clamp(player.morale - 2, 0, 100)
  }

  /** Coloca à venda (pelo preço informado ou o valor de mercado) ou retira da lista. */
  function toggleForSale(playerId: string, price?: number) {
    const player = findManagedPlayer(playerId)
    // Emprestado não é seu para vender.
    if (!player || player.loan) return
    player.forSale = !player.forSale
    player.askingPrice = player.forSale ? normalizeAskingPrice(price ?? marketValue(player)) : undefined
  }

  /** Ajusta o preço pedido de um jogador já listado. */
  function setAskingPrice(playerId: string, price: number) {
    const player = findManagedPlayer(playerId)
    if (!player?.forSale || !Number.isFinite(price)) return
    player.askingPrice = normalizeAskingPrice(price)
  }

  // --- Transferências ---

  /** Motivo pelo qual o clube não pode liberar o jogador, ou null se pode. */
  function releaseBlocker(teamId: string, playerId: string): string | null {
    const team = getTeam(teamId)
    const player = team?.players.find((p) => p.id === playerId)
    if (!team || !player) return 'Jogador não encontrado.'
    if (player.loan) return `${player.name} está emprestado e não pode ser negociado.`
    if (team.players.length <= MIN_SQUAD_SIZE) return `${team.name} precisa manter ao menos ${MIN_SQUAD_SIZE} jogadores.`
    const goalkeepers = team.players.filter((p) => p.position === 'GOL').length
    if (player.position === 'GOL' && goalkeepers <= MIN_GOALKEEPERS) {
      return `${team.name} precisa manter ao menos ${MIN_GOALKEEPERS} goleiros.`
    }
    return null
  }

  function hasSquadRoom(teamId: string) {
    return (getTeam(teamId)?.players.length ?? MAX_SQUAD_SIZE) < MAX_SQUAD_SIZE
  }

  /** Move o jogador entre clubes e acerta o caixa do clube gerenciado. */
  function transferPlayer(playerId: string, fromTeamId: string, toTeamId: string, fee: number) {
    const from = getTeam(fromTeamId)
    const to = getTeam(toTeamId)
    const player = from?.players.find((p) => p.id === playerId)
    if (!from || !to || !player) return null

    from.players = from.players.filter((p) => p.id !== playerId)
    to.players.push({ ...player, starter: false, forSale: false, askingPrice: undefined, morale: clamp(player.morale + 5, 0, 100) })

    if (toTeamId === managedTeamId.value) budget.value -= fee
    if (fromTeamId === managedTeamId.value) budget.value += fee
    addHeadlines([
      saleHeadline({
        season: season.value, round: round.value + 1, playerName: player.name, overall: player.overall,
        fromName: from.name, toName: to.name, fromTeamId, toTeamId, fee,
      }),
    ])
    // Clubes da IA reorganizam a escalação para não jogar com desfalque.
    for (const team of [from, to]) {
      if (team.id !== managedTeamId.value) applyLineup(team, AI_TACTIC.formation)
    }
    return player
  }

  // --- Empréstimos ---

  /** Rodadas do campeonato que ainda faltam na temporada. */
  const roundsLeftInSeason = computed(() => Math.max(0, totalRounds.value - round.value))

  /** Todos os jogadores emprestados que envolvem o clube gerenciado. */
  const managedLoans = computed(() => {
    const id = managedTeamId.value
    const loans = teams.value.flatMap((t) => t.players.filter((p) => p.loan).map((p) => ({ player: p, loan: p.loan! })))
    return {
      incoming: loans.filter((l) => l.loan.toTeamId === id),
      outgoing: loans.filter((l) => l.loan.ownerTeamId === id),
    }
  })

  /** Leva o jogador por empréstimo; o clube que recebe paga a taxa ao dono. */
  function startLoan(playerId: string, ownerTeamId: string, toTeamId: string, rounds: number, fee: number) {
    const owner = getTeam(ownerTeamId)
    const to = getTeam(toTeamId)
    const player = owner?.players.find((p) => p.id === playerId)
    if (!owner || !to || !player) return null
    owner.players = owner.players.filter((p) => p.id !== playerId)
    to.players.push({
      ...player,
      starter: false,
      forSale: false,
      askingPrice: undefined,
      loan: { ownerTeamId, toTeamId, roundsLeft: rounds, fee },
    })
    if (toTeamId === managedTeamId.value) budget.value -= fee
    if (ownerTeamId === managedTeamId.value) budget.value += fee
    addHeadlines([
      loanHeadline({
        season: season.value, round: round.value + 1, playerName: player.name, overall: player.overall,
        fromName: owner.name, toName: to.name, fromTeamId: ownerTeamId, toTeamId, value: marketValue(player), fee, rounds,
      }),
    ])
    for (const team of [owner, to]) if (team.id !== managedTeamId.value) applyLineup(team, AI_TACTIC.formation)
    return player
  }

  /** Devolve um emprestado ao dono (fim do prazo, da temporada ou devolução antecipada). */
  function endLoan(playerId: string, reason: string) {
    const holder = teams.value.find((t) => t.players.some((p) => p.id === playerId && p.loan))
    const player = holder?.players.find((p) => p.id === playerId)
    const owner = player?.loan && getTeam(player.loan.ownerTeamId)
    if (!holder || !player || !owner) return
    const involvesMe = holder.id === managedTeamId.value || owner.id === managedTeamId.value
    holder.players = holder.players.filter((p) => p.id !== playerId)
    owner.players.push({ ...player, starter: false, loan: undefined })
    for (const team of [holder, owner]) if (team.id !== managedTeamId.value) applyLineup(team, AI_TACTIC.formation)
    if (involvesMe) addNews(`🔁 ${player.name} volta ao ${owner.name} (${reason}).`)
  }

  /** Após cada rodada do campeonato: conta o prazo, desenvolve jovens cedidos e devolve quem terminou. */
  function advanceLoans() {
    const loaned = teams.value.flatMap((t) => t.players.filter((p) => p.loan))
    for (const p of loaned) {
      const loan = p.loan!
      loan.roundsLeft--
      if (loan.ownerTeamId === managedTeamId.value && p.age <= LOAN_DEVELOPMENT_AGE && Math.random() < LOAN_DEVELOPMENT_CHANCE) {
        p.overall = clamp(p.overall + 1, MIN_PLAYER_OVERALL, MAX_PLAYER_OVERALL)
        addNews(`📈 ${p.name} ganhou minutos no empréstimo e evoluiu (OVR ${p.overall}).`)
      }
      if (loan.roundsLeft <= 0) endLoan(p.id, 'fim do empréstimo')
    }
  }

  function returnAllLoans() {
    for (const p of teams.value.flatMap((t) => t.players.filter((x) => x.loan))) endLoan(p.id, 'fim da temporada')
  }

  // --- Escalação e táticas ---

  function toggleStarter(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player) return
    // Suspensos e lesionados podem sair da escalação, mas não entrar.
    if (!player.starter && (starters.value.length >= 11 || !isAvailable(player))) return
    player.starter = !player.starter
    delete player.role
    delete player.lineupSlot
  }

  /** O técnico arrumou uma linha do campo: ids da esquerda para a direita. */
  function arrangeLine(ids: string[]) {
    ids.forEach((id, index) => {
      const player = findManagedPlayer(id)
      if (player?.starter) player.lineupSlot = index
    })
  }

  /** Move um titular para outra linha do campo (null ou a própria posição = volta para a dele). */
  function setRole(playerId: string, role: Position | null) {
    const player = findManagedPlayer(playerId)
    if (!player?.starter) return
    const before = playingPosition(player)
    if (!role || role === player.position) delete player.role
    else player.role = role
    // Mudou de linha: o lugar na linha antiga não vale mais.
    if (playingPosition(player) !== before) delete player.lineupSlot
  }

  /** Troca de reserva por titular: quem entra assume a linha de quem saiu. */
  function substituteStarter(outId: string, inId: string) {
    const out = findManagedPlayer(outId)
    const inn = findManagedPlayer(inId)
    if (!out?.starter || !inn || inn.starter || !isAvailable(inn)) return false
    const role = playingPosition(out)
    const slot = out.lineupSlot
    toggleStarter(outId)
    toggleStarter(inId)
    setRole(inId, role)
    // Quem entra fica no mesmo lugar do campo.
    if (slot !== undefined) inn.lineupSlot = slot
    return true
  }

  function autoSelectStarters() {
    if (managedTeam.value) applyLineup(managedTeam.value, tactic.value.formation)
  }

  /**
   * Troca a formação e ajusta os titulares para ela, mexendo o mínimo possível na escalação do técnico.
   * Retorna as mudanças feitas (para avisar na tela).
   */
  function setFormation(formation: Formation) {
    tactic.value.formation = formation
    return fitLineupToFormation(formation)
  }

  /**
   * Para cada vaga que faltar numa linha da formação, escolhe a melhor opção entre:
   * - um reserva da posição, que entra no lugar do titular mais fraco de uma linha com gente a mais;
   * - um titular de uma linha com gente a mais, improvisado na posição (rende menos fora dela).
   * Também completa a escalação se faltar titular (ex.: suspensos).
   */
  function fitLineupToFormation(formation: Formation): string[] {
    const team = managedTeam.value
    if (!team) return []
    const required = FORMATIONS[formation]
    const changes: string[] = []
    const starting = () => team.players.filter((p) => p.starter)
    const count = (pos: Position) => starting().filter((p) => playingPosition(p) === pos).length
    const surplusLines = () => POSITION_ORDER.filter((pos) => count(pos) > required[pos])
    // Na defesa, conta a função (LAT/ZAG) que falta para a formação: o jogador certo vale mais.
    const defNeed = () => {
      const split = defenseSplit(required.DEF)
      const current = starting().filter((p) => playingPosition(p) === 'DEF')
      return {
        LAT: split.LAT - current.filter((p) => defRoleOf(p) === 'LAT').length,
        ZAG: split.ZAG - current.filter((p) => defRoleOf(p) === 'ZAG').length,
      }
    }
    const roleFactor = (p: Player, pos: Position) => {
      const role = defRoleOf(p)
      if (pos !== 'DEF' || !role) return 1
      return defNeed()[role] > 0 ? 1 : DEF_ROLE_MISFIT
    }
    const value = (p: Player, pos: Position) =>
      effectiveRating(p) * positionFit(p.position, pos) * roleFactor(p, pos) * (p.forSale ? 0.97 : 1)
    const bench = () => team.players.filter((p) => !p.starter && isAvailable(p))

    for (const pos of POSITION_ORDER) {
      while (count(pos) < required[pos]) {
        const missingStarter = starting().length < 11
        const extras = starting().filter((p) => surplusLines().includes(playingPosition(p)))
        // Melhor reserva da posição (ou, sem nenhum, o reserva que melhor se adapta a ela).
        const fromBench = [...bench()].sort((a, b) => value(b, pos) - value(a, pos))[0]
        // Melhor titular sobrando noutra linha para improvisar aqui.
        const moved = [...extras].sort((a, b) => value(b, pos) - value(a, pos))[0]
        const useBench = fromBench && (missingStarter || !moved || value(fromBench, pos) >= value(moved, pos))

        if (useBench) {
          if (!missingStarter) {
            // Sai o titular mais fraco de uma linha que ficou com gente a mais (na defesa, da função que sobra).
            const surplus = (p: Player) => {
              const role = playingPosition(p) === 'DEF' ? defRoleOf(p) : null
              return role && defNeed()[role] < 0 ? 0.5 : 1
            }
            const out = [...extras].sort(
              (a, b) => value(a, playingPosition(a)) * surplus(a) - value(b, playingPosition(b)) * surplus(b),
            )[0]
            if (!out) break
            out.starter = false
            delete out.role
            delete out.lineupSlot
            changes.push(`${out.name} (${out.position}) foi para o banco`)
          }
          fromBench.starter = true
          delete fromBench.lineupSlot
          if (fromBench.position === pos) delete fromBench.role
          else fromBench.role = pos
          changes.push(`${fromBench.name} entrou ${fromBench.position === pos ? `como ${pos}` : `improvisado como ${pos}`}`)
        } else if (moved) {
          moved.role = pos === moved.position ? undefined : pos
          if (!moved.role) delete moved.role
          delete moved.lineupSlot
          changes.push(`${moved.name} (${moved.position}) passou a jogar como ${pos}`)
        } else {
          break
        }
      }
    }
    return changes
  }

  function setStyle(style: PlayStyle) {
    tactic.value.style = style
  }

  function setMarking(marking: Marking) {
    tactic.value.marking = marking
  }

  /** Tática em uso: a sua para o clube gerenciado, a padrão da IA para os outros. */
  function tacticFor(teamId: string): Tactic {
    return teamId === managedTeamId.value ? tactic.value : AI_TACTIC
  }

  function teamStrength(teamId: string) {
    const team = getTeam(teamId)
    if (!team) return { attack: 0, defense: 0, matchesFormation: false }
    return lineupStrength(team.players.filter((p) => p.starter), tacticFor(teamId))
  }

  /** Multiplicador de força do mandante; o clube gerenciado ganha bônus pelo gramado. */
  function homeAdvantage(teamId: string) {
    const bonus = teamId === managedTeamId.value && stadium.value ? homeAdvantageBonus(stadium.value) : 0
    return BASE_HOME_ADVANTAGE + bonus
  }

  // --- Estádio ---

  function setTicketPrice(price: number) {
    if (stadium.value) stadium.value.ticketPrice = clamp(Math.round(price), MIN_TICKET_PRICE, MAX_TICKET_PRICE)
  }

  /** Motivo pelo qual a obra não pode começar, ou null se pode. */
  function upgradeBlocker(key: StadiumUpgradeKey): string | null {
    const st = stadium.value
    if (!st) return 'Sem estádio.'
    if (st.construction) return 'Já há uma obra em andamento.'
    if (st.levels[key] >= MAX_UPGRADE_LEVEL) return 'Nível máximo atingido.'
    if (budget.value < upgradeCost(key, st.levels[key])) return 'Caixa insuficiente.'
    return null
  }

  function startStadiumUpgrade(key: StadiumUpgradeKey) {
    const st = stadium.value
    if (!st || upgradeBlocker(key)) return false
    const level = st.levels[key]
    const rounds = buildRounds(level)
    budget.value -= upgradeCost(key, level)
    st.construction = { key, roundsLeft: rounds, totalRounds: rounds }
    addNews(`Obras iniciadas: ${STADIUM_UPGRADES[key].label} nível ${level + 1} (${rounds} rodada${rounds > 1 ? 's' : ''}).`)
    return true
  }

  function advanceConstruction() {
    const st = stadium.value
    if (!st?.construction) return
    st.construction.roundsLeft--
    if (st.construction.roundsLeft > 0) return
    const { key } = st.construction
    st.levels[key]++
    st.construction = null
    addNews(`Obra concluída: ${STADIUM_UPGRADES[key].label} agora está no nível ${st.levels[key]}!`)
  }

  // --- Pós-rodada ---

  function applyRoundResults(matches: LiveMatch[]) {
    if (matches[0]?.competition === 'cup') return applyCupResults(matches)
    if (matches[0]?.competition === 'libertadores') return applyLibertadoresResults(matches)
    // Público calculado com a posição na tabela antes da rodada.
    const gateCtx = gateContext.value
    for (const m of matches) {
      const home = standings.value.find((s) => s.teamId === m.homeId)!
      const away = standings.value.find((s) => s.teamId === m.awayId)!
      home.played++
      away.played++
      home.goalsFor += m.homeGoals
      home.goalsAgainst += m.awayGoals
      away.goalsFor += m.awayGoals
      away.goalsAgainst += m.homeGoals
      const homeResult = Math.sign(m.homeGoals - m.awayGoals)
      if (homeResult > 0) { home.wins++; away.losses++ }
      else if (homeResult < 0) { away.wins++; home.losses++ }
      else { home.draws++; away.draws++ }

      recordMatch(seasonStats.value, m, playedIn(m), (id) => getTeam(id)?.division ?? 'A')
      updateTeamAfterMatch(m.homeId, homeResult, m.playedEnergy)
      updateTeamAfterMatch(m.awayId, -homeResult, m.playedEnergy)
      if (!m.playedEnergy) applySubstitutionFatigue(m)

      if (m.homeId === managedTeamId.value || m.awayId === managedTeamId.value) {
        const isHome = m.homeId === managedTeamId.value
        const result = isHome ? homeResult : -homeResult
        const opp = getTeam(isHome ? m.awayId : m.homeId)!
        const verb = result > 0 ? 'Vitória' : result < 0 ? 'Derrota' : 'Empate'
        leagueResults.value[round.value] = { homeId: m.homeId, awayId: m.awayId, homeGoals: m.homeGoals, awayGoals: m.awayGoals }
        addNews(`${verb} contra o ${opp.name}: ${m.homeGoals} x ${m.awayGoals}.`)

        budget.value += result > 0 ? 100_000 : 0
        budget.value -= payroll.value
        collectMatchIncome(isHome, opp.id, gateCtx, 'league', m.venue)

        // Favorito ou azarão, pela força dos times no começo do jogo.
        const mine = isHome ? (m.homeAttack + m.homeDefense) / 2 : (m.awayAttack + m.awayDefense) / 2
        const theirs = isHome ? (m.awayAttack + m.awayDefense) / 2 : (m.homeAttack + m.homeDefense) / 2
        const delta = leagueMatchDelta(result, isHome, Math.abs(m.homeGoals - m.awayGoals), mine - theirs)
        changeConfidence(delta.board, delta.club, `${verb} contra o ${opp.name} (${m.homeGoals} x ${m.awayGoals})`)
        // Ingresso muito acima do que a torcida acha justo irrita quem vai ao estádio.
        if (isHome && stadium.value && stadium.value.ticketPrice > idealTicketPrice(stadium.value) * 1.3) {
          changeConfidence(0, -2, 'Torcida reclama do preço do ingresso')
        }
      }
    }

    if (managedTeamId.value && round.value >= 2) {
      // A diretoria acompanha a tabela: acima do esperado agrada, abaixo preocupa.
      const position = divisionStandings(managedDivision.value).findIndex((r) => r.teamId === managedTeamId.value) + 1
      const drift = tableDriftDelta(expectedPosition(managedTeamId.value), position, divisionStandings(managedDivision.value).length)
      if (drift) changeConfidence(drift, 0, drift > 0 ? `Campanha acima do esperado (${position}º)` : `Campanha abaixo do esperado (${position}º)`)
    }
    if (managedTeamId.value && budget.value < 0) changeConfidence(-5, 0, 'Clube no vermelho')

    if (stadium.value) {
      budget.value -= stadiumUpkeep(stadium.value)
      advanceConstruction()
    }

    addHeadlines(
      matchHeadlines(matches, {
        season: season.value,
        round: round.value + 1,
        context: (m) => `${DIVISION_LABELS[getTeam(m.homeId)?.division ?? 'A']} · Rodada ${round.value + 1}`,
        teamName: (id) => getTeam(id)?.name ?? '?',
        division: (id) => getTeam(id)?.division,
      }),
    )

    applyDiscipline(matches)
    advanceLoans()
    round.value++
    trainedThisRound.value = []
    negotiationAttempts.value = {}
    relineupAiTeams()
    simulateLibertadoresWithoutManaged()
    announceSeasonEnd()
  }

  /**
   * Depois de cada partida: quem jogou cumpre um jogo das punições antigas, e depois
   * recebe as novas (cartões e lesões). A ordem garante que o castigo novo vale para o próximo jogo.
   */
  function applyDiscipline(matches: LiveMatch[]) {
    const myId = managedTeamId.value
    const played = new Set(matches.flatMap((m) => [m.homeId, m.awayId]))

    for (const teamId of played) {
      for (const p of getTeam(teamId)?.players ?? []) {
        const wasOut = !isAvailable(p)
        if (p.suspension) p.suspension--
        if (p.injury) p.injury--
        if (wasOut && isAvailable(p) && teamId === myId) addNews(`✅ ${p.name} está liberado e pode voltar a jogar.`)
      }
    }

    const plural = (n: number) => `${n} jogo${n > 1 ? 's' : ''}`
    for (const m of matches) {
      for (const e of m.events) {
        if (e.type === 'gol' || !e.playerId) continue
        const p = getTeam(e.teamId)?.players.find((x) => x.id === e.playerId)
        if (!p) continue
        const mine = e.teamId === myId

        if (e.type === 'amarelo') {
          // Amarelos de quem acabou expulso no mesmo jogo não contam para o acúmulo.
          if (m.events.some((x) => x.type === 'vermelho' && x.playerId === p.id)) continue
          p.yellowCards = (p.yellowCards ?? 0) + 1
          if (p.yellowCards >= YELLOWS_FOR_SUSPENSION) {
            p.yellowCards = 0
            p.suspension = (p.suspension ?? 0) + 1
            if (mine) addNews(`🟨 ${p.name} levou o ${YELLOWS_FOR_SUSPENSION}º amarelo e está suspenso por 1 jogo.`)
          }
        } else if (e.type === 'vermelho') {
          const games = e.secondYellow ? SECOND_YELLOW_SUSPENSION : DIRECT_RED_SUSPENSION
          p.suspension = (p.suspension ?? 0) + games
          if (mine) addNews(`🟥 ${p.name} foi expulso${e.secondYellow ? ' (2º amarelo)' : ''} e está suspenso por ${plural(games)}.`)
        } else if (e.type === 'lesao') {
          const games = e.games ?? 1
          p.injury = Math.max(p.injury ?? 0, games)
          if (mine) addNews(`🩹 ${p.name} se lesionou e vai desfalcar o time por ${plural(games)}.`)
        }

        // Quem ficou indisponível sai da escalação; o técnico precisa escolher o substituto.
        if (!isAvailable(p)) p.starter = false
      }
    }
  }

  /** Renda do clube gerenciado num jogo: bilheteria em casa ou cota fora. */
  function collectMatchIncome(
    isHome: boolean,
    opponentId: string,
    gateCtx: GateContext,
    competition: Competition,
    venue: MatchVenue | undefined,
  ) {
    if (!isHome || !stadium.value) {
      budget.value += AWAY_GAME_INCOME
      return
    }
    // Usa o público mostrado na partida; partidas antigas sem esse dado caem na estimativa.
    const attendance = venue?.attendance ?? estimateGate(stadium.value, gateCtx).attendance
    const revenue = gateRevenue(stadium.value, attendance)
    budget.value += revenue
    stadium.value.history.unshift({
      season: season.value,
      round: round.value + 1,
      opponentId,
      attendance,
      capacity: stadiumCapacity(stadium.value),
      revenue,
      competition,
    })
    stadium.value.history = stadium.value.history.slice(0, 15)
    addNews(`Público de ${attendance.toLocaleString('pt-BR')} torcedores rendeu ${formatMoney(revenue)}.`)
  }

  function relineupAiTeams() {
    teams.value.filter((t) => t.id !== managedTeamId.value).forEach((t) => applyLineup(t, AI_TACTIC.formation))
  }

  /** Resultados de uma fase da Copa: classifica os vencedores e sorteia a próxima fase. */
  function applyCupResults(matches: LiveMatch[]) {
    const c = cup.value
    const cupRound = currentCupRound.value
    if (!c || !cupRound) return
    const gateCtx = gateContext.value
    const prize = cupPrize(c, c.currentRound)
    const isFinal = cupRound.ties.length === 1

    for (const m of matches) {
      const tie = cupRound.ties.find((t) => t.homeId === m.homeId && t.awayId === m.awayId)
      if (!tie) continue
      tie.homeGoals = m.homeGoals
      tie.awayGoals = m.awayGoals
      tie.penalties = m.penalties
      // Garantia: um mata-mata empatado sem pênaltis registrados é decidido agora.
      if (m.homeGoals === m.awayGoals && !tie.penalties) {
        const home = getTeam(tie.homeId)?.players.filter((p) => p.starter) ?? []
        const away = getTeam(tie.awayId)?.players.filter((p) => p.starter) ?? []
        tie.penalties = shootoutScore(simulateShootout(tie.homeId, tie.awayId, home, away))
      }
      tie.winnerId = tieWinner(tie.homeId, tie.awayId, m.homeGoals, m.awayGoals, tie.penalties)

      const homeResult = tie.winnerId === tie.homeId ? 1 : -1
      updateTeamAfterMatch(tie.homeId, homeResult, m.playedEnergy)
      updateTeamAfterMatch(tie.awayId, -homeResult, m.playedEnergy)
      if (!m.playedEnergy) applySubstitutionFatigue(m)

      const id = managedTeamId.value
      if (tie.homeId === id || tie.awayId === id) {
        const isHome = tie.homeId === id
        const opp = getTeam(isHome ? tie.awayId : tie.homeId)!
        const pens = tie.penalties ? ` (pênaltis ${tie.penalties.home} x ${tie.penalties.away})` : ''
        const score = `${m.homeGoals} x ${m.awayGoals}${pens}`
        collectMatchIncome(isHome, opp.id, gateCtx, 'cup', m.venue)
        // Cair na Copa para um clube de série abaixo é vexame; avançar sempre anima.
        const upset = DIVISIONS.indexOf(opp.division) > DIVISIONS.indexOf(managedDivision.value)
        if (tie.winnerId === id) changeConfidence(2, 3, `Classificação na Copa contra o ${opp.name}`)
        else if (!isFinal) changeConfidence(upset ? -6 : -2, upset ? -6 : -3, `Eliminação na Copa para o ${opp.name}`)
        if (tie.winnerId === id) {
          budget.value += prize
          addNews(
            isFinal
              ? `🏆 CAMPEÃO DA ${CUP_NAME.toUpperCase()}! Vitória sobre o ${opp.name}: ${score}. Prêmio de ${formatMoney(prize)}.`
              : `${CUP_NAME}: classificado contra o ${opp.name} (${score}). Prêmio de ${formatMoney(prize)}.`,
          )
        } else {
          if (isFinal) budget.value += CUP_RUNNER_UP_PRIZE
          addNews(
            isFinal
              ? `${CUP_NAME}: vice-campeão após perder para o ${opp.name} (${score}). Prêmio de ${formatMoney(CUP_RUNNER_UP_PRIZE)}.`
              : `${CUP_NAME}: eliminado pelo ${opp.name} ${inRound(cupRound.name)} (${score}).`,
          )
        }
      }
    }

    addHeadlines(
      matchHeadlines(matches, {
        season: season.value,
        round: round.value + 1,
        context: () => `${CUP_NAME} · ${cupRound.name}`,
        teamName: (id) => getTeam(id)?.name ?? '?',
        division: (id) => getTeam(id)?.division,
        winnerId: (m) => cupRound.ties.find((t) => t.homeId === m.homeId && t.awayId === m.awayId)?.winnerId ?? null,
      }),
    )

    applyDiscipline(matches)

    const winners = cupRound.ties.map((t) => t.winnerId!).filter(Boolean)
    if (isFinal) {
      c.championId = winners[0] ?? null
      if (c.championId !== managedTeamId.value) addNews(`${getTeam(c.championId!)?.name} conquista a ${CUP_NAME}!`)
    } else {
      c.rounds.push(nextCupRound(c, winners, teams.value))
      c.currentRound++
    }

    relineupAiTeams()
    simulateLibertadoresWithoutManaged()
    announceSeasonEnd()
  }

  // --- Libertadores ---

  /**
   * Resultados de uma etapa da Libertadores: atualiza os grupos ou o mata-mata, paga os prêmios do clube
   * gerenciado e prepara a etapa seguinte. `quick` = etapa simulada na hora, sem o seu clube (sem desgaste nem cartões).
   */
  function applyLibertadoresResults(matches: LiveMatch[], quick = false) {
    const l = libertadores.value
    if (!l || l.championId) return
    const ties = libertadoresTies(l)
    const groupStage = isGroupStage(l)
    const stage = l.stage
    const label = stageName(stage)
    const knockoutRound = groupStage ? null : l.knockout[stage - GROUP_ROUNDS]!
    const isFinal = knockoutRound?.ties.length === 1
    const gateCtx = gateContext.value
    const id = managedTeamId.value

    for (const m of matches) {
      const tie = ties.find((t) => t.homeId === m.homeId && t.awayId === m.awayId)
      if (!tie) continue
      tie.homeGoals = m.homeGoals
      tie.awayGoals = m.awayGoals
      tie.penalties = groupStage ? null : m.penalties
      // Mata-mata empatado sem pênaltis registrados é decidido agora.
      if (!groupStage && m.homeGoals === m.awayGoals && !tie.penalties) {
        const home = getTeam(tie.homeId)?.players.filter((p) => p.starter) ?? []
        const away = getTeam(tie.awayId)?.players.filter((p) => p.starter) ?? []
        tie.penalties = shootoutScore(simulateShootout(tie.homeId, tie.awayId, home, away))
      }
      tie.winnerId = tieWinner(tie.homeId, tie.awayId, m.homeGoals, m.awayGoals, tie.penalties)

      if (!quick) {
        const homeResult = tie.winnerId === null ? 0 : tie.winnerId === tie.homeId ? 1 : -1
        updateTeamAfterMatch(tie.homeId, homeResult, m.playedEnergy)
        updateTeamAfterMatch(tie.awayId, -homeResult, m.playedEnergy)
        if (!m.playedEnergy) applySubstitutionFatigue(m)
      }

      if (id && (tie.homeId === id || tie.awayId === id)) {
        const isHome = tie.homeId === id
        const opp = getTeam(isHome ? tie.awayId : tie.homeId)!
        const pens = tie.penalties ? ` (pênaltis ${tie.penalties.home} x ${tie.penalties.away})` : ''
        const score = `${m.homeGoals} x ${m.awayGoals}${pens}`
        collectMatchIncome(isHome, opp.id, gateCtx, 'libertadores', m.venue)
        if (groupStage) {
          if (stage === 0) {
            budget.value += LIBERTADORES_PRIZES.entry
            addNews(`🌎 Estreia na ${LIBERTADORES_NAME}: cota de participação de ${formatMoney(LIBERTADORES_PRIZES.entry)}.`)
          }
          const verb = tie.winnerId === id ? 'vitória' : tie.winnerId ? 'derrota' : 'empate'
          const prize = tie.winnerId === id ? LIBERTADORES_PRIZES.groupWin : tie.winnerId ? 0 : LIBERTADORES_PRIZES.groupDraw
          budget.value += prize
          addNews(`🌎 ${LIBERTADORES_NAME}: ${verb} contra o ${opp.name} (${score})${prize ? `, prêmio de ${formatMoney(prize)}` : ''}.`)
          if (tie.winnerId === id) changeConfidence(1, 2, `Vitória na ${LIBERTADORES_NAME} contra o ${opp.name}`)
          else if (tie.winnerId) changeConfidence(-1, -1, `Derrota na ${LIBERTADORES_NAME} para o ${opp.name}`)
        } else {
          const prize = LIBERTADORES_PRIZES.knockout[stage - GROUP_ROUNDS] ?? 0
          if (tie.winnerId === id) {
            budget.value += prize
            changeConfidence(
              isFinal ? 15 : 3,
              isFinal ? 20 : 4,
              isFinal ? `Campeão da ${LIBERTADORES_NAME}!` : `Classificação na ${LIBERTADORES_NAME} contra o ${opp.name}`,
            )
            addNews(
              isFinal
                ? `🏆 CAMPEÃO DA ${LIBERTADORES_NAME.toUpperCase()}! Vitória sobre o ${opp.name}: ${score}. Prêmio de ${formatMoney(prize)}.`
                : `🌎 ${LIBERTADORES_NAME}: classificado contra o ${opp.name} (${score}). Prêmio de ${formatMoney(prize)}.`,
            )
          } else {
            if (isFinal) budget.value += LIBERTADORES_PRIZES.runnerUp
            changeConfidence(-2, -3, `Eliminação na ${LIBERTADORES_NAME} para o ${opp.name}`)
            addNews(
              isFinal
                ? `🌎 ${LIBERTADORES_NAME}: vice-campeão após perder para o ${opp.name} (${score}). Prêmio de ${formatMoney(LIBERTADORES_PRIZES.runnerUp)}.`
                : `🌎 ${LIBERTADORES_NAME}: eliminado pelo ${opp.name} ${inRound(label)} (${score}).`,
            )
          }
        }
      }
    }

    addHeadlines(
      matchHeadlines(matches, {
        season: season.value,
        round: round.value + 1,
        context: () => `${LIBERTADORES_NAME} · ${label}`,
        teamName: (teamId) => getTeam(teamId)?.name ?? '?',
        // Entre países não há "série abaixo": só vale a diferença de força.
        division: () => undefined,
        winnerId: (m) => ties.find((t) => t.homeId === m.homeId && t.awayId === m.awayId)?.winnerId ?? null,
      }),
    )
    if (!quick) applyDiscipline(matches)

    if (groupStage) {
      l.stage++
      if (l.stage === GROUP_ROUNDS) {
        l.knockout.push(drawRoundOf16(l))
        announceGroupStageEnd()
      }
    } else if (isFinal) {
      l.championId = knockoutRound!.ties[0]!.winnerId
      if (l.championId !== id) addNews(`🌎 ${getTeam(l.championId!)?.name} conquista a ${LIBERTADORES_NAME}!`)
    } else {
      l.knockout.push(nextKnockoutRound(knockoutRound!))
      l.stage++
    }

    if (quick) return
    relineupAiTeams()
    continentalTeams.value.forEach((t) => applyLineup(t, AI_TACTIC.formation))
    simulateLibertadoresWithoutManaged()
    announceSeasonEnd()
  }

  /** Fim da fase de grupos: avisa se o clube gerenciado passou ou caiu. */
  function announceGroupStageEnd() {
    const l = libertadores.value
    const id = managedTeamId.value
    const group = l && id ? groupOf(l, id) : null
    if (!l || !id || !group) return
    const table = groupTable(l, l.groups.indexOf(group))
    const position = table.findIndex((r) => r.teamId === id) + 1
    if (position <= 2) {
      addNews(`🌎 ${LIBERTADORES_NAME}: seu time terminou em ${position}º no Grupo ${group.name} e está nas oitavas!`)
      changeConfidence(3, 4, `Classificado às oitavas da ${LIBERTADORES_NAME}`)
    } else {
      addNews(`🌎 ${LIBERTADORES_NAME}: seu time terminou em ${position}º no Grupo ${group.name} e está eliminado.`)
      changeConfidence(-4, -5, `Eliminado na fase de grupos da ${LIBERTADORES_NAME}`)
    }
  }

  /**
   * Etapas da Libertadores sem o clube gerenciado (fora do torneio ou já eliminado) são simuladas na hora,
   * sem precisar acompanhar os jogos.
   */
  function simulateLibertadoresWithoutManaged() {
    for (let guard = 0; guard < 20; guard++) {
      const l = libertadores.value
      if (!l || nextEvent.value !== 'libertadores') return
      const ties = libertadoresTies(l)
      const id = managedTeamId.value
      if (ties.some((t) => t.homeId === id || t.awayId === id)) return
      const matches: LiveMatch[] = ties.map((t, i) => {
        const home = teamStrength(t.homeId)
        const away = teamStrength(t.awayId)
        const homeSide = { attack: home.attack * homeAdvantage(t.homeId), defense: home.defense }
        const score = quickScore(homeSide, away)
        return {
          id: `libertadores-${season.value}-${l.stage}-${i}-sim`,
          competition: 'libertadores',
          knockout: !isGroupStage(l),
          penalties: null,
          homeId: t.homeId,
          awayId: t.awayId,
          homeGoals: score.home,
          awayGoals: score.away,
          homeAttack: homeSide.attack,
          homeDefense: home.defense,
          awayAttack: away.attack,
          awayDefense: away.defense,
          events: [],
        }
      })
      applyLibertadoresResults(matches, true)
    }
  }

  function managerOf(teamId: string) {
    return managers.value.find((m) => m.teamId === teamId) ?? null
  }

  /** Entrega as taças da temporada aos técnicos dos campeões de cada série e da Copa (uma vez só). */
  function awardTrophies() {
    if (trophiesAwardedSeason.value === season.value) return
    trophiesAwardedSeason.value = season.value
    const give = (teamId: string | null | undefined, trophy: Omit<Trophy, 'teamId' | 'season'>) => {
      const manager = teamId ? managerOf(teamId) : null
      if (!manager || !teamId) return
      const t: Trophy = { ...trophy, teamId, season: season.value }
      manager.trophies.push(t)
      if (manager.isPlayer) addNews(`🏆 Troféu para a sua prateleira: ${trophyLabel(t)} (temporada ${season.value})!`)
    }
    for (const division of DIVISIONS) give(divisionStandings(division)[0]?.teamId, { kind: 'league', division })
    give(cup.value?.championId, { kind: 'cup' })
    give(libertadores.value?.championId, { kind: 'libertadores' })
  }

  /** Quem entrou em campo por cada time (titulares e quem entrou; partidas antigas: só os titulares). */
  function playedIn(m: LiveMatch): Record<string, Player[]> {
    const out: Record<string, Player[]> = {}
    for (const teamId of [m.homeId, m.awayId]) {
      const players = getTeam(teamId)?.players ?? []
      out[teamId] = m.playedEnergy ? players.filter((p) => m.playedEnergy![p.id] !== undefined) : players.filter((p) => p.starter)
    }
    return out
  }

  // --- Seleção da temporada ---

  /** Seleção de cada série com os jogos até agora (parcial durante a temporada, final quando ela acaba). */
  const bestXI = computed(() => {
    const result: Partial<Record<DivisionId, BestXIEntry[]>> = {}
    for (const d of DIVISIONS) result[d] = bestEleven(seasonStats.value, d, round.value)
    return result
  })

  /** Guarda a seleção da temporada que acabou e avisa se tem jogador seu nela (uma vez por temporada). */
  function saveBestXI() {
    if (bestXIHistory.value.some((r) => r.season === season.value)) return
    bestXIHistory.value = [{ season: season.value, year: currentYear.value, divisions: bestXI.value }, ...bestXIHistory.value].slice(0, 20)
    const mine = (bestXI.value[managedDivision.value] ?? []).filter((e) => e.teamId === managedTeamId.value)
    addNews(
      mine.length
        ? `⭐ Seleção da ${DIVISION_LABELS[managedDivision.value]}: ${mine.map((e) => e.name).join(', ')} ${mine.length > 1 ? 'estão' : 'está'} entre os melhores da temporada!`
        : `⭐ Saiu a seleção da temporada de cada série. Nenhum jogador seu entrou na da ${DIVISION_LABELS[managedDivision.value]}.`,
    )
  }

  function announceSeasonEnd() {
    if (isSeasonOver.value) {
      const division = managedDivision.value
      const champion = getTeam(sortedStandings.value[0]!.teamId)!
      addNews(`Fim da temporada ${season.value}! ${champion.name} é o campeão da ${DIVISION_LABELS[division]}.`)
      const position = sortedStandings.value.findIndex((r) => r.teamId === managedTeamId.value) + 1
      const zone = tableZone(division, position, sortedStandings.value.length)
      if (zone === 'promotion') addNews(`Seu time terminou em ${position}º e garantiu o acesso!`)
      if (zone === 'relegation') addNews(`Seu time terminou em ${position}º e será rebaixado.`)
      saveBestXI()
      // O balanço da temporada vale uma vez só (mesma trava da entrega de troféus).
      const firstTime = trophiesAwardedSeason.value !== season.value
      awardTrophies()
      if (firstTime) {
        // Vagas na Libertadores da próxima temporada: os primeiros da Série A.
        const top = divisionStandings(DIVISIONS[0]).slice(0, BRAZIL_SPOTS)
        const names = top.map((r) => getTeam(r.teamId)?.name).join(', ')
        addNews(`🌎 Classificados para a ${LIBERTADORES_NAME} da próxima temporada: ${names}.`)
        if (top.some((r) => r.teamId === managedTeamId.value)) {
          addNews(`🌎 Seu time está garantido na ${LIBERTADORES_NAME} da próxima temporada!`)
        }
      }
      if (firstTime && managedTeamId.value) {
        const delta = seasonEndDelta(
          zone,
          position,
          expectedPosition(managedTeamId.value),
          cup.value?.championId === managedTeamId.value,
          sortedStandings.value.length,
        )
        changeConfidence(delta.board, delta.club, `Balanço da temporada ${season.value}: ${position}º lugar`)
      }
      // Demitido no balanço: as propostas já são as de quem perdeu o emprego.
      if (!dismissal.value) ensureJobOffers()
    }
  }

/** Gasto de energia de um jogo inteiro para o jogador. */
  /**
   * Substituições do intervalo: quem saiu jogou só meio jogo (devolve metade do desgaste)
   * e quem entrou também (perde metade, em vez de recuperar como reserva).
   */
  function applySubstitutionFatigue(m: LiveMatch) {
    // Proporcional aos minutos: quem entrou aos 60' jogou 1/3 do jogo; quem saiu devolve esse terço.
    for (const e of m.events.filter((x) => x.type === 'sub')) {
      const remaining = Math.max(0, 90 - e.minute) / 90
      const team = getTeam(e.teamId)
      const incoming = team?.players.find((p) => p.id === e.playerId)
      const outgoing = e.outId ? team?.players.find((p) => p.id === e.outId) : null
      if (incoming) incoming.energy = clamp(incoming.energy - SUB_ENTRY_ENERGY - Math.round(matchEnergyCost(incoming) * remaining), 0, 100)
      if (outgoing) outgoing.energy = clamp(outgoing.energy + Math.round(matchEnergyCost(outgoing) * remaining), 0, 100)
    }
  }

  /**
   * Depois do jogo: quem entrou em campo fica com a energia que tinha ao sair (desgaste ao vivo) e
   * recupera um pouco até a próxima partida; quem não jogou recupera mais.
   * Sem `played` (partidas antigas), titulares perdem o desgaste cheio.
   */
  function updateTeamAfterMatch(teamId: string, result: number, played?: Record<string, number>) {
    const team = getTeam(teamId)
    if (!team) return
    for (const p of team.players) {
      const finalEnergy = played?.[p.id]
      if (finalEnergy !== undefined) p.energy = clamp(finalEnergy + playedRecovery(p), 0, 100)
      else if (!played && p.starter) p.energy = clamp(p.energy - matchEnergyCost(p) + playedRecovery(p), 0, 100)
      else p.energy = clamp(p.energy + REST_RECOVERY, 0, 100)
      p.morale = clamp(p.morale + result * 5, 0, 100)
    }
  }

  // Saves anteriores à Libertadores: cria a da temporada atual, encaixada nas rodadas restantes.
  if (hasCareer.value && !libertadores.value && fixtures.value.length) startLibertadores(round.value)
  // Saves com a Libertadores em andamento sem o seu clube: põe em dia as etapas que já passaram.
  if (hasCareer.value) simulateLibertadoresWithoutManaged()

  return {
    teams, managedTeamId, managerName, budget, season, round, fixtures, standings, tactic, trainedThisRound, news, headlines, academy,
    transferOffers, transferHistory, negotiationAttempts, stadium, cup, jobOffers,
    hasCareer, managedTeam, starters, totalRounds, isSeasonOver, currentFixtures, nextFixture, nextOpponent,
    nextEvent, nextEventLabel, leagueFinished, cupFinished, currentCupRound, managedCupStatus,
    libertadores, continentalTeams, libertadoresQualified, libertadoresFinished, libertadoresKnockout, managedLibertadoresStatus,
    calendarStartYear, leagueResults, currentYear, calendar, nextEventDate,
    reserveTeams, hasReserve, managedFallsOut,
    seasonStats, bestXIHistory, bestXI,
    payroll, managedDivision, sortedStandings, divisionStandings, gateContext, gateEstimate, matchVenue,
    homeAdvantage, setTicketPrice, upgradeBlocker, startStadiumUpgrade,
    getTeam, startCareer, startCustomCareer, nextSeason, endCareer,
    seasonReview, projectedDivision, ensureJobOffers, managers, managerOf,
    confidence, confidenceLog, dismissal, expectedPosition, changeConfidence, acceptJobAfterDismissal, reactToTransfer,
    addNews, addHeadlines, refreshAcademy, youthBlocker, promoteYouth, trainPlayer, restPlayer, toggleForSale, setAskingPrice,
    roundsLeftInSeason, managedLoans, startLoan, endLoan,
    releaseBlocker, hasSquadRoom, transferPlayer,
    toggleStarter, setRole, substituteStarter, arrangeLine, autoSelectStarters, setFormation, setStyle, setMarking, teamStrength, tacticFor,
    applyRoundResults,
  }
})
