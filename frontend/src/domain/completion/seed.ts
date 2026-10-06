import type { CompletionEntry } from './types'

// 历史完工记录：与存量验收数据一致，作为完工清单的首次播种。
export const SEED_COMPLETIONS: CompletionEntry[] = [
  {
    id: 1,
    bizCode: 'PATR-0004',
    source: '巡检验收',
    title: '西线燃气舱巡检（燃气报警装置故障3处）',
    route: '西线燃气舱',
    ownerUnit: '一公司廊运中心',
    conclusion: '整改完成，验收合格',
    finishedAt: '2022-10-08 09:30',
  },
  {
    id: 2,
    bizCode: 'HAZA-2026-017',
    source: '隐患验收',
    title: '北线热力舱排气管固定螺栓松动整改',
    route: '北线热力舱',
    ownerUnit: '一公司廊运中心',
    conclusion: '合格，同意闭环',
    finishedAt: '2026-10-02 16:00',
  },
  {
    id: 3,
    bizCode: 'MAIN-2026-031',
    source: '检修完工',
    title: '东线综合舱1号排水泵更换叶轮',
    route: '东线综合舱',
    ownerUnit: '一公司廊运中心',
    conclusion: '试运转正常，检修完工',
    finishedAt: '2026-09-29 11:20',
  },
]
