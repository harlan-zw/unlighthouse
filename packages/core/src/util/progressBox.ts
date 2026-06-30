import { clearLine, cursorTo } from 'node:readline'

export interface ProgressData {
  currentTask?: string
  completedTasks: number
  totalTasks: number
  averageScore?: number
  timeElapsed: number
  timeRemaining?: number
}

export interface ProgressBox {
  update: (progressData: ProgressData) => void
  clear: () => void
}

/**
 * Create a progress box that displays scanning progress using Clack spinner
 */
export function createProgressBox(): ProgressBox {
  let active = false
  let lastMessage = ''

  function writeMessage(message: string) {
    active = true
    lastMessage = message
    if (process.stderr.isTTY) {
      clearLine(process.stderr, 0)
      cursorTo(process.stderr, 0)
      process.stderr.write(message)
    }
  }

  const update = (progressData: ProgressData) => {
    if (progressData.totalTasks > 0) {
      const percentage = Math.round((progressData.completedTasks / progressData.totalTasks) * 100)

      // Format additional info
      const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000)
        const seconds = Math.floor((ms % 60000) / 1000)
        if (minutes > 60) {
          const hours = Math.floor(minutes / 60)
          const remainingMins = minutes % 60
          return `${hours}h ${remainingMins}m`
        }
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
      }

      const formatScore = (score?: number) => {
        if (score === undefined)
          return 'calculating...'
        const rounded = Math.round(score * 100)
        return `${rounded}/100`
      }

      // Build progress message
      let message = `${percentage}% (${progressData.completedTasks}/${progressData.totalTasks})`

      if (progressData.averageScore !== undefined) {
        message += ` • Score: ${formatScore(progressData.averageScore)}`
      }

      message += ` • ${formatTime(progressData.timeElapsed)}`

      if (progressData.timeRemaining && progressData.timeRemaining > 0) {
        message += ` • ETA: ${formatTime(progressData.timeRemaining)}`
      }

      if (progressData.currentTask) {
        const currentTask = progressData.currentTask.length > 50
          ? `${progressData.currentTask.substring(0, 47)}...`
          : progressData.currentTask
        message += ` • ${currentTask}`
      }

      writeMessage(message)
    }
  }

  const clear = () => {
    if (active) {
      if (process.stderr.isTTY) {
        clearLine(process.stderr, 0)
        cursorTo(process.stderr, 0)
      }
      if (lastMessage || process.stderr.isTTY)
        process.stderr.write('Scan completed!\n')
      active = false
      lastMessage = ''
    }
  }

  return { update, clear }
}
