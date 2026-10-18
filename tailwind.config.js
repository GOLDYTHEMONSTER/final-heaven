/** @type {import('tailwindcss').Config} */

// Colours resolve to the CSS variables in app/globals.css, so the palette lives in one place.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'final-black': token('bg'),
        'final-gray': token('surface'),
        'final-dark-gray': token('surface-raised'),
        'final-light-gray': token('line'),
        'final-off-white': token('fg'),
        'final-muted': token('fg-muted'),
        // Primary actions are off-white on near-black. Ember is the single accent,
        // reserved for state: new, members-only, cart count, focus.
        'final-accent': token('fg'),
        'final-accent-dark': token('fg-dim'),
        'final-ember': token('ember'),
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        urban: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
      },
      // Radius rule: controls and surfaces use a tight 6-12px scale; full rounding is
      // only for circular icon buttons and count badges.
      borderRadius: {
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '12px',
        '3xl': '12px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-glass': 'linear-gradient(135deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02))',
      },
    },
  },
  plugins: [],
}
