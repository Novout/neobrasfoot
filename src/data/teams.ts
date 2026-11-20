import type { Player, Position, Team } from '../types/game'
import { createRng, hashString } from '../utils/random'

interface TeamSeed {
  id: string
  name: string
  shortName: string
  primaryColor: string
  secondaryColor: string
  reputation: number
}

const TEAM_SEEDS: TeamSeed[] = [
  { id: 'atletico-serrano', name: 'Atlético Serrano', shortName: 'ATS', primaryColor: '#c62828', secondaryColor: '#ffffff', reputation: 78 },
  { id: 'uniao-litoral', name: 'União Litoral', shortName: 'ULI', primaryColor: '#1565c0', secondaryColor: '#ffeb3b', reputation: 74 },
  { id: 'esporte-planalto', name: 'Esporte Planalto', shortName: 'EPL', primaryColor: '#2e7d32', secondaryColor: '#ffffff', reputation: 72 },
  { id: 'operario-vale', name: 'Operário do Vale', shortName: 'OPV', primaryColor: '#212121', secondaryColor: '#ffffff', reputation: 69 },
  { id: 'real-cerrado', name: 'Real Cerrado', shortName: 'RCE', primaryColor: '#6a1b9a', secondaryColor: '#ffd54f', reputation: 67 },
  { id: 'ferroviario-norte', name: 'Ferroviário Norte', shortName: 'FEN', primaryColor: '#ef6c00', secondaryColor: '#000000', reputation: 64 },
  { id: 'sociedade-ribeira', name: 'Sociedade Ribeira', shortName: 'SRI', primaryColor: '#00838f', secondaryColor: '#ffffff', reputation: 61 },
  { id: 'juventude-campos', name: 'Juventude dos Campos', shortName: 'JUC', primaryColor: '#f9a825', secondaryColor: '#1b5e20', reputation: 58 },
]

const FIRST_NAMES = [
  'Lucas', 'Gabriel', 'Mateus', 'Rafael', 'Thiago', 'Bruno', 'Diego', 'Felipe', 'Caio', 'Renan',
  'Igor', 'Vitor', 'André', 'Danilo', 'Eduardo', 'Gustavo', 'Henrique', 'João', 'Leandro', 'Marcos',
  'Nathan', 'Otávio', 'Paulo', 'Rodrigo', 'Samuel', 'Tiago', 'Wesley', 'Yuri', 'Alan', 'Murilo',
]
const LAST_NAMES = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Ribeiro', 'Almeida', 'Carvalho',
  'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Moura', 'Teixeira', 'Freitas', 'Cardoso', 'Nunes', 'Batista',
]

/** Composição do elenco: 3 GOL, 7 DEF, 7 MEI, 5 ATA = 22 jogadores. */
const SQUAD_TEMPLATE: Position[] = [
  ...Array<Position>(3).fill('GOL'),
  ...Array<Position>(7).fill('DEF'),
  ...Array<Position>(7).fill('MEI'),
  ...Array<Position>(5).fill('ATA'),
]

function generatePlayers(seed: TeamSeed): Player[] {
  const rng = createRng(hashString(seed.id))
  return SQUAD_TEMPLATE.map((position, index) => {
    const overall = Math.max(40, Math.min(95, seed.reputation + rng.int(-14, 8)))
    return {
      id: `${seed.id}-${index}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      position,
      age: rng.int(18, 35),
      overall,
      energy: 100,
      morale: rng.int(60, 90),
      salary: Math.round((overall * overall) / 10) * 10,
      starter: false,
      forSale: false,
    }
  })
}

export function createTeams(): Team[] {
  return TEAM_SEEDS.map((seed) => ({ ...seed, players: generatePlayers(seed) }))
}
