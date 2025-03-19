

// utils/animation.js
export const fadeOverlay = (oldLayer, newLayer, fadeDuration = 500) => {
    let start = null;
    const animate = (timestamp) => {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const ratio = Math.min(progress / fadeDuration, 1);

        oldLayer.setOpacity(0.5 * (1 - ratio));
        newLayer.setOpacity(0.5 * ratio);

        if (ratio < 1) {
            requestAnimationFrame(animate);
        } else {
            oldLayer.remove();
        }
    };
    requestAnimationFrame(animate);
};