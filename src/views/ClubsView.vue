<script setup lang="ts">
import PosTag from '../components/PosTag.vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerStatus from '../components/PlayerStatus.vue'
import StarMark from '../components/StarMark.vue'
import SkillBadges from '../components/SkillBadges.vue'
import TeamBadge from '../components/TeamBadge.vue'
import { DIVISION_LABELS, DIVISIONS, tableZone } from '../data/divisions'
import { createStadium, stadiumCapacity } from '../data/stadium'
import { POSITION_ORDER } from '../data/tactics'
import { marketValue, useGameStore } from '../stores/game'
import type { Position, Team } from '../types/game'
import { formatMoney } from '../utils/random'

type SortKey = 'position' | 'overall' | 'age' | 'value'

const game = useGameStore()
const route = useRoute()
const router = useRouter()

const search = ref('')
const positionFilter = ref<Position | ''>('')
const sortKey = ref<SortKey>('position')

/** Clube aberto no detalhe (vem da URL, padrão: o seu). */
const selectedId = computed(() => (route.query.time as string) || game.managedTeamId || '')
const selected = computed(() => game.getTeam(selectedId.value))

function select(teamId: string) {
  router.replace({ query: { time: teamId } })
}

function squadAverage(team: Team) {
  return Math.round(team.players.reduce((sum, p) => sum + p.overall, 0) / Math.max(team.players.length, 1))
}

function tablePosition(team: Team) {
  return game.divisionStandings(team.division).findIndex((r) => r.teamId === team.id) + 1
}

const seasonStarted = computed(() => game.standings.some((r) => r.played > 0))

/** Clubes agrupados por série, filtrados pela busca (nome do clube ou de um jogador). */
const groups = computed(() => {
  const term = search.value.trim().toLowerCase()
  const matches = (t: Team) =>
    !term || t.name.toLowerCase().includes(term) || t.players.some((p) => p.name.toLowerCase().includes(term))
  return DIVISIONS.map((d) => ({
    division: d,
    // Antes da 1ª rodada a tabela não diz nada: ordena pela reputação.
    teams: (seasonStarted.value
      ? game.divisionStandings(d).map((r) => game.getTeam(r.teamId)!)
      : game.teams.filter((t) => t.division === d).sort((a, b) => b.reputation - a.reputation)
    ).filter((t) => t && matches(t)),
  })).filter((g) => g.teams.length)
})

const details = computed(() => {
  const team = selected.value
  if (!team) return null
  const isMine = team.id === game.managedTeamId
  const venue = isMine && game.stadium ? game.stadium : createStadium(team)
  const position = tablePosition(team)
  const table = game.divisionStandings(team.division)
  const row = table.find((r) => r.teamId === team.id)
  return {
    team,
    isMine,
    position,
    zone: tableZone(team.division, position, table.length),
    points: row ? row.wins * 3 + row.draws : 0,
    record: row ? `${row.wins}V ${row.draws}E ${row.losses}D` : '',
    played: row?.played ?? 0,
    squadAverage: squadAverage(team),
    starters: Math.round(
      team.players.filter((p) => p.starter).reduce((sum, p) => sum + p.overall, 0) /
        Math.max(team.players.filter((p) => p.starter).length, 1),
    ),
    stars: team.players.filter((p) => p.star).length,
    squadValue: team.players.reduce((sum, p) => sum + marketValue(p), 0),
    stadiumName: venue.name,
    capacity: stadiumCapacity(venue),
    // Técnico atual (muda com demissões e com a janela de técnicos).
    manager: game.managerOf(team.id),
  }
})

const term = computed(() => search.value.trim().toLowerCase())

const players = computed(() => {
  const team = selected.value
  if (!team) return []
  const list = team.players.filter((p) => !positionFilter.value || p.position === positionFilter.value)
  const sorters: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
    position: (a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall,
    overall: (a, b) => b.overall - a.overall,
    age: (a, b) => a.age - b.age,
    value: (a, b) => marketValue(b) - marketValue(a),
  }
  return [...list].sort(sorters[sortKey.value])
})
</script>

