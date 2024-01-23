---
title: Dynamic Sampling
description: Dynamic sampling is a feature that allows you to automatically sample similar pages.
---

Dynamic Sampling is useful for sites that have a lot of pages that are similar, such as a blog articles.

It is enabled by default for most scans.

## How it works

When dynamic sampling is enabled, it will group paths into chunks based on their path tree.

For example, let's imagine we have a blog on our site and there are hundreds of blog posts. Scanning every blog post will
take a long time and may even break Unlighthouse.

The path structure is `/blog/{post}`.

Unlighthouse will turn this path structure into groups based on the `/blog` prefix. By default, it will sample
5 paths starting with this prefix.

A sample being a random selection of paths within this group.

For example if we have the posts:
- `/blog/post-a`
- `/blog/post-b`
- `/blog/post-c`
- `/blog/post-d`
- `/blog/post-e`
- `/blog/post-f`
- `/blog/post-g`
- `/blog/post-h`
- `/blog/post-i`

After sampling, we may end up with the random selection:

- `/blog/post-c`
- `/blog/post-d`
- `/blog/post-e`
- `/blog/post-h`
- `/blog/post-i`

## Usage

It is configured using the `scanner.dynamicSampling` option.

```ts
export default {
  scanner: {
    dynamicSampling: false, // or any number, default is 5
  }
}
```

Alternatively, you can disable it using the CLI `--disable-dynamic-sampling`.
