function formatId(id) {
  if (!id) return "—";
  return id.replace(/(.{3})/g, "$1·").replace(/·$/, "");
}

export function IncomingCallDialog({ callerId, onAccept, onDecline }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center select-none"
      style={{
        background: "rgba(6,6,6,0.8)",
        backdropFilter: "blur(20px) saturate(0.55)",
        WebkitBackdropFilter: "blur(20px) saturate(0.55)",
        animation: "callOverlayIn 0.3s ease-out",
      }}
    >
      <div
        className="flex flex-col items-center gap-[24px] rounded-[18px] p-[36px_44px]"
        style={{
          background: "rgba(16,16,16,0.97)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 28px 90px rgba(0,0,0,0.7)",
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
          <svg
            className="relative z-10"
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(200,230,200,0.55)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.69A16 16 0 0 0 15.31 16l.88-.88a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>

        {/* ── Text ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-[7px] text-center">
          <span className="text-[10px] tracking-[0.14em] uppercase text-[#3a3a3a]">
            Incoming call
          </span>
          <span className="font-mono text-[22px] text-[#ccc] tracking-[0.04em]">
            {formatId(callerId)}
          </span>
        </div>

        {/* ── Buttons ───────────────────────────────────────── */}
        <div className="flex gap-[12px] w-full">
          <button
            className="flex-1 rounded-[8px] py-[11px] text-[12px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.85] active:opacity-70 tracking-[0.03em]"
            style={{
              background: "rgba(230,230,230,0.92)",
              color: "#0a0a0a",
            }}
            onClick={onAccept}
          >
            Accept
          </button>
          <button
            className="flex-1 bg-danger text-[#e8b4b4] rounded-[8px] py-[11px] text-[12px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h active:opacity-70 tracking-[0.03em]"
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
