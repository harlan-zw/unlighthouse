import { defineConfig } from 'windicss/helpers'

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
  theme: {
    extend: {
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
