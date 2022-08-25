export default {
  site: "beta.reactjs.org",
  debug: true,
  scanner: {
    device: "mobile",
    throttle: true,
    samples: 3,
    customSampling: {
      '/blog/(.*?)': {
        name: 'guide'
      }
    }
  },
}
