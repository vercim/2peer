import { useRef, useEffect, useState } from "react";
import { TextMorph } from "torph/react";

export function StatusLog({ messages = [] }) {
  const containerRef = useRef(null);
  const [animatedIds, setAnimatedIds] = useState(new Set());

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      const latestId = messages[messages.length - 1].id || messages.length - 1;
      setAnimatedIds((prev) => {
        if (!prev.has(latestId)) {
          return new Set([...prev, latestId]);
        }
        return prev;
      });
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[4px] scrollbar-none"
      id="statusLog"
    >
      {messages.map((msg, i) => {
        const id = msg.id || i;
        const shouldAnimate = animatedIds.has(id);
        return (
          <div
            key={id}
            className={`entry text-[12px] text-muted leading-[1.4] py-[2px] break-word ${msg.isError ? "text-red-400" : ""} ${shouldAnimate ? "animate-pulse-once" : ""}`}
            dangerouslySetInnerHTML={{ __html: msg.text }}
          />
        );
      })}
    </div>
  );
}

export default StatusLog;
