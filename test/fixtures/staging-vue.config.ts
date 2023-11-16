export default {
  site: 'https://vuejs.org/',
  debug: true,
  hooks: {
    'puppeteer:before-goto': async (page) => {
      const deleteSelector = '.VPNav'
      page.waitForNavigation().then(async () => {
        await page.waitForTimeout(1000)
        await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel)
          for (let i = 0; i < elements.length; i++)
            elements[i].parentNode.removeChild(elements[i])
        }, deleteSelector)
      })
    },
  },
  scanner: {
    device: 'mobile',
    throttle: true,
    samples: 3,
    customSampling: {
      '/guide/(.*?)': {
        name: 'guide',
      },
    },
  },
}
