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
      className="fixed inset-0 pointer-events-none z-[99] animate-glow"
      style={{
        boxShadow: `inset 0 0 70px 40px ${color}30`,
      }}
    />
  );
}
