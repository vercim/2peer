import { useCallback, useRef } from "react";
import { getFullRtcConfig } from "../utils/rtcConfig.js";
import {
  applyMaxQualityEncoding,
  monitorBitrate,
  resetBitrateState,
} from "../utils/bitrateManager.js";
import { soundManager } from "../utils/soundManager.js";

export function usePeerConnection({
  pcRef,
  streamQuality,
  bitrateIntervalRef,
  setRemoteBitrate,
  setRemoteMeta,
  setRemoteStream,
  setRemoteVideoWrapClass,
  setStatusDotColor,
  setGlowColor,
  setGlowTrigger,
  setCallStatus,
  setHasActiveCall,
  addStatus,
  remoteVideoRef,
}) {
  const createPeerConnection = useCallback(
    async (peerId, isPolite = false) => {
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

      const configWithIPs = getFullRtcConfig();
      const pc = new RTCPeerConnection(configWithIPs);

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
        const width =
          settings.width || track?.getConstraints?.().width || "1920";
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
          return { type: "candidate", candidate };
        }
        return null;
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
          setGlowColor("#4ade80");
          setGlowTrigger((prev) => prev + 1);
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
              bitrateIntervalRef.current = setInterval(() => {
                monitorBitrate(
                  pcRef,
                  setRemoteBitrate,
                  setRemoteMeta,
                  streamQuality,
                  applyMaxQualityEncoding,
                );
              }, 2500);
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

      pcRef.current = pc;
      return pc;
    },
    [
      pcRef,
      bitrateIntervalRef,
      streamQuality,
      setRemoteBitrate,
      setRemoteMeta,
      setRemoteStream,
      setRemoteVideoWrapClass,
      setStatusDotColor,
      setGlowColor,
      setGlowTrigger,
      setCallStatus,
      setHasActiveCall,
      addStatus,
      remoteVideoRef,
    ],
  );

  const attachLocalTracks = useCallback(
    async (streamToAttach, pc) => {
      const peerConnection = pc || pcRef.current;
      if (!streamToAttach || !streamToAttach.active || !peerConnection) return;
      const senders = peerConnection.getSenders() || [];
      const tracks = streamToAttach.getTracks();

      for (const track of tracks) {
        const existingSender = senders.find(
          (s) => s.track?.kind === track.kind,
        );
        if (existingSender) {
          await existingSender.replaceTrack(track);
          applyMaxQualityEncoding(existingSender, streamQuality);
        } else {
          const sender = peerConnection.addTrack(track, streamToAttach);
          applyMaxQualityEncoding(sender, streamQuality);
        }
      }
    },
    [pcRef, streamQuality],
  );

  const closePeerConnection = useCallback(() => {
    if (bitrateIntervalRef.current) {
      clearInterval(bitrateIntervalRef.current);
      bitrateIntervalRef.current = null;
    }
    setRemoteBitrate(0);
    window._prevBytesReceived = 0;
    resetBitrateState();
  }, [bitrateIntervalRef, setRemoteBitrate]);

  return { createPeerConnection, attachLocalTracks, closePeerConnection };
}
