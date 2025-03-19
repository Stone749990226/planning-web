import startIconUrl from '@/assets/icon_start_point.png';
import endIconUrl from '@/assets/icon_end_point.png';
import planeIconUrl from '@/assets/icon_plane.png'  // 新增飞机图标
const PLANE_ICON_SIZE = 20
const PLANE_ICON_ANCHOR = PLANE_ICON_SIZE / 2

const planeIcon = L.icon({
    iconUrl: planeIconUrl,
    iconSize: [PLANE_ICON_SIZE, PLANE_ICON_SIZE],
    iconAnchor: [PLANE_ICON_ANCHOR, PLANE_ICON_ANCHOR]
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

export { startIcon, endIcon, planeIcon }