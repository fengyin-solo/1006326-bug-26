<template>
  <section class="page" data-module="patrol">
    <header class="page-head">
      <div>
        <h2>廊内巡检任务管理</h2>
        <p class="page-desc">
          先按巡检路线、巡检班组与计划日期收窄，再按「路线既定先后 → 班组既定先后 → 计划日期 → 编号」排列；
          名次取收窄后的稳定名次，往前往后都停在同一条任务上。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记巡检任务</button>
        <button class="btn" type="button" @click="exportRows">导出当前清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item">残缺待补：{{ stats.incomplete }}</span>
    </p>

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>巡检路线</span>
        <select v-model="draftFilters.route">
          <option value="">全部路线</option>
          <option v-for="route in routes" :key="route" :value="route">{{ route }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>巡检班组</span>
        <select v-model="draftFilters.team">
          <option value="">全部班组</option>
          <option v-for="team in teams" :key="team" :value="team">{{ team }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>计划日期</span>
        <input v-model="draftFilters.planDate" placeholder="如 2024 / 2024-06" />
      </label>
      <label class="filter-item">
        <span>检索</span>
        <input v-model="draftFilters.keyword" placeholder="编号 / 人员 / 舱室 / 单位" />
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 56px">名次</th>
          <th v-for="column in columns" :key="column.key">{{ column.label }}</th>
          <th>对外结论</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in page.items" :key="row.id">
          <td>{{ row.rank }}</td>
          <td>{{ row.code }}</td>
          <td>
            {{ row.route || '' }}
            <span v-if="row.routeInferred" class="tag tag-inferred">舱室推定</span>
            <span v-else-if="!row.route" class="tag tag-missing">路线残缺</span>
          </td>
          <td>{{ row.team }}</td>
          <td>{{ row.planDate }}</td>
          <td>{{ row.completeTime || '—' }}</td>
          <td>{{ row.issueCount }}</td>
          <td>{{ row.inspector || '—' }}</td>
          <td>{{ row.ownerUnit }}
            <span v-if="row.source !== '新建'" class="tag tag-backfill">{{ row.source }}</span>
          </td>
          <td>{{ row.status }}</td>
          <td>
            <span v-if="row.acceptConclusion" class="conclusion-strong">{{ row.acceptConclusion }}</span>
            <span v-else class="conclusion-pending">待验收（巡检结论留档）</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button class="link" type="button" @click="runAction('开始巡检', row)">开始巡检</button>
            <button class="link" type="button" @click="openComplete(row)">确认完成</button>
            <button class="link" type="button" @click="openReport(row)">上报问题</button>
            <button class="link" type="button" @click="openAccept(row)">验收</button>
            <button v-if="row.incompleteFields.length" class="link" type="button" @click="openBackfill(row)">补录</button>
          </td>
        </tr>
        <tr v-if="!page.items.length">
          <td :colspan="columns.length + 3" class="empty-state">当前收窄条件下没有巡检任务</td>
        </tr>
      </tbody>
    </table>

    <div class="pagination">
      <button class="btn" type="button" :disabled="page.page <= 1" @click="goPage(page.page - 1)">上一页</button>
      <span>第 {{ page.page }} / {{ page.pages }} 页</span>
      <button class="btn" type="button" :disabled="page.page >= page.pages" @click="goPage(page.page + 1)">下一页</button>
      <span class="page-remain">
        共 {{ page.total }} 条 · 本页 {{ page.items.length }} 条 · 剩余 {{ remainAfterPage }} 条
      </span>
    </div>

    <footer class="page-foot">
      <span>归属单位：{{ session.unit }} · 归属之外的操作一律拒绝</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 详情抽屉：与列表同源取值 -->
    <template v-if="detail">
      <div class="drawer-mask" @click="detail = null" />
      <aside class="drawer">
        <div class="close-row">
          <button class="btn ghost" type="button" @click="detail = null">关闭</button>
        </div>
        <h3>巡检任务 {{ detail.code }}</h3>
        <p class="page-desc">
          当前收窄结果中的第 {{ detail.rank }} 名 · {{ detail.status }}
        </p>

        <table class="kv-list">
          <tbody>
            <tr v-for="item in detailRows" :key="item.label">
              <th>
                {{ item.label }}
                <span v-if="item.missing" class="tag tag-missing">残缺</span>
              </th>
              <td :class="{ 'cell-missing': item.missing }">
                {{ item.value }}
                <span v-if="item.extra" class="tag" :class="item.extraClass">{{ item.extra }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="kv-block">
          <h4>对外结论（验收口径）</h4>
          <p :class="detail.acceptConclusion ? 'conclusion-strong' : 'conclusion-pending'">
            {{ detail.acceptConclusion || '暂无验收结论，待验收后对外发布' }}
          </p>
          <h4>巡检结论（留档备查，不对外）</h4>
          <p>{{ detail.patrolConclusion || '—' }}</p>
        </div>

        <div v-if="detail.incompleteFields.length" class="kv-block">
          <h4>残缺字段</h4>
          <p>
            <span v-for="field in detail.incompleteFields" :key="field" class="tag tag-missing">{{ field }}</span>
          </p>
          <button class="btn primary" type="button" @click="openBackfill(detail)">缺项一并补齐</button>
        </div>

        <div class="kv-block">
          <h4>上报流水（重复提交只算一次）</h4>
          <p v-for="log in detailReports" :key="log.id" class="archive-box">
            {{ log.submittedAt }} · {{ log.submitter }}（{{ log.unit }}）·
            <span :class="log.accepted ? 'conclusion-strong' : 'error-text'">{{ log.accepted ? '受理' : '未受理' }}</span>
            · {{ log.message }}
          </p>
          <p v-if="!detailReports.length" class="page-desc">暂无上报流水</p>
        </div>

        <div class="kv-block">
          <h4>历史记录（原口径留档）</h4>
          <p v-for="archive in detailArchives" :key="archive.id" class="archive-box">
            {{ archive.archivedAt }} · {{ archive.reason }}
            {{ formatArchive(archive.original) }}
          </p>
          <p v-if="!detailArchives.length" class="page-desc">暂无留档</p>
        </div>
      </aside>
    </template>

    <!-- 确认完成 -->
    <template v-if="completeForm">
      <div class="modal-mask" @click.self="completeForm = null">
        <div class="modal">
          <h3>确认完成：{{ completeForm.code }}</h3>
          <div class="form-grid">
            <label class="form-field full">
              <span>巡检结论（留档备查）</span>
              <textarea v-model="completeConclusion"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="completeForm = null">取消</button>
            <button class="btn primary" type="button" @click="submitComplete">确认完成</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 上报问题：同任务重复提交只算一次 -->
    <template v-if="reportForm">
      <div class="modal-mask" @click.self="reportForm = null">
        <div class="modal">
          <h3>上报问题：{{ reportForm.code }}</h3>
          <div class="form-grid">
            <label class="form-field">
              <span>发现问题数 <span class="required-mark">*</span></span>
              <input v-model.number="reportInput.issueCount" type="number" min="0" />
            </label>
            <label class="form-field">
              <span>隐患等级</span>
              <select v-model="reportInput.level">
                <option>一般</option>
                <option>较大</option>
                <option>重大</option>
              </select>
            </label>
            <label class="form-field full">
              <span>巡检结论（留档）/ 问题描述</span>
              <textarea v-model="reportInput.conclusion"></textarea>
            </label>
            <label class="form-field full">
              <span>整改措施建议（同步隐患台账）</span>
              <textarea v-model="reportInput.measure"></textarea>
            </label>
          </div>
          <p class="form-tip">同一任务重复提交上报只算一次；隐患按巡检编号归拢，自动同步到整改台账。</p>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="reportForm = null">取消</button>
            <button class="btn primary" type="button" @click="submitReport">提交上报</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 验收：对外结论 -->
    <template v-if="acceptForm">
      <div class="modal-mask" @click.self="acceptForm = null">
        <div class="modal">
          <h3>任务验收：{{ acceptForm.code }}</h3>
          <div class="form-grid">
            <label class="form-field full">
              <span>验收结论（对外口径） <span class="required-mark">*</span></span>
              <textarea v-model="acceptConclusion" placeholder="该结论对外呈现，巡检结论仅留档"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="acceptForm = null">取消</button>
            <button class="btn primary" type="button" @click="submitAccept">提交验收</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 补录：缺项一并补齐 -->
    <template v-if="backfillForm">
      <div class="modal-mask" @click.self="backfillForm = null">
        <div class="modal">
          <h3>补录任务：{{ backfillForm.code }}</h3>
          <p class="form-tip">补录前当前记录会再按原口径归档一次；缺路线可填舱室按归属推定。</p>
          <div class="form-grid">
            <label class="form-field">
              <span>巡检路线（缺则按舱室推定）</span>
              <select v-model="backfillInput.route">
                <option value="">按舱室推定</option>
                <option v-for="route in routes" :key="route" :value="route">{{ route }}</option>
              </select>
            </label>
            <label class="form-field">
              <span>巡检班组 <span class="required-mark">*</span></span>
              <select v-model="backfillInput.team">
                <option v-for="team in teams" :key="team" :value="team">{{ team }}</option>
              </select>
            </label>
            <label class="form-field">
              <span>计划日期 <span class="required-mark">*</span></span>
              <input v-model="backfillInput.planDate" placeholder="YYYY-MM-DD" />
            </label>
            <label class="form-field">
              <span>所属舱室</span>
              <input v-model="backfillInput.cabin" placeholder="如 C-A-02" />
            </label>
            <label class="form-field">
              <span>巡检人员</span>
              <input v-model="backfillInput.inspector" />
            </label>
            <label class="form-field">
              <span>归属单位</span>
              <select v-model="backfillInput.ownerUnit">
                <option v-for="unit in unitOptions" :key="unit" :value="unit">{{ unit }}</option>
              </select>
            </label>
          </div>
          <p v-if="backfillForm.incompleteFields.length" class="form-tip">
            当前残缺：<span v-for="field in backfillForm.incompleteFields" :key="field" class="tag tag-missing">{{ field }}</span>
          </p>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="backfillForm = null">取消</button>
            <button class="btn primary" type="button" @click="submitBackfill">补齐缺项</button>
          </div>
        </div>
      </div>
    </template>

    <!-- 登记新任务 -->
    <template v-if="createOpen">
      <div class="modal-mask" @click.self="createOpen = false">
        <div class="modal">
          <h3>登记巡检任务</h3>
          <div class="form-grid">
            <label class="form-field">
              <span>巡检路线 <span class="required-mark">*</span></span>
              <select v-model="createInput.route">
                <option value="">请选择</option>
                <option v-for="route in routes" :key="route" :value="route">{{ route }}</option>
              </select>
            </label>
            <label class="form-field">
              <span>巡检班组 <span class="required-mark">*</span></span>
              <select v-model="createInput.team">
                <option value="">请选择</option>
                <option v-for="team in teams" :key="team" :value="team">{{ team }}</option>
              </select>
            </label>
            <label class="form-field">
              <span>计划日期 <span class="required-mark">*</span></span>
              <input v-model="createInput.planDate" placeholder="YYYY-MM-DD" />
            </label>
            <label class="form-field">
              <span>所属舱室</span>
              <input v-model="createInput.cabin" placeholder="如 C-A-02" />
            </label>
            <label class="form-field full">
              <span>巡检人员</span>
              <input v-model="createInput.inspector" />
            </label>
          </div>
          <p class="form-tip">归属单位固定为当前值班单位「{{ session.unit }}」，不可代外单位登记。</p>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="createOpen = false">取消</button>
            <button class="btn primary" type="button" @click="submitCreate">登记</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { useSessionStore } from '@/stores/session'
import { UNIT_OPTIONS } from '@/stores/session'
import { ROUTES, TEAMS } from '@/domain/patrol/rules'
import {
  EMPTY_QUERY,
  acceptPatrol,
  backfillTask,
  completePatrol,
  createPatrol,
  getPatrolState,
  getTaskDetail,
  listArchives,
  listReports,
  pageOfTask,
  queryPatrolPage,
  reportPatrol,
  startPatrol,
  patrolStats,
} from '@/domain/patrol/store'
import type { PatrolPage as PatrolPageData } from '@/domain/patrol/types'
import type { BackfillInput, CreateInput, ReportInput } from '@/domain/patrol/store'
import type { PatrolQuery, PatrolTask, RankedPatrolTask } from '@/domain/patrol/types'
import { downloadEntries } from './export'

const session = useSessionStore()
const routes = ROUTES as readonly string[]
const teams = TEAMS as readonly string[]
const unitOptions = UNIT_OPTIONS as readonly string[]

const columns = [
  { key: 'code', label: '巡检编号' },
  { key: 'route', label: '巡检路线' },
  { key: 'team', label: '巡检班组' },
  { key: 'planDate', label: '计划日期' },
  { key: 'completeTime', label: '完成时间' },
  { key: 'issueCount', label: '发现问题数' },
  { key: 'inspector', label: '巡检人员' },
  { key: 'ownerUnit', label: '归属单位' },
  { key: 'status', label: '巡检状态' },
]

const draftFilters = reactive<PatrolQuery>({ ...EMPTY_QUERY })
const appliedFilters = ref<PatrolQuery>({ ...EMPTY_QUERY })
const currentPage = ref(1)
const page = ref<PatrolPageData>({ items: [], total: 0, page: 1, size: 6, pages: 1 })
const errorMessage = ref('')
const detail = ref<RankedPatrolTask | null>(null)

const stats = computed(() => patrolStats())
const statCards = computed(() => [
  { label: '待巡检任务', value: stats.value.pending },
  { label: '巡检中任务', value: stats.value.running },
  { label: '待验收（已上报）', value: stats.value.reported },
  { label: '已验收', value: stats.value.accepted },
])

// 状态汇总按全量口径统计，不随翻页变化。
const statusSummary = computed(() => {
  const { tasks } = getPatrolState()
  return (['待巡检', '巡检中', '已完成', '已上报', '已验收'] as const).map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status).length,
  }))
})

