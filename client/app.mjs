import io from 'https://cdn.jsdelivr.net/npm/socket.io-client@4.0.1/+esm'
import { useAuth } from './auth.mjs'
import { useStarknet } from './starknet.mjs'
import * as utils from './utils.mjs'
import { useZora } from './zora.mjs'

const { createApp, ref } = window.Vue

const SOCKET_SERVER_URL = 'https://fewcats.com/'

const isConnected = ref(false)
const socket = io(SOCKET_SERVER_URL)
socket.on('connect', () => isConnected.value = true)
socket.on('disconnect', () => {
  isConnected.value = false;
  setTimeout(() => {
    socket.connect();
  }, 1000)
})
socket.on('error', () => {
  isConnected.value = false;
  setTimeout(() => {
    socket.connect();
  }, 1000)
})

const WorkspaceUI = {
  async setup () {
    const activeBlockchainTab = utils.useLocalStorageRef('active-blockchain-tab', 'zora')
    const zora = await useZora(socket)
    const starknet = await useStarknet(socket)

    return {
      ZoraUI: zora.UI,
      StarknetUI: starknet.UI,
      activeBlockchainTab,
    }
  },
  template: `
    <div class="WorkspaceView" style="margin-top: 50px;">
      <h2>Добро пожаловать в Academy Hunter!</h2>

      <el-tabs v-model="activeBlockchainTab">
        <el-tab-pane label="Zora" name="zora">
          <component :is="ZoraUI"/>
        </el-tab-pane>
        <el-tab-pane label="Starknet" name="starknet">
          <component :is="StarknetUI"/>
        </el-tab-pane>
      </el-tabs>
    </div>
  `,
}

const app = createApp({
  setup () {
    const auth = useAuth(socket)

    return {
      AuthUI: auth.UI,
      WorkspaceUI,
      isConnected,
      isAuthorized: auth.isAuthorized,
    }
  },
  template: `
    <div v-if="!isAuthorized" class="AuthView">
      <component :is="AuthUI"/>
    </div>

    <div v-else-if="!isConnected" class="ConnectingView">
      <h2 class="PageTitle">Подключение к серверу...</h2>
    </div>
    
    <suspense v-else>
      <component :is="WorkspaceUI"/>
    </suspense>
  `,
})
app.use(window.ElementPlus)
Object.entries(window.ElementPlusIconsVue).map(([key, value]) => app.component(key, value))
app.mount('#app')
