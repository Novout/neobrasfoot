<script setup lang="ts">
/** Número da camisa do jogador, numa etiqueta pequena antes do nome. Some se o jogador ainda não tem número. */
defineProps<{ number?: number }>()
</script>

<template>
  <span v-if="number" class="shirt-no" :title="`Camisa ${number}`">{{ number }}</span>
</template>

<style scoped>
.shirt-no {
  display: inline-block;
  min-width: 1.45rem;
  margin-right: 0.3rem;
  padding: 0 0.2rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
  text-align: center;
  vertical-align: 1px;
  color: var(--text, #e8f1ec);
  background: var(--surface-2);
}
</style>
