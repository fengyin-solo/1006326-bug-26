import { listCompletions, listRows, saveCompletions } from '@/data/local-store'
import type { ArchivedConclusion, CompletionRecord } from '@/data/types'

// 验收结果落到「其他入口的完工清单」：隐患页提交验收、检修页确认完工，都写入这里。
// 两边取到同一份数据；同一业务重复验收不产生第二条，只会把不同结论追加到 archived 留档备查。
export type CompletionInput = {
  bizType: '隐患验收' | '检修完工'
  bizId: number
  code: string
  source: string
  object: string
  route: string
  conclusion: string
  context: { unit: string; acceptor: string }
}

export type CompletionOutcome = {
  ok: boolean
  message: string
  record?: CompletionRecord
}

function stamp(): string {
  const d = new Date()
  const p = (value: number) => String(value).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 清单版本号：写入后自增，两个入口的列表据此刷新，保证看到同一份。
let revision = 0
const listeners = new Set<() => void>()

export function completionRevision(): number {
  return revision
}

export function subscribeCompletion(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  revision += 1
  listeners.forEach((listener) => listener())
}

export function listCompletionRecords(): CompletionRecord[] {
  return [...listCompletions()].sort((a, b) => (a.acceptedAt < b.acceptedAt ? 1 : a.acceptedAt > b.acceptedAt ? -1 : b.id - a.id))
}

export function findCompletion(bizType: CompletionInput['bizType'], bizId: number): CompletionRecord | undefined {
  return listCompletions().find((record) => record.bizType === bizType && Number(record.bizId) === Number(bizId))
}

export function recordCompletion(input: CompletionInput): CompletionOutcome {
  const records = listCompletions()
  const existing = records.find(
    (record) => record.bizType === input.bizType && Number(record.bizId) === Number(input.bizId),
  )
  const at = stamp()

  if (existing) {
    if (existing.conclusion === input.conclusion) {
      return {
        ok: true,
        message: `${input.code} 已在完工清单中（结论：${input.conclusion}），重复验收只算一次，未重复落单`,
        record: existing,
      }
    }
    // 孰轻孰重的取舍：首次验收结论作为对外唯一结论；后续不同结论不覆盖，追加留档备查。
    const archived: ArchivedConclusion = {
      conclusion: `${input.conclusion}（后到结论，留档备查，不替换对外口径）`,
      at,
      by: `${input.context.acceptor} · ${input.context.unit}`,
    }
    const next = records.map((record) =>
      record === existing ? { ...record, archived: [...record.archived, archived] } : record,
    )
    saveCompletions(next)
    notify()
    return {
      ok: true,
      message: `${input.code} 对外结论仍为「${existing.conclusion}」，后到的不同结论已留档备查`,
      record: next.find((record) => record === existing) ?? existing,
    }
  }

  const record: CompletionRecord = {
    id: records.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    bizType: input.bizType,
    bizId: input.bizId,
    code: input.code,
    source: input.source,
    object: input.object,
    route: input.route,
    acceptedAt: at,
    acceptor: input.context.acceptor,
    unit: input.context.unit,
    conclusion: input.conclusion,
    archived: [],
  }
  saveCompletions([...records, record])
  notify()
  return { ok: true, message: `${input.code} 验收结论已落入完工清单，隐患整改与设施检修入口取同一份`, record }
}

// 从隐患/检修台账反查：详情面板、列表提示与清单取值同源。
export function completionOf(bizType: CompletionInput['bizType'], bizId: number): CompletionRecord | undefined {
  return findCompletion(bizType, bizId)
}

export function completionSummary(bizType: CompletionInput['bizType']): { total: number } {
  return { total: listCompletions().filter((record) => record.bizType === bizType).length }
}

// 供清单展示时回看业务行，避免在组件里直接摸 store。
export function bizRow(key: 'hazard' | 'maintenance', id: number) {
  return listRows(key).find((row) => Number(row.id) === Number(id))
}
