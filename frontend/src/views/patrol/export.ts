// 巡检/隐患清单导出：导出的是当前收窄后的同一份次序，而不是底层存储顺序。

import { queryPatrolTasks } from '@/domain/patrol/store'
import type { PatrolQuery } from '@/domain/patrol/types'
import { queryHazards } from '@/domain/hazard/store'
import type { HazardQuery } from '@/domain/hazard/types'

function triggerDownload(filename: string, lines: (string | number)[][]): void {
  const content = lines.map((line) => line.map(csvCell).join(',')).join('\n')
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function downloadEntries(moduleKey: 'patrol' | 'hazard', query: PatrolQuery | HazardQuery): void {
  if (moduleKey === 'patrol') {
    const rows = queryPatrolTasks(query as PatrolQuery)
    triggerDownload('廊内巡检任务清单.csv', [
      ['名次', '巡检编号', '巡检路线', '巡检班组', '计划日期', '完成时间', '发现问题数', '巡检人员', '归属单位', '所属舱室', '巡检状态', '对外验收结论', '残缺字段'],
      ...rows.map((row) => [
        row.rank,
        row.code,
        row.route,
        row.team,
        row.planDate,
        row.completeTime,
        row.issueCount,
        row.inspector,
        row.ownerUnit,
        row.cabin,
        row.status,
        row.acceptConclusion,
        row.incompleteFields.join('、'),
      ]),
    ])
    return
  }
  const rows = queryHazards(query as HazardQuery)
  triggerDownload('隐患整改台账.csv', [
    ['隐患编号', '来源巡检', '巡检路线', '所属舱室', '隐患等级', '整改措施', '责任人', '归属单位', '发现日期', '整改期限', '整改状态', '验收结论'],
    ...rows.map((row) => [
      row.code,
      row.patrolCode,
      row.route,
      row.cabin,
      row.level,
      row.measure,
      row.owner,
      row.ownerUnit,
      row.foundDate,
      row.deadline,
      row.status,
      row.acceptConclusion,
    ]),
  ])
}
