/**
 * Test runner.
 *
 * Starts a static server for the app, runs every suite against it and
 * reports the combined result.
 *
 *   node tests/run-all.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const PORT = Number(process.env.PORT || 8765);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${PORT}`);
    let filePath = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname === '/' || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      const candidate = path.join(filePath, 'index.html');
      filePath = existsSync(candidate) ? candidate : path.join(root, 'index.html');
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`Serving ${root} at http://127.0.0.1:${PORT}\n`);

process.env.CHIRP_URL = `http://127.0.0.1:${PORT}/index.html`;

const suites = [
  ['unit', 'unit.test.mjs', false],
  ['interaction', 'interaction.test.mjs', true],
  ['e2ee', 'e2ee.test.mjs', true],
  ['file transfer', 'file-transfer.test.mjs', true],
];

const failures = [];

for (const [label, file, needsBrowser] of suites) {
  console.log(`\n${'='.repeat(46)}\n  ${label.toUpperCase()}\n${'='.repeat(46)}`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', resolve);
  });
  if (code !== 0) failures.push(label);
  void needsBrowser;
}

console.log(`\n${'='.repeat(46)}`);
if (failures.length) {
  console.log(`FAILED SUITES: ${failures.join(', ')}`);
} else {
  console.log('ALL SUITES PASSED');
}
console.log('='.repeat(46));

server.close();
process.exit(failures.length ? 1 : 0);
