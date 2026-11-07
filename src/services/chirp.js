/**
 * @file Chirp Mode — audible tone transport for Chirp Messenger.
 *
 * The experiment that shipped with the original project (`1.html` plays a
 * string as a sequence of audible sine tones, `2.html` decodes those tones
 * back into text using microphone FFT analysis) is re-implemented here as a
 * dependency free browser module.
 *
 * ## Frequency scheme
 *
 * The scheme stays byte for byte compatible with the legacy pages:
 *
 * | item              | value                                      |
 * | ----------------- | ------------------------------------------ |
 * | START marker      | 400 Hz                                     |
 * | END marker        | 500 Hz                                     |
 * | character         | `600 + (charCode * 10)` Hz, code `32..126` |
 * | character range   | 920 Hz .. 1860 Hz                          |
 * | tone length       | 200 ms                                     |
 * | gap between tones | 220 ms                                     |
 *
 * ## Module rules
 *
 * - Plain ES module: no build step, no bundler, no npm imports, no CDN.
 * - Only standard browser APIs are used (Web Audio, MediaDevices).
 * - Nothing runs at import time, so the module is safe to load anywhere.
 */

/**
 * Frequency and timing constants shared by the encoder and the decoder.
 * @readonly
 */
export const CHIRP = Object.freeze({
  START_FREQ: 400,
  END_FREQ: 500,
  BASE_FREQ: 600,
  FREQ_STEP: 10,
  TONE_MS: 200,
  GAP_MS: 220,
  MIN_CODE: 32,
  MAX_CODE: 126,
});

/** Lowest frequency the decoder considers meaningful. */
const MIN_AUDIBLE_FREQ = 350;

/** Highest frequency the decoder considers meaningful. */
const MAX_AUDIBLE_FREQ = 2000;

/** Tolerance (Hz) when matching a measured frequency against a known tone. */
const TONE_TOLERANCE = 10;

/** Hysteresis (Hz) used to tell "same tone still playing" from "new tone". */
const HYSTERESIS_HZ = 20;

/** Size of the FFT used by the decoder. */
const FFT_SIZE = 2048;

/** Interval (ms) between two decoder analysis frames. */
const POLL_MS = 50;

/** Minimum peak magnitude (0-255) a tone must reach before it is decoded. */
const MIN_MAGNITUDE = 200;

/** Per tone cooldown (ms). */
const REPEAT_COOLDOWN_MS = 150;

/**
 * Monotonic clock helper that works in browsers and in Node.
 * @returns {number} Milliseconds since the process/page start.
 */
function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Split a string into the characters that can be encoded as tones.
 * @param {string} text
 * @returns {{ chars: string[], skipped: number }}
 */
function splitEncodable(text) {
  const chars = [];
  let skipped = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    const isNewline = code === 10 || code === 13;
    const isPrintable = code >= CHIRP.MIN_CODE && code <= CHIRP.MAX_CODE;
    if (isNewline || !isPrintable) {
      skipped += 1;
      continue;
    }
    chars.push(char);
  }
  return { chars, skipped };
}

/**
 * Report whether this browser can run Chirp Mode.
 * @returns {boolean}
 */
export function isChirpSupported() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : {};
  const hasAudio = Boolean(scope.AudioContext || scope.webkitAudioContext);
  const mediaDevices = scope.navigator && scope.navigator.mediaDevices;
  const hasMicrophone = Boolean(mediaDevices && typeof mediaDevices.getUserMedia === 'function');
  return hasAudio && hasMicrophone;
}

/**
 * Convert a single character into its chirp tone frequency.
 * @param {string} char
 * @returns {number} Frequency in hertz, or `NaN` when not representable.
 */
export function charToFrequency(char) {
  if (typeof char !== 'string' || char.length !== 1) {
    return NaN;
  }
  const code = char.charCodeAt(0);
  if (code < CHIRP.MIN_CODE || code > CHIRP.MAX_CODE) {
    return NaN;
  }
  return CHIRP.BASE_FREQ + code * CHIRP.FREQ_STEP;
}

/**
 * Convert a measured frequency back into the character it represents.
 * @param {number} freq
 * @returns {string|null} Character, or `null` when the frequency is not valid.
 */
export function frequencyToChar(freq) {
  const value = typeof freq === 'number' ? freq : Number(freq);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < MIN_AUDIBLE_FREQ || value > MAX_AUDIBLE_FREQ) {
    return null;
  }
  let code = Math.round((value - CHIRP.BASE_FREQ) / CHIRP.FREQ_STEP);
  if (code < CHIRP.MIN_CODE) {
    code = CHIRP.MIN_CODE;
  }
  if (code > CHIRP.MAX_CODE) {
    code = CHIRP.MAX_CODE;
  }
  const exact = CHIRP.BASE_FREQ + code * CHIRP.FREQ_STEP;
  return Math.abs(value - exact) <= TONE_TOLERANCE ? String.fromCharCode(code) : null;
}

