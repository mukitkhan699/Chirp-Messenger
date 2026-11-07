/**
 * Call service — audio and video calls over WebRTC (via PeerJS).
 *
 * Responsibilities:
 *  - acquire / release microphone (+ camera) devices
 *  - place, answer and tear down media connections
 *  - expose per-call state: muted, camera on/off, screen sharing
 *  - emit lifecycle events on the bus
 */

import { bus, EVENTS } from '../core/bus.js';

export class MediaService {
  /** @param {import('./peer.js').PeerService} peerService */
  constructor(peerService) {
    this.peerService = peerService;
    /** @type {any} */
    this.call = null;
    this.peerId = null;
    /** @type {MediaStream|null} */
    this.localStream = null;
    /** @type {MediaStream|null} */
    this.remoteStream = null;
    this.muted = false;
    this.cameraOff = false;
    this.sharingScreen = false;
    this.startedAt = null;
    this._screenTrack = null;
  }

  get isInCall() {
    return Boolean(this.call);
  }

  /** Acquire microphone (and camera) media. */
  async getLocalStream({ video = false } = {}) {
    if (this.localStream) return this.localStream;
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 2,
      },
      video: video
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: 'user',
          }
        : false,
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.localStream;
  }

  /** Place a call to a peer. */
  async startCall(peerId, { video = false } = {}) {
    if (this.call) this.endCall('switching');
    const stream = await this.getLocalStream({ video });
    this.peerId = peerId;
    bus.emit(EVENTS.CALL_OUTGOING, { peerId, video });
    const call = this.peerService.peer.call(peerId, stream);
    this._attach(call);
    return call;
  }

  /** Answer an incoming call. */
  async answerCall(call, { video = false } = {}) {
    const stream = await this.getLocalStream({ video });
    this.peerId = call.peer;
    call.answer(stream);
    this._attach(call);
    return call;
  }

  /** Wire up a media connection. */
  _attach(call) {
    this.call = call;

    call.on('stream', (remoteStream) => {
      this.remoteStream = remoteStream;
      bus.emit(EVENTS.MEDIA_TRACK, { stream: remoteStream, kind: 'remote' });
      bus.emit(EVENTS.CALL_CONNECTED, { peerId: call.peer, at: Date.now() });
    });

    call.on('close', () => {
      this._cleanup();
      bus.emit(EVENTS.CALL_ENDED, { peerId: call.peer, reason: 'closed' });
    });

    call.on('error', (error) => {
      this._cleanup();
      bus.emit(EVENTS.CALL_ERROR, { peerId: call.peer, error });
      bus.emit(EVENTS.CALL_ENDED, { peerId: call.peer, reason: 'error' });
    });
  }

  /** End the active call. */
  endCall(reason = 'hangup') {
    if (!this.call) return;
    const peerId = this.peerId;
    try {
      this.call.close();
    } catch {
      /* already closed */
    }
    this._cleanup();
    bus.emit(EVENTS.CALL_ENDED, { peerId, reason });
  }

  /** Stop the local media tracks and reset state. */
  _cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
    }
    if (this._screenTrack) {
      try {
        this._screenTrack.stop();
      } catch {
        /* ignore */
      }
      this._screenTrack = null;
    }
    this.call = null;
    this.peerId = null;
    this.localStream = null;
    this.remoteStream = null;
    this.muted = false;
    this.cameraOff = false;
    this.sharingScreen = false;
    this.startedAt = null;
  }

  /** Toggle the microphone. */
  toggleMute() {
    if (!this.localStream) return this.muted;
    this.muted = !this.muted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.muted;
    });
    bus.emit(EVENTS.MEDIA_TRACK, { kind: 'state', muted: this.muted });
    return this.muted;
  }

  /** Toggle the camera (video calls only). */
  toggleCamera() {
    if (!this.localStream) return this.cameraOff;
    this.cameraOff = !this.cameraOff;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !this.cameraOff;
    });
    bus.emit(EVENTS.MEDIA_TRACK, { kind: 'state', cameraOff: this.cameraOff });
    return this.cameraOff;
  }

  /** Share the screen instead of the camera. */
  async startScreenShare() {
    if (!this.call || !navigator.mediaDevices.getDisplayMedia) return false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return false; // user cancelled
    }
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    this._screenTrack = track;

    const sender = this.call?.peerConnection
      ?.getSenders()
      ?.find((s) => s.track && s.track.kind === 'video');
    if (sender) await sender.replaceTrack(track);

    track.onended = () => this.stopScreenShare();
    this.sharingScreen = true;
    bus.emit(EVENTS.MEDIA_TRACK, { kind: 'state', sharingScreen: true, stream });
    return true;
  }

  /** Revert screen sharing back to the camera. */
  async stopScreenShare() {
    if (!this.sharingScreen) return;
    this.sharingScreen = false;
    if (this._screenTrack) {
      try {
        this._screenTrack.stop();
      } catch {
        /* ignore */
      }
      this._screenTrack = null;
    }
    const cameraTrack = this.localStream?.getVideoTracks()[0] || null;
    const sender = this.call?.peerConnection
      ?.getSenders()
      ?.find((s) => s.track && s.track.kind === 'video');
    if (sender) await sender.replaceTrack(cameraTrack);
    bus.emit(EVENTS.MEDIA_TRACK, { kind: 'state', sharingScreen: false });
  }

  /** Enable/disable the camera track, used when upgrading a call to video. */
  async ensureVideo(on = true) {
    if (!this.localStream) return false;
    const existing = this.localStream.getVideoTracks()[0];
    if (on && !existing) {
      const video = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = video.getVideoTracks()[0];
      this.localStream.addTrack(track);
      const sender = this.call?.peerConnection
        ?.getSenders()
        ?.find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      bus.emit(EVENTS.MEDIA_TRACK, { kind: 'local', stream: this.localStream });
      return true;
    }
    if (!on && existing) {
      existing.stop();
      this.localStream.removeTrack(existing);
    }
    return true;
  }
}
