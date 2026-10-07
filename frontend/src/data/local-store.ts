import { inferRouteFromCabin } from './patrol-rules'
import { SEED_BUNDLE, SEED_ROWS } from './seed'
import type { CompletionRecord, EntryRow, ProvenanceMark } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都在。
// v2：巡检补「下发日期/所属单位/上报留档编号」，隐患补「问题来源/所属路线/关联巡检编号/所属单位」，另存验收完工清单。
const STORAGE_KEY = 'urban-utility-tunnel:entries:v2'
const LEGACY_STORAGE_KEY = 'urban-utility-tunnel:entries'
const DATA_VERSION = 2
const LEGACY_DEFAULT_UNIT = '第一运维所'

type StoreEnvelope = {
  version: number
  entries: Record<string, EntryRow[]>
  completions: CompletionRecord[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function mark(prov: NonNullable<EntryRow['__prov']>, field: string, tag: ProvenanceMark): void {
  // 已有的出处标记不覆盖：历史口径原样保留，迁移可重复执行而不产生重复标记。
  if (!prov[field]) prov[field] = tag
}

// 巡检存量任务口径修复：
// 1) 没有计划日期的，按「下发日期」回填（早年台账只有下发日期）；两者都没有则留空标残缺；
// 2) 早年没有巡检路线的，按舱室归属推定；舱室也无法识别的，留空标残缺；
// 3) 缺单位的按下发口径回填为本所并标「回填」（操作时再按归属校验）；
// 4) 只补空字段，历史已有值一律不动。
function normalizePatrolRow(row: EntryRow): EntryRow {
  const next: EntryRow = { ...row, __prov: { ...(row.__prov ?? {}) } }
  const prov = next.__prov!

  if (!text(next['下发日期'])) {
    if (text(next['计划日期'])) {
      next['下发日期'] = next['计划日期']
      mark(prov, '下发日期', '回填')
    } else {
      mark(prov, '下发日期', '残缺')
    }
  }

  if (!text(next['计划日期'])) {
    if (text(next['下发日期'])) {
      next['计划日期'] = next['下发日期']
      mark(prov, '计划日期', '回填')
    } else {
      mark(prov, '计划日期', '残缺')
    }
  }

  if (!text(next['巡检路线'])) {
    const cabin = text(next['所属舱室'])
    const inferred = cabin ? inferRouteFromCabin(cabin) : ''
    if (inferred) {
      next['巡检路线'] = inferred
      mark(prov, '巡检路线', '推定')
    } else {
      mark(prov, '巡检路线', '残缺')
    }
  }

  if (!text(next['所属舱室'])) {
    mark(prov, '所属舱室', '残缺')
  }

  if (!text(next['所属单位'])) {
    next['所属单位'] = LEGACY_DEFAULT_UNIT
    mark(prov, '所属单位', '回填')
  }

  if (!text(next['巡检班组'])) mark(prov, '巡检班组', '残缺')
  if (!text(next['巡检人员'])) mark(prov, '巡检人员', '残缺')
  if (next['发现问题数'] === undefined || text(next['发现问题数']) === '') next['发现问题数'] = 0
  if (text(next['上报留档编号']) === '') next['上报留档编号'] = ''
  if (['已完成', '已上报'].includes(text(next.status)) && !text(next['完成时间'])) {
    mark(prov, '完成时间', '残缺')
  }
  return next
}

// 隐患存量台账补齐：来源/路线/关联编号/单位缺失即留空，能按既有字段识别的才回填，并逐字段标出。
function normalizeHazardRow(row: EntryRow): EntryRow {
  const next: EntryRow = { ...row, __prov: { ...(row.__prov ?? {}) } }
  const prov = next.__prov!

  if (!text(next['问题来源'])) {
    next['问题来源'] = '人工登记'
    mark(prov, '问题来源', '回填')
  }
  if (!text(next['所属路线'])) {
    mark(prov, '所属路线', '残缺')
  }
  if (text(next['关联巡检编号']) === '') next['关联巡检编号'] = ''
  if (!text(next['所属单位'])) {
    next['所属单位'] = LEGACY_DEFAULT_UNIT
    mark(prov, '所属单位', '回填')
  }
  return next
}

// 历史记录按下发日期一次性补齐：先排好次序再逐条迁移，保证补齐过程与既定先后一致、可复现。
function migrate(entries: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const result: Record<string, EntryRow[]> = {}
  for (const [key, rows] of Object.entries(entries)) {
    if (key === 'patrol') {
      const ordered = [...rows].sort((a, b) => {
        const da = text(a['下发日期']) || text(a['计划日期'])
        const db = text(b['下发日期']) || text(b['计划日期'])
        if (!da && !db) return Number(a.id) - Number(b.id)
        if (!da) return 1
        if (!db) return -1
        return da < db ? -1 : da > db ? 1 : Number(a.id) - Number(b.id)
      })
      result[key] = ordered.map(normalizePatrolRow)
    } else if (key === 'hazard') {
      result[key] = [...rows].sort((a, b) => Number(a.id) - Number(b.id)).map(normalizeHazardRow)
    } else {
      result[key] = rows
    }
  }
  return result
}

function seedEnvelope(): StoreEnvelope {
  return {
    version: DATA_VERSION,
    entries: migrate(clone(SEED_BUNDLE.entries)),
    completions: clone(SEED_BUNDLE.completions),
  }
}

function readStorage(): StoreEnvelope {
  const fallback = seedEnvelope()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    // 旧版裸表存在时，先把用户已有数据搬进 v2 再做迁移，不丢弃任何历史记录。
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    const envelope: StoreEnvelope = legacy
      ? (() => {
          try {
            const oldEntries = JSON.parse(legacy) as Record<string, EntryRow[]>
            return { version: DATA_VERSION, entries: { ...clone(SEED_BUNDLE.entries), ...oldEntries }, completions: clone(SEED_BUNDLE.completions) }
          } catch {
            return fallback
          }
        })()
      : fallback
    const migrated: StoreEnvelope = { ...envelope, entries: migrate(envelope.entries) }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    return migrated
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoreEnvelope>
    const entries = { ...fallback.entries, ...(parsed.entries ?? {}) }
    return {
      version: DATA_VERSION,
      entries: migrate(entries),
      completions: Array.isArray(parsed.completions) ? parsed.completions! : fallback.completions,
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: StoreEnvelope | null = null

function store(): StoreEnvelope {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

function persist(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store()))
  }
}

export function allRows(): Record<string, EntryRow[]> {
  return store().entries
}

export function listRows(key: string): EntryRow[] {
  return store().entries[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const envelope = store()
  envelope.entries = { ...envelope.entries, [key]: rows }
  persist()
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  const migrated = migrate({ [key]: rows })[key] ?? []
  saveRows(key, migrated)
  return migrated
}

export function listCompletions(): CompletionRecord[] {
  return store().completions
}

export function saveCompletions(records: CompletionRecord[]): void {
  store().completions = records
  persist()
}

export function storageKey(): string {
  return STORAGE_KEY
}
