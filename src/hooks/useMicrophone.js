import { useCallback } from "react";
import { applyMaxQualityEncoding } from "../utils/bitrateManager.js";
import { setMaxBandwidthInSDP } from "../utils/sdpUtils.js";

export function useMicrophone({
  pcRef,
  currentPeerId,
  streamQuality,
  localStreamRef,
  addStatus,
  sendSignal,
  isMicMuted,
  setIsMicMuted,
  setHasMicTrack,
}) {
  const startMicrophone = useCallback(
    async (deviceId) => {
      try {
        const constraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false,
        };

        console.log("[Mic] Starting with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const audioTrack = stream.getAudioTracks()[0];

        if (!audioTrack) {
          console.log("[Mic] No audio track found");
          addStatus("No microphone found.", true);
          return null;
        }

        audioTrack.enabled = !isMicMuted;
        console.log("[Mic] Audio track:", audioTrack.id);

        if (pcRef.current?.connectionState === "connected") {
          const senders = pcRef.current.getSenders();
          const existingMicSender = senders.find(
            (s) => s.track?.kind === "audio" && s.track.id !== audioTrack.id,
          );

          if (!existingMicSender && localStreamRef.current) {
            pcRef.current.addTrack(audioTrack, localStreamRef.current);
          }

          pcRef.current.getSenders().forEach((s) => {
            if (s.track?.kind === "audio") {
              applyMaxQualityEncoding(s, streamQuality);
            }
          });

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
            console.error("[Mic] Renegotiation error:", err);
          }
        }

        if (setHasMicTrack) setHasMicTrack(true);
        addStatus("Microphone started.");

        return { stream, track: audioTrack };
      } catch (err) {
        console.error("[Mic] Error:", err);
        addStatus("Failed to start microphone.", true);
        return null;
      }
    },
    [
      pcRef,
      currentPeerId,
      streamQuality,
      localStreamRef,
      addStatus,
      sendSignal,
      isMicMuted,
    ],
  );

  const stopMicrophone = useCallback(
    async (stream, track) => {
      if (!stream || !track) return;

      track.stop();
      stream.getTracks().forEach((t) => t.stop());

      if (pcRef.current?.connectionState === "connected") {
        const senders = pcRef.current.getSenders();
        const audioSender = senders.find((s) => s.track?.kind === "audio");

        if (audioSender) {
          try {
            pcRef.current.removeTrack(audioSender);
          } catch (_) {}
        }

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
          console.error("[Mic] Renegotiation error:", err);
        }
      }

      if (setHasMicTrack) setHasMicTrack(false);
      addStatus("Microphone stopped.");
    },
    [
      pcRef,
      currentPeerId,
      streamQuality,
      addStatus,
      sendSignal,
      setHasMicTrack,
    ],
  );

  const toggleMicrophone = useCallback(
    (track) => {
      if (!track) return;
      const newMuted = !isMicMuted;
      track.enabled = !newMuted;
      setIsMicMuted(newMuted);
      addStatus(newMuted ? "Microphone muted." : "Microphone unmuted.");
    },
    [isMicMuted, setIsMicMuted, addStatus],
  );

  const changeMicrophone = useCallback(
    async (newDeviceId, oldStream) => {
      if (oldStream) {
        oldStream.getTracks().forEach((t) => t.stop());
      }

      return startMicrophone(newDeviceId);
    },
    [startMicrophone],
  );

  return {
    startMicrophone,
    stopMicrophone,
    toggleMicrophone,
    changeMicrophone,
  };
}
