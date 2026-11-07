/**
 * Unit tests for the pure service modules.
 *
 * These run straight in Node — no browser, no Playwright.
 *
 *   node tests/unit.test.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (relative) => import(pathToFileURL(path.join(here, '..', relative)).href);

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, pass: false, detail: error.message });
    console.log(`FAIL  ${name} — ${error.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, pass: false, detail: error.message });
    console.log(`FAIL  ${name} — ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* Chirp — tone encoder/decoder frequency scheme                        */
/* ------------------------------------------------------------------ */

const { CHIRP, charToFrequency, frequencyToChar, chirpDurationMs } = await load(
  'src/services/chirp.js',
);

check('chirp: every printable ASCII code round-trips', () => {
  for (let code = CHIRP.MIN_CODE; code <= CHIRP.MAX_CODE; code += 1) {
    const char = String.fromCharCode(code);
    const frequency = charToFrequency(char);
    assert.equal(frequency, 600 + code * 10);
    assert.equal(frequencyToChar(frequency), char);
  }
});

check('chirp: markers are not decodable as characters', () => {
  assert.equal(frequencyToChar(CHIRP.START_FREQ), null);
  assert.equal(frequencyToChar(CHIRP.END_FREQ), null);
});

check('chirp: non-ASCII has no frequency', () => {
  assert.ok(Number.isNaN(charToFrequency('\n')));
  assert.ok(Number.isNaN(charToFrequency('😀')));
});

check('chirp: duration estimate is positive', () => {
  assert.ok(chirpDurationMs('Hello') > 0);
  assert.equal(chirpDurationMs('', { markers: false }), 0);
});

/* ------------------------------------------------------------------ */
/* Crypto — AES-GCM + PBKDF2                                           */
/* ------------------------------------------------------------------ */

const { E2EE, toBase64, fromBase64, randomId } = await load('src/services/crypto.js');

check('crypto: base64 round-trip', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
  assert.equal(toBase64(bytes), 'AAEC+vv/');
  assert.deepEqual(Array.from(fromBase64('AAEC+vv/')), Array.from(bytes));
});

check('crypto: randomId is url-safe and the requested length', () => {
  assert.match(randomId(12), /^[0-9a-z]{12}$/);
});

await checkAsync('crypto: encrypt/decrypt round-trip with AAD', async () => {
  const e2ee = new E2EE();
  const salt = await e2ee.generateSalt();
  const key = await e2ee.deriveKey('correct horse battery staple', salt);
  const payload = await e2ee.encrypt(key, 'Hello, Bob!', 'conv-1|alice');
  assert.deepEqual(Object.keys(payload).sort(), ['alg', 'ct', 'iv', 'v']);
  assert.equal(await e2ee.decrypt(key, payload, 'conv-1|alice'), 'Hello, Bob!');
});

await checkAsync('crypto: a wrong passphrase cannot decrypt', async () => {
  const e2ee = new E2EE();
  const salt = await e2ee.generateSalt();
  const key = await e2ee.deriveKey('right', salt);
  const wrong = await e2ee.deriveKey('wrong', salt);
  const payload = await e2ee.encrypt(key, 'secret', 'a|b');
  await assert.rejects(() => e2ee.decrypt(wrong, payload, 'a|b'), /Could not decrypt/);
});

await checkAsync('crypto: a wrong AAD cannot decrypt', async () => {
  const e2ee = new E2EE();
  const salt = await e2ee.generateSalt();
  const key = await e2ee.deriveKey('right', salt);
  const payload = await e2ee.encrypt(key, 'secret', 'a|b');
  await assert.rejects(() => e2ee.decrypt(key, payload, 'a|c'), /Could not decrypt/);
});

