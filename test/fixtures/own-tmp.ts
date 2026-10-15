import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface OwnTmp {
  dir: string
  chromeProcesses: (prefix: string) => number
  restore: () => void
}

// Other Unlighthouse runs on the machine use the same temp prefixes, so this run's workers get a TMPDIR of their own and only processes under it are counted.
export function ownTmp(prefix: string): OwnTmp {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  const previous = process.env['TMPDIR']
  process.env['TMPDIR'] = dir
  return {
    dir,
    chromeProcesses(chromePrefix) {
      const marker = `--user-data-dir=${join(dir, chromePrefix)}`
      return new TextDecoder().decode(Bun.spawnSync(['ps', '-eo', 'args=']).stdout).split('\n')
        .filter(line => line.includes(marker))
        .length
    },
    restore() {
      if (previous === undefined)
        delete process.env['TMPDIR']
      else
        process.env['TMPDIR'] = previous
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
