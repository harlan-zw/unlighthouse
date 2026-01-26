/**
 * Tiny HTTP server that launches the Playwright UI when called.
 * Start alongside Lighthouse: node packages/smoke-tests/launcher.mjs
 *
 * The Lighthouse sidebar button calls GET http://localhost:9322/launch
 * which spawns `npx playwright test --ui` in a new window.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9322;
let playwrightProcess = null;

function launchPlaywright() {
  // Kill existing instance if running
  if (playwrightProcess && !playwrightProcess.killed) {
    playwrightProcess.kill();
    playwrightProcess = null;
  }

  playwrightProcess = spawn('npx', ['playwright', 'test', '--ui'], {
    cwd: __dirname,
    stdio: 'ignore',
    detached: true,
    shell: true,
  });

  playwrightProcess.unref();
  return true;
}

const server = createServer((req, res) => {
  // CORS headers so the Lighthouse client can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/launch') {
    try {
      launchPlaywright();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, message: 'Playwright UI launching...' }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
    return;
  }

  if (req.url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({
      running: playwrightProcess !== null && !playwrightProcess.killed,
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Smoke tests launcher listening on http://localhost:${PORT}`);
  console.log(`  GET /launch  — opens Playwright UI`);
  console.log(`  GET /status  — check if running`);
});
