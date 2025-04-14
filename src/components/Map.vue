<template>
    <div class="banner">
        <div class="banner-content">
            <img class="icon" src="@/assets/HIT.svg" alt="logo">
            <h1>气象灾害感知的无人机路径规划系统设计与实现</h1>
        </div>
    </div>
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
import 'leaflet-rotatedmarker';
import '@ansur/leaflet-pulse-icon/dist/L.Icon.Pulse.css';
import '@ansur/leaflet-pulse-icon';
import 'leaflet-ant-path';
import { routeApi } from '@/api'
import { startIcon, endIcon, planeIcon } from '@/utils/icon.js'
import { colonTimeToMinutes, splitFlightPath } from '@/utils/splitpath.js'

const FADE_DURATION = 500
const PLAY_INTERVAL = 2000

const map = ref(null)
const currentOverlay = ref(null)
const nextOverlay = ref(null)
const animationFrameFade = ref(null)
const timer = ref(null)

const modules = import.meta.glob('@/assets/example/*.png', { eager: true })
// images形如数组["/src/assets/example/202411130715.png", "/src/assets/example/202411130730.png"]
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
    return insertColonToTime(filename.slice(0, -4).slice(-4))
})

// 图片的左上角和右下角边界
const bounds = [
    [5.000078950553419, 72.00002117304405],
    [53.999995789308514, 137.9999788561882]
]

