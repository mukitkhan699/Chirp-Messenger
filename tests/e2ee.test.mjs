/**
 * End-to-end encryption test.
 *
 * Verifies that a passphrase-derived key encrypts the wire payload, that the
 * receiver decrypts it, and that a wrong passphrase leaks no plaintext.
 *
 *   node tests/e2ee.test.mjs
 */

import path from 'node:path';
import { launch, openApp, readPeerId, screenshotDir, createReporter } from './harness.mjs';

const reporter = createReporter();
const browser = await launch();

const A = await openApp(await browser.newContext({ viewport: { width: 1280, height: 860 } }), 'A');
const B = await openApp(await browser.newContext({ viewport: { width: 1280, height: 860 } }), 'B');

const peerA = await readPeerId(A);
const peerB = await readPeerId(B);

// B dials A
await B.click('.sidebar-actions .icon-btn[title="New chat"]');
await B.waitForSelector('.modal input');
await B.fill('.modal input', peerA);
await B.click('.modal button:has-text("Connect")');
await B.waitForTimeout(4000);

const connected = await B.evaluate(() =>
  document.querySelector('#chat-peer-status')?.textContent?.includes('Online'),
);
reporter.check('peers connected', Boolean(connected));

/** Turn on encryption with a given passphrase through the real app modules. */
async function enableEncryption(page, passphrase) {
  await page.evaluate(async (pass) => {
    const rt = await import('/src/runtime.js');
    const { actions } = await import('/src/state/app.js');
    await rt.e2eeSession.setPassphrase(pass);
    actions.setSetting('e2ee', true);
    localStorage.setItem('chirp.e2ee.passphrase', pass);
  }, passphrase);
}

await enableEncryption(A, 'swift-tiger-42-orchid');
await enableEncryption(B, 'swift-tiger-42-orchid');

const fingerprints = await Promise.all([
  A.evaluate(async () => (await import('/src/runtime.js')).e2eeSession.fingerprint),
  B.evaluate(async () => (await import('/src/runtime.js')).e2eeSession.fingerprint),
]);
reporter.check(
  'both peers derive the same key',
  fingerprints[0] === fingerprints[1],
  `${fingerprints[0]} vs ${fingerprints[1]}`,
);

// Instrument A's outbound frames so the ciphertext can be inspected.
await A.evaluate(async (peerId) => {
  const rt = await import('/src/runtime.js');
  window.__frames = [];
  const connection = rt.peerService.connections.get(peerId);
  if (!connection) throw new Error('no connection');
  const original = connection.send.bind(connection);
  connection.send = (data) => {
    window.__frames.push(data);
    return original(data);
  };
}, peerB);

const SECRET = 'TOP_SECRET_PLAINTEXT_42';

await A.fill('#composer-input', SECRET);
await A.click('#composer-send');
await A.waitForTimeout(2500);

const frame = await A.evaluate(
  () => window.__frames?.find((f) => String(f).includes('chat')) || '',
);

reporter.check(
  'outbound frame does not contain the plaintext',
  Boolean(frame) && !String(frame).includes(SECRET),
  String(frame).slice(0, 80),
);
reporter.check(
  'encrypted frame carries an AES-GCM payload',
  Boolean(frame) && String(frame).includes('AES-GCM'),
);

const received = await B.evaluate(
  (secret) =>
    [...document.querySelectorAll('.message-row.is-in .bubble')].some((node) =>
      node.textContent.includes(secret),
    ),
  SECRET,
);
reporter.check('receiver decrypted the message', received);

const localPlain = await A.evaluate(
  (secret) =>
    [...document.querySelectorAll('.message-row.is-out .bubble')].some((node) =>
      node.textContent.includes(secret),
    ),
  SECRET,
);
reporter.check('local copy stays readable', localPlain);

// A wrong passphrase must not decrypt anything.
await enableEncryption(B, 'a-completely-different-passphrase');
await A.fill('#composer-input', 'SECOND_MESSAGE_99');
await A.click('#composer-send');
await A.waitForTimeout(2500);

const garbled = await B.evaluate(() => {
  const bubbles = [...document.querySelectorAll('.message-row.is-in .bubble')];
  const last = bubbles[bubbles.length - 1];
  return last ? last.textContent : '';
});
reporter.check(
  'wrong passphrase yields no plaintext',
  !garbled.includes('SECOND_MESSAGE_99') && garbled.includes('could not be decrypted'),
  garbled.slice(0, 70),
);

await A.screenshot({ path: path.join(screenshotDir(), '07-e2ee.png') });

const errors = [...A.__errors, ...B.__errors];
console.log('\nconsole errors:', errors.length ? `\n${errors.join('\n')}` : '(none)');

const failed = reporter.summary();
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
