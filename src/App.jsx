import { useState, useRef, useEffect, useCallback } from "react";
import { TitleBar } from "./components/TitleBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { VideoPanel } from "./components/VideoPanel.jsx";
import { SourcePicker } from "./components/SourcePicker.jsx";
import { ConfirmDialog } from "./components/ConfirmDialog.jsx";
import { StatusGlow } from "./components/StatusGlow.jsx";
import { soundManager } from "./utils/soundManager.js";
import {
  qualityOptions,
  getResolutionByValue,
  DEFAULT_BITRATES,
  getFullRtcConfig,
} from "./utils/rtcConfig.js";
import {
  applyMaxQualityEncoding,
  getDefaultBitrateForResolution,
  setUserManualBitrate,
} from "./utils/bitrateManager.js";
import { setMaxBandwidthInSDP } from "./utils/sdpUtils.js";
import { streamHasVideo, stopStreamTracks } from "./utils/streamUtils.js";
import { useStatusLog } from "./hooks/useStatusLog.js";
import { useSignaling } from "./hooks/useSignaling.js";
import { usePeerConnection } from "./hooks/usePeerConnection.js";
import { useBroadcast } from "./hooks/useBroadcast.js";

export default function App({ version = "" }) {
  const [selfId, setSelfId] = useState("");
  const [supabaseStatus, setSupabaseStatus] = useState("disconnected");
  const [statusDotState, setStatusDotState] = useState("idle");
  const [callStatus, setCallStatus] = useState("idle");
  const [statusLog, setStatusLog] = useState([]);
  const [glowTrigger, setGlowTrigger] = useState(0);
  const [glowState, setGlowState] = useState("idle");

  const { addStatus } = useStatusLog(statusLog, setStatusLog);

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

  const [remoteId, setRemoteId] = useState("");

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
  const hangupCallbackRef = useRef(null);
  const handleSignalRef = useRef(null);
  const localStreamRef = useRef(null);

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

  const { sendSignal, handleSignal, resetSignalingRefs } = useSignaling({
    pcRef,
    selfId,
    currentPeerId,
    streamQuality,
    pendingIceRef,
    outChannelRef,
    supabaseClientRef,
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
  });

  useEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  const { createPeerConnection, attachLocalTracks, closePeerConnection } =
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
    localStreamRef,
    localVideoRef,
    setLocalStream,
    setLocalMeta,
    setLocalVideoWrapClass,
    addStatus,
    sendSignal,
    attachLocalTracks,
  });

  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState !== "connected") return;

    setUserManualBitrate(true);
    clearTimeout(window._manualBitrateTimeout);
    window._manualBitrateTimeout = setTimeout(() => {
      setUserManualBitrate(false);
    }, 15000);

    const res = getResolutionByValue(streamQuality.resolution);

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

    const manualBitrate = getDefaultBitrateForResolution(
      streamQuality.resolution,
    );

    pc.getSenders().forEach((s) =>
      applyMaxQualityEncoding(s, streamQuality, manualBitrate),
    );

    setLocalMeta(`${res.width}×${res.height} @${streamQuality.fps}fps`);
  }, [streamQuality]);

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

  const connectSupabase = useCallback(
    async (url, key, id) => {
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
          console.log("[Supabase] Client created, URL:", url);
        } catch (e) {
          console.error("[Supabase] Init error:", e);
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
      ch.on("broadcast", { event: "signal" }, ({ payload }) => {
        console.log("[Supabase] Received signal:", payload?.type);
        handleSignalRef.current?.(payload);
      });
      ch.on("error", (err) => {
        console.error("[Supabase] Channel error:", err);
        addStatus("Channel error: " + (err?.message || "Unknown"), true);
      });

      ch.subscribe((status) => {
        console.log("[Supabase] Subscribe status:", status);
        if (status === "SUBSCRIBED") {
          setSupabaseStatus("connected");
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          addStatus('Ready. Share your ID and click "Call".');
        }
        if (status === "CHANNEL_ERROR") {
          setSupabaseStatus("error");
          addStatus("Channel error.", true);
        }
        if (status === "TIMED_OUT") {
          setSupabaseStatus("error");
          addStatus("Connection timeout.", true);
        }
        if (status === "CLOSED") {
          console.log("[Supabase] Channel closed");
          setSupabaseStatus("error");
          addStatus("Connection closed.", true);
        }
      });

      myChannelRef.current = ch;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (ch.state !== "joined") {
            console.log("[Supabase] Timeout, channel state:", ch.state);
            setSupabaseStatus("error");
            reject(new Error("Connection timeout"));
          }
        }, 10000);

        const checkInterval = setInterval(() => {
          if (ch.state === "joined" || ch.state === "subscribed") {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            resolve(ch);
          }
        }, 100);
      });
    },
    [handleSignalRef],
  );

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
  }, [isElectronReady, connectSupabase]);

  useEffect(() => {
    if (window.electronAPI?.onCallLast) {
      window.electronAPI.onCallLast((lastCalledId) => {
        if (lastCalledId && selfId) {
          handleCall(lastCalledId);
        }
      });
    }
    if (window.electronAPI?.onSetRemoteId) {
      window.electronAPI.onSetRemoteId((id) => {
        setRemoteId(id);
        setTimeout(() => handleCall(id), 100);
      });
    }
    if (window.electronAPI?.onProfileUpdated) {
      window.electronAPI.onProfileUpdated((profile) => {
        setSelfId(profile.id);
        window.__SELF_ID__ = profile.id;
        addStatus("ID updated: " + profile.id);
      });
    }
  }, [selfId, addStatus]);

  const hangup = useCallback(
    (notify = true) => {
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
        if (bitrateIntervalRef.current)
          clearInterval(bitrateIntervalRef.current);
        setRemoteBitrate(0);
        window._prevBytesReceived = 0;
      }
      pcRef.current = null;
      setCurrentPeerId("");
      setHasActiveCall(false);
      pendingIceRef.current = [];
      setIncomingCall(null);
      setStatusDotState("idle");
      setGlowState("failed");
      setGlowTrigger((prev) => prev + 1);
      if (localStreamRef.current) {
        stopStreamTracks(localStreamRef.current);
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
      setRemoteVideoWrapClass(
        "flex-1 min-h-0 relative bg-[#050505] placeholder",
      );
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => {
          if (s.track) s.track.stop();
        });
      }
    },
    [
      currentPeerId,
      sendSignal,
      setRemoteBitrate,
      setLocalStream,
      setLocalMeta,
      setLocalVideoWrapClass,
      setRemoteStream,
      setRemoteMeta,
      setRemoteVideoWrapClass,
      setIncomingCall,
      setCurrentPeerId,
      setHasActiveCall,
      setStatusDotState,
      setGlowState,
      setGlowTrigger,
    ],
  );

  useEffect(() => {
    hangupCallbackRef.current = hangup;
  }, [hangup]);

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

      await createPeerConnection(peerId, false);
      await attachLocalTracks(localStreamRef.current);

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

      setCurrentPeerId(peerId);
      addStatus(
        `Calling <strong style="font-family:monospace">${peerId}</strong>...`,
      );
      soundManager.playCall();
      setStatusDotState("connecting");
      setCallStatus("connecting");
      if (window.electronAPI?.setLastCalledId) {
        window.electronAPI.setLastCalledId(peerId);
      }
    },
    [
      selfId,
      hangup,
      createPeerConnection,
      attachLocalTracks,
      sendSignal,
      streamQuality,
      addStatus,
      resetSignalingRefs,
      setCallStatus,
      setStatusDotState,
    ],
  );

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

    await createPeerConnection(from, true);
    await attachLocalTracks(localStreamRef.current);

    setCurrentPeerId(from);

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
    setStatusDotState("connecting");
    setCallStatus("connecting");
  }, [
    incomingCall,
    createPeerConnection,
    attachLocalTracks,
    sendSignal,
    streamQuality,
    addStatus,
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
    setIncomingCall(null);
    sendSignal({ type: "decline", to: from });
    addStatus(
      `Call from <strong style="font-family:monospace">${from}</strong> declined.`,
    );
  }, [incomingCall, sendSignal, addStatus, setIncomingCall]);

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
      } else if (videoElement.msRequestFullscreen) {
        await videoElement.msRequestFullscreen();
      }
    } catch (e) {
      console.error(
        "[Fullscreen] Ошибка при переходе в полноэкранный режим:",
        e,
      );
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
  }, [config, connectSupabase, addStatus]);

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

  const handleCancelCall = useCallback(() => {
    if (incomingCall) {
      sendSignal({ type: "cancel", to: incomingCall.from });
    } else if (currentPeerId) {
      sendSignal({ type: "cancel", to: currentPeerId });
    }
    if (outChannelRef.current) {
      supabaseClientRef.current
        ?.removeChannel(outChannelRef.current)
        .catch(() => {});
      outChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    setCurrentPeerId("");
    setHasActiveCall(false);
    setCallStatus("idle");
    setStatusDotState("idle");
    soundManager.playCancel();
    addStatus("Call cancelled.");
  }, [
    incomingCall,
    currentPeerId,
    sendSignal,
    addStatus,
    setCallStatus,
    setStatusDotState,
    setCurrentPeerId,
    setHasActiveCall,
  ]);

  return (
    <div className="h-screen flex flex-col bg-bg text-text font-sans text-[13px] antialiased overflow-hidden">
      <StatusGlow state={glowState} trigger={glowTrigger} />
      <TitleBar
        status={statusDotState}
        connectionStatus={callStatus}
        hasActiveCall={hasActiveCall}
        version={version}
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
          remoteId={remoteId}
          onRemoteIdChange={setRemoteId}
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
