/** id do clube no template -> artigo na Wikipédia em inglês (onde a seção de elenco é padronizada). */
export const CLUBS = {
  flamengo: 'CR Flamengo', palmeiras: 'SE Palmeiras', botafogo: 'Botafogo de Futebol e Regatas', 'sao-paulo': 'São Paulo FC',
  corinthians: 'Sport Club Corinthians Paulista', 'atletico-mg': 'Clube Atlético Mineiro', fluminense: 'Fluminense FC',
  internacional: 'Sport Club Internacional', gremio: 'Grêmio Foot-Ball Porto Alegrense', cruzeiro: 'Cruzeiro Esporte Clube',
  vasco: 'CR Vasco da Gama', bahia: 'Esporte Clube Bahia', fortaleza: 'Fortaleza Esporte Clube', 'athletico-pr': 'Club Athletico Paranaense',
  santos: 'Santos FC', bragantino: 'Red Bull Bragantino', vitoria: 'Esporte Clube Vitória', sport: 'Sport Club do Recife',
  ceara: 'Ceará Sporting Club', juventude: 'Esporte Clube Juventude', goias: 'Goiás Esporte Clube', coritiba: 'Coritiba Foot Ball Club',
  'america-mg': 'América Futebol Clube (MG)', cuiaba: 'Cuiabá Esporte Clube', 'ponte-preta': 'Associação Atlética Ponte Preta',
  guarani: 'Guarani FC', paysandu: 'Paysandu Sport Club', remo: 'Clube do Remo', nautico: 'Clube Náutico Capibaribe',
  'santa-cruz': 'Santa Cruz Futebol Clube', crb: 'Clube de Regatas Brasil', avai: 'Avaí FC',
  // Clubes extras do formato 2×20 (40 clubes).
  mirassol: 'Mirassol Futebol Clube', criciuma: 'Criciúma Esporte Clube', 'atletico-go': 'Atlético Clube Goianiense',
  chapecoense: 'Associação Chapecoense de Futebol', 'operario-pr': 'Operário Ferroviário Esporte Clube',
  'vila-nova': 'Vila Nova Futebol Clube', novorizontino: 'Grêmio Novorizontino', amazonas: 'Amazonas Futebol Clube',
}

/** Clubes escolhidos com --clubes=a,b (todos se a opção não for usada). */
export function selectedClubs(argv = process.argv) {
  const arg = argv.find((a) => a.startsWith('--clubes='))
  if (!arg) return CLUBS
  const ids = arg.slice('--clubes='.length).split(',').map((s) => s.trim()).filter(Boolean)
  const unknown = ids.filter((id) => !CLUBS[id])
  if (unknown.length) throw new Error(`Clubes desconhecidos: ${unknown.join(', ')}`)
  return Object.fromEntries(ids.map((id) => [id, CLUBS[id]]))
}
