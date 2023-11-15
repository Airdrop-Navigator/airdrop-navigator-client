import { copy, downloadFile, formatDateTime } from './utils.mjs'

const {
  Vue: { reactive, ref, computed },
  ElementPlus: { ElMessage },
} = window

export const useTransactionsHistory = () => {
  const transactionsHistory = reactive([])
  const transactionsHistoryPage = ref(1)
  const transactionsHistoryPerPage = ref(10)
  const transactionsHistoryComputed = computed(() => {
    const sorted = transactionsHistory.sort((a, b) => b.date - a.date)
    return transactionsHistoryPerPage.value === 'ALL'
      ? sorted
      : sorted.slice(
        (transactionsHistoryPage.value - 1) * transactionsHistoryPerPage.value,
        transactionsHistoryPage.value * transactionsHistoryPerPage.value,
      )
  })
  const exportLogs = () => downloadFile(transactionsHistory.map(log => JSON.stringify(log)).join('\r\n'), 'logs', 'text/plain;charset=utf-8')
  const addTransactionLog = (log) => transactionsHistory.push(log)

  const UI = {
    setup: () => ({
      transactionsHistory,
      transactionsHistoryPage,
      transactionsHistoryPerPage,
      transactionsHistoryComputed,
      exportLogs,
      copy,
      formatDateTime,
    }),
    template: `
      <el-row justify="space-between" align="bottom" style="margin-top: 50px">
        <h3 class="PageTitle">История транзакций</h3>
        <el-dropdown>
          <el-button type="primary">
            Действия <el-icon class="el-icon--right"><arrow-down></arrow-down></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item icon="Download" @click="exportLogs()">Скачать логи</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-row>

      <el-row style="margin: 30px 0 20px; gap: 20px">
        <el-select v-model="transactionsHistoryPerPage" style="width: 80px">
          <el-option label="10" :value="10"></el-option>
          <el-option label="100" :value="100"></el-option>
          <el-option label="300" :value="300"></el-option>
          <el-option label="Все" value="ALL"></el-option>
        </el-select>

        <el-pagination
          v-if="transactionsHistoryPerPage !== 'ALL'"
          v-model:current-page="transactionsHistoryPage"
          :page-size="transactionsHistoryPerPage"
          layout="prev, pager, next"
          :total="transactionsHistory.length"
        ></el-pagination>

        <el-text>Всего: {{ transactionsHistory.length }}</el-text>
      </el-row>

      <el-table :data="transactionsHistoryComputed" style="width: 100%">
        <el-table-column label="Date" prop="timestamp" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.date) }}
          </template>
        </el-table-column>
        <el-table-column label="txHash" prop="txHash">
          <template #default="{ row }">
            <el-tooltip content="Click to copy" placement="left" :show-after="1000">
              <el-button @click="copy(row.txHash)" size="small" text>
                <code>{{ row.txHash }}</code>
              </el-button>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="From" prop="from">
          <template #default="{ row }">
            <el-tooltip content="Click to copy" placement="left" :show-after="1000">
              <el-button @click="copy(row.from)" size="small" text>
                <code>{{ row.from }}</code>
              </el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    `,
  }

  return {
    UI,
    transactionsHistory,
    addTransactionLog,
  }
}
