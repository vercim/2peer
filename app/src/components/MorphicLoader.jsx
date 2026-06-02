export function MorphicLoader({ size = 140, bg = '#060606' }) {
  const s = Math.round(size * 0.37);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Outgoing signal rings — outside the filter, not gooey */}
      <div className="morphic-ring mr1" style={{ width: size, height: size }} />
      <div className="morphic-ring mr2" style={{ width: size, height: size }} />
      <div className="morphic-ring mr3" style={{ width: size, height: size }} />

      {/* Gooey shapes — mix-blend-mode: lighten makes the dark bg invisible */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: 'blur(10px) contrast(18)',
          background: bg,
          mixBlendMode: 'lighten',
        }}
      >
        <div className="morphic-shape morphic-s1" style={{ width: s, height: s }} />
        <div className="morphic-shape morphic-s2" style={{ width: s, height: s }} />
        <div className="morphic-shape morphic-s3" style={{ width: s, height: s }} />
      </div>
    </div>
  );
}

export default MorphicLoader;
