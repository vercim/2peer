import { useState, useEffect } from "react";
import { X, RotateCcw } from "lucide-react";
import { qualityOptions } from "../utils/rtcConfig.js";

// Accent *seeds* — colormap.css derives the live tint per theme via color-mix,
// so each reads well on both dark and light. Evenly spread around the wheel.
const ACCENT_COLORS = [
  { name: "Teal",   value: "#22C79C" },
  { name: "Azure",  value: "#3B9EFF" },
  { name: "Indigo", value: "#7C82FF" },
  { name: "Violet", value: "#B57BFF" },
  { name: "Amber",  value: "#F2B14C" },
  { name: "Coral",  value: "#F0726A" },
];

const TABS = [
  { id: "app",     label: "App"     },
  { id: "network", label: "Network" },
  { id: "system",  label: "System"  },
];

const DEFAULT_SETTINGS = {
  accentColor: "#22C79C",
  theme: "dark",
  fontSize: 14,
  soundEnabled: true,
  reduceMotion: false,
  monochromatic: false,
  resolution: "1080p",
  fps: 60,
  streamAudio: true,
  trafficLimits: { enabled: false, uploadGB: 50, downloadGB: 50 },
  callNotifications: true,
  updateNotifications: true,
  startAtLogin: true,
  trayEnabled: true,
  minimizeToTray: true,
};

/* ── Reusable primitives ─────────────────────────────────────────────────── */

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-[40px] h-[22px] rounded-full transition-colors duration-200 shrink-0 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      } ${checked ? "bg-accent" : "bg-[var(--color-faint)]"}`}
    >
      <div
        className={`absolute top-[3px] w-[16px] h-[16px] rounded-full bg-white transition-all duration-200 ${
          checked ? "left-[21px]" : "left-[3px]"
        }`}
        style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
      />
    </button>
  );
}

function SettingRow({ label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-[16px] py-[11px] border-b border-border last:border-none">
      <div className="flex flex-col gap-[2px]">
        <span className={`t-body ${disabled ? "text-dim" : "text-text"}`}>{label}</span>
        {description && <span className="t-body text-faint">{description}</span>}
      </div>
      <Toggle checked={!!checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function PillGroup({ options, value, onChange, cols = 3 }) {
  return (
    <div
      className="grid gap-[4px]"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {options.map((opt) => {
        const v = typeof opt === "object" ? opt.value : opt;
        const label = typeof opt === "object" ? opt.label : String(opt);
        const active = value === v;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`py-[7px] rounded-[5px] t-body font-semibold transition-colors duration-120 cursor-pointer border truncate ${
              active
                ? "bg-[var(--color-surface-md)] border-[var(--color-dialog-border)] text-text"
                : "bg-transparent border-border text-faint hover:text-text hover:border-[var(--color-dialog-border)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <span className="text-[10px] tracking-[0.09em] uppercase text-faint block mb-[7px]">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="border-t border-border my-[14px]" />;
}

/* ── Tab: App ────────────────────────────────────────────────────────────── */

