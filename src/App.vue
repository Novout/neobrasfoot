<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import AppHeader from './components/AppHeader.vue'

const route = useRoute()
</script>

<template>
  <AppHeader v-if="route.meta.requiresCareer" />
  <main class="page">
    <RouterView />
  </main>
</template>
