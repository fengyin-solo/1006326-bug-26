// 领域口径冒烟测试：在 Node 里用内存 localStorage 跑迁移与全部关键动作。
// 运行：node scripts/smoke-domain.mjs
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const assert = (cond, message) => {
  if (!cond) {
    console.error('✗ ' + message)
    process.exitCode = 1
    throw new Error(message)
  } else {
    console.log('✓ ' + message)
  }
}

// 内存 localStorage
const mem = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  },
}

const dir = mkdtempSync(join(tmpdir(), 'patrol-smoke-'))

// @ 别名、相对路径 .ts 解析、以及通用脚手架 local-store 的空实现。
const plugin = {
  name: 'test-resolve',
  setup(p) {
    const resolveTs = (baseDir, spec) => {
      const base = join(baseDir, spec)
      const candidates = [base, base + '.ts', join(base, 'index.ts')]
      return candidates.find((candidate) => existsSync(candidate)) ?? null
    }
    p.onResolve({ filter: /^@\// }, (args) => {
      const resolved = resolveTs(join(process.cwd(), 'src'), args.path.slice(2))
      return resolved ? { path: resolved } : undefined
    })
    p.onResolve({ filter: /^\.\.?\// }, (args) => {
      const resolved = resolveTs(args.resolveDir, args.path)
      return resolved ? { path: resolved } : undefined
    })
  },
}

