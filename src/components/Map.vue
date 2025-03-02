<template>
    <div id="map-container"></div>
    <!-- 进度条面板 -->
    <div class="controls">
        <button @click="togglePlayback" :class="{ playing: isPlaying }">
            {{ isPlaying ? '暂停' : '开始' }}
        </button>
        <div class="time-display">{{ currentTimeDisplay }}</div>
        <div class="progress-container" @click="handleProgressClick">
            <div class="progress-track">
                <div v-for="(_, index) in images" :key="index" class="progress-step" :class="{
                    active: index === currentIndex,
                    passed: index < currentIndex
                }" @mouseover="hoverIndex = index" @mouseleave="hoverIndex = -1">
                    <div v-if="hoverIndex === index" class="step-tooltip">
                        {{ getTimeFromIndex(index) }}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- 路径规划面板 -->
    <div class="plan-panel" :class="{ active: showPanel }">
        <div class="panel-header">
            <h3>路径规划</h3>
            <button class="close-btn" @click="togglePanel">×</button>
        </div>

        <div class="panel-content">
            <div class="form-item">
                <div class="tip-text">{{ tipText }}</div>
            </div>

            <div class="form-item">
                <label>出发时间</label>
                <input type="text" v-model="formData.start_time" readonly>
            </div>

            <div class="form-item">
                <label>起点坐标</label>
                <input type="text" v-model="formData.start" readonly>
            </div>

            <div class="form-item">
                <label>终点坐标</label>
                <input type="text" v-model="formData.end" readonly>
            </div>

            <div class="form-item">
                <label>飞行速度 (km/h)</label>
                <input type="number" v-model.number="formData.speed" step="10" min="0">
            </div>

            <div class="action-buttons" v-if="showActions">
                <button class="plan-btn" @click="submitPlan">路径规划</button>
                <button class="clear-btn" @click="clearMarkers">清空标记</button>
            </div>
        </div>
    </div>

    <!-- Plan按钮 -->
    <button class="plan-trigger" @click="togglePanel">Plan</button>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import startIconUrl from '@/assets/icon_start_point.png';
import endIconUrl from '@/assets/icon_end_point.png';
import { routeApi } from '@/api'

const FADE_DURATION = 500
const PLAY_INTERVAL = 2000

const map = ref(null)
const currentOverlay = ref(null)
const nextOverlay = ref(null)
const animationFrame = ref(null)
const timer = ref(null)

const modules = import.meta.glob('@/assets/example/*.png', { eager: true })
const images = Object.keys(modules)
    .sort((a, b) => {
        const getTime = path => path.split('/').pop().slice(0, -4)
        return getTime(a).localeCompare(getTime(b))
    })
    .map(path => modules[path].default)

const preloadedImages = images.map(src => {
    const img = new Image()
    img.src = src
    return img
})

const isPlaying = ref(false)
const currentIndex = ref(0)
const hoverIndex = ref(-1)
const totalImages = images.length

const isLastImage = computed(() => currentIndex.value === totalImages - 1)
const currentTimeDisplay = computed(() => {
    const filename = images[currentIndex.value].split('/').pop()
    return formatTime(filename.slice(0, -4).slice(-4))
})

const bounds = [
    [5.000078950553419, 72.00002117304405],
    [53.999995789308514, 137.9999788561882]
]

