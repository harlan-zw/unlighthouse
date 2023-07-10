# Configuring Puppeteer

Unlighthouse uses [puppeteer](https://github.com/puppeteer/puppeteer) to run the lighthouse module.

### Puppeteer configuration

You can configure puppeteer with the `puppeteerOptions` key, which will be passed to the puppeteer launch constructor.

See [puppeteer-launch-options](https://pptr.dev/#?product=Puppeteer&version=v13.0.1&show=api-puppeteerlaunchoptions) for more information.

For example, you could run without a headless browser. Although not recommended.
```ts
export default {
  puppeteerOptions: {
    headless: false,
  }
}
```

## Hook into puppeteer navigation

There may be instances where you need to hook into how the puppeteer instance is handling your pages.

A hook is provided to do this.

```ts unlighthouse.config.ts
let token

export default {
  hooks: {
    'puppeteer:before-goto': async (page) => {
      if (!token)
        token = await generateToken()

      // set authentication token when we load a new page
      await page.evaluateOnNewDocument((token) => {
        localStorage.clear()
        localStorage.setItem('token', token)
      }, token
      )
    },
  },
}
```

**Delete an element**

```ts
export default {
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
    }
  }
}
```
