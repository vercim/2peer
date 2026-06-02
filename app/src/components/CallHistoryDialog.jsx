import { useEffect, useRef } from "react";
import { X, PhoneOutgoing, PhoneIncoming, Copy, Trash2 } from "lucide-react";

function formatTimestamp(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  return `${hh}:${mm}  ${day}.${mon}`;
}

function formatId(id) {
  return (id.match(/.{1,3}/g) || []).join(".");
}

const OUTCOME_LABEL = {
  connected: "Connected",
  declined:  "Declined",
  cancelled: "Cancelled",
  missed:    "Missed",
  called:    "Called",
};

const OUTCOME_COLOR = {
  connected: "text-[#6abf8a]",
  declined:  "text-[#b86060]",
  cancelled: "text-[#888]",
  missed:    "text-[#b86060]",
  called:    "text-[#888]",
};

export function CallHistoryDialog({ isOpen, onClose, history = [], onClear }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async (id) => {
    try { await navigator.clipboard.writeText(id); } catch (_) {}
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-panel border border-border rounded-[10px] w-[340px] max-h-[480px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-[16px] py-[12px] border-b border-border shrink-0">
          <span className="text-[12px] font-semibold text-text tracking-[0.04em]">Call History</span>
          <button
            className="text-[#555] hover:text-text transition-colors duration-120 cursor-pointer"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {history.length === 0 ? (
            <div className="flex items-center justify-center h-[120px]">
              <span className="text-[12px] text-[#444]">No calls yet</span>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {[...history].reverse().map((entry) => (
                <li key={entry.id} className="flex items-center gap-[10px] px-[14px] py-[10px] group">
                  <div className="shrink-0 text-[#555]">
                    {entry.direction === "outgoing"
                      ? <PhoneOutgoing size={13} />
                      : <PhoneIncoming size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[12px] text-text tracking-[0.04em]">
                      {formatId(entry.peerId)}
                    </div>
                    <div className={`text-[10px] mt-[1px] ${OUTCOME_COLOR[entry.outcome] ?? "text-[#888]"}`}>
                      {OUTCOME_LABEL[entry.outcome] ?? entry.outcome}
                    </div>
                  </div>
                  <div className="flex items-center gap-[8px] shrink-0">
                    <span className="text-[10px] font-mono text-[#444] tabular-nums">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <button
                      className="text-[#333] hover:text-accent transition-colors duration-120 cursor-pointer opacity-0 group-hover:opacity-100"
                      onClick={() => handleCopy(entry.peerId)}
                      title="Copy ID"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="border-t border-border px-[14px] py-[10px] shrink-0 flex justify-end">
            <button
              className="flex items-center gap-[5px] text-[11px] text-[#555] hover:text-[#b86060] transition-colors duration-120 cursor-pointer"
              onClick={onClear}
            >
              <Trash2 size={11} />
              Clear history
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CallHistoryDialog;