const bundle = join(dir, 'entry.mjs')
await build({
  entryPoints: ['scripts/smoke-entry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: bundle,
  plugins: [plugin],
})

const { patrol, hazard, completion } = await import(pathToFileURL(bundle).href)

// 1. 迁移：17 条存量 + 归档
const state = patrol.getPatrolState()
assert(state.tasks.length === 17, `迁移 17 条存量任务（实际 ${state.tasks.length}）`)
assert(state.archives.length === 17, '每条存量原行都归档')
assert(state.archives.every((a) => a.reason === '存量迁移'), '归档原因是存量迁移')

// 2. 路线推定
const t2 = state.tasks.find((t) => t.code === 'PATR-0002')
assert(t2.route === '东线综合舱' && t2.routeInferred, '无路线任务按舱室 C-A 推定东线')
const t3 = state.tasks.find((t) => t.code === 'PATR-0003')
assert(t3.route === '西线燃气舱' && t3.routeInferred, 'C-B 推定西线')
const t6 = state.tasks.find((t) => t.code === 'PATR-0006')
assert(t6.route === '' && t6.incompleteFields.includes('巡检路线'), 'C-Z 推定不上，路线留空并标残缺')

// 3. 脏值归零；下发日期按计划日期回填
assert(t3.issueCount === 0, '问题数脏值迁移归零')
assert(t2.issuedDate === '2021-11-03', '下发日期按计划日期回填')

// 4. 既定先后排列
const all = patrol.queryPatrolTasks(patrol.EMPTY_QUERY)
const ROUTE_ORDER = ['东线综合舱', '西线燃气舱', '南线电力舱', '北线热力舱']
const routeIndex = (r) => {
  const i = ROUTE_ORDER.indexOf(r)
  return i === -1 ? ROUTE_ORDER.length : i
}
const routeSeq = all.map((t) => routeIndex(t.route))
assert(routeSeq.every((v, i) => i === 0 || routeSeq[i - 1] <= v), '全量按路线既定先后排列（未知/空路线垫底）')
const noRoute = all.filter((t) => t.route === '')
assert(noRoute.every((t) => t.rank > all.length - noRoute.length), '推定不上的空路线排在最后')
assert(all.every((t, i) => t.rank === i + 1), '名次连续不重复（1..N）')

// 5. 收窄后保持原次序
const east = patrol.queryPatrolTasks({ ...patrol.EMPTY_QUERY, route: '东线综合舱' })
assert(east.every((t) => t.route === '东线综合舱'), '筛选后只剩东线')
const eastRanksInAll = east.map((t) => all.findIndex((x) => x.id === t.id))
assert(eastRanksInAll.every((v, i) => i === 0 || v > eastRanksInAll[i - 1]), '收窄后相对次序与全量一致')
assert(east[0].rank === all.find((x) => x.id === east[0].id).rank, '收窄后名次仍是全量名次（非页内行号）')

// 班组次序 + 计划日期次序：同一东线下按班组既定先后（甲→乙→丙），班组内日期升序
const TEAM_ORDER = ['甲班', '乙班', '丙班']
const teamIndex = (name) => {
  const i = TEAM_ORDER.indexOf(name)
  return i === -1 ? TEAM_ORDER.length : i
}
const eastTeamSeq = east.map((t) => teamIndex(t.team))
assert(eastTeamSeq.every((v, i) => i === 0 || eastTeamSeq[i - 1] <= v), '同一路线下班组保持既定先后（甲→乙→丙）')
const firstJia = east.filter((t) => t.team === '甲班')
assert(
  firstJia.every((t, i) => i === 0 || firstJia[i - 1].planDate <= t.planDate),
  '同一班组内按计划日期升序',
)

// 6. 分页总数与剩余条数
const page1 = patrol.queryPatrolPage(patrol.EMPTY_QUERY, 1)
assert(page1.total === 17 && page1.pages === 3 && page1.size === 6, `分页 17 条/每页6 = 3 页（实际 ${page1.pages}）`)
assert(page1.items[0].rank === 1 && page1.items[5].rank === 6, '第一页名次 1-6')
const page3 = patrol.queryPatrolPage(patrol.EMPTY_QUERY, 3)
assert(page3.items.length === 5 && page3.items[0].rank === 13, '第三页名次 13-17')

// 7. 翻页锚点
const target = page1.items[0]
const anchorPage = patrol.pageOfTask(target.id, patrol.EMPTY_QUERY)
patrol.startPatrol(target.id, target.ownerUnit)
assert(patrol.pageOfTask(target.id, patrol.EMPTY_QUERY) === anchorPage, '动作后仍停在该任务所在页')

// 8. 跨单位挡回
const t12 = state.tasks.find((t) => t.code === 'PATR-0012')
const blocked = patrol.startPatrol(t12.id, '一公司廊运中心')
assert(!blocked.ok && blocked.message.includes('跨单位'), '二公司任务被一公司操作挡回')

// 9. 上报去重
const t8 = state.tasks.find((t) => t.code === 'PATR-0008')
assert(t8.status === '已上报', 'PATR-0008 存量已上报')
const dup = patrol.reportPatrol(t8.id, t8.ownerUnit, '高志远', { issueCount: 4, conclusion: '再报一次', level: '较大', measure: '' })
assert(!dup.ok && dup.message.includes('只算一次'), '同一任务重复上报被挡回')
const reports = patrol.listReports('PATR-0008')
assert(reports.length === 3 && reports[2].accepted === false, '重复上报留痕且未受理')

// 10. 补录留档
const before = patrol.listArchives('PATR-0006').length
const bf = patrol.backfillTask(t6.id, t6.ownerUnit, {
  route: '', team: '丙班', planDate: t6.planDate, cabin: 'C-C-09', inspector: '张满仓', ownerUnit: t6.ownerUnit,
})
assert(bf.ok, '补录成功')
const t6b = state.tasks.find((t) => t.code === 'PATR-0006')
assert(t6b.route === '南线电力舱' && t6b.routeInferred, '补录时按新舱室重新推定南线')
assert(patrol.listArchives('PATR-0006').length === before + 1, '补录前多一条原口径归档')
assert(t6b.source === '迁移补录', '来源标记为迁移补录')

// 11. 详情与列表一致
const detail = patrol.getTaskDetail(t8.id, patrol.EMPTY_QUERY)
const listed = patrol.queryPatrolTasks(patrol.EMPTY_QUERY).find((t) => t.id === t8.id)
assert(detail.rank === listed.rank && detail.acceptConclusion === listed.acceptConclusion, '详情面板与列表取值一致')

// 12. 路线归拢条数同步到隐患台账
const hState = hazard.getHazardState()
const routeCounts = hazard.countRoutePending()
const openByRoute = Object.fromEntries(routeCounts.map((r) => [r.route, r.open]))
assert(openByRoute['南线电力舱'] >= 1, `南线至少 1 条未闭环（实际 ${openByRoute['南线电力舱'] ?? 0}）`)
assert(openByRoute['西线燃气舱'] >= 1, '西线有未闭环隐患（0012 整改中）')
let consistent = true
for (const [route, count] of Object.entries(hState.routePending)) {
  if (openByRoute[route] !== count) consistent = false
}
assert(consistent, '隐患台账快照与实时按路线归拢条数一致')

// 13. 验收闭环并写完工清单
const beforeLedger = completion.listCompletions().length
const acc = patrol.acceptPatrol(t8.id, t8.ownerUnit, '验收合格，同意闭环')
assert(acc.ok, 'PATR-0008 验收成功')
const h8 = hazard.queryHazards({ route: '', status: '', keyword: 'PATR-0008' })
assert(h8.length === 1 && h8[0].status === '已验收' && h8[0].acceptConclusion === '验收合格，同意闭环', '同编号隐患随验收闭环、结论同一份')
const ledger = completion.listCompletions()
assert(ledger.length >= beforeLedger + 1, '完工清单新增记录')
assert(ledger.some((e) => e.bizCode === 'PATR-0008' && e.source === '巡检验收'), '巡检结论进完工清单')
assert(ledger.some((e) => e.bizCode === 'HAZA-2024-008' && e.source === '隐患验收'), '隐患结论同样进同一份完工清单')

// 14. 幂等：已验收不可重复验收
const acc2 = patrol.acceptPatrol(t8.id, t8.ownerUnit, '再来一次')
assert(!acc2.ok, '已验收任务不可重复验收')

// 15. 对外口径：无验收结论时对外是待验收，巡检结论仅留档
const t13 = state.tasks.find((t) => t.code === 'PATR-0013')
const d13 = patrol.getTaskDetail(t13.id, patrol.EMPTY_QUERY)
assert(!d13.acceptConclusion, '未验收任务对外无结论')
assert(d13.rank > 0, '详情仍给出稳定名次')

// 16. 检索后仍保持原次序
const kw = patrol.queryPatrolTasks({ ...patrol.EMPTY_QUERY, keyword: '周建国' })
const kwInAll = kw.map((t) => all.findIndex((x) => x.id === t.id))
assert(kwInAll.every((v, i) => i === 0 || v > kwInAll[i - 1]), '关键字检索后仍按原次序')

console.log('\n全部口径冒烟通过')
