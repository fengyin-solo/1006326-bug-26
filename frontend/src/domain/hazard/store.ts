import { readJSON, writeJSON, nowText, addDaysISO } from '@/domain/support'
import { recordCompletion } from '@/domain/completion/store'
import { seedHazards } from './seed'
import { HAZARD_STATUSES } from './types'
import type { HazardQuery, HazardRecord, HazardState, RoutePendingCount } from './types'

const HAZARD_STORAGE_KEY = 'urban-utility-tunnel:hazard-ledger'

export { HAZARD_STORAGE_KEY }

let state: HazardState | null = null

export function getHazardState(): HazardState {
  if (state === null) {
    const stored = readJSON<HazardState>(HAZARD_STORAGE_KEY)
    if (stored && Array.isArray(stored.records)) {
      state = stored
    } else {
      const records = seedHazards()
      const next: HazardState = {
        records,
        seq: records.reduce((max, item) => Math.max(max, item.id), 0),
        routePending: {},
        routePendingSyncedAt: '',
      }
      state = next
      recomputeRoutePending()
    }
  }
  return state
}

function persist(): void {
  if (state) {
    writeJSON(HAZARD_STORAGE_KEY, state)
  }
}

export type MutationResult = { ok: boolean; message: string; record?: HazardRecord }

/** 巡检上报转隐患：按巡检编号幂等归拢，同一任务重复上报只产生一条隐患。 */
export function upsertHazardFromPatrol(input: {
  patrolCode: string
  route: string
  cabin: string
  level: HazardRecord['level']
  measure: string
  owner: string
  ownerUnit: string
  foundDate: string
}): HazardRecord {
  const current = getHazardState()
  const foundDate = input.foundDate.slice(0, 10)
  const existing = current.records.find((item) => item.patrolCode === input.patrolCode)
  if (existing) {
    // 已存在隐患（重复上报）：只更新时间戳，不新增、不改条数。
    existing.updatedAt = nowText()
    persist()
    recomputeRoutePending()
    return existing
  }
  const seq = current.seq + 1
  const year = foundDate.slice(0, 4)
  const record: HazardRecord = {
    id: seq,
    code: `HAZA-${year}-${String(seq).padStart(3, '0')}`,
    patrolCode: input.patrolCode,
    route: input.route,
    cabin: input.cabin,
    level: input.level,
    measure: input.measure || '待补充整改措施',
    owner: input.owner,
    ownerUnit: input.ownerUnit,
    foundDate,
    deadline: addDaysISO(foundDate, 30),
    status: '待整改',
    acceptConclusion: '',
    acceptTime: '',
    createdAt: nowText(),
    updatedAt: nowText(),
  }
  current.records = [...current.records, record]
  current.seq = seq
  persist()
  recomputeRoutePending()
  return record
}

function guardUnit(record: HazardRecord, operatorUnit: string): boolean {
  return Boolean(operatorUnit) && record.ownerUnit === operatorUnit
}

