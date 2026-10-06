import { readJSON, writeJSON } from '@/domain/support'
import { SEED_COMPLETIONS } from './seed'
import { COMPLETION_STORAGE_KEY } from './types'
import type { CompletionEntry, CompletionSource, CompletionState } from './types'

// 单例内存态 + localStorage 持久化。两个入口共用同一个 getState，拿到的是同一份清单。
let state: CompletionState | null = null

export function getCompletionState(): CompletionState {
  if (state === null) {
    const stored = readJSON<CompletionState>(COMPLETION_STORAGE_KEY)
    state = stored ?? { entries: [...SEED_COMPLETIONS], seq: SEED_COMPLETIONS.length }
    persist()
  }
  return state
}

function persist(): void {
  if (state) {
    writeJSON(COMPLETION_STORAGE_KEY, state)
  }
}

/**
 * 登记一条完工记录。bizCode + source 相同视为同一条，幂等返回已有记录，
 * 保证「验收结果落到其他入口的完工清单，两边取到同一份」。
 */
export function recordCompletion(input: {
  bizCode: string
  source: CompletionSource
  title: string
  route: string
  ownerUnit: string
  conclusion: string
  finishedAt: string
}): CompletionEntry {
  const current = getCompletionState()
  const existing = current.entries.find(
    (entry) => entry.bizCode === input.bizCode && entry.source === input.source,
  )
  if (existing) {
    return existing
  }
  const entry: CompletionEntry = { id: current.seq + 1, ...input }
  current.entries = [...current.entries, entry]
  current.seq = entry.id
  persist()
  return entry
}

export function listCompletions(filter: { source?: string; keyword?: string } = {}): CompletionEntry[] {
  const { entries } = getCompletionState()
  const source = filter.source?.trim()
  const keyword = filter.keyword?.trim().toLowerCase() ?? ''
  return entries
    .filter((entry) => !source || entry.source === source)
    .filter((entry) => {
      if (!keyword) {
        return true
      }
      return [entry.bizCode, entry.title, entry.route, entry.conclusion].join(' ').toLowerCase().includes(keyword)
    })
    .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : a.finishedAt > b.finishedAt ? -1 : b.id - a.id))
}