function AppTab({ settings, onChange }) {
  return (
    <div className="flex flex-col">
      {/* Accent color */}
      <div className="mb-[14px]">
        <SectionLabel>Accent color</SectionLabel>
        <div className="flex gap-[8px] flex-wrap">
          {ACCENT_COLORS.map(({ name, value }) => (
            <button
              key={value}
              title={name}
              onClick={() => onChange("accentColor", value)}
              className="relative cursor-pointer"
              style={{ width: 22, height: 22 }}
            >
              <div
                className="w-full h-full rounded-full transition-transform duration-120 hover:scale-110"
                style={{ background: value }}
              />
              {settings.accentColor === value && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    outline: `2px solid ${value}`,
                    outlineOffset: 2,
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <Divider />

      {/* Theme */}
      <div className="mb-[14px]">
        <SectionLabel>Theme</SectionLabel>
        <PillGroup
          cols={2}
          options={[
            { value: "dark",  label: "Dark"  },
            { value: "light", label: "Light" },
          ]}
          value={settings.theme}
          onChange={(v) => onChange("theme", v)}
        />
      </div>

      <Divider />

      {/* Text size */}
      <div className="mb-[14px]">
        <SectionLabel>Text size</SectionLabel>
        <PillGroup
          cols={5}
          options={[
            { value: 11, label: "XS" },
            { value: 12, label: "S"  },
            { value: 14, label: "M"  },
            { value: 16, label: "L"  },
            { value: 18, label: "XL" },
          ]}
          value={settings.fontSize ?? 14}
          onChange={(v) => onChange("fontSize", Number(v))}
        />
      </div>

      <Divider />

      {/* Toggles */}
      <SettingRow
        label="Sound effects"
        description="Play sounds for calls and connection events"
        checked={settings.soundEnabled}
        onChange={(v) => onChange("soundEnabled", v)}
      />
      <SettingRow
        label="Reduce motion"
        description="Disable text morphing and CSS animations"
        checked={settings.reduceMotion}
        onChange={(v) => onChange("reduceMotion", v)}
      />
      <SettingRow
        label="Monochromatic"
        description="Remove all color from the interface"
        checked={settings.monochromatic}
        onChange={(v) => onChange("monochromatic", v)}
      />
    </div>
  );
}

/* ── Tab: Network ────────────────────────────────────────────────────────── */

function NetworkTab({ settings, onChange }) {
  const limits = settings.trafficLimits || DEFAULT_SETTINGS.trafficLimits;

  const updateLimits = (key, value) => {
    onChange("trafficLimits", { ...limits, [key]: value });
  };

  const resOptions = qualityOptions.resolution.map((r) => ({
    value: r.value,
    label: r.label,
  }));

  const fpsOptions = qualityOptions.fps.map((f) => ({
    value: f,
    label: `${f}`,
  }));

  return (
    <div className="flex flex-col">
      {/* Resolution */}
      <div className="mb-[14px]">
        <SectionLabel>Resolution</SectionLabel>
        <PillGroup
          cols={3}
          options={resOptions}
          value={settings.resolution}
          onChange={(v) => onChange("resolution", v)}
        />
      </div>

      {/* FPS */}
      <div className="mb-[14px]">
        <SectionLabel>Frame rate</SectionLabel>
        <PillGroup
          cols={6}
          options={fpsOptions}
          value={settings.fps}
          onChange={(v) => onChange("fps", Number(v))}
        />
      </div>

      <div className="p-[7px_10px] rounded-[5px] bg-[var(--color-surface-lo)] border border-border mb-[2px]">
        <span className="t-body text-faint">
          Bitrate adjusts automatically. Changes apply on the next call.
        </span>
      </div>

      <Divider />

      <SettingRow
        label="Stream audio"
        description="Transmit your screen audio to the peer"
        checked={settings.streamAudio}
        onChange={(v) => onChange("streamAudio", v)}
      />

      {/* Traffic limits */}
      <div>
        <div className="flex items-center justify-between py-[11px]">
          <div className="flex flex-col gap-[2px]">
            <span className="t-body text-text">Traffic limits</span>
            <span className="t-body text-faint">
              Show warnings when session traffic exceeds limits
            </span>
          </div>
          <Toggle
            checked={limits.enabled}
            onChange={(v) => updateLimits("enabled", v)}
          />
        </div>

        {limits.enabled && (
          <div className="flex gap-[10px] pt-[10px] border-t border-border">
            <div className="flex-1 flex flex-col gap-[4px]">
              <span className="t-body text-faint">Upload limit (GB)</span>
              <div className="flex items-center bg-panel-2 border border-border rounded-[5px] px-[8px] py-[6px]">
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={limits.uploadGB}
                  onChange={(e) =>
                    updateLimits("uploadGB", Math.max(1, Number(e.target.value)))
                  }
                  className="w-full bg-transparent t-body text-text outline-none font-mono"
                />
                <span className="t-body text-faint shrink-0">GB</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-[4px]">
              <span className="t-body text-faint">Download limit (GB)</span>
              <div className="flex items-center bg-panel-2 border border-border rounded-[5px] px-[8px] py-[6px]">
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={limits.downloadGB}
                  onChange={(e) =>
                    updateLimits("downloadGB", Math.max(1, Number(e.target.value)))
                  }
                  className="w-full bg-transparent t-body text-text outline-none font-mono"
                />
                <span className="t-body text-faint shrink-0">GB</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tab: System ─────────────────────────────────────────────────────────── */

function SystemTab({ settings, onChange }) {
  return (
    <div className="flex flex-col">
      <SettingRow
        label="Call notifications"
        description="Show system notification for incoming calls"
        checked={settings.callNotifications}
        onChange={(v) => onChange("callNotifications", v)}
      />
      <SettingRow
        label="Update notifications"
        description="Notify when a new version of 2peer is available"
        checked={settings.updateNotifications}
        onChange={(v) => onChange("updateNotifications", v)}
      />
      <SettingRow
        label="Auto run on startup"
        description="Start 2peer automatically when you log in"
        checked={settings.startAtLogin}
        onChange={(v) => onChange("startAtLogin", v)}
      />
      <SettingRow
        label="Tray icon"
        description="Show icon in the system tray / menu bar"
        checked={settings.trayEnabled}
        onChange={(v) => onChange("trayEnabled", v)}
      />

      {/* On window close */}
      <div className={`mt-[14px] ${!settings.trayEnabled ? "opacity-40 pointer-events-none" : ""}`}>
        <SectionLabel>When closing the window</SectionLabel>
        <PillGroup
          cols={2}
          options={[
            { value: true,  label: "Minimize to tray" },
            { value: false, label: "Quit app"         },
          ]}
          value={settings.minimizeToTray}
          onChange={(v) => onChange("minimizeToTray", v === "true" || v === true)}
        />
        {!settings.trayEnabled && (
          <p className="t-body text-faint mt-[6px]">
            Enable tray icon to use minimize-to-tray.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Main dialog ─────────────────────────────────────────────────────────── */

export function SettingsDialog({ isOpen, onClose, settings, onSave }) {
  const [activeTab, setActiveTab] = useState("app");
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen || !settings) return null;

  const update = (key, value) => onSave({ ...settings, [key]: value });
  const reset = () => {
    onSave({ ...DEFAULT_SETTINGS });
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center select-none"
      style={{
        background: "var(--color-overlay)",
        backdropFilter: "blur(16px) saturate(0.7)",
        WebkitBackdropFilter: "blur(16px) saturate(0.7)",
        animation: "callOverlayIn 0.25s ease-out",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 420,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-dialog-bg)",
          border: "1px solid var(--color-dialog-border)",
          boxShadow: "0 24px 80px var(--color-dialog-shadow)",
          animation: "dialogFadeIn 0.28s cubic-bezier(0.22,1,0.36,1)",
          borderRadius: 14,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[18px] py-[13px] border-b border-border shrink-0">
          <span className="t-body font-semibold text-text tracking-[0.02em]">
            Settings
          </span>
          <button
            onClick={onClose}
            className="text-[#444] hover:text-[#888] transition-colors duration-120 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-[2px] px-[14px] pt-[11px] pb-[1px] shrink-0">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-[10px] py-[6px] rounded-[5px] t-body font-semibold transition-colors duration-120 cursor-pointer ${
                activeTab === id
                  ? "bg-[var(--color-surface-md)] text-text"
                  : "text-faint hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="px-[18px] py-[14px] overflow-y-auto scrollbar-none flex-1">
          {activeTab === "app"     && <AppTab     settings={settings} onChange={update} />}
          {activeTab === "network" && <NetworkTab settings={settings} onChange={update} />}
          {activeTab === "system"  && <SystemTab  settings={settings} onChange={update} />}
        </div>

        {/* Footer */}
        <div className="px-[18px] py-[12px] border-t border-border shrink-0">
          <button
            onClick={reset}
            className={`flex items-center gap-[6px] t-body transition-colors duration-200 cursor-pointer ${
              resetDone ? "text-accent" : "text-faint-2 hover:text-faint"
            }`}
          >
            <RotateCcw size={11} className={resetDone ? "opacity-0 w-0 overflow-hidden" : ""} />
            {resetDone ? "✓ All settings reset" : "Reset all settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;
