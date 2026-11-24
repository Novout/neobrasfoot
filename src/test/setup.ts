import { beforeEach } from 'vitest'
import { setLeagueBase, setLeagueFormat } from '../data/league'
import { setActiveFormat } from '../data/divisions'
import { resetSaveIndexCache } from '../utils/storage'

// Cada teste começa sem save: as stores restauram o localStorage ao serem criadas.
// Os testes usam a liga gerada (clubes fictícios), que tem ids e elencos previsíveis.
beforeEach(() => {
  localStorage.clear()
  resetSaveIndexCache()
  setLeagueBase('gerada')
  // A maioria dos testes foi escrita para o formato 4×8 (32 clubes, 14 rodadas); o 2×20 tem testes próprios.
  setLeagueFormat('4x8')
  // O formato ativo é estado do módulo: volta ao padrão a cada teste.
  setActiveFormat('4x8')
})
