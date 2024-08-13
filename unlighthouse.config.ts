export default {
  site: 'harlanzw.com',
  scanner: {
    // exclude specific routes
    exclude: [
      '/.*?pdf',
      '.*/amp',
      'en-*',
    ],
    // run lighthouse for each URL 3 times
    samples: 3,
    // use desktop to scan
    device: 'desktop',
    // enable the throttling mode
    throttle: true,
  },
  debug: true,
}