/**
 * Estimate how long a string takes to play.
 * @param {string} text
 * @param {{ markers?: boolean }} [options]
 * @returns {number} Estimated playback time in milliseconds.
 */
export function chirpDurationMs(text, options = {}) {
  const source = text === null || text === undefined ? '' : String(text);
  const includeMarkers = options.markers !== false;
  const { chars } = splitEncodable(source);
  const tones = chars.length + (includeMarkers ? 2 : 0);
  if (tones === 0) {
    return 0;
  }
  return tones * CHIRP.TONE_MS + (tones - 1) * CHIRP.GAP_MS;
}

/**
 * Play text as a sequence of audible sine tones.
 *
 * The encoder emits the 400 Hz START marker, one tone per encodable
 * character (`600 + charCode * 10` Hz) and finally the 500 Hz END marker.
 */
export class ChirpEncoder {
  /**
   * @param {object} [options]
   * @param {number} [options.toneMs=200]
   * @param {number} [options.gapMs=220]
   * @param {number} [options.volume=0.6]
   * @param {boolean} [options.markers=true]
   * @param {AbortSignal} [options.signal]
   */
  constructor(options = {}) {
    this.options = {
      toneMs: CHIRP.TONE_MS,
      gapMs: CHIRP.GAP_MS,
      volume: 0.6,
      markers: true,
      ...options,
    };
    /** @type {AudioContext|null} */
    this.context = null;
    /** @type {GainNode|null} */
    this.masterGain = null;
    /** @type {AbortController|null} */
    this._controller = null;
    this._playing = false;
  }

  /** @returns {boolean} True while a sequence is being played. */
  get isPlaying() {
    return this._playing;
  }

  /**
   * Encode and play a string.
   * @param {string} text
   * @param {{ onProgress?: (p:{index:number,total:number,char:string})=>void, signal?: AbortSignal }} [options]
   * @returns {Promise<{ sent: number, durationMs: number, skipped: number }>}
   */
  async encode(text, { onProgress, signal: callSignal } = {}) {
    if (this._playing) {
      throw new Error('ChirpEncoder is already playing');
    }

    const source = text === null || text === undefined ? '' : String(text);
    const { chars, skipped } = splitEncodable(source);

    const controller = new AbortController();
    const externalSignal = callSignal || this.options.signal || null;
    let onExternalAbort = null;
    if (externalSignal) {
      onExternalAbort = () => controller.abort();
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    this._controller = controller;
    this._playing = true;
    const startedAt = now();
    let sent = 0;

    try {
      await this._ensureContext();
      const signal = controller.signal;

      if (this.options.markers && !signal.aborted) {
        await this._playTone(CHIRP.START_FREQ, signal);
        if (!signal.aborted) {
          await this._delay(this.options.gapMs, signal);
        }
      }

      for (let index = 0; index < chars.length; index += 1) {
        if (signal.aborted) break;
        const char = chars[index];
        if (typeof onProgress === 'function') {
          onProgress({ index, total: chars.length, char });
        }
        await this._playTone(charToFrequency(char), signal);
        if (signal.aborted) break;
        sent += 1;
        if (index < chars.length - 1) {
          await this._delay(this.options.gapMs, signal);
        }
      }

      if (this.options.markers && !signal.aborted) {
        await this._delay(this.options.gapMs, signal);
        await this._playTone(CHIRP.END_FREQ, signal);
      }
    } finally {
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
      this._playing = false;
      this._controller = null;
    }

    return {
      sent,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
      skipped,
    };
  }

  /** Abort the running playback, if any. */
  stop() {
    if (this._controller) {
      this._controller.abort();
      this._controller = null;
    }
  }

  /**
   * Lazily create the audio context and make sure it is running.
   * @returns {Promise<AudioContext>}
   */
  async _ensureContext() {
    if (!this.context) {
      const scope = typeof globalThis !== 'undefined' ? globalThis : {};
      const AudioCtor = scope.AudioContext || scope.webkitAudioContext;
      if (!AudioCtor) {
        throw new Error('Web Audio API is not supported in this browser');
      }
      this.context = new AudioCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.options.volume;
      this.masterGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        throw new Error('Unable to start audio playback, the browser blocked it');
      }
    }
    return this.context;
  }

