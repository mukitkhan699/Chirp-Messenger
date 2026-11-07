/**
 * Shared test harness.
 *
 * Resolves Playwright (local, global or via PLAYWRIGHT_PATH), locates a
 * Chromium binary and exposes helpers used by the test suites.
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Resolve Playwright from the local install, the global one, or an env var. */
async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    '/usr/local/lib/node_modules/playwright/index.mjs',
    path.join(here, '..', 'node_modules', 'playwright', 'index.mjs'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      if (mod.chromium) return mod.chromium;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export const chromium = await loadPlaywright();

if (!chromium) {
  console.error(
    'Playwright not found. Install it with:\n  npm i -D playwright && npx playwright install chromium',
  );
  process.exit(2);
}

/** Base URL of the running app. */
export const BASE = process.env.CHIRP_URL || 'http://127.0.0.1:8765/index.html';

/** Chromium binary, when the sandbox has no bundled browser. */
export const CHROME =
  process.env.CHROME_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome')
    ? '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome'
    : undefined);

/** Launch the browser with the flags the app needs. */
export function launch() {
  return chromium.launch({
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

/** Make sure the screenshot directory exists. */
export function screenshotDir() {
  const dir = path.join(here, 'screenshots');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Open the app and wait until it is fully booted.
 * @param {import('playwright').BrowserContext} context
 * @param {string} label used to tag console errors
 */
export async function openApp(context, label = 'app') {
  const page = await context.newPage();
  const errors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[${label}] PAGEERROR ${error.message}`));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 30000 });
  await page.waitForFunction(() => document.body.classList.contains('is-ready'), {
    timeout: 30000,
  });

  // The PWA service worker would otherwise serve stale code between reloads.
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  });

  page.__errors = errors;
  return page;
}

/** Read this device's live peer ID. */
export async function readPeerId(page) {
  await page.waitForFunction(
    () => document.querySelector('#own-peer-id')?.textContent?.includes('-'),
    { timeout: 30000 },
  );
  return (await page.textContent('#own-peer-id')).trim();
}

/** Minimal assertion recorder shared by the suites. */
export function createReporter() {
  const results = [];
  return {
    check(name, pass, detail = '') {
      results.push({ name, pass, detail });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    },
    summary() {
      const failed = results.filter((result) => !result.pass);
      console.log('\n================ SUMMARY ================');
      console.log(`${results.length - failed.length}/${results.length} checks passed`);
      if (failed.length) {
        console.log('FAILED:\n' + failed.map((f) => ` - ${f.name} (${f.detail})`).join('\n'));
      }
      return failed.length;
    },
    results,
  };
}
