import { useEffect } from "react";

export function ConfirmDialog({ isOpen, message, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.75)] backdrop-blur-[4px] z-[100] flex items-center justify-center">
      <div className="bg-[#151515] border border-[rgba(255,255,255,0.12)] rounded-[10px] p-[20px_22px] w-[min(340px,90vw)] flex flex-col gap-[16px]">
        <div
          className="text-[13px] text-text leading-[1.5]"
          dangerouslySetInnerHTML={{ __html: message }}
        />
        <div className="flex gap-[6px]">
          <button
            className="bg-accent text-[#0a0a0a] border-none rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65]"
            onClick={onConfirm}
          >
            Confirm
          </button>
          <button
            className="bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65]"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
