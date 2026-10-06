import { defineStore } from 'pinia'

// 当前值班身份：归属单位是所有写操作的归属口径，跨单位代提交一律挡回。
export const UNIT_OPTIONS = ['一公司廊运中心', '二公司廊运中心'] as const

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '城市地下综合管廊运行维护管理平台',
    unit: UNIT_OPTIONS[0] as string,
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setUnit(unit: string) {
      this.unit = unit
    },
  },
})
