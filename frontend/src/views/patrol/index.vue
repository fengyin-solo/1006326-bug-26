<template>
  <section class="page" data-module="patrol">
    <header class="page-head">
      <div>
        <h2>廊内巡检任务管理</h2>
        <p class="page-desc">
          先按巡检路线、巡检班组、计划日期与检索词收窄，再按「路线 → 班组 → 计划日期 → 下发日期 → 巡检编号」的既定先后排列；翻页与操作后都回到同一条任务。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记巡检任务</button>
        <button class="btn" type="button" @click="exportRows">导出巡检任务清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待巡检任务</span>
        <strong class="stat-value">{{ statusCount('待巡检') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">巡检中任务</span>
        <strong class="stat-value">{{ statusCount('巡检中') }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">本月发现问题数</span>
        <strong class="stat-value">{{ monthlyFound }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>巡检路线</span>
        <select v-model="filters.route">
          <option value="">全部路线</option>
          <option v-for="route in routeOptions" :key="route" :value="route">{{ route }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>巡检班组</span>
        <select v-model="filters.crew">
          <option value="">全部班组</option>
          <option v-for="crew in crewOptions" :key="crew" :value="crew">{{ crew }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>计划日期</span>
        <input v-model="filters.planDate" type="date" />
      </label>
      <label class="filter-item filter-grow">
        <span>检索（编号 / 人员 / 舱室 / 单位等）</span>
        <input v-model="filters.keyword" placeholder="输入关键字，检索后仍保持既定先后" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table patrol-table">
      <thead>
        <tr>
          <th class="col-seq">序号</th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in page.items"
          :key="String(row.id)"
          :data-row-id="row.id"
          :class="{ 'row-current': Number(row.id) === anchorId }"
        >
          <td class="col-seq">{{ page.startSeq + index }}</td>
          <td v-for="column in columns" :key="column">
            <span>{{ displayText(row, column) }}</span>
            <i v-for="tag in fieldTags(row, column)" :key="tag" class="mark" :class="`mark-${tagClass(tag)}`">{{ tag }}</i>
          </td>
          <td>
            <span>{{ row.status }}</span>
            <i v-if="row.__prov?.['所属单位']" class="mark mark-backfill" :title="`归属单位为历史回填：${row['所属单位']}`">归属回填</i>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button v-for="action in actions" :key="action" class="link" type="button" @click="runAction(action, row)">
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!page.items.length">
          <td :colspan="columns.length + 3" class="empty-state">没有符合收窄条件的巡检任务，可放宽路线 / 班组 / 日期 / 检索词后再查</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot patrol-foot">
      <span>
        第 <strong>{{ page.startSeq || 0 }}–{{ page.endSeq }}</strong> 条 / 共 <strong>{{ page.total }}</strong> 条
        （本页剩余 {{ remainOnPage }} 条未翻，收窄后剩余 {{ remainAfterPage }} 条）
      </span>
      <div class="pager">
        <label class="page-size">
          每页
          <select v-model.number="pageSize" @change="changePageSize">
            <option :value="8">8</option>
            <option :value="15">15</option>
            <option :value="30">30</option>
          </select>
          条
        </label>
        <button class="btn" type="button" :disabled="page.page <= 1" @click="goPage(page.page - 1)">上一页</button>
        <span class="page-indicator">{{ page.page }} / {{ page.pages }}</span>
        <button class="btn" type="button" :disabled="page.page >= page.pages" @click="goPage(page.page + 1)">下一页</button>
      </div>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <!-- 详情面板：行对象由列表直接传入，与列表取值完全同源 -->
    <div v-if="detailRow" class="drawer-mask" @click.self="closeDetail">
      <aside class="drawer">
        <header class="drawer-head">
          <h3>巡检任务详情 · {{ displayText(detailRow, '巡检编号') }}</h3>
          <button class="btn ghost" type="button" @click="closeDetail">关闭</button>
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
          </tbody>
        </table>
        <footer class="drawer-foot">
          <button v-for="action in actions" :key="action" class="btn" type="button" @click="runAction(action, detailRow)">
            {{ action }}
          </button>
        </footer>
      </aside>
    </div>

    <!-- 登记 / 补录：缺项当场补齐，归属单位强制当前身份 -->
    <div v-if="creating" class="drawer-mask" @click.self="creating = false">
      <aside class="drawer">
        <header class="drawer-head">
          <h3>登记巡检任务</h3>
          <button class="btn ghost" type="button" @click="creating = false">关闭</button>
        </header>
        <form class="create-form" @submit.prevent="submitCreate">
          <label v-for="field in createFields" :key="field.key" class="create-item">
            <span>{{ field.label }}<em>*</em></span>
            <select v-if="field.type === 'select-route'" v-model="createForm[field.key]">
              <option value="" disabled>请选择巡检路线（补录必填）</option>
              <option v-for="option in routeOptions" :key="option" :value="option">{{ option }}</option>
            </select>
            <select v-else-if="field.type === 'select-crew'" v-model="createForm[field.key]">
              <option value="" disabled>请选择巡检班组（补录必填）</option>
              <option v-for="option in crewOptions" :key="option" :value="option">{{ option }}</option>
            </select>
            <input v-else v-model="createForm[field.key]" :type="field.type ?? 'text'" :placeholder="`请填写${field.label}，缺项请一并补齐`" />
          </label>
          <p class="form-note">归属单位：{{ session.unit }}（不可由其他单位代登记）</p>
          <p v-if="createError" class="error-text">{{ createError }}</p>
          <footer class="drawer-foot">
            <button class="btn primary" type="submit">提交登记</button>
          </footer>
        </form>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import {
  createPatrol,
  exportPatrol,
  monthlyFoundCount,
  operatePatrol,
  orderedPatrol,
  queryPatrol,
  type PatrolDraft,
} from '@/api/patrol-service'
import { PATROL_CREWS, PATROL_ROUTES } from '@/data/patrol-rules'
import { useSessionStore } from '@/stores/session'
import type { ActionResult, EntryRow, PatrolFilters, PatrolPageResult } from '@/data/types'

const session = useSessionStore()

const columns = ['巡检编号', '巡检路线', '巡检班组', '计划日期', '下发日期', '完成时间', '发现问题数', '巡检人员', '所属舱室', '所属单位'] as const
const detailFields = [...columns, '上报留档编号'] as const
const actions = ['开始巡检', '确认完成', '上报问题']
const statuses = ['待巡检', '巡检中', '已完成', '已上报']

const routeOptions = PATROL_ROUTES
const crewOptions = PATROL_CREWS

const filters = reactive<PatrolFilters>({ route: '', crew: '', planDate: '', keyword: '' })
const pageNo = ref(1)
const pageSize = ref(8)
const anchorId = ref<number | null>(null)
const message = ref('')
const messageOk = ref(false)
const page = ref<PatrolPageResult>({ items: [], total: 0, page: 1, size: 8, pages: 1, startSeq: 0, endSeq: 0 })
const detailId = ref<number | null>(null)

const creating = ref(false)
const createError = ref('')
const createFields: { key: keyof PatrolDraft | 'planDate'; label: string; type?: string }[] = [
  { key: 'route', label: '巡检路线', type: 'select-route' },
  { key: 'crew', label: '巡检班组', type: 'select-crew' },
  { key: 'planDate', label: '计划日期', type: 'date' },
  { key: 'person', label: '巡检人员' },
  { key: 'cabin', label: '所属舱室' },
  { key: 'foundIssues', label: '发现问题数', type: 'number' },
]
const createForm = reactive({ route: '', crew: '', planDate: '', person: '', cabin: '', foundIssues: 0 })

const VIEW_STATE_KEY = 'patrol:view-state'
let restoredScroll: number | null = null

// 详情面板直接引用当前列表页里的同一行对象——列表怎么排、怎么收窄，面板就取什么。
const detailRow = computed<EntryRow | undefined>(() =>
  detailId.value == null ? undefined : page.value.items.find((row) => Number(row.id) === detailId.value),
)

const fullOrdered = computed(() => orderedPatrol(filters))
const statusSummary = computed(() =>
  statuses.map((status) => ({ status, count: fullOrdered.value.filter((row) => row.status === status).length })),
)
const monthlyFound = ref(0)
function statusCount(status: string): number {
  return statusSummary.value.find((item) => item.status === status)?.count ?? 0
}
const remainOnPage = computed(() => page.value.items.length)
const remainAfterPage = computed(() => Math.max(0, page.value.total - page.value.endSeq))

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

function persistState(): void {
  try {
    window.sessionStorage.setItem(
      VIEW_STATE_KEY,
      JSON.stringify({ filters: { ...filters }, pageNo: pageNo.value, pageSize: pageSize.value, scrollY: window.scrollY }),
    )
  } catch {
    // 会话存储不可用时只影响返回定位，不影响数据口径。
  }
}

function restoreState(): void {
  try {
    const raw = window.sessionStorage.getItem(VIEW_STATE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as { filters?: PatrolFilters; pageNo?: number; pageSize?: number; scrollY?: number }
    if (saved.filters) Object.assign(filters, saved.filters)
    if (saved.pageNo) pageNo.value = saved.pageNo
    if (saved.pageSize) pageSize.value = saved.pageSize
    restoredScroll = typeof saved.scrollY === 'number' ? saved.scrollY : null
  } catch {
    // 状态损坏时退回默认视图，数据本身不受影响。
  }
}

function scrollToAnchor(): void {
  nextTick(() => {
    if (anchorId.value != null) {
      const target = document.querySelector<HTMLElement>(`tr[data-row-id="${anchorId.value}"]`)
      target?.scrollIntoView({ block: 'center' })
      return
    }
    if (restoredScroll != null) {
      window.scrollTo({ top: restoredScroll })
      restoredScroll = null
    }
  })
}

function exportRows(): void {
  const { filename, content } = exportPatrol({ ...filters })
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function load(): void {
  page.value = queryPatrol({ page: pageNo.value, size: pageSize.value, filters: { ...filters }, anchorId: anchorId.value })
  pageNo.value = page.value.page
  monthlyFound.value = monthlyFoundCount()
  persistState()
  scrollToAnchor()
}

function applyFilters(): void {
  pageNo.value = 1
  anchorId.value = null
  detailId.value = null
  message.value = ''
  load()
}

function resetFilters(): void {
  Object.assign(filters, { route: '', crew: '', planDate: '', keyword: '' })
  pageNo.value = 1
  anchorId.value = null
  detailId.value = null
  message.value = ''
  load()
}

function goPage(target: number): void {
  pageNo.value = target
  anchorId.value = null
  load()
}

function changePageSize(): void {
  pageNo.value = 1
  anchorId.value = null
  load()
}

function openDetail(row: EntryRow): void {
  detailId.value = Number(row.id)
}

function closeDetail(): void {
  detailId.value = null
}

function notify(result: ActionResult & { anchorId?: number }): void {
  message.value = result.message
  messageOk.value = result.ok
  if (result.anchorId != null) {
    // 以操作的任务为锚点：收窄集变化、状态流转后重新分页，仍停在同一条任务上。
    anchorId.value = Number(result.anchorId)
  }
  load()
}

function runAction(action: string, row: EntryRow): void {
  notify(operatePatrol(Number(row.id), action, { unit: session.unit }))
}

function openCreate(): void {
  Object.assign(createForm, { route: '', crew: '', planDate: '', person: '', cabin: '', foundIssues: 0 })
  createError.value = ''
  creating.value = true
}

function submitCreate(): void {
  const draft: PatrolDraft = {
    route: createForm.route.trim(),
    crew: createForm.crew.trim(),
    planDate: createForm.planDate.trim(),
    person: createForm.person.trim(),
    cabin: createForm.cabin.trim(),
    foundIssues: Number(createForm.foundIssues ?? 0),
  }
  const missing: string[] = []
  if (!draft.route) missing.push('巡检路线')
  if (!draft.crew) missing.push('巡检班组')
  if (!draft.planDate) missing.push('计划日期')
  if (!draft.person) missing.push('巡检人员')
  if (!draft.cabin) missing.push('所属舱室')
  if (missing.length) {
    createError.value = `补录缺项请一并补齐：${missing.join('、')}`
    return
  }
  const result = createPatrol(draft, { unit: session.unit })
  if (!result.ok) {
    createError.value = result.message
    return
  }
  creating.value = false
  // 新登记后按其为锚点回到它所在页，马上能看到。
  anchorId.value = result.id ?? null
  pageNo.value = 1
  notify(result)
}

onMounted(() => {
  restoreState()
  load()
  // 切去其他入口再返回时，滚动条也停在原来那条任务附近。
  window.addEventListener('beforeunload', persistState)
})

onBeforeUnmount(() => {
  persistState()
  window.removeEventListener('beforeunload', persistState)
})
</script>
