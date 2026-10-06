// 廊内巡检任务领域模型：巡检列表次序、上报去重、存量回填、结论留档都围绕这几个结构。

export type PatrolStatus = '待巡检' | '巡检中' | '已完成' | '已上报' | '已验收'

export const PATROL_STATUSES: PatrolStatus[] = ['待巡检', '巡检中', '已完成', '已上报', '已验收']

/** 巡检路线既定先后：所有排序与归拢都以这里的次序为准。 */
export type PatrolTask = {
  id: number
  /** 巡检编号，同一编号只认一条，重复上报按它判重。 */
  code: string
  route: string
  team: string
  planDate: string
  completeTime: string
  issueCount: number
  inspector: string
  status: PatrolStatus
  /** 任务所属单位（巡检班组归属），归属之外的操作一律拒绝。 */
  ownerUnit: string
  /** 巡检覆盖舱室；早年没有巡检路线的任务靠它推定路线。 */
  cabin: string
  /** 下发日期；存量任务按计划日期回填为下发日期。 */
  issuedDate: string
  /** 巡检结论（班组自报），仅留档备查。 */
  patrolConclusion: string
  /** 验收结论，对外只呈现这一份；没有时对外显示待验收。 */
  acceptConclusion: string
  acceptTime: string
  /** 来源：新建 / 存量回填 / 迁移补录。 */
  source: '新建' | '存量回填' | '迁移补录'
  /** 路线是否由舱室推定而来。 */
  routeInferred: boolean
  /** 迁移或补录后仍残缺的字段名，留空并在界面标出。 */
  incompleteFields: string[]
  createdAt: string
  updatedAt: string
}

/** 历史记录：原口径整行留档，永不覆盖。 */
export type PatrolArchive = {
  id: number
  taskId: number
  taskCode: string
  /** 迁移 / 补录前的原始记录，按原口径 JSON 保留。 */
  original: Record<string, unknown>
  reason: '存量迁移' | '补录前留档'
  archivedAt: string
}

/** 上报流水：同一巡检任务重复提交只算一次。 */
export type ReportLog = {
  id: number
  taskCode: string
  submitter: string
  unit: string
  submittedAt: string
  accepted: boolean
  message: string
}

export type PatrolState = {
  /** 迁移版本号，保证历史记录只按下发日期一次性补齐。 */
  migratedVersion: number
  tasks: PatrolTask[]
  archives: PatrolArchive[]
  reports: ReportLog[]
  seq: number
}

export type PatrolQuery = {
  route: string
  team: string
  planDate: string
  keyword: string
}

/** 名次 = 全量收窄后的稳定序号，不再用数组下标，翻页也不会重复。 */
export type RankedPatrolTask = PatrolTask & { rank: number }

export type PatrolPage = {
  items: RankedPatrolTask[]
  total: number
  page: number
  size: number
  pages: number
}
