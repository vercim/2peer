// ICE servers. Only verified, hostname-based STUN servers are listed — dead
// hosts (stunprotocol.org, antisip) and stale hardcoded IPs were removed because
// they only added "STUN host lookup" errors and "binding request timed out"
// delays to ICE gathering. Google and Cloudflare resolve reliably via DNS.
// NOTE: there are intentionally no TURN servers — see CLAUDE.md. Peers behind
// symmetric NAT may still fail; supply TURN credentials here if needed.
export const ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ],
  },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export const rtcConfig = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

export function getFullRtcConfig() {
  return { ...rtcConfig };
}

export const qualityOptions = {
  resolution: [
    { value: "360p",  label: "360p",     width: 640,  height: 360  },
    { value: "480p",  label: "480p",     width: 854,  height: 480  },
    { value: "720p",  label: "720p",  width: 1280, height: 720  },
    { value: "1080p", label: "FHD 1080p",    width: 1920, height: 1080 },
    { value: "1440p", label: "QHD 2K",    width: 2560, height: 1440 },
    { value: "2160p", label: "UHD 4K",       width: 3840, height: 2160 },
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