function loadPage() {
  page.value = queryPatrolPage(appliedFilters.value, currentPage.value)
  if (detail.value) {
    detail.value = getTaskDetail(detail.value.id, appliedFilters.value)
  }
}

function applyFilters() {
  appliedFilters.value = { ...draftFilters }
  currentPage.value = 1
  errorMessage.value = ''
  loadPage()
}

function resetFilters() {
  Object.assign(draftFilters, EMPTY_QUERY)
  appliedFilters.value = { ...EMPTY_QUERY }
  currentPage.value = 1
  loadPage()
}

function goPage(target: number) {
  currentPage.value = target
  loadPage()
}

// 剩余条数 = 总数 - 已翻到页的累计条数，末页显 0；与页面显示的总条数始终对得上。
const remainAfterPage = computed(() =>
  Math.max(0, page.value.total - page.value.page * page.value.size),
)

function formatArchive(original: unknown): string {
  try {
    return JSON.stringify(original, null, 2)
  } catch {
    return String(original)
  }
}

/**
 * 动作执行后：结果重排（实际次序不变），并跳回该任务所在页——
 * 往前往后都停在同一条任务上。
 */
function afterMutation(task: PatrolTask | undefined) {
  loadPage()
  if (task) {
    currentPage.value = pageOfTask(task.id, appliedFilters.value)
    loadPage()
  }
  if (detail.value) {
    detail.value = getTaskDetail(detail.value.id, appliedFilters.value)
  }
}

