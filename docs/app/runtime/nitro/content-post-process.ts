import type { NitroAppPlugin } from 'nitropack'
import { StorageMeta } from './content/storage-meta'
import { MetaNormaliser } from './content/meta-normaliser'

export const ContentPostProcess: NitroAppPlugin = (nitroApp) => {
  nitroApp.hooks.hook('content:file:afterParse', async (content) => {
    if (content._extension === 'md') {
      const plugins = [
        StorageMeta,
        MetaNormaliser,
      ]
      for (const plugin of plugins)
        content = await plugin(content)
    }
  })
}

export default ContentPostProcess
