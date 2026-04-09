import { useState, useRef, useEffect, useCallback } from "react";
import { TitleBar } from "./components/TitleBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { VideoPanel } from "./components/VideoPanel.jsx";
import { SourcePicker } from "./components/SourcePicker.jsx";
import { ConfirmDialog } from "./components/ConfirmDialog.jsx";
import { soundManager } from "./utils/SoundManager.js";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: "stun:openrelay.metered.ca:443" },
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.antisip.com:3478" },
    {
      urls: "stun:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:global.stun.twilio.com:3478",
      username: "skuto",
      credential: "your-turn-credential",
    },
  ],
  iceCandidatePoolSize: 10,
  sdpSemantics: "unified-plan",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

function getStunServers() {
  const stunIPs = [
    "74.125.143.127:19302",
    "142.250.80.127:19302",
    "172.217.12.227:19302",
    "142.250.136.127:19302",
    "216.58.214.174:19302",
    "108.177.15.127:19302",
    "142.250.185.127:19302",
    "172.217.1.227:19302",
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
      stream.active &&
      stream.getVideoTracks &&
      stream.getVideoTracks().length > 0
    );
  } catch {
    return false;
  }
}

const DEFAULT_BITRATES = {
  "480p": 2_500_000,
  "720p": 4_000_000,
  "1080p": 6_000_000,
  "1440p": 8_000_000,
  "2160p": 15_000_000,
};

let currentBitrate = { value: 4_000_000, target: 4_000_000 };
let userManualBitrate = false;
const BITRATE_HISTORY = [];
const RTT_HISTORY = [];

function applyMaxQualityEncoding(sender, quality = {}, forcedBitrate = null) {
  if (!sender || sender.track?.kind !== "video") return;
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];

  const res =
    qualityOptions.resolution.find(
      (r) => r.value === (quality.resolution || "1080p"),
    ) || qualityOptions.resolution[2];
  const fps = quality.fps || 60;

  let autoBitrate = forcedBitrate || currentBitrate.value;

  params.encodings.forEach((enc) => {
    enc.maxBitrate = autoBitrate;
    enc.minBitrate = Math.floor(autoBitrate * 0.5);
    enc.maxFramerate = fps;
    enc.priority = "very-high";
    enc.networkPriority = "high";
    enc.rmsLevel = 0.01;
    enc.scaleResolutionDownBy = 1;
  });

  if (sender.track) {
    sender.track.contentHint = "motion";
    if (typeof sender.track.applyConstraints === "function") {
      sender.track
        .applyConstraints({
          latencyHint: "interactive",
        })
        .catch(() => {});
    }
  }

  sender.setParameters(params).catch(console.error);

  console.log("[Encoding] Applied quality:", {
    resolution: res.value,
    bitrate: autoBitrate,
    fps,
  });
}

function adaptBitrate(rtt, packetsLost, bitrate) {
  if (userManualBitrate) return;

  const now = Date.now();
  RTT_HISTORY.push({ rtt, time: now });
  while (RTT_HISTORY.length > 10 && now - RTT_HISTORY[0].time > 10000) {
    RTT_HISTORY.shift();
  }

  const avgRtt =
    RTT_HISTORY.reduce((sum, m) => sum + m.rtt, 0) /
    Math.max(RTT_HISTORY.length, 1);

  let newTarget = currentBitrate.target;

  if (avgRtt > 300) {
    newTarget = Math.max(500_000, currentBitrate.target * 0.5);
  } else if (avgRtt > 200) {
    newTarget = Math.max(1_000_000, currentBitrate.target * 0.7);
  } else if (packetsLost > 0) {
    newTarget = Math.max(500_000, currentBitrate.target * 0.8);
  } else if (avgRtt < 100 && packetsLost === 0) {
    newTarget = Math.min(currentBitrate.target * 1.1, 10_000_000);
  }

  currentBitrate.target = newTarget;
  currentBitrate.value =
    currentBitrate.value + (newTarget - currentBitrate.value) * 0.3;

  console.log(
    "[Adaptive] Bitrate:",
    currentBitrate.value,
    "Target:",
    newTarget,
    "RTT:",
    avgRtt,
    "Lost:",
    packetsLost,
  );
}

