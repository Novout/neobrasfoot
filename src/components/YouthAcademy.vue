<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_SQUAD_SIZE, useGameStore } from '../stores/game'
import { formatMoney } from '../utils/random'
import SkillBadges from './SkillBadges.vue'
import StarMark from './StarMark.vue'

const game = useGameStore()
const feedback = ref<{ kind: 'good' | 'bad'; text: string } | null>(null)

const players = computed(() => game.academy?.players ?? [])
const squadSize = computed(() => game.managedTeam?.players.length ?? 0)
const full = computed(() => squadSize.value >= MAX_SQUAD_SIZE)

function promote(id: string) {
  const player = players.value.find((p) => p.id === id)
  const error = game.promoteYouth(id)
  feedback.value = error
    ? { kind: 'bad', text: error }
    : { kind: 'good', text: `${player?.name} agora faz parte do elenco principal.` }
}
</script>

<template>
  <div class="card academy">
    <div class="academy__head">
      <h3>🎓 Categorias de base</h3>
      <span class="muted small">Elenco: {{ squadSize }}/{{ MAX_SQUAD_SIZE }}</span>
    </div>
    <p class="muted small">
      Escolha quem sobe ao time principal. Jovens evoluem rápido com as temporadas. No fim da temporada chega uma nova
      geração e quem não subiu é dispensado.
    </p>

    <table v-if="players.length">
      <thead>
        <tr>
          <th>POS</th>
          <th>NOME</th>
          <th class="num">IDADE</th>
          <th class="num">OVR</th>
          <th class="num">SALÁRIO</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in players" :key="p.id">
          <td><span class="pos" :class="`pos--${p.position}`">{{ p.position }}</span></td>
          <td>
            {{ p.name }}<StarMark :star="p.star" />
            <SkillBadges :player="p" />
          </td>
          <td class="num">{{ p.age }}</td>
          <td class="num"><strong>{{ p.overall }}</strong></td>
          <td class="num muted">{{ formatMoney(p.salary) }}</td>
          <td class="num">
            <button class="btn btn--sm" :disabled="full" :title="full ? 'Elenco cheio: libere uma vaga antes' : 'Subir ao elenco principal'" @click="promote(p.id)">
              Subir
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="muted small">Ninguém na base nesta temporada. Uma nova geração chega no fim da temporada.</p>

    <p v-if="feedback" class="small" :class="feedback.kind">{{ feedback.text }}</p>
    <p v-else-if="full && players.length" class="small warn">Elenco cheio: venda, empreste ou libere alguém para subir um jovem.</p>
  </div>
</template>

<style scoped>
.academy__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.academy__head h3 {
  margin: 0;
}
.small {
  font-size: 0.82rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
th {
  text-align: left;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 600;
  padding: 0.35rem 0.4rem;
}
td {
  padding: 0.35rem 0.4rem;
  border-top: 1px solid var(--border);
  vertical-align: middle;
}
.num {
  text-align: right;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.warn {
  color: var(--warn);
}
</style>
