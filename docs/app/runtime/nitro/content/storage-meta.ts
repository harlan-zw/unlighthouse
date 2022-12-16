import type { ContentTransformer } from '@nuxt/content/dist/runtime/types'
import { prefixStorage } from 'unstorage'
import { useStorage } from '#imports'
import type { ParsedContent } from '~/types'

const contentStorage = prefixStorage(useStorage(), 'content:source')

export async function StorageMeta(content: ParsedContent) {
  content.storageMeta = { ...(await contentStorage.getMeta(content._id)) }
  return content
}
