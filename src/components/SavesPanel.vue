<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  deleteSave, readSaveIndex, renameSave, saveSize, setSaveMode, storageFull, switchSave, totalSavesSize, type SaveIndex,
  type SaveMode, type SaveSlot, type SaveSummary,
} from '../utils/storage'
import TeamBadge from './TeamBadge.vue'
import { useGameStore } from '../stores/game'

const router = useRouter()
const game = useGameStore()

/**
 * Resumo mostrado de cada save. No save em uso vale a carreira carregada agora (o resumo guardado na lista
 * pode estar ausente ou atrasado, ex.: saves de antes da lista existir).
 */
function summaryOf(slot: SaveSlot): SaveSummary | null {
  if (slot.id !== index.value.active) return slot.summary ?? null
  const t = game.managedTeam
  if (!t) return null
  return {
    club: t.name,
    shortName: t.shortName,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    ...(t.crest ? { crest: t.crest } : {}),
    manager: game.managerName,
    season: game.season,
    label: game.nextEventLabel,
  }
}
/** "Continuar" no save em uso (quem abriu a lista dentro do jogo fecha a janela). */
const emit = defineEmits<{ continue: [] }>()

function continueActive() {
  emit('continue')
  router.push({ name: 'dashboard' })
}

/** Cópia do índice para a tela (atualizada depois de cada ação). */
const index = ref<SaveIndex>(structuredClone(readSaveIndex()))
function refresh() {
  index.value = structuredClone(readSaveIndex())
}

const multi = computed(() => index.value.mode === 'multi')
const slots = computed(() =>
  [...index.value.slots].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)),
)
const others = computed(() => index.value.slots.filter((s) => s.id !== index.value.active))

function chooseMode(mode: SaveMode) {
  if (mode === index.value.mode) return
  if (mode === 'single' && others.value.length) {
    const active = index.value.slots.find((s) => s.id === index.value.active)
    const ok = confirm(
      `Voltar para um save só? O save em uso ("${active?.name}") continua sendo o seu save. ` +
        `Os outros ${others.value.length} ficam guardados e voltam a aparecer se você ativar os múltiplos saves de novo.`,
    )
    if (!ok) return
  }
  setSaveMode(mode)
  refresh()
}

/** Abre outro save: recarrega o jogo com os dados dele. */
function load(slot: SaveSlot) {
  switchSave(slot.id)
  window.location.assign(router.resolve({ name: slot.summary ? 'dashboard' : 'home' }).href)
}

function rename(slot: SaveSlot) {
  const name = prompt('Nome do save:', slot.name)
  if (name === null) return
  renameSave(slot.id, name)
  refresh()
}

function remove(slot: SaveSlot) {
  const summary = summaryOf(slot)
  const what = summary ? ` (${summary.club}, temporada ${summary.season})` : ''
  if (!confirm(`Apagar o save "${slot.name}"${what}? Isso não pode ser desfeito.`)) return
  const wasActive = slot.id === index.value.active
  deleteSave(slot.id)
  // Apagou o save em uso: o jogo recarrega com o save que ficou ativo.
  if (wasActive) window.location.assign(router.resolve({ name: 'home' }).href)
  else refresh()
}

function sizeLabel(slot: SaveSlot) {
  const kb = saveSize(slot.id) / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`
}

/** Espaço usado por todos os saves (o navegador guarda cerca de 5 MB por site). */
const usedMb = computed(() => {
  void index.value
  return (totalSavesSize() / 1024 / 1024).toFixed(1)
})

function dateLabel(iso?: string) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}
</script>

<template>
  <section class="card saves">
    <div class="saves__head">
      <div>
        <strong>💾 Saves</strong>
        <small class="muted">
          <template v-if="multi">
            Começar uma carreira cria um save novo; os outros continuam guardados neste navegador.
          </template>
          <template v-else>Um save só: começar uma carreira nova substitui a atual.</template>
        </small>
      </div>
      <div class="saves__modes" role="group" aria-label="Modo de save">
        <button class="btn btn--sm" :class="{ 'btn--ghost': multi }" @click="chooseMode('single')">Save único</button>
        <button class="btn btn--sm" :class="{ 'btn--ghost': !multi }" @click="chooseMode('multi')">Múltiplos saves</button>
      </div>
    </div>

    <ul v-if="multi" class="saves__list">
      <li v-for="slot in slots" :key="slot.id" class="slot" :class="{ 'slot--active': slot.id === index.active }">
        <TeamBadge v-if="summaryOf(slot)" :team="{ ...summaryOf(slot)!, name: summaryOf(slot)!.club }" :size="36" />
        <span v-else class="slot__empty" aria-hidden="true">—</span>
        <div class="slot__info">
          <strong>
            {{ slot.name }}
            <span v-if="slot.id === index.active" class="tag-active">em uso</span>
          </strong>
          <small v-if="summaryOf(slot)" class="muted">
            {{ summaryOf(slot)!.club }} · {{ summaryOf(slot)!.manager }} · Temporada {{ summaryOf(slot)!.season }} · {{ summaryOf(slot)!.label }}
          </small>
          <small v-else class="muted">Vazio: escolha um clube abaixo para começar.</small>
          <small class="muted slot__meta">
            <template v-if="slot.updatedAt">Atualizado {{ dateLabel(slot.updatedAt) }} · </template>{{ sizeLabel(slot) }}
          </small>
        </div>
        <div class="slot__actions">
          <!-- Save em uso com carreira: entra direto no jogo (não precisa "carregar" de novo). -->
          <button
            v-if="slot.id === index.active && game.hasCareer"
            class="btn btn--sm"
            title="Este save já está carregado: entra no Dashboard"
            @click="continueActive"
          >
            ▶ Continuar
          </button>
          <button v-else-if="slot.id !== index.active && slot.summary" class="btn btn--sm" @click="load(slot)">Carregar</button>
          <!-- Save vazio: não há o que carregar; "Usar" faz a próxima carreira começar nele. -->
          <button
            v-else-if="slot.id !== index.active"
            class="btn btn--ghost btn--sm"
            title="Save vazio: a próxima carreira que você começar fica nele"
            @click="load(slot)"
          >
            Usar
          </button>
          <button class="btn btn--ghost btn--sm" @click="rename(slot)">Renomear</button>
          <button class="btn btn--ghost btn--sm slot__delete" @click="remove(slot)">Apagar</button>
        </div>
      </li>
    </ul>
    <p v-if="multi" class="muted saves__usage">
      Espaço usado pelos saves: {{ usedMb }} MB (o navegador guarda cerca de 5 MB por site, uns 6 a 7 saves).
    </p>
    <p v-if="storageFull" class="saves__full">
      ⚠️ O espaço do navegador acabou e o último progresso não foi salvo. Apague um save antigo.
    </p>
  </section>
</template>

<style scoped>
.saves {
  margin-bottom: 1.25rem;
}
.saves__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.saves__head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.saves__modes {
  display: flex;
  gap: 0.25rem;
}
.saves__list {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.slot {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
}
.slot--active {
  border-color: var(--accent);
}
.slot__empty {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px dashed var(--border);
  color: var(--muted);
}
.slot__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.slot__info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot__meta {
  font-size: 0.72rem;
}
.slot__actions {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.saves__usage {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
}
.saves__full {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--bad);
}
.slot__delete:hover {
  color: var(--bad);
  border-color: var(--bad);
}
.tag-active {
  margin-left: 0.35rem;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.7rem;
}
@media (max-width: 620px) {
  .slot {
    grid-template-columns: 36px minmax(0, 1fr);
  }
  .slot__actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
</style>