export function dispatchHazard(id: number, operatorUnit: string): MutationResult {
  const current = getHazardState()
  const target = current.records.find((item) => item.id === id)
  if (!target) {
    return { ok: false, message: `没有找到编号为 ${id} 的隐患记录` }
  }
  if (!guardUnit(target, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (target.status !== '待整改') {
    return { ok: false, message: `隐患当前为「${target.status}」，不能派发整改` }
  }
  target.status = '整改中'
  target.updatedAt = nowText()
  persist()
  recomputeRoutePending()
  return { ok: true, message: `隐患 ${target.code} 已派发整改`, record: { ...target } }
}

/** 提交验收：归属校验通过后写验收结论，结论同步落到统一完工清单。 */
export function acceptHazard(
  id: number,
  operatorUnit: string,
  conclusion: string,
): MutationResult {
  const current = getHazardState()
  const target = current.records.find((item) => item.id === id)
  if (!target) {
    return { ok: false, message: `没有找到编号为 ${id} 的隐患记录` }
  }
  if (!guardUnit(target, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (target.status !== '整改中' && target.status !== '已逾期') {
    return { ok: false, message: `隐患当前为「${target.status}」，还不能提交验收` }
  }
  if (!conclusion.trim()) {
    return { ok: false, message: '验收结论为对外口径，不能为空' }
  }
  const stamp = nowText()
  target.status = '已验收'
  target.acceptConclusion = conclusion.trim()
  target.acceptTime = stamp
  target.updatedAt = stamp
  persist()
  recomputeRoutePending()
  recordCompletion({
    bizCode: target.code,
    source: '隐患验收',
    title: `${target.route}${target.cabin ? `（${target.cabin}）` : ''}隐患整改`,
    route: target.route,
    ownerUnit: target.ownerUnit,
    conclusion: target.acceptConclusion,
    finishedAt: stamp,
  })
  return { ok: true, message: `隐患 ${target.code} 已验收，结论已入完工清单`, record: { ...target } }
}

export function markHazardOverdue(id: number, operatorUnit: string): MutationResult {
  const current = getHazardState()
  const target = current.records.find((item) => item.id === id)
  if (!target) {
    return { ok: false, message: `没有找到编号为 ${id} 的隐患记录` }
  }
  if (!guardUnit(target, operatorUnit)) {
    return { ok: false, message: '跨单位代提交已挡回：归属之外的操作一律拒绝' }
  }
  if (target.status !== '待整改' && target.status !== '整改中') {
    return { ok: false, message: `隐患当前为「${target.status}」，不能标记逾期` }
  }
  target.status = '已逾期'
  target.updatedAt = nowText()
  persist()
  recomputeRoutePending()
  return { ok: true, message: `隐患 ${target.code} 已标记逾期`, record: { ...target } }
}

export function queryHazards(query: HazardQuery): HazardRecord[] {
  const current = getHazardState()
  const route = query.route.trim()
  const status = query.status.trim()
  const keyword = query.keyword.trim().toLowerCase()
  return current.records
    .filter((item) => !route || item.route === route)
    .filter((item) => !status || item.status === status)
    .filter((item) => {
      if (!keyword) {
        return true
      }
      return [item.code, item.patrolCode, item.cabin, item.measure, item.owner]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
    .sort((a, b) =>
      a.foundDate < b.foundDate ? 1 : a.foundDate > b.foundDate ? -1 : b.id - a.id,
    )
    .map((item) => ({ ...item }))
}

/** 按路线归拢待整改条数：待整改 + 整改中都算尚未闭环。 */
export function countRoutePending(): RoutePendingCount[] {
  const { records } = getHazardState()
  const buckets = new Map<string, RoutePendingCount>()
  for (const item of records) {
    const key = item.route || '（未归线）'
    const bucket = buckets.get(key) ?? { route: key, pending: 0, inProgress: 0, open: 0 }
    if (item.status === '待整改') {
      bucket.pending += 1
    } else if (item.status === '整改中') {
      bucket.inProgress += 1
    } else if (item.status === '已逾期') {
      bucket.pending += 1
    }
    if (item.status !== '已验收') {
      bucket.open += 1
    }
    buckets.set(key, bucket)
  }
  return [...buckets.values()].sort((a, b) => (a.route < b.route ? -1 : 1))
}

/**
 * 巡检任务验收时，同一编号下尚未闭环的隐患随验收一起闭环，双方结论同一份。
 * 返回受影响的隐患数；没有未闭环隐患则返回 0（无隐患巡检属正常）。
 */
export function acceptOpenByPatrolCode(
  patrolCode: string,
  conclusion: string,
  stamp: string,
): HazardRecord[] {
  const current = getHazardState()
  const closed: HazardRecord[] = []
  for (const target of current.records) {
    if (target.patrolCode !== patrolCode || target.status === '已验收') {
      continue
    }
    target.status = '已验收'
    target.acceptConclusion = conclusion
    target.acceptTime = stamp
    target.updatedAt = stamp
    closed.push({ ...target })
    recordCompletion({
      bizCode: target.code,
      source: '隐患验收',
      title: `${target.route}${target.cabin ? `（${target.cabin}）` : ''}隐患整改`,
      route: target.route,
      ownerUnit: target.ownerUnit,
      conclusion,
      finishedAt: stamp,
    })
  }
  if (closed.length) {
    persist()
    recomputeRoutePending()
  }
  return closed
}

/**
 * 巡检侧口径同步：巡检任务状态变化后，把「每条路线待整改条数」快照写进隐患台账。
 * 数据本身就来自巡检上报，两边同源，快照与实时表恒等。
 */
export function syncRoutePendingFromPatrol(): Record<string, number> {
  recomputeRoutePending()
  const current = getHazardState()
  return { ...current.routePending }
}

function recomputeRoutePending(): void {
  const current = getHazardState()
  const counts = countRoutePending()
  const snapshot: Record<string, number> = {}
  for (const item of counts) {
    snapshot[item.route] = item.open
  }
  current.routePending = snapshot
  current.routePendingSyncedAt = nowText()
  persist()
}

export function hazardStats() {
  const { records } = getHazardState()
  return {
    pending: records.filter((item) => item.status === '待整改').length,
    inProgress: records.filter((item) => item.status === '整改中').length,
    overdue: records.filter((item) => item.status === '已逾期').length,
    accepted: records.filter((item) => item.status === '已验收').length,
  }
}

export function resetHazardsForTest(): void {
  state = null
}

export { HAZARD_STATUSES }
