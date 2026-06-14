// Glow colors per connection state. Kept as 6-digit hex (not CSS vars) because
// StatusGlow.jsx appends an alpha suffix to the string. Values track the new
// palette: teal = connected/positive, amber = connecting, red = failed.
export const GLOW_COLORS = {
  idle: "#7c8088",
  connecting: "#f2b14c",
  connected: "#22c79c",
  failed: "#f0595a",
  disconnected: "#f2c14e",
};

export const DEFAULT_GLOW_COLOR = "#7c8088";
