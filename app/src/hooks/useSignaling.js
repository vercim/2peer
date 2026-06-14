import { useRef, useCallback, useEffect, useState } from "react";
import {
  joinRoom as joinTorrentRoom,
  getRelaySockets as getTorrentSockets,
} from "@trystero-p2p/torrent";
import {
  joinRoom as joinNostrRoom,
  getRelaySockets as getNostrSockets,
} from "@trystero-p2p/nostr";
import { soundManager } from "../utils/soundManager.js";
import { setMaxBandwidthInSDP } from "../utils/sdpUtils.js";
import { applyMaxQualityEncoding } from "../utils/bitrateManager.js";
import { stopStreamTracks } from "../utils/streamUtils.js";
import { rtcConfig } from "../utils/rtcConfig.js";

// --- Signaling transports ----------------------------------------------------
// Peer discovery is the single point of failure for calls: two peers can only
// ring each other if they share at least one reachable signaling relay. The app
// previously relied solely on BitTorrent WSS trackers — but there are only ~2
// working public ones (openwebtorrent, btorrent), and on a network where both
// are blocked, the callee simply never received the call.
//
// We now run TWO independent transports in parallel and join every room on
// both. A peer is discoverable through whichever transport the other side can
// reach, so a single blocked network no longer kills the call. Trystero shares
// one selfId across strategies, so a peer's id is identical on both transports;
// duplicate inbound signals are absorbed by the idempotency guards below, and
// sending to a peer not present on a given transport is silently skipped by the
// library — so fanning out to both transports is safe.
//
// `rtcConfig` (clean STUN, no dead hosts) is shared with both so the signaling
// data channels traverse NAT on as many networks as the media connection.
const TORRENT_CONFIG = {
  appId: "2peer",
  relayConfig: {
    // Only true general-purpose WSS trackers. PeerTube/instance trackers were
    // dropped: they accept the WebSocket but reject unknown infoHashes, which
    // not only fails to match peers but also slows discovery on the good ones.
    urls: ["wss://tracker.openwebtorrent.com", "wss://tracker.btorrent.xyz"],
  },
  rtcConfig,
};

const NOSTR_CONFIG = {
  appId: "2peer",
  relayConfig: {
    // Verified-reachable, operator-diverse public Nostr relays. There are dozens
    // of these, so the odds that a given network blocks every one are far lower
    // than for the tiny pool of WebTorrent trackers.
    // Relays that aggressively rate-limit or spam-block Trystero's frequent
    // ephemeral announce events were dropped (relay.damus.io — "noting too
    // much"; nostr-pub.wellorder.net — "spam not permitted"). The set below
    // tolerated sustained signaling traffic in testing.
    urls: [
      "wss://nos.lol",
      "wss://relay.primal.net",
      "wss://relay.snort.social",
      "wss://relay.mostr.pub",
      "wss://offchain.pub",
      "wss://nostr.mom",
    ],
  },
  rtcConfig,
};

const TRANSPORTS = [
  { join: joinTorrentRoom, config: TORRENT_CONFIG },
  { join: joinNostrRoom, config: NOSTR_CONFIG },
];

// Join `roomId` on every transport and expose one unified handle. Handlers are
// wired by the caller after creation (setOnMessage / setOnPeerJoin / ...).
function joinRoomMulti(roomId) {
  const legs = [];
  for (const { join, config } of TRANSPORTS) {
    try {
      const room = join(config, roomId);
      legs.push({ room, action: room.makeAction("signal") });
    } catch (e) {
      console.warn("[Signal] transport join failed:", e?.message);
    }
  }
  return {
    legs,
    setOnMessage(fn) {
      legs.forEach((l) => (l.action.onMessage = fn));
    },
    setOnPeerJoin(fn) {
      legs.forEach((l) => (l.room.onPeerJoin = fn));
    },
    setOnPeerLeave(fn) {
      legs.forEach((l) => (l.room.onPeerLeave = fn));
    },
    send(payload, target) {
      legs.forEach((l) =>
        l.action
          .send(payload, { target })
          .catch((e) => console.warn("[Signal] send error:", e?.message)),
      );
    },
    leave() {
      legs.forEach((l) => {
        try {
          l.room.leave();
        } catch (_) {}
      });
    },
  };
}

function getAllRelaySockets() {
  return [
    ...Object.values(getTorrentSockets() || {}),
    ...Object.values(getNostrSockets() || {}),
  ];
}

const CALL_TIMEOUT_MS = 30_000;

