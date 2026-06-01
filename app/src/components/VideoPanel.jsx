import { forwardRef } from "react";
import { formatBitrate } from "../utils/streamUtils.js";

export const VideoPanel = forwardRef(function VideoPanel(
  {
    title,
    meta,
    bitrate = 0,
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
    isMuted = false,
    onToggleMute,
    isDisabled = false,
    remoteMicVolume = 1,
    onRemoteMicVolumeChange,
  },
  ref,
) {
  const handleFullscreen = (e) => {
    e.stopPropagation();
    if (onFullscreen) onFullscreen();
  };

  return (
    <div
      className={`flex-1 min-h-0 bg-panel border border-border rounded-[8px] flex flex-col overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between p-[8px_12px] border-b border-border shrink-0">
        <div className="flex items-center gap-[8px]">
          <span className="text-[11px] text-muted">{title}</span>
        </div>
        <div className="flex items-center gap-[5px]">
          <span className="text-[10px] text-[#2e2e2e] font-mono">{meta}</span>
          {bitrate > 0 && (
            <span className="text-[10px] text-[#888] font-mono">
              {formatBitrate(bitrate)}
            </span>
          )}
          {isLocal && canBroadcast && (
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
                  className="bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[11px] flex items-center gap-[4px] transition-colors duration-120 text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)] cursor-pointer"
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
          {!isLocal && (
            <>
              <button
                className={`bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[11px] flex items-center gap-[4px] transition-colors duration-120 ${isDisabled ? "opacity-40" : "text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)] cursor-pointer"}`}
                onClick={isDisabled ? undefined : onToggleMute}
                disabled={isDisabled}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {isMuted ? (
                    <>
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  ) : (
                    <>
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </>
                  )}
                </svg>
                {isMuted ? "Unmute" : "Mute"}
              </button>
              {!isDisabled && (
                <div className="flex items-center gap-[4px]">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-[#555]"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={remoteMicVolume}
                    onChange={(e) =>
                      onRemoteMicVolumeChange?.(parseFloat(e.target.value))
                    }
                    className="w-[60px] h-[4px] bg-[#333] rounded-sm appearance-none cursor-pointer"
                  />
                </div>
              )}
              <button
                className={`bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[11px] flex items-center gap-[4px] transition-colors duration-120 ${isDisabled ? "opacity-40" : "text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)] cursor-pointer"}`}
                onClick={isDisabled ? undefined : onPiP}
                disabled={isDisabled}
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
                className={`bg-[rgba(255,255,255,0.05)] border border-border rounded-[5px] p-[4px_8px] text-[11px] flex items-center gap-[4px] transition-colors duration-120 ${isDisabled ? "opacity-40" : "text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)] cursor-pointer"}`}
                onClick={isDisabled ? undefined : handleFullscreen}
                disabled={isDisabled}
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
                Full
              </button>
            </>
          )}
        </div>
      </div>
      <div
        id="remoteVideoWrap"
        ref={containerRef}
        className={`flex-1 min-h-0 relative ${showPlaceholder ? "bg-transparent" : "bg-[#050505]"}`}
      >
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[#555]"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
        )}
        <video
          ref={(el) => {
            if (ref) ref.current = el;
            if (videoRef) videoRef.current = el;
          }}
          id={isLocal ? undefined : "remoteVideo"}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${showPlaceholder ? "opacity-0" : "opacity-100"}`}
          autoPlay
          playsInline
          muted={isLocal || isMuted}
        />
      </div>
    </div>
  );
});

export default VideoPanel;
