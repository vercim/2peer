export function streamHasVideo(stream) {
  try {
    return (
      stream &&
      stream.active &&
      stream.getVideoTracks &&
      stream.getVideoTracks().length > 0
    );
  } catch {
    return false;
  }
}

export function stopStreamTracks(stream) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export function formatBitrate(bps) {
  if (bps >= 8_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}
