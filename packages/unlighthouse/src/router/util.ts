import { basename } from 'path'
import { $URL } from 'ufo'
import { NormalisedRoute, MockRouter } from '@shared'
import { hashPathName } from '../core'

export const normaliseRoute = (url: string, router: MockRouter): NormalisedRoute|false => {
  const $url = new $URL(url)
  const path = $url.pathname
  const definition = router.match(path)
  if (!definition)
    return false

  const dynamic = definition.path !== path
  return {
    id: hashPathName(path),
    url,
    $url,
    path,
    definition: {
      ...definition,
      componentBaseName: basename(definition.component),
    },
    dynamic,
    static: !dynamic,
  }
}
