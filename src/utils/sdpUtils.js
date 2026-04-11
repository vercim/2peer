const BITRATE_MAP = {
  "480p": 2500,
  "720p": 4000,
  "1080p": 6000,
  "1440p": 8000,
  "2160p": 15000,
};

export function setMaxBandwidthInSDP(sdp, resolution = "1080p") {
  const kbps = BITRATE_MAP[resolution] ?? 4000;

  let result = sdp.replace(/b=AS:\d+\r\n/g, "").replace(/b=TIAS:\d+\r\n/g, "");

  result = result.replace(
    /(m=video[^\r\n]*\r\n)/,
    `$1b=AS:${kbps}\r\nb=TIAS:${kbps * 1000}\r\n`,
  );

  if (!result.includes("transport-cc")) {
    result = result.replace(/(a=mid:video\r\n)/, `$1a=transport-cc:1\r\n`);
  }

  return result;
}
