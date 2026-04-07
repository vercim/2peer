// ── DOM ───────────────────────────────────────────────────────────────────────
const selfIdEl = document.getElementById("selfId");
const remoteIdInput = document.getElementById("remoteIdInput");
const callBtn = document.getElementById("callBtn");
const hangupBtn = document.getElementById("hangupBtn");
const copyIdBtn = document.getElementById("copyIdBtn");
const regenIdBtn = document.getElementById("regenIdBtn");
const statusLog = document.getElementById("statusLog");
const localVideoEl = document.getElementById("localVideo");
const remoteVideoEl = document.getElementById("remoteVideo");
const localMeta = document.getElementById("localMeta");
const remoteMeta = document.getElementById("remoteMeta");
const serverTag = document.getElementById("serverTag");
const incomingCallEl = document.getElementById("incomingCall");
const callerIdLabel = document.getElementById("callerIdLabel");
const sourcePickerOverlay = document.getElementById("sourcePickerOverlay");
const sourcePickerContent = document.getElementById("sourcePickerContent");
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmMsg = document.getElementById("confirmMsg");
const confirmOk = document.getElementById("confirmOk");
const confirmCancel = document.getElementById("confirmCancel");
const broadcastBtn = document.getElementById("broadcastBtn");
const changeSourceBtn = document.getElementById("changeSourceBtn");
const statusDot = document.getElementById("statusDot");

const localVideo = localVideoEl;
const remoteVideo = remoteVideoEl;

// ── State ─────────────────────────────────────────────────────────────────────
let selfId = "";
let currentPeerId = "";
let supabaseClient = null;
let myChannel = null;
let supabaseConfig = null;
let pc = null;
let localStream = null;
let pendingIce = [];
let isPolite = false;
let incomingCallData = null;
let reconnectTimer = null;
let isBroadcasting = false;
let isStoppingBroadcast = false;

const rtcConfig = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

function setStatus(msg, isErr = false) {
  const entry = document.createElement("div");
  entry.className = "entry" + (isErr ? " error" : "");
  entry.innerHTML = msg;
  statusLog.appendChild(entry);
  statusLog.scrollTop = statusLog.scrollHeight;

  while (statusLog.children.length > 50) {
    statusLog.removeChild(statusLog.firstChild);
  }
}

function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMsg.innerHTML = message;
    confirmOverlay.classList.remove("hidden");
    confirmOverlay.classList.add("flex");
    const onOk = () => {
      confirmOverlay.classList.add("hidden");
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      resolve(true);
    };
    const onCancel = () => {
      confirmOverlay.classList.add("hidden");
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      resolve(false);
    };
    confirmOk.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
  });
}

// ── Source Picker ─────────────────────────────────────────────────────────────
async function showSourcePicker() {
  const sources = await window.electronAPI.getSources();
  sourcePickerContent.innerHTML = "";
  const screens = sources.filter((s) => s.isScreen);
  const windows = sources.filter((s) => !s.isScreen);

  return new Promise((resolve) => {
    function renderSection(label, items) {
      if (!items.length) return;
      const lbl = document.createElement("div");
      lbl.className = "source-section-label";
      lbl.textContent = label;
      // Center section labels horizontally
      lbl.style.display = "block";
      lbl.style.width = "100%";
      lbl.style.textAlign = "center";
      sourcePickerContent.appendChild(lbl);
      const grid = document.createElement("div");
      grid.className = "source-grid";
      // Make the list of windows a responsive CSS grid
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(120px, 1fr))";
      grid.style.gap = "12px";
      items.forEach((src) => {
        const item = document.createElement("div");
        item.className = "source-item";
        item.innerHTML = `<img class="source-thumb" src="${src.thumbnail}" alt="" /><div class="source-name">${src.name}</div>`;
        item.addEventListener("click", async () => {
          await window.electronAPI.setPendingSource(src.id);
          sourcePickerOverlay.classList.add("hidden");
          resolve(src.id);
        });
        grid.appendChild(item);
      });
      sourcePickerContent.appendChild(grid);
    }

    renderSection("Screens", screens);
    renderSection("Windows", windows);
    sourcePickerOverlay.classList.remove("hidden");
    sourcePickerOverlay.classList.add("flex");

    const closeBtn = document.getElementById("sourcePickerClose");
    const onClose = () => {
      sourcePickerOverlay.classList.add("hidden");
      closeBtn.removeEventListener("click", onClose);
      resolve(null);
    };
    closeBtn.addEventListener("click", onClose);
  });
}

