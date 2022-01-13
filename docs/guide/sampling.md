# Route Sampling

Making use of [Route Definitions](http://localhost:3333/glossary/#route-definition) we can implement intelligent sampling based
on the file used to generate the route.

This is most common in sites which generate hundreds of pages based on dynamic data, where the DOM is very similar in structure.

Think of a blog which has thousands on posts, we don't want to scan every single post. Instead, we can sample a collection of those posts.

## Change Dynamic Sampling Limit

By default, a URLs will be matched to a specific route definition 5 times.

You can change the sample limit with:

```ts
export default defineConfig({
  scanner: {
    // see 20 samples for each page file
    dynamicSampling: 20
  }
})
```


## Disabling Sampling

In cases where the route definitions aren't provided, a less-smart sampling will occur where URLs under the same parent will be
sampled.

For these instances you may want to disable the sample as follows:

```ts
export default defineConfig({
  scanner: {
    // no dynamic sampling
    dynamicSampling: false
  }
})
```