  /**
   * Play a single sine tone with a click free envelope.
   * @param {number} freq
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  _playTone(freq, signal) {
    const context = this.context;
    const master = this.masterGain;
    if (!context || !master) {
      return Promise.resolve();
    }

    const duration = this.options.toneMs / 1000;
    const attack = Math.min(0.015, duration / 4);
    const release = Math.min(0.03, duration / 4);

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;

    const startAt = context.currentTime;
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(1, startAt + attack);
    envelope.gain.setValueAtTime(1, startAt + duration - release);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(envelope);
    envelope.connect(master);

    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      let onAbort = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (onAbort) signal.removeEventListener('abort', onAbort);
        try { oscillator.disconnect(); } catch { /* already disconnected */ }
        try { envelope.disconnect(); } catch { /* already disconnected */ }
        resolve();
      };

      onAbort = () => {
        try { oscillator.stop(); } catch { /* not started yet */ }
        finish();
      };

      if (signal.aborted) {
        finish();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
      oscillator.onended = () => finish();
      timer = setTimeout(finish, this.options.toneMs + 150);

      try {
        oscillator.start(startAt);
        oscillator.stop(startAt + duration);
      } catch {
        finish();
      }
    });
  }

  /**
   * Wait for a given amount of time, abortable.
   * @param {number} ms
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  _delay(ms, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      let onAbort = null;
      const timer = setTimeout(() => {
        if (onAbort) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/**
 * Turn a microphone failure into a friendly error.
 * @param {unknown} error
 * @returns {Error}
 */
function friendlyMicrophoneError(error) {
  const name = error && typeof error === 'object' && error.name ? error.name : '';
  let message = 'Microphone access denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    message = 'No microphone found';
  } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    message = 'Microphone access denied';
  } else if (name === 'NotReadableError' || name === 'TrackStartError') {
    message = 'The microphone is already in use by another application';
  } else if (name === 'OverconstrainedError') {
    message = 'No microphone matches the requested constraints';
  }
  const friendly = new Error(message);
  friendly.name = 'ChirpMicrophoneError';
  friendly.cause = error;
  return friendly;
}

/**
 * Classify a measured frequency.
 * @param {number} freq
 * @returns {string|null} 'start', 'end', a character, or null for noise.
 */
function classifyTone(freq) {
  if (Math.abs(freq - CHIRP.START_FREQ) <= TONE_TOLERANCE) return 'start';
  if (Math.abs(freq - CHIRP.END_FREQ) <= TONE_TOLERANCE) return 'end';
  return frequencyToChar(freq);
}

/**
 * Decode audible tones captured by the microphone back into text.
 */
export class ChirpDecoder {
  /**
   * @param {object} [options]
   * @param {number} [options.threshold=200]
   * @param {number} [options.pollMs=50]
   * @param {number} [options.fftSize=2048]
   * @param {number} [options.cooldownMs=150]
   * @param {number} [options.hysteresisHz=20]
   */
  constructor(options = {}) {
    this.options = {
      threshold: MIN_MAGNITUDE,
      pollMs: POLL_MS,
      fftSize: FFT_SIZE,
      cooldownMs: REPEAT_COOLDOWN_MS,
      hysteresisHz: HYSTERESIS_HZ,
      ...options,
    };
    /** @type {AudioContext|null} */
    this.context = null;
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this.source = null;
    /** @type {AnalyserNode|null} */
    this.analyser = null;
    /** @type {Uint8Array|null} */
    this._data = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    this._timer = null;
    this._listening = false;
    this._capturing = false;
    this._buffer = '';
    this._toneActive = false;
    this._lastKey = null;
    this._lastFreq = 0;
    this._lastAcceptedAt = -Infinity;
    this._callbacks = { onChar: null, onMarker: null, onStatus: null, onMessage: null };
  }

  /** @returns {boolean} True between start() and stop(). */
  get isListening() {
    return this._listening;
  }

  /** @returns {boolean} True while a message is being assembled. */
  get isCapturing() {
    return this._capturing;
  }

  /** @returns {string} The partially decoded message. */
  get buffer() {
    return this._buffer;
  }

  /**
   * Request the microphone and start decoding.
   * @param {{ onChar?: (c:string)=>void, onMarker?: (m:'start'|'end')=>void,
   *           onStatus?: (s:string)=>void, onMessage?: (m:string)=>void }} [options]
   * @returns {Promise<ChirpDecoder>}
   */
  async start({ onChar, onMarker, onStatus, onMessage } = {}) {
    if (this._listening) {
      throw new Error('ChirpDecoder is already running');
    }

    this._callbacks = { onChar, onMarker, onStatus, onMessage };

    const scope = typeof globalThis !== 'undefined' ? globalThis : {};
    const mediaDevices = scope.navigator && scope.navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      throw new Error('Microphone access is not supported in this browser');
    }

