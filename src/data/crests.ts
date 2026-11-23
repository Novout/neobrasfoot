import crests from './templates/brasileirao-crests.json'

/**
 * Escudo de um clube: um link de imagem (https://...), um caminho dentro do jogo (ex.: "escudos/flamengo.png",
 * servido a partir de public/) ou uma imagem embutida (data:image/...), como as enviadas no editor de times.
 */
export type Crest = string

/** Tamanho máximo de um escudo embutido (data URI), para não estourar o save no navegador. */
export const MAX_CREST_LENGTH = 200_000
/** Lado, em pixels, das imagens de escudo enviadas no editor (são reduzidas para este tamanho). */
export const CREST_SIZE = 128

/** Escudos baixados para o template Brasileirão (id do clube -> caminho no jogo). */
export const BRASILEIRAO_CRESTS: Record<string, Crest> = Object.fromEntries(
  Object.keys((crests as { clubs: Record<string, unknown> }).clubs).map((id) => [id, `escudos/${id}.png`]),
)

export function isValidCrest(value: unknown): value is Crest {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v.startsWith('data:')) return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(v) && v.length <= MAX_CREST_LENGTH
  if (/^https?:\/\//i.test(v)) return v.length <= 500
  // Caminho dentro do jogo: só arquivos de imagem, sem subir pastas.
  return /^\/?[\w\-./]+\.(png|jpe?g|gif|webp|svg)$/i.test(v) && !v.includes('..') && v.length <= 200
}

/** Endereço para o <img>: caminhos do jogo são resolvidos a partir da base do site (funciona em subpastas). */
export function crestSrc(crest: Crest | undefined): string | null {
  if (!crest) return null
  if (/^(data:|https?:\/\/)/i.test(crest)) return crest
  return `${import.meta.env.BASE_URL}${crest.replace(/^\//, '')}`
}

/** Lê uma imagem enviada e a reduz para um PNG quadrado de CREST_SIZE px (data URI). */
export function crestFromFile(file: File): Promise<Crest> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem (PNG, JPG, SVG...).'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = CREST_SIZE
      const ctx = canvas.getContext('2d')!
      const scale = Math.min(CREST_SIZE / (img.width || CREST_SIZE), CREST_SIZE / (img.height || CREST_SIZE))
      const w = (img.width || CREST_SIZE) * scale
      const h = (img.height || CREST_SIZE) * scale
      ctx.drawImage(img, (CREST_SIZE - w) / 2, (CREST_SIZE - h) / 2, w, h)
      URL.revokeObjectURL(url)
      const data = canvas.toDataURL('image/png')
      if (data.length > MAX_CREST_LENGTH) reject(new Error('A imagem ficou grande demais mesmo reduzida.'))
      else resolve(data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem.'))
    }
    img.src = url
  })
}
