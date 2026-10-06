// 巡检存量数据：按早年原口径保留的迁移输入。
// 故意包含三类历史问题：没有巡检路线（靠舱室推定）、发现问题数是脏值、舱室对不上任何路线。
// 这些行只作为迁移输入，迁移后原行会整行进归档，不再直接使用。

export type LegacyPatrolRow = {
  id: number
  status?: string
  pending?: boolean
  abnormal?: boolean
  巡检编号: string
  巡检路线?: string
  巡检班组: string
  计划日期: string
  完成时间?: string
  发现问题数?: string | number
  巡检人员?: string
  巡检状态?: string
  /** 早年散落在备注里的扩展字段，迁移时一并收编。 */
  所属舱室?: string
  归属单位?: string
  下发日期?: string
  巡检结论?: string
  验收结论?: string
  验收时间?: string
}

export const LEGACY_PATROL_ROWS: LegacyPatrolRow[] = [
  {
    id: 1,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0001',
    巡检路线: '东线综合舱',
    巡检班组: '甲班',
    计划日期: '2021-05-12',
    完成时间: '',
    发现问题数: 0,
    巡检人员: '周建国',
    所属舱室: 'C-A-01',
  },
  {
    id: 2,
    status: '已完成',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0002',
    // 早年没有巡检路线，只有舱室，迁移时按 C-A 推定东线。
    巡检班组: '乙班',
    计划日期: '2021-11-03',
    完成时间: '2021-11-03 10:20',
    发现问题数: 2,
    巡检人员: '李永年',
    所属舱室: 'C-A-03',
    巡检结论: '管道支墩轻微沉降，已登记观察',
  },
  {
    id: 3,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0003',
    巡检班组: '丙班',
    计划日期: '2022-03-18',
    完成时间: '',
    // 脏值：问题数是文字，迁移归零但保留原行进归档。
    发现问题数: '无记录',
    巡检人员: '张满仓',
    所属舱室: 'C-B-02',
  },
  {
    id: 4,
    status: '已验收',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0004',
    巡检路线: '西线燃气舱',
    巡检班组: '甲班',
    计划日期: '2022-09-27',
    完成时间: '2022-09-27 15:10',
    发现问题数: 3,
    巡检人员: '周建国',
    所属舱室: 'C-B-05',
    巡检结论: '燃气舱报警装置故障3处',
    验收结论: '整改完成，验收合格',
    验收时间: '2022-10-08 09:30',
  },
  {
    id: 5,
    status: '已完成',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0005',
    巡检班组: '乙班',
    计划日期: '2023-04-09',
    完成时间: '2023-04-09 11:05',
    发现问题数: 1,
    巡检人员: '高志远',
    所属舱室: 'C-C-04',
    巡检结论: '电缆桥架盖板缺失1处',
  },
  {
    id: 6,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0006',
    巡检班组: '丙班',
    计划日期: '2023-08-15',
    完成时间: '',
    发现问题数: '',
    巡检人员: '张满仓',
    // C-Z 不在舱室归属表内，路线推定不上：留空并标残缺。
    所属舱室: 'C-Z-99',
  },
  {
    id: 7,
    status: '已完成',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0007',
    巡检路线: '南线电力舱',
    巡检班组: '甲班',
    计划日期: '2024-02-22',
    完成时间: '2024-02-22 09:50',
    发现问题数: 0,
    巡检人员: '周建国',
    所属舱室: 'C-C-02',
  },
  {
    id: 8,
    status: '已上报',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0008',
    巡检路线: '南线电力舱',
    巡检班组: '乙班',
    计划日期: '2024-06-30',
    完成时间: '2024-06-30 16:40',
    发现问题数: 4,
    巡检人员: '高志远',
    所属舱室: 'C-C-07',
    巡检结论: '照明回路故障、渗漏水共4处',
  },
  {
    id: 9,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0009',
    巡检班组: '丙班',
    计划日期: '2025-01-14',
    完成时间: '',
    发现问题数: 0,
    巡检人员: '张满仓',
    所属舱室: 'C-D-01',
  },
  {
    id: 10,
    status: '已上报',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0010',
    巡检路线: '北线热力舱',
    巡检班组: '甲班',
    计划日期: '2025-07-08',
    完成时间: '2025-07-08 14:15',
    发现问题数: 2,
    巡检人员: '周建国',
    所属舱室: 'C-D-03',
    巡检结论: '保温层脱落2处',
  },
  {
    id: 11,
    status: '已完成',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0011',
    巡检路线: '东线综合舱',
    巡检班组: '乙班',
    计划日期: '2026-03-05',
    完成时间: '2026-03-05 10:02',
    发现问题数: 0,
    巡检人员: '高志远',
    所属舱室: 'C-A-08',
  },
  {
    id: 12,
    status: '已上报',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0012',
    巡检路线: '西线燃气舱',
    巡检班组: '丙班',
    计划日期: '2026-05-19',
    完成时间: '2026-05-19 15:55',
    发现问题数: 1,
    巡检人员: '张满仓',
    所属舱室: 'C-B-09',
    归属单位: '二公司廊运中心',
    巡检结论: '燃气阀门渗漏1处',
  },
  {
    id: 13,
    status: '巡检中',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0013',
    巡检路线: '东线综合舱',
    巡检班组: '甲班',
    计划日期: '2026-08-20',
    完成时间: '',
    发现问题数: 0,
    巡检人员: '周建国',
    所属舱室: 'C-A-02',
  },
  {
    id: 14,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0014',
    巡检路线: '东线综合舱',
    巡检班组: '丙班',
    计划日期: '2026-09-01',
    完成时间: '',
    发现问题数: 0,
    巡检人员: '张满仓',
    所属舱室: 'C-A-05',
  },
  {
    id: 15,
    status: '已验收',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0017',
    巡检路线: '北线热力舱',
    巡检班组: '乙班',
    计划日期: '2026-09-28',
    完成时间: '2026-09-28 11:30',
    发现问题数: 1,
    巡检人员: '高志远',
    所属舱室: 'C-D-06',
    巡检结论: '排气管固定螺栓松动',
    验收结论: '合格，同意闭环',
    验收时间: '2026-10-02 16:00',
  },
  {
    id: 16,
    status: '已完成',
    pending: false,
    abnormal: false,
    巡检编号: 'PATR-0015',
    巡检路线: '西线燃气舱',
    巡检班组: '乙班',
    计划日期: '2026-10-02',
    完成时间: '2026-10-02 10:40',
    发现问题数: 2,
    巡检人员: '高志远',
    所属舱室: 'C-B-01',
    巡检结论: '发现支架锈蚀2处，待上报',
  },
  {
    id: 17,
    status: '待巡检',
    pending: true,
    abnormal: false,
    巡检编号: 'PATR-0016',
    巡检路线: '南线电力舱',
    巡检班组: '甲班',
    计划日期: '2026-10-05',
    完成时间: '',
    发现问题数: 0,
    巡检人员: '周建国',
    所属舱室: 'C-C-01',
  },
]