await checkAsync('crypto: every message gets a fresh IV', async () => {
  const e2ee = new E2EE();
  const salt = await e2ee.generateSalt();
  const key = await e2ee.deriveKey('right', salt);
  const a = await e2ee.encrypt(key, 'same', 'x');
  const b = await e2ee.encrypt(key, 'same', 'x');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

await checkAsync('crypto: session keys export, import and fingerprint', async () => {
  const e2ee = new E2EE();
  const session = await e2ee.createSessionKey();
  assert.match(session.fingerprint, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  const exported = await e2ee.exportSessionKey(session.key);
  const imported = await e2ee.importSessionKey(exported);
  assert.equal(await e2ee.fingerprint(imported), session.fingerprint);
});

/* ------------------------------------------------------------------ */
/* Protocol — envelopes and chunking                                   */
/* ------------------------------------------------------------------ */

const { MSG, encode, decode, chunkBytes, joinChunks, CHUNK_SIZE } = await load(
  'src/services/protocol.js',
);

check('protocol: envelopes round-trip', () => {
  const frame = encode(MSG.CHAT, { body: 'hi' }, { id: 'm1', from: 'alice' });
  const decoded = decode(frame);
  assert.equal(decoded.type, MSG.CHAT);
  assert.equal(decoded.id, 'm1');
  assert.equal(decoded.from, 'alice');
  assert.equal(decoded.data.body, 'hi');
});

check('protocol: legacy bare strings are read as chat messages', () => {
  const decoded = decode('hello from the old client');
  assert.equal(decoded.type, MSG.CHAT);
  assert.equal(decoded.data.body, 'hello from the old client');
  assert.equal(decoded.data.legacy, true);
});

check('protocol: garbage is rejected', () => {
  assert.equal(decode('{not json'), null);
  assert.equal(decode(null), null);
  assert.equal(decode({ noType: true }), null);
});

check('protocol: chunking preserves the bytes', () => {
  const bytes = new Uint8Array(100000);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
  const chunks = chunkBytes(bytes, CHUNK_SIZE);
  assert.ok(chunks.length > 1);
  assert.deepEqual(Array.from(joinChunks(chunks)), Array.from(bytes));
});

/* ------------------------------------------------------------------ */
/* Emoji — dataset integrity                                           */
/* ------------------------------------------------------------------ */

const mem = new Map();
globalThis.localStorage = {
  getItem: (key) => (mem.has(key) ? mem.get(key) : null),
  setItem: (key, value) => mem.set(key, String(value)),
  removeItem: (key) => mem.delete(key),
  get length() {
    return mem.size;
  },
  key: (index) => [...mem.keys()][index],
};

const { EMOJI_CATEGORIES, searchEmoji, emojiName, loadRecentEmoji, pushRecentEmoji, clearRecentEmoji } =
  await load('src/ui/emoji.js');

check('emoji: every category and item is well formed', () => {
  for (const category of EMOJI_CATEGORIES) {
    assert.ok(category.id && category.name && category.icon);
    assert.ok(Array.isArray(category.items));
    for (const item of category.items) {
      assert.ok(item.emoji && item.name && item.keywords);
      assert.ok([...item.emoji].length <= 12);
    }
  }
});

check('emoji: no duplicates in the dataset', () => {
  const all = [];
  for (const category of EMOJI_CATEGORIES) {
    all.push(category.icon, ...category.items.map((item) => item.emoji));
  }
  assert.equal(new Set(all).size, all.length);
});

check('emoji: search finds common terms', () => {
  assert.ok(searchEmoji('smile').length >= 3);
  assert.ok(searchEmoji('heart').length >= 3);
  assert.ok(searchEmoji('fire').length >= 1);
  assert.deepEqual(searchEmoji('xyzzy-no-such-emoji'), []);
  assert.deepEqual(searchEmoji(''), []);
});

check('emoji: recents round-trip', () => {
  clearRecentEmoji();
  assert.deepEqual(loadRecentEmoji(), []);
  assert.deepEqual(pushRecentEmoji('😀'), ['😀']);
  assert.deepEqual(pushRecentEmoji('🎉'), ['🎉', '😀']);
  assert.deepEqual(loadRecentEmoji(1), ['🎉']);
  clearRecentEmoji();
  assert.deepEqual(loadRecentEmoji(), []);
});

check('emoji: names resolve', () => {
  assert.equal(emojiName('🔥'), 'fire');
  assert.equal(emojiName('not-an-emoji'), '');
});

/* ------------------------------------------------------------------ */

const failed = results.filter((result) => !result.pass);
console.log('\n================ SUMMARY ================');
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => ` - ${f.name} (${f.detail})`).join('\n'));
}
process.exit(failed.length ? 1 : 0);