    let stream = null;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw friendlyMicrophoneError(error);
    }
    this.stream = stream;

    const AudioCtor = scope.AudioContext || scope.webkitAudioContext;
    if (!AudioCtor) {
      this._releaseStream();
      throw new Error('Web Audio API is not supported in this browser');
    }

    this.context = new AudioCtor();
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        /* analysis still works, only playback was blocked */
      }
    }

    this.source = this.context.createMediaStreamSource(stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.options.fftSize;
    this.analyser.smoothingTimeConstant = 0.6;
    this.source.connect(this.analyser);
    // Deliberately not connected to the destination — that would create a
    // feedback loop between the speaker and the microphone.

    this._data = new Uint8Array(this.analyser.frequencyBinCount);
    this._timer = setInterval(() => this._poll(), this.options.pollMs);

    this._listening = true;
    this._capturing = false;
    this._buffer = '';
    this._toneActive = false;
    this._lastKey = null;
    this._lastFreq = 0;
    this._lastAcceptedAt = -Infinity;

    this._emitStatus('Listening for chirps');
    return this;
  }

  /** Stop decoding and release the microphone. */
  stop() {
    const wasListening = this._listening;

    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch { /* already disconnected */ }
      this.source = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch { /* already disconnected */ }
      this.analyser = null;
    }
    this._data = null;

    this._releaseStream();

    if (this.context) {
      const context = this.context;
      this.context = null;
      try {
        const closing = context.close();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch { /* already closed */ }
    }

    this._listening = false;
    this._capturing = false;
    this._buffer = '';
    this._toneActive = false;
    this._lastKey = null;
    this._lastFreq = 0;
    this._lastAcceptedAt = -Infinity;

    if (wasListening) {
      this._emitStatus('Stopped');
    }
  }

  /** Stop every microphone track. */
  _releaseStream() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* track already ended */ }
    });
    this.stream = null;
  }

  /** Analyse one frame of microphone audio. */
  _poll() {
    const analyser = this.analyser;
    const data = this._data;
    if (!analyser || !data) return;

    analyser.getByteFrequencyData(data);

    let peakIndex = -1;
    let peakValue = 0;
    for (let index = 0; index < data.length; index += 1) {
      if (data[index] > peakValue) {
        peakValue = data[index];
        peakIndex = index;
      }
    }

    if (peakIndex < 0 || peakValue < this.options.threshold) {
      this._toneActive = false;
      return;
    }

    const frequency = this._peakFrequency(peakIndex, peakValue);
    if (frequency < MIN_AUDIBLE_FREQ || frequency > MAX_AUDIBLE_FREQ) {
      this._toneActive = false;
      return;
    }

    this._handleTone(frequency);
  }

  /**
   * Estimate the frequency of a spectral peak using parabolic interpolation.
   * @param {number} index
   * @param {number} value
   * @returns {number} Interpolated frequency in hertz.
   */
  _peakFrequency(index, value) {
    const analyser = this.analyser;
    const data = this._data;
    if (!analyser || !data) return 0;
    const binWidth = analyser.context.sampleRate / analyser.fftSize;
    const left = index > 0 ? data[index - 1] : value;
    const right = index < data.length - 1 ? data[index + 1] : value;
    const denominator = left - 2 * value + right;
    let delta = 0;
    if (denominator !== 0) {
      const raw = (0.5 * (left - right)) / denominator;
      if (Number.isFinite(raw) && raw > -0.5 && raw < 0.5) delta = raw;
    }
    return (index + delta) * binWidth;
  }

  /**
   * React to a detected frequency.
   * @param {number} frequency
   */
  _handleTone(frequency) {
    const key = classifyTone(frequency);
    if (key === null) {
      this._toneActive = false;
      return;
    }

    const timestamp = now();
    const continuous =
      this._toneActive &&
      this._lastKey === key &&
      Math.abs(frequency - this._lastFreq) < this.options.hysteresisHz;

    if (continuous) return;
    if (timestamp - this._lastAcceptedAt < this.options.cooldownMs) return;

    this._toneActive = true;
    this._lastKey = key;
    this._lastFreq = frequency;
    this._lastAcceptedAt = timestamp;
    this._emitKey(key);
  }

  /**
   * Dispatch a decoded tone.
   * @param {string} key 'start', 'end' or a character.
   */
  _emitKey(key) {
    if (key === 'start') {
      this._capturing = true;
      this._buffer = '';
      this._emitStatus('Receiving chirp');
      this._callbacks.onMarker?.('start');
      return;
    }

    if (key === 'end') {
      const message = this._buffer;
      this._capturing = false;
      this._buffer = '';
      this._emitStatus(message ? `Message received (${message.length} chars)` : 'Empty message received');
      this._callbacks.onMarker?.('end');
      this._callbacks.onMessage?.(message);
      return;
    }

    this._callbacks.onChar?.(key);
    if (this._capturing) {
      this._buffer += key;
      this._emitStatus(this._buffer);
    }
  }

  /**
   * Forward a status line to the callback.
   * @param {string} status
   */
  _emitStatus(status) {
    const callback = this._callbacks.onStatus;
    if (typeof callback === 'function') callback(status);
  }
}
