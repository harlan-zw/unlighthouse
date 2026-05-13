export interface LighthouseScanOptions {
  url: string
  categories?: string[]
  formFactor?: 'mobile' | 'desktop'
  throttling?: 'mobile3G' | 'mobile4G' | 'none'
  useCache?: boolean
}

export interface LighthouseScanResult {
  url: string
  fetchTime: string
  categories: {
    [key: string]: {
      id: string
      title: string
      score: number | null
    }
  }
  audits: {
    [key: string]: any
  }
  cached?: boolean
}
