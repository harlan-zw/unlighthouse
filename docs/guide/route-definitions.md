# Providing Route Definitions

When you run Unlighthouse it will try and map your page files to URLs,
creating [route definitions](/glossary/#route-definition). This is used for [handling large sites](/guide/large-sites)
and file edit hints.

Running Unlighthouse with the CLI or a missing provider, the route discovery will likely fail. To help Unlighthouse
discover the route definitions you can provide extra configuration.

This is optional and only needed for large sites which can benefit from sampling.

By default, the `/pages/` dir is scanned for files with extensions `.vue` and `.md`.

## Point the root directory to your files

When running unlighthouse you should point the root directory to where the files for your project are, or more simply
run the command in the projects directory.

Say I want to scan [unlighthouse.dev](https://unlighthouse.dev) with the CLI and the project lives
at `/home/harlan/packages/unlighthouse/docs`.

```bash
unlighthouse --site unlighthouse.dev --root /home/harlan/packages/unlighthouse/docs
```

I need to provide configuration to tell Unlighthouse to load pages from the root directory.

```ts
export default {
  discovery: {
    pagesDir: './'
  }
}
```

## Custom extensions

If you have a different pages setup you can do:

```ts
export default {
  discovery: {
    pagesDir: './',
    fileExtensions: ['js', 'jxs']
  }
}
```

## Custom sampling

When you have URL patterns which don't use URL segments or the mapping is failing, it can be useful to map the sampling
yourself.

By using the `customSampling` option you map regex to a route definition.

In the below example we will map any URL such as `/q-search-query`, `/q-where-is-the-thing` to a single route
definition, , which allows the sampling to work.

```ts
export default {
  scanner: {
    customSampling: {
      '/q-(.*?)': {
        name: 'search-query'
      }
    }
  }
}
```
