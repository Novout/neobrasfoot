import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { generateFixtures } from '../data/fixtures'
import { FORMATIONS, PLAY_STYLES, POSITION_ORDER } from '../data/tactics'
import {
  AWAY_GAME_INCOME, buildRounds, createStadium, estimateGate, homeAdvantageBonus, MAX_TICKET_PRICE, MAX_UPGRADE_LEVEL,
  MIN_TICKET_PRICE, STADIUM_UPGRADES, stadiumUpkeep, upgradeCost, type GateContext,
} from '../data/stadium'
import {
  DIVISION_LABELS, DIVISIONS, divisionAbove, divisionBelow, MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL, PROMOTION_SPOTS,
  RELEGATION_SPOTS, REPUTATION_SWING, tableZone,
} from '../data/divisions'
import {
  createTeams, createTeamsWithCustom, CUSTOM_TEAM_ID, teamsByDivision, type CustomTeamDraft,
} from '../data/teams'
import type {
  DivisionId, Fixture, Formation, LiveMatch, Player, PlayStyle, Stadium, StadiumUpgradeKey, StandingRow, Tactic, Team, TransferOffer,
  TransferRecord,
} from '../types/game'
import { clamp, formatMoney } from '../utils/random'
import { persistRefs } from '../utils/storage'

export const MIN_SQUAD_SIZE = 16
export const MAX_SQUAD_SIZE = 30
export const MIN_GOALKEEPERS = 2
const BASE_HOME_ADVANTAGE = 1.1
const AI_TACTIC: Tactic = { formation: '4-4-2', style: 'equilibrado' }

export function marketValue(player: Player) {
  const ageFactor = player.age <= 23 ? 1.3 : player.age >= 31 ? 0.6 : 1
  return Math.round((player.overall ** 2.5 * 20 * ageFactor) / 1000) * 1000
}

/** Rendimento efetivo do jogador considerando energia e moral. */
export function effectiveRating(player: Player) {
  return player.overall * (0.6 + 0.4 * (player.energy / 100)) * (0.9 + 0.2 * (player.morale / 100))
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0
}

/** Escolhe os melhores 11 respeitando a formação; jogadores à venda só entram se faltar opção. */
function pickBestLineup(players: Player[], formation: Formation): Set<string> {
  const chosen = new Set<string>()
  for (const position of POSITION_ORDER) {
    players
      .filter((p) => p.position === position)
      .sort((a, b) => Number(a.forSale) - Number(b.forSale) || effectiveRating(b) - effectiveRating(a))
      .slice(0, FORMATIONS[formation][position])
      .forEach((p) => chosen.add(p.id))
  }
  return chosen
}

