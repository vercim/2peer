import { createContext, useContext } from "react";

export const SettingsContext = createContext({
  theme: "dark",
  fontSize: 12,
  soundEnabled: true,
  reduceMotion: false,
  monochromatic: false,
  streamAudio: true,
  notificationsEnabled: true,
  trayEnabled: true,
  minimizeToTray: true,
});

export const useSettings = () => useContext(SettingsContext);
