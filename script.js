// PeerJS and connection variables
let peer;
let conn;
let call;

// Media stream variables
let localStream;
let isMuted = false;

// Call timer variables
let callStartTime;
let callTimerInterval;

// DOM elements
const peerIdElement = document.getElementById('peer-id');
const copyIdButton = document.getElementById('copy-id');
const newIdButton = document.getElementById('new-id');
const remotePeerIdInput = document.getElementById('remote-peer-id');
const connectButton = document.getElementById('connect');
const statusElement = document.getElementById('status');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const chatElement = document.getElementById('chat');
const messageInput = document.getElementById('message');
const sendButton = document.getElementById('send');
const startCallButton = document.getElementById('start-call');
const endCallButton = document.getElementById('end-call');
const muteCallButton = document.getElementById('mute-call');
const callContainer = document.getElementById('call-container');
const remoteAudio = document.getElementById('remote-audio');
const callStatusElement = document.getElementById('call-status');
const callTimerElement = document.getElementById('call-timer');
const chatPeerName = document.getElementById('chat-peer-name');
const chatPeerStatus = document.getElementById('chat-peer-status');
const callPeerName = document.getElementById('call-peer-name');
const callAvatar = document.getElementById('call-avatar');
const userAvatar = document.getElementById('user-avatar');

// Configuration for STUN/TURN servers
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { 
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'muazkh'
    }
];

// Initialize PeerJS
function initializePeer(peerId = null) {
    // Destroy previous peer if exists
    if (peer) {
        peer.destroy();
    }
    
    // Update status to connecting
    updateStatus("Connecting...");
    statusIndicator.className = 'status-indicator';
    statusText.textContent = 'Connecting';
    
    // Create a new Peer
    peer = new Peer(peerId, {
        config: { iceServers: iceServers },
        debug: 3
    });
    
    peer.on('open', (id) => {
        peerIdElement.textContent = id;
        updateStatus("Ready to connect");
        statusIndicator.className = 'status-indicator online';
        statusText.textContent = 'Online';
        
        // Set user avatar to first letter of peer ID
        userAvatar.textContent = id.charAt(0).toUpperCase();
        
        // Initialize microphone permission handling
        initializeMicrophone();
    });
    
    peer.on('connection', (connection) => {
        conn = connection;
        setupDataConnection();
        
        // Enable call button
        startCallButton.disabled = false;
    });
    
    peer.on('call', (incomingCall) => {
        updateStatus(`Incoming call from ${incomingCall.peer}`);
        
        // Set call peer info
        callPeerName.textContent = `Peer ${incomingCall.peer.substring(0, 6)}`;
        callAvatar.textContent = incomingCall.peer.charAt(0).toUpperCase();
        
        // Show call UI
        callStatusElement.textContent = 'Incoming call...';
        endCallButton.classList.add('pulse');
        callContainer.classList.add('active');
        
        // Handle the incoming call
        handleIncomingCall(incomingCall);
    });
    
    peer.on('error', (err) => {
        console.error('Peer error:', err);
        updateStatus("Error: " + err.message, 'error');
        statusIndicator.className = 'status-indicator';
        statusText.textContent = 'Error';
    });
    
    peer.on('disconnected', () => {
        updateStatus("Disconnected. Trying to reconnect...");
        statusIndicator.className = 'status-indicator';
        statusText.textContent = 'Reconnecting';
        peer.reconnect();
    });
}

// Initialize microphone permission handling
async function initializeMicrophone() {
    try {
        // First try to get the stream directly (might work if permission already granted)
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Got local microphone stream");
            return;
        } catch (err) {
            console.log("Initial microphone access failed, will request on call attempt");
        }
        
        // Set up permission request for when user clicks call button
        startCallButton.addEventListener('click', requestMicrophonePermission, { once: true });
        
    } catch (err) {
        console.error("Microphone setup failed:", err);
        updateStatus("Microphone access error", 'error');
    }
}

