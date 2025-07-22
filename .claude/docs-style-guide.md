# Documentation Style Guide

This guide provides comprehensive instructions for writing and structuring documentation pages for Unlighthouse. Follow these patterns to ensure consistency across all documentation.

## 1. File Structure & Organization

### Directory Structure
- Use numeric prefixes for ordering (e.g., `0.overview.md`, `1.titles.md`)
- Group related content in subdirectories:
  - `guides/get-started/` - Getting started content
  - `guides/core-concepts/` - Core concepts
  - `guides/advanced/` - Advanced topics
  - `api/composables/` - API documentation for composables
  - `api/hooks/` - Hook documentation

### File Naming
- Use kebab-case for filenames
- Include numeric prefix for ordering
- Keep names concise but descriptive

## 2. Frontmatter Requirements

Every documentation file must include frontmatter with:

```yaml
---
title: Page Title
description: A concise description of what this page covers
navigation:
  title: Nav Title # Optional, shorter title for navigation
---
```

### Important Configuration Examples

When showing `unlighthouse.config.ts` examples, ALWAYS use `defineUnlighthouseConfig()`:

```ts
// ✅ Correct
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: {
    samples: 3,
  },
})

// ❌ Incorrect - never use plain object export
export default {
  site: 'https://example.com',
  scanner: {
    samples: 3,
  },
}
```

Additional optional frontmatter:
- `publishedAt: 2024-10-24` - Publication date
- `updatedAt: 2024-11-03` - Last update date
- `readTime: 8 mins` - Estimated reading time
- `new: true` - Mark as new feature
- `deprecated: true` - Mark as deprecated

## 3. Content Structure

### Introduction Section
- Start with an `## Introduction` or direct content
- Provide a clear, concise overview of the topic
- Include practical context about when/why to use the feature
- Use code blocks to show the end result early

Example:
```markdown
## Introduction

The `<style>`, `<script>` and `<noscript>` tags are unique in HTML as they can contain inner content that directly affects how your page behaves and appears. Unhead provides powerful utilities to manage this inner content safely and efficiently.

Unlike most other HTML tags which primarily use attributes, these special tags rely on their content to function.
```

### Tips and Warnings
Use styled callouts for important information:

```markdown
::tip
Page titles are often the first impression users have of your site in search results.
::

::warning
This approach has two major issues:
- It breaks during Server-Side Rendering (SSR)
- Search engines may not properly index your titles
::

::note
New to SEO titles? Check out Google's guide on [Influencing your title links](https://developers.google.com/search/docs/appearance/title-link).
::

::caution
Resetting the title template will remove any branding elements from your page title.
::
```

## 4. Code Examples

### Basic Code Blocks
- Always specify the language for syntax highlighting
- Use `twoslash` for TypeScript examples when helpful
- Include framework-specific examples using code groups

```ts
import { useHead } from '@unhead/dynamic-import'

useHead({
  title: 'My Page'
})
```

### Code Groups
Use code groups for multiple implementations or comparisons:

::code-group

```ts [unlighthouse.config.ts]
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: {
    samples: 3,
  },
})
```

```bash [CLI]
npx unlighthouse --site https://example.com --samples 3
```

::

### Inline Code

- Use backticks for inline code: `useHead()`
- Include language hints for HTML elements: `<title>{lang="html"}`
- Use for property names: `tagPriority{lang="bash"}`

## 5. API Documentation Structure

For API reference pages, follow this structure:

1. **Brief description** of the composable/hook
2. **Basic usage** example
3. **How it works** (if applicable)
4. **API Reference** section with:
   - Parameters table
   - Return value description
   - Type definitions
5. **Common use cases** with practical examples

### Parameter Tables

```markdown
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input` | `Head` | Yes | The head configuration object |
| `options` | `HeadEntryOptions` | No | Configuration options |
```

## 6. Writing Style

### Keep It Simple
- Write like you're talking to another developer
- Use simple words instead of fancy ones
- Say what things do, not how amazing they are
- Don't try to sell anything - just explain how it works

### Be Direct
- "This does X" not "This provides sophisticated X capabilities"
- "You can" not "One might consider"
- "Here's how" not "Let's explore the elegant solution"
- Skip the marketing speak

### Examples:
- ✅ "Run this command to scan your site"
- ❌ "Leverage this powerful command to orchestrate comprehensive site analysis"
- ✅ "This finds all the pages on your site"
- ❌ "This sophisticated crawler intelligently discovers your site's architecture"

### Technical Terms
- Explain technical words the first time you use them
- Link to docs when things get complex
- Use the same words for the same things throughout the page

## 9. Cross-Referencing

### Internal Links
- Use relative paths: `/docs/head/guides/titles`
- Link to related concepts frequently
- Include "Learn more" sections

### External Links
- Always use descriptive link text
- Open in same window unless specifically needed
- Include MDN or specification links for web standards

## 10. SEO Considerations

### Page Titles
- Keep under 60 characters
- Include key terms early
- Be descriptive and specific

### Descriptions
- Keep under 160 characters
- Summarize the page's value proposition
- Include relevant keywords naturally

## 11. Code Example Best Practices

### Completeness
- Show complete, working examples
- Include necessary imports
- Add comments for clarity

### Keep Examples Minimal
- Focus only on the specific feature being documented
- Avoid adding unrelated configuration options
- Use the simplest possible example that demonstrates the concept
- Don't include "kitchen sink" examples with every possible option

## 12. Maintenance

### Versioning
- Note version requirements when applicable
- Mark deprecated features clearly
- Include migration guides for breaking changes

### Updates
- Keep examples current with latest API
- Update links when URLs change
- Review and refresh content regularly

## Key Guidelines to Avoid

### DO NOT Include:
1. **Summary sections** - End pages directly after the last content
2. **Best Practices sections** - Integrate important practices into the main content
3. **Troubleshooting sections** - Only include if the page is specifically about troubleshooting
4. **Overly comprehensive examples** - Keep examples focused on the specific topic

### DO Include:
1. Clear, focused examples using `defineUnlighthouseConfig()`
2. Practical tips and warnings where relevant
3. Direct, concise explanations
4. Only the configuration options relevant to the topic being discussed

## 13. Terminology Guidelines

### Preferred Terms
- **Report site/page** - Use instead of "web interface" or "UI"
- **Config file** - Use instead of "configuration file" when being casual
- **Scans your site** - Use instead of "performs comprehensive analysis"
- **Finds pages** - Use instead of "discovers routes" or "route discovery"
- **Chrome browser** - Use instead of "browser automation" or "browser instances"

### Simple Language Rules
- Write like you're explaining to a colleague
- Use "it does X" instead of "it provides X capabilities"
- Say "here's how" instead of "let's explore"
- Skip marketing words like "powerful", "sophisticated", "comprehensive"
- Use active voice: "Unlighthouse scans" not "scanning is performed by"
