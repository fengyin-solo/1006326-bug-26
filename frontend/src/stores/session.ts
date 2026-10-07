import { defineStore } from 'pinia'

// 归属单位：跨单位代提交一律挡回；切换单位用于演示归属校验。
export const ORG_UNITS = ['第一运维所', '第二运维所', '外部协作单位']

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    unit: '第一运维所' as string,
    scope: '城市地下综合管廊运行维护管理平台',
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