// Request microphone permission
async function requestMicrophonePermission() {
    try {
        // For Android WebView/WebIntoApp, handle permissions differently
        if (window.Android) {
            try {
                const hasPermission = await new Promise((resolve) => {
                    if (typeof Android.hasPermission === 'function') {
                        resolve(Android.hasPermission("android.permission.RECORD_AUDIO"));
                    } else {
                        resolve(false);
                    }
                });
                
                if (!hasPermission) {
                    const granted = await new Promise((resolve) => {
                        if (typeof Android.requestPermission === 'function') {
                            Android.requestPermission("android.permission.RECORD_AUDIO", (result) => {
                                resolve(result === 'granted');
                            });
                        } else {
                            resolve(false);
                        }
                    });
                    
                    if (!granted) {
                        throw new Error("Permission denied by Android");
                    }
                }
            } catch (androidErr) {
                console.error("Android permission error:", androidErr);
                throw androidErr;
            }
        }
        
        // Now request browser permission
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone access granted");
        
        // Retry the call now that we have permission
        if (conn && conn.open) {
            startCallAfterPermissionGranted();
        }
        
    } catch (err) {
        console.error("Failed to get microphone access:", err);
        updateStatus("Microphone access denied - can't make calls", 'error');
    }
}

// Handle incoming call with proper permission checking
async function handleIncomingCall(incomingCall) {
    try {
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                console.error("Failed to get microphone for incoming call:", err);
                updateStatus("Can't answer call - no microphone access", 'error');
                incomingCall.close();
                return;
            }
        }
        
        // Answer the call with our local stream
        incomingCall.answer(localStream);
        call = incomingCall;
        
        setupCall();
    } catch (err) {
        console.error("Error handling incoming call:", err);
        updateStatus("Error answering call", 'error');
    }
}

// Set up data connection for text chat
function setupDataConnection() {
    conn.on('open', () => {
        updateStatus(`Connected to ${conn.peer}`, 'connected');
        messageInput.disabled = false;
        sendButton.disabled = false;
        startCallButton.disabled = false;
        
        // Update chat header
        chatPeerName.textContent = `Peer ${conn.peer.substring(0, 6)}`;
        chatPeerStatus.textContent = 'Online';
        chatPeerStatus.innerHTML = `<span style="color: var(--online)">●</span> Online`;
        
        addSystemMessage(`Connected to peer ${conn.peer}`);
    });
    
    conn.on('data', (data) => {
        addMessage(data, 'remote');
    });
    
    conn.on('close', () => {
        updateStatus("Connection closed");
        messageInput.disabled = true;
        sendButton.disabled = true;
        startCallButton.disabled = true;
        
        // Update chat header
        chatPeerName.textContent = 'Not connected';
        chatPeerStatus.textContent = 'Offline';
        chatPeerStatus.innerHTML = `<span style="color: var(--offline)">●</span> Offline`;
        
        if (call) {
            endCurrentCall();
        }
        
        addSystemMessage("Connection closed");
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        updateStatus("Connection error: " + err.message, 'error');
    });
}

// Set up a voice call
function setupCall() {
    call.on('stream', (remoteStream) => {
        // Update call UI
        callStatusElement.textContent = 'Call in progress';
        endCallButton.classList.remove('pulse');
        startCallTimer();
        
        // Play the remote audio stream
        remoteAudio.srcObject = remoteStream;
    });
    
    call.on('close', () => {
        endCurrentCall();
        updateCallStatus("Call ended");
    });
    
    call.on('error', (err) => {
        console.error('Call error:', err);
        endCurrentCall();
        updateCallStatus("Call error: " + err.message);
    });
}

