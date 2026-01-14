import { ofetch } from 'ofetch'
import type { UnlighthouseOptions, UnlighthouseReport, UnlighthouseProvider } from '../types'
import { extractInsights } from '../core/extract'

export interface DataForSeoOptions {
  username?: string
  password?: string
}

export const createDataForSeoProvider = (providerOptions: DataForSeoOptions): UnlighthouseProvider => {
  return async (url: string, options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    const username = providerOptions.username
    const password = providerOptions.password
    const strategy = options.emulatedFormFactor === 'desktop' ? 'desktop' : 'mobile'

    if (!username || !password) {
      throw new Error('DataForSEO username and password are required.')
    }
  
    try {
      const response = await ofetch('https://api.dataforseo.com/v3/on_page/pagespeed/live', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: [
          {
            url,
            strategy,
          }
        ]
      })
  
      const task = response.tasks?.[0]
  
      if (!task) {
         throw new Error('Invalid response from DataForSEO')
      }
  
      if (task.status_code !== 20000) {
         throw new Error(`DataForSEO task failed: ${task.status_message}`)
      }
  
      const result = task.result?.[0]
      
      const lhr = result?.lighthouse_result
  
      if (!lhr) {
        throw new Error('DataForSEO did not return a Lighthouse result')
      }
  
      return {
        url: lhr.finalUrl || lhr.requestedUrl || url,
        fetchTime: lhr.fetchTime,
        insights: extractInsights(lhr),
        raw: lhr,
        artifacts: lhr.artifacts,
      }
    }
    catch (e: any) {
      throw new Error(`DataForSEO scan failed: ${e.message || 'Unknown error'}`)
    }
  }
}
