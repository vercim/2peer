import { DEFAULT_BITRATES, qualityOptions } from "./rtcConfig.js";

const BITRATE_MAP = {
  ...DEFAULT_BITRATES,
};

function getResolutionDimensions(resolution) {
  const found = qualityOptions.resolution.find((r) => r.value === resolution);
  return found || { width: 1920, height: 1080 };
}

export function setMaxBandwidthInSDP(sdp, resolution = "1080p") {
  const bitrate = BITRATE_MAP[resolution] ?? 6_000_000;
  const kbps = bitrate / 1000;
  const { width, height } = getResolutionDimensions(resolution);

  let result = sdp.replace(/b=AS:\d+\r\n/g, "").replace(/b=TIAS:\d+\r\n/g, "");

  result = result.replace(
    /(m=video[^\r\n]*\r\n)/,
    `$1b=AS:${kbps}\r\nb=TIAS:${bitrate}\r\n`,
  );

  result = result.replace(
    /a=mid:video\r\n/,
    `a=mid:video\r\na=imageattr:96 [x=${width},y=${height}] send\r\n`,
  );

  if (!result.includes("transport-cc")) {
    result = result.replace(/(a=mid:video\r\n)/, `$1a=transport-cc:1\r\n`);
  }

  return result;
}
