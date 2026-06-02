import { useEffect, useState } from "react";

export function SourcePicker({ isOpen, onClose, onSelect }) {
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) loadSources();
  }, [isOpen]);

  const loadSources = async () => {
    setIsLoading(true);
    try {
      const srcs = await window.electronAPI.getSources();
      setSources(srcs);
    } catch (e) {
      console.error("Failed to load sources:", e);
    }
    setIsLoading(false);
  };

  if (!isOpen) return null;

  const screens = sources.filter((s) => s.isScreen);
  const windows = sources.filter((s) => !s.isScreen);

  const renderSection = (label, items) => {
    if (!items.length) return null;
    return (
      <div className="w-full">
        <div className="text-[11px] text-faint tracking-[0.09em] uppercase mb-[8px]">
          {label}
        </div>
        <div className="grid grid-cols-3 gap-[10px]">
          {items.map((src) => (
            <div
              key={src.id}
              className="cursor-pointer rounded-[6px] overflow-hidden border border-border hover:border-accent transition-colors duration-120"
              onClick={() => { onSelect(src.id); onClose(); }}
            >
              <img
                className="w-full aspect-video object-cover"
                style={{ background: "var(--color-bg)" }}
                src={src.thumbnail}
                alt=""
              />
              <div
                className="text-[10px] text-text p-[5px_7px] truncate"
                style={{ background: "var(--color-panel-2)" }}
              >
                {src.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.55)] backdrop-blur-[4px] z-[100] flex items-center justify-center">
      <div
        className="border border-border rounded-[10px] p-[16px] w-[min(500px,92vw)] max-h-[80vh] flex flex-col gap-[12px]"
        style={{ background: "var(--color-panel)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-text">Select Source</span>
          <button
            className="bg-[var(--color-surface)] text-text border border-border rounded-[5px] py-[6px] px-[10px] text-[11px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65]"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-[14px]">
          {isLoading ? (
            <div className="text-center text-muted py-[20px] text-[12px]">
              Loading sources…
            </div>
          ) : (
            <>
              {renderSection("Screens", screens)}
              {renderSection("Windows", windows)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SourcePicker;
