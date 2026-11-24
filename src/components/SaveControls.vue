<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/game'
import { duplicateSave, readSaveIndex } from '../utils/storage'
import SavesPanel from './SavesPanel.vue'

const game = useGameStore()

/** Só aparece no modo de múltiplos saves (com um save só, o jogo salva sozinho e não há o que carregar). */
const multi = ref(readSaveIndex().mode === 'multi')
const activeName = ref(readSaveIndex().slots.find((s) => s.id === readSaveIndex().active)?.name ?? '')
const feedback = ref<{ kind: 'good' | 'bad'; text: string } | null>(null)
const showList = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)

const defaultName = computed(
  () => `${game.managedTeam?.name ?? 'Carreira'} · T${game.season} ${game.nextEventLabel.replace(/^.*·\s*/, '')}`,
)

/** O progresso já é salvo sozinho; "Salvar" guarda uma cópia deste momento num save novo, para voltar depois. */
function saveCopy() {
  const name = prompt('Nome do ponto de salvamento:', defaultName.value)
  if (name === null) return
  try {
    duplicateSave(undefined, name || defaultName.value)
    feedback.value = { kind: 'good', text: `Salvo como "${name || defaultName.value}". Você continua jogando no save atual.` }
  } catch (err) {
    feedback.value = { kind: 'bad', text: (err as Error).message }
  }
}

function openList() {
  showList.value = true
  dialog.value?.showModal()
}

function closeList() {
  dialog.value?.close()
  showList.value = false
  multi.value = readSaveIndex().mode === 'multi'
  activeName.value = readSaveIndex().slots.find((s) => s.id === readSaveIndex().active)?.name ?? ''
}
</script>

<template>
  <div v-if="multi" class="card save-controls">
    <div class="save-controls__row">
      <div class="save-controls__info">
        <strong>💾 {{ activeName }}</strong>
        <small class="muted">O progresso é salvo automaticamente.</small>
      </div>
      <div class="save-controls__buttons">
        <button class="btn btn--sm" title="Guarda uma cópia deste momento num save novo" @click="saveCopy">💾 Salvar</button>
        <button class="btn btn--ghost btn--sm" title="Abrir outro save" @click="openList">📂 Carregar</button>
      </div>
    </div>
    <p v-if="feedback" class="save-controls__feedback" :class="feedback.kind">{{ feedback.text }}</p>

    <dialog ref="dialog" class="save-dialog" @close="closeList" @click.self="closeList">
      <div class="save-dialog__body">
        <div class="save-dialog__head">
          <h3>Carregar save</h3>
          <button class="btn btn--ghost btn--sm" @click="closeList">Fechar</button>
        </div>
        <!-- Montado só ao abrir: assim a lista já inclui a cópia recém-salva. -->
        <SavesPanel v-if="showList" @continue="closeList" />
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.save-controls__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.save-controls__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.save-controls__info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.save-controls__info small {
  font-size: 0.72rem;
}
.save-controls__buttons {
  display: flex;
  gap: 0.3rem;
}
.save-controls__feedback {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.save-dialog {
  width: min(720px, 94vw);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
}
.save-dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}
.save-dialog__body {
  padding: 1rem;
}
.save-dialog__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.save-dialog__head h3 {
  margin: 0;
}
.save-dialog :deep(.saves) {
  margin-bottom: 0;
}
</style>
