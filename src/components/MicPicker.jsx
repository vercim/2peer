import { useEffect, useState } from "react";

export function MicPicker({ isOpen, onClose, onSelect, selectedDeviceId }) {
  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDevices();
    }
  }, [isOpen]);

  const loadDevices = async () => {
    setIsLoading(true);
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((d) => d.kind === "audioinput");
      setDevices(audioInputs);
    } catch (e) {
      console.error("Failed to load audio devices:", e);
    }
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.75)] backdrop-blur-[4px] z-[100] flex items-center justify-center">
      <div className="bg-[#151515] border border-[rgba(255,255,255,0.12)] rounded-[10px] p-[18px] w-[min(400px,92vw)] max-h-[60vh] flex flex-col gap-[14px]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-text">
            Select Microphone
          </span>
          <button
            className="bg-[rgba(255,255,255,0.06)] text-text border border-border rounded-[5px] py-[7px] px-[10px] text-[11px] font-semibold cursor-pointer transition-opacity duration-120 hover:opacity-[0.82] active:opacity-[0.65]"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-[8px]">
          {isLoading ? (
            <div className="text-center text-muted py-[20px]">
              Loading devices...
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center text-muted py-[20px]">
              No microphones found
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.deviceId}
                className={`cursor-pointer rounded-[6px] p-[10px_12px] border transition-colors ${
                  selectedDeviceId === device.deviceId
                    ? "border-green-500 bg-[rgba(34,197,94,0.1)]"
                    : "border-border hover:border-[rgba(255,255,255,0.3)]"
                }`}
                onClick={() => {
                  onSelect(device.deviceId);
                  onClose();
                }}
              >
                <div className="text-[12px] text-text font-medium truncate">
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default MicPicker;
