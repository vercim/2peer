import { useEffect, useState, useRef } from "react";

export function StatusGlow({ color = "#888", trigger = 0 }) {
  const [active, setActive] = useState(false);
  const keyRef = useRef(0);

  useEffect(() => {
    if (trigger === 0) return;
    keyRef.current += 1;
    setActive(false);
    setTimeout(() => setActive(true), 10);
  }, [trigger]);

  if (!active) return null;

  return (
    <div
      key={keyRef.current}
      className="animate-glow"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        pointerEvents: "none",
        // Ключевой фикс для Windows:
        border: `1px solid transparent`,
        outline: `1px solid transparent`,
        boxShadow: `inset 0 0 80px 30px ${color}30`,
        // Форс отдельного слоя:
        transform: "translate3d(0,0,0)",
        isolation: "isolate",
      }}
    />
  );
}
