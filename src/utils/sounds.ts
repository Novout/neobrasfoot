import { ref, watch } from 'vue'

/**
 * Sons do jogo, sintetizados com a Web Audio API (sem arquivos de áudio).
 */

const MUTE_KEY = 'neobrasfoot:som-mudo'
export const soundMuted = ref(localStorage.getItem(MUTE_KEY) === '1')
watch(soundMuted, (muted) => localStorage.setItem(MUTE_KEY, muted ? '1' : '0'))

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (soundMuted.value || typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  // O navegador só libera o áudio depois de um clique; a tela de jogo sempre vem de um.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(ac: AudioContext, out: AudioNode, freq: number, start: number, length: number, type: OscillatorType, volume: number, slideTo?: number) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + length)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  osc.connect(gain).connect(out)
  osc.start(start)
  osc.stop(start + length + 0.05)
}

/** Ruído filtrado imitando a torcida: `peak` é o volume máximo, `filter` a "cor" do som. */
function crowd(ac: AudioContext, out: AudioNode, start: number, length: number, peak: number, filter: number) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const noise = ac.createBufferSource()
  noise.buffer = buffer
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = filter
  band.Q.value = 0.7
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + length * 0.25)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  noise.connect(band).connect(gain).connect(out)
  noise.start(start)
}

function master(ac: AudioContext) {
  const gain = ac.createGain()
  gain.gain.value = 0.5
  gain.connect(ac.destination)
  return gain
}

/** Gol do seu time: explosão da torcida e fanfarra subindo (acorde maior). */
export function playGoalFor() {
  const ac = audio()
  if (!ac) return
  const out = master(ac)
  const t = ac.currentTime + 0.02
  crowd(ac, out, t, 2.2, 0.6, 1200)
  const notes = [523.25, 659.25, 783.99, 1046.5] // dó, mi, sol, dó
  notes.forEach((f, i) => tone(ac, out, f, t + i * 0.11, 0.35, 'square', 0.12))
  tone(ac, out, 1046.5, t + notes.length * 0.11, 0.9, 'triangle', 0.2)
  tone(ac, out, 1318.5, t + notes.length * 0.11, 0.9, 'triangle', 0.12)
}

/** Gol do adversário: murmúrio abafado da torcida e notas descendo (tom menor). */
export function playGoalAgainst() {
  const ac = audio()
  if (!ac) return
  const out = master(ac)
  const t = ac.currentTime + 0.02
  crowd(ac, out, t, 1.6, 0.25, 350)
  const notes = [392, 369.99, 349.23] // sol, fá#, fá
  notes.forEach((f, i) => tone(ac, out, f, t + i * 0.28, 0.3, 'sawtooth', 0.08))
  tone(ac, out, 329.63, t + notes.length * 0.28, 0.9, 'sawtooth', 0.09, 246.94)
}
