import fs from 'fs'
import { randomBytes } from 'crypto'
import highwayhash from 'highwayhash'
import { ModuleContainer, requireModule } from '@nuxt/kit'

export default function(this: ModuleContainer) {
  const templateCompiler = requireModule('vue-template-compiler')
  return (componentPath: string) => {
    const pageFile = fs.readFileSync(componentPath)
    const hashAsHexString = highwayhash.asHexString(randomBytes(32), pageFile)
    let compiled = templateCompiler.parseComponent(pageFile.toString('utf-8'))
    fs.writeFileSync(`${this.options.outputPath}/${hashAsHexString}.js`, compiled.script.content)
    compiled = requireModule(`${this.options.outputPath}/${hashAsHexString}.js`)
    return {
      layout: compiled.layout || 'default',
      ...compiled,
    }
  }
}