function formatTime(timeStr) {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`
}

function getTimeFromIndex(index) {
    const filename = images[index].split('/').pop()
    return formatTime(filename.slice(0, -4).slice(-4))
}

function togglePlayback() {
    if (isPlaying.value) {
        stopPlayback()
    } else {
        if (isLastImage.value) currentIndex.value = 0
        startPlayback()
    }
}

function startPlayback() {
    isPlaying.value = true
    timer.value = setInterval(() => {
        if (currentIndex.value < totalImages - 1) {
            currentIndex.value++
        } else {
            stopPlayback()
        }
    }, PLAY_INTERVAL)
}

function stopPlayback() {
    isPlaying.value = false
    clearInterval(timer.value)
}

function handleProgressClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const stepWidth = rect.width / totalImages
    const clickedIndex = Math.min(
        Math.floor((event.clientX - rect.left) / stepWidth),
        totalImages - 1
    )
    currentIndex.value = clickedIndex
    if (!isPlaying.value) startPlayback()
}

function fadeOverlay(oldLayer, newLayer) {
    let start = null
    const animate = timestamp => {
        if (!start) start = timestamp
        const progress = timestamp - start
        const ratio = Math.min(progress / FADE_DURATION, 1)

        oldLayer.setOpacity(0.5 * (1 - ratio))
        newLayer.setOpacity(0.5 * ratio)

        if (ratio < 1) {
            animationFrame.value = requestAnimationFrame(animate)
        } else {
            oldLayer.remove()
            currentOverlay.value = newLayer
            nextOverlay.value = null
        }
    }
    animationFrame.value = requestAnimationFrame(animate)
}

const showPanel = ref(false)
const mapClickHandler = ref(null)
const markers = ref({
    start: null,
    end: null
})

// 表单数据
const formData = ref({
    start_time: '',
    mark_time: '',
    start: '',
    end: '',
    speed: 600
})

const startIcon = L.icon({
    iconUrl: startIconUrl,
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5]
})

const endIcon = L.icon({
    iconUrl: endIconUrl,
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5]
})

// 计算属性
const tipText = computed(() => {
    if (!markers.value.start) return '请在地图上标记起点'
    if (!markers.value.end) return '请在地图上标记终点'
    return '标记完成，请输入速度'
})

const showActions = computed(() => {
    return markers.value.start && markers.value.end
})

// 面板切换逻辑
const togglePanel = () => {
    showPanel.value = !showPanel.value
    if (showPanel.value) {
        // 记录时间戳
        formData.value.start_time = getCurrentTimestamp()
        formData.value.mark_time = getFirstImageTimestamp()
        // 暂停轮播
        stopPlayback()
        setupMapInteraction()
    } else {
        clearMapInteraction()
        clearMarkers()
    }
}

// 获取时间戳方法
const getCurrentTimestamp = () => {
    const filename = images[currentIndex.value].split('/').pop()
    return filename.slice(0, -4)
}

const getFirstImageTimestamp = () => {
    const firstImage = images[0].split('/').pop()
    return firstImage.slice(0, -4)
}

// 地图交互逻辑
const setupMapInteraction = () => {
    mapClickHandler.value = (e) => {
        if (!markers.value.start) {
            setStartMarker(e.latlng)
        } else if (!markers.value.end) {
            setEndMarker(e.latlng)
        }
    }
    map.value.on('click', mapClickHandler.value)
}

const clearMapInteraction = () => {
    if (mapClickHandler.value) {
        map.value.off('click', mapClickHandler.value)
    }
}

// 标记处理
const setStartMarker = (latlng) => {
    if (markers.value.start) markers.value.start.remove()
    markers.value.start = L.marker(latlng, { icon: startIcon })
        .addTo(map.value)
    updateFormData('start', latlng)
}

const setEndMarker = (latlng) => {
    if (markers.value.end) markers.value.end.remove()
    markers.value.end = L.marker(latlng, { icon: endIcon })
        .addTo(map.value)
    updateFormData('end', latlng)
}

const updateFormData = (type, latlng) => {
    const lat = latlng.lat.toFixed(4)
    const lng = latlng.lng.toFixed(4)
    formData.value[type] = `北纬${lat}，东经${lng}`
}

// 清空标记
const clearMarkers = () => {
    if (markers.value.start) markers.value.start.remove()
    if (markers.value.end) markers.value.end.remove()
    markers.value = { start: null, end: null }
    formData.value.start = ''
    formData.value.end = ''
}

// 提交逻辑
const submitPlan = async () => {
    if (!validateForm()) return

    try {
        function formatDateTime(input) {
            // 将输入转换为字符串（兼容数字输入）
            const str = String(input);

            // 分解日期时间组成部分
            const year = str.substring(0, 4);
            const month = str.substring(4, 6);
            const day = str.substring(6, 8);
            const hour = str.substring(8, 10);
            const minute = str.substring(10, 12);

            // 拼接成标准格式
            return `${year}-${month}-${day} ${hour}:${minute}`;
        }
        // 转换参数格式（根据后端要求）
        const params = {
            start: parseCoordinate(formData.value.start),
            end: parseCoordinate(formData.value.end),
            start_time: formatDateTime(formData.value.start_time),
            "mark_time": formatDateTime(getFirstImageTimestamp()),
            speed: formData.value.speed,
            "time_step": 15,
            "threshold": 0,
            "structure_size": 5
        }
        // 调用封装的API方法
        const response = await routeApi.calcRoute(JSON.stringify(params))
        console.log("[submitPlan] response")
        console.log(response.data.route)
        // 处理响应数据（根据实际返回结构）
        if (response.status === 200) {
            console.log('路径规划成功:', response.data)
            // 更新地图路径等操作...
        } else {
            alert(`请求失败: ${response.message}`)
        }
    } catch (error) {
        console.error('请求异常:', error)
        alert('网络请求失败，请检查连接')
    }
}
// 辅助方法
const parseCoordinate = (str) => {
    const matches = str.match(/北纬([\d.]+)，东经([\d.]+)/)
    return {
        lat: parseFloat(matches[1]),
        lon: parseFloat(matches[2])
    }
}

const validateForm = () => {
    if (!formData.value.start || !formData.value.end) {
        alert('请先标记起点和终点')
        return false
    }
    if (!formData.value.speed || formData.value.speed <= 0) {
        alert('请输入有效的航行速度')
        return false
    }
    return true
}

watch(currentIndex, (newVal, oldVal) => {
    if (newVal === oldVal) return

    if (nextOverlay.value) {
        cancelAnimationFrame(animationFrame.value)
        nextOverlay.value.remove()
    }

    const oldLayer = currentOverlay.value
    const newImage = preloadedImages[newVal]

    nextOverlay.value = L.imageOverlay(newImage.src, bounds, {
        opacity: 0,
        interactive: false
    }).addTo(map.value)

    fadeOverlay(oldLayer, nextOverlay.value)
})

onMounted(() => {
    map.value = L.map('map-container', {
        center: [23.132191, 116.266530],
        zoom: 7,
        minZoom: 5,
        maxZoom: 11,
        attributionControl: false,
        fadeAnimation: false
    })

    L.tileLayer('http://49.233.204.126:18889/wind/{z}/{x}/{y}.png').addTo(map.value)

    currentOverlay.value = L.imageOverlay(preloadedImages[0].src, bounds, {
        opacity: 0.5,
        minZoom: 5,
        maxZoom: 11,
        interactive: false
    }).addTo(map.value)

    startPlayback()
})

onBeforeUnmount(() => {
    stopPlayback()
    cancelAnimationFrame(animationFrame.value)
    if (map.value) map.value.remove()
})
</script>

<style scoped>
#map-container {
    height: 100vh;
    width: 100vw;
    position: absolute;
    top: 0;
    left: 0;
    background: #f0f2f5;
}

.controls {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 20px;
    z-index: 1000;
}

button {
    padding: 8px 16px;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
}

button:hover {
    background: #059669;
}

button.playing {
    background: #ef4444;
}

button.playing:hover {
    background: #dc2626;
}

.time-display {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    min-width: 60px;
    text-align: center;
}

.progress-container {
    width: 400px;
    height: 24px;
    position: relative;
    cursor: pointer;
}

.progress-track {
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    position: relative;
    top: 10px;
    display: flex;
    justify-content: space-between;
}

.progress-step {
    width: 24px;
    height: 24px;
    position: relative;
    top: -10px;
}

.progress-step::before {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background: #d1d5db;
    border-radius: 50%;
    left: 8px;
    top: 8px;
    transition: all 0.2s;
}

.progress-step.passed::before {
    background: #10b981;
}

.progress-step.active::before {
    background: #10b981;
    transform: scale(1.5);
}

.step-tooltip {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
}

.plan-panel {
    position: fixed;
    top: 20px;
    right: -350px;
    width: 320px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: right 0.3s ease;
    z-index: 1000;
}

.plan-panel.active {
    right: 20px;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #eee;
}

.close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    padding: 0 8px;
    color: #666;
}

.panel-content {
    padding: 16px;
}

.form-item {
    margin-bottom: 16px;
}

.form-item label {
    display: block;
    margin-bottom: 4px;
    color: #666;
    font-size: 14px;
}

.form-item input {
    width: 90%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.tip-text {
    color: #666;
    font-size: 14px;
    padding: 8px 0;
}

.action-buttons {
    margin-top: 20px;
    display: flex;
    gap: 10px;
}

.plan-btn {
    background: #10b981;
    color: white;
    padding: 8px 16px;
}

.clear-btn {
    background: #ef4444;
    color: white;
    padding: 8px 16px;
}

.plan-trigger {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 8px 16px;
    background: #3b82f6;
    color: white;
    z-index: 1000;
}
</style>