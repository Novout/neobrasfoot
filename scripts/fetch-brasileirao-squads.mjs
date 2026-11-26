/**
 * Baixa os elencos atuais dos clubes do template Brasileirão a partir da Wikipédia (seção "Current squad")
 * e as datas de nascimento / "fama" (nº de Wikipédias com artigo do jogador) a partir do Wikidata.
 *
 * Também pega o técnico atual de cada clube (campo "manager" da ficha do clube).
 *
 * Uso: npm run update-brasileirao            (elencos + técnicos)
 *      npm run update-brasileirao -- --tecnicos  (só os técnicos, sem mexer nos elencos)
 *      npm run update-brasileirao -- --clubes=mirassol,criciuma  (só esses clubes; os outros ficam como estão)
 *      npm run update-laliga                    (mesmo processo para os clubes da La Liga espanhola)
 *      npm run update-selecoes                  (convocados das seleções da Copa do Mundo, com o número da camisa)
 *      npm run update-premier / update-bundesliga  (clubes das ligas inglesa e alemã, com o estádio da ficha do clube)
 *      npm run update-champions                 (clubes europeus da Liga dos Campeões de fora das ligas do jogo)
 * Saída: src/data/templates/brasileirao-squads.json ou laliga-squads.json (dados brutos; idade e OVR são
 * calculados no template).
 */
import { readFile, writeFile } from 'node:fs/promises'
import { CLUBS as BRAZIL_CLUBS, selectedClubs } from './brasileirao-clubs.mjs'
import { LALIGA_CLUBS } from './laliga-clubs.mjs'
import { NATIONS } from './selecoes-clubs.mjs'
import { PREMIER_CLUBS } from './premier-clubs.mjs'
import { BUNDESLIGA_CLUBS } from './bundesliga-clubs.mjs'
import { CHAMPIONS_CLUBS } from './champions-clubs.mjs'

/** --liga=X: qual conjunto de clubes baixar; cada um vai para o seu arquivo (padrão: Brasileirão). */
const LEAGUES = {
  espanha: { clubs: LALIGA_CLUBS, file: 'laliga' },
  selecoes: { clubs: NATIONS, file: 'selecoes' },
  inglaterra: { clubs: PREMIER_CLUBS, file: 'premier' },
  alemanha: { clubs: BUNDESLIGA_CLUBS, file: 'bundesliga' },
  europa: { clubs: CHAMPIONS_CLUBS, file: 'champions' },
}
const leagueArg = process.argv.find((a) => a.startsWith('--liga='))?.slice('--liga='.length)
const LEAGUE = leagueArg ? LEAGUES[leagueArg] : { clubs: BRAZIL_CLUBS, file: 'brasileirao' }
if (!LEAGUE) throw new Error(`Liga desconhecida: ${leagueArg} (use ${Object.keys(LEAGUES).join(', ')})`)
const CLUBS = LEAGUE.clubs
const OUT = new URL(`../src/data/templates/${LEAGUE.file}-squads.json`, import.meta.url)
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

/**
 * Conteúdo de cada {{Fs player ...}} (clubes) ou {{nat fs g player ...}} (seleções), com chaves balanceadas
 * (há templates aninhados como {{flagicon}}).
 */
