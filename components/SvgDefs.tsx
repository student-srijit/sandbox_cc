/** Inlined SVG <defs> used across all SVG components via url() references */
export default function SvgDefs() {
    return (
        <svg width="0" height="0" className="absolute overflow-hidden" aria-hidden="true">
            <defs>
                {/* Animated gradient stroke for hex logo letters */}
                <linearGradient id="grad-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00FFD1">
                        <animate attributeName="stop-color" values="#00FFD1;#7B2FFF;#00FFD1" dur="4s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#7B2FFF">
                        <animate attributeName="stop-color" values="#7B2FFF;#00FFD1;#7B2FFF" dur="4s" repeatCount="indefinite" />
                    </stop>
                </linearGradient>

                {/* Cyan→Violet gradient for maze data streams */}
                <linearGradient id="grad-stream" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00FFD1" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#7B2FFF" stopOpacity="0.9" />
                </linearGradient>

                {/* Alternate (for fast streams) */}
                <linearGradient id="grad-stream-alt" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#00FFD1" stopOpacity="1" />
                    <stop offset="100%" stopColor="#3D00B8" stopOpacity="0.8" />
                </linearGradient>

                {/* Reversed stream */}
                <linearGradient id="grad-stream-rev" x1="100%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#7B2FFF" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#00FFD1" stopOpacity="0.6" />
                </linearGradient>

                {/* Shield ring gradient */}
                <linearGradient id="shield-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00FFD1">
                        <animate attributeName="stop-color" values="#00FFD1;#7B2FFF;#00FFD1" dur="3s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#7B2FFF">
                        <animate attributeName="stop-color" values="#7B2FFF;#00FFD1;#7B2FFF" dur="3s" repeatCount="indefinite" />
                    </stop>
                </linearGradient>

                {/* Radial fade for maze vignette */}
                <radialGradient id="maze-fade" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(10,10,20,0)" />
                    <stop offset="82%" stopColor="rgba(10,10,20,0.55)" />
                    <stop offset="100%" stopColor="rgba(10,10,20,0.97)" />
                </radialGradient>

                {/* Glow filter for maze markers */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {/* Strong glow for center button area */}
                <filter id="strong-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
        </svg>
    )
}
