import { TextMorph } from "torph/react";

export function TitleBar({
  statusDotColor = "#444",
  connectionStatus = "idle",
  hasActiveCall = false,
}) {
  const handleMinimize = () => {
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    }
  };

  const getStatusText = () => {
    if (hasActiveCall) {
      return "2peer - in call";
    }
    switch (connectionStatus) {
      case "connected":
        return "2peer";
      case "connecting":
        return "2peer - connecting";
      default:
        return "2peer";
    }
  };

  return (
    <div
      className="h-[38px] flex items-center justify-between pl-[14px] bg-panel border-b border-border shrink-0"
      style={{ WebkitAppRegion: "drag" }}
    >
      <div className="flex items-center gap-[10px] text-[13px] font-semibold text-muted">
        <div
          className="w-[8px] h-[8px] rounded-full"
          style={{ backgroundColor: statusDotColor }}
          id="statusDot"
        />
        <TextMorph ease={{ stiffness: 200, damping: 20 }}>
          {getStatusText()}
        </TextMorph>
      </div>
      <div className="flex" style={{ WebkitAppRegion: "no-drag" }}>
        <button
          className="w-[36px] h-[38px] flex items-center justify-center bg-none border-none text-muted cursor-pointer text-[13px] transition-colors duration-120 hover:bg-[rgba(255,255,255,0.07)] hover:text-text rounded-[0]"
          onClick={handleMinimize}
          title="Minimize"
        >
          <svg width="11" height="2" viewBox="0 0 11 2" fill="currentColor">
            <rect width="11" height="1.5" rx="0.75" />
          </svg>
        </button>
        <button
          className="w-[44px] h-[38px] flex items-center justify-center bg-none border-none text-muted cursor-pointer text-[13px] transition-colors duration-120 hover:bg-[rgba(255,62,62,0.07)] hover:text-text rounded-[0]"
          onClick={handleClose}
          title="Close"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <line x1="1" y1="1" x2="10" y2="10" />
            <line x1="10" y1="1" x2="1" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