// 将形如0915的字符串转为09:15
function insertColonToTime(timeStr) {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`
}

function getTimeFromIndex(index) {
    const filename = images[index].split('/').pop()
    return insertColonToTime(filename.slice(0, -4).slice(-4))
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
    clearInterval(timer.value)
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


// 通过坐标计算，实现 ​​“点击进度条跳转到指定位置”​ 的交互逻辑
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

const showPanel = ref(false)
const mapClickHandler = ref(null)
const markers = ref({
    start: null,
    end: null,
    plane: null,
})

// 路径规划请求表单数据
const formData = ref({
    start_time: '',
    mark_time: '',
    start: '',
    end: '',
    speed: 600
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

// 路径规划面板切换逻辑
const togglePanel = () => {
    showPanel.value = !showPanel.value
    if (showPanel.value) {
        // 记录时间戳
        formData.value.start_time = getCurrentTimestamp()
        formData.value.mark_time = images[0].split('/').pop().slice(0, -4)
        // 暂停轮播
        stopPlayback()
        setupMapInteraction()
    } else {
        clearMapInteraction()
        clearMarkers()
    }
}

// filename类似202411130745.png，返回值为"202411130745"，即去掉".png"
const getCurrentTimestamp = () => {
    const filename = images[currentIndex.value].split('/').pop()
    return filename.slice(0, -4)
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
    markers.value.start = L.marker(latlng, { icon: startIcon, zIndexOffset: 10 })
        .addTo(map.value)
    updateFormData('start', latlng)
}

const setEndMarker = (latlng) => {
    if (markers.value.end) markers.value.end.remove()
    markers.value.end = L.marker(latlng, { icon: endIcon, zIndexOffset: 10 })
        .addTo(map.value)
    updateFormData('end', latlng)
}

const updateFormData = (type, latlng) => {
    const lat = latlng.lat.toFixed(4)
    const lng = latlng.lng.toFixed(4)
    formData.value[type] = `北纬${lat}，东经${lng}`
}

const clearMarkers = () => {
    if (markers.value.start) markers.value.start.remove()
    if (markers.value.end) markers.value.end.remove()
    if (markers.value.plane) markers.value.plane.remove()
    markers.value = { start: null, end: null, plane: null }
    formData.value.start = ''
    formData.value.end = ''
    clearPlanePath()
}

const flightPaths = ref([])
const pulseMarkers = ref([])
const clearPlanePath = () => {
    // 清除所有路径
    flightPaths.value.forEach(path => map.value.removeLayer(path))
    flightPaths.value = []

    // 清除标记
    pulseMarkers.value.forEach(marker => marker.remove())
    pulseMarkers.value = []
}

const drawFlightPath = (segments) => {
    clearPlanePath()

    // 绘制分段路径（美化样式）
    segments.forEach((segment) => {
        const points = segment.map(p => [p.lat, p.lon]);
        const path = L.polyline.antPath(points, {
            color: "#6CB4EE",       // 主色：浅天空蓝
            pulseColor: "#B0E2FF",  // 脉冲色：更浅的婴儿蓝
            weight: 4,
            dashArray: [10, 20], // 红白间隔：10px红色实线 + 20px白色间隔
            opacity: 0.8,
            delay: 1000,        // 动画速度
            interactive: false  // 提升性能
        }).addTo(map.value);
        flightPaths.value.push(path)
    });

    // 获取全局起点和终点坐标（用于过滤）
    const globalStart = segments[0][0]
    const globalEnd = segments[segments.length - 1][segments[segments.length - 1].length - 1]
    const globalStartKey = `${globalStart.lat},${globalStart.lon}`
    const globalEndKey = `${globalEnd.lat},${globalEnd.lon}`

    // 绘制中间节点脉冲（过滤首尾）
    const uniqueEndpoints = new Set()

    segments.forEach(segment => {
        const start = segment[0]
        const end = segment[segment.length - 1]

        // 生成坐标唯一键
        const startKey = `${start.lat},${start.lon}`
        const endKey = `${end.lat},${end.lon}`

        // 跳过全局起点和终点
        if (startKey === globalStartKey || startKey === globalEndKey) return
        // if (endKey === globalStartKey || endKey === globalEndKey) return

        // 添加中间节点脉冲
        if (!uniqueEndpoints.has(startKey)) {
            const pulseIcon = L.icon.pulse({
                iconSize: [8, 8],
                color: 'white',
                fillColor: 'white',
                heartbeat: 1.5,
                animate: true
            })
            const marker = L.marker([start.lat, start.lon], { icon: pulseIcon }).bindTooltip(`坐标：${start.lat.toFixed(4)}, ${start.lon.toFixed(4)}<br>到达时间：${start.reach_time}`, {
                direction: 'top',
                offset: [0, -10],
                permanent: false,
                className: 'pulse-tooltip'
            }).addTo(map.value)
            pulseMarkers.value.push(marker)
            uniqueEndpoints.add(startKey)
        }

        // if (!uniqueEndpoints.has(endKey)) {
        //     const pulseIcon = L.icon.pulse({
        //         iconSize: [8, 8],
        //         color: 'white',
        //         fillColor: 'white',
        //         heartbeat: 1.5,
        //         animate: true
        //     })
        //     const marker = L.marker([end.lat, end.lon], { icon: pulseIcon }).bindTooltip(`坐标：${start.lat.toFixed(4)}, ${start.lon.toFixed(4)}<br>到达时间：${start.reach_time}`, {
        //         direction: 'top',
        //         offset: [0, -10],
        //         permanent: false,
        //         className: 'pulse-tooltip'
        //     }).addTo(map.value)
        //     pulseMarkers.value.push(marker)
        //     uniqueEndpoints.add(endKey)
        // }
    })
};

const submitPlan = async () => {
    if (!validateForm()) return
    const formatDateTime = (input) => {
        const str = String(input);
        const year = str.substring(0, 4);
        const month = str.substring(4, 6);
        const day = str.substring(6, 8);
        const hour = str.substring(8, 10);
        const minute = str.substring(10, 12);
        return `${year}-${month}-${day} ${hour}:${minute}`;
    }
    const parseCoordinate = (str) => {
        const matches = str.match(/北纬([\d.]+)，东经([\d.]+)/)
        return {
            lat: parseFloat(matches[1]),
            lon: parseFloat(matches[2])
        }
    }
    const params = {
        start: parseCoordinate(formData.value.start),
        end: parseCoordinate(formData.value.end),
        start_time: formatDateTime(formData.value.start_time),
        "mark_time": formatDateTime(formData.value.mark_time),
        speed: formData.value.speed,
        "time_step": 15,
        "threshold": 0,
        "structure_size": 5
    }
    let paramsJson = JSON.stringify(params);
    console.log("[submitPlan] send request:", paramsJson)
    var waypoints = null;
    const response = await routeApi.calcRoute(paramsJson)
    if (response.status === 200) {
        waypoints = response.data.route.waypoints
        console.log("[submitPlan] waypoints response:", waypoints)
    } else {
        alert('网络请求失败，请检查连接')
    }
    const startTime = insertColonToTime(formData.value.start_time.slice(-4)) // 获取0715格式
    const segments = splitFlightPath(waypoints, formData.value.speed, startTime)
    console.log("[submitPlan] splitFlightPath segments:", segments)
    clearPlanePath()
    drawFlightPath(segments)
    // 动画执行函数
    async function animateFlight(segments) {
        markers.value.plane = L.marker([segments[0][0].lat, segments[0][0].lon], { icon: planeIcon, zIndexOffset: 11 }).addTo(map.value);

        for (const [index, segment] of segments.entries()) {
            // 计算段持续时间
            const isLastSegment = index === segments.length - 1;
            const startTime = segment[0].reach_time;
            const endTime = segment[segment.length - 1].reach_time;
            const durationMinutes = colonTimeToMinutes(endTime) - colonTimeToMinutes(startTime);
            const animationDuration = isLastSegment
                ? (durationMinutes / 15) * 2000  // 最后一段按比例计算
                : 2000;                         // 常规段固定2秒

            // 处理段内每个路径点
            for (let i = 0; i < segment.length - 1; i++) {
                const startPoint = segment[i];
                const endPoint = segment[i + 1];

                // 更新飞机方向
                markers.value.plane.setLatLng([startPoint.lat, startPoint.lon]);
                markers.value.plane.setRotationAngle(startPoint.bearing);

                // 计算段内小段时间
                const segmentDuration = colonTimeToMinutes(endPoint.reach_time) - colonTimeToMinutes(startPoint.reach_time);
                const segmentAnimationDuration = (segmentDuration / durationMinutes) * animationDuration;

                // 执行动画
                await new Promise(resolve => {
                    const startLatLng = [startPoint.lat, startPoint.lon];
                    const endLatLng = [endPoint.lat, endPoint.lon];
                    const startTime = Date.now();

                    const animate = () => {
                        const progress = (Date.now() - startTime) / segmentAnimationDuration;
                        if (progress >= 1) {
                            markers.value.plane.setLatLng(endLatLng);
                            return resolve();
                        }

                        const currentLat = startLatLng[0] + (endLatLng[0] - startLatLng[0]) * progress;
                        const currentLon = startLatLng[1] + (endLatLng[1] - startLatLng[1]) * progress;
                        markers.value.plane.setLatLng([currentLat, currentLon]);
                        requestAnimationFrame(animate);
                    };

                    animate();
                });
            }
        }
    }

    // 启动动画
    animateFlight(segments);
    startPlayback()
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

function fadeOverlay(oldLayer, newLayer) {
    let start = null; // 记录动画起始时间戳
    const animate = timestamp => {
        // 动画帧回调函数
        if (!start) start = timestamp; // 初始化开始时间
        const progress = timestamp - start; // 计算已过时间（毫秒）
        const ratio = Math.min(progress / FADE_DURATION, 1); // 计算进度比例 (0~1)

        // 动态调整新旧图层透明度
        oldLayer.setOpacity(0.5 * (1 - ratio)); // 旧图层渐隐
        newLayer.setOpacity(0.5 * ratio);       // 新图层渐显

        // 动画未完成时继续递归
        if (ratio < 1) {
            animationFrameFade.value = requestAnimationFrame(animate);
        } else {
            // 动画完成后清理旧图层并更新状态
            oldLayer.remove();
            currentOverlay.value = newLayer;
            nextOverlay.value = null;
        }
    };
    // 启动动画
    animationFrameFade.value = requestAnimationFrame(animate);
}

watch(currentIndex, (newVal, oldVal) => {
    if (newVal === oldVal) return

    if (nextOverlay.value) {
        cancelAnimationFrame(animationFrameFade.value)
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
    cancelAnimationFrame(animationFrameFade.value)
    if (map.value) map.value.remove()
})
</script>

<style scoped>
#map-container {
    height: calc(100vh - 60px);
    /* 减去banner高度 */
    width: 100vw;
    position: absolute;
    top: 60px;
    /* 下移banner的高度 */
    left: 0;
    z-index: 1;
    /* 确保地图在下方 */
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
    top: 60px;
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
    top: 60px;
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

.banner {
    position: relative;
    display: flex;
    justify-content: center;
    /* 必须的定位属性 */
    z-index: 2;
    /* 确保在map-container之上 */
    height: 60px;
    background-color: #66b1ff;
    padding: 0 20px;
    align-items: center;
}

.banner-content {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 0 20px;
}

.icon {
    width: 40px;
    /* 根据实际图标尺寸调整 */
    height: 40px;
    fill: white;
}

h1 {
    color: white;
    font-size: 22px;
    margin: 0;
    white-space: nowrap;
}
</style>