export function lineupStrength(starters: Player[], tactic: Tactic) {
  const byPos = (pos: Player['position']) => starters.filter((p) => p.position === pos).map(effectiveRating)
  const gol = byPos('GOL')
  const def = byPos('DEF')
  const mei = byPos('MEI')
  const ata = byPos('ATA')

  let attack = average(ata) * 0.6 + average(mei) * 0.4
  let defense = average(def) * 0.6 + average(gol) * 0.25 + average(mei) * 0.15

  const required = FORMATIONS[tactic.formation]
  const matchesFormation = POSITION_ORDER.every((pos) => byPos(pos).length === required[pos])
  if (!matchesFormation) {
    attack *= 0.92
    defense *= 0.92
  }
  if (gol.length === 0) defense *= 0.6
  if (starters.length < 11) {
    attack *= starters.length / 11
    defense *= starters.length / 11
  }

  const style = PLAY_STYLES[tactic.style]
  return { attack: attack * style.attack, defense: defense / style.defense, matchesFormation }
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
  const tactic = ref<Tactic>({ formation: '4-4-2', style: 'equilibrado' })
  const trainedThisRound = ref<string[]>([])
  const news = ref<string[]>([])
  const transferOffers = ref<TransferOffer[]>([])
  const transferHistory = ref<TransferRecord[]>([])
  /** Propostas já feitas por jogador nesta rodada (limita a barganha). */
  const negotiationAttempts = ref<Record<string, number>>({})
  const stadium = ref<Stadium | null>(null)

  // Versão 2: introdução das divisões (saves de divisão única são descartados).
  persistRefs('career', {
    teams, managedTeamId, managerName, budget, season, round, fixtures, standings, tactic, trainedThisRound, news,
    transferOffers, transferHistory, negotiationAttempts, stadium,
  }, 2)

  const hasCareer = computed(() => managedTeamId.value !== null)
  const managedTeam = computed(() => teams.value.find((t) => t.id === managedTeamId.value) ?? null)
  const starters = computed(() => managedTeam.value?.players.filter((p) => p.starter) ?? [])
  const totalRounds = computed(() => fixtures.value.length)
  const isSeasonOver = computed(() => hasCareer.value && round.value >= totalRounds.value)
  const currentFixtures = computed(() => fixtures.value[round.value] ?? [])
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

  /** Contexto usado para estimar o público: reputação e posição atual na tabela. */
  const gateContext = computed<GateContext>(() => {
    const table = sortedStandings.value
    const position = table.findIndex((r) => r.teamId === managedTeamId.value) + 1
    return {
      reputation: managedTeam.value?.reputation ?? 0,
      tablePosition: position || Math.ceil(table.length / 2),
      totalTeams: table.length,
    }
  })
  const gateEstimate = computed(() => (stadium.value ? estimateGate(stadium.value, gateContext.value) : null))

  function getTeam(id: string) {
    return teams.value.find((t) => t.id === id) ?? null
  }

  function addNews(message: string) {
    news.value.unshift(message)
    news.value = news.value.slice(0, 20)
  }

  function findManagedPlayer(playerId: string) {
    return managedTeam.value?.players.find((p) => p.id === playerId) ?? null
  }

  function applyLineup(team: Team, formation: Formation) {
    const chosen = pickBestLineup(team.players, formation)
    team.players.forEach((p) => (p.starter = chosen.has(p.id)))
  }

  function startCareer(teamId: string, name: string) {
    beginCareer(createTeams(), teamId, name)
  }

  /** Começa a carreira com um clube criado pelo jogador, no lugar do mais fraco da série. */
  function startCustomCareer(draft: CustomTeamDraft, name: string) {
    const { teams: league, replaced } = createTeamsWithCustom(draft)
    beginCareer(league, CUSTOM_TEAM_ID, name)
    addNews(`O ${replaced.name} deixa a ${DIVISION_LABELS[draft.division]} para dar lugar ao ${draft.name.trim()}.`)
  }

  function beginCareer(league: Team[], teamId: string, name: string) {
    teams.value = league
    managedTeamId.value = teamId
    managerName.value = name.trim() || 'Treinador'
    season.value = 1
    round.value = 0
    tactic.value = { formation: '4-4-2', style: 'equilibrado' }
    news.value = []
    transferOffers.value = []
    transferHistory.value = []
    negotiationAttempts.value = {}
    startSeason()
    const team = managedTeam.value!
    budget.value = team.reputation * 100_000
    stadium.value = createStadium(team)
    addNews(`${managerName.value} assume o comando do ${team.name}!`)
  }

  function startSeason() {
    round.value = 0
    trainedThisRound.value = []
    // Cada divisão tem seu turno e returno; todas jogam a mesma rodada ao mesmo tempo.
    const perDivision = DIVISIONS.map((d) => generateFixtures(teamsByDivision(teams.value, d).map((t) => t.id)))
    const totalRounds = Math.max(...perDivision.map((r) => r.length))
    fixtures.value = Array.from({ length: totalRounds }, (_, i) => perDivision.flatMap((rounds) => rounds[i] ?? []))
    standings.value = teams.value.map((t) => ({
      teamId: t.id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    }))
    teams.value.forEach((t) => {
      t.players.forEach((p) => (p.energy = 100))
      applyLineup(t, t.id === managedTeamId.value ? tactic.value.formation : AI_TACTIC.formation)
    })
  }

  /** Acesso e rebaixamento com base na classificação final de cada divisão. */
  function applyPromotionsAndRelegations() {
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
      }
    }
    // Aplica só depois de calcular tudo, para um time não subir e cair na mesma virada.
    for (const { team, to, up } of moves) {
      team.division = to
      team.reputation = clamp(team.reputation + (up ? REPUTATION_SWING : -REPUTATION_SWING), 30, 95)
      if (team.id === managedTeamId.value) {
        addNews(up ? `🎉 Acesso! O ${team.name} vai disputar a ${DIVISION_LABELS[to]}.` : `Rebaixado: o ${team.name} cai para a ${DIVISION_LABELS[to]}.`)
      }
    }
  }

  function nextSeason() {
    applyPromotionsAndRelegations()
    season.value++
    teams.value.forEach((t) =>
      t.players.forEach((p) => {
        p.age++
        if (p.age >= 32) p.overall = clamp(p.overall - 2, MIN_PLAYER_OVERALL, MAX_PLAYER_OVERALL)
      }),
    )
    startSeason()
    addNews(`Começa a temporada ${season.value}, agora na ${DIVISION_LABELS[managedDivision.value]}!`)
  }

  function endCareer() {
    managedTeamId.value = null
    teams.value = []
    fixtures.value = []
    standings.value = []
  }

  // --- Controle de jogadores ---

  function trainPlayer(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player || trainedThisRound.value.includes(playerId) || player.energy < 20) return
    trainedThisRound.value.push(playerId)
    player.energy = clamp(player.energy - 15, 0, 100)
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

  function toggleForSale(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player) return
    player.forSale = !player.forSale
  }

  // --- Transferências ---

  /** Motivo pelo qual o clube não pode liberar o jogador, ou null se pode. */
  function releaseBlocker(teamId: string, playerId: string): string | null {
    const team = getTeam(teamId)
    const player = team?.players.find((p) => p.id === playerId)
    if (!team || !player) return 'Jogador não encontrado.'
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
    to.players.push({ ...player, starter: false, forSale: false, morale: clamp(player.morale + 5, 0, 100) })

    if (toTeamId === managedTeamId.value) budget.value -= fee
    if (fromTeamId === managedTeamId.value) budget.value += fee
    // Clubes da IA reorganizam a escalação para não jogar com desfalque.
    for (const team of [from, to]) {
      if (team.id !== managedTeamId.value) applyLineup(team, AI_TACTIC.formation)
    }
    return player
  }

  // --- Escalação e táticas ---

  function toggleStarter(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player) return
    if (!player.starter && starters.value.length >= 11) return
    player.starter = !player.starter
  }

  function autoSelectStarters() {
    if (managedTeam.value) applyLineup(managedTeam.value, tactic.value.formation)
  }

  function setFormation(formation: Formation) {
    tactic.value.formation = formation
  }

  function setStyle(style: PlayStyle) {
    tactic.value.style = style
  }

  function teamStrength(teamId: string) {
    const team = getTeam(teamId)
    if (!team) return { attack: 0, defense: 0, matchesFormation: false }
    const isManaged = teamId === managedTeamId.value
    return lineupStrength(team.players.filter((p) => p.starter), isManaged ? tactic.value : AI_TACTIC)
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

      updateTeamAfterMatch(m.homeId, homeResult)
      updateTeamAfterMatch(m.awayId, -homeResult)

      if (m.homeId === managedTeamId.value || m.awayId === managedTeamId.value) {
        const isHome = m.homeId === managedTeamId.value
        const result = isHome ? homeResult : -homeResult
        const opp = getTeam(isHome ? m.awayId : m.homeId)!
        const verb = result > 0 ? 'Vitória' : result < 0 ? 'Derrota' : 'Empate'
        addNews(`${verb} contra o ${opp.name}: ${m.homeGoals} x ${m.awayGoals}.`)

        budget.value += result > 0 ? 100_000 : 0
        budget.value -= payroll.value
        if (isHome && stadium.value) {
          const gate = estimateGate(stadium.value, gateCtx)
          budget.value += gate.total
          stadium.value.history.unshift({
            season: season.value,
            round: round.value + 1,
            opponentId: opp.id,
            attendance: gate.attendance,
            capacity: gate.capacity,
            revenue: gate.total,
          })
          stadium.value.history = stadium.value.history.slice(0, 15)
          addNews(`Público de ${gate.attendance.toLocaleString('pt-BR')} torcedores rendeu ${formatMoney(gate.total)}.`)
        } else {
          budget.value += AWAY_GAME_INCOME
        }
      }
    }

    if (stadium.value) {
      budget.value -= stadiumUpkeep(stadium.value)
      advanceConstruction()
    }

    round.value++
    trainedThisRound.value = []
    negotiationAttempts.value = {}
    teams.value.filter((t) => t.id !== managedTeamId.value).forEach((t) => applyLineup(t, AI_TACTIC.formation))

    if (isSeasonOver.value) {
      const division = managedDivision.value
      const champion = getTeam(sortedStandings.value[0]!.teamId)!
      addNews(`Fim da temporada ${season.value}! ${champion.name} é o campeão da ${DIVISION_LABELS[division]}.`)
      const position = sortedStandings.value.findIndex((r) => r.teamId === managedTeamId.value) + 1
      const zone = tableZone(division, position, sortedStandings.value.length)
      if (zone === 'promotion') addNews(`Seu time terminou em ${position}º e garantiu o acesso!`)
      if (zone === 'relegation') addNews(`Seu time terminou em ${position}º e será rebaixado.`)
    }
  }

  function updateTeamAfterMatch(teamId: string, result: number) {
    const team = getTeam(teamId)
    if (!team) return
    for (const p of team.players) {
      if (p.starter) p.energy = clamp(p.energy - (p.age >= 30 ? 30 : 22), 0, 100)
      else p.energy = clamp(p.energy + 20, 0, 100)
      p.morale = clamp(p.morale + result * 5, 0, 100)
    }
  }

  return {
    teams, managedTeamId, managerName, budget, season, round, fixtures, standings, tactic, trainedThisRound, news,
    transferOffers, transferHistory, negotiationAttempts, stadium,
    hasCareer, managedTeam, starters, totalRounds, isSeasonOver, currentFixtures, nextFixture, nextOpponent,
    payroll, managedDivision, sortedStandings, divisionStandings, gateContext, gateEstimate,
    homeAdvantage, setTicketPrice, upgradeBlocker, startStadiumUpgrade,
    getTeam, startCareer, startCustomCareer, nextSeason, endCareer,
    addNews, trainPlayer, restPlayer, toggleForSale,
    releaseBlocker, hasSquadRoom, transferPlayer,
    toggleStarter, autoSelectStarters, setFormation, setStyle, teamStrength,
    applyRoundResults,
  }
})
