---
layout: page
page.fluid: true
navigation: false
title: 'Unlighthouse - Site-wide Google Lighthouse'
---


::block-hero
---
cta:
  - Get started
  - /guide/getting-started
secondary:
  - Open on GitHub →
  - https://github.com/harlan-zw/unlighthouse
---

#right

<div class="relative h-full">
  <video width="960" height="540" autoplay loop muted poster="/screenshot.png" class="h-full max-w-full w-1822px rounded-xl z-1" style="object-fit: cover; box-shadow: rgb(0 0 0 / 20%) 0px 0px 0px 1px, rgb(0 0 0 / 50%) 0px 0px 30px 1px;">
    <source
      src="/demo.webm"
      type="video/webm"
    >
  </video>
  <button
    class="px-5 py-2 text-xl font-bold hover:no-underline font-medium rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 absolute top-1/2 left-1/2 transform -translate-x-[50%] -translate-y-[50%] transition-all flex items-center bg-gradient-to-t from-sky-100 to-blue-100 text-blue-500  hover:(bg-green-700 scale-105) transform transition"
  >
    <a href="https://inspect.unlighthouse.dev/"
    target="_blank">Open Demo</a>
  </button>
</div>

#title
Like Lighthouse, but it scans every single page.

#description
Scan your entire site with Google Lighthouse in 2 minutes (on average). Open source, fully configurable with minimal setup. 
::


::card-grid
#title
What's included

#root
:ellipsis

#default

  ::card
  ---
  icon: ⚡
  ---
  #title
  **Speedy Scans**
  #description
  Take advantage of your CPU with threaded workers and use opportunistic throttling and categories for lightning quick scans.
  ::

  ::card
  ---
  icon: 🐞
  ---
  #title
  Zero-config Link Crawling
  #description
  Fast, configurable URL discovery using sitemap.xml parsing, internal link crawling and project file scanning.
  ::


  ::card
  ---
  icon: 🍣
  ---
  #title
  No Time Wasted
  #description
  Fewer URLs to scan with automatic sampling of dynamic routes. Hook up your local project files to make it even smarter.
  ::

  ::card
  ---
  icon: 🌈
  ---
  #title
  Modern UI
  #description
  View your sites' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.
  ::

  ::card
  ---
  icon: 🍬️
  ---
  #title
  SEO Goodies
  #description
  View all of your pages titles, share images, meta descriptions, see how many internal and external links you have.
  ::

  ::card
  ---
  icon: ✅️
  ---
  #title
  Accessibility Summary
  #description
  See how your sites accessibility stacks up, find high-leverage issues to fix easily and visually see colour contrast issues.
  ::


  ::card
  ---
  icon: 🏠
  ---
  #title
  Generate static reports
  #description
  Use the CI to upload your sites reports and access them all at any time.
  ::

  ::card
  ---
  icon: 🤖
  ---
  #title
  CI Budget Testing
  #description
  View your sites' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.
  ::
  
  ::card
  ---
  icon: 🛠
  ---
  #title
  Powerful configuration
  #description
  Unlighthouse was built to modify, with isolated packages, robust API and a generous hook system. You can even modify the columns in the client!
  ::

::


## Contributors

This package is most possible by these amazing sponsors.

<div class="text-center">
  <a href="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
    <img src="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg" width="800" height="545" style="margin: 0 auto;">
  </a>
</div>