export function useSignaling({
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
  callNotifications = true,
}) {
  const answerProcessedRef = useRef(false);
  const hangupProcessedRef = useRef(false);
  const incomingProcessedRef = useRef({ value: false });

  // Each "handle" is a multi-transport room (torrent + nostr joined under the
  // same id). myRoom = the room named after our own id (so others can reach us);
  // callRoom = the callee's room, joined while placing a call.
  const myRoomHandleRef = useRef(null);
  const callRoomHandleRef = useRef(null);

  const peerTrysteroIdRef = useRef(null); // Trystero peer ID of the current call partner

  const [signalingStatus, setSignalingStatus] = useState("disconnected");

  // Watches the actual relay (BitTorrent tracker) WebSocket connections so the
  // status reflects reality instead of flipping to "connected" the moment we
  // join a room. Without an open relay socket, peer discovery can't happen and
  // calls never arrive.
  const relayMonitorRef = useRef({
    timer: null,
    everConnected: false,
    warned: false,
    elapsed: 0,
  });

  const startRelayMonitor = useCallback(() => {
    const m = relayMonitorRef.current;
    clearInterval(m.timer);
    m.everConnected = false;
    m.warned = false;
    m.elapsed = 0;
    m.timer = setInterval(() => {
      const sockets = getAllRelaySockets();
      const open = sockets.filter((s) => s && s.readyState === 1).length;

      if (open > 0) {
        setSignalingStatus("connected");
        if (!m.everConnected) {
          m.everConnected = true;
          addStatus(`Signaling online (${open} server${open > 1 ? "s" : ""}).`);
        }
        return;
      }

      // open === 0. Relay sockets briefly dropping to 0 during normal
      // reconnection is expected once we've connected — only treat a *never*
      // connected state as an error worth warning about.
      setSignalingStatus(m.everConnected ? "connected" : "connecting");
      if (!m.everConnected && !m.warned) {
        m.elapsed += 1500;
        if (m.elapsed >= 9000) {
          m.warned = true;
          addStatus(
            "Can't reach any signaling server — check your network, VPN, or firewall (WebSocket trackers may be blocked).",
            true,
          );
        }
      }
    }, 1500);
  }, [addStatus]);

  useEffect(() => {
    return () => clearInterval(relayMonitorRef.current.timer);
  }, []);

  const selfIdRef = useRef(selfId);
  useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

  // Stable ref so room event handlers don't capture stale handleSignal
  const handleSignalRef = useRef(null);

  // --- sendSignal ----------------------------------------------------------
  // Priority: use callRoom handle if we're the caller, else myRoom handle. The
  // handle fans the message out across both transports; only the one where the
  // peer is actually connected delivers it.
  const sendSignal = useCallback((payload) => {
    const handle = callRoomHandleRef.current ?? myRoomHandleRef.current;
    const peerId = peerTrysteroIdRef.current;
    if (!handle || !peerId) return;
    handle.send({ ...payload, from: selfIdRef.current }, peerId);
  }, []);

  // --- handleSignal --------------------------------------------------------
  const handleSignal = useCallback(
    async (msg) => {
      if (msg.type === "call") {
        if (incomingProcessedRef.current.value) {
          addStatus("Duplicate incoming call signal received (ignored).");
          return;
        }
        if (pcRef.current?.connectionState === "connected") {
          addStatus("Incoming call ignored — already in a connected call.");
          return;
        }
        if (pcRef.current?.signalingState === "have-local-offer") {
          addStatus("Incoming call ignored — outgoing call already in progress.");
          return;
        }
        incomingProcessedRef.current.value = true;
        addStatus(`Signal received: incoming call offer from <strong style="font-family:monospace">${msg.from}</strong>.`);
        setIncomingCall({ from: msg.from, offer: msg.offer });
        soundManager.playIncomingLoop();
        if (callNotifications && window.electronAPI?.showNotification) {
          window.electronAPI.showNotification("Incoming call", `From: ${msg.from}`);
        }
        addStatus(
          `Incoming call from <strong style="font-family:monospace">${msg.from}</strong>.`,
        );
      }

      if (msg.type === "answer") {
        if (!pcRef.current) { addStatus("Answer received but no peer connection exists (ignored)."); return; }
        if (answerProcessedRef.current) { addStatus("Duplicate answer signal received (ignored)."); return; }
        if (pcRef.current.signalingState !== "have-local-offer") {
          addStatus(`Answer received in unexpected signaling state: ${pcRef.current.signalingState} (ignored).`);
          return;
        }
        answerProcessedRef.current = true;
        addStatus(`Answer received from <strong style="font-family:monospace">${msg.from}</strong>. Setting remote description...`);
        const modifiedAnswer = {
          ...msg.answer,
          sdp: setMaxBandwidthInSDP(msg.answer.sdp, streamQuality.resolution),
        };
        await pcRef.current.setRemoteDescription(modifiedAnswer);
        pcRef.current
          .getSenders()
          .forEach((s) => applyMaxQualityEncoding(s, streamQuality));
        const buffered = pendingIceRef.current.length;
        if (buffered > 0) addStatus(`Flushing ${buffered} buffered ICE candidate${buffered > 1 ? "s" : ""}...`);
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
        // Only meaningful if we have an active PC (offer was sent and peer
        // received it). A decline arriving when pcRef is null is a stale
        // duplicate from a previous call — ignore it to avoid tearing down
        // a new call that may be in the process of connecting.
        if (!pcRef.current) return;
        incomingProcessedRef.current.value = false;
        setIncomingCall(null);
        setCallStatus("idle");
        setStatusDotState("idle");
        addStatus(
          `<strong style="font-family:monospace">${msg.from}</strong> declined the call.`,
        );
        onHangupRequested(false);
      }

      if (msg.type === "cancel") {
        // Only meaningful if we have a pending incoming call notification.
        // A cancel with no pending call is stale — ignore it.
        if (!incomingProcessedRef.current.value) return;
        soundManager.stopIncomingLoop();
        incomingProcessedRef.current.value = false;
        setIncomingCall(null);
        setCallStatus("idle");
        setStatusDotState("idle");
        setGlowState("failed");
        setGlowTrigger((prev) => prev + 1);
        addStatus(
          `<strong style="font-family:monospace">${msg.from}</strong> cancelled the call.`,
        );
        // Tear down PC+tracks if we had already accepted before the cancel raced in.
        onHangupRequested(false);
      }

      if (msg.type === "hangup") {
        if (hangupProcessedRef.current) return;
        // Without an active PC there is nothing to tear down; a hangup here
        // is a duplicate/stale signal from the previous call — ignore it so
        // it can't disrupt a new call that is being set up.
        if (!pcRef.current) return;
        hangupProcessedRef.current = true;
        incomingProcessedRef.current.value = false;
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

  useEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  // --- initMyRoom ----------------------------------------------------------
  // Join the room named after our own ID (on every transport) so others can
  // reach us.
  const initMyRoom = useCallback(
    async (id) => {
      if (myRoomHandleRef.current) {
        try {
          myRoomHandleRef.current.leave();
        } catch (_) {}
        myRoomHandleRef.current = null;
      }

      setSignalingStatus("connecting");

      const handle = joinRoomMulti(id);
      myRoomHandleRef.current = handle;

      handle.setOnMessage((payload, { peerId }) => {
        console.log("[Trystero] Received via myRoom:", payload?.type);
        peerTrysteroIdRef.current = peerId;
        handleSignalRef.current?.(payload);
      });

      handle.setOnPeerJoin((peerId) => {
        console.log("[Trystero] Peer joined my room:", peerId);
        peerTrysteroIdRef.current = peerId;
      });

      handle.setOnPeerLeave((peerId) => {
        console.log("[Trystero] Peer left my room:", peerId);
        if (peerTrysteroIdRef.current === peerId && !callRoomHandleRef.current) {
          peerTrysteroIdRef.current = null;
        }
      });

      addStatus('Ready. Share your ID and click "Call".');
      startRelayMonitor();
    },
    [addStatus, startRelayMonitor],
  );

  // --- openCallChannel -----------------------------------------------------
  // Join the callee's room on every transport; resolves as soon as ANY
  // transport connects us to the callee.
  const openCallChannel = useCallback((calleeId) => {
    return new Promise((resolve, reject) => {
      if (callRoomHandleRef.current) {
        try {
          callRoomHandleRef.current.leave();
        } catch (_) {}
        callRoomHandleRef.current = null;
      }
      peerTrysteroIdRef.current = null;

      addStatus(`Joining peer's signaling room, waiting for peer to appear...`);

      const handle = joinRoomMulti(calleeId);
      callRoomHandleRef.current = handle;

      handle.setOnMessage((payload, { peerId }) => {
        console.log("[Trystero] Received via callRoom:", payload?.type);
        peerTrysteroIdRef.current = peerId;
        handleSignalRef.current?.(payload);
      });

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Peer not reachable (timeout after 30s) — peer may be offline or behind a restrictive firewall"));
      }, CALL_TIMEOUT_MS);

      // Fires on whichever transport reaches the callee first; later joins on the
      // other transport just re-affirm the same peer id.
      handle.setOnPeerJoin((peerId) => {
        console.log("[Trystero] Callee found:", peerId);
        peerTrysteroIdRef.current = peerId;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        addStatus(`Peer found via signaling (Trystero peer: ${peerId.slice(0, 8)}…). Sending offer...`);
        resolve();
      });
    });
  }, [addStatus]);

  // --- closeCallChannel ----------------------------------------------------
  const closeCallChannel = useCallback(() => {
    if (callRoomHandleRef.current) {
      try {
        callRoomHandleRef.current.leave();
      } catch (_) {}
      callRoomHandleRef.current = null;
    }
    peerTrysteroIdRef.current = null;
  }, []);

  // --- resetSignalingRefs --------------------------------------------------
  const resetSignalingRefs = useCallback(() => {
    answerProcessedRef.current = false;
    hangupProcessedRef.current = false;
    incomingProcessedRef.current.value = false;
  }, []);

  return {
    sendSignal,
    handleSignal,
    resetSignalingRefs,
    initMyRoom,
    openCallChannel,
    closeCallChannel,
    signalingStatus,
  };
}
