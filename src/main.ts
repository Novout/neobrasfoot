import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { listenForInstall } from './utils/pwa'
import { setupAutoUpdate } from './utils/pwaUpdate'

listenForInstall()

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
setupAutoUpdate(pinia)

app.mount('#app')
