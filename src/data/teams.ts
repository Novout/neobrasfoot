import type { DivisionId, Player, Position, Team } from '../types/game'
import { createRng, hashString } from '../utils/random'
import { MAX_PLAYER_OVERALL, MIN_PLAYER_OVERALL } from './divisions'

type TeamSeed = Omit<Team, 'players'>

/**
 * Clubes fictícios. A reputação define o nível do elenco gerado:
 * Série A ~70-80, B ~60-68, C ~50-58, D ~40-48.
 */
const TEAM_SEEDS: TeamSeed[] = [
  // Série A
  { id: 'atletico-serrano', division: 'A', name: 'Atlético Serrano', shortName: 'ATS', primaryColor: '#c62828', secondaryColor: '#ffffff', reputation: 80 },
  { id: 'uniao-litoral', division: 'A', name: 'União Litoral', shortName: 'ULI', primaryColor: '#1565c0', secondaryColor: '#ffeb3b', reputation: 78 },
  { id: 'esporte-planalto', division: 'A', name: 'Esporte Planalto', shortName: 'EPL', primaryColor: '#2e7d32', secondaryColor: '#ffffff', reputation: 77 },
  { id: 'operario-vale', division: 'A', name: 'Operário do Vale', shortName: 'OPV', primaryColor: '#212121', secondaryColor: '#ffffff', reputation: 75 },
  { id: 'real-cerrado', division: 'A', name: 'Real Cerrado', shortName: 'RCE', primaryColor: '#6a1b9a', secondaryColor: '#ffd54f', reputation: 74 },
  { id: 'ferroviario-norte', division: 'A', name: 'Ferroviário Norte', shortName: 'FEN', primaryColor: '#ef6c00', secondaryColor: '#000000', reputation: 72 },
  { id: 'sociedade-ribeira', division: 'A', name: 'Sociedade Ribeira', shortName: 'SRI', primaryColor: '#00838f', secondaryColor: '#ffffff', reputation: 71 },
  { id: 'juventude-campos', division: 'A', name: 'Juventude dos Campos', shortName: 'JUC', primaryColor: '#f9a825', secondaryColor: '#1b5e20', reputation: 70 },
  // Série B
  { id: 'estrela-sertao', division: 'B', name: 'Estrela do Sertão', shortName: 'ESE', primaryColor: '#b71c1c', secondaryColor: '#ffc107', reputation: 68 },
  { id: 'comercial-mare', division: 'B', name: 'Comercial Maré Alta', shortName: 'CMA', primaryColor: '#0d47a1', secondaryColor: '#ffffff', reputation: 67 },
  { id: 'tupa-ec', division: 'B', name: 'Tupã Esporte Clube', shortName: 'TEC', primaryColor: '#33691e', secondaryColor: '#fdd835', reputation: 66 },
  { id: 'ipe-fc', division: 'B', name: 'Ipê Futebol Clube', shortName: 'IPE', primaryColor: '#ad1457', secondaryColor: '#ffffff', reputation: 64 },
  { id: 'aurora-serra', division: 'B', name: 'Aurora da Serra', shortName: 'AUS', primaryColor: '#ff8f00', secondaryColor: '#3e2723', reputation: 63 },
  { id: 'ventania-fc', division: 'B', name: 'Ventania FC', shortName: 'VEN', primaryColor: '#90a4ae', secondaryColor: '#0d47a1', reputation: 62 },
  { id: 'coroados-ac', division: 'B', name: 'Coroados AC', shortName: 'COR', primaryColor: '#4a148c', secondaryColor: '#ffffff', reputation: 61 },
  { id: 'pinheiral-ec', division: 'B', name: 'Pinheiral EC', shortName: 'PIN', primaryColor: '#1b5e20', secondaryColor: '#000000', reputation: 60 },
  // Série C
  { id: 'pedra-branca', division: 'C', name: 'Atlético Pedra Branca', shortName: 'APB', primaryColor: '#eceff1', secondaryColor: '#c62828', reputation: 58 },
  { id: 'mangueiral-fc', division: 'C', name: 'Mangueiral FC', shortName: 'MAN', primaryColor: '#e65100', secondaryColor: '#2e7d32', reputation: 57 },
  { id: 'canarinho-brejo', division: 'C', name: 'Canarinho do Brejo', shortName: 'CAB', primaryColor: '#fdd835', secondaryColor: '#1565c0', reputation: 56 },
  { id: 'industrial-vale-verde', division: 'C', name: 'Industrial Vale Verde', shortName: 'IVV', primaryColor: '#455a64', secondaryColor: '#76ff03', reputation: 54 },
  { id: 'lagoa-seca', division: 'C', name: 'Lagoa Seca EC', shortName: 'LAS', primaryColor: '#0277bd', secondaryColor: '#e0f7fa', reputation: 53 },
  { id: 'tropical-fc', division: 'C', name: 'Tropical FC', shortName: 'TRO', primaryColor: '#00c853', secondaryColor: '#ff6d00', reputation: 52 },
  { id: 'carcara-ac', division: 'C', name: 'Carcará AC', shortName: 'CAR', primaryColor: '#5d4037', secondaryColor: '#ffffff', reputation: 51 },
  { id: 'unidos-colina', division: 'C', name: 'Unidos da Colina', shortName: 'UDC', primaryColor: '#283593', secondaryColor: '#e53935', reputation: 50 },
  // Série D
  { id: 'boa-esperanca', division: 'D', name: 'Boa Esperança FC', shortName: 'BOE', primaryColor: '#43a047', secondaryColor: '#ffffff', reputation: 48 },
  { id: 'serrinha-ec', division: 'D', name: 'Serrinha EC', shortName: 'SER', primaryColor: '#8d6e63', secondaryColor: '#fff3e0', reputation: 47 },
  { id: 'tamandua-ac', division: 'D', name: 'Tamanduá AC', shortName: 'TAM', primaryColor: '#6d4c41', secondaryColor: '#ffca28', reputation: 46 },
  { id: 'riachao-fc', division: 'D', name: 'Riachão FC', shortName: 'RIA', primaryColor: '#26c6da', secondaryColor: '#004d40', reputation: 45 },
  { id: 'palmital-ec', division: 'D', name: 'Palmital EC', shortName: 'PAL', primaryColor: '#827717', secondaryColor: '#ffffff', reputation: 44 },
  { id: 'cajueiro-fc', division: 'D', name: 'Cajueiro FC', shortName: 'CAJ', primaryColor: '#d84315', secondaryColor: '#fff176', reputation: 43 },
  { id: 'porto-pedras', division: 'D', name: 'Porto das Pedras', shortName: 'PDP', primaryColor: '#37474f', secondaryColor: '#4fc3f7', reputation: 42 },
  { id: 'jatoba-ec', division: 'D', name: 'Jatobá EC', shortName: 'JAT', primaryColor: '#3e2723', secondaryColor: '#a5d6a7', reputation: 40 },
]

