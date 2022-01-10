import useUnlighthouse from 'unlighthouse/next'

export default {
  webpack(config, app) {
    useUnlighthouse({
        /* unlighthouse options  */
      },
      { config, app }
    )
    return config
  }
}
