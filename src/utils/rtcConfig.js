export const rtcConfig = {
  iceServers: [
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: "stun:openrelay.metered.ca:443" },
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.antisip.com:3478" },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
  sdpSemantics: "unified-plan",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

const STUN_IPS = [
  "74.125.143.127:19302",
  "142.250.80.127:19302",
  "172.217.12.227:19302",
  "142.250.136.127:19302",
  "216.58.214.174:19302",
  "108.177.15.127:19302",
  "142.250.185.127:19302",
  "172.217.1.227:19302",
];

export function getStunServers() {
  return STUN_IPS.map((ip) => ({
    urls: `stun:${ip}`,
  }));
}

export function getFullRtcConfig() {
  return {
    ...rtcConfig,
    iceServers: [...rtcConfig.iceServers, ...getStunServers()],
  };
}

export const qualityOptions = {
  resolution: [
    { value: "720p", label: "720p HD", width: 1280, height: 720 },
    { value: "1080p", label: "1080p FHD", width: 1920, height: 1080 },
    { value: "1440p", label: "1440p QHD", width: 2560, height: 1440 },
  ],
  fps: [30, 60],
};

export const DEFAULT_BITRATES = {
  "720p": 6_000_000,
  "1080p": 12_000_000,
  "1440p": 24_000_000,
};

export function getResolutionByValue(value) {
  return (
    qualityOptions.resolution.find((r) => r.value === value) ||
    qualityOptions.resolution[2]
  );
}
