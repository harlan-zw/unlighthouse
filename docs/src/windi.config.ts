import { defineConfig } from 'windicss/helpers'

function range(size: number, startAt = 1) {
  return Array.from(Array(size).keys()).map(i => i + startAt)
}

export default defineConfig({
  darkMode: 'class',
  attributify: true,
  plugins: [
    require('windicss/plugin/forms'),
  ],
  shortcuts: {
    'border-main': 'border-gray-400 border-opacity-30',
    'bg-main': 'bg-gray-400',
  },
  safelist: [
    ...['sm', 'md', 'lg', 'xl', '2xl'].map(s => [`${s}:flex`, `${s}:block`]).flat(),
    ...range(7).map(i => `col-span-${i}`),
    ...range(7).map(i => `md:col-span-${i}`),
    ...range(7).map(i => `lg:col-span-${i}`),
    ...range(7).map(i => `xl:col-span-${i}`),
    ...range(7).map(i => `grid-cols-${i}`),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
      colors: {
        teal: {
          50: '#f7f9f9',
          100: '#eaf1f5',
          200: '#d0e0e9',
          300: '#a2c0cc',
          400: '#6c99a8',
          500: '#517784',
          600: '#415c66',
          700: '#33454d',
          800: '#232e36',
          900: '#151c23',
        },
      },
    },
  },
})
