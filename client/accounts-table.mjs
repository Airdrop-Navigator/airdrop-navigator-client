import { Web3 } from 'https://cdn.jsdelivr.net/npm/web3@4.1.1/+esm'
import { copy, decryptData, downloadFile, encryptData, readFile } from './utils.mjs'
import * as utils from './utils.mjs'

const {
  Vue: { ref, reactive },
  ElementPlus: { ElMessage },
} = window

export const AccountsTable = {
  props: [
    'accounts',
    'accountsStatus',
    'getAccountByAddress',
    'createAddress',
    'removeAddress',
    'reconnectAddress',
    'reconnectAllAddresses',
    'create',
  ],
  setup (props) {
    const { accounts, getAccountByAddress, create } = props
    const dialogsVisibility = reactive({
      generateKeys: false,
      importKeys: false,
      exportKeys: false,
    })
    const generateKeysForm = reactive({ count: 0 })
    const importKeysForm = reactive({ type: 'file', text: '', password: '' })
    const exportKeysForm = reactive({ fileName: 'private_keys', password: '' })

    const importKeysFileRef = ref(null)

    const formLoadingState = reactive({})
    const wrapFormLoading = async (formName, callback) => {
      formLoadingState[formName] = true
      await callback().catch(console.error)
      formLoadingState[formName] = false
    }

    const generateKeys = async () => {
      const count = generateKeysForm.count
      if (count <= 0) return ElMessage.error('Введите корректное количество адресов')

      for (let i = 0; i < count; i++) accounts.push(create())

      ElMessage.success('Адреса успешно сгенерированы')
      dialogsVisibility.generateKeys = false
      generateKeysForm.count = 0
    }

    const clearImportKeysForm = () => {
      Object.assign(importKeysForm, { type: 'file', text: '', file: null, password: '' })
      if (importKeysFileRef.value) importKeysFileRef.value.files = ''
    }
    const importKeys = async () => {
      const rawKeys = importKeysForm.type === 'file'
        ? await importKeysFromFile()
        : importKeysForm.text
      const keys = rawKeys
        ?.split('\n')
        .map(key => key.trim())
        .filter(Boolean)
        .map(key => key.startsWith('0x') ? key : '0x' + key)

      if (!keys?.length) return ElMessage.error('Введите корректные приватные ключи')

      for (const key of keys) {
        const account = create(key)
        if (!getAccountByAddress(account.address)) accounts.push(account)
      }

      ElMessage.success('Адреса успешно импортированы')
      clearImportKeysForm()
      dialogsVisibility.importKeys = false
    }
    const importKeysFromFile = () => new Promise(async (resolve, reject) => {
      const { password } = importKeysForm
      const file = importKeysFileRef.value?.input.files[0]
      if (!file) return ElMessage.error('Выберите файл с ключами')
      if (!password) return ElMessage.error('Введите пароль для расшифровки')

      const content = await readFile(file).catch((error) => {
        console.error(error)
        ElMessage.error('Ошибка при чтении файла!')
      })
      if (!content) return reject()

      const decryptedKeys = await decryptData(content, password).catch((err) => {
        console.error(err)
        ElMessage.error('Неверный пароль!')
      })
      if (!decryptedKeys) return reject()

      resolve(decryptedKeys)
    })

    const exportKeys = async () => {
      const { fileName, password } = exportKeysForm

      if (!fileName) return ElMessage.error('Введите название файла')
      if (!password) return ElMessage.error('Введите пароль для шифрования')

      const privateKeys = accounts.map(account => account.privateKey).join('\r\n')
      const encryptedKeys = await encryptData(privateKeys, password)

      downloadFile(encryptedKeys, fileName, 'text/plain;charset=utf-8')

      ElMessage.success('Адреса успешно экспортированы')
      dialogsVisibility.exportKeys = false
      exportKeysForm.fileName = 'private_keys'
      exportKeysForm.password = ''
    }
    const copyAllAddresses = () => copy(accounts.map(account => account.address).join('\r\n'))

    return {
      ...utils,
      dialogsVisibility,
      generateKeysForm,
      importKeysForm,
      exportKeysForm,
      importKeysFileRef,
      formLoadingState,
      wrapFormLoading,
      generateKeys,
      importKeys,
      exportKeys,
      copyAllAddresses,
    }
  },
  template: `
    <el-row justify="space-between" align="bottom" style="margin-top: 50px">
      <h3 class="PageTitle">Адреса в работе</h3>
      <el-dropdown>
        <el-button type="primary">
          Действия <el-icon class="el-icon--right"><arrow-down></arrow-down></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
<!--            <el-dropdown-item icon="Plus" @click="dialogsVisibility.generateKeys = true">Сгенерировать ключи</el-dropdown-item>-->
            <el-dropdown-item icon="Upload" @click="dialogsVisibility.importKeys = true">Импортировать ключи</el-dropdown-item>
            <el-dropdown-item icon="Download" @click="dialogsVisibility.exportKeys = true">Экспортировать ключи</el-dropdown-item>
            <el-dropdown-item icon="List" @click="copyAllAddresses()">Копировать адреса</el-dropdown-item>
            <el-dropdown-item icon="Refresh" @click="reconnectAllAddresses()">Переподключить все</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </el-row>

    <el-table :data="accounts" style="width: 100%; margin-top: 30px">
      <el-table-column prop="address" label="Адрес">
        <template #default="{ row }">
          <el-tooltip content="Click to copy" placement="left" :show-after="1000">
            <el-button @click="copy(row.address)" size="small" text>
              <code>{{ row.address }}</code>
            </el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="Статус">
        <template #default="{ row }">
          <el-tag v-if="accountsStatus.get(row.address.toLowerCase()) === 'AUTHORIZING'" type="info">Авторизация...</el-tag>
          <el-tag v-else-if="accountsStatus.get(row.address.toLowerCase()) === 'ONLINE'" type="success">Онлайн</el-tag>
          <el-tag v-else type="danger">Не авторизован</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Действия" fixed="right" width="100">
        <template #default="{ row }">
          <el-dropdown>
            <el-button text type="primary" size="small">
              Действия <el-icon class="el-icon--right"><arrow-down></arrow-down></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item icon="List" @click="copy(row.privateKey)">Копировать приватный ключ</el-dropdown-item>
                <el-dropdown-item icon="Refresh" @click="reconnectAddress(row.address)">Переподключить</el-dropdown-item>
                <el-dropdown-item icon="Delete" @click="removeAddress(row.address)">Удалить</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

<!--    <el-dialog v-model="dialogsVisibility.generateKeys" title="Сгенерировать ключи" width="30%">-->
<!--      <el-form label-position="top" @submit.prevent.stop="wrapFormLoading('generateKeys', generateKeys)">-->
<!--        <el-form-item label="Количество">-->
<!--          <el-input-number v-model="generateKeysForm.count"/>-->
<!--        </el-form-item>-->
<!--      </el-form>-->
<!--      <template #footer>-->
<!--        <div class="dialog-footer">-->
<!--          <el-button type="primary" :loading="formLoadingState.generateKeys" @click="wrapFormLoading('generateKeys', generateKeys)">Сгенерировать</el-button>-->
<!--        </div>-->
<!--      </template>-->
<!--    </el-dialog>-->

    <el-dialog v-model="dialogsVisibility.importKeys" title="Импортировать ключи" width="50%">
      <el-tabs v-model="importKeysForm.type">
        <el-tab-pane label="Файл" name="file">
          <el-form label-position="top" @submit.prevent.stop="wrapFormLoading('importKeys', importKeys)">
            <el-form-item label="Файл с ключами">
              <el-input type="file" v-model="importKeysForm.file" ref="importKeysFileRef"/>
            </el-form-item>
            <el-form-item label="Пароль шифрования">
              <el-input type="password" v-model="importKeysForm.password"/>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="Текст" name="text">
          <el-form label-position="top" @submit.prevent.stop="wrapFormLoading('importKeys', importKeys)">
            <el-form-item label="Приватные ключи" tip="1234">
              <el-input type="textarea" v-model="importKeysForm.text" :rows="10"/>
              <el-text class="" size="small">Каждый приватный ключ нужно вводить с новой строки.</el-text>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="formLoadingState.generateKeys" @click="wrapFormLoading('importKeys', importKeys)">Импортировать</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="dialogsVisibility.exportKeys" title="Экспортировать ключи" width="30%">
      <el-form label-position="top" @submit.prevent.stop="wrapFormLoading('exportKeys', exportKeys)">
        <el-form-item label="Название файла">
          <el-input v-model="exportKeysForm.fileName"/>
        </el-form-item>
        <el-form-item label="Пароль шифрования">
          <el-input type="password" v-model="exportKeysForm.password"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="formLoadingState.importKeys" @click="wrapFormLoading('exportKeys', exportKeys)">Скачать</el-button>
        </div>
      </template>
    </el-dialog>
  `
}
