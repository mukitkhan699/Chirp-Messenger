/**
 * Interaction test.
 *
 * Boots the app in real browsers and exercises the UI end to end: theming,
 * modals, the emoji picker, two-peer messaging, read receipts, reactions,
 * the mobile drawer, history persistence and the sonic lab pages.
 *
 *   node tests/interaction.test.mjs
 */

import path from 'node:path';
import {
  launch,
  openApp,
  readPeerId,
  screenshotDir,
  createReporter,
  BASE,
} from './harness.mjs';

const reporter = createReporter();
const shots = screenshotDir();
const browser = await launch();

/* ------------------------------------------------------------------ */
/* 1. Boot + basic UI                                                  */
/* ------------------------------------------------------------------ */

const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const a = await openApp(ctxA, 'A');

const peerIdA = await readPeerId(a);
reporter.check('app boots and gets a peer ID', /^[a-z]+-[a-z]+-\d+$/.test(peerIdA), peerIdA);
reporter.check('sidebar rendered', (await a.locator('.sidebar').count()) === 1);
reporter.check('composer rendered', (await a.locator('#composer-input').count()) === 1);
reporter.check('welcome conversation present', (await a.locator('.conversation-item').count()) >= 1);
reporter.check('composer disabled on welcome screen', await a.locator('#composer-input').isDisabled());

/* ------------------------------------------------------------------ */
/* 2. Settings panel + theming                                         */
/* ------------------------------------------------------------------ */

await a.click('.identity .icon-btn[title="Profile & settings"]');
await a.waitForSelector('#settings-panel.is-open', { timeout: 5000 });
reporter.check('settings panel opens', await a.locator('#settings-panel.is-open').isVisible());
reporter.check('settings has sections', (await a.locator('.settings-group').count()) >= 5);

await a.click('.segmented button:has-text("Dark")');
await a.waitForTimeout(400);
reporter.check('theme switches to dark', (await a.getAttribute('html', 'data-theme')) === 'dark');

await a.click('.accent-dot[data-accent-value="emerald"]');
await a.waitForTimeout(300);
reporter.check('accent switches to emerald', (await a.getAttribute('html', 'data-accent')) === 'emerald');

await a.screenshot({ path: path.join(shots, '01-settings-dark.png') });

await a.click('#settings-panel .icon-btn[aria-label="Close settings"]');
await a.waitForTimeout(400);
reporter.check('settings panel closes', !(await a.locator('#settings-panel.is-open').isVisible()));

/* ------------------------------------------------------------------ */
/* 3. Connect modal                                                    */
/* ------------------------------------------------------------------ */

await a.click('.sidebar-actions .icon-btn[title="New chat"]');
await a.waitForSelector('.modal', { timeout: 5000 });
reporter.check('connect modal opens', await a.locator('.modal').isVisible());
reporter.check('connect modal has input', (await a.locator('.modal input').count()) === 1);
await a.keyboard.press('Escape');
await a.waitForTimeout(300);
reporter.check('modal closes on Escape', (await a.locator('.modal').count()) === 0);

/* ------------------------------------------------------------------ */
/* 4. Emoji picker                                                     */
/* ------------------------------------------------------------------ */

await a.click('.composer-tools .icon-btn[title="Emoji"]');
await a.waitForSelector('.emoji-picker', { timeout: 5000 });
reporter.check('emoji picker opens', await a.locator('.emoji-picker').isVisible());

const emojiCount = await a.locator('.emoji-item').count();
reporter.check('emoji picker renders items', emojiCount > 10, `${emojiCount} items`);

await a.fill('.emoji-picker input', 'rocket');
await a.waitForTimeout(400);
const searchCount = await a.locator('.emoji-item').count();
reporter.check(
  'emoji search filters',
  searchCount > 0 && searchCount < emojiCount,
  `${searchCount} results`,
);

await a.locator('.emoji-item').first().click();
await a.waitForTimeout(300);
const composerValue = await a.inputValue('#composer-input');
reporter.check('emoji inserted into composer', composerValue.length > 0, JSON.stringify(composerValue));
await a.evaluate(() => {
  document.querySelector('#composer-input').value = '';
});

/* ------------------------------------------------------------------ */
/* 5. Two-peer P2P messaging                                           */
/* ------------------------------------------------------------------ */

const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const b = await openApp(ctxB, 'B');
const peerIdB = await readPeerId(b);
reporter.check('second peer got an ID', /^[a-z]+-[a-z]+-\d+$/.test(peerIdB), peerIdB);

await b.click('.sidebar-actions .icon-btn[title="New chat"]');
await b.waitForSelector('.modal input');
await b.fill('.modal input', peerIdA);
await b.click('.modal button:has-text("Connect")');
await b.waitForTimeout(4000);

const bOnline = await b.evaluate(() =>
  document.querySelector('#chat-peer-status')?.textContent?.includes('Online'),
);
reporter.check('B connected to A (data channel open)', Boolean(bOnline));

await b.waitForTimeout(1500);
const aSeesB = await a.evaluate(
  (id) =>
    [...document.querySelectorAll('.conversation-item .conversation-name')].some((node) =>
      node.textContent.includes(id),
    ),
  peerIdB,
);
reporter.check('A sees the new conversation', aSeesB);

await b.fill('#composer-input', 'Hello from peer B!');
await b.click('#composer-send');
await b.waitForTimeout(2500);

const aReceived = await a.evaluate(() =>
  [...document.querySelectorAll('.message-row.is-in .bubble')].some((node) =>
    node.textContent.includes('Hello from peer B!'),
  ),
);
reporter.check('A received the message', aReceived);

