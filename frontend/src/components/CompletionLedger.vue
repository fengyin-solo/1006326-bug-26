<template>
  <section class="ledger-block">
    <header class="ledger-head">
      <div>
        <h3>{{ title }}</h3>
        <p class="ledger-tip">
          验收/完工结论统一落本清单，隐患整改与设施检修入口取同一份；对外只呈现首次结论，后到的不同结论留档备查。
        </p>
      </div>
      <span class="ledger-count">共 {{ records.length }} 条</span>
    </header>

    <table class="data-table ledger-table">
      <thead>
        <tr>
          <th>类型</th>
          <th>业务编号</th>
          <th>来源</th>
          <th>验收对象 / 部位</th>
          <th>巡检路线</th>
          <th>验收时间</th>
          <th>验收人</th>
          <th>对外结论</th>
          <th>留档备查</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="record in records" :key="record.id">
          <td>
            <span class="biz-tag" :class="record.bizType === '隐患验收' ? 'tag-hazard' : 'tag-maint'">{{ record.bizType }}</span>
          </td>
          <td>{{ record.code }}</td>
          <td>{{ record.source || '—' }}</td>
          <td>{{ record.object || '—' }}</td>
          <td>{{ record.route || '—' }}</td>
          <td>{{ record.acceptedAt }}</td>
          <td>{{ record.acceptor }}<br /><span class="muted">{{ record.unit }}</span></td>
          <td><strong>{{ record.conclusion }}</strong></td>
          <td>
            <span v-if="!record.archived.length" class="muted">无</span>
            <ul v-else class="archived-list">
              <li v-for="(item, index) in record.archived" :key="index">
                {{ item.conclusion }}<br />
                <span class="muted">{{ item.at }} · {{ item.by }}</span>
              </li>
            </ul>
          </td>
        </tr>
        <tr v-if="!records.length">
          <td colspan="9" class="empty-state">完工清单暂无记录，隐患验收或检修完工后自动归集到这里</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import {
  completionRevision,
  listCompletionRecords,
  subscribeCompletion,
} from '@/api/completion-service'
import type { CompletionRecord } from '@/data/types'

const props = withDefaults(
  defineProps<{ title?: string; bizType?: '隐患验收' | '检修完工' }>(),
  { title: '验收完工清单（跨入口同一份）', bizType: undefined },
)

const records = ref<CompletionRecord[]>([])

function refresh() {
  const all = listCompletionRecords()
  records.value = props.bizType ? all.filter((record) => record.bizType === props.bizType) : all
  // 依赖修订号触发刷新，避免被编译期优化掉。
  void completionRevision()
}

let unsubscribe: (() => void) | undefined
onMounted(() => {
  refresh()
  unsubscribe = subscribeCompletion(refresh)
})
onBeforeUnmount(() => unsubscribe?.())
</script>
