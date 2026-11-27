/**
 * Baixa os escudos dos clubes do template Brasileirão: a imagem da ficha ("image" do infobox) do artigo de cada
 * clube na Wikipédia em inglês, convertida pela própria Wikipédia em PNG de 128 px.
 *
 * Uso: npm run update-escudos                          (todos do Brasileirão)
 *      npm run update-escudos -- --clubes=mirassol,criciuma  (só esses; os outros ficam como estão)
 *      npm run update-escudos-premier / -bundesliga / -laliga  (clubes da Premier League / Bundesliga / La Liga)
 *      npm run update-escudos-selecoes          (seleções da Copa do Mundo: campo "Badge" da ficha)
 * Saída: public/escudos/<id>.png e src/data/templates/<liga>-crests.json (arquivo de origem de cada escudo).
 *
 * Atenção: escudos são marcas dos clubes; vários são arquivos de uso restrito ("non-free") na Wikipédia.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { CLUBS as BRAZIL_CLUBS, selectedClubs } from './brasileirao-clubs.mjs'
import { PREMIER_CLUBS } from './premier-clubs.mjs'
import { BUNDESLIGA_CLUBS } from './bundesliga-clubs.mjs'
import { LALIGA_CLUBS } from './laliga-clubs.mjs'
import { NATIONS } from './selecoes-clubs.mjs'

/** --liga=inglaterra / --liga=alemanha: escudos dessas ligas, cada uma com o seu registro (padrão: Brasileirão). */
const LEAGUES = {
  inglaterra: { clubs: PREMIER_CLUBS, file: 'premier' },
  alemanha: { clubs: BUNDESLIGA_CLUBS, file: 'bundesliga' },
  espanha: { clubs: LALIGA_CLUBS, file: 'laliga' },
  selecoes: { clubs: NATIONS, file: 'selecoes' },
}
const leagueArg = process.argv.find((a) => a.startsWith('--liga='))?.slice('--liga='.length)
const LEAGUE = leagueArg ? LEAGUES[leagueArg] : { clubs: BRAZIL_CLUBS, file: 'brasileirao' }
if (!LEAGUE) throw new Error(`Liga desconhecida: ${leagueArg} (use ${Object.keys(LEAGUES).join(', ')})`)
const CLUBS = LEAGUE.clubs

/**
 * Arquivo do escudo quando a ficha não serve: sem imagem (Senegal) ou com a bandeira no lugar do escudo (Suíça).
 * Nesses casos vale o escudo da federação, o mesmo usado pela seleção.
 */
const CREST_OVERRIDES = {
  'nt-switzerland': 'Swiss Football Association logo.svg',
  'nt-senegal': 'Senegalese Football Federation logo.svg',
}

const OUT_DIR = new URL('../public/escudos/', import.meta.url)
const MANIFEST = new URL(`../src/data/templates/${LEAGUE.file}-crests.json`, import.meta.url)
const HEADERS = { 'User-Agent': 'NeobrasfootTemplateBuilder/1.0 (crest template generator)' }
const SIZE = 128

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    await sleep(700)
    const res = await fetch(url, { headers: HEADERS })
    if (res.ok) return res
    if (attempt >= 5) throw new Error(`${res.status} em ${url}`)
    const retryAfter = Number(res.headers.get('retry-after')) || 0
    await sleep(Math.max(retryAfter * 1000, 3000 * (attempt + 1)))
  }
}

const wiki = async (params) => (await get(`https://en.wikipedia.org/w/api.php?format=json&formatversion=2&${params}`)).json()

/** Nome do arquivo no campo "image" da ficha do clube (aceita "X.svg" ou "[[File:X.svg|...]]"). */
function infoboxImage(text) {
  // Seleções usam o campo "Badge" na ficha.
  const m = text.match(/\n\s*\|\s*(?:image|logo|crest|badge)\s*=\s*([^\n]*)/i)
  if (!m) return null
  let v = m[1].replace(/<!--.*?-->/g, '').trim()
  const link = v.match(/\[\[\s*(?:File|Image|Ficheiro|Arquivo)\s*:\s*([^|\]]+)/i)
  if (link) v = link[1]
  // Algumas fichas escrevem "File:X.svg" sem colchetes (ex.: França).
  v = v.replace(/^\s*(?:File|Image|Ficheiro|Arquivo)\s*:\s*/i, '')
  v = v.split('|')[0].trim()
  return /\.(svg|png|jpe?g|gif|webp)$/i.test(v) ? v : null
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const clubs = selectedClubs(process.argv, CLUBS)
  const previous = clubs !== CLUBS ? JSON.parse(await readFile(MANIFEST, 'utf8')) : null
  const manifest = previous ?? { fetchedAt: new Date().toISOString().slice(0, 10), size: SIZE, clubs: {} }
  const missing = []
  for (const [id, title] of Object.entries(clubs)) {
    const page = await wiki(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`)
    const file = CREST_OVERRIDES[id] ?? infoboxImage(page.parse?.wikitext ?? '')
    if (!file) {
      missing.push(id)
      console.log(`${id.padEnd(14)} (sem imagem na ficha)`)
      continue
    }
    const info = await wiki(`action=query&prop=imageinfo&iiprop=url&iiurlwidth=${SIZE}&titles=${encodeURIComponent(`File:${file}`)}`)
    const ii = info.query?.pages?.[0]?.imageinfo?.[0]
    const url = ii?.thumburl ?? ii?.url
    if (!url) {
      missing.push(id)
      console.log(`${id.padEnd(14)} (arquivo não encontrado: ${file})`)
      continue
    }
    const bytes = Buffer.from(await (await get(url)).arrayBuffer())
    await writeFile(new URL(`${id}.png`, OUT_DIR), bytes)
    manifest.clubs[id] = { file, source: ii.descriptionurl }
    console.log(`${id.padEnd(14)} ${file} (${Math.round(bytes.length / 1024)} KB)`)
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`\n${Object.keys(manifest.clubs).length} escudos salvos${missing.length ? `; faltaram: ${missing.join(', ')}` : ''}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
