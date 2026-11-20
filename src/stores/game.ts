import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { generateFixtures } from '../data/fixtures'
import { FORMATIONS, PLAY_STYLES, POSITION_ORDER } from '../data/tactics'
import { createTeams } from '../data/teams'
import type { Fixture, Formation, LiveMatch, Player, PlayStyle, StandingRow, Tactic, Team } from '../types/game'
import { clamp } from '../utils/random'

const MIN_SQUAD_SIZE = 16
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

/** Escolhe os melhores 11 respeitando a formação. */
function pickBestLineup(players: Player[], formation: Formation): Set<string> {
  const chosen = new Set<string>()
  const available = players.filter((p) => !p.forSale)
  for (const position of POSITION_ORDER) {
    available
      .filter((p) => p.position === position)
      .sort((a, b) => effectiveRating(b) - effectiveRating(a))
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

  const sortedStandings = computed(() =>
    [...standings.value].sort((a, b) => {
      const pts = (r: StandingRow) => r.wins * 3 + r.draws
      return (
        pts(b) - pts(a) ||
        b.wins - a.wins ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor
      )
    }),
  )

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
    teams.value = createTeams()
    managedTeamId.value = teamId
    managerName.value = name.trim() || 'Treinador'
    season.value = 1
    round.value = 0
    tactic.value = { formation: '4-4-2', style: 'equilibrado' }
    news.value = []
    startSeason()
    const team = managedTeam.value!
    budget.value = team.reputation * 100_000
    addNews(`${managerName.value} assume o comando do ${team.name}!`)
  }

  function startSeason() {
    round.value = 0
    trainedThisRound.value = []
    fixtures.value = generateFixtures(teams.value.map((t) => t.id))
    standings.value = teams.value.map((t) => ({
      teamId: t.id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    }))
    teams.value.forEach((t) => {
      t.players.forEach((p) => (p.energy = 100))
      applyLineup(t, t.id === managedTeamId.value ? tactic.value.formation : AI_TACTIC.formation)
    })
  }

  function nextSeason() {
    season.value++
    teams.value.forEach((t) =>
      t.players.forEach((p) => {
        p.age++
        if (p.age >= 32) p.overall = clamp(p.overall - 2, 40, 99)
      }),
    )
    startSeason()
    addNews(`Começa a temporada ${season.value}!`)
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
      player.overall = clamp(player.overall + 1, 40, 99)
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
    if (player.forSale) player.starter = false
  }

  function sellPlayer(playerId: string) {
    const team = managedTeam.value
    const player = findManagedPlayer(playerId)
    if (!team || !player || team.players.length <= MIN_SQUAD_SIZE) return false
    const value = marketValue(player)
    budget.value += value
    team.players = team.players.filter((p) => p.id !== playerId)
    addNews(`${player.name} foi vendido por ${value.toLocaleString('pt-BR')} reais.`)
    return true
  }

  // --- Escalação e táticas ---

  function toggleStarter(playerId: string) {
    const player = findManagedPlayer(playerId)
    if (!player || player.forSale) return
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

  // --- Pós-rodada ---

  function applyRoundResults(matches: LiveMatch[]) {
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
        budget.value += (isHome ? 300_000 : 80_000) + (result > 0 ? 100_000 : 0)
        budget.value -= payroll.value
        const opp = getTeam(isHome ? m.awayId : m.homeId)!
        const verb = result > 0 ? 'Vitória' : result < 0 ? 'Derrota' : 'Empate'
        addNews(`${verb} contra o ${opp.name}: ${m.homeGoals} x ${m.awayGoals}.`)
      }
    }

    round.value++
    trainedThisRound.value = []
    teams.value.filter((t) => t.id !== managedTeamId.value).forEach((t) => applyLineup(t, AI_TACTIC.formation))

    if (isSeasonOver.value) {
      const champion = getTeam(sortedStandings.value[0]!.teamId)!
      addNews(`Fim da temporada ${season.value}! ${champion.name} é o campeão.`)
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
    hasCareer, managedTeam, starters, totalRounds, isSeasonOver, currentFixtures, nextFixture, nextOpponent,
    payroll, sortedStandings,
    getTeam, startCareer, nextSeason, endCareer,
    trainPlayer, restPlayer, toggleForSale, sellPlayer,
    toggleStarter, autoSelectStarters, setFormation, setStyle, teamStrength,
    applyRoundResults,
  }
})
