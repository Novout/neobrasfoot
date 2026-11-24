/**
 * Baixa os elencos atuais dos clubes do template Brasileirão a partir da Wikipédia (seção "Current squad")
 * e as datas de nascimento / "fama" (nº de Wikipédias com artigo do jogador) a partir do Wikidata.
 *
 * Também pega o técnico atual de cada clube (campo "manager" da ficha do clube).
 *
 * Uso: npm run update-brasileirao            (elencos + técnicos)
 *      npm run update-brasileirao -- --tecnicos  (só os técnicos, sem mexer nos elencos)
 *      npm run update-brasileirao -- --clubes=mirassol,criciuma  (só esses clubes; os outros ficam como estão)
 * Saída: src/data/templates/brasileirao-squads.json (dados brutos; idade e OVR são calculados no template).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { CLUBS, selectedClubs } from './brasileirao-clubs.mjs'

const OUT = new URL('../src/data/templates/brasileirao-squads.json', import.meta.url)
const HEADERS = { 'User-Agent': 'NeobrasfootTemplateBuilder/1.0 (squad template generator)' }


const POSITIONS = { GK: 'GOL', DF: 'DEF', MF: 'MEI', FW: 'ATA' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Requisições espaçadas e com novas tentativas: a API da Wikipédia responde 429 se for rápido demais. */
async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    await sleep(700)
    const res = await fetch(url, { headers: HEADERS })
    if (res.ok) return res.json()
    if (attempt >= 5) throw new Error(`${res.status} em ${url}`)
    const retryAfter = Number(res.headers.get('retry-after')) || 0
    await sleep(Math.max(retryAfter * 1000, 3000 * (attempt + 1)))
  }
}

const wiki = (params) => getJson(`https://en.wikipedia.org/w/api.php?format=json&formatversion=2&${params}`)
const wikidata = (params) => getJson(`https://www.wikidata.org/w/api.php?format=json&${params}`)

/** Conteúdo de cada {{Fs player ...}} com chaves balanceadas (há templates aninhados como {{flagicon}}). */
function fsTemplates(text) {
  const out = []
  const re = /\{\{\s*[Ff]s player/g
  let m
  while ((m = re.exec(text))) {
    let depth = 0
    let i = m.index
    for (; i < text.length; i++) {
      if (text.startsWith('{{', i)) { depth++; i++ } else if (text.startsWith('}}', i)) { depth--; i++; if (depth === 0) break }
    }
    out.push(text.slice(m.index + 2, i - 1))
  }
  return out
}

/** Campos "chave=valor" separados por | fora de [[...]] e {{...}}. */
function fields(body) {
  const parts = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2)
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue }
    if (two === ']]' || two === '}}') { depth--; cur += two; i++; continue }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += body[i]
  }
  parts.push(cur)
  const f = {}
  for (const p of parts.slice(1)) {
    const k = p.indexOf('=')
    if (k > 0) f[p.slice(0, k).trim()] = p.slice(k + 1).trim()
  }
  return f
}

