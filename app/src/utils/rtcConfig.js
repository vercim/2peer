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
  return STUN_IPS.map((ip) => ({ urls: `stun:${ip}` }));
}

export function getFullRtcConfig() {
  return {
    ...rtcConfig,
    iceServers: [...rtcConfig.iceServers, ...getStunServers()],
  };
}

export const qualityOptions = {
  resolution: [
    { value: "360p",  label: "360p",     width: 640,  height: 360  },
    { value: "480p",  label: "480p",     width: 854,  height: 480  },
    { value: "720p",  label: "720p HD",  width: 1280, height: 720  },
    { value: "1080p", label: "1080p",    width: 1920, height: 1080 },
    { value: "1440p", label: "1440p",    width: 2560, height: 1440 },
    { value: "2160p", label: "4K",       width: 3840, height: 2160 },
  ],
  fps: [15, 24, 30, 60, 90, 120],
};

export const DEFAULT_BITRATES = {
  "360p":  1_000_000,
  "480p":  2_500_000,
  "720p":  6_000_000,
  "1080p": 12_000_000,
  "1440p": 24_000_000,
  "2160p": 50_000_000,
};

export function getResolutionByValue(value) {
  return (
    qualityOptions.resolution.find((r) => r.value === value) ||
    qualityOptions.resolution[3] // default: 1080p
  );
}
