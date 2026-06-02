import { useState, useEffect } from "react";
import { Airplay, Pipette, GlobeLock, GlobeOff, Settings, SquareArrowOutUpRight, Expand } from "lucide-react";
import { TextMorph } from "torph/react";
import { useSettings } from "../contexts/SettingsContext.js";
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
  onOpenSettings = null,
}) {
  const { reduceMotion } = useSettings();
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
            className="flex-1 bg-[var(--color-surface)] text-text border border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap"
            onClick={handleCopyClick}
          >
            {reduceMotion ? (copied ? "Copied" : "Copy") : <TextMorph>{copied ? "Copied" : "Copy"}</TextMorph>}
          </button>
          <button
            className={`flex-1 bg-[var(--color-surface)] text-text border border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold whitespace-nowrap transition-opacity duration-120 ${regenDisabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:opacity-[0.82] active:opacity-[0.65]"}`}
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
                className="flex-1 bg-danger text-[#e8b4b4] border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h hover:opacity-100 active:opacity-[0.65] whitespace-nowrap"
                onClick={onHangup}
              >
                {reduceMotion ? "Hang up" : <TextMorph ease={{ stiffness: 200, damping: 20 }}>Hang up</TextMorph>}
              </button>
            ) : (
              <button
                className={`flex-1 rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-all duration-120 whitespace-nowrap ${
                  remoteId.length === 12
                    ? "bg-accent text-[#0a0a0a] border-none hover:opacity-[0.82] active:opacity-[0.65]"
                    : "bg-[var(--color-surface-md)] text-muted border-none cursor-not-allowed"
                }`}
                onClick={handleCall}
                disabled={remoteId.length !== 12}
              >
                {reduceMotion ? "Call" : <TextMorph ease={{ stiffness: 200, damping: 20 }}>Call</TextMorph>}
              </button>
            )}
          </div>
        )}
        {hasActiveCall && (
          <div className="flex gap-[6px]">
            <button
              className={`flex-1 bg-[var(--color-surface)] border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-all duration-120 flex items-center justify-center gap-[5px] ${
                localStream
                  ? "text-green-400 hover:text-text hover:bg-[var(--color-surface-hi)]"
                  : "text-[#555] hover:text-text hover:bg-[var(--color-surface-hi)]"
              }`}
              onClick={localStream ? onStopBroadcast : onBroadcast}
            >
              <Airplay size={12} />
              {localStream ? "Stop" : "Share"}
            </button>
            {localStream && (
              <button
                className="bg-[var(--color-surface)] border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] text-[#555] hover:text-text hover:bg-[var(--color-surface-hi)] cursor-pointer transition-all duration-120 flex items-center justify-center"
                onClick={onChangeSource}
                title="Change source"
              >
                <Pipette size={12} />
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
        <div
          className="rounded-[8px] p-[10px_14px] border transition-colors duration-300"
          style={
            signalingStatus === "error"
              ? {
                  background: "rgba(160,40,40,0.10)",
                  borderColor: "rgba(180,60,60,0.28)",
                }
              : {
                  background: "var(--color-panel)",
                  borderColor: "var(--color-border)",
                }
          }
        >
          <div
            className="text-[11px] font-mono overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-[6px] transition-colors duration-300"
            style={{
              color:
                signalingStatus === "error"
                  ? "rgba(210,90,90,0.9)"
                  : "rgba(100,100,100,1)",
            }}
          >
            {signalingStatus === "connected" ? (
              <GlobeLock size={14} />
            ) : (
              <GlobeOff size={14} />
            )}
            {reduceMotion ? (
              signalingStatus === "connected" ? "P2P Ready"
              : signalingStatus === "error" ? "P2P Error"
              : signalingStatus === "connecting" ? "Connecting…"
              : "P2P Offline"
            ) : (
              <TextMorph>
                {signalingStatus === "connected"
                  ? "P2P Ready"
                  : signalingStatus === "error"
                    ? "P2P Error"
                    : signalingStatus === "connecting"
                      ? "Connecting…"
                      : "P2P Offline"}
              </TextMorph>
            )}
          </div>
        </div>

        <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-[6px] text-[11px] text-[#555] font-mono hover:text-accent transition-colors duration-120 cursor-pointer"
              onClick={onOpenSettings}
            >
              <Settings size={13} />
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
                <SquareArrowOutUpRight size={15} />
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
                <Expand size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
