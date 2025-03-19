export const colonTimeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

const formatTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // 地球半径（千米）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const computeBearing = (lat1, lon1, lat2, lon2) => {
    const phi1 = lat1 * Math.PI / 180;
    const lambda1 = lon1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const lambda2 = lon2 * Math.PI / 180;
    const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
        Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
    let theta = Math.atan2(y, x);
    return ((theta * 180 / Math.PI) + 360) % 360;
};

const computeDestinationPoint = (lat, lon, bearing, distance) => {
    const R = 6371;
    const angularDistance = distance / R;
    const theta = bearing * Math.PI / 180;
    let phi1 = lat * Math.PI / 180;
    let lambda1 = lon * Math.PI / 180;

    const phi2 = Math.asin(
        Math.sin(phi1) * Math.cos(angularDistance) +
        Math.cos(phi1) * Math.sin(angularDistance) * Math.cos(theta)
    );

    const lambda2 = lambda1 + Math.atan2(
        Math.sin(theta) * Math.sin(angularDistance) * Math.cos(phi1),
        Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(phi2)
    );

    return {
        lat: phi2 * 180 / Math.PI,
        lon: ((lambda2 * 180 / Math.PI) + 540) % 360 - 180
    };
};

const createSegmentsQueue = (waypoints, v) => {
    const segments = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const distance = haversineDistance(start.lat, start.lon, end.lat, end.lon);
        const bearing = computeBearing(start.lat, start.lon, end.lat, end.lon);
        const totalTime = (distance / v) * 60; // 分钟
        segments.push({
            start: { lat: start.lat, lon: start.lon },
            end: { lat: end.lat, lon: end.lon },
            bearing: bearing,
            totalTime: totalTime,
            remainingTime: totalTime
        });
    }
    return segments;
};

export const splitFlightPath = (waypoints, v, startTime) => {
    if (waypoints.length < 2) return [];
    const startMinutes = colonTimeToMinutes(startTime);
    const segmentsQueue = createSegmentsQueue(waypoints, v);
    const totalFlightTime = segmentsQueue.reduce((sum, seg) => sum + seg.totalTime, 0);
    const segments = [];
    let currentPosition = { ...waypoints[0] };
    let elapsedMinutes = 0;

    while (elapsedMinutes < totalFlightTime) {
        const chunkDuration = Math.min(15, totalFlightTime - elapsedMinutes);
        const chunkEndElapsed = elapsedMinutes + chunkDuration;
        const currentSegmentPoints = [];
        // 添加起点（当前飞行位置）
        currentSegmentPoints.push({
            lat: currentPosition.lat,
            lon: currentPosition.lon,
            reach_time: formatTime(startMinutes + elapsedMinutes)
        });

        let chunkRemaining = chunkDuration;

        while (chunkRemaining > 0 && segmentsQueue.length > 0) {
            const currentSegment = segmentsQueue[0];
            const timeUsed = Math.min(currentSegment.remainingTime, chunkRemaining);

            if (currentSegment.remainingTime <= timeUsed) {
                // 消耗整个航段
                currentSegmentPoints.push({
                    lat: currentSegment.end.lat,
                    lon: currentSegment.end.lon,
                    reach_time: formatTime(startMinutes + elapsedMinutes + timeUsed)
                });
                chunkRemaining -= timeUsed;
                elapsedMinutes += timeUsed;
                segmentsQueue.shift();
                currentPosition = { ...currentSegment.end };
            } else {
                // 分割航段
                const distance = v * timeUsed / 60;
                const intermediatePoint = computeDestinationPoint(
                    currentSegment.start.lat,
                    currentSegment.start.lon,
                    currentSegment.bearing,
                    distance
                );

                currentSegmentPoints.push({
                    lat: intermediatePoint.lat,
                    lon: intermediatePoint.lon,
                    reach_time: formatTime(startMinutes + elapsedMinutes + timeUsed)
                });

                // 更新航段（不重新计算时间）
                segmentsQueue[0] = {
                    start: intermediatePoint,
                    end: currentSegment.end,
                    bearing: currentSegment.bearing,
                    totalTime: currentSegment.totalTime,
                    remainingTime: currentSegment.remainingTime - timeUsed
                };

                chunkRemaining -= timeUsed;
                elapsedMinutes += timeUsed;
                currentPosition = intermediatePoint;
            }
        }

        if (currentSegmentPoints.length > 1) {
            segments.push(currentSegmentPoints);
        }
    }

    return segments;
};

// 示例使用
const waypoints = [
    { lat: 24.833118438720703, lon: 113.4898452758789 },
    { lat: 25.8470458984375, lon: 116.2413558959961 },
    { lat: 21.48139762878418, lon: 119.02906036376953 }
];
const v = 600; // km/h
const startTime = "07:15";

const result = splitFlightPath(waypoints, v, startTime);
console.log(result);