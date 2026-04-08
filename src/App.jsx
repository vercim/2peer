import { useState, useRef, useEffect, useCallback } from "react";
import { TitleBar } from "./components/TitleBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { VideoPanel } from "./components/VideoPanel.jsx";
import { SourcePicker } from "./components/SourcePicker.jsx";
import { ConfirmDialog } from "./components/ConfirmDialog.jsx";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
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
  iceCandidatePoolSize: 10,
  sdpSemantics: "unified-plan",
};

function applyMaxQualityEncoding(sender) {
  if (!sender || sender.track?.kind !== "video") return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.encodings.forEach((enc) => {
    enc.maxBitrate = 15_000_000;
    enc.maxFramerate = 60;
    enc.scaleResolutionDownBy = 1.0;
    enc.priority = "high";
    enc.networkPriority = "high";
  });
  sender.setParameters(params).catch(console.error);
}

export default function App() {
  const [selfId, setSelfId] = useState("");
  const [serverInfo, setServerInfo] = useState("");
  const [statusDotColor, setStatusDotColor] = useState("#444");
  const [callStatus, setCallStatus] = useState("idle");
  const [statusLog, setStatusLog] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, message: "" });
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [localMeta, setLocalMeta] = useState("\u2014");
  const [remoteMeta, setRemoteMeta] = useState("\u2014");
  const [remoteBitrate, setRemoteBitrate] = useState(0);
  const [currentPeerId, setCurrentPeerId] = useState("");
  const [hasActiveCall, setHasActiveCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [config, setConfig] = useState(null);
  const [remoteVideoWrapClass, setRemoteVideoWrapClass] = useState(
    "flex-1 min-h-0 relative bg-[#050505] placeholder"
  );
  const [localVideoWrapClass, setLocalVideoWrapClass] = useState(
    "flex-1 min-h-0 relative bg-[#050505] placeholder"
  );
  const [isElectronReady, setIsElectronReady] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const outChannelRef = useRef(null);
  const pendingIceRef = useRef([]);
  const supabaseClientRef = useRef(null);
  const myChannelRef = useRef(null);
  const bitrateIntervalRef = useRef(null);
  const answerProcessedRef = useRef(false);
  const hangupProcessedRef = useRef(false);
  // Refs that always hold the latest value (avoid stale closures in async code)
  const selfIdRef = useRef("");
  const currentPeerIdRef = useRef("");
  const localStreamRef = useRef(null);
  const configRef = useRef(null);

  useEffect(() => { selfIdRef.current = selfId; }, [selfId]);
  useEffect(() => { currentPeerIdRef.current = currentPeerId; }, [currentPeerId]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { configRef.current = config; }, [config]);

  const addStatus = useCallback((msg, isError = false) => {
    setStatusLog((prev) => [...prev.slice(-49), { text: msg, isError }]);
  }, []);

  const monitorBitrate = useCallback(() => {
    if (!pcRef.current || pcRef.current.connectionState !== "connected") {
      setRemoteBitrate(0);
      setRemoteMeta("\u2014");
      return;
    }
    pcRef.current.getStats().then((report) => {
      let bytesReceived = 0;
      let frameRate = 0;
      let width = 0;
      let height = 0;
      report.forEach((item) => {
        if (item.type === "inbound-rtp" && item.kind === "video") {
          bytesReceived += item.bytesReceived || 0;
          frameRate = item.framesPerSecond || frameRate;
          width = item.frameWidth || width;
          height = item.frameHeight || height;
        }
      });
      if (width > 0 && height > 0) {
        setRemoteMeta(`${width}x${height} @${frameRate > 0 ? Math.round(frameRate) : "?"}fps`);
      }
      window._prevBytesReceived = window._prevBytesReceived || bytesReceived;
      const bytesDiff = bytesReceived - window._prevBytesReceived;
      window._prevBytesReceived = bytesReceived;
      setRemoteBitrate(bytesDiff * 8);
    });
  }, []);

  // ── Electron ready ────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI) {
      setIsElectronReady(true);
    } else {
      const checkInterval = setInterval(() => {
        if (window.electronAPI) {
          setIsElectronReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }
  }, []);

  useEffect(() => {
    if (!isElectronReady) return;
    (async () => {
      try {
        const profile = await window.electronAPI.getProfile();
        const cfg = await window.electronAPI.getConfig();
        setSelfId(profile.id);
        selfIdRef.current = profile.id;
        setConfig(cfg);
        configRef.current = cfg;
        window.__SELF_ID__ = profile.id;
        await connectSupabase(cfg.supabaseUrl, cfg.supabaseKey, profile.id);
      } catch (e) {
        addStatus(e.message || "Init error", true);
      }
    })();
  }, [isElectronReady]);

  // ── Supabase ──────────────────────────────────────────────────────────────
  const connectSupabase = async (url, key, id) => {
    if (!window.supabase) {
      addStatus("Error: Supabase library not loaded.", true);
      return;
    }
    let client = supabaseClientRef.current;
    if (!client) {
      try {
        client = window.supabase.createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        supabaseClientRef.current = client;
        setServerInfo("Supabase Realtime");
      } catch (e) {
        addStatus("Supabase init error: " + e.message, true);
        return;
      }
    }
    if (myChannelRef.current) {
      try { await client.removeChannel(myChannelRef.current); } catch (_) {}
      myChannelRef.current = null;
      await new Promise((r) => setTimeout(r, 300));
    }
    const ch = client.channel(`peer:${id}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload));
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") addStatus('Ready. Share your ID and click "Call".');
      if (status === "CHANNEL_ERROR") addStatus("Channel error.", true);
    });
    myChannelRef.current = ch;
  };

  const ensureOutChannel = async (peerId) => {
    if (
      outChannelRef.current &&
      outChannelRef.current._topic === `realtime:peer:${peerId}`
    ) return;
    if (outChannelRef.current) {
      try { await supabaseClientRef.current.removeChannel(outChannelRef.current); } catch (_) {}
      outChannelRef.current = null;
    }
    const ch = supabaseClientRef.current.channel(`peer:${peerId}`, {
      config: { broadcast: { self: false } },
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 8000);
      ch.subscribe((status) => {
        clearTimeout(timer);
        outChannelRef.current = ch;
        resolve();
      });
    });
  };

  const sendSignal = async (payload) => {
    if (!supabaseClientRef.current) {
      addStatus("No connection to Supabase.", true);
      return;
    }
    // Use ref to always have the current selfId even inside stale closures
    const signalPayload = { ...payload, from: selfIdRef.current };
    try {
      await ensureOutChannel(payload.to);
      await outChannelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: signalPayload,
      });
    } catch (e) {
      addStatus("Send error: " + e.message, true);
    }
  };

  // ── Signal handling ───────────────────────────────────────────────────────
  const handleSignal = async (msg) => {
    if (msg.type === "call") {
      setIncomingCall({ from: msg.from, offer: msg.offer });
      addStatus(`Incoming call from **${msg.from}**.`);
    }

    if (msg.type === "answer") {
      if (!pcRef.current) return;
      if (answerProcessedRef.current) return;
      if (pcRef.current.signalingState !== "have-local-offer") return;
      answerProcessedRef.current = true;
      await pcRef.current.setRemoteDescription(msg.answer);
      // Drain queued ICE candidates AFTER remote description is set
      for (const c of pendingIceRef.current) {
        await pcRef.current.addIceCandidate(c).catch(() => {});
      }
      pendingIceRef.current = [];
      pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
      setStatusDotColor("#4ade80");
      addStatus(`**${msg.from}** accepted the call.`);
    }

    if (msg.type === "candidate") {
      if (!msg.candidate) return;
      if (!pcRef.current || !pcRef.current.remoteDescription) {
        pendingIceRef.current.push(msg.candidate);
        return;
      }
      try {
        await pcRef.current.addIceCandidate(msg.candidate);
      } catch (e) {
        console.error("[Signal] Failed to add ICE candidate:", e);
      }
    }

    if (msg.type === "renegotiate") {
      if (!pcRef.current || pcRef.current.signalingState === "closed") return;
      try {
        await pcRef.current.setRemoteDescription(msg.offer);
        for (const c of pendingIceRef.current)
          await pcRef.current.addIceCandidate(c).catch(() => {});
        pendingIceRef.current = [];
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        sendSignal({
          type: "renegotiate-answer",
          to: msg.from,
          answer: pcRef.current.localDescription,
        });
      } catch (e) {
        console.warn("[Signal] Renegotiate failed:", e.message);
      }
    }

    if (msg.type === "renegotiate-answer") {
      if (!pcRef.current || pcRef.current.signalingState === "closed") return;
      if (pcRef.current.signalingState === "stable") return;
      try {
        await pcRef.current.setRemoteDescription(msg.answer);
        pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
      } catch (e) {
        console.warn("[Signal] Renegotiate answer failed:", e.message);
      }
    }

    if (msg.type === "stop-broadcast") {
      if (remoteVideoRef.current?.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        remoteVideoRef.current.srcObject = null;
      }
      setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
      setRemoteMeta("\u2014");
      addStatus("Peer broadcast ended.");
    }

    if (msg.type === "decline") {
      addStatus(`**${msg.from}** declined the call.`);
      hangup(false);
    }

    if (msg.type === "hangup") {
      if (hangupProcessedRef.current) return;
      hangupProcessedRef.current = true;
      addStatus(`**${msg.from}** ended the call.`);
      hangup(false);
    }
  };

  // ── Peer connection ───────────────────────────────────────────────────────
  const createPeerConnection = async (peerId) => {
    setCurrentPeerId(peerId);
    currentPeerIdRef.current = peerId;

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      if (bitrateIntervalRef.current) {
        clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = null;
      }
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }

    const pc = new RTCPeerConnection(rtcConfig);

    pc.ontrack = (event) => {
      setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505]");
      // IMPORTANT: use streams[0] if present, else wrap track in new MediaStream
      const stream = event.streams?.[0] ?? new MediaStream([event.track]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      setRemoteStream(stream);
      const s = event.track.getSettings?.() ?? {};
      setRemoteMeta(
        `${s.width ?? "?"}x${s.height ?? "?"} @${s.frameRate > 0 ? Math.round(s.frameRate) : "?"}fps`
      );
      setStatusDotColor("#4ade80");
      addStatus(`Connected to **${peerId}**.`);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal({ type: "candidate", to: peerId, candidate });
    };

    pc.onicecandidateerror = (event) => {
      console.warn("[PC] ICE error:", event.errorText || event.errorCode);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        setHasActiveCall(true);
        setStatusDotColor("#4ade80");
        setCallStatus("connected");
        addStatus(`Connected to **${peerId}**.`);
        if (bitrateIntervalRef.current) clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = setInterval(monitorBitrate, 1000);
      }
      if (st === "failed") {
        setHasActiveCall(false);
        setStatusDotColor("#f87171");
        setCallStatus("failed");
        addStatus("P2P connection failed.", true);
        pc.restartIce();
      }
      if (st === "disconnected") {
        setStatusDotColor("#facc15");
        setCallStatus("connecting");
        addStatus("Connection lost. Reconnecting...", true);
        setTimeout(() => {
          if (pc.connectionState === "disconnected") pc.restartIce();
        }, 3000);
      }
      if (st === "closed") {
        setHasActiveCall(false);
        setStatusDotColor("#888");
        setCallStatus("idle");
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        addStatus("ICE failed. Reconnecting...", true);
        pc.restartIce();
      }
    };

    pcRef.current = pc;
    return pc;
  };

  /**
   * attachLocalTracks — syncs localStream tracks onto the peer connection.
   * @param {boolean} triggerRenegotiate — if true AND already connected,
   *   sends a renegotiation offer so the remote side receives the new track.
   */
  const attachLocalTracks = async (triggerRenegotiate = false) => {
    const stream = localStreamRef.current;
    if (!stream || !stream.active || !pcRef.current) return;

    const senders = pcRef.current.getSenders();
    for (const track of stream.getTracks()) {
      const existingSender = senders.find((s) => s.track?.kind === track.kind);
      if (existingSender) {
        await existingSender.replaceTrack(track);
        applyMaxQualityEncoding(existingSender);
      } else {
        const sender = pcRef.current.addTrack(track, stream);
        setTimeout(() => applyMaxQualityEncoding(sender), 500);
      }
    }

    if (
      triggerRenegotiate &&
      pcRef.current.connectionState === "connected" &&
      pcRef.current.signalingState === "stable"
    ) {
      try {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        sendSignal({
          type: "renegotiate",
          to: currentPeerIdRef.current,
          offer: pcRef.current.localDescription,
        });
      } catch (e) {
        console.warn("[attachLocalTracks] Renegotiate error:", e.message);
      }
    }
  };

  // ── Call flow ─────────────────────────────────────────────────────────────
  const handleCall = async (peerId) => {
    if (peerId === selfIdRef.current) {
      addStatus("Cannot call yourself.", true);
      return;
    }
    const ok = await new Promise((r) =>
      setConfirmDialog({
        isOpen: true,
        message: `Call **${peerId}**?`,
        onConfirm: () => r(true),
        onCancel: () => r(false),
      })
    );
    if (!ok) return;

    hangup(false);
    answerProcessedRef.current = false;
    hangupProcessedRef.current = false;

    await createPeerConnection(peerId);
    // Attach tracks BEFORE createOffer so they appear in the SDP
    await attachLocalTracks(false);

    const offer = await pcRef.current.createOffer({ offerToReceiveVideo: true });
    await pcRef.current.setLocalDescription(offer);
    sendSignal({ type: "call", to: peerId, offer: pcRef.current.localDescription });

    addStatus(`Calling **${peerId}**...`);
    setStatusDotColor("#f97316");
    setCallStatus("connecting");
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    const { from, offer } = incomingCall;
    setIncomingCall(null);

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      if (bitrateIntervalRef.current) {
        clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = null;
      }
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }

    hangupProcessedRef.current = false;
    answerProcessedRef.current = false;

    await createPeerConnection(from);
    // Attach local tracks BEFORE setting remote description
    await attachLocalTracks(false);

    await pcRef.current.setRemoteDescription(offer);
    for (const c of pendingIceRef.current) {
      await pcRef.current.addIceCandidate(c).catch(() => {});
    }
    pendingIceRef.current = [];

    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    sendSignal({ type: "answer", to: from, answer: pcRef.current.localDescription });

    addStatus(`Call accepted. Connecting to **${from}**...`);
    setStatusDotColor("#f97316");
    setCallStatus("connecting");
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    const { from } = incomingCall;
    setIncomingCall(null);
    sendSignal({ type: "decline", to: from });
    addStatus(`Call from **${from}** declined.`);
  };

  const hangup = (notify = true) => {
    if (notify && currentPeerIdRef.current) {
      sendSignal({ type: "hangup", to: currentPeerIdRef.current });
    }
    if (outChannelRef.current) {
      supabaseClientRef.current?.removeChannel(outChannelRef.current).catch(() => {});
      outChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      if (bitrateIntervalRef.current) {
        clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = null;
      }
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }
    pcRef.current = null;
    setCurrentPeerId("");
    currentPeerIdRef.current = "";
    setHasActiveCall(false);
    pendingIceRef.current = [];
    setIncomingCall(null);
    setStatusDotColor("#888");
    setCallStatus("idle");

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalMeta("\u2014");
    setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");

    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteStream(null);
    setRemoteMeta("\u2014");
    setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
  };

  // ── Broadcast ─────────────────────────────────────────────────────────────
  const stopBroadcast = () => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((sender) => {
        if (sender.track?.kind === "video") {
          try { pcRef.current.removeTrack(sender); } catch (_) {}
        }
      });
    }
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
    setLocalMeta("\u2014");
    addStatus("Broadcast stopped.");
    if (currentPeerIdRef.current && pcRef.current?.connectionState === "connected") {
      sendSignal({ type: "stop-broadcast", to: currentPeerIdRef.current });
    }
  };

  const handleSourceSelected = async (sourceId) => {
    setSourcePickerOpen(false);

    const oldStream = localStreamRef.current;
    if (oldStream) {
      oldStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }

    try {
      if (window.electronAPI?.setPendingSource) {
        await window.electronAPI.setPendingSource(sourceId);
      }

      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 2560, max: 2560 },
          height: { ideal: 1440, max: 1440 },
          frameRate: { ideal: 60, max: 60 },
          displaySurface: "monitor",
        },
        audio: false,
        selfBrowserSurface: "exclude",
      });

      const [track] = newStream.getVideoTracks();
      track.onended = () => stopBroadcast();

      setLocalStream(newStream);
      localStreamRef.current = newStream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      // KEY FIX: triggerRenegotiate=true so remote peer gets the new stream
      if (pcRef.current) {
        await attachLocalTracks(true);
        pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
      }

      setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505]");
      const s = track.getSettings?.() ?? {};
      setLocalMeta(
        `${s.width ?? "?"}x${s.height ?? "?"} @${s.frameRate > 0 ? Math.round(s.frameRate) : "?"}fps`
      );
      addStatus("Broadcast started.");
    } catch (e) {
      addStatus("Failed to capture screen: " + (e.message || "Unknown error"), true);
    }
  };

  const handleBroadcast = () => setSourcePickerOpen(true);
  const handleChangeSource = () => setSourcePickerOpen(true);

  const handlePiP = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (remoteVideoRef.current) await remoteVideoRef.current.requestPictureInPicture();
    } catch {
      addStatus("PiP not supported for this source.", true);
    }
  };

  const handleFullscreen = async () => {
    const wrap = remoteVideoRef.current?.parentElement;
    if (wrap?.requestFullscreen) await wrap.requestFullscreen();
    else if (wrap?.webkitRequestFullscreen) await wrap.webkitRequestFullscreen();
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(selfIdRef.current);
    addStatus("ID copied.");
  };

  const handleRegenId = async () => {
    const ok = await new Promise((r) =>
      setConfirmDialog({
        isOpen: true,
        message: "Reset ID? Current ID will become unavailable.",
        onConfirm: () => r(true),
        onCancel: () => r(false),
      })
    );
    if (!ok) return;
    addStatus("Regenerating ID...");
    try {
      if (myChannelRef.current) {
        await supabaseClientRef.current.removeChannel(myChannelRef.current).catch(() => {});
        myChannelRef.current = null;
      }
      await new Promise((r) => setTimeout(r, 300));
      const profile = await window.electronAPI.regenerateProfile();
      setSelfId(profile.id);
      selfIdRef.current = profile.id;
      window.__SELF_ID__ = profile.id;
      const cfg = configRef.current;
      await connectSupabase(cfg.supabaseUrl, cfg.supabaseKey, profile.id);
      addStatus("New ID created.");
    } catch (e) {
      addStatus("Failed to change ID: " + (e.message || "Unknown error"), true);
    }
  };

  const handleHangup = async () => {
    if (!currentPeerIdRef.current && !pcRef.current) {
      addStatus("No active call.");
      return;
    }
    const ok = await new Promise((r) =>
      setConfirmDialog({
        isOpen: true,
        message: "End call?",
        onConfirm: () => r(true),
        onCancel: () => r(false),
      })
    );
    if (!ok) return;
    hangup(true);
    addStatus("Call ended.");
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white select-none overflow-hidden">
      <TitleBar
        selfId={selfId}
        serverInfo={serverInfo}
        statusDotColor={statusDotColor}
        onCopyId={handleCopyId}
        onMinimize={() => window.electronAPI?.minimizeWindow()}
        onClose={() => window.electronAPI?.closeWindow()}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          selfId={selfId}
          callStatus={callStatus}
          hasActiveCall={hasActiveCall}
          localStream={localStream}
          onCall={handleCall}
          onHangup={handleHangup}
          onBroadcast={handleBroadcast}
          onStopBroadcast={stopBroadcast}
          onChangeSource={handleChangeSource}
          onRegenId={handleRegenId}
          incomingCall={incomingCall}
          onAcceptCall={handleAcceptCall}
          onDeclineCall={handleDeclineCall}
        />
        <VideoPanel
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          localMeta={localMeta}
          remoteMeta={remoteMeta}
          remoteBitrate={remoteBitrate}
          localVideoWrapClass={localVideoWrapClass}
          remoteVideoWrapClass={remoteVideoWrapClass}
          hasActiveCall={hasActiveCall}
          onPiP={handlePiP}
          onFullscreen={handleFullscreen}
          statusLog={statusLog}
        />
      </div>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm?.();
          setConfirmDialog({ isOpen: false, message: "" });
        }}
        onCancel={() => {
          confirmDialog.onCancel?.();
          setConfirmDialog({ isOpen: false, message: "" });
        }}
      />
      {sourcePickerOpen && (
        <SourcePicker
          onSelect={handleSourceSelected}
          onClose={() => setSourcePickerOpen(false)}
        />
      )}
    </div>
  );
}
