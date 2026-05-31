export function streamHasVideo(stream) {
  try {
    if (!stream || !stream.active || !stream.getVideoTracks) return false;
    const videoTracks = stream.getVideoTracks();
    return (
      videoTracks.length > 0 && videoTracks.some((t) => t.readyState === "live")
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
