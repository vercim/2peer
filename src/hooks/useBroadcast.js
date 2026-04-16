import { useCallback } from "react";
import { qualityOptions, getResolutionByValue } from "../utils/rtcConfig.js";
import { applyMaxQualityEncoding } from "../utils/bitrateManager.js";
import { setMaxBandwidthInSDP } from "../utils/sdpUtils.js";
import { stopStreamTracks } from "../utils/streamUtils.js";

export function useBroadcast({
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
  micDeviceId,
  isMicMuted,
  setIsMicMuted,
  setHasAudioTrack,
}) {
  const handleSourceSelected = useCallback(
    async (sourceId, micDeviceIdParam, micMutedParam) => {
      if (localStreamRef.current) {
        stopStreamTracks(localStreamRef.current);
        setLocalStream(null);
        localStreamRef.current = null;
      }

      const res = getResolutionByValue(streamQuality.resolution);

      const streamConstraints = {
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            maxWidth: res.width,
            maxHeight: res.height,
            maxFrameRate: streamQuality.fps,
          },
        },
      };

      if (micDeviceIdParam) {
        streamConstraints.audio = {
          deviceId: { exact: micDeviceIdParam },
        };
      } else {
        streamConstraints.audio = {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
          },
        };
      }

      const stream =
        await navigator.mediaDevices.getUserMedia(streamConstraints);

      const hasAudio = stream.getAudioTracks().length > 0;
      if (setHasAudioTrack) {
        setHasAudioTrack(hasAudio);
      }

      let micTrack = null;
      if (micDeviceIdParam) {
        micTrack = stream.getAudioTracks()[0];
        if (micTrack) {
          micTrack.enabled = micMutedParam === false;
        }
      } else if (hasAudio) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && audioTrack.enabled !== undefined) {
          audioTrack.enabled = micMutedParam === false;
        }
      }

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
        if (setHasAudioTrack) setHasAudioTrack(false);
        addStatus("Broadcast stopped.");
        if (currentPeerId && pcRef.current?.connectionState === "connected")
          sendSignal({ type: "stop-broadcast", to: currentPeerId });
      };

      if (hasAudio) {
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.onended = () => {
          if (setHasAudioTrack) setHasAudioTrack(false);
        };
      }

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

  const changeMic = useCallback(
    async (newMicDeviceId, stream, pc) => {
      if (!pc || !stream) return;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: newMicDeviceId } },
        });
        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) return;

        newTrack.enabled = stream.getAudioTracks()[0]?.enabled ?? false;

        const senders = pc.getSenders();
        const audioSender = senders.find((s) => s.track?.kind === "audio");
        if (audioSender) {
          await audioSender.replaceTrack(newTrack);
        } else {
          pc.addTrack(newTrack, stream);
        }

        const oldAudioTrack = stream.getAudioTracks()[0];
        if (oldAudioTrack) {
          oldAudioTrack.stop();
        }

        stream.removeTrack(stream.getAudioTracks()[0]);
        stream.addTrack(newTrack);

        addStatus("Microphone changed.");
      } catch (err) {
        console.error("[ChangeMic] Error:", err);
        addStatus("Failed to change microphone.", true);
      }
    },
    [addStatus],
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
    setLocalMeta("—-");
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

  return { handleSourceSelected, stopBroadcast, changeMic };
}
