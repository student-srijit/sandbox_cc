import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-space)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        space: ['var(--font-space)', 'sans-serif'],
      },
      colors: {
        bg: '#0A0A0F',
        cyan: '#00FFD1',
        violet: '#7B2FFF',
        indigo: '#3D00B8',
        danger: '#FF4D00',
      },
      backdropBlur: {
        xs: '2px',
      },
      gridTemplateRows: {
        app: '64px 1fr 44px',
      },
      gridTemplateColumns: {
        app: '1fr 290px',
      },
      animation: {
        'spin-slow': 'spin-slow 8s linear infinite',
        'blob-drift': 'blob-drift 22s ease-in-out infinite alternate',
        'blink-dot': 'blink-dot 0.9s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite',
        'dash-flow': 'dash-flow 2s linear infinite',
        'border-spin': 'border-spin 3s linear infinite',
        'float': 'float-up-down 3s ease-in-out infinite',
        'maze-breathe': 'maze-breathe 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