function cleanupLocalStream() {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  localMeta.textContent = "—";
  if (isBroadcasting) {
    isBroadcasting = false;
    broadcastBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              Broadcast`;
    changeSourceBtn.classList.add("hidden");
  }
}

function cleanupRemoteStream() {
  remoteVideo.srcObject = null;
  remoteMeta.textContent = "—";
}

// ── Screen capture ────────────────────────────────────────────────────────────
async function ensureLocalScreen() {
  if (localStream && localStream.active) return localStream;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 7680, max: 7680 },
      height: { ideal: 4320, max: 4320 },
      frameRate: { ideal: 60, max: 60 },
      displaySurface: "monitor",
    },
    audio: false,
    selfBrowserSurface: "exclude",
  });

  const [track] = stream.getVideoTracks();
  track.contentHint = "detail";
  await track
    .applyConstraints({
      width: { ideal: 7680 },
      height: { ideal: 4320 },
      frameRate: { ideal: 60, max: 60 },
    })
    .catch(() => {});

  track.onended = () => {
    stopBroadcast();
    if (currentPeerId && pc && pc.connectionState === "connected") {
      send({ type: "stop-broadcast", to: currentPeerId });
    }
  };

  localStream = stream;
  localVideo.srcObject = stream;

  const s = track.getSettings ? track.getSettings() : {};
  localMeta.textContent = `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || 60)}fps`;
  return stream;
}

// ── Quality encoding ──────────────────────────────────────────────────────────
function applyMaxQualityEncoding(sender) {
  if (!sender || sender.track?.kind !== "video") return;
  const params = sender.getParameters();
  params.encodings ??= [{}];
  const s = sender.track?.getSettings?.() || {};
  const pixels = (s.width || 1920) * (s.height || 1080);
  let maxBitrate;
  if (pixels >= 3840 * 2160) maxBitrate = 80_000_000;
  else if (pixels >= 2560 * 1440) maxBitrate = 40_000_000;
  else if (pixels >= 1920 * 1080) maxBitrate = 20_000_000;
  else maxBitrate = 15_000_000;

  params.encodings.forEach((enc) => {
    enc.maxBitrate = maxBitrate;
    enc.maxFramerate = 60;
    enc.scaleResolutionDownBy = 1.0;
    enc.priority = "high";
    enc.networkPriority = "high";
  });
  sender.setParameters(params).catch(console.error);
}

// Helpers to manage remote stream placeholder UI
function streamHasVideo(stream) {
  try {
    return (
      stream &&
      stream.getVideoTracks &&
      stream.getVideoTracks().length > 0 &&
      stream.getVideoTracks().some((t) => t.readyState === "live")
    );
  } catch {
    return false;
  }
}

function showRemotePlaceholder() {
  const wrap = document.getElementById("remoteVideoWrap");
  if (wrap) wrap.classList.add("placeholder");
}

function hideRemotePlaceholder() {
  const wrap = document.getElementById("remoteVideoWrap");
  if (wrap && streamHasVideo(remoteVideo.srcObject))
    wrap.classList.remove("placeholder");
}

// ── PeerConnection ────────────────────────────────────────────────────────────
function createPeerConnection(peerId) {
  currentPeerId = peerId;
  pc = new RTCPeerConnection(rtcConfig);
  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  pc.ontrack = (event) => {
    document.getElementById("remoteVideoWrap").classList.remove("placeholder");
    const stream = event?.streams?.[0];
    if (stream) {
      stream.getTracks().forEach((t) => remoteStream.addTrack(t));
      // Attach per-track state listeners for remote video
      stream.getVideoTracks().forEach((track) => {
        track.onmute = () => {
          if (!streamHasVideo(stream)) showRemotePlaceholder();
        };
        track.onunmute = () => {
          if (streamHasVideo(stream)) hideRemotePlaceholder();
        };
        track.onended = () => showRemotePlaceholder();
      });
      if (!streamHasVideo(stream)) {
        showRemotePlaceholder();
      }
    }
    const s = event.track.getSettings ? event.track.getSettings() : {};
    remoteMeta.textContent = `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || "?")}fps`;
    setStatus(
      `Connected to <strong style="font-family:monospace">${peerId}</strong>.`,
    );
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate && currentPeerId)
      send({ type: "candidate", to: currentPeerId, candidate });
  };

  pc.onconnectionstatechange = () => {
    const st = pc?.connectionState;
    console.log("[connectionState]", st);
    if (st === "connected") {
      statusDot.style.backgroundColor = "#4ade80";
      setStatus(
        `Connection active with <strong style="font-family:monospace">${currentPeerId}</strong>.`,
      );
    }
    if (st === "failed") {
      statusDot.style.backgroundColor = "#f87171";
      setStatus("P2P connection failed.", true);
    }
    if (st === "disconnected") {
      statusDot.style.backgroundColor = "#facc15";
      setStatus("Connection lost.");
    }
    if (st === "closed") {
      statusDot.style.backgroundColor = "#888";
      setStatus("Connection closed.");
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("[iceConnectionState]", pc?.iceConnectionState);
    if (pc?.iceConnectionState === "failed") pc.restartIce();
  };

  return pc;
}

async function attachLocalTracks() {
  if (!localStream || !localStream.active) {
    console.log("[attachLocalTracks] no stream or not active");
    return;
  }
  const stream = localStream;
  const existing = new Set(
    (pc.getSenders() || []).map((s) => s.track?.id).filter(Boolean),
  );
  console.log("[attachLocalTracks] existing senders:", existing.size);
  for (const track of stream.getTracks()) {
    console.log("[attachLocalTracks] adding track:", track.kind, track.id);
    if (!existing.has(track.id)) {
      const sender = pc.addTrack(track, stream);
      setTimeout(() => applyMaxQualityEncoding(sender), 500);
    }
  }
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
broadcastBtn.addEventListener("click", async () => {
  if (isBroadcasting) {
    stopBroadcast();
    return;
  }

  const sourceId = await showSourcePicker();
  if (!sourceId) return;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  try {
    await ensureLocalScreen();
    await startBroadcast();
  } catch (e) {
    setStatus(e.message || "Failed to capture screen.", true);
  }
});

async function startBroadcast() {
  if (!localStream || !localStream.active) {
    setStatus("No broadcast to send.", true);
    return;
  }

  document.getElementById("localVideoWrap").classList.remove("placeholder");
  localVideo.srcObject = localStream;

  if (pc && pc.connectionState === "connected" && currentPeerId) {
    await attachLocalTracks();
    await new Promise((r) => setTimeout(r, 100));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({
      type: "renegotiate",
      to: currentPeerId,
      offer: pc.localDescription,
    });
  }

  isBroadcasting = true;
  broadcastBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              Stop`;
  changeSourceBtn.classList.remove("hidden");
  setStatus("Broadcast started.");
}

