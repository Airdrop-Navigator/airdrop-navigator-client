import { storagePassword, encryptData, decryptData } from './utils.mjs'

const {
  Vue: { ref },
  ElementPlus: { ElMessage },
} = window

const isAuthorized = ref(false)
export const useAuth = () => {
  const passwordTest = localStorage.getItem('passwordTest')
  const login = () => {
    if (!storagePassword.value) return ElMessage.error('Введите пароль!')
    if (passwordTest) {
      decryptData(passwordTest, storagePassword.value)
        .then((content) => {
          if (content === 'password') {
            isAuthorized.value = true
          } else {
            ElMessage.error('Неверный пароль!')
          }
        })
        .catch((e) => {
          console.error(e)
          ElMessage.error('Неверный пароль!')
        })
    } else {
      encryptData('password', storagePassword.value)
        .then((data) => {
          localStorage.setItem('passwordTest', data)
          isAuthorized.value = true
        })
        .catch(console.error)
    }
  }

  if (storagePassword.value) login()

  const clear = () => {
    sessionStorage.clear()
    localStorage.clear()
    location.reload()
  }

  const UI = {
    data: () => ({ passwordTest, storagePassword, login, clear }),
    template: `
      <el-row align="middle" justify="center" style="height: 100vh; flex-direction:column; gap: 30px;">
        <el-card v-if="passwordTest" style="width: 600px;">
          <template #header>В этом браузере есть сохраненные данные. Вам нужно ввести пароль, что бы расшифровать их или вы можете очистить все и начать заново.</template>
          <el-button @click="clear()">Очистить данные</el-button>
        </el-card>
        <el-card v-if="!passwordTest" style="width: 600px;">
          <template #header>В этом браузере нет сохраненных данных. Вам нужно придумать пароль, который будет использоваться для шифрования.</template>
          <el-alert type="warning">Если вы потеряете или забудете пароль - все данные будут утеряны!</el-alert>
        </el-card>
        <el-card style="width: 600px;">
          <template #header>Введите пароль и погнали!</template>
          <el-form label-position="top">
            <el-form-item label="Пароль">
              <el-input v-model="storagePassword" type="password"/>
            </el-form-item>
            <el-form-item>
              <el-button @click="login()">Войти</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-row>
    `
  }

  return {
    UI,
    isAuthorized,
  }
}
