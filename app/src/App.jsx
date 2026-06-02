import { useState, useRef, useEffect, useCallback } from "react";
import { TitleBar } from "./components/TitleBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { VideoPanel } from "./components/VideoPanel.jsx";
import { SourcePicker } from "./components/SourcePicker.jsx";
import { ConfirmDialog } from "./components/ConfirmDialog.jsx";
import { StatusGlow } from "./components/StatusGlow.jsx";
import { IncomingCallDialog } from "./components/IncomingCallDialog.jsx";
import { CallingOverlay } from "./components/CallingOverlay.jsx";
import { SettingsDialog } from "./components/SettingsDialog.jsx";
import { CallHistoryDialog } from "./components/CallHistoryDialog.jsx";
import { soundManager } from "./utils/soundManager.js";
import { setMaxBandwidthInSDP } from "./utils/sdpUtils.js";
import { streamHasVideo, stopStreamTracks } from "./utils/streamUtils.js";
import { getTrafficStats, resetTrafficStats } from "./utils/bitrateManager.js";
import { SettingsContext } from "./contexts/SettingsContext.js";
import { useStatusLog } from "./hooks/useStatusLog.js";
import { useSignaling } from "./hooks/useSignaling.js";
import { usePeerConnection } from "./hooks/usePeerConnection.js";
import { useBroadcast } from "./hooks/useBroadcast.js";

