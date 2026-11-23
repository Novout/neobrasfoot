import { beforeEach } from 'vitest'
import { setLeagueBase } from '../data/league'

// Cada teste começa sem save: as stores restauram o localStorage ao serem criadas.
// Os testes usam a liga gerada (clubes fictícios), que tem ids e elencos previsíveis.
beforeEach(() => {
  localStorage.clear()
  setLeagueBase('gerada')
})
