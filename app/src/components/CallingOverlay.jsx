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
          "radial-gradient(ellipse at 50% 44%, rgba(80,130,220,0.05) 0%, transparent 58%), rgba(6,6,6,0.84)",
        backdropFilter: "blur(22px) saturate(0.55)",
        WebkitBackdropFilter: "blur(22px) saturate(0.55)",
        animation: "callOverlayIn 0.4s ease-out",
      }}
    >
      {/* ── Blob assembly ─────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: 220, height: 220 }}
      >
        {/* Ambient glow behind blobs */}
        <div
          style={{
            position: "absolute",
            inset: -32,
            background:
              "radial-gradient(circle, rgba(120,180,255,0.07) 0%, transparent 68%)",
            animation: "blobGlow 5s ease-in-out infinite",
          }}
        />

        {/* Outer blob */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 42% 38%, rgba(160,210,255,0.1), rgba(100,160,240,0.03) 62%, transparent)",
            border: "1px solid rgba(180,220,255,0.09)",
            animation:
              "blobMorph1 11s ease-in-out infinite, blobFloat 9s ease-in-out infinite",
            boxShadow:
              "0 0 70px rgba(100,160,255,0.06), inset 0 0 40px rgba(200,230,255,0.03)",
          }}
        />

        {/* Mid blob */}
        <div
          style={{
            position: "absolute",
            inset: 26,
            background:
              "radial-gradient(ellipse at 56% 44%, rgba(200,230,255,0.13), rgba(140,190,255,0.04) 65%, transparent)",
            border: "1px solid rgba(200,235,255,0.11)",
            animation:
              "blobMorph2 8s ease-in-out infinite, blobFloatReverse 7s ease-in-out infinite",
            boxShadow: "0 0 36px rgba(150,200,255,0.07)",
          }}
        />

        {/* Inner blob */}
        <div
          style={{
            position: "absolute",
            inset: 62,
            background:
              "radial-gradient(circle at 50% 48%, rgba(230,245,255,0.22), rgba(190,225,255,0.07) 58%, transparent)",
            border: "1px solid rgba(220,245,255,0.17)",
            animation:
              "blobMorph3 5.5s ease-in-out infinite, blobGlow 3.2s ease-in-out infinite",
            boxShadow: "0 0 18px rgba(210,235,255,0.13)",
          }}
        />

        {/* Phone icon */}
        <div
          className="relative z-10 flex items-center justify-center"
          style={{ color: "rgba(200,230,255,0.45)" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.69A16 16 0 0 0 15.31 16l.88-.88a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
      </div>

      {/* ── Labels ────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-[7px] text-center">
        <span
          className="text-[10px] tracking-[0.15em] uppercase"
          style={{ color: "rgba(255,255,255,0.22)" }}
        >
          {isOutgoing ? "Calling" : "Connecting"}
        </span>
        <span
          className="font-mono text-[21px] tracking-[0.05em]"
          style={{ color: "rgba(215,238,255,0.72)" }}
        >
          {formatId(peerId)}
        </span>
        <span
          className="text-[11px]"
          style={{ color: "rgba(255,255,255,0.18)" }}
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
