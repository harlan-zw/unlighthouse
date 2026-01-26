import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProductTarget } from './lib/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let targets: ProductTarget[] = [];
const registryPath = path.join(__dirname, 'targets', 'registry.ts');

if (fs.existsSync(registryPath)) {
  const mod = await import('./targets/registry.js');
  targets = mod.targets;
}

if (targets.length === 0) {
  console.log('');
  console.log('No smoke test targets configured.');
  console.log('  1. Copy targets/example.config.ts to create a target (e.g. targets/my-site.config.ts)');
  console.log('  2. Copy targets/example.registry.ts → targets/registry.ts');
  console.log('  3. Import your target in registry.ts');
  console.log('');
}

function getProdUrl(target: ProductTarget): string | null {
  if (target.baseUrlEnv && process.env[target.baseUrlEnv]) {
    return process.env[target.baseUrlEnv]!;
  }
  return null;
}

// Build two projects per target: one for prod, one for local.
// CLI: --project="csv2geo [prod]" or --project="csv2geo [local]"
const projects = targets.flatMap(target => {
  const prodUrl = getProdUrl(target);
  const localUrl = target.baseUrl;
  const result = [];

  if (prodUrl) {
    result.push({
      name: `${target.name} [prod]`,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: prodUrl,
      },
    });
  }

  result.push({
    name: `${target.name} [local]`,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: localUrl,
    },
  });

  return result;
});

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/latest.json' }],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects,
});