/** 存量上报流水：0008 历史上被重复提交过一次，第二次只留痕不算数。 */
export type LegacyReportLog = {
  taskCode: string
  submitter: string
  unit: string
  submittedAt: string
  accepted: boolean
  message: string
}

export const LEGACY_REPORTS: LegacyReportLog[] = [
  {
    taskCode: 'PATR-0004',
    submitter: '周建国',
    unit: '一公司廊运中心',
    submittedAt: '2022-09-27 15:30',
    accepted: true,
    message: '上报受理，已转隐患整改',
  },
  {
    taskCode: 'PATR-0008',
    submitter: '高志远',
    unit: '一公司廊运中心',
    submittedAt: '2024-06-30 17:00',
    accepted: true,
    message: '上报受理，已转隐患整改',
  },
  {
    taskCode: 'PATR-0008',
    submitter: '高志远',
    unit: '一公司廊运中心',
    submittedAt: '2024-07-01 08:15',
    accepted: false,
    message: '同一任务重复提交，只算一次',
  },
  {
    taskCode: 'PATR-0010',
    submitter: '周建国',
    unit: '一公司廊运中心',
    submittedAt: '2025-07-08 14:40',
    accepted: true,
    message: '上报受理，已转隐患整改',
  },
  {
    taskCode: 'PATR-0012',
    submitter: '张满仓',
    unit: '二公司廊运中心',
    submittedAt: '2026-05-19 16:10',
    accepted: true,
    message: '上报受理，已转隐患整改',
  },
  {
    taskCode: 'PATR-0017',
    submitter: '高志远',
    unit: '一公司廊运中心',
    submittedAt: '2026-09-28 13:00',
    accepted: true,
    message: '上报受理，已转隐患整改',
  },
]
