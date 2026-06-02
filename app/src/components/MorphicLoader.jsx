export function MorphicLoader({ size = 140 }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div className="org-blob ob-outer" style={{ width: size,           height: size           }} />
      <div className="org-blob ob-mid"   style={{ width: size * 0.70,    height: size * 0.70    }} />
      <div className="org-blob ob-inner" style={{ width: size * 0.44,    height: size * 0.44    }} />
    </div>
  );
}

export default MorphicLoader;
