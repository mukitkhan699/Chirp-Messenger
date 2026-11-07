/**
 * Call overlay — incoming, active and ended call states.
 */

import { h, clear } from '../core/dom.js';
import { store, actions } from '../state/app.js';
import { iconSvg } from './icons.js';
import { bridge } from './bridge.js';
import { initials, colorFromString } from '../core/utils.js';

const els = {
  overlay: null,
  stage: null,
};

let timerInterval = null;
let startedAt = null;

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  startedAt = null;
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();
  timerInterval = setInterval(() => {
    const subtitle = els.overlay?.querySelector('.call-subtitle');
    if (subtitle && startedAt) {
      subtitle.textContent = formatDuration(Date.now() - startedAt);
    }
  }, 1000);
}

/**
 * Render the call overlay for the given call state.
 * @param {object|null} call
 */
export function renderCall(call) {
  const overlay = els.overlay;
  if (!overlay) return;

  if (!call) {
    overlay.classList.remove('is-active');
    stopTimer();
    clear(els.stage);
    return;
  }

  overlay.classList.add('is-active');
  clear(els.stage);

  const peerName = call.peerName || call.peerId || 'Peer';
  const isIncoming = call.state === 'incoming';

  const avatar = h(
    'div',
    { class: 'call-avatar-large' },
    h('span', { style: { background: colorFromString(peerName) } }, initials(peerName)),
  );

  const title = h('div', { class: 'call-title' }, peerName);
  const subtitle = h(
    'div',
    { class: 'call-subtitle' },
    isIncoming ? 'Incoming call…' : call.state === 'connected' ? '00:00' : 'Calling…',
  );

  const controls = h('div', { class: 'call-controls' });

  if (isIncoming) {
    controls.append(
      h(
        'button',
        {
          class: 'call-button call-button-end',
          type: 'button',
          title: 'Decline',
          'aria-label': 'Decline call',
          onClick: () => bridge.answerCall?.(null),
        },
        iconSvg('phoneOff', { size: 24 }),
      ),
      h(
        'button',
        {
          class: 'call-button',
          type: 'button',
          title: 'Accept',
          'aria-label': 'Accept call',
          style: { background: 'var(--success)', borderColor: 'transparent' },
          onClick: () => bridge.answerCall?.(call),
        },
        iconSvg('phoneIncoming', { size: 24 }),
      ),
    );
    els.stage.append(avatar, title, subtitle, controls);
    return;
  }

  // Active call.
  if (call.video) {
    const remoteVideo = h('video', { class: 'remote-video', autoplay: true, playsinline: true });
    const localVideo = h('video', { class: 'local-video', autoplay: true, playsinline: true, muted: true });
    const stage = h('div', { class: 'call-videos' }, remoteVideo, localVideo);
    els.stage.appendChild(stage);

    // Attach the media streams once the service publishes them.
    queueMicrotask(() => {
      const stream = call.remoteStream;
      if (stream && remoteVideo.srcObject !== stream) {
        remoteVideo.srcObject = stream;
      }
      if (call.localStream && localVideo.srcObject !== call.localStream) {
        localVideo.srcObject = call.localStream;
      }
    });
  }

  const muteButton = h(
    'button',
    {
      class: `call-button${call.muted ? ' is-off' : ''}`,
      type: 'button',
      title: call.muted ? 'Unmute' : 'Mute',
      'aria-label': call.muted ? 'Unmute microphone' : 'Mute microphone',
      onClick: () => {
        const muted = bridge.toggleMute?.();
        if (muted !== undefined) {
          call.muted = muted;
          renderCall(call);
        }
      },
    },
    iconSvg(call.muted ? 'micOff' : 'mic', { size: 24 }),
  );

  controls.appendChild(muteButton);

  if (call.video) {
    controls.appendChild(
      h(
        'button',
        {
          class: `call-button${call.cameraOff ? ' is-off' : ''}`,
          type: 'button',
          title: call.cameraOff ? 'Turn camera on' : 'Turn camera off',
          'aria-label': 'Toggle camera',
          onClick: () => {
            const off = bridge.toggleCamera?.();
            if (off !== undefined) {
              call.cameraOff = off;
              renderCall(call);
            }
          },
        },
        iconSvg(call.cameraOff ? 'videoOff' : 'video', { size: 24 }),
      ),
    );
    controls.appendChild(
      h(
        'button',
        {
          class: `call-button${call.sharingScreen ? ' is-off' : ''}`,
          type: 'button',
          title: call.sharingScreen ? 'Stop sharing' : 'Share screen',
          'aria-label': 'Share screen',
          onClick: async () => {
            const sharing = await bridge.toggleScreenShare?.();
            if (sharing !== undefined) {
              call.sharingScreen = sharing;
              renderCall(call);
            }
          },
        },
        iconSvg('screenShare', { size: 24 }),
      ),
    );
  }

  controls.appendChild(
    h(
      'button',
      {
        class: 'call-button call-button-end',
        type: 'button',
        title: 'End call',
        'aria-label': 'End call',
        onClick: () => bridge.endCall?.(),
      },
      iconSvg('phoneOff', { size: 26 }),
    ),
  );

  els.stage.append(
    call.video ? h('div', { style: { display: 'contents' } }) : avatar,
    title,
    subtitle,
    controls,
  );

  if (call.state === 'connected') startTimer();
  else stopTimer();
}

export function mountCall(root) {
  const stage = h('div', { class: 'call-stage' });
  const overlay = h('div', { class: 'call-overlay', id: 'call-overlay' }, stage);
  root.appendChild(overlay);
  els.overlay = overlay;
  els.stage = stage;

  store.subscribe('calls.active', (call) => renderCall(call));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && store.get('calls.active')) {
      bridge.endCall?.();
    }
  });

  return { renderCall };
}
