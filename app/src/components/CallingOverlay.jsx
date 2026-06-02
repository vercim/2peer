import { MorphicLoader } from "./MorphicLoader.jsx";

function formatId(id) {
  if (!id) return "—";
  return id.replace(/(.{3})/g, "$1·").replace(/·$/, "");
}

export function CallingOverlay({ peerId, onCancel, isOutgoing = true }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-[32px] select-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 44%, rgba(80,130,220,0.05) 0%, transparent 58%), var(--color-overlay-dark)",
        backdropFilter: "blur(22px) saturate(0.7)",
        WebkitBackdropFilter: "blur(22px) saturate(0.7)",
        animation: "callOverlayIn 0.4s ease-out",
      }}
    >
      <MorphicLoader size={140} bg="#060606" />

      {/* ── Labels ────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-[7px] text-center">
        <span
          className="text-[10px] tracking-[0.15em] uppercase"
          style={{ color: "var(--color-overlay-label)" }}
        >
          {isOutgoing ? "Calling" : "Connecting"}
        </span>
        <span
          className="font-mono text-[21px] tracking-[0.05em]"
          style={{ color: "var(--color-overlay-id)" }}
        >
          {formatId(peerId)}
        </span>
        <span
          className="text-[11px]"
          style={{ color: "var(--color-overlay-sub)" }}
        >
          {isOutgoing
            ? "Waiting for peer to answer…"
            : "Establishing P2P connection…"}
        </span>
      </div>

      {/* ── Cancel button ─────────────────────────────────────── */}
      <button
        className="bg-danger text-[#e8b4b4] rounded-[8px] py-[10px] px-[32px] text-[12px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h active:opacity-70 tracking-[0.04em]"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

export default CallingOverlay;
