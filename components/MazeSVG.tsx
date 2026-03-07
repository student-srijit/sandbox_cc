'use client'

import { forwardRef } from 'react'

/**
 * Triangle sentinels that oscillate inward/outward with offset phases.
 */
function SentinelTriangle({ points, baseTransform, phase, duration }: {
    points: string
    baseTransform: string
    phase: number
    duration: number
}) {
    return (
        <polygon
            points={points}
            fill="rgba(0,255,209,0.25)"
            stroke="#00FFD1"
            strokeWidth="1"
            style={{
                transformOrigin: '300px 300px',
                animation: `sentinel-breathe ${duration}s ease-in-out infinite`,
                animationDelay: `${phase}s`,
                transform: baseTransform,
            }}
        >
            <animate attributeName="opacity" values="0.6;0.9;0.6" dur={`${duration}s`} repeatCount="indefinite" />
        </polygon>
    )
}

const MazeSVG = forwardRef<SVGSVGElement>((_, ref) => {
    return (
        <svg
            ref={ref}
            viewBox="0 0 600 600"
            xmlns="http://www.w3.org/2000/svg"
            className="maze-svg"
            style={{
                width: 'min(68vw, 660px)',
                height: 'min(68vw, 660px)',
            }}
            aria-hidden="true"
        >
            <defs>
                <radialGradient id="maze-fade-local" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(10,10,20,0)" />
                    <stop offset="80%" stopColor="rgba(10,10,20,0.5)" />
                    <stop offset="100%" stopColor="rgba(10,10,20,0.96)" />
                </radialGradient>
            </defs>

            {/* Decorative outer rings */}
            <circle cx="300" cy="300" r="286" fill="none" stroke="rgba(61,0,184,0.2)" strokeWidth="0.5" />
            <circle cx="300" cy="300" r="278" fill="none" stroke="rgba(61,0,184,0.12)" strokeWidth="0.5" />

            {/* RING 1: r=220 */}
            <path className="maze-wall" d="M520,300 A220,220 0 0,0 300,80" />
            <path className="maze-wall" d="M300,80  A220,220 0 0,0 80,300" />
            <path className="maze-wall" d="M80,300  A220,220 0 0,0 300,520" />
            <path className="maze-wall" d="M300,520 A220,220 0 0,0 520,300" strokeDasharray="8 4" strokeOpacity="0.3" />

            {/* RING 2: r=170 */}
            <path className="maze-wall" d="M470,300 A170,170 0 0,0 300,130" />
            <path className="maze-wall" d="M300,130 A170,170 0 0,0 130,300" />
            <path className="maze-wall" d="M130,300 A170,170 0 1,0 430,430" />

            {/* RING 3: r=120 */}
            <path className="maze-wall-bright" d="M420,300 A120,120 0 0,0 300,180" />
            <path className="maze-wall-bright" d="M300,180 A120,120 0 0,0 180,300" />
            <path className="maze-wall-bright" d="M180,300 A120,120 0 0,0 300,420" />
            <path className="maze-wall-bright" d="M300,420 A120,120 0 0,0 420,300" strokeOpacity="0.35" strokeDasharray="6 4" />

            {/* RING 4: r=75 */}
            <path className="maze-wall-bright" d="M375,300 A75,75 0 0,0 300,225" />
            <path className="maze-wall-bright" d="M300,225 A75,75 0 1,0 374,301" />

            {/* Radial spokes */}
            <line className="maze-wall" x1="300" y1="80" x2="300" y2="130" />
            <line className="maze-wall" x1="520" y1="300" x2="470" y2="300" />
            <line className="maze-wall" x1="300" y1="520" x2="300" y2="470" />
            <line className="maze-wall" x1="80" y1="300" x2="130" y2="300" />
            <line className="maze-wall" x1="456" y1="144" x2="420" y2="180" />
            <line className="maze-wall" x1="144" y1="144" x2="180" y2="180" />
            <line className="maze-wall" x1="144" y1="456" x2="180" y2="420" />
            <line className="maze-wall" x1="456" y1="456" x2="420" y2="420" />
            <line className="maze-wall" x1="404" y1="196" x2="375" y2="225" />
            <line className="maze-wall" x1="196" y1="196" x2="225" y2="225" />
            <line className="maze-wall" x1="196" y1="404" x2="225" y2="375" />
            <line className="maze-wall" x1="404" y1="404" x2="375" y2="375" />

            {/* DATA STREAMS */}
            <path className="stream-path" d="M300,80  A220,220 0 0,1 520,300" />
            <path className="stream-path-slow" d="M520,300  A220,220 0 0,1 300,520" />
            <path className="stream-path-rev" d="M300,520  A220,220 0 1,1 300,80" strokeOpacity="0.3" />
            <path className="stream-path-slow" d="M130,300 A170,170 0 0,1 300,130" />
            <path className="stream-path-rev" d="M300,130 A170,170 0 0,1 470,300" />
            <path className="stream-path-fast" d="M300,180 A120,120 0 0,1 420,300" />
            <path className="stream-path-fast" d="M300,420 A120,120 0 0,0 180,300" />
            <path className="stream-path" d="M300,225 A75,75 0 0,1 375,300" />
            <path className="stream-path-rev" d="M375,300 A75,75 0 0,1 300,375" />
            <line className="stream-path" x1="300" y1="80" x2="300" y2="180" />
            <line className="stream-path-slow" x1="456" y1="144" x2="375" y2="225" />
            <line className="stream-path-fast" x1="144" y1="456" x2="225" y2="375" />
            <line className="stream-path-rev" x1="520" y1="300" x2="420" y2="300" />
            <line className="stream-path" x1="80" y1="300" x2="180" y2="300" />

            {/* Vignette */}
            <circle cx="300" cy="300" r="295" fill="url(#maze-fade-local)" opacity="0.85" />

            {/* SENTINEL TRIANGLES — breathing/oscillating */}
            <g filter="url(#glow)">
                <SentinelTriangle
                    points="300,52 318,82 282,82"
                    baseTransform="translateY(0)"
                    phase={0}
                    duration={3.2}
                />
                <SentinelTriangle
                    points="548,300 518,282 518,318"
                    baseTransform="translateX(0)"
                    phase={0.8}
                    duration={3.8}
                />
                <SentinelTriangle
                    points="52,300 82,318 82,282"
                    baseTransform="translateX(0)"
                    phase={1.6}
                    duration={3.5}
                />
                <SentinelTriangle
                    points="300,548 282,518 318,518"
                    baseTransform="translateY(0)"
                    phase={2.4}
                    duration={4.0}
                />
            </g>

            {/* Animated intersection dots */}
            <g opacity="0.6">
                <circle cx="300" cy="130" r="2.5" fill="#00FFD1">
                    <animate attributeName="opacity" values="1;0.15;1" dur="2.1s" repeatCount="indefinite" />
                    <animate attributeName="r" values="2.5;4;2.5" dur="2.1s" repeatCount="indefinite" />
                </circle>
                <circle cx="470" cy="300" r="2.5" fill="#7B2FFF">
                    <animate attributeName="opacity" values="0.15;1;0.15" dur="1.7s" repeatCount="indefinite" />
                </circle>
                <circle cx="300" cy="470" r="2.5" fill="#00FFD1">
                    <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" repeatCount="indefinite" />
                </circle>
                <circle cx="130" cy="300" r="2.5" fill="#7B2FFF">
                    <animate attributeName="opacity" values="0.4;1;0.4" dur="1.9s" repeatCount="indefinite" />
                </circle>
                <circle cx="420" cy="180" r="2" fill="#00FFD1">
                    <animate attributeName="opacity" values="0.5;0.05;0.5" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="180" cy="180" r="2" fill="#7B2FFF">
                    <animate attributeName="opacity" values="0.05;0.5;0.05" dur="2.3s" repeatCount="indefinite" />
                </circle>
                <circle cx="180" cy="420" r="2" fill="#00FFD1">
                    <animate attributeName="opacity" values="0.5;0.15;0.5" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx="420" cy="420" r="2" fill="#7B2FFF">
                    <animate attributeName="opacity" values="0.2;0.7;0.2" dur="2.7s" repeatCount="indefinite" />
                </circle>
                {/* Center pulse */}
                <circle cx="300" cy="300" r="3" fill="rgba(0,255,209,0.3)">
                    <animate attributeName="r" values="3;8;3" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0.05;0.5" dur="3s" repeatCount="indefinite" />
                </circle>
            </g>
        </svg>
    )
})

MazeSVG.displayName = 'MazeSVG'
export default MazeSVG
