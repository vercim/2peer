import { useState, useEffect } from "react";
import { Airplay, Pipette, GlobeLock, GlobeOff, Settings, SquareArrowOutUpRight, Expand, History } from "lucide-react";
import { TextMorph } from "torph/react";
import { useSettings } from "../contexts/SettingsContext.js";
import { ICON } from "../utils/icons.js";
import StatusLog from "./StatusLog";

function IconBtn({ onClick, disabled, children }) {
  return (
    <button
      className={`flex items-center justify-center transition-colors duration-120 ${
        disabled
          ? "text-dim cursor-not-allowed"
          : "text-faint hover:text-accent cursor-pointer"
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function AnimatedFormattedId({ id, fallback = "-—" }) {
  if (!id) return <span className="text-faint-2">{fallback}</span>;
  const parts = id.match(/.{1,3}/g) || [];
  return (
    <span>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-faint-2">.</span>}
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
  onOpenHistory = null,
  callHistory = [],
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
    <aside className="flex flex-col gap-[8px] overflow-hidden min-h-0 h-full w-full">
      <div className="bg-panel border border-border rounded-[8px] p-[12px_14px] flex flex-col gap-[8px] shrink-0">
        <span className="t-micro tracking-[0.09em] uppercase text-faint">
          Your ID
        </span>
        <div className="bg-panel-2 border border-border rounded-[5px] p-[8px_10px] font-mono t-id tracking-[0.04em] text-text break-all">
          <AnimatedFormattedId id={selfId} />
        </div>
        <div className="flex gap-[6px]">
          <button
            className="flex-1 bg-[var(--color-surface)] text-text border border-border rounded-[5px] py-[9px] px-[12px] t-body font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap"
            onClick={handleCopyClick}
          >
            {reduceMotion ? (copied ? "Copied" : "Copy") : <TextMorph>{copied ? "Copied" : "Copy"}</TextMorph>}
          </button>
          <button
            className={`flex-1 bg-[var(--color-surface)] text-text border border-border rounded-[5px] py-[9px] px-[12px] t-body font-semibold whitespace-nowrap transition-opacity duration-120 ${regenDisabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:opacity-[0.82] active:opacity-[0.65]"}`}
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
          <span className="t-micro tracking-[0.09em] uppercase text-faint">
            Call
          </span>
          {hasActiveCall && (
            <span className="font-mono t-micro text-faint tabular-nums">
              {formatDuration(callSeconds)}
            </span>
          )}
        </div>
        {!hasActiveCall && !isCalling && (
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-[5px] p-[9px_10px] t-body font-mono pointer-events-none flex items-center transition-colors duration-140 z-[1] ${
                remoteId || isInputFocused
                  ? "bg-panel-3 border border-border text-muted"
                  : "bg-panel-2 border border-border text-faint-2"
              }`}
            >
              {remoteId ? "" : "Peer ID"}
            </div>
            <input
              className={`w-full bg-transparent border border-transparent rounded-[5px] p-[9px_10px] outline-none t-body font-mono text-text placeholder:text-transparent transition-colors duration-140 z-[2] relative ${
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
                className="flex-1 bg-danger text-on-danger border-border rounded-[5px] py-[9px] px-[12px] t-body font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h hover:opacity-100 active:opacity-[0.65] whitespace-nowrap"
                onClick={onHangup}
              >
                {reduceMotion ? "Hang up" : <TextMorph ease={{ stiffness: 200, damping: 20 }}>Hang up</TextMorph>}
              </button>
            ) : (
              <button
                className={`flex-1 rounded-[5px] py-[9px] px-[12px] t-body font-semibold cursor-pointer transition-all duration-120 whitespace-nowrap ${
                  remoteId.length === 12
                    ? "bg-accent text-on-accent border-none hover:opacity-[0.82] active:opacity-[0.65]"
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
              className={`flex-1 bg-[var(--color-surface)] border border-border rounded-[5px] py-[7px] px-[10px] t-body font-semibold cursor-pointer transition-all duration-120 flex items-center justify-center gap-[5px] ${
                localStream
                  ? "text-accent hover:text-text hover:bg-[var(--color-surface-hi)]"
                  : "text-faint hover:text-text hover:bg-[var(--color-surface-hi)]"
              }`}
              onClick={localStream ? onStopBroadcast : onBroadcast}
            >
              <Airplay size={ICON.sm} />
              {localStream ? "Stop" : "Share"}
            </button>
            {localStream && (
              <button
                className="bg-[var(--color-surface)] border border-border rounded-[5px] py-[7px] px-[10px] t-body text-faint hover:text-text hover:bg-[var(--color-surface-hi)] cursor-pointer transition-all duration-120 flex items-center justify-center"
                onClick={onChangeSource}
                title="Change source"
              >
                <Pipette size={ICON.sm} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-[8px] overflow-hidden">
        <span className="t-micro tracking-[0.09em] uppercase text-faint">
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
                  background: "color-mix(in oklch, var(--color-danger-fg) 12%, transparent)",
                  borderColor: "color-mix(in oklch, var(--color-danger-fg) 32%, transparent)",
                }
              : signalingStatus === "connected"
                ? {
                    background: "var(--color-accent-soft)",
                    borderColor: "color-mix(in oklch, var(--color-accent) 28%, transparent)",
                  }
                : {
                    background: "var(--color-panel)",
                    borderColor: "var(--color-border)",
                  }
          }
        >
          <div
            className="t-body font-mono overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-[6px] transition-colors duration-300"
            style={{
              color:
                signalingStatus === "error"
                  ? "var(--color-danger-fg)"
                  : signalingStatus === "connected"
                    ? "var(--color-accent)"
                    : "var(--color-faint)",
            }}
          >
            {signalingStatus === "connected" ? (
              <GlobeLock size={ICON.md} />
            ) : (
              <GlobeOff size={ICON.md} />
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
            <div className="flex items-center gap-[12px]">
              <IconBtn onClick={onOpenHistory}>
                <History size={ICON.md} />
              </IconBtn>
              <button
                className="flex items-center gap-[5px] text-faint hover:text-accent cursor-pointer transition-colors duration-120"
                onClick={onOpenSettings}
              >
                <Settings size={ICON.md} />
                <span className="t-body">Settings</span>
              </button>
            </div>

            <div className="self-stretch w-px bg-border mx-[4px]" />

            <div className="flex items-center gap-[12px]">
              <IconBtn
                onClick={hasActiveCall ? onPiP : undefined}
                disabled={!hasActiveCall}
              >
                <SquareArrowOutUpRight size={ICON.md} />
              </IconBtn>
              <IconBtn
                onClick={hasActiveCall ? onFullscreen : undefined}
                disabled={!hasActiveCall}
              >
                <Expand size={ICON.md} />
              </IconBtn>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
