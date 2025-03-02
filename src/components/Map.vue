<template>
    <div id="map-container"></div>
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
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
        attributionControl: false,
        fadeAnimation: false
    })

    L.tileLayer('http://49.233.204.126:18889/wind/{z}/{x}/{y}.png').addTo(map.value)

    currentOverlay.value = L.imageOverlay(preloadedImages[0].src, bounds, {
        opacity: 0.5,
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
</style>