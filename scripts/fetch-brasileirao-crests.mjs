/**
 * Baixa os escudos dos clubes do template Brasileirão: a imagem da ficha ("image" do infobox) do artigo de cada
 * clube na Wikipédia em inglês, convertida pela própria Wikipédia em PNG de 128 px.
 *
 * Uso: npm run update-escudos                          (todos)
 *      npm run update-escudos -- --clubes=mirassol,criciuma  (só esses; os outros ficam como estão)
 * Saída: public/escudos/<id>.png e src/data/templates/brasileirao-crests.json (arquivo de origem de cada escudo).
 *
 * Atenção: escudos são marcas dos clubes; vários são arquivos de uso restrito ("non-free") na Wikipédia.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { CLUBS, selectedClubs } from './brasileirao-clubs.mjs'

const OUT_DIR = new URL('../public/escudos/', import.meta.url)
const MANIFEST = new URL('../src/data/templates/brasileirao-crests.json', import.meta.url)
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
  const m = text.match(/\n\s*\|\s*(?:image|logo|crest)\s*=\s*([^\n]*)/i)
  if (!m) return null
  let v = m[1].replace(/<!--.*?-->/g, '').trim()
  const link = v.match(/\[\[\s*(?:File|Image|Ficheiro|Arquivo)\s*:\s*([^|\]]+)/i)
  if (link) v = link[1]
  v = v.split('|')[0].trim()
  return /\.(svg|png|jpe?g|gif|webp)$/i.test(v) ? v : null
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const clubs = selectedClubs()
  const previous = clubs !== CLUBS ? JSON.parse(await readFile(MANIFEST, 'utf8')) : null
  const manifest = previous ?? { fetchedAt: new Date().toISOString().slice(0, 10), size: SIZE, clubs: {} }
  const missing = []
  for (const [id, title] of Object.entries(clubs)) {
    const page = await wiki(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`)
    const file = infoboxImage(page.parse?.wikitext ?? '')
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
