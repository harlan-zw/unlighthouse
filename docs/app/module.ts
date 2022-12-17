import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'

export default defineNuxtModule({
  meta: {
    name: 'docs',
    version: '3.0.0',
    compatibility: {
      nuxt: '^3.0.0',
      bridge: false,
    },
    configKey: 'docs',
  },
  setup(_, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // nothing yet
    nuxt.hooks.hook('nitro:config', (nitroConfig) => {
      nitroConfig.externals = defu(typeof nitroConfig.externals === 'object' ? nitroConfig.externals : {}, {
        inline: [
          // Inline module runtime in Nitro bundle
          resolve('./runtime/nitro'),
        ],
      })

      nitroConfig.alias['#docs/transformer'] = resolve('./runtime/nitro/content-post-process.ts')
      nitroConfig.plugins = nitroConfig.plugins || []
      nitroConfig.plugins.push('#docs/transformer')
    })
  },
})
