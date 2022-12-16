# Route Definitions

Route definitions are an optional feature of Unlighthouse. 

Providing them will give you more intelligent sampling and file hints.

When you start Unlighthouse, it will try and map your page files to [route definitions](/glossary/#route-definition). 

Using Unlighthouse with the provided integrations, the route definitions should be discovered on their own. 
If you have a custom setup or are using the CLI, you will need to manually set up the discovery.

## Pages directory

By default, the `pages/` dir is scanned for files with extensions `.vue` and `.md`, from the `root` directory.

If your project has a different setup you can modify the configuration.

```ts
export default {
  root: './app',
  discovery: {
    pagesDir: 'routes',
    fileExtensions: ['jsx', 'md'],
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
