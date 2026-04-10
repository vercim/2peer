import { useEffect, useState, useRef } from "react";

export function StatusGlow({ color = "rgba(136,136,136,0.3)", trigger = 0 }) {
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
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        pointerEvents: "none",
        boxShadow: `inset 0 0 70px 40px ${color}`,
        transform: "translateZ(0)",
        willChange: "box-shadow",
      }}
    />
  );
}
