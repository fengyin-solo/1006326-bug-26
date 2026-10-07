import type { EntryRow, PatrolFilters, RoutePendingStat } from './types'

// 既定先后：巡检路线 → 巡检班组 → 计划日期 → 下发日期 → 巡检编号。
// 每个比较键都确定（缺省统一排末尾），最后以 id 兜底，任何两次查询次序完全一致。
export const PATROL_SORT_KEYS = ['巡检路线', '巡检班组', '计划日期', '下发日期', '巡检编号'] as const

export const PATROL_ROUTES = ['路线A（电力舱东线）', '路线B（综合舱西线）', '路线C（燃气舱南线）', '路线D（水舱北线）']
export const PATROL_CREWS = ['巡检一班', '巡检二班', '巡检三班']

// 早年没有巡检路线的任务，按舱室归属推定路线。
// 办法：取舱室编号/名称中的舱位字母或专业关键词，命中即推定到对应路线；无法命中的不硬推定，留空并标残缺。
export function inferRouteFromCabin(cabin: string): string {
  const text = String(cabin ?? '').trim()
  if (!text) return ''
  const hit = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text))
  if (hit([/电力/, /电缆/, /强电/, /变电/, /A舱/, /Ａ舱/])) return PATROL_ROUTES[0]
  if (hit([/综合/, /通信/, /弱电/, /B舱/, /Ｂ舱/])) return PATROL_ROUTES[1]
  if (hit([/燃气/, /天然?气/, /C舱/, /Ｃ舱/])) return PATROL_ROUTES[2]
  if (hit([/水泵/, /水坑/, /水管/, /水舱/, /雨污/, /排水/, /给水/, /D舱/, /Ｄ舱/])) return PATROL_ROUTES[3]
  return ''
}

function compareValues(left: EntryRow, right: EntryRow, field: string): number {
  const l = left[field]
  const r = right[field]
  const ls = String(l ?? '').trim()
  const rs = String(r ?? '').trim()
  if (!ls && !rs) return 0
  if (!ls) return 1 // 残缺值固定排末尾
  if (!rs) return -1
  if (ls < rs) return -1
  if (ls > rs) return 1
  return 0
}

/** 既定先后排列：同一批数据无论查几次、是否收窄，先后完全一致。 */
export function sortPatrol(rows: EntryRow[]): EntryRow[] {
  return [...rows].sort((a, b) => {
    for (const field of PATROL_SORT_KEYS) {
      const result = compareValues(a, b, field)
      if (result !== 0) return result
    }
    return Number(a.id) - Number(b.id)
  })
}

function nonEmpty(value: EntryRow[string]): string {
  return String(value ?? '').trim()
}

/** 先按巡检路线、巡检班组、计划日期收窄，再叠加跨字段检索；收窄不改原次序。 */
export function narrowPatrol(rows: EntryRow[], filters: Partial<PatrolFilters>): EntryRow[] {
  const route = (filters.route ?? '').trim()
  const crew = (filters.crew ?? '').trim()
  const planDate = (filters.planDate ?? '').trim()
  const keyword = (filters.keyword ?? '').trim()
  const searchFields = ['巡检编号', '巡检路线', '巡检班组', '计划日期', '下发日期', '巡检人员', '所属舱室', '所属单位']

  return rows.filter((row) => {
    if (route && nonEmpty(row['巡检路线']) !== route) return false
    if (crew && nonEmpty(row['巡检班组']) !== crew) return false
    if (planDate && nonEmpty(row['计划日期']) !== planDate) return false
    if (keyword && !searchFields.some((field) => nonEmpty(row[field]).includes(keyword))) return false
    return true
  })
}

/** 详情面板与列表共用同一份取值：同一行对象，不做二次查找、二次加工。 */
export function findPatrolRow(orderedRows: EntryRow[], id: number): EntryRow | undefined {
  return orderedRows.find((row) => Number(row.id) === Number(id))
}

export function isIncomplete(row: EntryRow, field: string): boolean {
  return Array.isArray(row.__prov?.[field]) ? false : row.__prov?.[field] === '残缺'
}

export function isInferred(row: EntryRow, field: string): boolean {
  return row.__prov?.[field] === '推定'
}

export function isBackfilled(row: EntryRow, field: string): boolean {
  return row.__prov?.[field] === '回填'
}

/**
 * 巡检侧按路线归拢：已发现问题（发现问题数>0 或已上报）但隐患台账尚未闭环的任务数。
 * 仅作备查对账，对外口径以隐患台账 ledgerPending 为准。
 */
export function patrolPendingByRoute(rows: EntryRow[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of rows) {
    const route = nonEmpty(row['巡检路线'])
    if (!route) continue
    const found = Number(row['发现问题数'] ?? 0)
    const status = nonEmpty(row.status)
    const hasIssue = found > 0 || status === '已上报'
    if (!hasIssue) continue
    result.set(route, (result.get(route) ?? 0) + 1)
  }
  return result
}

export function incompleteByRoute(rows: EntryRow[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of rows) {
    const marks = row.__prov ?? {}
    if (!Object.values(marks).includes('残缺')) continue
    const route = nonEmpty(row['巡检路线']) || '（路线残缺）'
    result.set(route, (result.get(route) ?? 0) + 1)
  }
  return result
}

function routesInOrder(patrol: EntryRow[], hazard: EntryRow[]): string[] {
  const set = new Set<string>()
  for (const row of patrol) {
    const route = nonEmpty(row['巡检路线'])
    if (route) set.add(route)
  }
  for (const row of hazard) {
    const route = nonEmpty(row['所属路线'])
    if (route) set.add(route)
  }
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

const UNRESOLVED_HAZARD_STATUS = ['待整改', '整改中', '已逾期']

/** 路线待整改统计：对外取隐患台账口径，巡检归拢数同时带出供备查。 */
export function routePendingStats(patrolRows: EntryRow[], hazardRows: EntryRow[]): RoutePendingStat[] {
  const patrolPending = patrolPendingByRoute(patrolRows)
  const incomplete = incompleteByRoute(patrolRows)
  const ledger = new Map<string, number>()
  for (const row of hazardRows) {
    if (!UNRESOLVED_HAZARD_STATUS.includes(nonEmpty(row.status))) continue
    const route = nonEmpty(row['所属路线']) || '（未关联路线）'
    ledger.set(route, (ledger.get(route) ?? 0) + 1)
  }
  return routesInOrder(patrolRows, hazardRows).map((route) => ({
    route,
    ledgerPending: ledger.get(route) ?? 0,
    patrolPending: patrolPending.get(route) ?? 0,
    incomplete: incomplete.get(route) ?? 0,
  }))
}
