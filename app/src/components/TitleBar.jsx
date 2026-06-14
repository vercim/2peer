import { TextMorph } from "torph/react";
import { useSettings } from "../contexts/SettingsContext.js";

const noDrag = { WebkitAppRegion: "no-drag" };

function VersionLabel({ version }) {
  if (!version) return null;
  return (
    <span className="t-micro font-mono text-muted bg-[rgba(255,255,255,0.06)] px-[6px] py-[2px] rounded-[5px] leading-none">
      v{version}
    </span>
  );
}

function UpdateBadge({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={noDrag}
      title="A new version is available"
      className="t-micro font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] px-[7px] py-[2px] rounded-[5px] leading-none cursor-pointer border-none transition-colors duration-120"
    >
      Update
    </button>
  );
}

export function TitleBar({
  connectionStatus = "idle",
  hasActiveCall = false,
  version = "",
  updateAvailable = false,
  updateUrl = "",
}) {
  const { reduceMotion } = useSettings();
  const isMac = window.electronAPI?.platform === "darwin";

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow?.();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow?.();
  };

  const handleUpdate = () => {
    window.electronAPI?.openExternal?.(updateUrl);
  };

  const getStatusText = () => {
    if (hasActiveCall) return "2peer - in call";
    switch (connectionStatus) {
      case "connecting":
        return "2peer - connecting";
      default:
        return "2peer";
    }
  };

  const appName = reduceMotion ? (
    <span>{getStatusText()}</span>
  ) : (
    <TextMorph ease={{ stiffness: 200, damping: 20 }}>
      {getStatusText()}
    </TextMorph>
  );

  if (isMac) {
    // Native traffic lights are on the left (~68px) — keep that area clear.
    // App name and version sit on the right.
    return (
      <div
        className="h-[38px] flex items-center justify-between bg-panel border-b border-border shrink-0"
        style={{ WebkitAppRegion: "drag" }}
      >
        {/* Spacer for traffic-light zone */}
        <div className="w-[80px] shrink-0">
          {updateAvailable && (
            <div className="flex items-center h-full pl-[80px]">
              <UpdateBadge onClick={handleUpdate} />
            </div>
          )}
        </div>
        {/* Right side — app name then version */}
        <div className="flex items-center gap-[10px] pr-[14px] t-body font-semibold text-muted">
          {appName}
          <VersionLabel version={version} />
        </div>
      </div>
    );
  }

  // Windows: custom minimize + close on the right
  return (
    <div
      className="h-[38px] flex items-center justify-between bg-panel border-b border-border shrink-0"
      style={{ WebkitAppRegion: "drag" }}
    >
      {/* Left side — app name then version */}
      <div className="flex items-center gap-[10px] pl-[14px] t-body font-semibold text-muted">
        {appName}
        <VersionLabel version={version} />
      </div>
      {/* Right side — optional update badge then window controls */}
      <div className="flex items-center gap-[10px]">
        {updateAvailable && (
          <span className="flex items-center">
            <UpdateBadge onClick={handleUpdate} />
          </span>
        )}
        <div className="flex" style={noDrag}>
          <button
            className="w-[36px] h-[38px] flex items-center justify-center bg-none border-none text-muted cursor-pointer t-body transition-colors duration-120 hover:bg-[rgba(255,255,255,0.07)] hover:text-text rounded-[0]"
            onClick={handleMinimize}
            title="Minimize"
          >
            <svg width="11" height="2" viewBox="0 0 11 2" fill="currentColor">
              <rect width="11" height="1.5" rx="0.75" />
            </svg>
          </button>
          <button
            className="w-[44px] h-[38px] flex items-center justify-center bg-none border-none text-muted cursor-pointer t-body transition-colors duration-120 hover:bg-[rgba(255,62,62,0.07)] hover:text-text rounded-[0]"
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
    </div>
  );
}

export default TitleBar;