const qualityOptions = {
  resolution: [
    { value: "480p", label: "480p", width: 854, height: 480 },
    { value: "720p", label: "720p HD", width: 1280, height: 720 },
    { value: "1080p", label: "1080p Full HD", width: 1920, height: 1080 },
    { value: "1440p", label: "1440p Quad HD", width: 2560, height: 1440 },
    { value: "2160p", label: "2160p 4K", width: 3840, height: 2160 },
  ],
  fps: [30, 60],
};

function setMaxBandwidthInSDP(sdp, resolution = "1080p") {
  const bitrateMap = {
    "480p": 2500,
    "720p": 4000,
    "1080p": 6000,
    "1440p": 8000,
    "2160p": 15000,
  };
  const kbps = bitrateMap[resolution] ?? 4000;

  let result = sdp.replace(/b=AS:\d+\r\n/g, "").replace(/b=TIAS:\d+\r\n/g, "");

  result = result.replace(
    /(m=video[^\r\n]*\r\n)/,
    `$1b=AS:${kbps}\r\nb=TIAS:${kbps * 1000}\r\n`,
  );

  if (!result.includes("transport-cc")) {
    result = result.replace(/(a=mid:video\r\n)/, `$1a=transport-cc:1\r\n`);
  }

  return result;
}

export default function App({ version = "" }) {
  const [selfId, setSelfId] = useState("");
  const [supabaseStatus, setSupabaseStatus] = useState("disconnected");
  const [statusDotColor, setStatusDotColor] = useState("#444");
  const [callStatus, setCallStatus] = useState("idle");
  const [statusLog, setStatusLog] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    message: "",
  });
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [localMeta, setLocalMeta] = useState("—-");
  const [remoteMeta, setRemoteMeta] = useState("—-");
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
  const [isElectronReady, setIsElectronReady] = useState(false);
  const [streamQuality, setStreamQuality] = useState({
    resolution: "1080p",
    fps: 60,
  });

  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState !== "connected") return;

    userManualBitrate = true;
    clearTimeout(window._manualBitrateTimeout);
    window._manualBitrateTimeout = setTimeout(() => {
      userManualBitrate = false;
    }, 15000);

    const res =
      qualityOptions.resolution.find(
        (r) => r.value === streamQuality.resolution,
      ) || qualityOptions.resolution[2];

    const currentStream = localStreamRef.current;
    if (currentStream) {
      const videoTrack = currentStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack
          .applyConstraints({
            width: { ideal: res.width },
            height: { ideal: res.height },
            frameRate: { ideal: streamQuality.fps },
          })
          .catch((e) => console.warn("[Quality] applyConstraints failed:", e));
      }
    }

    const manualBitrate =
      DEFAULT_BITRATES[streamQuality.resolution] || DEFAULT_BITRATES["1080p"];
    currentBitrate.value = manualBitrate;
    currentBitrate.target = manualBitrate;

    pc.getSenders().forEach((s) => applyMaxQualityEncoding(s, streamQuality));

    setLocalMeta(`${res.width}×${res.height} @${streamQuality.fps}fps`);
  }, [streamQuality]);

  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localContainerRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const pcRef = useRef(null);
  const outChannelRef = useRef(null);
  const pendingIceRef = useRef([]);
  const supabaseClientRef = useRef(null);
  const myChannelRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const isPoliteRef = useRef(false);
  const bitrateIntervalRef = useRef(null);
  const answerProcessedRef = useRef(false);
  const hangupProcessedRef = useRef(false);
  const localStreamRef = useRef(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // --- ИСПРАВЛЕНИЕ: Эффекты для удержания стримов в DOM при ререндере ---
  useEffect(() => {
    if (
      remoteVideoRef.current &&
      remoteStream &&
      remoteVideoRef.current.srcObject !== remoteStream
    ) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, remoteVideoWrapClass]);

  useEffect(() => {
    if (
      localVideoRef.current &&
      localStream &&
      localVideoRef.current.srcObject !== localStream
    ) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, localVideoWrapClass]);
  // --------------------------------------------------------------------

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
      let rtt = 0;
      let packetsLost = 0;
      let packetsReceived = 0;

      report.forEach((item) => {
        if (item.type === "inbound-rtp" && item.kind === "video") {
          bytesReceived += item.bytesReceived || 0;
          frameRate = item.framesPerSecond || frameRate;
          width = item.frameWidth || width;
          height = item.frameHeight || height;
          packetsLost += item.packetsLost || 0;
          packetsReceived += item.packetsReceived || 0;
        }
        if (item.type === "candidate-pair" && item.state === "succeeded") {
          rtt = item.currentRoundTripTime
            ? item.currentRoundTripTime * 1000
            : 0;
        }
      });

      if (width > 0 && height > 0) {
        setRemoteMeta(
          `${width}×${height} @${frameRate > 0 ? Math.round(frameRate) : "?"}fps`,
        );
      }

      const now = Date.now();
      if (!window._lastBitrateCheck) {
        window._lastBitrateCheck = now;
        window._prevBytesReceived = bytesReceived;
        window._bitrateHistory = [];
        return;
      }

      const timeDiff = (now - window._lastBitrateCheck) / 1000;
      if (timeDiff < 0.5) return;

      const bytesDiff = bytesReceived - window._prevBytesReceived;
      window._prevBytesReceived = bytesReceived;
      window._lastBitrateCheck = now;

      const rawBitrate = timeDiff > 0 ? (bytesDiff * 8) / timeDiff : 0;

      window._bitrateHistory = window._bitrateHistory || [];
      window._bitrateHistory.push(rawBitrate);
      if (window._bitrateHistory.length > 5) {
        window._bitrateHistory.shift();
      }

      const avgBitrate =
        window._bitrateHistory.reduce((a, b) => a + b, 0) /
        window._bitrateHistory.length;

      setRemoteBitrate(Math.round(avgBitrate));

      adaptBitrate(rtt, packetsLost, avgBitrate);

      if (pcRef.current && pcRef.current.connectionState === "connected") {
        pcRef.current.getSenders().forEach((s) => {
          if (s.track?.kind === "video") {
            applyMaxQualityEncoding(s, streamQuality);
          }
        });
      }
    });
  }, []);

  const addStatus = useCallback((msg, isError = false) => {
    const id = Date.now() + Math.random();
    setStatusLog((prev) => [...prev.slice(-49), { id, text: msg, isError }]);
  }, []);

  useEffect(() => {
    console.log("[App] window.electronAPI:", window.electronAPI);
    console.log("[App] window.supabase:", window.supabase);
  }, []);

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
    if (isElectronReady) {
      (async () => {
        try {
          const profile = await window.electronAPI.getProfile();
          const cfg = await window.electronAPI.getConfig();
          setSelfId(profile.id);
          setConfig(cfg);
          window.__SELF_ID__ = profile.id;
          await connectSupabase(cfg.supabaseUrl, cfg.supabaseKey, profile.id);
        } catch (e) {
          addStatus(e.message || "Init error", true);
        }
      })();
    }
  }, [isElectronReady]);

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
        setSupabaseStatus("connected");
      } catch (e) {
        setSupabaseStatus("error");
        addStatus("Supabase init error: " + e.message, true);
        return;
      }
    }
    if (myChannelRef.current) {
      try {
        await client.removeChannel(myChannelRef.current);
      } catch (_) {}
      myChannelRef.current = null;
      await new Promise((r) => setTimeout(r, 500));
    }

    const ch = client.channel(`peer:${id}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "signal" }, ({ payload }) =>
      handleSignal(payload),
    );

    let retryCount = 0;
    const maxRetries = 3;

    ch.subscribe((status) => {
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
          setTimeout(() => ch.subscribe(), 1000);
        } else {
          addStatus("Connection failed. Please try again.", true);
          retryCount = 0;
        }
      }
      if (status === "TIMED_OUT") {
        addStatus("Connection timeout. Retrying...", true);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(() => ch.subscribe(), 1500);
        }
      }
      if (status === "CLOSED") {
        addStatus("Connection closed.");
        retryCount = 0;
      }
    });

    myChannelRef.current = ch;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (ch.state !== "joined") reject(new Error("Connection timeout"));
      }, 10000);

      const checkInterval = setInterval(() => {
        if (ch.state === "joined" || ch.state === "subscribed") {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve(ch);
        }
      }, 100);
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
    if (!supabaseClientRef.current) {
      addStatus("No connection to Supabase.", true);
      return;
    }
    try {
      await ensureOutChannel(payload.to);
      if (!outChannelRef.current) return;
      const signalPayload = { ...payload, from: selfId };
      await outChannelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: signalPayload,
      });
    } catch (e) {
      if (outChannelRef.current) {
        addStatus("Send error: " + e.message, true);
      }
    }
  };

  const handleSignal = async (msg) => {
    if (msg.type === "call") {
      setIncomingCall({ from: msg.from, offer: msg.offer });
      soundManager.playIncomingLoop();
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification(
          "Incoming call",
          `From: ${msg.from}`,
        );
      }
      addStatus(
        `Incoming call from <strong style="font-family:monospace">${msg.from}</strong>.`,
      );
    }

    if (msg.type === "answer") {
      if (!pcRef.current) return;
      if (answerProcessedRef.current) return;
      if (pcRef.current.signalingState !== "have-local-offer") return;

      // ИСПРАВЛЕНИЕ: Добавление кандидатов и удаление пустого addIceCandidate(null)
      answerProcessedRef.current = true;
      const modifiedAnswer = {
        ...msg.answer,
        sdp: setMaxBandwidthInSDP(msg.answer.sdp, streamQuality.resolution),
      };
      await pcRef.current.setRemoteDescription(modifiedAnswer);
      pcRef.current
        .getSenders()
        .forEach((s) => applyMaxQualityEncoding(s, streamQuality));

      for (const c of pendingIceRef.current) {
        await pcRef.current.addIceCandidate(c).catch(console.error);
      }
      pendingIceRef.current = [];

      addStatus(
        `<strong style="font-family:monospace">${msg.from}</strong> accepted the call.`,
      );
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
        const modifiedAnswer = {
          ...answer,
          sdp: setMaxBandwidthInSDP(answer.sdp, streamQuality.resolution),
        };
        await pcRef.current.setLocalDescription(modifiedAnswer);
        pcRef.current
          .getSenders()
          .forEach((s) => applyMaxQualityEncoding(s, streamQuality));
        sendSignal({
          type: "renegotiate-answer",
          to: msg.from,
          answer: modifiedAnswer,
        });
      } catch (e) {
        console.warn("[Signal] Failed to process renegotiate:", e.message);
      }
    }

    if (msg.type === "renegotiate-answer") {
      if (!pcRef.current || pcRef.current.signalingState === "closed") return;
      if (pcRef.current.signalingState === "stable") return;
      try {
        const modifiedAnswer = {
          ...msg.answer,
          sdp: setMaxBandwidthInSDP(msg.answer.sdp, streamQuality.resolution),
        };
        await pcRef.current.setRemoteDescription(modifiedAnswer);
        pcRef.current
          .getSenders()
          .forEach((s) => applyMaxQualityEncoding(s, streamQuality));
      } catch (e) {
        console.warn("[Signal] Failed to set remote answer:", e.message);
      }
    }

    if (msg.type === "stop-broadcast") {
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
      if (hangupProcessedRef.current) return;
      hangupProcessedRef.current = true;
      addStatus(
        `<strong style="font-family:monospace">${msg.from}</strong> ended the call.`,
      );
      hangup(false);
    }
  };

  const createPeerConnection = async (peerId) => {
    setCurrentPeerId(peerId);
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

    const localIPs = await gatherLocalCandidates(pcRef.current || null);
    const localStunServers = localIPs.map((ip) => ({
      urls: `stun:${ip}:19302`,
    }));

    const configWithIPs = {
      ...rtcConfig,
      iceServers: [
        ...rtcConfig.iceServers,
        ...getStunServers(),
        ...localStunServers,
      ],
    };
    const pc = new RTCPeerConnection(configWithIPs);

    // ИСПРАВЛЕНИЕ: Корректное присвоение стрима
    pc.ontrack = (event) => {
      setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505]");
      let stream = event?.streams?.[0] || null;
      if (!stream && event?.track) {
        stream = new MediaStream([event.track]);
      }

      setRemoteStream(stream);

      const videoEl =
        remoteVideoRef.current || document.getElementById("remoteVideo");
      if (videoEl && stream && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }

      const track = event.track;
      const settings = track?.getSettings ? track.getSettings() : {};
      const width = settings.width || track?.getConstraints?.().width || "1920";
      const height =
        settings.height || track?.getConstraints?.().height || "1080";
      const frameRate = settings.frameRate || "60";
      setRemoteMeta(`${width}×${height} @${Math.round(frameRate)}fps`);
      setStatusDotColor("#4ade80");
      addStatus(
        `Connected to <strong style="font-family:monospace">${peerId}</strong>.`,
      );
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && peerId) {
        sendSignal({ type: "candidate", to: peerId, candidate });
      }
    };

    pc.onicecandidateerror = (event) => {
      console.warn(
        "[PC] ICE candidate error:",
        event.errorText || event.errorCode,
      );
    };

    pc.onconnectionstatechange = () => {
      console.log("[PC] Connection state:", pc?.connectionState);
      const st = pc?.connectionState;
      if (st === "connected") {
        setHasActiveCall(true);
        setStatusDotColor("#4ade80");
        setCallStatus("connected");
        soundManager.playConnect();

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
            bitrateIntervalRef.current = setInterval(monitorBitrate, 2500);
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
        pc.restartIce();
      }
      if (st === "disconnected") {
        setStatusDotColor("#facc15");
        setCallStatus("connecting");
        addStatus("Connection lost. Attempting to reconnect...", true);
        setTimeout(() => {
          if (pc.connectionState === "disconnected") pc.restartIce();
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
      if (iceState === "failed") {
        addStatus("ICE failed. Attempting to reconnect...", true);
        pc.restartIce();
      }
      if (iceState === "disconnected") {
        addStatus("ICE disconnected.");
      }
    };

    pc.onicegatheringstatechange = () => {};

    pcRef.current = pc;
    return pc;
  };

  // ИСПРАВЛЕНИЕ: передаем поток как аргумент для избежания конфликтов состояния React
  const attachLocalTracks = async (streamToAttach = localStreamRef.current) => {
    if (!streamToAttach || !streamToAttach.active || !pcRef.current) return;
    const senders = pcRef.current.getSenders() || [];
    const tracks = streamToAttach.getTracks();

    for (const track of tracks) {
      const existingSender = senders.find((s) => s.track?.kind === track.kind);
      if (existingSender) {
        await existingSender.replaceTrack(track);
        applyMaxQualityEncoding(existingSender, streamQuality);
      } else {
        const sender = pcRef.current.addTrack(track, streamToAttach);
        applyMaxQualityEncoding(sender, streamQuality);
      }
    }
  };

  const handleCall = async (peerId) => {
    if (peerId === selfId) {
      addStatus("Cannot call yourself.", true);
      return;
    }

    hangup(false);
    isPoliteRef.current = false;
    hangupProcessedRef.current = false;
    answerProcessedRef.current = false;

    await createPeerConnection(peerId);
    await attachLocalTracks();

    const offer = await pcRef.current.createOffer({
      offerToReceiveVideo: true,
    });
    const modifiedOffer = {
      ...offer,
      sdp: setMaxBandwidthInSDP(offer.sdp, streamQuality.resolution),
    };
    await pcRef.current.setLocalDescription(modifiedOffer);

    sendSignal({
      type: "call",
      to: peerId,
      offer: pcRef.current.localDescription,
    });

    addStatus(
      `Calling <strong style="font-family:monospace">${peerId}</strong>...`,
    );
    soundManager.playCall();
    setStatusDotColor("#f97316");
    setCallStatus("connecting");
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    soundManager.stopIncomingLoop();

    const { from, offer } = incomingCall;
    setIncomingCall(null);

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      if (bitrateIntervalRef.current) clearInterval(bitrateIntervalRef.current);
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }

    isPoliteRef.current = true;
    hangupProcessedRef.current = false;

    await createPeerConnection(from);
    await attachLocalTracks();

    await pcRef.current.setRemoteDescription(offer);

    for (const c of pendingIceRef.current) {
      await pcRef.current.addIceCandidate(c);
    }
    pendingIceRef.current = [];

    const answer = await pcRef.current.createAnswer();
    const modifiedAnswer = {
      ...answer,
      sdp: setMaxBandwidthInSDP(answer.sdp, streamQuality.resolution),
    };
    await pcRef.current.setLocalDescription(modifiedAnswer);

    sendSignal({
      type: "answer",
      to: from,
      answer: pcRef.current.localDescription,
    });

    addStatus(
      `Call accepted. Connecting to <strong style="font-family:monospace">${from}</strong>...`,
    );
    soundManager.playConnecting();
    setStatusDotColor("#f97316");
    setCallStatus("connecting");
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    soundManager.stopIncomingLoop();
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
    soundManager.playDisconnect();
    if (outChannelRef.current) {
      supabaseClientRef.current
        ?.removeChannel(outChannelRef.current)
        .catch(() => {});
      outChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      if (bitrateIntervalRef.current) clearInterval(bitrateIntervalRef.current);
      setRemoteBitrate(0);
      window._prevBytesReceived = 0;
    }
    pcRef.current = null;
    setCurrentPeerId("");
    setHasActiveCall(false);
    pendingIceRef.current = [];
    setIncomingCall(null);
    setStatusDotColor("#888");
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
      setLocalMeta("—-");
      setLocalVideoWrapClass(
        "flex-1 min-h-0 relative bg-[#050505] placeholder",
      );
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteStream(null);
    setRemoteMeta("—-");
    setRemoteVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => {
        if (s.track) s.track.stop();
      });
    }
  };

  const handleBroadcast = async () => setSourcePickerOpen(true);

  const stopBroadcast = () => {
    if (pcRef.current && pcRef.current.connectionState === "connected") {
      const senders = pcRef.current.getSenders();
      for (const sender of senders) {
        if (sender.track && sender.track.kind === "video") {
          try {
            pcRef.current.removeTrack(sender);
          } catch (_) {}
        }
      }
      setTimeout(async () => {
        try {
          if (pcRef.current?.signalingState === "stable") {
            const offer = await pcRef.current.createOffer();
            const modifiedOffer = {
              ...offer,
              sdp: setMaxBandwidthInSDP(offer.sdp, streamQuality.resolution),
            };
            await pcRef.current.setLocalDescription(modifiedOffer);
            sendSignal({
              type: "renegotiate",
              to: currentPeerId,
              offer: pcRef.current.localDescription,
            });
          }
        } catch (err) {
          console.error("[StopBroadcast] Renegotiation error:", err);
        }
      }, 100);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
    setLocalMeta("—-");
    addStatus("Broadcast stopped.");
    if (currentPeerId && pcRef.current?.connectionState === "connected")
      sendSignal({ type: "stop-broadcast", to: currentPeerId });
  };

  const handleChangeSource = async () => setSourcePickerOpen(true);

  // ИСПРАВЛЕНИЕ: Вызов attachLocalTracks с новым стримом + Renegotiation
  const handleSourceSelected = async (sourceId) => {
    setSourcePickerOpen(false);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }
    try {
      if (window.electronAPI?.setPendingSource) {
        await window.electronAPI.setPendingSource(sourceId);
      }
      const res =
        qualityOptions.resolution.find(
          (r) => r.value === streamQuality.resolution,
        ) || qualityOptions.resolution[2];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: res.width },
          height: { ideal: res.height },
          frameRate: { ideal: streamQuality.fps },
          displaySurface: "monitor",
        },
        audio: true,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: "include",
      });
      const [track] = stream.getVideoTracks();
      track.onended = () => {
        stopBroadcast();
        if (currentPeerId && pcRef.current?.connectionState === "connected")
          sendSignal({ type: "stop-broadcast", to: currentPeerId });
      };

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (pcRef.current?.connectionState === "connected") {
        await attachLocalTracks(stream);
        pcRef.current
          .getSenders()
          .forEach((s) => applyMaxQualityEncoding(s, streamQuality));

        try {
          if (pcRef.current.signalingState === "stable") {
            const offer = await pcRef.current.createOffer();
            const modifiedOffer = {
              ...offer,
              sdp: setMaxBandwidthInSDP(offer.sdp, streamQuality.resolution),
            };
            await pcRef.current.setLocalDescription(modifiedOffer);
            sendSignal({
              type: "renegotiate",
              to: currentPeerId,
              offer: pcRef.current.localDescription,
            });
          }
        } catch (err) {
          console.error("[Broadcast] Renegotiation error:", err);
        }
      }

      setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505]");
      const q =
        qualityOptions.resolution.find(
          (r) => r.value === streamQuality.resolution,
        ) || qualityOptions.resolution[2];
      setLocalMeta(`${q.width}×${q.height} @${streamQuality.fps}fps`);
      addStatus("Broadcast started.");
    } catch (e) {
      addStatus(
        "Failed to capture screen: " + (e.message || "Unknown error"),
        true,
      );
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
    const videoElement = remoteVideoRef.current;
    if (!videoElement) return;

    try {
      if (videoElement.requestFullscreen) {
        await videoElement.requestFullscreen();
      } else if (videoElement.webkitRequestFullscreen) {
        await videoElement.webkitRequestFullscreen();
      } else if (videoElement.msRequestFullscreen) {
        await videoElement.msRequestFullscreen();
      }
    } catch (e) {
      console.error(
        "[Fullscreen] Ошибка при переходе в полноэкранный режим:",
        e,
      );
    }
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(selfId);
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
    soundManager.playIdChange();
    try {
      if (myChannelRef.current) {
        await supabaseClientRef.current
          .removeChannel(myChannelRef.current)
          .catch(() => {});
        myChannelRef.current = null;
      }
      await new Promise((r) => setTimeout(r, 500));
      const profile = await window.electronAPI.regenerateProfile();
      setSelfId(profile.id);
      window.__SELF_ID__ = profile.id;
      await connectSupabase(config.supabaseUrl, config.supabaseKey, profile.id);
      addStatus("New ID created.");
    } catch (e) {
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

  const handleCancelCall = () => {
    if (outChannelRef.current) {
      supabaseClientRef.current
        ?.removeChannel(outChannelRef.current)
        .catch(() => {});
      outChannelRef.current = null;
    }
    setCallStatus("idle");
    setStatusDotColor("#888");
    soundManager.playCancel();
    addStatus("Call cancelled.");
  };

  return (
    <div className="h-screen flex flex-col bg-bg text-text font-sans text-[13px] antialiased overflow-hidden">
      <TitleBar
        statusDotColor={statusDotColor}
        connectionStatus={callStatus}
        hasActiveCall={hasActiveCall}
      />
      <div className="h-[calc(100vh-38px)] grid grid-cols-[272px_minmax(0,1fr)] gap-[10px] p-[10px] overflow-hidden">
        <Sidebar
          selfId={selfId}
          onCopyId={handleCopyId}
          onRegenId={handleRegenId}
          onCall={handleCall}
          onHangup={handleHangup}
          onCancelCall={handleCancelCall}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
          hasIncomingCall={!!incomingCall}
          callerId={incomingCall?.from || ""}
          hasActiveCall={hasActiveCall}
          connectionStatus={callStatus}
          supabaseStatus={supabaseStatus}
          statusMessages={statusLog}
          version={version}
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
              containerRef={localContainerRef}
              canBroadcast={pcRef.current?.connectionState === "connected"}
              streamQuality={streamQuality}
              onQualityChange={setStreamQuality}
              qualityOptions={qualityOptions}
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
              containerRef={remoteContainerRef}
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
