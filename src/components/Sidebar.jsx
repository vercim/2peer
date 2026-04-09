import { useState } from "react";
import { TextMorph } from "torph/react";
import { Zap, AlertTriangle } from "lucide-react";
import StatusLog from "./StatusLog";

function formatId(id) {
  if (!id) return "";
  return id.replace(/(.{3})/g, "$1.").replace(/\.$/, "");
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
  onAccept,
  onDecline,
  hasIncomingCall = false,
  callerId = "",
  hasActiveCall = false,
  connectionStatus = "idle",
  supabaseStatus = "disconnected",
  statusMessages = [],
  version = "",
}) {
  const [remoteId, setRemoteId] = useState("");
  const [copied, setCopied] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isCalling = connectionStatus === "connecting";

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
            className="flex-1 bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap"
            onClick={onRegenId}
          >
            New ID
          </button>
        </div>
      </div>

      <div className="bg-panel border border-border rounded-[8px] p-[12px_14px] flex flex-col gap-[8px] shrink-0">
        <span className="text-[10px] tracking-[0.09em] uppercase text-faint">
          Call
        </span>
        <div className="relative">
          <div
            className={`absolute inset-0 rounded-[5px] p-[9px_10px] text-[13px] font-mono pointer-events-none flex items-center text-[#444] transition-colors duration-140 ${
              remoteId || isInputFocused
                ? "bg-panel-3 border border-[rgba(255,255,255,0.12)]"
                : "bg-panel-2 border border-border"
            }`}
          >
            {formatId(remoteId) || "Peer ID"}
          </div>
          <input
            className={`w-full bg-transparent border border-transparent rounded-[5px] p-[9px_10px] outline-none text-[13px] font-mono text-[#e0e0e0] transition-colors duration-140 ${
              remoteId || isInputFocused ? "bg-panel-3" : ""
            }`}
            value={remoteId}
            onChange={(e) =>
              setRemoteId(e.target.value.replace(/\./g, "").toUpperCase())
            }
            onKeyDown={handleKeyDown}
            maxLength={12}
            placeholder=""
            disabled={hasActiveCall}
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
          />
        </div>
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
                isCalling
                  ? "bg-danger text-[#e8b4b4] border-[rgba(255,255,255,0.05)] hover:bg-danger-h"
                  : remoteId.length === 12
                    ? "bg-[#d8d8d8] text-[#0a0a0a] border-none hover:opacity-[0.82] active:opacity-[0.65]"
                    : "bg-[#2a2a2a] text-[#555] border-none cursor-not-allowed"
              }`}
              onClick={isCalling ? onCancelCall : handleCall}
              disabled={isCalling ? false : remoteId.length !== 12}
            >
              <TextMorph ease={{ stiffness: 200, damping: 20 }}>
                {isCalling ? "Cancel" : "Call"}
              </TextMorph>
            </button>
          )}
        </div>
      </div>

      {hasIncomingCall && (
        <div className="bg-panel border border-border rounded-[8px] p-[12px_14px] flex flex-col gap-[8px] shrink-0">
          <span className="text-[10px] tracking-[0.09em] uppercase text-faint">
            Incoming Call
          </span>
          <div className="text-[12px] text-muted">
            from <strong className="font-mono text-text">{callerId}</strong>
          </div>
          <div className="flex gap-[6px]">
            <button
              className="bg-[#d8d8d8] text-[#0a0a0a] border-none rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap"
              onClick={onAccept}
            >
              Accept
            </button>
            <button
              className="bg-danger text-[#e8b4b4] border-[rgba(255,255,255,0.05)] rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h hover:opacity-100 active:opacity-[0.65] whitespace-nowrap"
              onClick={onDecline}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-[8px] overflow-hidden">
        <span className="text-[10px] tracking-[0.09em] uppercase text-faint">
          Status
        </span>
        <StatusLog messages={statusMessages} />
      </div>

      <div className="mt-auto flex flex-col gap-[10px]">
        {version && (
          <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
            <div className="text-[11px] text-[#666] font-mono overflow-hidden text-ellipsis whitespace-nowrap">
              v{version}
            </div>
          </div>
        )}
        <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
          <div className="text-[11px] text-[#2e2e2e] font-mono overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-[6px]">
            {supabaseStatus === "connected" ? (
              <Zap size={14} className="text-[#333]" />
            ) : (
              <AlertTriangle size={14} className="text-[#333]" />
            )}
            <TextMorph>
              {supabaseStatus === "connected"
                ? "Supabase Realtime"
                : "Supabase Error"}
            </TextMorph>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