function runAction(action: '开始巡检', row: RankedPatrolTask) {
  errorMessage.value = ''
  const result = startPatrol(row.id, session.unit)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  afterMutation(result.task)
}

const completeForm = ref<RankedPatrolTask | null>(null)
const completeConclusion = ref('')
function openComplete(row: RankedPatrolTask) {
  completeForm.value = row
  completeConclusion.value = row.patrolConclusion
}
function submitComplete() {
  if (!completeForm.value) {
    return
  }
  const result = completePatrol(completeForm.value.id, session.unit, completeConclusion.value)
  completeForm.value = null
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  afterMutation(result.task)
}

const reportForm = ref<RankedPatrolTask | null>(null)
const reportInput = reactive<ReportInput>({
  issueCount: 1,
  conclusion: '',
  level: '一般',
  measure: '',
})
function openReport(row: RankedPatrolTask) {
  reportForm.value = row
  reportInput.issueCount = row.issueCount || 1
  reportInput.conclusion = row.patrolConclusion
  reportInput.level = '一般'
  reportInput.measure = ''
}
function submitReport() {
  if (!reportForm.value) {
    return
  }
  const result = reportPatrol(
    reportForm.value.id,
    session.unit,
    session.operator,
    { ...reportInput },
  )
  reportForm.value = null
  if (!result.ok) {
    errorMessage.value = result.message
    loadPage()
    return
  }
  afterMutation(result.task)
}

