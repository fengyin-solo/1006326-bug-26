import { moduleMeta } from './local-service'
import { listRows, saveRows } from '@/data/local-store'
import { narrowPatrol, sortPatrol } from '@/data/patrol-rules'
import type { ActionResult, EntryRow, PatrolPageQuery, PatrolPageResult } from '@/data/types'

export const DEFAULT_PAGE_SIZE = 8

function nowStamp(): string {
  const d = new Date()
  const p = (value: number) => String(value).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function today(): string {
  return nowStamp().slice(0, 10)
}

function daysAfter(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (value: number) => String(value).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function text(value: EntryRow[string]): string {
  return String(value ?? '').trim()
}

function nextPatrolCode(rows: EntryRow[]): string {
  const max = rows.reduce((acc, row) => {
    const match = /^PATR-(\d+)$/.exec(text(row['巡检编号']))
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `PATR-${String(max + 1).padStart(4, '0')}`
}

function nextHazardCode(rows: EntryRow[]): string {
  const max = rows.reduce((acc, row) => {
    const match = /^HAZA-(\d+)$/.exec(text(row['隐患编号']))
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `HAZA-${String(max + 1).padStart(4, '0')}`
}

// 归属之外的操作一律拒绝；归属字段残缺的历史任务无法核验，也不放行，提示走补录归属。
function assertOwnership(row: EntryRow, unit: string): ActionResult | null {
  const owner = text(row['所属单位'])
  if (!owner || row.__prov?.['所属单位'] === '残缺') {
    return { ok: false, message: `任务 ${text(row['巡检编号'])} 归属单位残缺，跨单位校验无法通过，请先补录归属单位` }
  }
  if (owner !== unit) {
    return { ok: false, message: `跨单位代提交已挡回：任务 ${text(row['巡检编号'])} 归属「${owner}」，当前身份为「${unit}」` }
  }
  return null
}

/** 收窄 + 既定先后排列后的全集；统计、分页、详情取值都从这同一份派生。 */
export function orderedPatrol(filters?: PatrolPageQuery['filters']): EntryRow[] {
  return sortPatrol(narrowPatrol(listRows('patrol'), filters ?? {}))
}

/**
 * 巡检任务查询：先按路线、班组、计划日期与检索词收窄，再按既定先后排列，最后分页。
 * 页脚总数、剩余条数与本页取的都是这同一份收窄结果，数量必然对得上。
 */
export function queryPatrol(query: PatrolPageQuery): PatrolPageResult {
  const size = Math.max(1, query.size || DEFAULT_PAGE_SIZE)
  const ordered = orderedPatrol(query.filters)
  const total = ordered.length
  const pages = Math.max(1, Math.ceil(total / size))

  let page = query.page
  if (query.anchorId != null) {
    const anchorIndex = ordered.findIndex((row) => Number(row.id) === Number(query.anchorId))
    if (anchorIndex >= 0) page = Math.floor(anchorIndex / size) + 1
  }
  page = Math.min(Math.max(1, page || 1), pages)

  const start = (page - 1) * size
  const items = ordered.slice(start, start + size)
  return {
    items,
    total,
    page,
    size,
    pages,
    startSeq: total === 0 ? 0 : start + 1,
    endSeq: start + items.length,
  }
}

export type PatrolDraft = {
  route: string
  crew: string
  planDate: string
  person: string
  cabin: string
  foundIssues?: number
}

// 补录登记：缺项在表单层就要求补齐；归属单位强制取当前身份，杜绝跨单位登记。
export function createPatrol(draft: PatrolDraft, context: { unit: string }): ActionResult & { id?: number } {
  const rows = listRows('patrol')
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const code = nextPatrolCode(rows)
  const row: EntryRow = {
    id,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: code,
    巡检路线: draft.route,
    巡检班组: draft.crew,
    计划日期: draft.planDate,
    下发日期: today(),
    完成时间: '',
    发现问题数: Math.max(0, Math.floor(draft.foundIssues ?? 0)),
    巡检人员: draft.person,
    所属舱室: draft.cabin,
    所属单位: context.unit,
    上报留档编号: '',
  }
  saveRows('patrol', [...rows, row])
  return { ok: true, message: `巡检任务 ${code} 已登记，归属「${context.unit}」`, id }
}

function findHazardByPatrolCode(hazards: EntryRow[], patrolCode: string): EntryRow | undefined {
  return hazards.find((row) => text(row['关联巡检编号']) === patrolCode)
}

/**
 * 巡检动作：归属校验 → 状态流转；「上报问题」幂等并同步隐患整改台账。
 * 同一任务重复提交上报只算一次：已有留档编号直接挡回，不再生成第二条隐患。
 */
export function operatePatrol(
  id: number,
  action: string,
  context: { unit: string },
): ActionResult & { anchorId?: number } {
  const meta = moduleMeta('patrol')
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `巡检任务没有登记「${action}」这个动作` }
  }
  const rows = listRows('patrol')
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的巡检任务` }
  }
  const row = rows[index]

  const denied = assertOwnership(row, context.unit)
  if (denied) return { ...denied, anchorId: id }

  const current = text(row.status)
  const code = text(row['巡检编号'])
  if (current === target) {
    return { ok: false, message: `任务 ${code} 已经是「${target}」，不用重复操作`, anchorId: id }
  }

  if (action === '上报问题') {
    if (current !== '已完成') {
      return { ok: false, message: `任务 ${code} 当前为「${current}」，需先确认完成后才能上报问题`, anchorId: id }
    }
    if (Number(row['发现问题数'] ?? 0) <= 0) {
      return { ok: false, message: `任务 ${code} 发现问题数为 0，没有可上报的隐患；如有问题请先补录问题数`, anchorId: id }
    }
    const hazards = listRows('hazard')
    const existed = findHazardByPatrolCode(hazards, code)
    if (text(row['上报留档编号']) || existed) {
      const filed = text(row['上报留档编号']) || (existed ? text(existed['隐患编号']) : '')
      return {
        ok: false,
        message: `任务 ${code} 已上报（留档编号 ${filed}），同一任务重复提交只算一次，未再生成台账`,
        anchorId: id,
      }
    }

    const hazardId = hazards.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1
    const hazardCode = nextHazardCode(hazards)
    const hazard: EntryRow = {
      id: hazardId,
      status: '待整改',
      pending: true,
      abnormal: false,
      隐患编号: hazardCode,
      隐患部位: text(row['所属舱室']) || '（部位待补录）',
      隐患等级: '一般',
      整改措施: '',
      责任人员: text(row['巡检人员']),
      发现日期: today(),
      整改期限: daysAfter(14),
      问题来源: '巡检上报',
      所属路线: text(row['巡检路线']),
      关联巡检编号: code,
      所属单位: context.unit,
    }
    saveRows('hazard', [...hazards, hazard])

    const updated: EntryRow = { ...row, status: '已上报', pending: false, 上报留档编号: hazardCode }
    const next = [...rows]
    next[index] = updated
    saveRows('patrol', next)
    return {
      ok: true,
      message: `任务 ${code} 上报成功，隐患 ${hazardCode} 已计入「${hazard['所属路线']}」待整改台账`,
      anchorId: id,
    }
  }

  const updated: EntryRow = {
    ...row,
    status: target,
    pending: target !== meta.statuses[meta.statuses.length - 1],
  }
  if (action === '确认完成') {
    updated['完成时间'] = nowStamp()
  }
  const next = [...rows]
  next[index] = updated
  saveRows('patrol', next)
  return { ok: true, message: `任务 ${code} 已${action}，当前状态「${target}」`, anchorId: id }
}

/** 巡检侧汇总：本月发现问题数（状态口径与列表一致）。 */
export function monthlyFoundCount(): number {
  const prefix = today().slice(0, 7)
  return listRows('patrol')
    .filter((row) => text(row['计划日期']).startsWith(prefix))
    .reduce((sum, row) => sum + Number(row['发现问题数'] ?? 0), 0)
}

// 导出也走「先收窄（可选条件）→ 再既定先后」，导出来的次序与页面完全一致；残缺字段标注【残缺】。
export function exportPatrol(filters?: PatrolPageQuery['filters']): { filename: string; content: string } {
  const header = ['序号', '巡检编号', '巡检路线', '巡检班组', '计划日期', '下发日期', '完成时间', '发现问题数', '巡检人员', '所属舱室', '所属单位', '当前状态', '字段说明']
  const lines = [header.join(',')]
  orderedPatrol(filters).forEach((row, index) => {
    const notes: string[] = []
    for (const [field, tag] of Object.entries(row.__prov ?? {})) {
      notes.push(`${field}:${tag}`)
    }
    const cells = [
      index + 1,
      text(row['巡检编号']),
      text(row['巡检路线']) || '【残缺】',
      text(row['巡检班组']) || '【残缺】',
      text(row['计划日期']) || '【残缺】',
      text(row['下发日期']) || '【残缺】',
      text(row['完成时间']) || '【残缺】',
      text(row['发现问题数']) || '0',
      text(row['巡检人员']) || '【残缺】',
      text(row['所属舱室']) || '【残缺】',
      text(row['所属单位']) || '【残缺】',
      text(row.status),
      notes.join('；'),
    ]
    lines.push(cells.map((cell) => String(cell).replace(/,/g, '，')).join(','))
  })
  return { filename: '廊内巡检任务-既定次序清单.csv', content: `﻿${lines.join('\n')}` }
}
