<template>
    <div id="map-container"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

let map = null
let currentOverlay = null
let nextOverlay = null
let imageIndex = 0
let timer = null
let animationFrame = null
const FADE_DURATION = 500  // 渐变持续时间（毫秒）

const bounds = [
    [5.000078950553419, 72.00002117304405],
    [53.999995789308514, 137.9999788561882]
]

const modules = import.meta.glob('@/assets/example/*.png', { eager: true })
const images = Object.values(modules).map(m => m.default)

// 预加载所有图片并转为Image对象
const preloadedImages = []
images.forEach(src => {
    const img = new Image()
    img.src = src
    preloadedImages.push(img)
})

// 渐变动画函数
const fadeOverlay = (oldLayer, newLayer) => {
    let start = null
    const animate = (timestamp) => {
        if (!start) start = timestamp
        const progress = timestamp - start
        const ratio = Math.min(progress / FADE_DURATION, 1)

        // 更新透明度
        oldLayer.setOpacity(0.5 * (1 - ratio))
        newLayer.setOpacity(0.5 * ratio)

        if (ratio < 1) {
            animationFrame = requestAnimationFrame(animate)
        } else {
            // 动画完成后移除旧图层
            oldLayer.remove()
            currentOverlay = newLayer
            nextOverlay = null
        }
    }
    animationFrame = requestAnimationFrame(animate)
}

const switchImage = () => {
    if (nextOverlay) return  // 防止重复触发

    // 预加载下一张图片
    const nextIndex = (imageIndex + 1) % images.length
    const nextImage = preloadedImages[nextIndex]

    // 创建新覆盖层（初始透明）
    nextOverlay = L.imageOverlay(nextImage.src, bounds, {
        opacity: 0,
        interactive: false
    }).addTo(map)

    // 启动渐变动画
    fadeOverlay(currentOverlay, nextOverlay)

    // 更新索引
    imageIndex = nextIndex
}

onMounted(() => {
    map = L.map('map-container', {
        center: [23.132191, 116.266530],
        zoom: 7,
        attributionControl: false,
        inertia: false,
        fadeAnimation: false  // 禁用Leaflet自带动画
    })

    L.tileLayer('http://49.233.204.126:18889/wind/{z}/{x}/{y}.png').addTo(map)

    // 初始化第一个覆盖层
    currentOverlay = L.imageOverlay(preloadedImages[0].src, bounds, {
        opacity: 0.5,
        interactive: false
    }).addTo(map)

    timer = setInterval(switchImage, 2000)
})

onBeforeUnmount(() => {
    clearInterval(timer)
    cancelAnimationFrame(animationFrame)
    if (map) map.remove()
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

/* 强制Leaflet覆盖层使用硬件加速 */
:deep(.leaflet-image-layer) {
    will-change: opacity;
    transform: translateZ(0);
}

:deep(.leaflet-top) {
    top: 10px;
}

:deep(.leaflet-left) {
    left: 10px;
}
</style>