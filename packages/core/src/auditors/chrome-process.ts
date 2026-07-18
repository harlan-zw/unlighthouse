type KillProcess = (pid: number, signal?: NodeJS.Signals | number) => boolean

/**
 * chrome-launcher's kill() can resolve before the browser process is actually
 * gone. Probe the exact PID it launched and force-kill only that process when
 * it is still alive, avoiding broad process-name matching.
 */
export function killChromePidIfAlive(pid: number, kill: KillProcess = process.kill): boolean {
  try {
    kill(pid, 0)
    kill(pid, 'SIGKILL')
    return true
  }
  catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ESRCH')
      return false
    throw err
  }
}
