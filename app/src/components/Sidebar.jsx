import { useState, useEffect } from "react";
import { TextMorph } from "torph/react";
import StatusLog from "./StatusLog";

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function AnimatedFormattedId({ id, fallback = "-—" }) {
  if (!id) return <span className="text-[#444]">{fallback}</span>;
  const parts = id.match(/.{1,3}/g) || [];
  return (
    <span>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-[#444]">.</span>}
          <TextMorph>{part}</TextMorph>
        </span>
      ))}
    </span>
  );
}

export function Sidebar({
  selfId,
  onCopyId,
  onRegenId,
  onCall,
  onHangup,
  onCancelCall,
  hasActiveCall = false,
  connectionStatus = "idle",
  isInCall = false,
  signalingStatus = "disconnected",
  statusMessages = [],
  version = "",
  remoteId = "",
  onRemoteIdChange = null,
  localStream = null,
  onBroadcast = null,
  onStopBroadcast = null,
  onChangeSource = null,
  onPiP = null,
  onFullscreen = null,
}) {
  const [copied, setCopied] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const isCalling = connectionStatus === "connecting";
  const regenDisabled = hasActiveCall || isCalling || isInCall;

  useEffect(() => {
    if (!hasActiveCall) {
      setCallSeconds(0);
      return;
    }
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveCall]);

  const handleCopyClick = (e) => {
    setCopied(true);
    onCopyId(e);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCall = () => {
    if (remoteId.trim()) {
      onCall(remoteId.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && remoteId.length === 12 && !isCalling) {
      handleCall();
    }
    if (e.key === "Escape" && isCalling) {
      onCancelCall();
    }
  };

  return (
    <aside className="flex flex-col gap-[8px] overflow-hidden min-h-0">
      <div className="bg-panel border border-border rounded-[8px] p-[12px_14px] flex flex-col gap-[8px] shrink-0">
        <span className="text-[10px] tracking-[0.09em] uppercase text-faint">
          Your ID
        </span>
        <div className="bg-panel-2 border border-border rounded-[5px] p-[8px_10px] font-mono text-[14px] tracking-[0.04em] text-text break-all">
          <AnimatedFormattedId id={selfId} />
        </div>
        <div className="flex gap-[6px]">
          <button
            className="flex-1 bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap"
            onClick={handleCopyClick}
          >
            <TextMorph>{copied ? "Copied" : "Copy"}</TextMorph>
          </button>
          <button
            className={`flex-1 bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold whitespace-nowrap transition-opacity duration-120 ${regenDisabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:opacity-[0.82] active:opacity-[0.65]"}`}
            onClick={regenDisabled ? undefined : onRegenId}
            disabled={regenDisabled}
            title={regenDisabled ? "Cannot change ID during a call" : undefined}
          >
            <TextMorph>Update</TextMorph>
          </button>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-[8px] p-[12px_14px] flex flex-col gap-[8px] shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.09em] uppercase text-faint">
            Call
          </span>
          {hasActiveCall && (
            <span className="font-mono text-[10px] text-[#555] tabular-nums">
              {formatDuration(callSeconds)}
            </span>
          )}
        </div>
        {!hasActiveCall && !isCalling && (
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-[5px] p-[9px_10px] text-[13px] font-mono pointer-events-none flex items-center transition-colors duration-140 z-[1] ${
                remoteId || isInputFocused
                  ? "bg-panel-3 border border-[rgba(255,255,255,0.12)] text-[#888]"
                  : "bg-panel-2 border border-border text-[#444]"
              }`}
            >
              {remoteId ? "" : "Peer ID"}
            </div>
            <input
              className={`w-full bg-transparent border border-transparent rounded-[5px] p-[9px_10px] outline-none text-[13px] font-mono text-text placeholder:text-transparent transition-colors duration-140 z-[2] relative ${
                remoteId || isInputFocused ? "bg-panel-3" : ""
              }`}
              value={remoteId}
              onChange={(e) => {
                const val = e.target.value.replace(/\./g, "").toUpperCase();
                onRemoteIdChange ? onRemoteIdChange(val) : null;
              }}
              onKeyDown={handleKeyDown}
              maxLength={12}
              placeholder=""
              autoComplete="off"
              spellCheck={false}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
            />
          </div>
        )}
        {!isCalling && (
          <div className="flex gap-[6px]">
            {hasActiveCall ? (
              <button
                className="flex-1 bg-danger text-[#e8b4b4] border-[rgba(255,255,255,0.05)] rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h hover:opacity-100 active:opacity-[0.65] whitespace-nowrap"
                onClick={onHangup}
              >
                <TextMorph ease={{ stiffness: 200, damping: 20 }}>
                  Hang up
                </TextMorph>
              </button>
            ) : (
              <button
                className={`flex-1 rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-all duration-120 whitespace-nowrap ${
                  remoteId.length === 12
                    ? "bg-accent text-[#0a0a0a] border-none hover:opacity-[0.82] active:opacity-[0.65]"
                    : "bg-[#2a2a2a] text-[#555] border-none cursor-not-allowed"
                }`}
                onClick={handleCall}
                disabled={remoteId.length !== 12}
              >
                <TextMorph ease={{ stiffness: 200, damping: 20 }}>
                  Call
                </TextMorph>
              </button>
            )}
          </div>
        )}
        {hasActiveCall && (
          <div className="flex gap-[6px]">
            <button
              className={`flex-1 bg-[rgba(255,255,255,0.06)] border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-all duration-120 flex items-center justify-center gap-[5px] ${
                localStream
                  ? "text-green-400 hover:text-text hover:bg-[rgba(255,255,255,0.09)]"
                  : "text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)]"
              }`}
              onClick={localStream ? onStopBroadcast : onBroadcast}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              {localStream ? "Stop" : "Share"}
            </button>
            {localStream && (
              <button
                className="bg-[rgba(255,255,255,0.06)] border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] text-[#555] hover:text-text hover:bg-[rgba(255,255,255,0.09)] cursor-pointer transition-all duration-120 flex items-center justify-center"
                onClick={onChangeSource}
                title="Change source"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-[8px] overflow-hidden">
        <span className="text-[10px] tracking-[0.09em] uppercase text-faint">
          Status
        </span>
        <StatusLog messages={statusMessages} />
      </div>

      <div className="mt-auto flex flex-col gap-[8px]">
        <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
          <div className="text-[11px] text-[#555] font-mono overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-[6px]">
            {signalingStatus === "connected" ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[#555]"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            )}
            <TextMorph>
              {signalingStatus === "connected"
                ? "P2P Ready"
                : signalingStatus === "error"
                  ? "P2P Error"
                  : signalingStatus === "connecting"
                    ? "Connecting…"
                    : "P2P Offline"}
            </TextMorph>
          </div>
        </div>

        <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-[6px] text-[11px] text-[#555] font-mono hover:text-accent transition-colors duration-120 cursor-pointer">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
            <div className="flex items-center gap-[12px]">
              <button
                className={`transition-colors duration-120 ${
                  hasActiveCall
                    ? "text-[#555] hover:text-accent cursor-pointer"
                    : "text-[#333] cursor-not-allowed"
                }`}
                onClick={hasActiveCall ? onPiP : undefined}
                disabled={!hasActiveCall}
                title="Picture in Picture"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="11 5 5 5 5 11" />
                  <line x1="5" y1="5" x2="19" y2="19" />
                </svg>
              </button>
              <button
                className={`transition-colors duration-120 ${
                  hasActiveCall
                    ? "text-[#555] hover:text-accent cursor-pointer"
                    : "text-[#333] cursor-not-allowed"
                }`}
                onClick={hasActiveCall ? onFullscreen : undefined}
                disabled={!hasActiveCall}
                title="Fullscreen"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="5 9 2 12 5 15" />
                  <polyline points="9 5 12 2 15 5" />
                  <polyline points="15 19 12 22 9 19" />
                  <polyline points="19 9 22 12 19 15" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
