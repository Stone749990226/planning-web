<template>
    <div id="map-container"></div>
</template>

<script setup>
import { onMounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

onMounted(() => {
    // 初始化地图
    const map = L.map('map-container', {
        center: [23.132191, 116.266530], // 北京中心坐标
        zoom: 7,
        attributionControl: false,
        // 关键配置：禁用惯性滑动（避免白边）
        inertia: false
    })

    // 添加高德地图瓦片
    L.tileLayer('http://49.233.204.126:18889/wind/{z}/{x}/{y}.png').addTo(map)

    window.addEventListener('resize', () => {
        map.invalidateSize()
    })
})
</script>

<style scoped>
#map-container {
    height: 100vh;
    width: 100vw;
    position: absolute;
    top: 0;
    left: 0;
    background: #e5e8ec;
}

/* 修复Leaflet控制栏偏移 */
:deep(.leaflet-top) {
    top: 10px;
}

:deep(.leaflet-left) {
    left: 10px;
}
</style>