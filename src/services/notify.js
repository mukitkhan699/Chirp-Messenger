/**
 * Notifications & sound.
 *
 * Two independent channels:
 *  - desktop notifications (permission-gated, best effort)
 *  - short synthesised sounds (Web Audio) for incoming messages, calls and
 *    sent messages — no audio assets required, so the app stays dependency
 *    free and works offline.
 */

import { bus, EVENTS } from '../core/bus.js';

const prefersReducedMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let audioCtx = null;

function ctx() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/**
 * Play a short tone sequence.
 * @param {number[]} frequencies
 * @param {{ duration?: number, type?: OscillatorType, gain?: number }} [opts]
 */
export function playTones(frequencies, { duration = 0.12, type = 'sine', gain = 0.08 } = {}) {
  const audio = ctx();
  if (!audio) return;
  const now = audio.currentTime;
  frequencies.forEach((freq, index) => {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = now + index * duration;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.9);
    osc.connect(amp).connect(audio.destination);
    osc.start(start);
    osc.stop(start + duration);
  });
}

export const sounds = {
  /** Soft two-note chime for an incoming message. */
  message() {
    playTones([784, 1046.5], { duration: 0.1, type: 'sine', gain: 0.07 });
  },
  /** Rising arpeggio for a sent message. */
  sent() {
    playTones([523.25, 659.25], { duration: 0.07, type: 'triangle', gain: 0.04 });
  },
  /** Classic phone ring. */
  ring() {
    playTones([440, 480], { duration: 0.36, type: 'sine', gain: 0.06 });
    setTimeout(() => playTones([440, 480], { duration: 0.36, type: 'sine', gain: 0.06 }), 700);
  },
  /** Two-tone decline. */
  decline() {
    playTones([392, 261.6], { duration: 0.16, type: 'sine', gain: 0.06 });
  },
  /** Confirmation blip for UI actions. */
  tap() {
    playTones([1046.5], { duration: 0.06, type: 'triangle', gain: 0.035 });
  },
  /** Error buzz. */
  error() {
    playTones([220, 180], { duration: 0.14, type: 'sawtooth', gain: 0.04 });
  },
};

export const notifications = {
  /** Ask for permission once; returns the resulting state. */
  async request() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  },

  get permission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  /**
   * Show a desktop notification.
   * @param {string} title
   * @param {string} body
   * @param {{ icon?: string, tag?: string, onClick?: Function }} [opts]
   */
  show(title, body, opts = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return null;
    try {
      const notification = new Notification(title, {
        body,
        icon: opts.icon || undefined,
        tag: opts.tag || undefined,
        silent: true,
      });
      if (opts.onClick) {
        notification.onclick = () => {
          window.focus();
          opts.onClick();
          notification.close();
        };
      }
      setTimeout(() => notification.close(), 8000);
      return notification;
    } catch (err) {
      console.warn('[notify] could not show notification', err);
      return null;
    }
  },
};

/** Play a sound if the user has enabled sound in settings. */
export function playIfEnabled(name, enabled) {
  if (!enabled || prefersReducedMotion) return;
  const fn = sounds[name];
  if (fn) fn();
}

export { bus, EVENTS };