function adjustAccentForTheme(hex, isDark) {
  if (!hex || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  if (!isDark) {
    return `rgba(${clamp(r * 0.78)}, ${clamp(g * 0.78)}, ${clamp(b * 0.78)}, 1)`;
  }
  return `rgba(${clamp(r + 25)}, ${clamp(g + 25)}, ${clamp(b + 25)}, 1)`;
}

const DEFAULT_SETTINGS = {
  accentColor: "#B9D9CC",
  theme: "dark",
  soundEnabled: true,
  reduceMotion: false,
  monochromatic: false,
  resolution: "1080p",
  fps: 60,
  streamAudio: true,
  trafficLimits: { enabled: false, uploadGB: 100, downloadGB: 100 },
  callNotifications: true,
  updateNotifications: true,
  startAtLogin: true,
  trayEnabled: true,
  minimizeToTray: true,
};

const SIDEBAR_MIN = 190;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 190;

export default function App({ version = "" }) {
  const [selfId, setSelfId] = useState("");
  const [statusDotState, setStatusDotState] = useState("idle");
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const [callStatus, setCallStatus] = useState("idle");
  const [statusLog, setStatusLog] = useState([]);
  const [glowTrigger, setGlowTrigger] = useState(0);
  const [glowState, setGlowState] = useState("idle");

  const { addStatus } = useStatusLog(statusLog, setStatusLog);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing.current) return;
      const delta = e.clientX - resizeStartX.current;
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, resizeStartWidth.current + delta)));
    };
    const onMouseUp = () => { isResizing.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  const handleResizeStart = (e) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  useEffect(() => {
    if (statusDotState !== "idle" && statusDotState !== "disconnected") {
      setGlowState(statusDotState);
      setGlowTrigger((prev) => prev + 1);
    }
  }, [statusDotState]);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    message: "",
  });
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [callHistory, setCallHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("callHistory") || "[]"); } catch { return []; }
  });
  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isOutgoingCall, setIsOutgoingCall] = useState(false);
  const [localMeta, setLocalMeta] = useState("");
  const [remoteMeta, setRemoteMeta] = useState("");
  const [remoteBitrate, setRemoteBitrate] = useState(0);
  const [currentPeerId, setCurrentPeerId] = useState("");
  const [hasActiveCall, setHasActiveCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [remoteVideoWrapClass, setRemoteVideoWrapClass] = useState(
    "flex-1 min-h-0 relative bg-[#050505] placeholder",
  );
  const [localVideoWrapClass, setLocalVideoWrapClass] = useState(
    "flex-1 min-h-0 relative bg-[#050505] placeholder",
  );
  const [isElectronReady, setIsElectronReady] = useState(false);
  const streamQuality = { resolution: appSettings.resolution, fps: appSettings.fps };

  const [remoteId, setRemoteId] = useState("");
  const [updateInfo, setUpdateInfo] = useState({
    updateAvailable: false,
    url: "",
  });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const pcRef = useRef(null);
  const pendingIceRef = useRef([]);
  const isPoliteRef = useRef(false);
  const bitrateIntervalRef = useRef(null);
  const answerProcessedRef = useRef(false);
  const hangupProcessedRef = useRef(false);
  const hangupCallbackRef = useRef(null);
  const handleSignalRef = useRef(null);
  const localStreamRef = useRef(null);
  const handleCallRef = useRef(null);
  const addStatusRef = useRef(null);

  const onHangupRequested = useCallback((notify) => {
    hangupCallbackRef.current?.(notify);
  }, []);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

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

  const {
    sendSignal,
    handleSignal,
    resetSignalingRefs,
    initMyRoom,
    openCallChannel,
    closeCallChannel,
    signalingStatus,
  } = useSignaling({
    pcRef,
    selfId,
    streamQuality,
    pendingIceRef,
    addStatus,
    remoteVideoRef,
    setRemoteVideoWrapClass,
    setRemoteMeta,
    setIncomingCall,
    setCallStatus,
    setStatusDotState,
    setGlowState,
    setGlowTrigger,
    onHangupRequested,
    callNotifications: appSettings.callNotifications !== false,
  });

  useEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  const { createPeerConnection, attachLocalTracks } =
    usePeerConnection({
      pcRef,
      streamQuality,
      bitrateIntervalRef,
      setRemoteBitrate,
      setRemoteMeta,
      setRemoteStream,
      setRemoteVideoWrapClass,
      setStatusDotState,
      setGlowState,
      setGlowTrigger,
      setCallStatus,
      setHasActiveCall,
      addStatus,
      remoteVideoRef,
      sendSignal,
    });

  const { handleSourceSelected, stopBroadcast } = useBroadcast({
    pcRef,
    currentPeerId,
    streamQuality,
    streamAudio: appSettings.streamAudio !== false,
    localStreamRef,
    localVideoRef,
    setLocalStream,
    setLocalMeta,
    setLocalVideoWrapClass,
    addStatus,
    sendSignal,
    attachLocalTracks,
  });

  // Keep the main process informed of call state so the tray menu can disable
  // "Update ID" during a call.
  useEffect(() => {
    window.electronAPI?.setCallActive?.(hasActiveCall || callStatus === "connecting");
  }, [hasActiveCall, callStatus]);

  // Check GitHub for a newer release; show the Update badge only if one exists.
  useEffect(() => {
    if (!window.electronAPI?.checkForUpdate) return;
    window.electronAPI
      .checkForUpdate()
      .then((info) => {
        if (info?.updateAvailable) {
          setUpdateInfo({ updateAvailable: true, url: info.url || "" });
          if (appSettings.updateNotifications !== false) {
            window.electronAPI?.showNotification?.(
              "Update available",
              `A new version of 2peer is available.`,
            );
          }
        }
      })
      .catch(() => {});
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
          setSelfId(profile.id);
          window.__SELF_ID__ = profile.id;
          await initMyRoom(profile.id);
        } catch (e) {
          addStatus(e.message || "Init error", true);
        }
        if (window.electronAPI?.getSettings) {
          try {
            const s = await window.electronAPI.getSettings();
            setAppSettings(s);
            soundManager.setEnabled(s.soundEnabled);
          } catch (_) {}
        }
      })();
    }
  }, [isElectronReady, initMyRoom]);

  useEffect(() => {
    if (window.electronAPI?.onCallLast) {
      window.electronAPI.onCallLast((lastCalledId) => {
        if (lastCalledId && window.__SELF_ID__) {
          handleCallRef.current?.(lastCalledId);
        }
      });
    }
    if (window.electronAPI?.onSetRemoteId) {
      window.electronAPI.onSetRemoteId((id) => {
        setRemoteId(id);
        setTimeout(() => handleCallRef.current?.(id), 100);
      });
    }
    if (window.electronAPI?.onProfileUpdated) {
      window.electronAPI.onProfileUpdated((profile) => {
        setSelfId(profile.id);
        window.__SELF_ID__ = profile.id;
        addStatusRef.current?.("ID updated: " + profile.id);
      });
    }
  }, []);

  const hangup = useCallback(
    (notify = true) => {
      if (notify && currentPeerId)
        sendSignal({ type: "hangup", to: currentPeerId });
      soundManager.playDisconnect();
      resetTrafficStats();
      closeCallChannel();
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => s.track?.stop());
        pcRef.current.close();
        if (bitrateIntervalRef.current)
          clearInterval(bitrateIntervalRef.current);
        setRemoteBitrate(0);
        window._prevBytesReceived = 0;
      }
      pcRef.current = null;
      setCurrentPeerId("");
      setHasActiveCall(false);
      setIsOutgoingCall(false);
      pendingIceRef.current = [];
      setIncomingCall(null);
      // Reset both the status dot and the call status so the Sidebar returns to
      // its idle layout (input + "Call") for *both* peers — otherwise a peer
      // torn down mid-"connecting" stays stuck showing "Cancel".
      setCallStatus("idle");
      setStatusDotState("idle");
      setGlowState("failed");
      setGlowTrigger((prev) => prev + 1);
      // Clear the idempotency guards so a fresh call can be placed/received
      // after teardown (otherwise a declined/ended peer can't ring again).
      resetSignalingRefs();
      if (localStreamRef.current) {
        stopStreamTracks(localStreamRef.current);
        setLocalStream(null);
        localStreamRef.current = null;
        setLocalMeta("");
        setLocalVideoWrapClass(
          "flex-1 min-h-0 relative bg-[#050505] placeholder",
        );
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setRemoteStream(null);
      setIsRemoteMuted(false);
      setRemoteMeta("");
      setRemoteVideoWrapClass(
        "flex-1 min-h-0 relative bg-[#050505] placeholder",
      );
    },
    [
      currentPeerId,
      sendSignal,
      closeCallChannel,
      resetSignalingRefs,
      setRemoteBitrate,
      setLocalStream,
      setLocalMeta,
      setLocalVideoWrapClass,
      setRemoteStream,
      setIsRemoteMuted,
      setRemoteMeta,
      setRemoteVideoWrapClass,
      setIncomingCall,
      setCurrentPeerId,
      setHasActiveCall,
      setCallStatus,
      setStatusDotState,
      setGlowState,
      setGlowTrigger,
    ],
  );

  useEffect(() => {
    hangupCallbackRef.current = hangup;
  }, [hangup]);

  const addCallHistory = useCallback((peerId, direction, outcome) => {
    const entry = { id: Date.now(), timestamp: new Date().toISOString(), peerId, direction, outcome };
    setCallHistory((prev) => {
      const next = [...prev, entry].slice(-200);
      try { localStorage.setItem("callHistory", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleCall = useCallback(
    async (peerId) => {
      if (peerId === selfId) {
        addStatus("Cannot call yourself.", true);
        return;
      }

      hangup(false);
      isPoliteRef.current = false;
      hangupProcessedRef.current = false;
      answerProcessedRef.current = false;
      resetSignalingRefs();

      setCurrentPeerId(peerId);
      addCallHistory(peerId, "outgoing", "called");
      addStatus(
        `Calling <strong style="font-family:monospace">${peerId}</strong>...`,
      );
      soundManager.playCall();
      setIsOutgoingCall(true);
      setStatusDotState("connecting");
      setCallStatus("connecting");

      try {
        await openCallChannel(peerId);

        addStatus("Creating WebRTC peer connection...");
        await createPeerConnection(peerId, false);
        if (localStreamRef.current) {
          await attachLocalTracks(localStreamRef.current);
        }

        addStatus("Creating offer...");
        const offer = await pcRef.current.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
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
        addStatus("Offer sent via signaling. Waiting for peer to accept...");

        if (window.electronAPI?.setLastCalledId) {
          window.electronAPI.setLastCalledId(peerId);
        }
      } catch (e) {
        addStatus(e.message || "Peer not reachable", true);
        // Close PC if it was already created before the error (e.g. createOffer
        // failed after createPeerConnection). Without this the PC can still
        // connect in the background and flip UI to "connected" with no peer ID.
        if (pcRef.current) {
          pcRef.current.getSenders().forEach((s) => s.track?.stop());
          pcRef.current.close();
          pcRef.current = null;
        }
        closeCallChannel();
        resetSignalingRefs();
        setIsOutgoingCall(false);
        setHasActiveCall(false);
        setCallStatus("idle");
        setStatusDotState("idle");
        setCurrentPeerId("");
        soundManager.playCancel();
      }
    },
    [
      selfId,
      hangup,
      openCallChannel,
      closeCallChannel,
      createPeerConnection,
      attachLocalTracks,
      sendSignal,
      streamQuality,
      addStatus,
      addCallHistory,
      resetSignalingRefs,
      setCallStatus,
      setStatusDotState,
    ],
  );

  useEffect(() => { handleCallRef.current = handleCall; }, [handleCall]);
  useEffect(() => { addStatusRef.current = addStatus; }, [addStatus]);

  const handleAcceptCall = useCallback(async () => {
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
    answerProcessedRef.current = false;
    resetSignalingRefs();

    addStatus(`Accepting call — creating peer connection...`);
    await createPeerConnection(from, true);
    if (localStreamRef.current) {
      await attachLocalTracks(localStreamRef.current);
    }

    setCurrentPeerId(from);

    addStatus("Setting remote description (offer)...");
    await pcRef.current.setRemoteDescription(offer);

    const buffered = pendingIceRef.current.length;
    if (buffered > 0) addStatus(`Flushing ${buffered} buffered ICE candidate${buffered > 1 ? "s" : ""}...`);
    for (const c of pendingIceRef.current) {
      await pcRef.current.addIceCandidate(c);
    }
    pendingIceRef.current = [];

    addStatus("Creating answer...");
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
    addStatus(`Answer sent. Waiting for ICE to establish a path...`);

    addCallHistory(from, "incoming", "connected");
    addStatus(
      `Call accepted. Connecting to <strong style="font-family:monospace">${from}</strong>...`,
    );
    soundManager.playConnecting();
    setStatusDotState("connecting");
    setCallStatus("connecting");
  }, [
    incomingCall,
    createPeerConnection,
    attachLocalTracks,
    sendSignal,
    streamQuality,
    addStatus,
    addCallHistory,
    resetSignalingRefs,
    setCallStatus,
    setStatusDotState,
    setIncomingCall,
    setRemoteBitrate,
  ]);

  const handleDeclineCall = useCallback(() => {
    if (!incomingCall) return;
    soundManager.stopIncomingLoop();
    const { from } = incomingCall;
    sendSignal({ type: "decline", to: from });
    setIncomingCall(null);
    // Clear the "incoming processed" guard so this peer can be rung again;
    // without this a single decline would silently block all future calls.
    resetSignalingRefs();
    addCallHistory(from, "incoming", "declined");
    addStatus(
      `Call from <strong style="font-family:monospace">${from}</strong> declined.`,
    );
  }, [incomingCall, sendSignal, resetSignalingRefs, addCallHistory, addStatus, setIncomingCall]);

  const handleBroadcast = useCallback(
    async () => setSourcePickerOpen(true),
    [],
  );

  const handleChangeSource = useCallback(
    async () => setSourcePickerOpen(true),
    [],
  );

  const handlePiP = useCallback(async () => {
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else if (remoteVideoRef.current)
        await remoteVideoRef.current.requestPictureInPicture();
    } catch (e) {
      addStatus("PiP not supported for this source.", true);
    }
  }, [addStatus]);

  const handleFullscreen = useCallback(async () => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement) return;

    try {
      if (videoElement.requestFullscreen) {
        await videoElement.requestFullscreen();
      } else if (videoElement.webkitRequestFullscreen) {
        await videoElement.webkitRequestFullscreen();
      }
    } catch (e) {
      console.error("[Fullscreen] error:", e);
    }
  }, []);

  const handleCopyId = useCallback(async () => {
    await navigator.clipboard.writeText(selfId);
  }, [selfId]);

  const handleRegenId = useCallback(async () => {
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
      const profile = await window.electronAPI.regenerateProfile();
      if (!profile) {
        addStatus("Cannot change ID during a call.", true);
        return;
      }
      setSelfId(profile.id);
      window.__SELF_ID__ = profile.id;
      await initMyRoom(profile.id);
      addStatus("New ID created.");
    } catch (e) {
      addStatus("Failed to change ID: " + (e.message || "Unknown error"), true);
    }
  }, [initMyRoom, addStatus]);

  const handleHangup = useCallback(async () => {
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
  }, [currentPeerId, hangup, addStatus]);

  // Apply visual settings to document
  useEffect(() => {
    const root = document.documentElement;
    const base = appSettings.accentColor || "#B9D9CC";
    const isDark = (appSettings.theme || "dark") === "dark";
    root.style.setProperty("--color-accent", adjustAccentForTheme(base, isDark));
    root.setAttribute("data-theme", appSettings.theme || "dark");
    root.classList.toggle("reduce-motion", !!appSettings.reduceMotion);
    root.classList.toggle("monochromatic", !!appSettings.monochromatic);
  }, [appSettings.accentColor, appSettings.theme, appSettings.reduceMotion, appSettings.monochromatic]);

  // Apply sound enabled state
  useEffect(() => {
    soundManager.setEnabled(appSettings.soundEnabled !== false);
  }, [appSettings.soundEnabled]);

  // Traffic limit warnings: check every minute during active call
  const trafficWarnedRef = useRef(0);
  useEffect(() => {
    if (!hasActiveCall || !appSettings.trafficLimits?.enabled) return;
    const id = setInterval(() => {
      const { sentBytes, receivedBytes } = getTrafficStats();
      const sentGB = sentBytes / 1_073_741_824;
      const rcvdGB = receivedBytes / 1_073_741_824;
      const now = Date.now();
      const exceeded =
        sentGB > (appSettings.trafficLimits.uploadGB || 50) ||
        rcvdGB > (appSettings.trafficLimits.downloadGB || 50);
      if (exceeded && now - trafficWarnedRef.current > 300_000) {
        trafficWarnedRef.current = now;
        addStatus(
          `Traffic limit exceeded — sent ${sentGB.toFixed(2)} GB / received ${rcvdGB.toFixed(2)} GB.`,
          true,
        );
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [hasActiveCall, appSettings.trafficLimits, addStatus]);

  const handleSaveSettings = useCallback(async (newSettings) => {
    setAppSettings(newSettings);
    if (window.electronAPI?.saveSettings) {
      window.electronAPI.saveSettings(newSettings).catch(() => {});
    }
  }, []);

  const handleCancelCall = useCallback(() => {
    // Tell the other side first (uses the still-open signaling channel), then
    // run the same full teardown as hangup so no partial state is left behind.
    const target = incomingCall?.from || currentPeerId;
    if (target) sendSignal({ type: "cancel", to: target });
    hangup(false);
    addStatus("Call cancelled.");
  }, [incomingCall, currentPeerId, sendSignal, hangup, addStatus]);

  return (
    <SettingsContext.Provider value={appSettings}>
    <div className="h-screen flex flex-col bg-bg text-text font-sans text-[13px] antialiased overflow-hidden">
<StatusGlow state={glowState} trigger={glowTrigger} />
      <TitleBar
        connectionStatus={callStatus}
        hasActiveCall={hasActiveCall}
        version={version}
        updateAvailable={updateInfo.updateAvailable}
        updateUrl={updateInfo.url}
      />
      <div className="h-[calc(100vh-38px)] flex p-[10px] gap-0 overflow-hidden">
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex flex-col overflow-hidden shrink-0">
        <Sidebar
          selfId={selfId}
          onCopyId={handleCopyId}
          onRegenId={handleRegenId}
          onCall={handleCall}
          onHangup={handleHangup}
          onCancelCall={handleCancelCall}
          hasActiveCall={hasActiveCall}
          connectionStatus={callStatus}
          isInCall={hasActiveCall || callStatus === "connecting"}
          signalingStatus={signalingStatus}
          statusMessages={statusLog}
          version={version}
          remoteId={remoteId}
          onRemoteIdChange={setRemoteId}
          localStream={localStream}
          onBroadcast={handleBroadcast}
          onStopBroadcast={stopBroadcast}
          onChangeSource={handleChangeSource}
          onPiP={handlePiP}
          onFullscreen={handleFullscreen}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          callHistory={callHistory}
        />
        </div>
        {/* resize handle */}
        <div
          className="w-[10px] shrink-0 flex items-center justify-center cursor-col-resize group"
          onMouseDown={handleResizeStart}
        >
          <div className="w-[2px] h-[32px] rounded-full bg-border opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
        </div>
        <main className="flex flex-col min-h-0 overflow-hidden flex-1">
          <VideoPanel
            ref={remoteVideoRef}
            title="Peer Screen"
            meta={remoteMeta}
            bitrate={remoteBitrate}
            showPlaceholder={!streamHasVideo(remoteStream)}
            className={remoteVideoWrapClass}
            videoRef={remoteVideoRef}
            containerRef={remoteContainerRef}
            isDisabled={!hasActiveCall}
            overlay={
              callStatus === "connecting" && !incomingCall ? (
                <CallingOverlay
                  peerId={currentPeerId}
                  onCancel={handleCancelCall}
                  isOutgoing={isOutgoingCall}
                />
              ) : null
            }
          />
        </main>
      </div>
      {/* Incoming call modal (takes precedence over connecting overlay) */}
      {!!incomingCall && (
        <IncomingCallDialog
          callerId={incomingCall.from}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      <CallHistoryDialog
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={callHistory}
        onClear={() => {
          setCallHistory([]);
          try { localStorage.removeItem("callHistory"); } catch {}
        }}
      />

      <SettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={appSettings}
        onSave={handleSaveSettings}
      />
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
    </SettingsContext.Provider>
  );
}
