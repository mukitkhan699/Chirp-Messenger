# Chirp Messenger

A peer-to-peer messenger that runs entirely in the browser. No accounts, no
backend holding your messages — two browsers talk to each other directly over
WebRTC.

This is a **complete rebuild** of the original project. The first version was a
single `index.html` + `script.js` + `styles.css` triple with one chat window
and one hard-coded voice call. It now ships a real application framework, a
modern interface and a much larger feature set — while keeping the original's
most distinctive idea: **Chirp Mode**, sending text as audible tones.

---

## Highlights

### Modern interface
- **Light / dark / system themes** with six accent colours and four chat backgrounds
- **Responsive layout** — a two-pane desktop view that becomes a drawer + conversation view on phones
- **Message grouping, date dividers, read receipts, typing indicators** and hover actions
- **Keyboard shortcuts**: `⌘K` / `Ctrl+K` search, `⌘,` settings, `/` search, `Esc` to close
- **Fully accessible** — ARIA roles, focus management, reduced-motion support

### Messaging
- Multiple simultaneous peer conversations, pinned / muted / searchable
- **Replies, reactions, edits, deletes** — all synced live to the other side
- **Attachments**: images and files, transferred in chunks with progress
- Emoji picker with 530+ emoji, search and recents
- Desktop notifications and synthesised sounds (no audio assets required)

### Calls
- Voice **and video** calls, with mute, camera toggle and **screen sharing**
- Call timer, synthesised ringtone, and a call history

### Privacy
- **Optional end-to-end encryption**: AES-256-GCM, key stretched from a shared
  passphrase with PBKDF2 (150 000 iterations). The passphrase never leaves the
  device and both peers derive the same key without any key exchange.
- History is stored **locally only** (IndexedDB) and can be exported or wiped

### Chirp Mode
The original repo's experiment (`1.html` played text as tones, `2.html` decoded
tones with FFT analysis) is now a first-class feature:

- Outgoing messages can play as audible tones
- The app can listen through the microphone and turn tones back into messages
- Frequency scheme is unchanged from the original — **400 Hz** start marker,
  **500 Hz** end marker, characters at `600 + charCode × 10` Hz

### Progressive web app
Installable, with a service worker that caches the shell so the app opens
offline. `manifest.webmanifest` plus maskable icons are included.

---

## Quick start

The project is plain ES modules — **no build step, no npm install**.

```bash
git clone https://github.com/mukitkhan699/Chirp-Messenger.git
cd Chirp-Messenger
python3 -m http.server 8000
# open http://localhost:8000
```

Any static file server works. Opening `index.html` directly from disk will
*not* work, because browsers block ES modules over `file://`.

> **PeerJS is vendored** in `vendor/peerjs.min.js`, so the app works without a
> third-party CDN at runtime.

### Trying it out

1. Open the app in two browsers (or two tabs).
2. Each side gets a peer ID in the bottom-left card — copy it.
3. On the other side, press **+** in the sidebar, paste the ID and hit
   **Connect**.
4. Type, react, reply, and start a call.

### The sonic lab

The original tone pages are still here, rebuilt and shared with the app's own
chirp service:

- [`lab/send.html`](lab/send.html) — play text as tones
- [`lab/receive.html`](lab/receive.html) — decode tones via the microphone

---

## Architecture

```
index.html              app shell + design-system stylesheet links
manifest.webmanifest    PWA metadata
sw.js                   service worker (offline shell)
vendor/peerjs.min.js    vendored PeerJS

src/
  main.js               bootstrap: wires transport ⇄ store ⇄ UI
  runtime.js            long-lived service singletons
  core/
    store.js            reactive store with path-based subscriptions
    dom.js              h() hyperscript + keyed list reconciliation
    bus.js              pub/sub event bus
    utils.js            pure helpers (formatting, files, clipboard)
  services/
    peer.js             PeerJS transport, multi-peer connections
    protocol.js         typed wire envelopes + chunking
    media.js            calls: audio, video, screen share
    crypto.js           E2EE: PBKDF2 + AES-256-GCM
    chirp.js            tone encoder + FFT decoder
    files.js            chunked file transfer
    db.js               IndexedDB persistence (+ localStorage fallback)
    notify.js           notifications + synthesised sounds
  state/
    app.js              store shape + every action that mutates it
  ui/
    shell.js            composition root
    sidebar.js  chat.js  composer.js  call.js  settings.js
    dialogs.js  modal.js  popover.js  toast.js
    icons.js  emoji.js  emoji-picker.js  bridge.js
  styles/
    tokens.css  base.css  layout.css  components.css
tests/
  unit.test.mjs           chirp, crypto, protocol, emoji (pure Node)
  interaction.test.mjs    the UI in a real browser
  e2ee.test.mjs           encryption over the wire
  file-transfer.test.mjs  multi-chunk transfers, byte-exact
  harness.mjs  run-all.mjs
```

### Design decisions

**A small reactive core instead of a framework dependency.** `store.js` is
~150 lines: state is a plain object addressed by dotted paths, and views
subscribe to the slices they care about. It ships with no build step and no
runtime dependencies.

**Services never import UI code.** Transport, crypto, media and persistence
talk to the rest of the app through the event bus. The UI reaches them through
a single `ui/bridge.js` façade, so the dependency direction stays one-way:
`ui → bridge → runtime → services`.

**A typed wire protocol.** Every frame is a JSON envelope
(`{ v, t, id, ts, from, d }`). The decoder still accepts bare strings, so the
modern app can talk to the original `script.js` build.

**Keyed reconciliation.** `core/dom.js` diffs lists by key, so the message
thread patches individual messages instead of re-rendering the whole
conversation — the DOM survives focus, scroll position and CSS animations.

**No asset dependencies.** Icons are inline SVG paths, sounds are synthesised
with the Web Audio API, and the emoji set is a plain JavaScript module.

---

## Testing

```bash
node tests/run-all.mjs
```

Four suites, 65 checks, all green:

| Suite | Checks | Covers |
| --- | --- | --- |
| `unit` | 20 | tone scheme, AES-GCM, wire protocol, chunking, emoji dataset |
| `interaction` | 31 | boot, theming, modals, emoji picker, two-peer messaging, read receipts, reactions, mobile layout, persistence, lab pages |
| `e2ee` | 7 | key agreement, ciphertext on the wire, decryption, wrong-passphrase rejection |
| `file transfer` | 7 | multi-chunk transfers, byte-exactness, checksums |

The browser suites drive the real app in Chromium and import the app's own
modules rather than re-implementing its logic. They need
[Playwright](https://playwright.dev); see [`tests/README.md`](tests/README.md).

---

## Browser support

Chrome / Edge 90+, Firefox 90+, Safari 15+. WebRTC, Web Audio and
`crypto.subtle` are all required; `crypto.subtle` needs a secure context
(HTTPS or `localhost`).

---

## Credits

Original project by [mukitkhan699](https://github.com/mukitkhan699) — the
peer-to-peer foundation and the Chirp tone experiment that this rebuild
builds on. Built with [PeerJS](https://peerjs.com).

## License

MIT
