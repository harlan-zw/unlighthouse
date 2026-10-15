import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface ProcessLock {
  acquire(): boolean
  release(): void
  owner(): number | null
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function createProcessLock(path: string): ProcessLock {
  const id = `${process.pid}:${crypto.randomUUID()}`
  let held = false

  function read(): string | null {
    try {
      return readFileSync(path, 'utf8').trim()
    }
    catch {
      return null
    }
  }

  function owner(): number | null {
    const pid = Number.parseInt(read() ?? '', 10)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  }

  const releaseOnExit = () => {
    if (held && read() === id)
      rmSync(path, { force: true })
  }

  function acquire(): boolean {
    if (held)
      return true
    mkdirSync(dirname(path), { recursive: true })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        writeFileSync(path, id, { flag: 'wx' })
        held = true
        process.once('exit', releaseOnExit)
        return true
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
          throw error
      }
      const content = read()
      if (content === null)
        continue
      const pid = owner()
      if (pid !== null && alive(pid))
        return false
      rmSync(path, { force: true })
    }
    return false
  }

  function release(): void {
    if (!held)
      return
    held = false
    process.off('exit', releaseOnExit)
    if (read() === id)
      rmSync(path, { force: true })
  }

  return { acquire, release, owner }
}