const acceptForm = ref<RankedPatrolTask | null>(null)
const acceptConclusion = ref('')
function openAccept(row: RankedPatrolTask) {
  acceptForm.value = row
  acceptConclusion.value = row.acceptConclusion
}
function submitAccept() {
  if (!acceptForm.value) {
    return
  }
  const result = acceptPatrol(acceptForm.value.id, session.unit, acceptConclusion.value)
  acceptForm.value = null
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  afterMutation(result.task)
}

const backfillForm = ref<RankedPatrolTask | null>(null)
const backfillInput = reactive<BackfillInput>({
  route: '',
  team: '',
  planDate: '',
  cabin: '',
  inspector: '',
  ownerUnit: session.unit,
})
function openBackfill(row: RankedPatrolTask) {
  backfillForm.value = row
  backfillInput.route = row.route
  backfillInput.team = row.team
  backfillInput.planDate = row.planDate
  backfillInput.cabin = row.cabin
  backfillInput.inspector = row.inspector
  backfillInput.ownerUnit = row.ownerUnit
}
function submitBackfill() {
  if (!backfillForm.value) {
    return
  }
  const result = backfillTask(backfillForm.value.id, session.unit, { ...backfillInput })
  const targetId = backfillForm.value.id
  backfillForm.value = null
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  afterMutation(result.task)
  detail.value = getTaskDetail(targetId, appliedFilters.value)
}