const FIRST_NAMES = [
  'Lucas', 'Gabriel', 'Mateus', 'Rafael', 'Thiago', 'Bruno', 'Diego', 'Felipe', 'Caio', 'Renan',
  'Igor', 'Vitor', 'André', 'Danilo', 'Eduardo', 'Gustavo', 'Henrique', 'João', 'Leandro', 'Marcos',
  'Nathan', 'Otávio', 'Paulo', 'Rodrigo', 'Samuel', 'Tiago', 'Wesley', 'Yuri', 'Alan', 'Murilo',
  'Davi', 'Enzo', 'Fábio', 'Hugo', 'Kauã', 'Luan', 'Pedro', 'Ruan', 'Sérgio', 'Vinícius',
]
const LAST_NAMES = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Ribeiro', 'Almeida', 'Carvalho',
  'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Moura', 'Teixeira', 'Freitas', 'Cardoso', 'Nunes', 'Batista',
  'Araújo', 'Campos', 'Dias', 'Farias', 'Macedo', 'Pires', 'Queiroz', 'Ramos', 'Siqueira', 'Vieira',
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
    const overall = Math.max(MIN_PLAYER_OVERALL, Math.min(MAX_PLAYER_OVERALL, seed.reputation + rng.int(-12, 8)))
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

export function teamsByDivision(teams: Team[], division: DivisionId) {
  return teams.filter((t) => t.division === division)
}