// Start call timer
function startCallTimer() {
    callStartTime = new Date();
    clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(() => {
        const now = new Date();
        const duration = new Date(now - callStartTime);
        const minutes = duration.getMinutes().toString().padStart(2, '0');
        const seconds = duration.getSeconds().toString().padStart(2, '0');
        callTimerElement.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

// End the current call
function endCurrentCall() {
    if (call) {
        call.close();
        call = null;
    }
    
    // Hide call UI
    callContainer.classList.remove('active');
    endCallButton.classList.remove('pulse');
    
    // Clear timer
    clearInterval(callTimerInterval);
    callTimerElement.textContent = '00:00';
    
    // Reset audio
    remoteAudio.srcObject = null;
}

// Toggle mute state
function toggleMute() {
    if (!localStream) return;
    
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });
    
    // Update mute button icon
    muteCallButton.innerHTML = isMuted ? 
        `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>` :
        `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>`;
    
    muteCallButton.title = isMuted ? "Unmute" : "Mute";
    
    updateCallStatus(isMuted ? "You are muted" : "You are unmuted");
}

// Start call after permission is granted
function startCallAfterPermissionGranted() {
    if (!localStream) {
        updateStatus("Microphone still not available", 'error');
        return;
    }
    actuallyStartCall();
}

// Core call initiation logic
function actuallyStartCall() {
    updateStatus(`Calling ${conn.peer}...`, 'calling');
    
    // Set call peer info
    callPeerName.textContent = `Peer ${conn.peer.substring(0, 6)}`;
    callAvatar.textContent = conn.peer.charAt(0).toUpperCase();

    // Show call UI
    callStatusElement.textContent = "Calling...";
    endCallButton.classList.add('pulse');
    callContainer.classList.add('active');

    // Make the call
    call = peer.call(conn.peer, localStream);
    setupCall();
}

// Modified startCall function to handle permission flow
function startCall() {
    if (!conn || !conn.open) {
        updateStatus("Must be connected to a peer first", 'error');
        return;
    }

    if (!localStream) {
        updateStatus("Please allow microphone access...", 'calling');
        return;
    }

    actuallyStartCall();
}

// Add a message to the chat UI
function addMessage(message, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `message-${type}`);
    
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');
    bubble.textContent = message;
    
    const time = document.createElement('div');
    time.classList.add('message-time');
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    time.textContent = `${hours}:${minutes}`;
    
    messageElement.appendChild(bubble);
    messageElement.appendChild(time);
    
    chatElement.appendChild(messageElement);
    chatElement.scrollTop = chatElement.scrollHeight;
}

// Add a system message to the chat UI
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message-system');
    messageElement.textContent = message;
    chatElement.appendChild(messageElement);
    chatElement.scrollTop = chatElement.scrollHeight;
}

// Update connection status
function updateStatus(message, type = '') {
    statusElement.textContent = message;
    statusElement.className = type ? `status-message ${type}` : 'status-message';
}

// Update call status
function updateCallStatus(message) {
    callStatusElement.textContent = message;
}

// Event listeners
copyIdButton.addEventListener('click', () => {
    navigator.clipboard.writeText(peerIdElement.textContent);
    addSystemMessage("Peer ID copied to clipboard");
});

newIdButton.addEventListener('click', () => {
    initializePeer();
    addSystemMessage("Generated new peer ID");
});

connectButton.addEventListener('click', () => {
    const remotePeerId = remotePeerIdInput.value.trim();
    if (!remotePeerId) {
        alert("Please enter a peer ID");
        return;
    }
    
    if (conn) {
        conn.close();
    }
    
    conn = peer.connect(remotePeerId, {
        reliable: true,
        serialization: 'none'
    });
    
    setupDataConnection();
});

sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea as user types
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
});

startCallButton.addEventListener('click', startCall);

endCallButton.addEventListener('click', endCurrentCall);

muteCallButton.addEventListener('click', toggleMute);

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    try {
        conn.send(message);
        addMessage(message, 'local');
        messageInput.value = '';
        messageInput.style.height = 'auto';
    } catch (err) {
        console.error('Send error:', err);
        updateStatus("Error sending message", 'error');
    }
}

// Initialize the app
initializePeer();
