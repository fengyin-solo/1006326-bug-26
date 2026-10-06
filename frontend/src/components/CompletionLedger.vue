<template>
  <section class="ledger-panel">
    <h3>完工清单（统一台账）</h3>
    <p class="page-desc">巡检验收、隐患验收、检修完工都落在这里，各入口取到的是同一份。</p>
    <div class="ledger-filters">
      <label>
        <select v-model="source">
          <option value="">全部来源</option>
          <option v-for="item in sources" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <input v-model="keyword" placeholder="按编号/内容/路线检索" />
      <span class="sync-time">共 {{ entries.length }} 条</span>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>业务编号</th>
          <th>来源</th>
          <th>内容</th>
          <th>巡检路线</th>
          <th>归属单位</th>
          <th>完工结论</th>
          <th>完工时间</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in entries" :key="`${entry.source}-${entry.bizCode}`">
          <td>{{ entry.bizCode }}</td>
          <td>{{ entry.source }}</td>
          <td>{{ entry.title }}</td>
          <td>{{ entry.route || '—' }}</td>
          <td>{{ entry.ownerUnit }}</td>
          <td>{{ entry.conclusion }}</td>
          <td>{{ entry.finishedAt }}</td>
        </tr>
        <tr v-if="!entries.length">
          <td colspan="7" class="empty-state">暂无完工记录</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { listCompletions } from '@/domain/completion/store'
import type { CompletionSource } from '@/domain/completion/types'

// 可选限定来源：隐患页默认看隐患验收，检修页默认看检修完工；也可以随时看全部。
const props = withDefaults(defineProps<{ defaultSource?: CompletionSource | '' }>(), {
  defaultSource: '',
})

const sources: CompletionSource[] = ['巡检验收', '隐患验收', '检修完工']
const source = ref<string>(props.defaultSource)
const keyword = ref('')

const entries = computed(() =>
  listCompletions({ source: source.value, keyword: keyword.value }),
)
</script>
