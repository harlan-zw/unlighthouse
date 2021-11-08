import { resolve } from 'path'
import fs from 'fs-extra'
import { UserOptions } from 'vite-plugin-windicss'
import { runAnalysis } from './analysis'

export interface BuildOptions {
    root: string
    outDir: string
    demo?: boolean
    windiOptions?: UserOptions
}
// @todo

export async function generateBuild(options: BuildOptions) {
    const { result } = await runAnalysis(
        {
            ...options.windiOptions,
            root: options.root,
        },
        { interpretUtilities: true },
    )

    const headScript = `
window.__windicss_analysis_static = true
window.__windicss_analysis_static_host = true
window.__windicss_analysis_demo = ${JSON.stringify(options.demo || false)}
window.__windicss_analysis_report = ${JSON.stringify(result)}
`

    await fs.ensureDir(options.outDir)
    await fs.copy(resolve(__dirname, '../dist/app'), options.outDir)
    let indexHTML = await fs.readFile(resolve(__dirname, '../dist/app/index.html'), 'utf-8')
    indexHTML = indexHTML.replace('<head>', `<head><script>${headScript}</script>`)
    await fs.writeFile(resolve(options.outDir, 'index.html'), indexHTML, 'utf-8')
}
