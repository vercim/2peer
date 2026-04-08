import { useState, useRef, useEffect, useCallback } from "react";
import { TitleBar } from "./components/TitleBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { VideoPanel } from "./components/VideoPanel.jsx";
import { SourcePicker } from "./components/SourcePicker.jsx";
import { ConfirmDialog } from "./components/ConfirmDialog.jsx";
import { StatusLog } from "./components/StatusLog.jsx";
import { useWebRTC, useBroadcast } from "./hooks/useWebRTC.js";
import { useSupabase } from "./hooks/useSupabase.js";

const rtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
      ],
    },
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["stun:stun.miwifi.com:3478"] },
    { urls: ["stun:stun.synergy-it.pl:3478"] },
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
    {
      urls: "turn:turn1.ihscr.com:443",
      username: "guest",
      credential: "guest",
    },
  ],
};

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

export default function App() {
  const [selfId, setSelfId] = useState("");
  const [version, setVersion] = useState("");
  const [serverInfo, setServerInfo] = useState("");
  const [statusDotColor, setStatusDotColor] = useState("#444");
  const [statusLog, setStatusLog] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    message: "",
  });
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [localMeta, setLocalMeta] = useState("—");
  const [remoteMeta, setRemoteMeta] = useState("—");
  const [currentPeerId, setCurrentPeerId] = useState("");
  const [hasActiveCall, setHasActiveCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [config, setConfig] = useState(null);
  const [remoteVideoWrapClass, setRemoteVideoWrapClass] = useState(
    "flex-1 min-h-0 relative bg-[#050505] placeholder",
  );
  const [localVideoWrapClass, setLocalVideoWrapClass] = useState(
    "flex-1 min-h-0 relative bg-[#050505] placeholder",
  );
  const [remoteVideoWrapRef, setRemoteVideoWrapRef] = useState(null);
  const [isElectronReady, setIsElectronReady] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const outChannelRef = useRef(null);
  const pendingIceRef = useRef([]);
  const supabaseClientRef = useRef(null);
  const myChannelRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const isPoliteRef = useRef(false);

  const addStatus = useCallback((msg, isError = false) => {
    setStatusLog((prev) => [...prev.slice(-49), { text: msg, isError }]);
  }, []);

  // Отладочная информация для диагностики
  useEffect(() => {
    console.log("[App] Checking electronAPI availability");
    console.log("[App] window.electronAPI:", window.electronAPI);
    console.log("[App] window.supabase:", window.supabase);
  }, []);

  useEffect(() => {
    // Проверяем, доступен ли electronAPI
    if (window.electronAPI) {
      console.log("[App] electronAPI is available");
      setIsElectronReady(true);
    } else {
      console.log("[App] electronAPI not available yet, starting polling");
      // Если не доступен, проверяем через небольшие интервалы
      const checkInterval = setInterval(() => {
        if (window.electronAPI) {
          console.log("[App] electronAPI became available");
          setIsElectronReady(true);
          clearInterval(checkInterval);
        }
      }, 100);

      // Очищаем интервал при размонтировании компонента
      return () => {
        console.log("[App] Cleaning up electronAPI check interval");
        clearInterval(checkInterval);
      };
    }
  }, []);

  useEffect(() => {
    if (isElectronReady) {
      console.log("[App] Initializing app with electronAPI");
      (async () => {
        try {
          console.log("[App] Getting profile...");
          const profile = await window.electronAPI.getProfile();
          console.log("[App] Got profile:", profile);

          console.log("[App] Getting version...");
          const v = await window.electronAPI.getVersion();
          console.log("[App] Got version:", v);

          console.log("[App] Getting config...");
          const cfg = await window.electronAPI.getConfig();
          console.log("[App] Got config:", cfg);

          setSelfId(profile.id);
          setVersion("v" + v);
          setConfig(cfg);
          window.__SELF_ID__ = profile.id;

          console.log("[App] Connecting to Supabase...");
          await connectSupabase(cfg.supabaseUrl, cfg.supabaseKey, profile.id);
          console.log("[App] Supabase connection established");
        } catch (e) {
          console.error("[App] Initialization error:", e);
          addStatus(e.message || "Init error", true);
        }
      })();
    }
  }, [isElectronReady]);

  useEffect(() => {
    setRemoteVideoWrapRef(remoteVideoRef.current);
  }, [remoteVideoRef]);

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
      try {
        await client.removeChannel(myChannelRef.current);
      } catch (_) {}
      myChannelRef.current = null;
      await new Promise((r) => setTimeout(r, 200));
    }
    const ch = client.channel(`peer:${id}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "signal" }, ({ payload }) =>
      handleSignal(payload),
    );
    ch.subscribe((status) => {
      console.log("[Supabase] status:", status);
      if (status === "SUBSCRIBED") {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        addStatus('Ready. Share your ID and click "Call".');
      }
      if (status === "CHANNEL_ERROR")
        addStatus("Channel error. Attempting to reconnect...");
      if (status === "TIMED_OUT") addStatus("Connection timeout. Retrying...");
      if (status === "CLOSED") addStatus("Connection closed.");
    });
    myChannelRef.current = ch;
  };

  const ensureOutChannel = async (peerId) => {
    if (
      outChannelRef.current &&
      outChannelRef.current._topic === `realtime:peer:${peerId}`
    )
      return;
    if (outChannelRef.current) {
      try {
        await supabaseClientRef.current.removeChannel(outChannelRef.current);
      } catch (_) {}
      outChannelRef.current = null;
    }
    const ch = supabaseClientRef.current.channel(`peer:${peerId}`, {
      config: { broadcast: { self: false } },
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          outChannelRef.current ? resolve() : reject(new Error("timeout")),
        8000,
      );
      ch.subscribe((status) => {
        clearTimeout(timer);
        if (status === "SUBSCRIBED") {
          outChannelRef.current = ch;
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reject(new Error(status));
        else {
          outChannelRef.current = ch;
          resolve();
        }
      });
    });
  };

  const sendSignal = async (payload) => {
    console.log("[Signal] Sending signal:", payload.type, "to:", payload.to);

    if (!supabaseClientRef.current) {
      console.error("[Signal] No Supabase client");
      addStatus("No connection to Supabase.", true);
      return;
    }

    try {
      console.log("[Signal] Ensuring out channel...");
      await ensureOutChannel(payload.to);
      console.log("[Signal] Out channel ready, sending broadcast...");

      const signalPayload = { ...payload, from: selfId };
      console.log("[Signal] Signal payload:", signalPayload);

      await outChannelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: signalPayload,
      });

      console.log("[Signal] Signal sent successfully");
    } catch (e) {
      console.error("[Signal] Send error:", e);
      addStatus("Send error: " + e.message, true);
    }
  };

  const handleSignal = async (msg) => {
    console.log("[Signal] Received:", msg.type, "from", msg.from);

    if (msg.type === "call") {
      console.log("[Signal] Incoming call from:", msg.from);
      setIncomingCall({ from: msg.from, offer: msg.offer });
      addStatus(
        `Incoming call from <strong style="font-family:monospace">${msg.from}</strong>.`,
      );
    }

    if (msg.type === "answer") {
      console.log("[Signal] Received answer from:", msg.from);
      console.log("[Signal] Answer:", msg.answer);
      if (!pcRef.current) {
        console.warn("[Signal] No peer connection to set answer");
        return;
      }
      await pcRef.current.setRemoteDescription(msg.answer);
      console.log("[Signal] Remote description set successfully");
      pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
      setStatusDotColor("#4ade80");
      addStatus(
        `<strong style="font-family:monospace">${msg.from}</strong> accepted the call.`,
      );
    }

    if (msg.type === "candidate") {
      console.log("[Signal] Received ICE candidate:", msg.candidate);
      if (!msg.candidate) {
        console.warn("[Signal] Empty candidate");
        return;
      }
      if (!pcRef.current || !pcRef.current.remoteDescription) {
        console.log(
          "[Signal] Queuing candidate for later (no remote description)",
        );
        pendingIceRef.current.push(msg.candidate);
        return;
      }
      try {
        await pcRef.current.addIceCandidate(msg.candidate);
        console.log("[Signal] ICE candidate added successfully");
      } catch (e) {
        console.error("[Signal] Failed to add ICE candidate:", e);
      }
    }

    if (msg.type === "renegotiate") {
      console.log("[Signal] Received renegotiation request");
      if (!pcRef.current || pcRef.current.signalingState === "closed") return;
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
    }

    if (msg.type === "renegotiate-answer") {
      console.log("[Signal] Received renegotiation answer");
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(msg.answer);
      pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
    }

    if (msg.type === "stop-broadcast") {
      console.log("[Signal] Peer stopped broadcast");
      if (remoteVideoRef.current?.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        remoteVideoRef.current.srcObject = null;
      }
      setRemoteVideoWrapClass((prev) => prev + " placeholder");
      setRemoteMeta("—");
      addStatus("Peer broadcast ended.");
    }

    if (msg.type === "decline") {
      addStatus(
        `<strong style="font-family:monospace">${msg.from}</strong> declined the call.`,
      );
      hangup(false);
    }

    if (msg.type === "hangup") {
      addStatus(
        `<strong style="font-family:monospace">${msg.from}</strong> ended the call.`,
      );
      hangup(false);
    }
  };

  const createPeerConnection = (peerId) => {
    console.log("[PC] Creating peer connection for:", peerId);
    setCurrentPeerId(peerId);
    if (pcRef.current) {
      console.log("[PC] Closing existing connection");
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
    }

    console.log("[PC] Creating new RTCPeerConnection with config:", rtcConfig);
    const pc = new RTCPeerConnection(rtcConfig);

    pc.ontrack = (event) => {
      console.log("[PC] ontrack fired!", event);
      setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505]");
      const stream = event?.streams?.[0] || null;
      console.log("[PC] Stream received:", stream);
      if (stream && remoteVideoRef.current?.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
        setRemoteStream(stream);
        console.log("[PC] Stream assigned to remote video element");
      }
      const s = event.track.getSettings ? event.track.getSettings() : {};
      setRemoteMeta(
        `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || "?")}fps`,
      );
      setStatusDotColor("#4ade80");
      addStatus(
        `Connected to <strong style="font-family:monospace">${peerId}</strong>.`,
      );
    };

    pc.onicecandidate = ({ candidate }) => {
      console.log("[PC] ICE candidate:", candidate);
      if (candidate && currentPeerId) {
        sendSignal({ type: "candidate", to: peerId, candidate });

        // Показываем тип ICE candidate пользователю (только первый раз)
        if (candidate.type && !pc.iceConnectionState) {
          const typeLabel =
            {
              host: "Local",
              srflx: "STUN",
              relay: "TURN",
              prflx: "Peer Reflexive",
            }[candidate.type] || candidate.type;
          addStatus(`ICE candidate: ${typeLabel}`);
        }
      }
    };

    pc.onicecandidateerror = (event) => {
      console.error("[PC] ICE candidate error:", event);
      addStatus(`ICE error: ${event.errorText || event.errorCode}`, true);
    };

    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState;
      console.log("[PC] Connection state changed to:", st);
      if (st === "connected") {
        setStatusDotColor("#4ade80");
        addStatus(
          `Connected to <strong style="font-family:monospace">${peerId}</strong>.`,
        );

        // Проверяем тип соединения после подключения
        setTimeout(() => {
          try {
            const stats = pc.getStats();
            stats.then((report) => {
              let connectionType = "Unknown";
              report.forEach((item) => {
                if (
                  item.type === "candidate-pair" &&
                  item.state === "succeeded"
                ) {
                  const localCandidate = report.get(item.localCandidateId);
                  const remoteCandidate = report.get(item.remoteCandidateId);

                  if (localCandidate && remoteCandidate) {
                    if (
                      localCandidate.candidateType === "relay" ||
                      remoteCandidate.candidateType === "relay"
                    ) {
                      connectionType = "TURN (Relay)";
                    } else if (
                      localCandidate.candidateType === "srflx" ||
                      remoteCandidate.candidateType === "srflx"
                    ) {
                      connectionType = "STUN (Public IP)";
                    } else if (localCandidate.candidateType === "host") {
                      connectionType = "Local (Same Network)";
                    }
                  }
                }
              });
              if (connectionType !== "Unknown") {
                addStatus(`Connection type: ${connectionType}`);
              }
            });
          } catch (e) {
            console.log("[PC] Could not determine connection type:", e);
          }
        }, 1000);
      }
      if (st === "failed") {
        setStatusDotColor("#f87171");
        addStatus("P2P connection failed.", true);
        console.error("[PC] Connection failed!");

        // Попытка перезапуска ICE
        console.log("[PC] Attempting ICE restart...");
        pc.restartIce();
      }
      if (st === "disconnected") {
        setStatusDotColor("#facc15");
        addStatus("Connection lost. Attempting to reconnect...", true);
        // Автоматическая попытка переподключения
        setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            console.log("[PC] Still disconnected, attempting ICE restart...");
            pc.restartIce();
          }
        }, 3000);
      }
      if (st === "closed") {
        setStatusDotColor("#888");
        addStatus("Connection closed.");
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc?.iceConnectionState;
      console.log("[PC] ICE connection state:", iceState);

      if (iceState === "failed") {
        console.warn("[PC] ICE connection failed, attempting restart...");
        addStatus("ICE failed. Attempting to reconnect...", true);
        pc.restartIce();
      }
      if (iceState === "disconnected") {
        console.warn("[PC] ICE disconnected");
        addStatus("ICE disconnected.");
      }
    };

    // Устанавливаем таймаут для gathering candidates
    const gatheringTimeout = setTimeout(() => {
      console.log("[PC] ICE gathering timeout - checking gathered candidates");
      if (pc.iceGatheringState === "gathering") {
        console.log("[PC] Still gathering, will continue in background");
      }
    }, 5000);

    pc.onicegatheringstatechange = () => {
      console.log("[PC] ICE gathering state:", pc.iceGatheringState);
      if (pc.iceGatheringState === "complete") {
        clearTimeout(gatheringTimeout);
        console.log("[PC] ICE gathering complete");
      }
    };

    pcRef.current = pc;
    return pc;
  };

  const attachLocalTracks = async () => {
    if (!localStream || !localStream.active || !pcRef.current) return;
    const stream = localStream;
    const existing = new Set(
      (pcRef.current.getSenders() || [])
        .map((s) => s.track?.id)
        .filter(Boolean),
    );
    for (const track of stream.getTracks()) {
      if (!existing.has(track.id)) {
        const sender = pcRef.current.addTrack(track, stream);
        setTimeout(() => applyMaxQualityEncoding(sender), 500);
      }
    }
  };

  const handleCall = async (peerId) => {
    console.log("[Call] Initiating call to:", peerId);
    console.log("[Call] Self ID:", selfId);

    if (peerId === selfId) {
      addStatus("Cannot call yourself.", true);
      return;
    }

    const ok = await new Promise((r) =>
      setConfirmDialog({
        isOpen: true,
        message: `Call <strong>${peerId}</strong>?`,
        onConfirm: () => r(true),
        onCancel: () => r(false),
      }),
    );
    if (!ok) return;

    console.log("[Call] User confirmed, hanging up existing connection...");
    hangup(false);
    isPoliteRef.current = false;

    console.log("[Call] Creating peer connection...");
    createPeerConnection(peerId);

    console.log("[Call] Attaching local tracks...");
    await attachLocalTracks();

    console.log("[Call] Creating offer...");
    const offer = await pcRef.current.createOffer({
      offerToReceiveVideo: true,
    });
    console.log("[Call] Offer created:", offer);

    console.log("[Call] Setting local description...");
    await pcRef.current.setLocalDescription(offer);

    console.log("[Call] Sending signal...");
    sendSignal({
      type: "call",
      to: peerId,
      offer: pcRef.current.localDescription,
    });

    addStatus(
      `Calling <strong style="font-family:monospace">${peerId}</strong>...`,
    );
    console.log("[Call] Call initiated successfully");
  };

  const handleAcceptCall = async () => {
    console.log("[Accept] Accepting incoming call...");
    if (!incomingCall) {
      console.warn("[Accept] No incoming call to accept");
      return;
    }

    const { from, offer } = incomingCall;
    console.log("[Accept] Call from:", from);
    console.log("[Accept] Offer:", offer);

    setIncomingCall(null);

    if (pcRef.current) {
      console.log("[Accept] Closing existing connection...");
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
    }

    isPoliteRef.current = true;
    console.log("[Accept] Creating peer connection...");
    createPeerConnection(from);

    console.log("[Accept] Attaching local tracks...");
    await attachLocalTracks();

    console.log("[Accept] Setting remote description...");
    await pcRef.current.setRemoteDescription(offer);
    console.log("[Accept] Remote description set");

    console.log("[Accept] Adding pending ICE candidates...");
    for (const c of pendingIceRef.current) {
      console.log("[Accept] Adding candidate:", c);
      await pcRef.current.addIceCandidate(c);
    }
    pendingIceRef.current = [];
    console.log("[Accept] All pending candidates added");

    console.log("[Accept] Creating answer...");
    const answer = await pcRef.current.createAnswer();
    console.log("[Accept] Answer created:", answer);

    console.log("[Accept] Setting local description...");
    await pcRef.current.setLocalDescription(answer);

    console.log("[Accept] Sending answer...");
    sendSignal({
      type: "answer",
      to: from,
      answer: pcRef.current.localDescription,
    });

    addStatus(
      `Call accepted. Connecting to <strong style="font-family:monospace">${from}</strong>...`,
    );
    console.log("[Accept] Answer sent successfully");
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    const { from } = incomingCall;
    setIncomingCall(null);
    sendSignal({ type: "decline", to: from });
    addStatus(
      `Call from <strong style="font-family:monospace">${from}</strong> declined.`,
    );
  };

  const hangup = (notify = true) => {
    if (notify && currentPeerId)
      sendSignal({ type: "hangup", to: currentPeerId });
    if (outChannelRef.current) {
      supabaseClientRef.current
        ?.removeChannel(outChannelRef.current)
        .catch(() => {});
      outChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
    }
    pcRef.current = null;
    setCurrentPeerId("");
    setHasActiveCall(false);
    pendingIceRef.current = [];
    setIncomingCall(null);
    setStatusDotColor("#888");
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalMeta("—");
    setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteStream(null);
    setRemoteMeta("—");
    setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
  };

  const handleBroadcast = async () => {
    addStatus("Attempting to start broadcast...");
    console.log("[Broadcast] Starting broadcast...");

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    try {
      console.log("[Broadcast] Requesting screen capture...");
      addStatus("Requesting screen access...");

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

      console.log(
        "[Broadcast] Screen capture successful, tracks:",
        stream.getTracks(),
      );
      addStatus("Screen captured successfully!");

      const [track] = stream.getVideoTracks();
      console.log("[Broadcast] Video track:", track);

      track.contentHint = "detail";
      track.onended = () => {
        console.log("[Broadcast] Track ended by user");
        stopBroadcast();
        if (currentPeerId && pcRef.current?.connectionState === "connected")
          sendSignal({ type: "stop-broadcast", to: currentPeerId });
      };

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log("[Broadcast] Video assigned to local video element");
      }
      setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505]");
      const s = track.getSettings ? track.getSettings() : {};
      setLocalMeta(
        `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || 60)}fps`,
      );

      console.log("[Broadcast] Current peer state:", {
        pcExists: !!pcRef.current,
        connectionState: pcRef.current?.connectionState,
        currentPeerId,
      });

      if (
        pcRef.current &&
        pcRef.current.connectionState === "connected" &&
        currentPeerId
      ) {
        console.log("[Broadcast] Re-negotiating with peer...");
        await attachLocalTracks();
        await new Promise((r) => setTimeout(r, 100));
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        sendSignal({
          type: "renegotiate",
          to: currentPeerId,
          offer: pcRef.current.localDescription,
        });
      }
      addStatus("Broadcast started.");
      console.log("[Broadcast] Broadcast started successfully");
    } catch (e) {
      console.error("[Broadcast] Error:", e);
      addStatus(
        "Failed to capture screen: " + (e.message || "Unknown error"),
        true,
      );
    }
  };

  const stopBroadcast = () => {
    if (pcRef.current && pcRef.current.connectionState === "connected") {
      pcRef.current.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === "video") {
          try {
            pcRef.current.removeTrack(sender);
          } catch (_) {}
        }
      });
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
    setLocalMeta("—");
    addStatus("Broadcast stopped.");
    if (currentPeerId && pcRef.current?.connectionState === "connected")
      sendSignal({ type: "stop-broadcast", to: currentPeerId });
  };

  const handleChangeSource = async () => {
    setSourcePickerOpen(true);
  };

  const handleSourceSelected = async (sourceId) => {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    try {
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
      track.onended = () => {
        stopBroadcast();
        if (currentPeerId && pcRef.current?.connectionState === "connected")
          sendSignal({ type: "stop-broadcast", to: currentPeerId });
      };
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const s = track.getSettings ? track.getSettings() : {};
      setLocalMeta(
        `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || 60)}fps`,
      );
      if (
        pcRef.current &&
        pcRef.current.connectionState === "connected" &&
        currentPeerId
      ) {
        await attachLocalTracks();
        await new Promise((r) => setTimeout(r, 100));
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        sendSignal({
          type: "renegotiate",
          to: currentPeerId,
          offer: pcRef.current.localDescription,
        });
      }
      addStatus("Broadcast source changed.");
    } catch (e) {
      addStatus(e.message || "Failed to change source.", true);
    }
  };

  const handlePiP = async () => {
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else if (remoteVideoRef.current)
        await remoteVideoRef.current.requestPictureInPicture();
    } catch (e) {
      addStatus("PiP not supported for this source.", true);
    }
  };

  const handleFullscreen = async () => {
    if (remoteVideoWrapRef.current) {
      const wrap = remoteVideoWrapRef.current;
      if (wrap?.requestFullscreen) await wrap.requestFullscreen();
      else if (wrap?.webkitRequestFullscreen)
        await wrap.webkitRequestFullscreen();
    }
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(selfId);
    addStatus("ID copied.");
  };

  const handleRegenId = async () => {
    const ok = await new Promise((r) =>
      setConfirmDialog({
        isOpen: true,
        message: "Reset ID? Current ID will become unavailable.",
        onConfirm: () => r(true),
        onCancel: () => r(false),
      }),
    );
    if (!ok) return;
    try {
      if (myChannelRef.current) {
        await supabaseClientRef.current
          .removeChannel(myChannelRef.current)
          .catch(() => {});
        myChannelRef.current = null;
        await new Promise((r) => setTimeout(r, 200));
      }
      const profile = await window.electronAPI.regenerateProfile();
      setSelfId(profile.id);
      window.__SELF_ID__ = profile.id;
      await connectSupabase(config.supabaseUrl, config.supabaseKey, profile.id);
      addStatus("New ID created.");
    } catch (e) {
      addStatus(e.message || "Failed to change ID.", true);
    }
  };

  const handleHangup = async () => {
    if (!currentPeerId && !pcRef.current) {
      addStatus("No active call.");
      return;
    }
    const ok = await new Promise((r) =>
      setConfirmDialog({
        isOpen: true,
        message: "End call?",
        onConfirm: () => r(true),
        onCancel: () => r(false),
      }),
    );
    if (!ok) return;
    hangup(true);
    addStatus("Call ended.");
  };

  return (
    <div className="h-screen flex flex-col bg-bg text-text font-sans text-[13px] antialiased overflow-hidden">
      <TitleBar statusDotColor={statusDotColor} />
      <div className="h-[calc(100vh-38px)] grid grid-cols-[272px_minmax(0,1fr)] gap-[10px] p-[10px] overflow-hidden">
        <Sidebar
          selfId={selfId}
          onCopyId={handleCopyId}
          onRegenId={handleRegenId}
          onCall={handleCall}
          onHangup={handleHangup}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
          hasIncomingCall={!!incomingCall}
          callerId={incomingCall?.from || ""}
          hasActiveCall={hasActiveCall}
          version={version}
          serverInfo={serverInfo}
          statusMessages={statusLog}
        />
        <main className="flex flex-col gap-[8px] min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col gap-[8px]">
            <VideoPanel
              ref={localVideoRef}
              title="Your Screen"
              meta={localMeta}
              isLocal
              isBroadcasting={!!localStream}
              onBroadcast={localStream ? stopBroadcast : handleBroadcast}
              onChangeSource={handleChangeSource}
              showPlaceholder={!streamHasVideo(localStream)}
              videoRef={localVideoRef}
              containerRef={localVideoRef}
            />
            <VideoPanel
              ref={remoteVideoRef}
              title="Peer Screen"
              meta={remoteMeta}
              onPiP={handlePiP}
              onFullscreen={handleFullscreen}
              showPlaceholder={!streamHasVideo(remoteStream)}
              className={remoteVideoWrapClass}
              videoRef={remoteVideoRef}
              containerRef={remoteVideoRef}
            />
          </div>
        </main>
      </div>
      <SourcePicker
        isOpen={sourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
        onSelect={handleSourceSelected}
      />
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ isOpen: false, message: "" });
        }}
        onCancel={() => {
          confirmDialog.onCancel();
          setConfirmDialog({ isOpen: false, message: "" });
        }}
      />
    </div>
  );
}
