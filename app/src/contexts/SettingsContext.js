import { createContext, useContext } from "react";

export const SettingsContext = createContext({
  accentColor: "#B9D9CC",
  theme: "dark",
  soundEnabled: true,
  reduceMotion: false,
  monochromatic: false,
  streamAudio: true,
  notificationsEnabled: true,
  trayEnabled: true,
  minimizeToTray: true,
});

export const useSettings = () => useContext(SettingsContext);
