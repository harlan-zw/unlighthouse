# Improving Accuracy

## Run Lighthouse Multiple Times Per URL

Lighthouse recommends using multiple scans to improve the overall accuracy of the results. By default Unlighthouse only
performs one sample to improve speed.

If you'd like to opt in to multiple samples you can do:

```ts
export default {
  scanner: {
    // scan each URL 3 times and average the results
    samples: 3
  }
}
```

## Reduce Parallel scans

By default, the worker will spin up workers for each core your CPU has. This may not be ideal if you want more accuracy
performance scores as the extra workload will affect performance metrics.

```ts
export default {
  puppeteerClusterOptions: {
    // only run 1 worker at a time
    maxConcurrency: 1
  }
}
```