function fsTemplates(text) {
  const out = []
  // Também {{football squad player ...}}, usado em alguns clubes (ex.: Nottingham Forest).
  const re = /\{\{\s*(?:(?:[Nn]at )?[Ff]s (?:g )?player|[Ff]ootball squad player)/g
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

/** Estádio do clube: campo "ground" da ficha, sem links, referências e observações. */
function parseGround(text) {
  const m = text.match(/\n\s*\|\s*ground\s*=\s*([^\n]*)/i)
  if (!m) return undefined
  const name = m[1]
    .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<br\s*\/?>.*$/i, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .trim()
  return name.length >= 2 && name.length <= 50 ? name : undefined
}

/** Só a seção do elenco principal (sem base, emprestados ou números aposentados). */
function mainSquadSection(text) {
  // A quebra de linha do fim fica fora do match: títulos seguidos ("==Players==" e "===Current squad===") são achados os dois.
  const heads = [...text.matchAll(/\n(=+)\s*([^=\n]+?)\s*=+[ \t]*(?=\n)/g)].map((m) => ({ i: m.index, end: m.index + m[0].length, title: m[2] }))
  // Em ordem de preferência: "Current squad" vem antes de títulos genéricos como "First team" (que pode ser só
  // o título de cima, com o elenco num subtítulo, ex.: Nottingham Forest).
  const patterns = [/current\s*(squad|roster)/i, /(first[- ]team|main)\s*(squad|roster)/i, /^squad$|^first team$/i]
  let head = patterns.map((re) => heads.find((h) => re.test(h.title))).find(Boolean)
  if (!head) {
    const firstPlayer = text.search(/\{\{\s*(?:(?:nat )?fs (?:g )?player|football squad player)/i)
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
      // {{sortname|Nome|Sobrenome|link opcional|dab=desambiguação}} (usado em algumas seleções, ex.: EUA).
      const sort = name.match(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)((?:\|[^}]*)?)\}\}/i)
      if (sort) {
        const full = `${sort[1].trim()} ${sort[2].trim()}`.trim()
        const extra = sort[3].split('|').map((s) => s.trim()).filter(Boolean)
        const dab = extra.find((s) => s.startsWith('dab='))?.slice(4)
        const custom = extra.find((s) => !s.includes('='))
        link = custom || (dab ? `${full} (${dab})` : full)
        name = full
      }
      const lm = name.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
      if (lm) { link = lm[1]; name = lm[2] ?? lm[1] }
      name = name.replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/\s*\(.*?\)\s*/g, ' ').trim()
      const position = POSITIONS[(f.pos ?? '').toUpperCase()]
      // Número da camisa (campo "no"), quando a fonte informa.
      const number = Number.parseInt(f.no ?? '', 10)
      return name && position ? { name, position, link, ...(number >= 1 && number <= 99 ? { number } : {}) } : null
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
  const clubs = selectedClubs(process.argv, CLUBS)
  const partial = clubs !== CLUBS
  for (const [id, title] of Object.entries(clubs)) {
    const r = await wiki(`action=parse&prop=wikitext|revid&redirects=1&page=${encodeURIComponent(title)}`)
    const text = r.parse?.wikitext ?? ''
    squads[id] = {
      source: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.parse?.title ?? title).replace(/%20/g, '_')}`,
      revision: r.parse?.revid,
      manager: parseManager(text),
      stadium: parseGround(text),
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
      // Posição jogada (P413): diz se o defensor é lateral ou zagueiro.
      const roles = (e.claims?.P413 ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean)
      info[id] = { birthDate: time ? time.slice(1, 11) : undefined, fame, roles }
    }
  }

  // Nome (em inglês) de cada posição citada, para separar laterais de zagueiros.
  const roleIds = [...new Set(Object.values(info).flatMap((x) => x.roles))]
  const roleLabel = {}
  for (let i = 0; i < roleIds.length; i += 50) {
    const r = await wikidata(`action=wbgetentities&props=labels&languages=en&ids=${roleIds.slice(i, i + 50).join('|')}`)
    for (const [id, e] of Object.entries(r.entities ?? {})) roleLabel[id] = (e.labels?.en?.value ?? '').toLowerCase()
  }
  /** "LAT" (lateral/ala), "ZAG" (zagueiro) ou nada, pela primeira posição reconhecível. */
  const defRole = (roles) => {
    for (const id of roles) {
      const label = roleLabel[id] ?? ''
      if (/full[- ]?back|left[- ]back|right[- ]back|wing[- ]?back|side[- ]back/.test(label)) return 'LAT'
      if (/cent(re|er)[- ]back|sweeper|libero|central defender/.test(label)) return 'ZAG'
    }
    return undefined
  }

  // Ficha (infobox) de cada defensor na Wikipédia: "Left-back", "Centre-back"... é mais precisa que o Wikidata.
  const defenderLinks = [...new Set(Object.values(squads).flatMap((sq) => sq.players.filter((p) => p.position === 'DEF' && p.link).map((p) => p.link)))]
  const infoboxRole = {}
  const roleFromText = (text) => {
    const t = text.toLowerCase()
    if (/full[- ]?back|left[- ]back|right[- ]back|wing[- ]?back|side[- ]back|lateral/.test(t)) return 'LAT'
    if (/cent(re|er)[- ]back|central defender|sweeper|libero|zagueiro/.test(t)) return 'ZAG'
    return undefined
  }
  for (let i = 0; i < defenderLinks.length; i += 50) {
    const batch = defenderLinks.slice(i, i + 50)
    const r = await wiki(`action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`)
    const norm = Object.fromEntries((r.query?.normalized ?? []).map((n) => [n.from, n.to]))
    const red = Object.fromEntries((r.query?.redirects ?? []).map((n) => [n.from, n.to]))
    const byTitle = Object.fromEntries((r.query?.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? '']))
    for (const link of batch) {
      const title = red[norm[link] ?? link] ?? norm[link] ?? link
      const field = (byTitle[title] ?? '').match(/\n\s*\|\s*position\s*=\s*([^\n]*)/i)
      const role = field ? roleFromText(field[1]) : undefined
      if (role) infoboxRole[link] = role
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
          ...(s.stadium ? { stadium: s.stadium } : {}),
          players: s.players.map(({ name, position, link, number }) => {
            const q = link && qid[link]
            const role = position === 'DEF' ? (infoboxRole[link] ?? (q ? defRole(info[q]?.roles ?? []) : undefined)) : undefined
            return {
              name,
              position,
              ...(number ? { number } : {}),
              ...(role ? { defRole: role } : {}),
              ...(q && info[q]?.birthDate ? { birthDate: info[q].birthDate } : {}),
              fame: q ? info[q]?.fame ?? 0 : 0,
            }
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
