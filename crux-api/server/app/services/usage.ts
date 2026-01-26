// Track daily API call count
let dailyCount = 0
let lastResetDate = new Date().toDateString()

export function incrementUsage() {
  const today = new Date().toDateString()
  if (today !== lastResetDate) {
    dailyCount = 0
    lastResetDate = today
  }
  dailyCount++
}

export function getUsage() {
  const today = new Date().toDateString()
  if (today !== lastResetDate) {
    dailyCount = 0
    lastResetDate = today
  }
  return { daily: dailyCount, limit: 15000 }
}
