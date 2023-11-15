import { Web3 } from 'https://cdn.jsdelivr.net/npm/web3@4.1.1/+esm'
import * as viem from 'https://cdn.jsdelivr.net/npm/viem@1.15.4/+esm'
import * as viemAcc from 'https://cdn.jsdelivr.net/npm/viem@1.15.4/accounts/+esm'
import * as viemChains from 'https://cdn.jsdelivr.net/npm/viem@1.15.4/chains/+esm'
import * as starknet from 'https://cdn.jsdelivr.net/npm/starknet@5.19.5/+esm'
import { AccountsTable } from './accounts-table.mjs'
import { serializeOwnProperties, useAccountsStorage } from './utils.mjs'
import { useTransactionsHistory } from './transactions-history-table.mjs'
import { calculateAddressBraavos, deployBraavosAccount, estimateBraavosAccountDeployFee } from './deploy-bravos.mjs'

const {
  Vue: { reactive, watch },
  ElementPlus: { ElMessage },
} = window

const CHAINS = {
  eth: {
    mainnet: viemChains.mainnet,
    testnet: viemChains.goerli,
  },
}

const starkProvider = new starknet.SequencerProvider({ baseUrl: starknet.constants.BaseUrl.SN_MAIN })

export const useStarknet = async (socket) => {
  const web3 = new Web3()

  function formatPrivateKey(key) {
      const prefix = "0x";
      const fullLength = 66; // Общая длина ключа с префиксом "0x"

      // Удаляем префикс "0x", если он есть
      const cleanKey = key.startsWith(prefix) ? key.slice(2) : key;

      // Вычисляем, сколько нулей нужно добавить
      const paddingLength = fullLength - cleanKey.length - prefix.length;
      const padding = "0".repeat(paddingLength);

      return prefix + padding + cleanKey;
  }
  const create = (braavosPk) => {
    if(!braavosPk) return ElMessage.error('Не указан приватный ключ')
    const ethPk = formatPrivateKey(braavosPk)
    const ethAccount = web3.eth.accounts.privateKeyToAccount(ethPk)

    const BraavosProxyAddress = calculateAddressBraavos(braavosPk)

    return {
      address: ethAccount.address,
      eip4337pk: braavosPk,
      privateKey: ethPk,
      ethAccount,
      eip4337Address: BraavosProxyAddress,
    }
  }
  const sign = (account, message) => account.ethAccount.sign(message)
  const accountsStorage = await useAccountsStorage({
    socket,
    blockchain: 'starknet',
    create,
    sign,
  })
  const { addTransactionLog, UI: TransactionsTable } = useTransactionsHistory()

  socket.on('starknet.getEip4337Address', async (message) => {
    const account = accountsStorage.getAccountByAddress(message.payload.ethAddress)
    if (!account) return ElMessage.error('Адрес не найден 1: ' + message.payload.ethAddress)

    socket.emit('response-' + message.messageId, { success: true, eip4337Address: account.eip4337Address })
  })
  socket.on('starknet.sendEthSerializedTransaction', async (message) => {
    const account = accountsStorage.getAccountByAddress(message.payload.from)
    if (!account) return ElMessage.error('Адрес не найден 2: ' + message.payload.from)

    if (!CHAINS[message.payload.provider]) return ElMessage.error('Неизвестный провайдер: ' + message.payload.provider)
    if (!CHAINS[message.payload.provider][message.payload.network]) return ElMessage.error('Неизвестная сеть: ' + message.payload.network)
    const chain = CHAINS[message.payload.provider][message.payload.network]

    const walletClient = viem.createWalletClient({ chain, transport: viem.http() })
    const viemAccount = viemAcc.privateKeyToAccount(account.ethAccount.privateKey)

    try {
      const parsedTx = viem.parseTransaction(message.payload.serializedTxHex)
      const signature = await viemAccount.signTransaction(parsedTx)
      const txHash = await walletClient.sendRawTransaction({ serializedTransaction: signature })

      addTransactionLog({ date: new Date(), txHash, from: account.address })
      socket.emit('response-' + message.messageId, { success: true, txHash })
    } catch (error) {
      console.error('Error sending transaction:', error, message)
      socket.emit('response-' + message.messageId, { success: false, error: error.message })
    }
  })
  socket.on('starknet.deployContract', async (message) => {
    const account = accountsStorage.getAccountByAddress(message.payload.ethAddress)
    if (!account) return ElMessage.error('Адрес не найден 3: ' + message.payload.ethAddress)

    const estimatedFee = await estimateBraavosAccountDeployFee(account.eip4337pk, starkProvider)

    const { transaction_hash, contract_address, error } =
    await deployBraavosAccount(account.eip4337pk, starkProvider, estimatedFee)
      .then((res) => ({ transaction_hash: res.transactionHash, contract_address: res.contractAddress }))
      .catch((err) => {
        return { transaction_hash: null, contract_address: null, error: err.toString() }
      })

    if(!transaction_hash || !contract_address) {
        socket.emit('response-' + message.messageId, { success: false, error })
        return
    }
    await starkProvider.waitForTransaction(transaction_hash);

    addTransactionLog({ date: new Date(), txHash: transaction_hash, from: account.address })

    socket.emit('response-' + message.messageId, { success: true, txHash: transaction_hash })
  })
  socket.on('starknet.call', async (message) => {
    const account = accountsStorage.getAccountByAddress(message.payload.erc20Address)
    if (!account) return ElMessage.error('Адрес не найден 4: ' + message.payload.erc20Address)

    const starkAccount = new starknet.Account(starkProvider, account.eip4337Address, account.eip4337pk, '0')

    const { callData } = message.payload


    const { success, data } = await starkAccount.callContract(callData)
      .then((res) => ({ success: true, data: res }))
      .catch((err) => {
        return { success: false, data: err }
      })


    socket.emit('response-' + message.messageId, { success, data })
  })
  socket.on('starknet.execute', async (message) => {
    const account = accountsStorage.getAccountByAddress(message.payload.erc20Address)
    if (!account) return ElMessage.error('Адрес не найден 5: ' + message.payload.erc20Address)

    const starkAccount = new starknet.Account(starkProvider, account.eip4337Address, account.eip4337pk, '0')

    const { callData } = message.payload


    const { success, data } = await starkAccount.execute(callData)
      .then((res) => ({ success: true, data: res }))
      .catch((err) => {
        return { success: false, data: serializeOwnProperties(err) }
      })

    const { transaction_hash } = data

    addTransactionLog({ date: new Date(), txHash: transaction_hash, from: account.address })

    socket.emit('response-' + message.messageId, { success, data })
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
