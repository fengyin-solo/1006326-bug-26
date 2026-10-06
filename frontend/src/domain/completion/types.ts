// 完工清单：巡检验收、隐患验收、设施检修完工都落到同一份台账。
// 隐患页与检修页两个入口读同一个 store，取到的永远是同一份。

export type CompletionSource = '巡检验收' | '隐患验收' | '检修完工'

export type CompletionEntry = {
  id: number
  /** 业务编号，同一编号重复登记按幂等处理。 */
  bizCode: string
  source: CompletionSource
  title: string
  route: string
  ownerUnit: string
  conclusion: string
  finishedAt: string
}

export type CompletionState = {
  entries: CompletionEntry[]
  seq: number
}

export const COMPLETION_STORAGE_KEY = 'urban-utility-tunnel:completion-ledger'
