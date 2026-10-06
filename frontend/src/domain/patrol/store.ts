import { readJSON, writeJSON, nowText, todayISO } from '@/domain/support'
import { listRows as listGenericRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'
import {
  acceptOpenByPatrolCode,
  syncRoutePendingFromPatrol,
  upsertHazardFromPatrol,
} from '@/domain/hazard/store'
import { recordCompletion } from '@/domain/completion/store'
import { LEGACY_PATROL_ROWS, LEGACY_REPORTS } from './seed'
import type { LegacyPatrolRow, LegacyReportLog } from './seed'
import {
  collectIncompleteFields,
  comparePatrol,
  DEFAULT_UNIT,
  inferRouteByCabin,
  matchesQuery,
  PAGE_SIZE,
} from './rules'
import type {
  PatrolArchive,
  PatrolPage,
  PatrolQuery,
  PatrolState,
  PatrolStatus,
  PatrolTask,
  RankedPatrolTask,
  ReportLog,
} from './types'

const PATROL_STORAGE_KEY = 'urban-utility-tunnel:patrol-ledger'
const MIGRATION_VERSION = 1

export { PATROL_STORAGE_KEY, PAGE_SIZE }

export type MutationResult = { ok: boolean; message: string; task?: PatrolTask }

const VALID_STATUS: PatrolStatus[] = ['待巡检', '巡检中', '已完成', '已上报', '已验收']

let state: PatrolState | null = null

export function getPatrolState(): PatrolState {
  if (state === null) {
    const stored = readJSON<PatrolState>(PATROL_STORAGE_KEY)
    if (stored && Array.isArray(stored.tasks) && stored.migratedVersion === MIGRATION_VERSION) {
      state = stored
    } else {
      state = migrate()
      persist()
    }
    // 隐患台账的按路线待整改口径由巡检侧统一定义，进入页面先对齐一次。
    syncRoutePendingFromPatrol()
  }
  return state
}

function persist(): void {
  if (state) {
    writeJSON(PATROL_STORAGE_KEY, state)
  }
}

/* ------------------------------------------------------------------ */
/* 存量迁移：按下发日期一次性补齐；历史原口径整行归档；缺路线按舱室推定 */
/* ------------------------------------------------------------------ */

function collectLegacyRows(): LegacyPatrolRow[] {
  // 内置存量 + 通用脚手架 localStorage 里的老巡检数据（若有），按巡检编号去重合并。
  const byCode = new Map<string, LegacyPatrolRow>()
  for (const row of LEGACY_PATROL_ROWS) {
    byCode.set(row.巡检编号, row)
  }
  for (const generic of listGenericRows('patrol') ?? []) {
    const code = String(generic['巡检编号'] ?? '').trim()
    if (!code || byCode.has(code)) {
      continue
    }
    byCode.set(code, toLegacyShape(generic))
  }
  return [...byCode.values()]
}

function toLegacyShape(row: EntryRow): LegacyPatrolRow {
  return {
    id: Number(row.id),
    status: String(row.status ?? ''),
    pending: Boolean(row.pending),
    abnormal: Boolean(row.abnormal),
    巡检编号: String(row['巡检编号'] ?? ''),
    巡检路线: String(row['巡检路线'] ?? ''),
    巡检班组: String(row['巡检班组'] ?? ''),
    计划日期: String(row['计划日期'] ?? ''),
    完成时间: String(row['完成时间'] ?? ''),
    发现问题数: (row['发现问题数'] as string | number) ?? '',
    巡检人员: String(row['巡检人员'] ?? ''),
    巡检状态: String(row['巡检状态'] ?? ''),
  }
}

function normalizeIssueCount(raw: string | number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.trunc(raw))
  }
  const parsed = Number(String(raw ?? '').trim())
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

