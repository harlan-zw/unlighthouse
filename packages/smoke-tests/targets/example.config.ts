import type { ProductTarget } from '../lib/types.js';

/**
 * Example smoke-test target configuration.
 *
 * To create your own:
 *   1. Copy this file:  cp example.config.ts my-site.config.ts
 *   2. Edit the config below
 *   3. Import it in targets/registry.ts
 *   4. Run:  npx playwright test --project=my-site
 */
const example: ProductTarget = {
  name: 'example',
  baseUrl: 'https://example.com',
  // Optional: override baseUrl via env var at runtime
  // baseUrlEnv: 'EXAMPLE_URL',

  pages: [
    {
      path: '/',
      name: 'Homepage',
      selectors: ['h1'],
    },
    // Add auth-protected pages:
    // {
    //   path: '/dashboard',
    //   name: 'Dashboard',
    //   auth: true,
    //   selectors: ['#main-content'],
    // },
  ],

  // Authentication (for pages with auth: true)
  // auth: {
  //   strategy: 'form',
  //   loginUrl: '/login',
  //   fields: {
  //     '#email':    '${MY_APP_EMAIL}',      // reads process.env.MY_APP_EMAIL
  //     '#password': '${MY_APP_PASSWORD}',
  //   },
  //   submitSelector: 'button[type="submit"]',
  //   successIndicator: '/dashboard',         // URL path or CSS selector
  // },

  // Multi-step functional flows
  // flows: [
  //   {
  //     name: 'Sign-up flow',
  //     steps: [
  //       { action: 'goto', path: '/register' },
  //       { action: 'fill', selector: '#name', value: 'Test User' },
  //       { action: 'fill', selector: '#email', value: 'test@example.com' },
  //       { action: 'click', selector: 'button[type="submit"]' },
  //       { action: 'wait', selector: '.welcome-message', timeout: 5000 },
  //     ],
  //     expectSelectors: ['.welcome-message'],
  //     expectNoJsErrors: true,
  //   },
  // ],

  // SEO checks
  // seo: {
  //   pages: [
  //     {
  //       path: '/',
  //       title: 'Example',
  //       description: /example/i,
  //       ogTitle: /Example/,
  //       ogImage: /.+/,
  //     },
  //   ],
  // },

  // JS error patterns to ignore (regex, case-insensitive).
  // Common third-party noise is already filtered by default.
  allowedErrors: [
    // 'my-analytics-lib',
  ],
};

export default example;
