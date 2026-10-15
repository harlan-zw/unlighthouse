import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const KEY = 'unlighthouse:theme'

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  }
  catch {
    return 'system'
  }
}

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system')
    delete root.dataset['theme']
  else
    root.dataset['theme'] = theme
}

function saveTheme(theme: ThemePreference): void {
  try {
    if (theme === 'system')
      localStorage.removeItem(KEY)
    else
      localStorage.setItem(KEY, theme)
  }
  catch {}
}

export function useTheme(): [ThemePreference, (theme: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(readTheme)
  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])
  return [theme, setTheme]
}
