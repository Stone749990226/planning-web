import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

const app = createApp(App)
app.use(ElementPlus)
app.config.globalProperties.L = L // 全局注册
app.mount('#app')
