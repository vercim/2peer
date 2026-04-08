import { useState, useCallback, useRef, useEffect } from "react";

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

export function useWebRTC({ onStatusChange, onRemoteStream, onRemoteMeta }) {
  const [pc, setPc] = useState(null);
  const [currentPeerId, setCurrentPeerId] = useState("");
  const localStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingIce = useRef([]);

  const createPeerConnection = useCallback(
    (peerId) => {
      setCurrentPeerId(peerId);
      const peerConnection = new RTCPeerConnection(rtcConfig);

      peerConnection.ontrack = (event) => {
        const stream = event?.streams?.[0] || null;
        if (stream && remoteVideoRef.current?.srcObject !== stream) {
          remoteVideoRef.current.srcObject = stream;
          if (onRemoteStream) onRemoteStream(stream);
        }
        const s = event.track.getSettings ? event.track.getSettings() : {};
        if (onRemoteMeta)
          onRemoteMeta(
            `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || "?")}fps`,
          );
      };

      peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate && currentPeerId) {
          window.dispatchEvent(
            new CustomEvent("webrtc:ice", {
              detail: { candidate, to: peerId },
            }),
          );
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const st = peerConnection?.connectionState;
        console.log("[connectionState]", st);
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log("[iceConnectionState]", peerConnection?.iceConnectionState);
        if (peerConnection?.iceConnectionState === "failed")
          peerConnection.restartIce();
      };

      setPc(peerConnection);
      return peerConnection;
    },
    [currentPeerId, onRemoteStream, onRemoteMeta],
  );

  const attachLocalTracks = useCallback(async () => {
    if (!localStreamRef.current || !localStreamRef.current.active || !pc)
      return;
    const stream = localStreamRef.current;
    const existing = new Set(
      (pc.getSenders() || []).map((s) => s.track?.id).filter(Boolean),
    );
    for (const track of stream.getTracks()) {
      if (!existing.has(track.id)) {
        const sender = pc.addTrack(track, stream);
        setTimeout(() => applyMaxQualityEncoding(sender), 500);
      }
    }
  }, [pc]);

  const setLocalStream = useCallback((stream) => {
    localStreamRef.current = stream;
  }, []);

  const setRemoteVideoRef = useCallback((ref) => {
    remoteVideoRef.current = ref;
  }, []);

  const handleOffer = useCallback(
    async (offer) => {
      if (!pc) return;
      await pc.setRemoteDescription(offer);
      for (const c of pendingIce.current) await pc.addIceCandidate(c);
      pendingIce.current = [];
      await pc.setLocalDescription(await pc.createAnswer());
      return pc.localDescription;
    },
    [pc],
  );

  const handleAnswer = useCallback(
    async (answer) => {
      if (!pc) return;
      await pc.setRemoteDescription(answer);
      pc.getSenders().forEach(applyMaxQualityEncoding);
    },
    [pc],
  );

  const handleCandidate = useCallback(
    async (candidate) => {
      if (!candidate || !pc || !pc.remoteDescription) {
        pendingIce.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch (_) {}
    },
    [pc],
  );

  const createOffer = useCallback(async () => {
    if (!pc) return null;
    await attachLocalTracks();
    return await pc.createOffer({ offerToReceiveVideo: true });
  }, [pc, attachLocalTracks]);

  const setLocalDescription = useCallback(
    async (desc) => {
      if (!pc) return;
      await pc.setLocalDescription(desc);
    },
    [pc],
  );

  const close = useCallback(() => {
    if (pc) {
      pc.getSenders().forEach((s) => s.track?.stop());
      pc.close();
    }
    setPc(null);
    setCurrentPeerId("");
    pendingIce.current = [];
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [pc]);

  return {
    pc,
    currentPeerId,
    createPeerConnection,
    attachLocalTracks,
    setLocalStream,
    setRemoteVideoRef,
    handleOffer,
    handleAnswer,
    handleCandidate,
    createOffer,
    setLocalDescription,
    close,
    streamHasVideo,
  };
}

export function useBroadcast({ onMetaChange, onStatusChange, onStreamChange }) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = useRef(null);

  const ensureLocalScreen = useCallback(async () => {
    if (localStream && localStream.active) return localStream;

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }

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

    const [track] = stream.getVideoTracks();
    track.contentHint = "detail";
    await track
      .applyConstraints({
        width: { ideal: 2560 },
        height: { ideal: 1440 },
        frameRate: { ideal: 60, max: 60 },
      })
      .catch(() => {});

    track.onended = () => {
      stopBroadcast();
      window.dispatchEvent(new CustomEvent("broadcast:stop"));
    };

    setLocalStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const s = track.getSettings ? track.getSettings() : {};
    const meta = `${s.width || "?"}×${s.height || "?"} @${Math.round(s.frameRate || 60)}fps`;
    if (onMetaChange) onMetaChange(meta);
    if (onStreamChange) onStreamChange(stream);

    return stream;
  }, [localStream, onMetaChange, onStreamChange]);

  const startBroadcast = useCallback(
    async (stream) => {
      if (!stream || !stream.active) return;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsBroadcasting(true);
      if (onStatusChange) onStatusChange("Broadcast started.");
    },
    [onStatusChange],
  );

  const stopBroadcast = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setIsBroadcasting(false);
    if (onMetaChange) onMetaChange("—");
    if (onStatusChange) onStatusChange("Broadcast stopped.");
  }, [localStream, onMetaChange, onStatusChange]);

  const setLocalVideoRef = useCallback((ref) => {
    localVideoRef.current = ref;
  }, []);

  return {
    isBroadcasting,
    localStream,
    ensureLocalScreen,
    startBroadcast,
    stopBroadcast,
    setLocalVideoRef,
  };
}