function migrate(): PatrolState {
  const legacyRows = collectLegacyRows()
  // 存量任务按计划日期回填（也是下发日期），所以迁移顺序就是计划日期先后。
  const ordered = [...legacyRows].sort((a, b) => {
    const da = a.计划日期 || '9999-99-99'
    const db = b.计划日期 || '9999-99-99'
    if (da !== db) {
      return da < db ? -1 : 1
    }
    return a.巡检编号 < b.巡检编号 ? -1 : a.巡检编号 > b.巡检编号 ? 1 : a.id - b.id
  })

  const tasks: PatrolTask[] = []
  const archives: PatrolArchive[] = []

  ordered.forEach((legacy, index) => {
    const cabin = String(legacy.所属舱室 ?? '').trim()
    const explicitRoute = String(legacy.巡检路线 ?? '').trim()
    // 早年没有巡检路线的，按舱室归属推定；推定不上留空，随后进入残缺字段标注。
    const inferredRoute = explicitRoute ? '' : inferRouteByCabin(cabin)
    const route = explicitRoute || inferredRoute
    const rawStatus = String(legacy.status ?? '').trim() as PatrolStatus
    const status: PatrolStatus = VALID_STATUS.includes(rawStatus) ? rawStatus : '待巡检'

    const task: PatrolTask = {
      id: index + 1,
      code: legacy.巡检编号,
      route,
      team: String(legacy.巡检班组 ?? '').trim(),
      // 存量任务没有下发日期，按计划日期回填。
      planDate: String(legacy.计划日期 ?? '').trim(),
      completeTime: String(legacy.完成时间 ?? '').trim(),
      issueCount: normalizeIssueCount(legacy.发现问题数),
      inspector: String(legacy.巡检人员 ?? '').trim(),
      status,
      // 归属单位缺失的，先按当前值班单位收编，保证可操作、可核对。
      ownerUnit: String(legacy.归属单位 ?? '').trim() || DEFAULT_UNIT,
      cabin,
      issuedDate: String(legacy.下发日期 ?? '').trim() || String(legacy.计划日期 ?? '').trim(),
      patrolConclusion: String(legacy.巡检结论 ?? '').trim(),
      acceptConclusion: String(legacy.验收结论 ?? '').trim(),
      acceptTime: String(legacy.验收时间 ?? '').trim(),
      source: '存量回填',
      routeInferred: !explicitRoute && Boolean(inferredRoute),
      incompleteFields: [],
      createdAt: nowText(),
      updatedAt: nowText(),
    }
    task.incompleteFields = collectIncompleteFields(task)
    tasks.push(task)

    // 原口径整行 JSON 留档，残缺字段也以原值保留，永不覆盖。
    archives.push({
      id: index + 1,
      taskId: task.id,
      taskCode: task.code,
      original: { ...legacy } as unknown as Record<string, unknown>,
      reason: '存量迁移',
      archivedAt: nowText(),
    })
  })

  // 存量上报流水：同一任务重复提交的第二次 accepted=false，只留痕。
  const reports: ReportLog[] = [...LEGACY_REPORTS]
    .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))
    .map((item, index) => ({ id: index + 1, ...item }))

  return {
    migratedVersion: MIGRATION_VERSION,
    tasks,
    archives,
    reports,
    seq: tasks.length,
  }
}

/* ------------------------------------------------------------------ */
/* 查询：先收窄（路线/班组/计划日期/关键字），再按既定先后排列          */
/* ------------------------------------------------------------------ */

export const EMPTY_QUERY: PatrolQuery = { route: '', team: '', planDate: '', keyword: '' }

export function queryPatrolTasks(query: PatrolQuery): RankedPatrolTask[] {
  const { tasks } = getPatrolState()
  const ranked: RankedPatrolTask[] = tasks
    .filter((task) => matchesQuery(task, query))
    .slice()
    .sort(comparePatrol)
    .map((task, index) => ({ ...task, rank: index + 1 }))
  return ranked
}

