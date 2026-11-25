<script setup lang="ts">
import { computed } from 'vue'
import { DEF_ROLE_LABELS, defRoleOf } from '../data/defense'
import type { Player } from '../types/game'

/** Etiqueta de posição: defensores aparecem como LAT (lateral) ou ZAG (zagueiro). */
const props = defineProps<{ player: Pick<Player, 'id' | 'position' | 'defRole'> }>()
const role = computed(() => defRoleOf(props.player))
</script>

<template>
  <span
    class="pos"
    :class="role ? `pos--DEF pos--${role}` : `pos--${player.position}`"
    :title="role ? DEF_ROLE_LABELS[role] : undefined"
  >
    {{ role ?? player.position }}
  </span>
</template>