function stopBroadcast() {
  if (isStoppingBroadcast) return;
  isStoppingBroadcast = true;

  if (pc && pc.connectionState === "connected") {
    pc.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === "video") {
        try {
          pc.removeTrack(sender);
        } catch (_) {}
      }
    });
  }

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  document.getElementById("localVideoWrap").classList.add("placeholder");
  localVideo.srcObject = null;

  isBroadcasting = false;
  broadcastBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              Broadcast`;
  changeSourceBtn.classList.add("hidden");
  localMeta.textContent = "—";
  setStatus("Broadcast stopped.");

  if (currentPeerId && pc && pc.connectionState === "connected") {
    send({ type: "stop-broadcast", to: currentPeerId });
  }

  setTimeout(() => {
    isStoppingBroadcast = false;
  }, 100);
}

changeSourceBtn.addEventListener("click", async () => {
  const sourceId = await showSourcePicker();
  if (!sourceId) return;

  try {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    await ensureLocalScreen();
    await startBroadcast();
    setStatus("Broadcast source changed.");
  } catch (e) {
    setStatus(e.message || "Failed to change source.", true);
  }
});

// ── Supabase Signaling ────────────────────────────────────────────────────────
// ── Supabase Signaling ────────────────────────────────────────────────────────
let outChannel = null; // persistent channel for sending to current peer

async function connectSupabase(url, key) {
  console.log("[Supabase] connecting to:", url);
  console.log("[Supabase] supabase lib available:", typeof window.supabase);

  if (!window.supabase) {
    setStatus("Error: Supabase library not loaded.", true);
    return;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = window.supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      serverTag.textContent = "Supabase Realtime";
    } catch (e) {
      console.log("[Supabase] createClient error:", e);
      setStatus("Supabase initialization error: " + e.message, true);
      return;
    }
  }

  if (myChannel) {
    try {
      await supabaseClient.removeChannel(myChannel);
    } catch (_) {}
    myChannel = null;
    await new Promise((r) => setTimeout(r, 200));
  }

  myChannel = supabaseClient.channel(`peer:${selfId}`, {
    config: { broadcast: { self: false } },
  });

  myChannel
    .on("broadcast", { event: "signal" }, ({ payload }) => {
      handleSignal(payload).catch((e) =>
        setStatus(e.message || "Signaling error.", true),
      );
    })
    .subscribe((status) => {
      console.log("[Supabase] status:", status);
      if (status === "SUBSCRIBED") {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        setStatus('Ready. Share your ID and click "Call".');
      }
      if (status === "CHANNEL_ERROR") {
        console.log("[Supabase] CHANNEL_ERROR - checking connection...");
        setStatus("Channel error. Attempting to reconnect...");
        if (!reconnectTimer && supabaseConfig) {
          reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            await connectSupabase(
              supabaseConfig.supabaseUrl,
              supabaseConfig.supabaseKey,
            ).catch((e) => {
              console.log("[Supabase] reconnect failed:", e);
            });
          }, 3000);
        }
      }
      if (status === "TIMED_OUT") {
        setStatus("Connection timeout. Retrying...");
        if (!reconnectTimer && supabaseConfig) {
          reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            await connectSupabase(
              supabaseConfig.supabaseUrl,
              supabaseConfig.supabaseKey,
            ).catch(() => {});
          }, 2000);
        }
      }
      if (status === "CLOSED") {
        console.log("[Supabase] connection closed");
        setStatus("Connection closed.");
      }
    });
}

// Create outgoing channel to peer once and reuse
async function ensureOutChannel(peerId) {
  if (outChannel && outChannel._topic === `realtime:peer:${peerId}`) return;

  if (outChannel) {
    try {
      await supabaseClient.removeChannel(outChannel);
    } catch (_) {}
    outChannel = null;
  }

  const ch = supabaseClient.channel(`peer:${peerId}`, {
    config: { broadcast: { self: false } },
  });

  console.log("[ensureOutChannel] subscribing to peer:", peerId);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (outChannel) {
        console.log("[ensureOutChannel] timeout but channel exists, using it");
        resolve();
      } else {
        reject(new Error("Failed to connect to peer (timeout)"));
      }
    }, 8000);
    ch.subscribe((status) => {
      console.log("[ensureOutChannel] subscribe status:", status);
      clearTimeout(timer);
      if (status === "SUBSCRIBED") {
        outChannel = ch;
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(new Error("Failed to connect to peer (" + status + ")"));
      } else {
        outChannel = ch;
        resolve();
      }
    });
  });
}

async function send(payload) {
  if (!supabaseClient) {
    setStatus("No connection to Supabase.", true);
    return;
  }
  try {
    console.log("[send] ensuring channel to", payload.to);
    await ensureOutChannel(payload.to);
    console.log("[send] sending payload", payload.type);
    await outChannel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, from: selfId },
    });
    console.log("[send] done");
  } catch (e) {
    console.error("[send error]", e.message);
    setStatus("Send error: " + e.message, true);
  }
}

async function handleSignal(msg) {
  console.log("[signal received]", msg.type, "from", msg.from);

  if (msg.type === "call") handleIncomingCall(msg);
  if (msg.type === "answer") await handleAnswer(msg);
  if (msg.type === "candidate") await handleCandidate(msg);
  if (msg.type === "renegotiate") await handleRenegotiate(msg);
  if (msg.type === "renegotiate-answer") await handleRenegotiateAnswer(msg);
  if (msg.type === "stop-broadcast") {
    handleRemoteBroadcastStopped();
  }
  if (msg.type === "decline") {
    setStatus(
      `<strong style="font-family:monospace">${msg.from}</strong> declined the call.`,
    );
    hangup(false);
  }
  if (msg.type === "hangup") {
    setStatus(
      `<strong style="font-family:monospace">${msg.from}</strong> ended the call.`,
    );
    hangup(false);
  }
  if (msg.type === "error") setStatus(msg.message, true);
}

function handleRemoteBroadcastStopped() {
  console.log("[handleRemoteBroadcastStopped]");
  if (remoteVideo.srcObject) {
    const stream = remoteVideo.srcObject;
    stream.getTracks().forEach((t) => t.stop());
    remoteVideo.srcObject = null;
  }
  document.getElementById("remoteVideoWrap").classList.add("placeholder");
  remoteMeta.textContent = "—";
  setStatus("Peer broadcast ended.");
}

// ── Call flow ─────────────────────────────────────────────────────────────────
async function startCall() {
  const peerId = remoteIdInput.value.trim();
  if (!peerId) {
    setStatus("Enter peer ID.", true);
    return;
  }
  if (peerId === selfId) {
    setStatus("Cannot call yourself.", true);
    return;
  }
  const ok = await showConfirm(`Call <strong>${peerId}</strong>?`);
  if (!ok) return;
  hangup(false);
  isPolite = false;
  createPeerConnection(peerId);
  await attachLocalTracks();
  await pc.setLocalDescription(
    await pc.createOffer({ offerToReceiveVideo: true }),
  );
  send({ type: "call", to: peerId, offer: pc.localDescription });
  setStatus(
    `Calling <strong style="font-family:monospace">${peerId}</strong>...`,
  );
}

function handleIncomingCall({ from, offer }) {
  incomingCallData = { from, offer };
  // Show the incoming call widget: remove any hidden state and display it
  incomingCallEl.classList.remove("hidden");
  incomingCallEl.classList.add("flex");
  incomingCallEl.classList.add("active");
  callerIdLabel.textContent = from;
  setStatus(
    `Incoming call from <strong style="font-family:monospace">${from}</strong>.`,
  );
}

async function acceptCall() {
  if (!incomingCallData) return;
  const { from, offer } = incomingCallData;
  incomingCallData = null;
  // Hide the incoming call widget after accepting
  incomingCallEl.classList.remove("active");
  incomingCallEl.classList.add("hidden");
  if (pc) {
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    pc = null;
  }
  isPolite = true;
  createPeerConnection(from);
  await attachLocalTracks();
  await pc.setRemoteDescription(offer);
  for (const c of pendingIce) await pc.addIceCandidate(c);
  pendingIce = [];
  await pc.setLocalDescription(await pc.createAnswer());
  send({ type: "answer", to: from, answer: pc.localDescription });
  setStatus(
    `Call accepted. Connecting to <strong style="font-family:monospace">${from}</strong>...`,
  );
}

function declineCall() {
  if (!incomingCallData) return;
  const { from } = incomingCallData;
  incomingCallData = null;
  // Hide the incoming call widget after declining
  incomingCallEl.classList.remove("active");
  incomingCallEl.classList.add("hidden");
  send({ type: "decline", to: from });
  setStatus(
    `Call from <strong style="font-family:monospace">${from}</strong> declined.`,
  );
}

async function handleAnswer({ from, answer }) {
  console.log("[handleAnswer] setting remote description");
  if (!pc) return;
  await pc.setRemoteDescription(answer);
  pc.getSenders().forEach(applyMaxQualityEncoding);
  setStatus(
    `<strong style="font-family:monospace">${from}</strong> accepted the call.`,
  );
  console.log("[handleAnswer] done, pc.connectionState:", pc.connectionState);
}

async function handleRenegotiate({ from, offer }) {
  console.log(
    "[handleRenegotiate] from",
    from,
    "signalingState:",
    pc?.signalingState,
  );
  if (!pc || pc.signalingState === "closed") {
    console.log("[handleRenegotiate] no pc or closed");
    return;
  }

  await pc.setRemoteDescription(offer);
  for (const c of pendingIce) await pc.addIceCandidate(c).catch(() => {});
  pendingIce = [];
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  send({ type: "renegotiate-answer", to: from, answer: pc.localDescription });
  console.log("[handleRenegotiate] sent answer");
}

async function handleRenegotiateAnswer({ from, answer }) {
  console.log("[handleRenegotiateAnswer] from", from);
  if (!pc) return;
  await pc.setRemoteDescription(answer);
  pc.getSenders().forEach(applyMaxQualityEncoding);
}

async function handleCandidate({ candidate }) {
  if (!candidate) return;
  if (!pc || !pc.remoteDescription) {
    pendingIce.push(candidate);
    return;
  }
  try {
    await pc.addIceCandidate(candidate);
  } catch (_) {}
}

function hangup(notify = true) {
  if (notify && currentPeerId) {
    send({ type: "hangup", to: currentPeerId });
  }
  if (outChannel) {
    supabaseClient?.removeChannel(outChannel).catch(() => {});
    outChannel = null;
  }
  if (pc) {
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
  }
  pc = null;
  currentPeerId = "";
  pendingIce = [];
  incomingCallData = null;
  // Ensure incoming call widget is hidden when hangup occurs
  incomingCallEl.classList.remove("active");
  incomingCallEl.classList.add("hidden");
  statusDot.style.backgroundColor = "#888";
  cleanupLocalStream();
  cleanupRemoteStream();
}

// ── PiP & Fullscreen ──────────────────────────────────────────────────────────
const fullscreenOverlay = document.getElementById("fullscreenOverlay");
const fullscreenVideo = document.getElementById("fullscreenVideo");
const fullscreenLabel = document.getElementById("fullscreenLabel");
let fsControlsTimeout = null;

document.getElementById("pipBtn").addEventListener("click", async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await remoteVideo.requestPictureInPicture();
  } catch (e) {
    setStatus("PiP not supported for this source.", true);
  }
});

let fsWindowOpen = false;
let fsHideTimeout = null;

function showFsControls() {
  const controls = document.getElementById("fsControls");
  const centerClose = document.getElementById("fsCenterClose");
  controls.style.display = "flex";
  centerClose.style.display = "flex";
  clearTimeout(fsHideTimeout);
  fsHideTimeout = setTimeout(() => {
    controls.style.display = "none";
    centerClose.style.display = "none";
  }, 3000);
}

document.getElementById("fullscreenBtn").addEventListener("click", async () => {
  const wrap = document.getElementById("remoteVideoWrap");
  if (wrap.requestFullscreen) {
    await wrap.requestFullscreen();
  } else if (wrap.webkitRequestFullscreen) {
    await wrap.webkitRequestFullscreen();
  }
  fsWindowOpen = true;
  showFsControls();
});

document.addEventListener("mousemove", () => {
  if (fsWindowOpen) showFsControls();
});

document.getElementById("fsExitBtn").addEventListener("click", () => {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
});

document.getElementById("fsCenterClose").addEventListener("click", () => {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    fsWindowOpen = false;
    clearTimeout(fsHideTimeout);
    document.getElementById("fsControls").style.display = "none";
    document.getElementById("fsCenterClose").style.display = "none";
  }
});

document.addEventListener("webkitfullscreenchange", () => {
  if (!document.webkitFullscreenElement) {
    fsWindowOpen = false;
    clearTimeout(fsHideTimeout);
    document.getElementById("fsControls").style.display = "none";
    document.getElementById("fsCenterClose").style.display = "none";
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && fsWindowOpen) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
});

// ── Window controls ───────────────────────────────────────────────────────────
document
  .getElementById("btnMinimize")
  .addEventListener("click", () => window.electronAPI.minimizeWindow());
document
  .getElementById("btnClose")
  .addEventListener("click", () => window.electronAPI.closeWindow());

// ── Event listeners ───────────────────────────────────────────────────────────
copyIdBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(selfId);
  setStatus("ID copied.");
});

regenIdBtn.addEventListener("click", async () => {
  const ok = await showConfirm("Reset ID? Current ID will become unavailable.");
  if (!ok) return;
  try {
    if (myChannel) {
      await supabaseClient.removeChannel(myChannel).catch(() => {});
      myChannel = null;
      await new Promise((r) => setTimeout(r, 200));
    }
    const profile = await window.electronAPI.regenerateProfile();
    selfId = profile.id;
    selfIdEl.textContent = selfId;
    await connectSupabase(
      supabaseConfig.supabaseUrl,
      supabaseConfig.supabaseKey,
    );
    setStatus("New ID created.");
  } catch (e) {
    setStatus(e.message || "Failed to change ID.", true);
  }
});

callBtn.addEventListener("click", () => {
  startCall().catch((e) => setStatus(e.message || "Call error.", true));
});

hangupBtn.addEventListener("click", async () => {
  if (!currentPeerId && !pc) {
    setStatus("No active call.");
    return;
  }
  const ok = await showConfirm("End call?");
  if (!ok) return;
  hangup(true);
  setStatus("Call ended.");
});

document.getElementById("acceptBtn").addEventListener("click", () => {
  acceptCall().catch((e) => setStatus(e.message || "Call accept error.", true));
});
document.getElementById("declineBtn").addEventListener("click", declineCall);

window.addEventListener("beforeunload", () => hangup(true));

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  const profile = await window.electronAPI.getProfile();
  const version = await window.electronAPI.getVersion();
  versionTag.textContent = "v" + version;
  supabaseConfig = await window.electronAPI.getConfig();
  selfId = profile.id;
  selfIdEl.textContent = selfId;
  await connectSupabase(supabaseConfig.supabaseUrl, supabaseConfig.supabaseKey);
})();
