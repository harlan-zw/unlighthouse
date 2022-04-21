import 'windi.css'
import DefaultTheme from 'vitepress/theme'
import '../../main.css'
import * as Panelbear from '@panelbear/panelbear-js'

const theme = DefaultTheme

theme.enhanceApp = ({ app }) => {
  // if we're in a server context then we exit out here
  if (typeof document === 'undefined' || typeof window === 'undefined')
    return

  app.provide('analytics', Panelbear)
  Panelbear.load('JHwFJG78euO', {
    spaMode: 'history',
    autoTrack: true,
    debug: import.meta.env.DEV,
  })
}

export default DefaultTheme
