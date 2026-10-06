<template>
  <section class="page" data-module="hazard">
    <header class="page-head">
      <div>
        <h2>隐患整改管理</h2>
        <p class="page-desc">
          隐患全部来自巡检上报，按巡检路线归拢待整改条数，口径与巡检侧实时对齐；
          验收结论为对外口径，验收后进入统一完工清单。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出隐患整改台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <div class="sync-panel">
      <h3>巡检任务同步台账：每条路线待整改条数</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>巡检路线</th>
            <th>待整改</th>
            <th>整改中</th>
            <th>未闭环合计（巡检口径）</th>
            <th>隐患台账当前值</th>
            <th>对账</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in routeCounts" :key="row.route">
            <td>{{ row.route }}</td>
            <td>{{ row.pending }}</td>
            <td>{{ row.inProgress }}</td>
            <td>{{ row.open }}</td>
            <td>{{ routePendingSnapshot[row.route] ?? 0 }}</td>
            <td :class="row.open === (routePendingSnapshot[row.route] ?? 0) ? 'conclusion-strong' : 'error-text'">
              {{ row.open === (routePendingSnapshot[row.route] ?? 0) ? '一致' : '不一致' }}
            </td>
          </tr>
          <tr v-if="!routeCounts.length">
            <td colspan="6" class="empty-state">暂无按路线归拢的隐患</td>
          </tr>
        </tbody>
      </table>
      <p class="sync-time">最近同步：{{ syncedAt || '—' }} · 归属单位：{{ session.unit }}</p>
    </div>

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>巡检路线</span>
        <select v-model="draft.route">
          <option value="">全部路线</option>
          <option v-for="route in routes" :key="route" :value="route">{{ route }}</option>
          <option value="（未归线）">（未归线）</option>
        </select>
      </label>
      <label class="filter-item">
        <span>整改状态</span>
        <select v-model="draft.status">
          <option value="">全部状态</option>
          <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>检索</span>
        <input v-model="draft.keyword" placeholder="隐患编号 / 巡检编号 / 舱室" />
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in records" :key="row.id">
          <td>{{ row.code }}</td>
          <td>{{ row.patrolCode }}</td>
          <td>{{ row.route || '（未归线）' }}</td>
          <td>{{ row.cabin || '—' }}</td>
          <td>{{ row.level }}</td>
          <td>{{ row.measure }}</td>
          <td>{{ row.owner }}<span class="unit-chip">{{ row.ownerUnit }}</span></td>
          <td>{{ row.foundDate }}</td>
          <td>{{ row.deadline }}</td>
          <td :class="row.status === '已逾期' ? 'error-text' : ''">{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="apply('派发整改', row)">派发整改</button>
            <button class="link" type="button" @click="openAccept(row)">提交验收</button>
            <button class="link" type="button" @click="apply('标记逾期', row)">标记逾期</button>
          </td>
        </tr>
        <tr v-if="!records.length">
          <td :colspan="columns.length + 2" class="empty-state">当前条件下没有隐患记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ records.length }} 条隐患记录（收窄后）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <CompletionLedger default-source="隐患验收" />

    <template v-if="acceptTarget">
      <div class="modal-mask" @click.self="acceptTarget = null">
        <div class="modal">
          <h3>隐患验收：{{ acceptTarget.code }}</h3>
          <p class="form-tip">来源巡检：{{ acceptTarget.patrolCode }} · {{ acceptTarget.route }}</p>
          <div class="form-grid">
            <label class="form-field full">
              <span>验收结论（对外口径） <span class="required-mark">*</span></span>
              <textarea v-model="acceptConclusion"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="acceptTarget = null">取消</button>
            <button class="btn primary" type="button" @click="submitAccept">提交验收</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { useSessionStore } from '@/stores/session'
import { ROUTES } from '@/domain/patrol/rules'
import CompletionLedger from '@/components/CompletionLedger.vue'
import {
  acceptHazard,
  countRoutePending,
  dispatchHazard,
  getHazardState,
  hazardStats,
  markHazardOverdue,
  queryHazards,
} from '@/domain/hazard/store'
import type { HazardQuery, HazardRecord } from '@/domain/hazard/types'
import { HAZARD_STATUSES } from '@/domain/hazard/types'
import { downloadEntries } from '@/views/patrol/export'

const session = useSessionStore()
const routes = ROUTES as readonly string[]
const statuses = HAZARD_STATUSES

const columns = [
  '隐患编号', '来源巡检', '巡检路线', '所属舱室', '隐患等级', '整改措施',
  '责任人员', '发现日期', '整改期限',
]

const draft = reactive<HazardQuery>({ route: '', status: '', keyword: '' })
const applied = ref<HazardQuery>({ route: '', status: '', keyword: '' })
const records = ref<HazardRecord[]>([])
const errorMessage = ref('')

const stats = computed(() => hazardStats())
const statCards = computed(() => [
  { label: '待整改隐患', value: stats.value.pending },
  { label: '整改中隐患', value: stats.value.inProgress },
  { label: '已逾期隐患', value: stats.value.overdue },
  { label: '已验收', value: stats.value.accepted },
])

const routeCounts = computed(() => countRoutePending())
const routePendingSnapshot = computed(() => getHazardState().routePending)
const syncedAt = computed(() => getHazardState().routePendingSyncedAt)

function reload() {
  records.value = queryHazards(applied.value)
}

function applyFilters() {
  applied.value = { ...draft }
  reload()
}

function resetFilters() {
  Object.assign(draft, { route: '', status: '', keyword: '' })
  applied.value = { ...draft }
  reload()
}

function apply(action: '派发整改' | '标记逾期', row: HazardRecord) {
  errorMessage.value = ''
  const result =
    action === '派发整改'
      ? dispatchHazard(row.id, session.unit)
      : markHazardOverdue(row.id, session.unit)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

const acceptTarget = ref<HazardRecord | null>(null)
const acceptConclusion = ref('')
function openAccept(row: HazardRecord) {
  acceptTarget.value = row
  acceptConclusion.value = row.acceptConclusion
}
function submitAccept() {
  if (!acceptTarget.value) {
    return
  }
  const result = acceptHazard(acceptTarget.value.id, session.unit, acceptConclusion.value)
  acceptTarget.value = null
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function exportRows() {
  downloadEntries('hazard', applied.value)
}

onMounted(reload)
</script>
