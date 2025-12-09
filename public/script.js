const socket = io();
const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");
const screens = {
  start: document.getElementById("start-screen"),
  waiting: document.getElementById("waiting-screen"),
  chat: document.getElementById("chat-screen"),
  disconnected: document.getElementById("disconnected-screen"),
};

let localStream;
let remoteStream;
let peerConnection;
let roomId;
let isInitiator = false;
let muted = false;
let videoStopped = false;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Screen management
function showScreen(screenName) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[screenName].classList.add("active");
}

// Get user media
async function getUserMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert("Could not access camera/microphone. Please check permissions.");
  }
}

// WebRTC functions
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(servers);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        roomId: roomId,
        candidate: event.candidate,
      });
    }
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    remoteStream = event.streams[0];
  };

  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

async function createOffer() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { roomId: roomId, offer: offer });
}

async function createAnswer() {
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { roomId: roomId, answer: answer });
}

// Socket event handlers
socket.on("waiting", () => {
  showScreen("waiting");
});

socket.on("paired", async (data) => {
  roomId = data.roomId;
  isInitiator = data.isInitiator;

  showScreen("chat");
  createPeerConnection();

  if (isInitiator) {
    await createOffer();
  }
});

socket.on("offer", async (offer) => {
  await peerConnection.setRemoteDescription(offer);
  await createAnswer();
});

socket.on("answer", async (answer) => {
  await peerConnection.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {
  await peerConnection.addIceCandidate(candidate);
});

socket.on("partner-disconnected", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  showScreen("disconnected");
});

// Button event handlers
document.getElementById("start-btn").addEventListener("click", () => {
  getUserMedia().then(() => {
    socket.emit("join-chat");
  });
});

document.getElementById("cancel-btn").addEventListener("click", () => {
  socket.emit("disconnect");
  showScreen("start");
});

document.getElementById("mute-btn").addEventListener("click", () => {
  muted = !muted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
  document.getElementById("mute-btn").textContent = muted
    ? "בטל השתקה"
    : "השתק";
});

document.getElementById("video-btn").addEventListener("click", () => {
  videoStopped = !videoStopped;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !videoStopped;
  });
  document.getElementById("video-btn").textContent = videoStopped
    ? "הפעל וידאו"
    : "עצור וידאו";
});

document.getElementById("next-btn").addEventListener("click", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  socket.emit("join-chat");
});

document.getElementById("end-btn").addEventListener("click", () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  socket.disconnect();
  location.reload();
});

document.getElementById("restart-btn").addEventListener("click", () => {
  socket.connect();
  socket.emit("join-chat");
});
