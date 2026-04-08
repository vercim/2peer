import { forwardRef } from "react";

export const VideoPanel = forwardRef(function VideoPanel(
  {
    title,
    meta,
    bitrate = 0,
    showControls = true,
    isLocal = false,
    onBroadcast,
    onChangeSource,
    onPiP,
    onFullscreen,
    isBroadcasting = false,
    canBroadcast = false,
    showPlaceholder = false,
    className = "",
    videoRef,
    containerRef,
  },
  ref,
) {
  const formatBitrate = (bps) => {
    if (bps >= 8_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
    return `${bps} bps`;
  };
  return (
    <div
      className={`flex-1 min-h-0 bg-panel border border-border rounded-[8px] flex flex-col overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between p-[8px_12px] border-b border-border shrink-0">
        <span className="text-[11px] text-muted">{title}</span>
        <div className="flex items-center gap-[5px]">
          <span className="text-[10px] text-[#2e2e2e] font-mono">{meta}</span>
          {bitrate > 0 && (
            <span className="text-[10px] text-[#888] font-mono">
              {formatBitrate(bitrate)}
            </span>
          )}
          {showControls && isLocal && (
            <>
              <button
                className={`bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[11px] flex items-center gap-[4px] transition-colors duration-120 whitespace-nowrap ${!canBroadcast ? "opacity-40 cursor-not-allowed" : isBroadcasting ? "text-green-400 hover:text-text cursor-pointer" : "text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)] cursor-pointer"}`}
                onClick={onBroadcast}
                disabled={!canBroadcast}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                {isBroadcasting ? "Stop" : "Broadcast"}
              </button>
              {isBroadcasting && (
                <button
                  className="bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[#555] text-[11px] cursor-pointer flex items-center gap-[4px] transition-colors duration-120 hover:text-text hover:bg-[rgba(255,255,255,0.09)] hover:opacity-100 whitespace-nowrap"
                  onClick={onChangeSource}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Change
                </button>
              )}
            </>
          )}
          {showControls && !isLocal && (
            <>
              <button
                className="bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[#555] text-[11px] cursor-pointer flex items-center gap-[4px] transition-colors duration-120 hover:text-text hover:bg-[rgba(255,255,255,0.09)] hover:opacity-100 whitespace-nowrap"
                onClick={onPiP}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <rect
                    x="12"
                    y="10"
                    width="8"
                    height="5"
                    rx="1"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
                PiP
              </button>
              <button
                className="bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[#555] text-[11px] cursor-pointer flex items-center gap-[4px] transition-colors duration-120 hover:text-text hover:bg-[rgba(255,255,255,0.09)] hover:opacity-100 whitespace-nowrap"
                onClick={onFullscreen}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
                Fullscreen
              </button>
            </>
          )}
        </div>
      </div>
      <div
        id="remoteVideoWrap"
        ref={containerRef}
        className={`flex-1 min-h-0 relative bg-[#050505] ${showPlaceholder ? "placeholder" : ""}`}
      >
        <video
          ref={ref}
          className="absolute inset-0 w-full h-full object-contain"
          autoPlay
          playsInline
          muted={isLocal}
        />
      </div>
    </div>
  );
});

export default VideoPanel;
