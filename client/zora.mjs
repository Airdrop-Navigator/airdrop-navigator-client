import { Web3 } from 'https://cdn.jsdelivr.net/npm/web3@4.1.1/+esm'
import { AccountsTable } from './accounts-table.mjs'
import { useAccountsStorage } from './utils.mjs'
import { useTransactionsHistory } from './transactions-history-table.mjs'
import * as viem from 'https://cdn.jsdelivr.net/npm/viem@1.15.4/+esm'
import * as viemAcc from 'https://cdn.jsdelivr.net/npm/viem@1.15.4/accounts/+esm'

const {
  Vue: { reactive, watch },
  ElementPlus: { ElMessage },
} = window

const PROVIDERS = {
  eth: {
    mainnet: 'https://eth.llamarpc.com',
    testnet: 'https://goerli.infura.io/v3/265fbd2416ff484f848cd899746130e2',
  },
  optimism: {
    mainnet: null,
    testnet: 'https://optimism-goerli.infura.io/v3/265fbd2416ff484f848cd899746130e2',
  },
  zora: {
    mainnet: 'https://rpc.zora.energy',
    testnet: 'https://testnet.rpc.zora.energy',
  },
}

export const useZora = async (socket) => {
  const web3 = new Web3()
  const create = (pk) => pk
    ? web3.eth.accounts.privateKeyToAccount(pk)
    : web3.eth.accounts.create()
  const sign = (account, message) => account.sign(message)
  const accountsStorage = await useAccountsStorage({
    socket,
    blockchain: 'zora',
    create,
    sign,
  })
  const { addTransactionLog, UI: TransactionsTable } = useTransactionsHistory()

  socket.on('zora.sendTransaction', async (message) => {
    const account = accountsStorage.getAccountByAddress(message.payload.transaction.from)
    if (!account) return ElMessage.error('Адрес не найден: ' + message.payload.transaction.from)

    if (!PROVIDERS[message.payload.provider]) return ElMessage.error('Неизвестный провайдер: ' + message.payload.provider)
    if (!PROVIDERS[message.payload.provider][message.payload.network]) return ElMessage.error('Неизвестная сеть: ' + message.payload.network)
    const provider = PROVIDERS[message.payload.provider][message.payload.network]

    const web3 = new Web3(new Web3.providers.HttpProvider(provider))
    web3.eth.accounts.wallet.add(account.privateKey)
    const tx = await new Promise((resolve) => {
      web3.eth
        .sendTransaction(message.payload.transaction)
        .once('transactionHash', (txHash) => resolve({ txHash, from: message.payload.transaction.from }))
        .on('error', (error) => {
          ElMessage.error('Ошибка при отправке транзакции: ' + error.message)
          resolve(error)
        })
    })

    if (!tx || tx instanceof Error) {
      console.error('Error sending transaction:', tx, message)
      socket.emit('response-' + message.messageId, { success: false, error: tx })
    } else {
      addTransactionLog({ date: new Date(), txHash: tx.txHash, from: tx.from })
      socket.emit('response-' + message.messageId, { success: true, txHash: tx.txHash })
    }
  })

  socket.on('zora.signTransaction', async (message) => {
    const wallet = accountsStorage.getAccountByAddress(message.payload.from)
    if (!wallet) return ElMessage.error('Адрес не найден: ' + message.payload.from)

    const unsignedTx = message.payload.unsignedTx
    if(!unsignedTx) return ElMessage.error('Не указана транзакция для подписи. Адрес: ' + message.payload.from)

    const parsedTx = viem.parseTransaction(unsignedTx)
    const account = viemAcc.privateKeyToAccount(wallet.privateKey)
    try {
      const signature = await account.signTransaction(parsedTx)
      addTransactionLog({ date: new Date(), txHash: message.payload.description, from: message.payload.from })
      socket.emit('response-' + message.messageId, { success: true, signature: signature })
    } catch (e) {
      console.error('Error sending transaction from address:', message.payload.from, e)
      socket.emit('response-' + message.messageId, { success: false, error: e.message })
    }
  })

  const UI = {
    components: { AccountsTable, TransactionsTable },
    data: () => ({ ...accountsStorage, create }),
    template: `
      <AccountsTable
        v-bind="{
          accounts,
          accountsStatus,
          getAccountByAddress,
          createAddress,
          removeAddress,
          reconnectAddress,
          reconnectAllAddresses,
          create,
        }"
      />
      <TransactionsTable/>
    `,
  }

  return {
    UI,
    ...accountsStorage,
  }
}
