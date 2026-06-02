import { qualityOptions, DEFAULT_BITRATES } from "./rtcConfig.js";

const DEFAULT_START_BITRATE = DEFAULT_BITRATES["1080p"];
let currentBitrate = {
  value: DEFAULT_START_BITRATE,
  target: DEFAULT_START_BITRATE,
};
let userManualBitrate = false;
const BITRATE_HISTORY = [];
const RTT_HISTORY = [];

// Session traffic accumulators (reset on each call)
let cumulativeReceived = 0;
let cumulativeSent = 0;
let lastPollReceived = 0;
let lastPollSent = 0;

export function getTrafficStats() {
  return { receivedBytes: cumulativeReceived, sentBytes: cumulativeSent };
}

export function resetTrafficStats() {
  cumulativeReceived = 0;
  cumulativeSent = 0;
  lastPollReceived = 0;
  lastPollSent = 0;
}

export function resetBitrateState() {
  currentBitrate.value = DEFAULT_START_BITRATE;
  currentBitrate.target = DEFAULT_START_BITRATE;
  userManualBitrate = false;
  BITRATE_HISTORY.length = 0;
  RTT_HISTORY.length = 0;
}

export function applyMaxQualityEncoding(
  sender,
  quality = {},
  forcedBitrate = null,
) {
  if (!sender || sender.track?.kind !== "video") return;
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];

  const res =
    qualityOptions.resolution.find(
      (r) => r.value === (quality.resolution || "1080p"),
    ) || qualityOptions.resolution[3];
  const fps = quality.fps || 60;

  let autoBitrate = forcedBitrate || currentBitrate.value;

  params.encodings.forEach((enc) => {
    enc.maxBitrate = autoBitrate;
    enc.maxFramerate = fps;
    enc.priority = "high";
    enc.networkPriority = "high";
    enc.scaleResolutionDownBy = 1;
  });

  if (sender.track) {
    sender.track.contentHint = "motion";
    if (typeof sender.track.applyConstraints === "function") {
      sender.track
        .applyConstraints({ latencyHint: "interactive" })
        .catch(() => {});
    }
  }

  sender.setParameters(params).catch(console.error);
}

export function adaptBitrate(rtt, packetsLost, avgBitrate, defaultBitrate) {
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
    newTarget = Math.floor(defaultBitrate * 0.5);
  } else if (avgRtt > 200) {
    newTarget = Math.floor(defaultBitrate * 0.7);
  } else if (packetsLost > 0) {
    newTarget = Math.floor(defaultBitrate * 0.8);
  } else if (avgRtt < 100 && packetsLost === 0) {
    newTarget = defaultBitrate;
  }

  currentBitrate.target = newTarget;
  currentBitrate.value =
    currentBitrate.value + (newTarget - currentBitrate.value) * 0.3;
}

export function monitorBitrate(
  pcRef,
  setRemoteBitrate,
  setRemoteMeta,
  streamQuality,
  applyEncoding,
) {
  if (!pcRef.current || pcRef.current.connectionState !== "connected") {
    setRemoteBitrate(0);
    setRemoteMeta("");
    return () => {};
  }

  pcRef.current.getStats().then((report) => {
    let bytesReceived = 0;
    let bytesSent = 0;
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
      if (item.type === "outbound-rtp" && item.kind === "video") {
        bytesSent += item.bytesSent || 0;
      }
      if (item.type === "candidate-pair" && item.state === "succeeded") {
        rtt = item.currentRoundTripTime ? item.currentRoundTripTime * 1000 : 0;
      }
    });

    // Accumulate session traffic totals
    if (lastPollReceived > 0 && bytesReceived >= lastPollReceived) {
      cumulativeReceived += bytesReceived - lastPollReceived;
    }
    lastPollReceived = bytesReceived;

    if (lastPollSent > 0 && bytesSent >= lastPollSent) {
      cumulativeSent += bytesSent - lastPollSent;
    }
    lastPollSent = bytesSent;

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

    const resolution = streamQuality?.resolution || "1080p";
    const fps = streamQuality?.fps || 60;
    const targetBitrate = getDefaultBitrateForResolution(resolution, fps);
    adaptBitrate(rtt, packetsLost, avgBitrate, targetBitrate);

    if (pcRef.current && pcRef.current.connectionState === "connected") {
      pcRef.current.getSenders().forEach((s) => {
        if (s.track?.kind === "video") {
          applyEncoding(s, streamQuality);
        }
      });
    }
  });
}

export function getDefaultBitrateForResolution(resolution, fps = 60) {
  const baseBitrate = DEFAULT_BITRATES[resolution] || DEFAULT_BITRATES["1080p"];
  if (fps <= 30) {
    return Math.floor(baseBitrate * 0.7);
  }
  return baseBitrate;
}