const createOpen = ref(false)
const createInput = reactive<CreateInput>({
  route: '',
  team: '',
  planDate: '',
  cabin: '',
  inspector: '',
})
function openCreate() {
  Object.assign(createInput, { route: '', team: '', planDate: '', cabin: '', inspector: '' })
  createOpen.value = true
}
function submitCreate() {
  const result = createPatrol({ ...createInput }, session.unit)
  createOpen.value = false
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  // 新任务落在既定次序里：按它的编号页查看，而不是打乱当前页。
  afterMutation(result.task)
}

function openDetail(row: RankedPatrolTask) {
  // 详情面板与列表取值一致：用同一套查询结果定位。
  detail.value = getTaskDetail(row.id, appliedFilters.value)
}

const detailRows = computed(() => {
  if (!detail.value) {
    return []
  }
  const row = detail.value
  const missing = new Set(row.incompleteFields)
  const render = (label: string, value: string, extra?: string, extraClass?: string) => ({
    label,
    value: value || '',
    missing: !value && missing.has(label),
    extra,
    extraClass,
  })
  return [
    render('巡检编号', row.code),
    render('巡检路线', row.route, row.routeInferred ? '舱室推定' : '', 'tag-inferred'),
    render('巡检班组', row.team),
    render('计划日期', row.planDate),
    render('下发日期', row.issuedDate, row.source === '存量回填' ? '按计划日期回填' : '', 'tag-backfill'),
    render('完成时间', row.completeTime),
    render('所属舱室', row.cabin),
    render('巡检人员', row.inspector),
    render('归属单位', row.ownerUnit),
    render('发现问题数', String(row.issueCount)),
    render('数据来源', row.source),
    render('巡检状态', row.status),
    render('验收时间', row.acceptTime),
  ]
})

const detailReports = computed(() => (detail.value ? listReports(detail.value.code) : []))
const detailArchives = computed(() => (detail.value ? listArchives(detail.value.code) : []))

function exportRows() {
  downloadEntries('patrol', appliedFilters.value)
}

onMounted(() => {
  loadPage()
})
</script>
