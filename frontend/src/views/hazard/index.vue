<template>
  <section class="page" data-module="hazard">
    <header class="page-head">
      <div>
        <h2>隐患整改管理</h2>
        <p class="page-desc">
          按巡检路线归拢的待整改条数<b>以本台账为对外口径</b>；巡检侧归拢数仅在备查区做差异对账。验收结论统一落入跨入口共享的完工清单。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记隐患记录</button>
        <button class="btn" type="button" @click="exportRows">导出隐患整改清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待整改隐患</span>
        <strong class="stat-value">{{ statusCount('待整改') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">整改中隐患</span>
        <strong class="stat-value">{{ statusCount('整改中') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已逾期隐患</span>
        <strong class="stat-value">{{ statusCount('已逾期') }}</strong>
      </article>
    </div>

    <!-- 各路线待整改条数：对外口径（隐患整改台账） -->
    <div class="route-board">
      <header class="route-board-head">
        <h3>各巡检路线待整改条数（对外口径 · 取自隐患整改台账）</h3>
        <span class="board-note">待整改 / 整改中 / 已逾期均计入未闭环</span>
      </header>
      <div class="route-cards">
        <article v-for="item in routeStats" :key="item.route" class="route-card">
          <span class="route-name">{{ item.route }}</span>
          <strong class="route-count">{{ item.ledgerPending }}</strong>
          <span class="route-sub">条待整改</span>
          <i v-if="item.incomplete" class="mark mark-missing">路线残缺任务 {{ item.incomplete }}</i>
        </article>
      </div>
    </div>

    <details class="archive-box">
      <summary>留档备查：巡检侧按路线归拢数与台账口径对账（不作为对外结论）</summary>
      <table class="data-table">
        <thead>
          <tr>
            <th>巡检路线</th>
            <th>对外：台账待整改</th>
            <th>备查：巡检归拢（已发现待闭环）</th>
            <th>差异</th>
            <th>路线残缺任务</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in routeStats" :key="`arc-${item.route}`">
            <td>{{ item.route }}</td>
            <td>{{ item.ledgerPending }}</td>
            <td>{{ item.patrolPending }}</td>
            <td>
              <span v-if="item.patrolPending - item.ledgerPending > 0" class="warn-text">
                巡检多 {{ item.patrolPending - item.ledgerPending }} 条（已发现未建账）
              </span>
              <span v-else class="ok-text">口径一致</span>
            </td>
            <td>{{ item.incomplete }}</td>
          </tr>
        </tbody>
      </table>
      <p class="board-note">说明：对外只呈现隐患整改台账的统计；巡检侧归拢数仅用于发现「应建未建」差异，不替代台账。</p>
    </details>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>序号</th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="String(row.id)">
          <td>{{ index + 1 }}</td>
          <td v-for="column in columns" :key="column">
            <span>{{ displayText(row, column) }}</span>
            <i v-for="tag in fieldTags(row, column)" :key="tag" class="mark" :class="`mark-${tagClass(tag)}`">{{ tag }}</i>
            <i v-if="column === '隐患编号' && completionMap.has(Number(row.id))" class="mark mark-closed">已入完工清单</i>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button v-for="action in actions" :key="action" class="link" type="button" @click="runAction(action, row)">
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无隐患整改数据，可先登记隐患记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条隐患整改记录（与上表条数一致）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 详情面板：直接取列表里的同一行 -->
    <div v-if="detailRow" class="drawer-mask" @click.self="detailId = null">
      <aside class="drawer">
        <header class="drawer-head">
          <h3>隐患详情 · {{ displayText(detailRow, '隐患编号') }}</h3>
          <button class="btn ghost" type="button" @click="detailId = null">关闭</button>
        </header>
        <table class="detail-table">
          <tbody>
            <tr v-for="field in detailFields" :key="field">
              <th>{{ field }}</th>
              <td>
                <span>{{ displayText(detailRow, field) }}</span>
                <i v-for="tag in fieldTags(detailRow, field)" :key="tag" class="mark" :class="`mark-${tagClass(tag)}`">{{ tag }}</i>
              </td>
            </tr>
            <tr>
              <th>当前状态</th>
              <td>{{ detailRow.status }}</td>
            </tr>
            <tr v-if="completionMap.has(Number(detailRow.id))">
              <th>验收结论（对外）</th>
              <td>
                <strong>{{ completionMap.get(Number(detailRow.id))?.conclusion }}</strong>
                <span class="muted">（{{ completionMap.get(Number(detailRow.id))?.acceptedAt }}）</span>
                <ul v-if="completionMap.get(Number(detailRow.id))?.archived.length" class="archived-list">
                  <li v-for="(item, i) in completionMap.get(Number(detailRow.id))?.archived" :key="i">
                    {{ item.conclusion }}<br /><span class="muted">{{ item.at }} · {{ item.by }}</span>
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </aside>
    </div>

    <CompletionLedger bizType="隐患验收" title="隐患验收完工清单（与设施检修入口同一份）" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as genericAction,
} from '@/api/local-service'
import { completionOf, recordCompletion } from '@/api/completion-service'
import { routePendingStats } from '@/data/patrol-rules'
import { listRows } from '@/data/local-store'
import CompletionLedger from '@/components/CompletionLedger.vue'
import { useSessionStore } from '@/stores/session'
import type { ActionResult, EntryRow } from '@/data/types'

const session = useSessionStore()
const meta = moduleMeta('hazard')
const columns = ['隐患编号', '隐患部位', '隐患等级', '整改措施', '责任人员', '发现日期', '整改期限', '问题来源', '所属路线', '关联巡检编号', '所属单位']
const detailFields = [...columns]
const actions = ['派发整改', '提交验收', '标记逾期']
const statuses = ['待整改', '整改中', '已验收', '已逾期']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ['隐患编号', '隐患部位', '所属路线']
const detailId = ref<number | null>(null)

const detailRow = computed(() =>
  detailId.value == null ? undefined : rows.value.find((row) => Number(row.id) === detailId.value),
)

const statusSummary = computed(() =>
  statuses.map((status) => ({ status, count: rows.value.filter((row) => String(row.status) === status).length })),
)
function statusCount(status: string): number {
  return statusSummary.value.find((item) => item.status === status)?.count ?? 0
}

const routeStats = computed(() => routePendingStats(listRows('patrol'), listRows('hazard')))
const completionMap = computed(() => {
  const map = new Map<number, ReturnType<typeof completionOf>>()
  for (const row of rows.value) map.set(Number(row.id), completionOf('隐患验收', Number(row.id)))
  return map
})

function displayText(row: EntryRow, field: string): string {
  const value = row[field]
  if (value === undefined || value === null || String(value).trim() === '') return '—（留空）'
  return String(value)
}

function fieldTags(row: EntryRow, field: string): string[] {
  const tag = row.__prov?.[field]
  return tag ? [tag] : []
}

function tagClass(tag: string): string {
  if (tag === '推定') return 'infer'
  if (tag === '回填') return 'backfill'
  return 'missing'
}

function openDetail(row: EntryRow): void {
  detailId.value = Number(row.id)
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '隐患记录登记入口尚未接入审批流；巡检上报会自动按路线建账'
}

function assertOwnership(row: EntryRow): ActionResult | null {
  const owner = String(row['所属单位'] ?? '').trim()
  if (!owner) return { ok: false, message: `隐患 ${row['隐患编号']} 归属单位残缺，请先补录归属` }
  if (owner !== session.unit) {
    return { ok: false, message: `归属之外的操作已拒绝：隐患 ${row['隐患编号']} 归属「${owner}」，当前身份为「${session.unit}」` }
  }
  return null
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const denied = assertOwnership(row)
  if (denied) {
    errorMessage.value = denied.message
    return
  }

  if (action === '提交验收') {
    if (String(row.status) === '已验收') {
      errorMessage.value = `隐患 ${row['隐患编号']} 已验收，重复验收只算一次`
      return
    }
    if (!['整改中', '已逾期'].includes(String(row.status))) {
      errorMessage.value = `隐患 ${row['隐患编号']} 当前为「${row.status}」，派发整改后才能提交验收`
      return
    }
  }

  const result = genericAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }

  if (action === '提交验收') {
    // 验收结果落到其他入口共用的完工清单；后到结论不替换对外口径，只留档备查。
    const outcome = recordCompletion({
      bizType: '隐患验收',
      bizId: Number(row.id),
      code: String(row['隐患编号'] ?? ''),
      source: String(row['问题来源'] ?? '隐患整改管理'),
      object: `${String(row['隐患部位'] ?? '')} ${String(row['整改措施'] ?? '')}`.trim(),
      route: String(row['所属路线'] ?? ''),
      conclusion: '验收合格，整改闭环',
      context: { unit: session.unit, acceptor: session.operator },
    })
    errorMessage.value = outcome.message
  } else {
    errorMessage.value = result.message
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '隐患整改管理列表读取失败'
  }
}

onMounted(reload)
</script>
