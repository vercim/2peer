import { useRef, useEffect } from "react";

export function StatusLog({ messages = [] }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[4px] scrollbar-none"
      id="statusLog"
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`entry text-[12px] text-muted leading-[1.4] py-[2px] break-word ${msg.isError ? "text-red-400" : ""}`}
          dangerouslySetInnerHTML={{ __html: msg.text }}
        />
      ))}
    </div>
  );
}

export default StatusLog;
