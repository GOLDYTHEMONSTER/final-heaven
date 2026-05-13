/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'final-black': '#000000',
        'final-gray': '#1a1a1a',
        'final-dark-gray': '#2a2a2a',
        'final-light-gray': '#3a3a3a',
        'final-off-white': '#f5f5f5',
        'final-cream': '#f8f6f0',
        'final-dark-cream': '#e8e4d8',
        'final-accent': '#8b8b8b',
        'final-accent-dark': '#6b6b6b',
        'final-neon': '#8b8b8b',
        'final-neon-pink': '#a8a8a8',
        'final-neon-blue': '#7a7a7a',
      },
      fontFamily: {
        'urban': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #8b8b8b, 0 0 10px #8b8b8b, 0 0 15px #8b8b8b' },
          '100%': { boxShadow: '0 0 10px #8b8b8b, 0 0 20px #8b8b8b, 0 0 30px #8b8b8b' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-transparent': 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.8))',
        'gradient-glass': 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
      },
    },
  },
  plugins: [],
} 