# Tests

Four suites cover the framework end to end.

| Suite | What it covers | Needs a browser |
| --- | --- | --- |
| `unit.test.mjs` | Chirp tone scheme, AES-GCM crypto, wire protocol, chunking, emoji dataset | no |
| `interaction.test.mjs` | Boot, theming, modals, emoji picker, two-peer messaging, read receipts, reactions, mobile layout, persistence, lab pages | yes |
| `e2ee.test.mjs` | Passphrase key agreement, ciphertext on the wire, decryption, wrong-passphrase rejection | yes |
| `file-transfer.test.mjs` | Multi-chunk file transfer, byte-exactness, checksums | yes |

## Running them

```bash
# everything (starts its own static server)
node tests/run-all.mjs

# a single suite
node tests/unit.test.mjs
node tests/interaction.test.mjs
```

The browser suites need [Playwright](https://playwright.dev):

```bash
npm i -D playwright && npx playwright install chromium
```

If Playwright lives outside the project, point the harness at it:

```bash
PLAYWRIGHT_PATH=/usr/local/lib/node_modules/playwright/index.mjs node tests/run-all.mjs
```

Sandboxes without the bundled Chromium can point at any binary:

```bash
CHROME_PATH=/usr/bin/chromium node tests/run-all.mjs
```

To run the browser suites against an already-running instance:

```bash
CHIRP_URL=http://127.0.0.1:8000/index.html node tests/interaction.test.mjs
```

## Notes

- The suites drive the **real** app in Chromium — they import the app's own
  modules rather than re-implementing its logic.
- Screenshots from the browser suites land in `tests/screenshots/`.
- The service worker is unregistered and caches cleared on every page load,
  so a run never tests stale code.
