import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Unlighthouse writes this file into every output folder it creates. Only a folder that holds it may be cleared.
 */
export const OutputMarkerFile = '.unlighthouse-output'

export type OutputDirState
  = | { _tag: 'Missing' }
    | { _tag: 'Empty' }
    | { _tag: 'Owned' }
    | { _tag: 'Foreign', entries: string[] }

/**
 * True when `dir` sits strictly inside `ancestor`, so clearing `dir` can never touch `ancestor` itself.
 */
function isStrictDescendant(dir: string, ancestor: string): boolean {
  const rel = relative(resolve(ancestor), resolve(dir))
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Decide who owns an output folder from its path and its top level entries (`null` when it does not exist).
 *
 * A folder counts as owned when it holds the marker file. Folders from releases before the marker file sit inside the
 * default `.unlighthouse` folder of the site root, so those count as owned too when that root is known. A path that
 * merely contains a `.unlighthouse` segment does not, a project may live under such a path.
 */
export function classifyOutputDir(dir: string, entries: string[] | null, options: { root?: string } = {}): OutputDirState {
  if (entries === null)
    return { _tag: 'Missing' }
  if (entries.length === 0)
    return { _tag: 'Empty' }
  if (entries.includes(OutputMarkerFile))
    return { _tag: 'Owned' }
  if (options.root && isStrictDescendant(dir, join(resolve(options.root), '.unlighthouse')))
    return { _tag: 'Owned' }
  return { _tag: 'Foreign', entries }
}

async function readEntries(dir: string): Promise<string[] | null> {
  return readdir(dir).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT')
      return null
    throw e
  })
}

/**
 * Create the output folder and mark it as owned by unlighthouse.
 *
 * With `clear`, remove the previous contents first. A folder that unlighthouse did not create is never cleared: the
 * call throws instead, so an `outputPath` such as `.` cannot delete a project. Pass the site `root` to keep clearing
 * the unmarked legacy folders that sit inside the default `.unlighthouse` folder of the root.
 */
export async function prepareOutputDir(dir: string, options: { clear: boolean, root?: string }): Promise<OutputDirState> {
  const state = classifyOutputDir(dir, await readEntries(dir), { root: options.root })
  if (state._tag === 'Foreign') {
    if (options.clear) {
      throw new Error(
        `Refusing to clear \`${dir}\` because it is not an unlighthouse output folder. `
        + `It holds files that unlighthouse did not create: ${state.entries.slice(0, 5).join(', ')}${state.entries.length > 5 ? ', ...' : ''}. `
        + 'Set `outputPath` to a new or empty folder, such as `.unlighthouse`.',
      )
    }
    // keep the user's files and do not claim the folder
    return state
  }
  if (state._tag === 'Owned' && options.clear)
    await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, OutputMarkerFile), 'This folder was created by unlighthouse. Unlighthouse may delete it.\n')
  return state
}
