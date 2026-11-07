/**
 * File transfer test.
 *
 * Sends a real file between two peers and verifies that the bytes arrive
 * intact — this is the path the chunked base64 transport has to get exactly
 * right.
 *
 *   node tests/file-transfer.test.mjs
 */

import path from 'node:path';
import { launch, openApp, readPeerId, createReporter } from './harness.mjs';

const reporter = createReporter();
const browser = await launch();

const A = await openApp(await browser.newContext({ viewport: { width: 1280, height: 860 } }), 'A');
const B = await openApp(await browser.newContext({ viewport: { width: 1280, height: 860 } }), 'B');

const peerA = await readPeerId(A);
const peerB = await readPeerId(B);

await B.click('.sidebar-actions .icon-btn[title="New chat"]');
await B.waitForSelector('.modal input');
await B.fill('.modal input', peerA);
await B.click('.modal button:has-text("Connect")');
await B.waitForTimeout(4000);

const connected = await B.evaluate(() =>
  document.querySelector('#chat-peer-status')?.textContent?.includes('Online'),
);
reporter.check('peers connected', Boolean(connected));

/* ------------------------------------------------------------------ */
/* Build a payload larger than one chunk so the chunker is exercised     */
/* ------------------------------------------------------------------ */

const SIZE = 200_000;
const payload = await A.evaluate(async (size) => {
  // A deterministic byte pattern with a recognisable header.
  const bytes = new Uint8Array(size);
  const header = new TextEncoder().encode('CHIRP-FILE-CHECK:');
  bytes.set(header, 0);
  for (let i = header.length; i < size; i += 1) bytes[i] = (i * 31 + 7) % 256;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}, SIZE);

reporter.check('payload spans several chunks', payload.length > 100000, `${payload.length} base64 chars`);

// Send it through the app's own file pipeline.
await A.evaluate(async (base64) => {
  const { actions, store } = await import('/src/state/app.js');
  const { sendFile } = await import('/src/services/files.js');
  const rt = await import('/src/runtime.js');

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const file = new File([bytes], 'payload.bin', { type: 'application/octet-stream' });

  const convId = store.get('ui.activeConversationId');
  const conversation = store.get(`conversations.${convId}`);
  const placeholder = actions.addMessage(convId, {
    direction: 'out',
    type: 'file',
    body: '',
    status: 'sending',
    attachment: { kind: 'file', name: 'payload.bin', type: 'application/octet-stream', size: bytes.length },
    meta: { progress: 0 },
  });
  await sendFile(rt.peerService, conversation.peerId, file, {
    onProgress: (ratio) => actions.updateMessage(convId, placeholder.id, { meta: { progress: ratio } }),
  });
  actions.updateMessage(convId, placeholder.id, { status: 'sent', meta: { progress: 1 } });
}, payload);

// Wait for the receiver to rebuild the file.
await B.waitForFunction(
  () => [...document.querySelectorAll('.message-row.is-in .attachment-name')].length > 0,
  { timeout: 30000 },
);
await B.waitForTimeout(1500);

const received = await B.evaluate(() => {
  const attachment = document.querySelector('.message-row.is-in .attachment');
  const dataUrl = attachment?.getAttribute('href');
  if (!dataUrl || !dataUrl.startsWith('data:')) return { ok: false, reason: 'no data url' };
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const header = new TextDecoder().decode(bytes.subarray(0, 17));
  let checksum = 0;
  for (let i = 0; i < bytes.length; i += 1) checksum = (checksum + bytes[i]) % 1000003;
  return {
    ok: true,
    length: bytes.length,
    header,
    checksum,
    name: document.querySelector('.message-row.is-in .attachment-name')?.textContent,
  };
});

reporter.check('file arrived on the peer', received.ok, received.reason || '');
reporter.check('file size is byte-exact', received.length === SIZE, `${received.length} vs ${SIZE}`);
reporter.check('file header survived', received.header === 'CHIRP-FILE-CHECK:', received.header);
reporter.check('file name survived', received.name === 'payload.bin', received.name);

const expectedChecksum = await A.evaluate((base64) => {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  let checksum = 0;
  for (let i = 0; i < bytes.length; i += 1) checksum = (checksum + bytes[i]) % 1000003;
  return checksum;
}, payload);
reporter.check('file content checksum matches', received.checksum === expectedChecksum,
  `${received.checksum} vs ${expectedChecksum}`);

const errors = [...A.__errors, ...B.__errors];
console.log('\nconsole errors:', errors.length ? `\n${errors.join('\n')}` : '(none)');

const failed = reporter.summary();
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
