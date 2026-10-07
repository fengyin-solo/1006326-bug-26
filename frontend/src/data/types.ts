/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

// 字段出处：回填（按下发/计划日期一次性补齐）、推定（按舱室归属推定路线）、残缺（无法补齐，留空标出）。
export type ProvenanceMark = '回填' | '推定' | '残缺'
export type Provenance = Record<string, ProvenanceMark>

export type EntryValue = string | number | boolean | string[] | Provenance | undefined

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  /** 字段级出处标记，键为业务字段名；历史数据迁移时写入，新登记不产生。 */
  __prov?: Provenance
  [field: string]: EntryValue
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  /** 视为已闭环的状态；缺省取 statuses 最后一个。 */
  closedStatuses?: string[]
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

// 巡检任务的收窄条件：路线、班组、计划日期为精确收窄，keyword 为跨字段检索。
export type PatrolFilters = {
  route: string
  crew: string
  planDate: string
  keyword: string
}

export type PatrolPageQuery = {
  page: number
  size: number
  /** 锚点任务：状态流转、重复上报后据此回到同一条任务所在页。 */
  anchorId?: number | null
  filters?: Partial<PatrolFilters>
}

export type PatrolPageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
  pages: number
  /** 当前页首条在收窄后全集中的序号（从 1 起，跨页连续不重复）。 */
  startSeq: number
  endSeq: number
}

export type RoutePendingStat = {
  route: string
  /** 对外口径：隐患整改台账中该路线未闭环（待整改/整改中/已逾期）条数。 */
  ledgerPending: number
  /** 备查口径：巡检侧按路线归拢的已发现问题、尚未闭环条数。 */
  patrolPending: number
  /** 该路线字段残缺的巡检任务数（留档备查用）。 */
  incomplete: number
}

// 验收/完工清单：隐患验收与检修完工共用同一份，按业务类型+业务编号幂等。
export type ArchivedConclusion = {
  conclusion: string
  at: string
  by: string
}

export type CompletionRecord = {
  id: number
  bizType: '隐患验收' | '检修完工'
  bizId: number
  code: string
  source: string
  object: string
  route: string
  acceptedAt: string
  acceptor: string
  unit: string
  /** 对外只呈现这一份结论。 */
  conclusion: string
  /** 后续再来的不同结论不替换对外结论，只追加到这里留档备查。 */
  archived: ArchivedConclusion[]
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
