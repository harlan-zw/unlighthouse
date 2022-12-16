
import { defineTheme } from 'pinceau'

export default defineTheme({
  color: {
    primary: {
      50: { value: '#ecfdf5' },
      100: { value: '#d1fae5' },
      200: { value: '#a7f3d0' },
      300: { value: '#6ee7b7' },
      400: { value: '#34d399' },
      500: { value: '#10b981' },
      600: { value: '#059669' },
      700: { value: '#047857' },
      800: { value: '#065f46' },
      900: { value: '#064e3b' },
    },
  },
  font: {
    sans: {
      value: 'Inter, sans-serif',
    },
    primary: {
      value: 'Inter, sans-serif',
    },
    code: {
      value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
    },
  },
  page: {
    height: {
      value: 'calc(100vh - calc(calc({header.height} + {footer.height})))',
    },
    maxWidth: {
      value: '90rem',
    },
  },
  header: {
    height: {
      value: '4rem',
    },
  },
  footer: {
    height: {
      value: '4rem',
    },
  },
})
