import { useEffect, useState } from "react";

export function SourcePicker({ isOpen, onClose, onSelect }) {
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
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
        <div className="source-section-label text-[11px] text-faint tracking-[0.09em] uppercase mb-[8px] text-center w-full">
          {label}
        </div>
        <div className="source-grid grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-[12px]">
          {items.map((src) => (
            <div
              key={src.id}
              className="source-item cursor-pointer rounded-[6px] overflow-hidden border border-border hover:border-[rgba(255,255,255,0.3)] transition-colors"
              onClick={() => {
                onSelect(src.id);
                onClose();
              }}
            >
              <img
                className="source-thumb w-full aspect-video object-cover bg-[#0a0a0a]"
                src={src.thumbnail}
                alt=""
              />
              <div className="source-name text-[10px] text-text p-[6px] truncate bg-[#151515]">
                {src.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.75)] backdrop-blur-[4px] z-[100] flex items-center justify-center">
      <div className="bg-[#151515] border border-[rgba(255,255,255,0.12)] rounded-[10px] p-[18px] w-[min(700px,92vw)] max-h-[80vh] flex flex-col gap-[14px]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-text">
            Select Broadcast Source
          </span>
          <button
            className="bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65]"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-[16px]">
          {isLoading ? (
            <div className="text-center text-muted py-[20px]">
              Loading sources...
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