/** 列表分页：名次是全量收窄后的名次，页内序号不会重复。 */
export function queryPatrolPage(query: PatrolQuery, page = 1): PatrolPage {
  const ranked = queryPatrolTasks(query)
  const pages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), pages)
  const start = (safePage - 1) * PAGE_SIZE
  return {
    items: ranked.slice(start, start + PAGE_SIZE),
    total: ranked.length,
    page: safePage,
    size: PAGE_SIZE,
    pages,
  }
}

/** 详情面板取值：与列表同一份排序结果，保证名次和字段完全一致。 */
export function getTaskDetail(id: number, query: PatrolQuery): RankedPatrolTask | null {
  return queryPatrolTasks(query).find((task) => task.id === id) ?? null
}

/** 翻页/操作后要停在同一条任务上：返回它在当前收窄结果中的页码。 */
export function pageOfTask(id: number, query: PatrolQuery): number {
  const ranked = queryPatrolTasks(query)
  const index = ranked.findIndex((task) => task.id === id)
  if (index < 0) {
    return 1
  }
  return Math.floor(index / PAGE_SIZE) + 1
}

/* ------------------------------------------------------------------ */
/* 动作：归属校验、状态流转、上报去重、验收双写                          */
/* ------------------------------------------------------------------ */

function findTask(id: number): PatrolTask | undefined {
  return getPatrolState().tasks.find((task) => task.id === id)
}

function sameUnit(task: PatrolTask, operatorUnit: string): boolean {
  return Boolean(operatorUnit) && task.ownerUnit === operatorUnit
}

function save(task: PatrolTask): void {
  task.updatedAt = nowText()
  task.incompleteFields = collectIncompleteFields(task)
  persist()
  // 任何写操作之后，隐患台账的路线待整改口径重新对齐。
  syncRoutePendingFromPatrol()
}

