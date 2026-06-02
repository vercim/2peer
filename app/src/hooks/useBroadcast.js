import { useCallback } from "react";
import { getResolutionByValue } from "../utils/rtcConfig.js";
import { applyMaxQualityEncoding } from "../utils/bitrateManager.js";
import { setMaxBandwidthInSDP } from "../utils/sdpUtils.js";
import { stopStreamTracks } from "../utils/streamUtils.js";

export function useBroadcast({
  pcRef,
  currentPeerId,
  streamQuality,
  streamAudio,
  localStreamRef,
  localVideoRef,
  setLocalStream,
  setLocalMeta,
  setLocalVideoWrapClass,
  addStatus,
  sendSignal,
  attachLocalTracks,
}) {
  const handleSourceSelected = useCallback(
    async (sourceId) => {
      if (localStreamRef.current) {
        stopStreamTracks(localStreamRef.current);
        setLocalStream(null);
        localStreamRef.current = null;
      }

      const res = getResolutionByValue(streamQuality.resolution);

      console.log("[Broadcast] Source ID:", sourceId);

      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: res.width },
            height: { ideal: res.height },
            frameRate: { ideal: streamQuality.fps },
          },
          audio: !!streamAudio,
        });
      } catch (e) {
        console.log("[Broadcast] getDisplayMedia failed:", e.message);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sourceId,
              maxWidth: res.width,
              maxHeight: res.height,
              maxFrameRate: streamQuality.fps,
            },
          },
          audio: !!streamAudio,
        });
      }

      console.log("[Broadcast] Video tracks:", stream.getVideoTracks().length);
      console.log("[Broadcast] Audio tracks:", stream.getAudioTracks().length);

      const [videoTrack] = stream.getVideoTracks();
      videoTrack.onended = () => {
        if (localStreamRef.current) {
          stopStreamTracks(localStreamRef.current);
        }
        setLocalStream(null);
        localStreamRef.current = null;
        setLocalVideoWrapClass(
          "flex-1 min-h-0 relative bg-[#050505] placeholder",
        );
        setLocalMeta("—-");
        addStatus("Broadcast stopped.");
        if (currentPeerId && pcRef.current?.connectionState === "connected")
          sendSignal({ type: "stop-broadcast", to: currentPeerId });
      };

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (pcRef.current?.connectionState === "connected") {
        await attachLocalTracks(stream, pcRef.current);
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
      const q = getResolutionByValue(streamQuality.resolution);
      setLocalMeta(`${q.width}×${q.height} @${streamQuality.fps}fps`);
      addStatus("Broadcast started.");
    },
    [
      pcRef,
      currentPeerId,
      streamQuality,
      streamAudio,
      localStreamRef,
      localVideoRef,
      setLocalStream,
      setLocalMeta,
      setLocalVideoWrapClass,
      addStatus,
      sendSignal,
      attachLocalTracks,
    ],
  );

  const stopBroadcast = useCallback(() => {
    if (pcRef.current && pcRef.current.connectionState === "connected") {
      const senders = pcRef.current.getSenders();
      let hasVideo = false;
      for (const sender of senders) {
        if (sender.track) {
          if (sender.track.kind === "video") hasVideo = true;
          try {
            pcRef.current.removeTrack(sender);
          } catch (_) {}
        }
      }
      if (hasVideo) {
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
    }
    if (localStreamRef.current) {
      stopStreamTracks(localStreamRef.current);
      setLocalStream(null);
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setLocalVideoWrapClass("flex-1 min-h-0 relative bg-[#050505] placeholder");
    setLocalMeta("");
    addStatus("Broadcast stopped.");
    if (currentPeerId && pcRef.current?.connectionState === "connected")
      sendSignal({ type: "stop-broadcast", to: currentPeerId });
  }, [
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
  ]);

  return { handleSourceSelected, stopBroadcast };
}
