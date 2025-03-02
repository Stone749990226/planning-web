import axios from 'axios'

// 创建带基础配置的实例
const http = axios.create({
    baseURL: import.meta.env.VITE_API_BASE, // 从.env读取
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
})


export default http