export function startPatrol(id: number, operatorUnit: string): MutationResult {
  const task = findTask(id)
  if (!task) {
    return { ok: false, message: `没有找到编号为 ${id} 的巡检任务` }
  }
  if (!sameUnit(task, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (task.status !== '待巡检') {
    return { ok: false, message: `任务当前为「${task.status}」，不能开始巡检` }
  }
  task.status = '巡检中'
  save(task)
  return { ok: true, message: `任务 ${task.code} 已开始巡检`, task: { ...task } }
}

export function completePatrol(
  id: number,
  operatorUnit: string,
  conclusion: string,
): MutationResult {
  const task = findTask(id)
  if (!task) {
    return { ok: false, message: `没有找到编号为 ${id} 的巡检任务` }
  }
  if (!sameUnit(task, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (task.status !== '巡检中') {
    return { ok: false, message: `任务当前为「${task.status}」，还不能确认完成` }
  }
  task.status = '已完成'
  task.completeTime = nowText()
  if (conclusion.trim()) {
    task.patrolConclusion = conclusion.trim()
  }
  save(task)
  return { ok: true, message: `任务 ${task.code} 已确认完成`, task: { ...task } }
}

export type ReportInput = {
  issueCount: number
  conclusion: string
  level: '一般' | '较大' | '重大'
  measure: string
}

/**
 * 上报问题：同一巡检任务重复提交只算一次——
 * 任务已到「已上报/已验收」时挡回，并把流水记成 accepted=false，隐患不重复产生。
 */
export function reportPatrol(
  id: number,
  operatorUnit: string,
  submitter: string,
  input: ReportInput,
): MutationResult {
  const current = getPatrolState()
  const task = current.tasks.find((item) => item.id === id)
  if (!task) {
    return { ok: false, message: `没有找到编号为 ${id} 的巡检任务` }
  }
  if (!sameUnit(task, operatorUnit)) {
    appendReport(task.code, submitter, operatorUnit, false, '跨单位代提交，已挡回')
    persist()
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (task.status === '已上报' || task.status === '已验收') {
    appendReport(task.code, submitter, operatorUnit, false, '同一任务重复提交，只算一次')
    persist()
    return { ok: false, message: `任务 ${task.code} 已上报过，同一任务重复提交只算一次` }
  }
  if (task.status !== '巡检中' && task.status !== '已完成') {
    return { ok: false, message: `任务当前为「${task.status}」，请先开始并完成巡检` }
  }

  const issueCount = Math.max(0, Math.trunc(input.issueCount) || 0)
  const stamp = nowText()
  task.status = '已上报'
  task.issueCount = issueCount
  task.completeTime = task.completeTime || stamp
  task.patrolConclusion = input.conclusion.trim() || task.patrolConclusion || `上报问题${issueCount}处`
  save(task)

  // 有问题才转隐患；隐患按巡检编号幂等，重复上报绝不会多出一条。
  if (issueCount > 0) {
    upsertHazardFromPatrol({
      patrolCode: task.code,
      route: task.route,
      cabin: task.cabin,
      level: input.level,
      measure: input.measure,
      owner: submitter || task.inspector,
      ownerUnit: task.ownerUnit,
      foundDate: todayISO(),
    })
  }
  appendReport(task.code, submitter, operatorUnit, true, '上报受理，已转隐患整改')
  persist()
  syncRoutePendingFromPatrol()
  return { ok: true, message: `任务 ${task.code} 已上报，隐患按路线归拢同步整改台账`, task: { ...task } }
}

function appendReport(
  taskCode: string,
  submitter: string,
  unit: string,
  accepted: boolean,
  message: string,
): void {
  const current = getPatrolState()
  const log: ReportLog = {
    id: current.reports.length ? Math.max(...current.reports.map((item) => item.id)) + 1 : 1,
    taskCode,
    submitter,
    unit,
    submittedAt: nowText(),
    accepted,
    message,
  }
  current.reports = [...current.reports, log]
}

/**
 * 验收：对外只呈现验收结论；巡检结论留档备查。
 * 验收后任务闭环、同编号隐患一并闭环、结论进统一完工清单。
 */
export function acceptPatrol(
  id: number,
  operatorUnit: string,
  conclusion: string,
): MutationResult {
  const task = findTask(id)
  if (!task) {
    return { ok: false, message: `没有找到编号为 ${id} 的巡检任务` }
  }
  if (!sameUnit(task, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (task.status !== '已上报') {
    return { ok: false, message: `任务当前为「${task.status}」，需先上报再验收` }
  }
  if (!conclusion.trim()) {
    return { ok: false, message: '验收结论为对外口径，不能为空' }
  }
  const stamp = nowText()
  task.status = '已验收'
  task.acceptConclusion = conclusion.trim()
  task.acceptTime = stamp
  save(task)

  acceptOpenByPatrolCode(task.code, task.acceptConclusion, stamp)
  recordCompletion({
    bizCode: task.code,
    source: '巡检验收',
    title: `${task.route}${task.cabin ? `（${task.cabin}）` : ''}巡检任务`,
    route: task.route,
    ownerUnit: task.ownerUnit,
    conclusion: task.acceptConclusion,
    finishedAt: stamp,
  })
  syncRoutePendingFromPatrol()
  return { ok: true, message: `任务 ${task.code} 已验收，结论已入完工清单`, task: { ...task } }
}

/* ------------------------------------------------------------------ */
/* 补录：缺项一并补齐，补录前再按原口径归档一次                          */
/* ------------------------------------------------------------------ */

export type BackfillInput = {
  route: string
  team: string
  planDate: string
  cabin: string
  inspector: string
  ownerUnit: string
}

export function backfillTask(
  id: number,
  operatorUnit: string,
  input: BackfillInput,
): MutationResult {
  const current = getPatrolState()
  const task = current.tasks.find((item) => item.id === id)
  if (!task) {
    return { ok: false, message: `没有找到编号为 ${id} 的巡检任务` }
  }
  if (!sameUnit(task, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (!input.planDate.trim()) {
    return { ok: false, message: '计划日期为必填缺项，请一并补齐' }
  }

  // 补录前把当前记录按原口径再归档一次，历史记录永不丢失、永不覆盖。
  const archiveId = current.archives.length
    ? Math.max(...current.archives.map((item) => item.id)) + 1
    : 1
  current.archives = [
    ...current.archives,
    {
      id: archiveId,
      taskId: task.id,
      taskCode: task.code,
      original: { ...task } as unknown as Record<string, unknown>,
      reason: '补录前留档',
      archivedAt: nowText(),
    },
  ]

  const cabin = input.cabin.trim()
  const route = input.route.trim() || inferRouteByCabin(cabin)
  task.route = route
  task.team = input.team.trim()
  task.planDate = input.planDate.trim()
  task.cabin = cabin
  task.inspector = input.inspector.trim()
  task.ownerUnit = input.ownerUnit.trim() || task.ownerUnit
  task.routeInferred = !input.route.trim() && Boolean(inferRouteByCabin(cabin))
  task.source = '迁移补录'
  save(task)
  return {
    ok: true,
    message: `任务 ${task.code} 缺项已补齐${task.incompleteFields.length ? '，仍有残缺字段' : ''}`,
    task: { ...task },
  }
}

export type CreateInput = {
  route: string
  team: string
  planDate: string
  cabin: string
  inspector: string
}

export function createPatrol(input: CreateInput, operatorUnit: string): MutationResult {
  if (!operatorUnit) {
    return { ok: false, message: '未取得归属单位，不能登记任务' }
  }
  if (!input.route.trim() || !input.team.trim() || !input.planDate.trim()) {
    return { ok: false, message: '巡检路线、巡检班组、计划日期为必填项' }
  }
  const current = getPatrolState()
  const seq = current.seq + 1
  // 编号按年份+序号；序号在当前数据内取最大，重复登记不会撞号。
  const year = input.planDate.slice(0, 4)
  const code = `PATR-${year}-${String(seq).padStart(3, '0')}`
  const task: PatrolTask = {
    id: seq,
    code,
    route: input.route.trim(),
    team: input.team.trim(),
    planDate: input.planDate.trim(),
    completeTime: '',
    issueCount: 0,
    inspector: input.inspector.trim(),
    status: '待巡检',
    ownerUnit: operatorUnit,
    cabin: input.cabin.trim(),
    issuedDate: todayISO(),
    patrolConclusion: '',
    acceptConclusion: '',
    acceptTime: '',
    source: '新建',
    routeInferred: false,
    incompleteFields: [],
    createdAt: nowText(),
    updatedAt: nowText(),
  }
  task.incompleteFields = collectIncompleteFields(task)
  current.tasks = [...current.tasks, task]
  current.seq = seq
  persist()
  syncRoutePendingFromPatrol()
  return { ok: true, message: `巡检任务 ${code} 已登记`, task: { ...task } }
}

/* ------------------------------------------------------------------ */
/* 档案与统计                                                            */
/* ------------------------------------------------------------------ */

export function listArchives(taskCode?: string): PatrolArchive[] {
  const { archives } = getPatrolState()
  return archives
    .filter((item) => !taskCode || item.taskCode === taskCode)
    .sort((a, b) => (a.archivedAt < b.archivedAt ? -1 : 1))
    .map((item) => ({ ...item, original: { ...item.original } }))
}

export function listReports(taskCode?: string): ReportLog[] {
  const { reports } = getPatrolState()
  return reports
    .filter((item) => !taskCode || item.taskCode === taskCode)
    .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))
}

export function patrolStats() {
  const { tasks } = getPatrolState()
  const currentMonth = todayISO().slice(0, 7)
  return {
    pending: tasks.filter((item) => item.status === '待巡检').length,
    running: tasks.filter((item) => item.status === '巡检中').length,
    reported: tasks.filter((item) => item.status === '已上报').length,
    accepted: tasks.filter((item) => item.status === '已验收').length,
    monthIssues: tasks
      .filter((item) => item.planDate.startsWith(currentMonth) || item.completeTime.startsWith(currentMonth))
      .reduce((sum, item) => sum + item.issueCount, 0),
    incomplete: tasks.filter((item) => item.incompleteFields.length > 0).length,
  }
}
