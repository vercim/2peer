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
    { urls: "stun:stun1.stunprotocol.org:3478" },
    { urls: "stun:stun2.stunprotocol.org:3478" },
    { urls: "stun:stun.ekiga.net:3478" },
    { urls: "stun:stun.ideasip.com:3478" },
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
      urls: "turn:relay.webtelek.com:3478",
      username: "free",
      credential: "free",
    },
  ],
  iceCandidatePoolSize: 10,
  sdpSemantics: "unified-plan",
};

function getStunServers() {
  const stunIPs = [
    "74.125.143.127:19302",
    "142.250.80.127:19302",
    "172.217.12.227:19302",
    "142.250.136.127:19302",
  ];
  return stunIPs.map((ip) => ({
    urls: `stun:${ip}`,
  }));
}

async function gatherLocalCandidates(pc) {
  try {
    const pc2 = new RTCPeerConnection({ iceServers: [] });
    const localIPs = [];

    pc2.createDataChannel("temp");
    const offer = await pc2.createOffer();
    await pc2.setLocalDescription(offer);

    pc2.onicecandidate = (e) => {
      if (e.candidate?.candidate) {
        const match = e.candidate.candidate.match(
          /([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/,
        );
        if (match) localIPs.push(match[1]);
      }
    };

    await new Promise((r) => setTimeout(r, 500));
    pc2.close();

    const uniqueIPs = [...new Set(localIPs)].filter(
      (ip) => !ip.startsWith("127."),
    );
    return uniqueIPs;
  } catch (e) {
    console.warn("[PC] Local IP gathering failed:", e);
    return [];
  }
}

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
  let maxBitrate = 15_000_000;

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
  const [serverInfo, setServerInfo] = useState("");
  const [statusDotColor, setStatusDotColor] = useState("#444");
  const [callStatus, setCallStatus] = useState("idle");
  const [statusLog, setStatusLog] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    message: "",
  });
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [localMeta, setLocalMeta] = useState("—");
  const [remoteMeta, setRemoteMeta] = useState("—");
  const [remoteBitrate, setRemoteBitrate] = useState(0);
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
  const bitrateIntervalRef = useRef(null);
  const answerProcessedRef = useRef(false);

  const monitorBitrate = useCallback(() => {
    if (!pcRef.current || pcRef.current.connectionState !== "connected") {
      setRemoteBitrate(0);
      setRemoteMeta("—");
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
        setRemoteMeta(
          `${width}×${height} @${frameRate > 0 ? Math.round(frameRate) : "?"}fps`,
        );
      }
      window._prevBytesReceived = window._prevBytesReceived || bytesReceived;
      const bytesDiff = bytesReceived - window._prevBytesReceived;
      window._prevBytesReceived = bytesReceived;
      const bitsPerSecond = bytesDiff * 8;
      setRemoteBitrate(bitsPerSecond);
    });
  }, []);

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

          console.log("[App] Getting config...");
          const cfg = await window.electronAPI.getConfig();
          console.log("[App] Got config:", cfg);

          setSelfId(profile.id);
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
        setServerInfo("⚡ Supabase Realtime");
      } catch (e) {
        addStatus("Supabase init error: " + e.message, true);
        return;
      }
    }
    if (myChannelRef.current) {
      try {
        console.log("[Supabase] Removing old channel...");
        await client.removeChannel(myChannelRef.current);
      } catch (_) {}
      myChannelRef.current = null;
      // Ждем больше времени для полного закрытия канала
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log("[Supabase] Creating new channel for:", id);
    const ch = client.channel(`peer:${id}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "signal" }, ({ payload }) =>
      handleSignal(payload),
    );

    let retryCount = 0;
    const maxRetries = 3;

    ch.subscribe((status) => {
      console.log("[Supabase] Channel status:", status);

      if (status === "SUBSCRIBED") {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        addStatus('Ready. Share your ID and click "Call".');
      }
      if (status === "CHANNEL_ERROR") {
        addStatus("Channel error. Attempting to reconnect...", true);

        if (retryCount < maxRetries) {
          retryCount++;
          console.log(
            `[Supabase] Retrying connection (${retryCount}/${maxRetries})...`,
          );
          setTimeout(() => {
            console.log(`[Supabase] Reconnecting (attempt ${retryCount})...`);
            ch.subscribe();
          }, 1000);
        } else {
          addStatus("Connection failed. Please try again.", true);
          retryCount = 0;
        }
      }
      if (status === "TIMED_OUT") {
        addStatus("Connection timeout. Retrying...", true);

        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(() => {
            console.log(
              `[Supabase] Retry after timeout (${retryCount}/${maxRetries})...`,
            );
            ch.subscribe();
          }, 1500);
        }
      }
      if (status === "CLOSED") {
        addStatus("Connection closed.");
        retryCount = 0;
      }
    });

    myChannelRef.current = ch;

    // Возвращаем промис, который резолвится при успешном подключении
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (ch.state !== "joined") {
          reject(new Error("Connection timeout"));
        }
      }, 10000);

      const originalSubscribe = ch.subscribe.bind(ch);
      ch.subscribe = function (...args) {
        const result = originalSubscribe(...args);
        return result;
      };

      // Мониторим состояние канала
      const checkInterval = setInterval(() => {
        if (ch.state === "joined" || ch.state === "subscribed") {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(ch);
        }
      }, 100);

      // Также срабатываем при статусе SUBSCRIBED
      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        handleSignal(payload);
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve(ch);
      });
    });
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
      if (answerProcessedRef.current) {
        console.log("[Signal] Answer already processed, skipping");
        return;
      }
      if (pcRef.current.signalingState !== "have-local-offer") {
        console.warn(
          "[Signal] Answer received in wrong state:",
          pcRef.current.signalingState,
        );
        return;
      }
      answerProcessedRef.current = true;
      await pcRef.current.setRemoteDescription(msg.answer);
      console.log("[Signal] Remote description set successfully");
      pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
      pcRef.current.addIceCandidate(null);
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
      console.log(
        "[Signal] Received renegotiation request, state:",
        pcRef.current?.signalingState,
      );
      if (!pcRef.current || pcRef.current.signalingState === "closed") return;
      if (pcRef.current.signalingState === "stable") {
        console.log("[Signal] Already stable, processing renegotiate");
      }
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
        console.warn("[Signal] Failed to process renegotiate:", e.message);
      }
    }

    if (msg.type === "renegotiate-answer") {
      console.log(
        "[Signal] Received renegotiation answer, state:",
        pcRef.current?.signalingState,
      );
      if (!pcRef.current) return;
      if (pcRef.current.signalingState === "closed") return;
      if (pcRef.current.signalingState === "stable") {
        console.log("[Signal] Already stable, ignoring answer");
        return;
      }
      try {
        await pcRef.current.setRemoteDescription(msg.answer);
        pcRef.current.getSenders().forEach(applyMaxQualityEncoding);
      } catch (e) {
        console.warn("[Signal] Failed to set remote answer:", e.message);
      }
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

  const createPeerConnection = async (peerId) => {
    console.log("[PC] Creating peer connection for:", peerId);
    setCurrentPeerId(peerId);
    if (pcRef.current) {
      console.log("[PC] Closing existing connection");
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      if (bitrateIntervalRef.current) {
        clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = null;
      }
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }

    console.log("[PC] Gathering local IPs...");
    const localIPs = await gatherLocalCandidates(pcRef.current || null);
    console.log("[PC] Local IPs found:", localIPs);

    const localStunServers = localIPs.map((ip) => ({
      urls: `stun:${ip}:19302`,
    }));

    console.log("[PC] Creating new RTCPeerConnection with config:", rtcConfig);
    const configWithIPs = {
      ...rtcConfig,
      iceServers: [
        ...rtcConfig.iceServers,
        ...getStunServers(),
        ...localStunServers,
      ],
    };
    console.log("[PC] Full ICE config:", configWithIPs);
    const pc = new RTCPeerConnection(configWithIPs);

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
        `${s.width || "?"}×${s.height || "?"} @${s.frameRate > 0 ? Math.round(s.frameRate) : "?"}fps`,
      );
      setStatusDotColor("#4ade80");
      addStatus(
        `Connected to <strong style="font-family:monospace">${peerId}</strong>.`,
      );
    };

    pc.onicecandidate = ({ candidate }) => {
      console.log("[PC] ICE candidate:", candidate);
      if (candidate && peerId) {
        sendSignal({ type: "candidate", to: peerId, candidate });
      }
    };

    pc.onicecandidateerror = (event) => {
      // Только в консоль, не спамим пользователя
      console.warn(
        "[PC] ICE candidate error:",
        event.errorText || event.errorCode,
      );
    };

    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState;
      console.log("[PC] Connection state changed to:", st);
      if (st === "connected") {
        setHasActiveCall(true);
        setStatusDotColor("#4ade80");
        setCallStatus("connected");
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
            if (bitrateIntervalRef.current)
              clearInterval(bitrateIntervalRef.current);
            bitrateIntervalRef.current = setInterval(monitorBitrate, 1000);
          } catch (e) {
            console.log("[PC] Could not determine connection type:", e);
          }
        }, 1000);
      }
      if (st === "failed") {
        setHasActiveCall(false);
        setStatusDotColor("#f87171");
        setCallStatus("failed");
        addStatus("P2P connection failed.", true);
        console.error("[PC] Connection failed!");

        // Попытка перезапуска ICE
        console.log("[PC] Attempting ICE restart...");
        pc.restartIce();
      }
      if (st === "disconnected") {
        setStatusDotColor("#facc15");
        setCallStatus("connecting");
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
        setHasActiveCall(false);
        setStatusDotColor("#888");
        setCallStatus("idle");
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

    // Таймаут для gathering - если не собрались candidates за 8 секунд, продолжаем с тем что есть
    const gatheringTimeout = setTimeout(() => {
      console.log(
        "[PC] ICE gathering timeout - proceeding with available candidates",
      );
    }, 8000);

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
    answerProcessedRef.current = false;
    await createPeerConnection(peerId);

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
    setStatusDotColor("#f97316");
    setCallStatus("connecting");
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
      if (bitrateIntervalRef.current) {
        clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = null;
      }
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }

    isPoliteRef.current = true;
    console.log("[Accept] Creating peer connection...");
    await createPeerConnection(from);

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
    setStatusDotColor("#f97316");
    setCallStatus("connecting");
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
      if (bitrateIntervalRef.current) {
        clearInterval(bitrateIntervalRef.current);
        bitrateIntervalRef.current = null;
      }
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
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
    setSourcePickerOpen(true);
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
    console.log(
      "[Broadcast] handleSourceSelected called with sourceId:",
      sourceId,
    );
    setSourcePickerOpen(false);
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    try {
      if (window.electronAPI?.setPendingSource) {
        console.log("[Broadcast] Setting pending source:", sourceId);
        await window.electronAPI.setPendingSource(sourceId);
      }
      console.log("[Broadcast] Calling getDisplayMedia...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 2560, max: 2560 },
          height: { ideal: 1440, max: 1440 },
          frameRate: { ideal: 60, max: 60 },
          displaySurface: "monitor",
        },
        audio: false,
        selfBrowserSurface: "exclude",
      });
      console.log("[Broadcast] getDisplayMedia succeeded, stream:", stream);
      const [track] = stream.getVideoTracks();
      track.onended = () => {
        stopBroadcast();
        if (currentPeerId && pcRef.current?.connectionState === "connected")
          sendSignal({ type: "stop-broadcast", to: currentPeerId });
      };
      setLocalStream(stream);
      console.log("[Broadcast] localStream set to:", stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log("[Broadcast] localVideoRef srcObject set to:", stream);
      } else {
        console.log("[Broadcast] ERROR: localVideoRef.current is null!");
      }
      const s = track.getSettings ? track.getSettings() : {};
      setLocalMeta(
        `${s.width || "?"}×${s.height || "?"} @${s.frameRate > 0 ? Math.round(s.frameRate) : "?"}fps`,
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

    addStatus("Regenerating ID...");

    try {
      console.log("[RegenID] Starting ID regeneration...");

      // Полностью удаляем старый канал и ждем
      if (myChannelRef.current) {
        console.log("[RegenID] Removing old channel...");
        await supabaseClientRef.current
          .removeChannel(myChannelRef.current)
          .catch(() => {});
        myChannelRef.current = null;
      }

      // Ждем достаточно времени для полного закрытия
      console.log("[RegenID] Waiting for channel cleanup...");
      await new Promise((r) => setTimeout(r, 500));

      // Генерируем новый профиль
      console.log("[RegenID] Generating new profile...");
      const profile = await window.electronAPI.regenerateProfile();
      console.log("[RegenID] New profile:", profile.id);

      setSelfId(profile.id);
      window.__SELF_ID__ = profile.id;

      // Подключаемся с новым ID
      console.log("[RegenID] Connecting with new ID...");
      await connectSupabase(config.supabaseUrl, config.supabaseKey, profile.id);

      console.log("[RegenID] ID regeneration complete");
      addStatus("New ID created.");
    } catch (e) {
      console.error("[RegenID] Error:", e);
      addStatus("Failed to change ID: " + (e.message || "Unknown error"), true);
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
          connectionStatus={callStatus}
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
              canBroadcast={pcRef.current?.connectionState === "connected"}
            />
            <VideoPanel
              ref={remoteVideoRef}
              title="Peer Screen"
              meta={remoteMeta}
              bitrate={remoteBitrate}
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
