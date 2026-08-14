---
title: "Unlighthouse Guide"
description: "Everything you need to run Unlighthouse: getting started, configuration guides, and integration recipes for scanning your entire site with Lighthouse."
keywords:
  - unlighthouse guide
  - unlighthouse documentation
  - site-wide lighthouse
  - unlighthouse setup
navigation:
  title: "Guide"
relatedPages:
  - path: /guide/getting-started/installation
    title: Installation
  - path: /api-doc
    title: API Reference
  - path: /glossary
    title: Core Web Vitals Glossary
---

# Unlighthouse Guide

Unlighthouse scans your entire site with Google Lighthouse in minutes, giving you a full picture of performance, accessibility, SEO and best-practices issues instead of checking pages one at a time.

## Getting Started

::card-group
  ::card{title="Installation" to="/guide/getting-started/installation"}
  Install and run the Unlighthouse CLI against your site with a single command.
  ::

  ::card{title="How It Works" to="/guide/getting-started/how-it-works"}
  Learn how Unlighthouse discovers routes, samples pages and runs Lighthouse at scale.
  ::

  ::card{title="Integrations" to="/guide/getting-started/integrations"}
  Use Unlighthouse with Nuxt, Vite, webpack, CI and more.
  ::
::

## Guides

::card-group
  ::card{title="Configuration" to="/guide/guides/config"}
  All the configuration options available to tune a scan.
  ::

  ::card{title="Route Definitions" to="/guide/guides/route-definitions"}
  Provide explicit routes instead of relying on crawling or sitemap discovery.
  ::

  ::card{title="Authentication" to="/guide/guides/authentication"}
  Scan pages that sit behind a login.
  ::

  ::card{title="Dynamic Sampling" to="/guide/guides/dynamic-sampling"}
  Group similar routes so large sites scan faster.
  ::

  ::card{title="Lighthouse Configuration" to="/guide/guides/lighthouse"}
  Pass through custom Lighthouse options.
  ::

  ::card{title="Puppeteer Launch Options" to="/guide/guides/puppeteer"}
  Customise the Puppeteer / Chrome instance used for scanning.
  ::

  ::card{title="Device Configuration" to="/guide/guides/device"}
  Toggle between mobile and `--desktop` scans.
  ::

  ::card{title="Docker" to="/guide/guides/docker"}
  Run Unlighthouse inside a Docker container.
  ::

  ::card{title="Chrome Dependency" to="/guide/guides/chrome-dependency"}
  How Unlighthouse locates or installs Chrome.
  ::

  ::card{title="Debugging Lighthouse Scans" to="/guide/guides/debugging"}
  Diagnose scans that fail or produce unexpected scores.
  ::

  ::card{title="Common Errors" to="/guide/guides/common-errors"}
  Fixes for the errors you're most likely to hit.
  ::

  ::card{title="Generate Lighthouse Reports" to="/guide/guides/generating-static-reports"}
  Export a static HTML report for sharing or CI artifacts.
  ::

  ::card{title="URL Discovery" to="/guide/guides/url-discovery"}
  How Unlighthouse finds the URLs on your site to scan.
  ::
::

## Recipes

::card-group
  ::card{title="Bulk Lighthouse Testing for Large Sites" to="/guide/recipes/large-sites"}
  Tune Unlighthouse to handle sites with thousands of pages.
  ::

  ::card{title="Improving Lighthouse Accuracy" to="/guide/recipes/improving-accuracy"}
  Get consistent, reliable scores between runs.
  ::

  ::card{title="Single-Page Applications" to="/guide/recipes/spa"}
  Scan client-rendered SPA routes correctly.
  ::

  ::card{title="Customizing the UI" to="/guide/recipes/client"}
  Adjust the Unlighthouse client for your workflow.
  ::
::
