import { createPinia, setActivePinia } from 'pinia'
import { it } from 'vitest'
import { setLeagueBase, setLeagueFormat } from '../data/league'
import { createTeams } from '../data/teams'
import { useGameStore } from '../stores/game'
import { useMatchStore } from '../stores/match'
it('estatística', { timeout: 120000 }, () => {
  const teams = createTeams()
  let goals = 0, n = 0
  for (let r = 0; r < 40; r++) {
    localStorage.clear(); setLeagueBase('gerada'); setLeagueFormat('4x8'); setActivePinia(createPinia())
    const game = useGameStore(); const match = useMatchStore()
    game.startCareer(teams[r % 32]!.id, 'T'); match.setupRound(); match.simulateToEnd(true)
    for (const m of match.matches) { goals += m.homeGoals + m.awayGoals; n++ }
  }
  console.log(`ANTES gols/jogo ${(goals / n).toFixed(2)} (n=${n})`)
})