/** Técnico atual: campo "manager" (ou "head coach") da ficha do clube, sem links, referências e observações. */
function parseManager(text) {
  const m = text.match(/\n\s*\|\s*(?:manager|head coach|coach)\s*=\s*([^\n]*)/i)
  if (!m) return undefined
  const name = m[1]
    .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/'''?/g, '')
    .trim()
  // Cargo vago na ficha: sem técnico (o jogo inventa um nome).
  if (/^(vacant|vago|tba|tbd|none)$/i.test(name)) return undefined
  return name.length >= 2 && name.length <= 40 ? name : undefined
}

/** Só a seção do elenco principal (sem base, emprestados ou números aposentados). */
function mainSquadSection(text) {
  const heads = [...text.matchAll(/\n(=+)\s*([^=\n]+?)\s*=+\s*\n/g)].map((m) => ({ i: m.index, end: m.index + m[0].length, title: m[2] }))
  let head = heads.find((h) => /(current|first[- ]team|main)\s*(squad|roster)|^squad$|^first team$/i.test(h.title))
  if (!head) {
    const firstPlayer = text.search(/\{\{\s*fs player/i)
    head = [...heads].reverse().find((h) => h.i < firstPlayer)
  }
  if (!head) return ''
  const next = heads.find((h) => h.i > head.i)
  return text.slice(head.end, next ? next.i : undefined)
}

function parsePlayers(section) {
  return fsTemplates(section)
    .map((body) => {
      const f = fields(body)
      let name = f.name ?? ''
      let link = null
      const lm = name.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
      if (lm) { link = lm[1]; name = lm[2] ?? lm[1] }
      name = name.replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/\s*\(.*?\)\s*/g, ' ').trim()
      const position = POSITIONS[(f.pos ?? '').toUpperCase()]
      return name && position ? { name, position, link } : null
    })
    .filter(Boolean)
}

async function onlyManagers() {
  const data = JSON.parse(await readFile(OUT, 'utf8'))
  for (const [id, title] of Object.entries(CLUBS)) {
    const r = await wiki(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`)
    const manager = parseManager(r.parse?.wikitext ?? '')
    // O técnico fica antes dos jogadores no arquivo (mais fácil de achar).
    if (data.clubs[id]) {
      const { manager: _old, ...rest } = data.clubs[id]
      data.clubs[id] = manager ? { manager, ...rest } : rest
    }
    console.log(`${id.padEnd(14)} ${manager ?? '(sem técnico na ficha)'}`)
  }
  data.managersFetchedAt = new Date().toISOString().slice(0, 10)
  await writeFile(OUT, JSON.stringify(data, null, 1) + '\n')
}

async function main() {
  if (process.argv.includes('--tecnicos')) return onlyManagers()
  const squads = {}
  const clubs = selectedClubs()
  const partial = clubs !== CLUBS
  for (const [id, title] of Object.entries(clubs)) {
    const r = await wiki(`action=parse&prop=wikitext|revid&redirects=1&page=${encodeURIComponent(title)}`)
    const text = r.parse?.wikitext ?? ''
    squads[id] = {
      source: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.parse?.title ?? title).replace(/%20/g, '_')}`,
      revision: r.parse?.revid,
      manager: parseManager(text),
      players: parsePlayers(mainSquadSection(text)),
    }
    console.log(`${id.padEnd(14)} ${squads[id].players.length} jogadores`)
  }

  // Artigo do jogador -> item do Wikidata (resolvendo redirecionamentos).
  const titles = [...new Set(Object.values(squads).flatMap((s) => s.players.map((p) => p.link)).filter(Boolean))]
  const qid = {}
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const r = await wiki(`action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`)
    const norm = Object.fromEntries((r.query?.normalized ?? []).map((n) => [n.from, n.to]))
    const red = Object.fromEntries((r.query?.redirects ?? []).map((n) => [n.from, n.to]))
    const byTitle = Object.fromEntries((r.query?.pages ?? []).filter((p) => p.pageprops?.wikibase_item).map((p) => [p.title, p.pageprops.wikibase_item]))
    for (const t of batch) {
      const resolved = red[norm[t] ?? t] ?? norm[t] ?? t
      if (byTitle[resolved]) qid[t] = byTitle[resolved]
    }
  }

  // Data de nascimento (P569) e número de Wikipédias com artigo (fama).
  const ids = [...new Set(Object.values(qid))]
  const info = {}
  for (let i = 0; i < ids.length; i += 50) {
    const r = await wikidata(`action=wbgetentities&props=claims|sitelinks&ids=${ids.slice(i, i + 50).join('|')}`)
    for (const [id, e] of Object.entries(r.entities ?? {})) {
      const time = e.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time
      const fame = Object.keys(e.sitelinks ?? {}).filter((k) => /wiki$/.test(k) && !['commonswiki', 'specieswiki', 'wikidatawiki'].includes(k)).length
      info[id] = { birthDate: time ? time.slice(1, 11) : undefined, fame }
    }
  }

  const previous = partial ? JSON.parse(await readFile(OUT, 'utf8')) : null
  const fresh = Object.fromEntries(
      Object.entries(squads).map(([id, s]) => [
        id,
        {
          source: s.source,
          revision: s.revision,
          ...(s.manager ? { manager: s.manager } : {}),
          players: s.players.map(({ name, position, link }) => {
            const q = link && qid[link]
            return { name, position, ...(q && info[q]?.birthDate ? { birthDate: info[q].birthDate } : {}), fame: q ? info[q]?.fame ?? 0 : 0 }
          }),
        },
      ]),
    )
  const out = previous
    ? { ...previous, clubs: { ...previous.clubs, ...fresh } }
    : { fetchedAt: new Date().toISOString().slice(0, 10), clubs: fresh }
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n')
  const total = Object.values(out.clubs).reduce((s, c) => s + c.players.length, 0)
  console.log(`\n${total} jogadores salvos em ${OUT.pathname}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