const bSent = await b.evaluate(() =>
  [...document.querySelectorAll('.message-row.is-out .bubble')].some((node) =>
    node.textContent.includes('Hello from peer B!'),
  ),
);
reporter.check('B sees its own message', bSent);

await a.click('.conversation-item');
await a.waitForTimeout(800);
await a.fill('#composer-input', 'Hey B, received!');
await a.click('#composer-send');
await a.waitForTimeout(2500);

const bReceived = await b.evaluate(() =>
  [...document.querySelectorAll('.message-row.is-in .bubble')].some((node) =>
    node.textContent.includes('Hey B, received!'),
  ),
);
reporter.check('B received the reply', bReceived);

await a.waitForTimeout(2000);
const readTicks = await a.evaluate(
  () => document.querySelectorAll('.message-row.is-out .tick.is-read').length,
);
reporter.check('read receipt applied', readTicks > 0, `${readTicks} read ticks`);

await a.hover('.message-row.is-in');
await a.waitForTimeout(300);
const reactButton = a.locator('.message-row.is-in .message-action[title="React"]').first();
if (await reactButton.count()) {
  await reactButton.click();
  await a.waitForSelector('.reaction-popover', { timeout: 3000 });
  await a.locator('.reaction-option').first().click();
  await a.waitForTimeout(1800);
  const reactionChips = await b.evaluate(() => document.querySelectorAll('.reaction-chip').length);
  reporter.check('reaction synced to peer', reactionChips > 0, `${reactionChips} chips`);
} else {
  reporter.check('reaction button present', false, 'not found');
}

await a.screenshot({ path: path.join(shots, '02-conversation-dark.png') });
await b.screenshot({ path: path.join(shots, '03-peer-b.png') });

/* ------------------------------------------------------------------ */
/* 6. Mobile layout                                                    */
/* ------------------------------------------------------------------ */

const ctxM = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const m = await openApp(ctxM, 'M');
await m.waitForTimeout(600);

const drawerHidden = await m.evaluate(() => {
  const sidebar = document.querySelector('.sidebar');
  return sidebar.getBoundingClientRect().right <= 1;
});
reporter.check('mobile: sidebar is a drawer', drawerHidden);

const noOverflow = await m.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  return [...document.querySelectorAll('.chat *')]
    .filter((el) => el.getBoundingClientRect().right > viewport + 1)
    .length;
});
reporter.check('mobile: no horizontal overflow', noOverflow === 0, `${noOverflow} overflowing nodes`);

await m.click('.chat-header .icon-btn[title="Back to conversations"]');
await m.waitForTimeout(400);
await m.screenshot({ path: path.join(shots, '04-mobile.png') });

/* ------------------------------------------------------------------ */
/* 7. Persistence across reload                                        */
/* ------------------------------------------------------------------ */

await a.reload({ waitUntil: 'domcontentloaded' });
await a.waitForSelector('.app');
await a.waitForTimeout(3000);

const storedCount = await a.evaluate(async () => {
  const mod = await import('/src/state/app.js');
  const conversations = Object.values(mod.store.get('conversations') || {});
  return conversations.reduce((total, conversation) => total + (conversation.messages || []).length, 0);
});

await a.locator(`.conversation-item:has-text("${peerIdB}")`).first().click();
await a.waitForTimeout(1200);

const persisted = await a.evaluate(() => {
  const conversations = [...document.querySelectorAll('.conversation-item')];
  const bubbles = [...document.querySelectorAll('.bubble')].map((bubble) => bubble.textContent);
  return {
    conversations: conversations.length,
    hasMsg: bubbles.some((text) => text.includes('Hey B, received!')),
    hasReply: bubbles.some((text) => text.includes('Hello from peer B!')),
  };
});
reporter.check(
  'history survives reload',
  persisted.conversations >= 2 && persisted.hasMsg && persisted.hasReply && storedCount >= 2,
  `${JSON.stringify(persisted)} storedMessages=${storedCount}`,
);

/* ------------------------------------------------------------------ */
/* 8. Sonic lab                                                        */
/* ------------------------------------------------------------------ */

const lab = await ctxA.newPage();
const labErrors = [];
lab.on('pageerror', (error) => labErrors.push(error.message));

await lab.goto(`${BASE.replace(/index\.html$/, '')}lab/send.html`, { waitUntil: 'domcontentloaded' });
await lab.waitForTimeout(800);
reporter.check('tone sender lab loads', (await lab.locator('#play').count()) === 1, labErrors.join('; '));

await lab.fill('#text', 'Hi');
await lab.click('#play');
await lab.waitForTimeout(2500);
const senderStatus = await lab.textContent('#status');
reporter.check('tone sender plays', /Played|Playing/.test(senderStatus), senderStatus.trim());
await lab.screenshot({ path: path.join(shots, '05-lab-send.png') });

await lab.goto(`${BASE.replace(/index\.html$/, '')}lab/receive.html`, { waitUntil: 'domcontentloaded' });
await lab.waitForTimeout(800);
reporter.check('tone decoder lab loads', (await lab.locator('#start').count()) === 1);
await lab.screenshot({ path: path.join(shots, '06-lab-receive.png') });

/* ------------------------------------------------------------------ */

const errors = [...a.__errors, ...b.__errors, ...m.__errors, ...labErrors];
console.log('\nconsole errors:', errors.length ? `\n${[...new Set(errors)].join('\n')}` : '(none)');

const failed = reporter.summary();
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
