// 领域口径冒烟测试的被测入口：所有模块从这里进入，共享同一份模块单例。
export * as patrol from '@/domain/patrol/store'
export * as hazard from '@/domain/hazard/store'
export * as completion from '@/domain/completion/store'
