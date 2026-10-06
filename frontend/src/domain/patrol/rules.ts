// 巡检口径：路线/班组既定先后、舱室推定路线、稳定排序、检索收窄。

import type { PatrolQuery, PatrolTask } from './types'

/** 归属单位（巡检班组隶属）。 */
export const UNITS = ['一公司廊运中心', '二公司廊运中心'] as const
export const DEFAULT_UNIT = UNITS[0]

/** 巡检路线及既定先后次序，下标即先后。 */
export const ROUTES = ['东线综合舱', '西线燃气舱', '南线电力舱', '北线热力舱'] as const

/** 巡检班组既定先后。 */
export const TEAMS = ['甲班', '乙班', '丙班'] as const

/** 列表每页条数。 */
export const PAGE_SIZE = 6

const ROUTE_INDEX: Map<string, number> = new Map(
  ROUTES.map((name, index) => [name, index] as const),
)
const TEAM_INDEX: Map<string, number> = new Map(
  TEAMS.map((name, index) => [name, index] as const),
)

/**
 * 早年没有巡检路线的，按舱室归属推定：
 * 舱室编号前缀 C-A 归东线、C-B 归西线、C-C 归南线、C-D 归北线。
 * 对不上的不强行推定，留空并标残缺。
 */
const CABIN_ROUTE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^C-A/i, '东线综合舱'],
  [/^C-B/i, '西线燃气舱'],
  [/^C-C/i, '南线电力舱'],
  [/^C-D/i, '北线热力舱'],
]

export function inferRouteByCabin(cabin: string): string {
  const value = String(cabin ?? '').trim()
  if (!value) {
    return ''
  }
  for (const [pattern, route] of CABIN_ROUTE_RULES) {
    if (pattern.test(value)) {
      return route
    }
  }
  return ''
}

/** 迁移/补录后需要核对的字段，缺了就标残缺。 */
export const CHECK_FIELDS: ReadonlyArray<{ key: keyof PatrolTask; label: string }> = [
  { key: 'code', label: '巡检编号' },
  { key: 'route', label: '巡检路线' },
  { key: 'team', label: '巡检班组' },
  { key: 'planDate', label: '计划日期' },
  { key: 'ownerUnit', label: '归属单位' },
  { key: 'cabin', label: '所属舱室' },
]

export function collectIncompleteFields(task: PatrolTask): string[] {
  return CHECK_FIELDS.filter(({ key }) => String(task[key] ?? '').trim() === '').map(
    ({ label }) => label,
  )
}

/**
 * 既定先后排列：巡检路线（既定次序）→ 巡检班组（既定次序）→ 计划日期（早的在前）→ 编号。
 * 未知路线/班组统一排在已知项之后，保持确定性，不再随筛选结果漂移。
 */
export function comparePatrol(a: PatrolTask, b: PatrolTask): number {
  const ra = ROUTE_INDEX.has(a.route) ? ROUTE_INDEX.get(a.route)! : ROUTES.length
  const rb = ROUTE_INDEX.has(b.route) ? ROUTE_INDEX.get(b.route)! : ROUTES.length
  if (ra !== rb) {
    return ra - rb
  }
  const ta = TEAM_INDEX.has(a.team) ? TEAM_INDEX.get(a.team)! : TEAMS.length
  const tb = TEAM_INDEX.has(b.team) ? TEAM_INDEX.get(b.team)! : TEAMS.length
  if (ta !== tb) {
    return ta - tb
  }
  const da = a.planDate || '9999-99-99'
  const db = b.planDate || '9999-99-99'
  if (da !== db) {
    return da < db ? -1 : 1
  }
  const ca = a.code || ''
  const cb = b.code || ''
  if (ca !== cb) {
    return ca < cb ? -1 : 1
  }
  return a.id - b.id
}

export function matchesQuery(task: PatrolTask, query: PatrolQuery): boolean {
  const route = query.route.trim()
  if (route && task.route !== route) {
    return false
  }
  const team = query.team.trim()
  if (team && task.team !== team) {
    return false
  }
  const planDate = query.planDate.trim()
  // 计划日期支持按年月前缀检索，例如 2024、2024-03。
  if (planDate && !task.planDate.startsWith(planDate)) {
    return false
  }
  const keyword = query.keyword.trim().toLowerCase()
  if (keyword) {
    const haystack = [
      task.code,
      task.route,
      task.team,
      task.planDate,
      task.inspector,
      task.cabin,
      task.ownerUnit,
    ]
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(keyword)) {
      return false
    }
  }
  return true
}

export const UNIT_GUARD_MESSAGE = '跨单位代提交已挡回：归属之外的操作一律拒绝'
