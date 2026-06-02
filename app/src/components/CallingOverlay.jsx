import { MorphicLoader } from "./MorphicLoader.jsx";

function formatId(id) {
  if (!id) return "—";
  return id.replace(/(.{3})/g, "$1·").replace(/·$/, "");
}

export function CallingOverlay({ peerId, onCancel, isOutgoing = true }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-[32px] select-none w-full h-full"
      style={{
        background: "var(--color-bg)",
        animation: "callOverlayIn 0.4s ease-out",
      }}
    >
      {/* bottom gradient vignette — z-0 stays behind all content */}
      <div
        className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none z-0"
        style={{
          background: "linear-gradient(to bottom, transparent 0%, var(--color-bg) 70%)",
        }}
      />

      <MorphicLoader size={140} bg="var(--color-bg)" />

      {/* ── Labels ────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center gap-[7px] text-center">
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
        className="relative z-10 bg-danger text-[#e8b4b4] rounded-[8px] py-[10px] px-[32px] text-[12px] font-semibold cursor-pointer transition-all duration-120 hover:bg-danger-h active:opacity-70 tracking-[0.04em]"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

export default CallingOverlay;
