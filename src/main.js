import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const app = createApp(App)
app.config.globalProperties.L = L // 全局注册
app.mount('#app')
