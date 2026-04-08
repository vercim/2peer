import { useState } from "react";
import StatusLog from "./StatusLog";

export function Sidebar({
  selfId,
  onCopyId,
  onRegenId,
  onCall,
  onHangup,
  onAccept,
  onDecline,
  hasIncomingCall = false,
  callerId = "",
  hasActiveCall = false,
  version = "",
  serverInfo = "",
  statusMessages = [],
}) {
  const [remoteId, setRemoteId] = useState("");

  const handleCall = () => {
    if (remoteId.trim()) {
      onCall(remoteId.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
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
          {selfId || "—"}
        </div>
        <div className="flex gap-[6px]">
          <button
            className="flex-1 bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap"
            onClick={onCopyId}
          >
            Copy
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
        <input
          className="w-full bg-panel-2 border border-border text-text rounded-[5px] p-[9px_10px] outline-none text-[13px] font-mono transition-colors duration-140 focus:border-[rgba(255,255,255,0.22)]"
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={64}
          placeholder="Peer ID"
          disabled={hasActiveCall}
        />
        <div className="flex gap-[6px]">
          <button
            className="flex-1 bg-[#d8d8d8] text-[#0a0a0a] border-none rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65] whitespace-nowrap disabled:opacity-50"
            onClick={handleCall}
            disabled={hasActiveCall || !remoteId.trim()}
          >
            Call
          </button>
          <button
            className="flex-1 bg-danger text-[#e8b4b4] border-[rgba(255,255,255,0.05)] rounded-[5px] py-[9px] px-[12px] text-[12px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h hover:opacity-100 active:opacity-[0.65] whitespace-nowrap disabled:opacity-50"
            onClick={onHangup}
            disabled={!hasActiveCall}
          >
            Hang up
          </button>
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
        <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
          <div className="text-[11px] text-[#2e2e2e] font-mono overflow-hidden text-ellipsis whitespace-nowrap">
            {version || "--"}
          </div>
        </div>
        <div className="bg-panel border border-border rounded-[8px] p-[10px_14px]">
          <div className="text-[11px] text-[#2e2e2e] font-mono overflow-hidden text-ellipsis whitespace-nowrap">
            {serverInfo || "--"}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
