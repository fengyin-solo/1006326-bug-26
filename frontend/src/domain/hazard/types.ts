// 隐患整改台账模型：每条隐患挂到巡检任务与巡检路线上，待整改条数按路线归拢。

export type HazardStatus = '待整改' | '整改中' | '已验收' | '已逾期'

export const HAZARD_STATUSES: HazardStatus[] = ['待整改', '整改中', '已验收', '已逾期']

export type HazardRecord = {
  id: number
  /** 隐患编号，与巡检上报一一对应，重复上报不产生新隐患。 */
  code: string
  /** 来源巡检任务编号。 */
  patrolCode: string
  route: string
  cabin: string
  level: '一般' | '较大' | '重大'
  measure: string
  owner: string
  ownerUnit: string
  foundDate: string
  deadline: string
  status: HazardStatus
  /** 验收结论，与巡检任务验收后保持同一份口径。 */
  acceptConclusion: string
  acceptTime: string
  createdAt: string
  updatedAt: string
}

export type HazardQuery = {
  route: string
  status: string
  keyword: string
}

export type HazardState = {
  records: HazardRecord[]
  seq: number
  /** 巡检侧同步过来的「每条路线待整改条数」台账快照。 */
  routePending: Record<string, number>
  routePendingSyncedAt: string
}

/** 按路线归拢的待整改统计（取待整改 + 整改中）。 */
export type RoutePendingCount = {
  route: string
  pending: number
  inProgress: number
  open: number
}
