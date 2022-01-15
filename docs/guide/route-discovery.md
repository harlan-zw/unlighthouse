# Route Discovery

When you run Unlighthouse it will try and map your page files to URLs, creating [route definitions](/glossary/#route-definition). This is used for [intelligent sampling](/guide/sampling)
and file hints.

Running Unlighthouse with the CLI or a missing provider, the route discovery will likely fail. To help Unlighthouse discover the route definitions you can provide extra configuration.

This is optional and only needed for large sites which can benefit from sampling.

By default, the `/pages/` dir is scanned for files with extensions `.vue` and `.md`.

## Point the root directory to your files

When running unlighthouse you should point the root directory to where the files for your project are, or more simply
run the command in the projects directory.

Say I want to scan [unlighthouse.dev](https://unlighthouse.dev) with the CLI and the project lives at `/home/harlan/packages/unlighthouse/docs`. 

```shell
unlighthouse --site unlighthouse.dev --root /home/harlan/packages/unlighthouse/docs
```

I need to provide configuration to tell Unlighthouse to load pages from the root directory.

```ts
export default defineConfig({
    discovery: [
        pagesDir: './'
    ]
})
```

## Custom extensions

If you have a different pages setup you can do:

```ts
export default defineConfig({
    discovery: [
        pagesDir: './',
        fileExtensions: ['js', 'jxs']
    ]
})
```
