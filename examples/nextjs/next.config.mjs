import WebpackPlugin from '@unlighthouse/webpack'

export default {
  webpack(config, app) {
    console.log('webpack plugin')
    config.plugins.unshift(
      WebpackPlugin(
        {
          site: 'http://localhost:3000',
          debug: true,
        }
      )
    )
    return config
  }
}
