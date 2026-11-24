<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
import { storageFull } from './utils/storage'

const route = useRoute()
</script>

<template>
  <AppHeader v-if="route.meta.requiresCareer" />
  <p v-if="storageFull" class="storage-full" role="alert">
    ⚠️ O espaço do navegador acabou e o último progresso não foi salvo.
    <RouterLink :to="{ name: 'home' }">Apague um save antigo</RouterLink> no menu inicial.
  </p>
  <main class="page">
    <RouterView />
  </main>
</template>

<style scoped>
.storage-full {
  margin: 0;
  padding: 0.5rem 1rem;
  background: rgba(239, 68, 68, 0.15);
  border-bottom: 1px solid var(--bad);
  color: #fecaca;
  font-size: 0.85rem;
  text-align: center;
}
.storage-full a {
  color: #fff;
}
</style>
