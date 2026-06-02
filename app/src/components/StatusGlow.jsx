import { useEffect, useState, useRef } from "react";
import { GLOW_COLORS, DEFAULT_GLOW_COLOR } from "../utils/statusStates.js";

export function StatusGlow({ state = "idle", trigger = 0 }) {
  const color = GLOW_COLORS[state] || DEFAULT_GLOW_COLOR;
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
        border: `1px solid transparent`,
        outline: `1px solid transparent`,
        boxShadow: `inset 0 0 78px 28px ${color}1A`,
        transform: "translate3d(0,0,0)",
        isolation: "isolate",
      }}
    />
  );
}
