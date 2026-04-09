import { useState, useEffect, useRef, useCallback } from "react";

export function FullscreenPlayer({ videoRef, meta, bitrate, onClose }) {
  const [showControls, setShowControls] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  const formatBitrate = (bps) => {
    if (bps >= 8_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
    return `${bps} bps`;
  };

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    showControlsTemporarily();

    const container = containerRef.current;
    if (container?.requestFullscreen) {
      container.requestFullscreen().catch((err) => {
        console.warn("Fullscreen failed:", err);
      });
    }

    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };

    const handleMouseMove = () => showControlsTemporarily();
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
      if (e.key === " ") {
        e.preventDefault();
        if (videoRef?.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPaused(false);
          } else {
            videoRef.current.pause();
            setIsPaused(true);
          }
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [showControlsTemporarily, handleClose, onClose, videoRef]);

  const handleVideoClick = () => {
    if (videoRef?.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPaused(false);
      } else {
        videoRef.current.pause();
        setIsPaused(true);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      onClick={handleVideoClick}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
      />

      <div
        className={`absolute top-0 left-0 right-0 p-4 flex items-center justify-between transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2">
          <span className="text-[13px] text-[#ccc] font-mono">{meta}</span>
          {bitrate > 0 && (
            <span className="text-[12px] text-[#888] font-mono">
              {formatBitrate(bitrate)}
            </span>
          )}
        </div>
        <button
          className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-[#ccc] text-[13px] flex items-center gap-2 hover:bg-black/80 transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          Exit
        </button>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 p-4 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg px-4 py-3 w-fit mx-auto">
          <button
            className="text-[#ccc] hover:text-white transition-colors cursor-pointer p-2"
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef?.current) {
                if (videoRef.current.paused) {
                  videoRef.current.play();
                  setIsPaused(false);
                } else {
                  videoRef.current.pause();
                  setIsPaused(true);
                }
              }
            }}
          >
            {isPaused ? (
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FullscreenPlayer;
