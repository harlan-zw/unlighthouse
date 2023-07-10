/*
 ** Windi CSS Configuration File
 **
 ** Docs: https://next.windicss.org/guide/configuration.html
 */
import { defineConfig } from 'vite-plugin-windicss'
import defaultTheme from 'windicss/defaultTheme'

export default defineConfig({
  plugins: [
    require('windicss/plugin/typography'),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        blue: {
          500: '#3d7dca',
          700: '#003a70',
        },
        yellow: {
          500: '#ffcb05',
        },
      },
    },
  },
})
