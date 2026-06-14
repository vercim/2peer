import { forwardRef } from "react";
import { MonitorX, TriangleAlert } from "lucide-react";
import { formatBitrate } from "../utils/streamUtils.js";

export const VideoPanel = forwardRef(function VideoPanel(
  {
    title,
    meta,
    bitrate = 0,
    warning = false,
    showPlaceholder = false,
    className = "",
    videoRef,
    containerRef,
    isDisabled = false,
    overlay = null,
  },
  ref,
) {
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
        </div>
      </div>
      <div
        id="remoteVideoWrap"
        ref={containerRef}
        className={`flex-1 min-h-0 relative ${showPlaceholder ? "bg-transparent" : "bg-video"}`}
      >
        {overlay && (
          <div className="absolute inset-0 z-10">{overlay}</div>
        )}
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center justify-center">
            <MonitorX size={48} className="text-[#555]" strokeWidth={1.5} />
          </div>
        )}
        {warning && (
          <div className="absolute bottom-[10px] right-[10px] z-20 flex items-center gap-[6px] rounded-[6px] bg-black/70 border border-amber-500/40 px-[10px] py-[6px] backdrop-blur-sm pointer-events-none">
            <TriangleAlert size={13} className="text-amber-400 shrink-0" strokeWidth={2} />
            <span className="text-[10px] leading-tight text-amber-200 max-w-[220px]">
              Network is struggling — lower the resolution or FPS for a stable stream.
            </span>
          </div>
        )}
        <video
          ref={(el) => {
            if (ref) ref.current = el;
            if (videoRef) videoRef.current = el;
          }}
          id="remoteVideo"
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${showPlaceholder ? "opacity-0" : "opacity-100"}`}
          autoPlay
          playsInline
          muted
        />
      </div>
    </div>
  );
});

export default VideoPanel;
