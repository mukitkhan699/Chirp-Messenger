/**
 * UI ↔ app bridge.
 *
 * The UI modules never import the transport directly; they call through this
 * bridge, which `main.js` fills in at boot. That keeps the dependency
 * direction one-way (UI → bridge → runtime → services) and makes the UI
 * trivially testable in isolation.
 */

export const bridge = {
  /** Send a text message. */
  sendMessage: () => {},
  /** Send an attachment. */
  sendFile: () => {},
  /** Send a typing indicator. */
  sendTyping: () => {},
  /** Send a read receipt. */
  sendRead: () => {},
  /** Send a reaction. */
  sendReaction: () => {},
  /** Send an edit. */
  sendEdit: () => {},
  /** Send a delete. */
  sendDelete: () => {},
  /** Place a call. */
  startCall: () => {},
  /** Answer an incoming call (pass null to decline). */
  answerCall: () => {},
  /** End the active call. */
  endCall: () => {},
  /** Toggle the microphone; returns the new muted state. */
  toggleMute: () => false,
  /** Toggle the camera; returns the new camera-off state. */
  toggleCamera: () => false,
  /** Toggle screen sharing; returns the new sharing state. */
  toggleScreenShare: () => false,
  /** Play text as audible tones. */
  sendChirp: () => {},
  /** Stop chirp playback / listening. */
  stopChirp: () => {},
  /** Connect to a peer. */
  connect: () => {},
  /** Disconnect from a peer. */
  disconnect: () => {},
};