<template>
  <div class="clubs">
    <aside class="card clubs__list">
      <input v-model="search" type="text" placeholder="Buscar clube ou jogador" />
      <div v-for="g in groups" :key="g.division" class="group">
        <h3>{{ DIVISION_LABELS[g.division] }}</h3>
        <button
          v-for="t in g.teams"
          :key="t.id"
          class="club-row"
          :class="{ active: t.id === selectedId, mine: t.id === game.managedTeamId }"
          @click="select(t.id)"
        >
          <span class="muted pos-num">{{ seasonStarted ? `${tablePosition(t)}º` : '' }}</span>
          <TeamBadge :team="t" :size="24" />
          <span class="club-row__name">{{ t.name }}</span>
          <span class="muted small">{{ squadAverage(t) }}</span>
        </button>
      </div>
      <p v-if="!groups.length" class="muted small">Nenhum clube ou jogador encontrado.</p>
    </aside>

    <section v-if="details" class="clubs__detail">
      <div class="card hero" :style="{ '--team-color': details.team.primaryColor }">
        <TeamBadge :team="details.team" :size="72" />
        <div class="hero__info">
          <h1>
            {{ details.team.name }}
            <span v-if="details.isMine" class="mine-tag">Seu clube</span>
          </h1>
          <p class="muted">
            {{ DIVISION_LABELS[details.team.division] }} ·
            <template v-if="details.played">{{ details.position }}º lugar · {{ details.points }} pts ({{ details.record }})</template>
            <template v-else>temporada não começou</template>
            <span v-if="details.played && details.zone === 'promotion'" class="good"> · zona de acesso</span>
            <span v-else-if="details.played && details.zone === 'relegation'" class="bad"> · zona de rebaixamento</span>
            <span v-else-if="details.played && details.zone === 'champion'" class="warn"> · líder</span>
          </p>
          <p class="muted small">🏟️ {{ details.stadiumName }} · {{ details.capacity.toLocaleString('pt-BR') }} lugares</p>
          <p class="muted small manager">
            👔 Técnico:
            <template v-if="details.manager">
              <strong>{{ details.manager.name }}</strong>
              <span v-if="details.manager.isPlayer" class="mine-tag">você</span>
              <RouterLink
                v-if="details.manager.trophies.length"
                class="manager__trophies"
                :to="{ name: 'trophies' }"
                title="Ver a prateleira de troféus"
              >
                · 🏆 {{ details.manager.trophies.length }} título{{ details.manager.trophies.length > 1 ? 's' : '' }}
              </RouterLink>
            </template>
            <span v-else>sem técnico</span>
          </p>
        </div>
        <dl class="hero__stats">
          <dt>Média do elenco</dt><dd>{{ details.squadAverage }}</dd>
          <dt>Média dos titulares</dt><dd>{{ details.starters }}</dd>
          <dt>Estrelas</dt><dd>{{ details.stars ? '★'.repeat(details.stars) : '—' }}</dd>
          <dt>Valor do elenco</dt><dd>{{ formatMoney(details.squadValue) }}</dd>
          <dt>Reputação</dt><dd>{{ details.team.reputation }}</dd>
        </dl>
      </div>

      <div class="card">
        <div class="squad-header">
          <h2>Elenco ({{ details.team.players.length }})</h2>
          <div class="filters">
            <button
              v-for="pos in ['', ...POSITION_ORDER] as const"
              :key="pos"
              class="btn btn--sm"
              :class="{ 'btn--ghost': positionFilter !== pos }"
              @click="positionFilter = pos"
            >
              {{ pos || 'Todos' }}
            </button>
            <select v-model="sortKey">
              <option value="position">Por posição</option>
              <option value="overall">Melhor OVR</option>
              <option value="age">Mais jovens</option>
              <option value="value">Mais valiosos</option>
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Nome</th>
              <th class="num">Idade</th>
              <th class="num">OVR</th>
              <th class="num">Energia</th>
              <th class="num">Salário</th>
              <th class="num">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in players" :key="p.id" :class="{ highlight: term && p.name.toLowerCase().includes(term) }">
              <td><PosTag :player="p" /></td>
              <td>
                {{ p.name }}<StarMark :star="p.star" /><SkillBadges :player="p" /><PlayerStatus :player="p" />
                <span v-if="p.starter" class="tag" title="Titular">T</span>
                <span v-if="p.forSale" class="tag tag--sale">À venda</span>
                <span v-if="p.loan" class="tag tag--loan" :title="`Emprestado pelo ${game.getTeam(p.loan.ownerTeamId)?.name}`">
                  🔁 de {{ game.getTeam(p.loan.ownerTeamId)?.shortName }}
                </span>
              </td>
              <td class="num">{{ p.age }}</td>
              <td class="num"><strong>{{ p.overall }}</strong></td>
              <td class="num">{{ Math.round(p.energy) }}</td>
              <td class="num">{{ formatMoney(p.salary) }}</td>
              <td class="num">{{ formatMoney(marketValue(p)) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!details.isMine" class="muted small">
          Quer algum desses jogadores? Negocie ou peça emprestado na aba
          <RouterLink :to="{ name: 'market' }">Mercado</RouterLink>.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.manager strong {
  color: var(--text);
}
.manager__trophies {
  color: var(--warn);
  text-decoration: none;
}
.clubs {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 1000px) {
  .clubs {
    grid-template-columns: 1fr;
  }
}
.clubs__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: sticky;
  top: 5.5rem;
  max-height: calc(100vh - 7rem);
  overflow-y: auto;
}
.group h3 {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--muted);
}
.club-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.88rem;
  text-align: left;
  cursor: pointer;
}
.club-row:hover {
  background: var(--surface-2);
}
.club-row.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.club-row.mine .club-row__name {
  color: var(--accent);
  font-weight: 700;
}
.club-row__name {
  flex: 1;
}
.pos-num {
  width: 1.6rem;
  font-size: 0.75rem;
}
.small {
  font-size: 0.8rem;
}
.clubs__detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.clubs__detail > .card:last-child {
  overflow-x: auto;
}
.hero {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex-wrap: wrap;
  border-left: 6px solid var(--team-color);
}
.hero__info {
  flex: 1;
  min-width: 220px;
}
.hero__info h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
}
.hero__info p {
  margin: 0.15rem 0;
}
.mine-tag {
  margin-left: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  vertical-align: middle;
  background: var(--accent-soft);
  color: var(--accent);
}
.hero__stats {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.85rem;
}
.hero__stats dt {
  color: var(--muted);
}
.hero__stats dd {
  margin: 0;
  text-align: right;
  font-weight: 600;
}
.squad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.squad-header h2 {
  margin: 0;
}
.filters {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}
.tag {
  display: inline-block;
  margin-left: 0.3rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
}
.tag--sale {
  background: rgba(239, 68, 68, 0.15);
  color: var(--bad);
}
.tag--loan {
  background: rgba(96, 165, 250, 0.15);
  color: #93c5fd;
}
tr.highlight td {
  background: rgba(234, 179, 8, 0.1);
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
