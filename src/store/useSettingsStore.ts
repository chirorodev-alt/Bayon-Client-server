import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SettingsState = {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  discordPresence: boolean;
  language: string;
  defaultVersion: string;
  selectedRam: number;
  resolution: string;
  javaPath: string;
  customArgs: string;
  animationLevel: string;
  reduceMotion: boolean;
  setLaunchOnStartup: (value: boolean) => void;
  setMinimizeToTray: (value: boolean) => void;
  setDiscordPresence: (value: boolean) => void;
  setLanguage: (value: string) => void;
  setDefaultVersion: (value: string) => void;
  setSelectedRam: (value: number) => void;
  setResolution: (value: string) => void;
  setJavaPath: (value: string) => void;
  setCustomArgs: (value: string) => void;
  setAnimationLevel: (value: string) => void;
  setReduceMotion: (value: boolean) => void;
  resetDefaults: () => void;
};

const defaultSettings = {
  launchOnStartup: false,
  minimizeToTray: true,
  discordPresence: true,
  language: 'English (US)',
  defaultVersion: '26.3',
  selectedRam: 8,
  resolution: '1920x1080',
  javaPath: '',
  customArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC',
  animationLevel: 'Smooth',
  reduceMotion: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setLaunchOnStartup: (value) => set({ launchOnStartup: value }),
      setMinimizeToTray: (value) => set({ minimizeToTray: value }),
      setDiscordPresence: (value) => set({ discordPresence: value }),
      setLanguage: (value) => set({ language: value }),
      setDefaultVersion: (value) => set({ defaultVersion: value }),
      setSelectedRam: (value) => set({ selectedRam: value }),
      setResolution: (value) => set({ resolution: value }),
      setJavaPath: (value) => set({ javaPath: value }),
      setCustomArgs: (value) => set({ customArgs: value }),
      setAnimationLevel: (value) => set({ animationLevel: value }),
      setReduceMotion: (value) => set({ reduceMotion: value }),
      resetDefaults: () => set(defaultSettings),
    }),
    {
      name: 'bayon-client-settings',
      version: 3,
      migrate: (persistedState, version) => {
        let persisted = persistedState as Partial<SettingsState>;
        if (version < 2 && persisted.javaPath === 'C:/Program Files/Java/jre-21/bin/java.exe') {
          persisted = { ...persisted, javaPath: '' };
        }
        if (version < 3) persisted = { ...persisted, minimizeToTray: false };
        return persisted;
      },
    },
  ),
);
