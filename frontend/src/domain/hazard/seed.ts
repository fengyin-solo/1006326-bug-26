// 隐患整改台账种子：全部来自巡检上报，隐患编号与巡检编号一一对应。
// 已验收的两条对应存量验收记录，其余是隐患台账当前要盯的待整改条数。

import type { HazardRecord, HazardStatus } from './types'

type SeedSpec = {
  id: number
  code: string
  patrolCode: string
  route: string
  cabin: string
  level: HazardRecord['level']
  measure: string
  owner: string
  ownerUnit: string
  foundDate: string
  deadline: string
  status: HazardStatus
  acceptConclusion: string
  acceptTime: string
}

const SPECS: SeedSpec[] = [
  {
    id: 1,
    code: 'HAZA-2022-004',
    patrolCode: 'PATR-0004',
    route: '西线燃气舱',
    cabin: 'C-B-05',
    level: '较大',
    measure: '更换燃气舱报警探头3处并重新联动测试',
    owner: '周建国',
    ownerUnit: '一公司廊运中心',
    foundDate: '2022-09-27',
    deadline: '2022-10-10',
    status: '已验收',
    acceptConclusion: '整改完成，验收合格',
    acceptTime: '2022-10-08 09:30',
  },
  {
    id: 2,
    code: 'HAZA-2024-008',
    patrolCode: 'PATR-0008',
    route: '南线电力舱',
    cabin: 'C-C-07',
    level: '较大',
    measure: '修复照明回路2处、渗漏水点2处',
    owner: '高志远',
    ownerUnit: '一公司廊运中心',
    foundDate: '2024-06-30',
    deadline: '2024-07-31',
    status: '整改中',
    acceptConclusion: '',
    acceptTime: '',
  },
  {
    id: 3,
    code: 'HAZA-2025-010',
    patrolCode: 'PATR-0010',
    route: '北线热力舱',
    cabin: 'C-D-03',
    level: '一般',
    measure: '重做管道保温层2处并加固',
    owner: '周建国',
    ownerUnit: '一公司廊运中心',
    foundDate: '2025-07-08',
    deadline: '2025-08-08',
    status: '待整改',
    acceptConclusion: '',
    acceptTime: '',
  },
  {
    id: 4,
    code: 'HAZA-2026-012',
    patrolCode: 'PATR-0012',
    route: '西线燃气舱',
    cabin: 'C-B-09',
    level: '一般',
    measure: '紧固阀门法兰并复检气密性',
    owner: '张满仓',
    ownerUnit: '二公司廊运中心',
    foundDate: '2026-05-19',
    deadline: '2026-06-19',
    status: '整改中',
    acceptConclusion: '',
    acceptTime: '',
  },
  {
    id: 5,
    code: 'HAZA-2026-017',
    patrolCode: 'PATR-0017',
    route: '北线热力舱',
    cabin: 'C-D-06',
    level: '一般',
    measure: '重新紧固排气管固定螺栓',
    owner: '高志远',
    ownerUnit: '一公司廊运中心',
    foundDate: '2026-09-28',
    deadline: '2026-10-10',
    status: '已验收',
    acceptConclusion: '合格，同意闭环',
    acceptTime: '2026-10-02 16:00',
  },
]

export function seedHazards(): HazardRecord[] {
  const stamped = nowFallback()
  return SPECS.map((spec) => {
    const { ...rest } = spec
    return {
      ...rest,
      createdAt: `${spec.foundDate} 09:00`,
      updatedAt: spec.acceptTime || stamped,
    }
  })
}

function nowFallback(): string {
  return '2026-10-06 09:00'
}
