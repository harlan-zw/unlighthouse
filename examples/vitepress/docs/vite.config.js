import { defineConfig } from 'vite'
import Unlighthouse from '@unlighthouse/vite'

export default defineConfig({

  plugins: [
    Unlighthouse({
      debug: true,
      discovery: {
        pagesDir: '',
      },
    }),
  ],
})
