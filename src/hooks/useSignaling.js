import { useRef, useCallback } from "react";
import { soundManager } from "../utils/soundManager.js";
import { setMaxBandwidthInSDP } from "../utils/sdpUtils.js";
import { applyMaxQualityEncoding } from "../utils/bitrateManager.js";
import { stopStreamTracks } from "../utils/streamUtils.js";

export function useSignaling({
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
}) {
  const answerProcessedRef = useRef(false);
  const hangupProcessedRef = useRef(false);

  const ensureOutChannel = useCallback(
    async (peerId) => {
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
    },
    [outChannelRef, supabaseClientRef],
  );

  const sendSignal = useCallback(
    async (payload) => {
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
    },
    [supabaseClientRef, ensureOutChannel, outChannelRef, selfId, addStatus],
  );

  const handleSignal = useCallback(
    async (msg) => {
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
          stopStreamTracks(remoteVideoRef.current.srcObject);
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
        onHangupRequested(false);
      }

      if (msg.type === "cancel") {
        soundManager.stopIncomingLoop();
        setIncomingCall(null);
        setCallStatus("idle");
        setStatusDotState("idle");
        setGlowState("failed");
        setGlowTrigger((prev) => prev + 1);
        addStatus(
          `<strong style="font-family:monospace">${msg.from}</strong> cancelled the call.`,
        );
      }

      if (msg.type === "hangup") {
        if (hangupProcessedRef.current) return;
        hangupProcessedRef.current = true;
        addStatus(
          `<strong style="font-family:monospace">${msg.from}</strong> ended the call.`,
        );
        onHangupRequested(false);
      }
    },
    [
      pcRef,
      streamQuality,
      pendingIceRef,
      remoteVideoRef,
      setRemoteVideoWrapClass,
      setRemoteMeta,
      setIncomingCall,
      setCallStatus,
      setStatusDotState,
      setGlowState,
      setGlowTrigger,
      addStatus,
      onHangupRequested,
      sendSignal,
    ],
  );

  const resetSignalingRefs = useCallback(() => {
    answerProcessedRef.current = false;
    hangupProcessedRef.current = false;
  }, []);

  return { sendSignal, handleSignal, resetSignalingRefs };
}
