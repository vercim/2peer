import { PhoneIncoming } from "lucide-react";

function formatId(id) {
  if (!id) return "—";
  return id.replace(/(.{3})/g, "$1·").replace(/·$/, "");
}

export function IncomingCallDialog({ callerId, onAccept, onDecline }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center select-none"
      style={{
        background: "var(--color-overlay)",
        backdropFilter: "blur(20px) saturate(0.7)",
        WebkitBackdropFilter: "blur(20px) saturate(0.7)",
        animation: "callOverlayIn 0.3s ease-out",
      }}
    >
      <div
        className="flex flex-col items-center gap-[24px] rounded-[18px] p-[36px_44px]"
        style={{
          background: "var(--color-dialog-bg)",
          border: "1px solid var(--color-dialog-border)",
          boxShadow: "0 28px 90px var(--color-dialog-shadow)",
          animation: "dialogFadeIn 0.32s cubic-bezier(0.22,1,0.36,1)",
          minWidth: 300,
        }}
      >
        {/* ── Ringing icon with ripple rings ────────────────── */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: 76, height: 76 }}
        >
          {/* Ripple ring 1 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              animation: "ringPulse 2.2s ease-out infinite",
            }}
          />
          {/* Ripple ring 2 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              animation: "ringPulse 2.2s ease-out 0.7s infinite",
            }}
          />
          {/* Ripple ring 3 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid rgba(255,255,255,0.05)",
              animation: "ringPulse 2.2s ease-out 1.4s infinite",
            }}
          />
          {/* Icon background */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          />
          {/* Phone icon */}
          <PhoneIncoming
            className="relative z-10"
            size={26}
            stroke="rgba(200,230,200,0.55)"
            strokeWidth={1.5}
          />
        </div>

        {/* ── Text ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-[7px] text-center">
          <span className="t-micro tracking-[0.14em] uppercase text-faint">
            Incoming call
          </span>
          <span className="font-mono t-display text-text-soft tracking-[0.04em]">
            {formatId(callerId)}
          </span>
        </div>

        {/* ── Buttons ───────────────────────────────────────── */}
        <div className="flex gap-[12px] w-full">
          <button
            className="flex-1 rounded-[8px] py-[11px] t-body font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.85] active:opacity-70 tracking-[0.03em]"
            style={{
              background: "rgba(230,230,230,0.92)",
              color: "#0a0a0a",
            }}
            onClick={onAccept}
          >
            Accept
          </button>
          <button
            className="flex-1 bg-danger text-[#e8b4b4] rounded-[8px] py-[11px] t-body font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h active:opacity-70 tracking-[0.03em]"
            onClick={onDecline}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

export default IncomingCallDialog;
