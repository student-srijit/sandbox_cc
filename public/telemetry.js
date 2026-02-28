/**
 * Behavioral Telemetry & Bot Fingerprinting Agent
 * 
 * Injected as a silent `<script defer>` on every page load.
 * Analyzes deep client-side signals that headless browsers and automated
 * scripts cannot perfectly simulate (Mouse entropy, Canvas hashing, 
 * execution speeds, native API completeness).
 * 
 * Posts signals back to /api/telemetry after 2.5 seconds to combine
 * with the Edge Server Score and determine final routing.
 */

; (function () {
    'use strict';

    // State
    let mouseEvents = 0;
    let mousePoints = [];
    let timeToFirstInteraction = -1;
    const startTime = performance.now();

    /**
     * Generates a fast standard hash
     */
    function hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(16);
    }

    /**
     * Tracks mouse entropy points to calculate trajectory linearity
     */
    function trackMouse(e) {
        if (timeToFirstInteraction === -1) {
            timeToFirstInteraction = performance.now() - startTime;
        }

        mouseEvents++;

        // Cap tracking to save memory, we only need ~50 points for a good sample
        if (mousePoints.length < 50) {
            mousePoints.push({
                x: e.clientX,
                y: e.clientY,
                t: performance.now()
            });
        }
    }

    /**
     * Listen to generic interaction events for timing checks
     */
    function trackInteraction() {
        if (timeToFirstInteraction === -1) {
            timeToFirstInteraction = performance.now() - startTime;
        }
    }

    document.addEventListener('mousemove', trackMouse, { passive: true });
    document.addEventListener('click', trackInteraction, { passive: true });
    document.addEventListener('keydown', trackInteraction, { passive: true });
    document.addEventListener('touchstart', trackInteraction, { passive: true });

    /**
     * Analyzes Mouse Events mapping to distinguish humans from bots
     */
    function calculateMouseEntropy() {
        if (mousePoints.length < 3) {
            return { linearity: 0, speedVariance: 0 };
        }

        let dxTotal = 0, dyTotal = 0, distanceTotal = 0;
        const speeds = [];

        for (let i = 1; i < mousePoints.length; i++) {
            const p1 = mousePoints[i - 1];
            const p2 = mousePoints[i];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dt = p2.t - p1.t;

            const dist = Math.sqrt(dx * dx + dy * dy);

            dxTotal += Math.abs(dx);
            dyTotal += Math.abs(dy);
            distanceTotal += dist;

            if (dt > 0) speeds.push(dist / dt); // pixels per ms
        }

        // Linearity: If distanceTotal === (dxTotal + dyTotal), it's manhattan straight
        // Bounding box diagonal vs actual path distance
        const startObj = mousePoints[0];
        const endObj = mousePoints[mousePoints.length - 1];
        const absoluteDist = Math.sqrt(
            Math.pow(endObj.x - startObj.x, 2) + Math.pow(endObj.y - startObj.y, 2)
        );

        const linearity = distanceTotal > 0 ? (absoluteDist / distanceTotal) : 0;

        // Speed variance
        const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
        const speedVariance = speeds.length > 0
            ? speeds.reduce((a, v) => a + Math.abs(v - avgSpeed), 0) / speeds.length
            : 0;

        return { linearity, speedVariance };
    }

    /**
     * Canvas hardware fingerprinting
     * Headless browsers often render canvas completely blank or with shared mock GPU signatures
     */
    function getCanvasHash() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 30;
            const ctx = canvas.getContext('2d');
            if (!ctx) return 'blank';

            // Text with styling
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(5, 5, 20, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Bhool Bhulaiyaa, 0xyz', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Bhool Bhulaiyaa, 0xyz', 4, 17);

            const dataURL = canvas.toDataURL();
            if (dataURL.length < 50) return 'blank'; // Headless often returns tiny datablanks
            return hashString(dataURL);
        } catch (e) {
            return 'blank';
        }
    }

    /**
     * Gathers all behavioral and environmental signals to POST
     */
    function collectAndSendTelemetry() {
        // Stop recording
        document.removeEventListener('mousemove', trackMouse);
        document.removeEventListener('click', trackInteraction);
        document.removeEventListener('keydown', trackInteraction);
        document.removeEventListener('touchstart', trackInteraction);

        const entropy = calculateMouseEntropy();
        const canvasHash = getCanvasHash();

        const payload = {
            mouseEventsCount: mouseEvents,
            mousePathLinearity: entropy.linearity,
            mouseSpeedVariance: entropy.speedVariance,

            webdriver: !!navigator.webdriver,
            hasChromeGlobal: !!window.chrome,
            isChromeUa: navigator.userAgent.includes('Chrome'),
            pluginsCount: navigator.plugins?.length || 0,
            languagesCount: navigator.languages?.length || 0,
            screenWidth: window.screen?.width || 0,
            screenHeight: window.screen?.height || 0,

            canvasHash: canvasHash,
            timeToFirstInteraction: timeToFirstInteraction
        };

        // Use sendBeacon if available to ensure it sends even if page is closing/navigating
        if (navigator.sendBeacon) {
            // sendBeacon requires FormData or Blob for arbitrary JSON cleanly, but we can do a simple fetch 
            // with keepalive as modern best practice
        }

        fetch('/api/telemetry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true // Lives beyond page-unload
        }).then(res => res.json()).then(data => {
            // Let the frontend know we finished calculating trust score
            window.dispatchEvent(new CustomEvent('bb-telemetry-ready', { detail: data }));
        }).catch(err => {
            console.error('Telemetry upload failed', err);
        });
    }

    // Execute after 2.5 seconds. Gives user time to move mouse, 
    // without delaying the application flow endlessly.
    setTimeout(collectAndSendTelemetry, 2500);

})();
