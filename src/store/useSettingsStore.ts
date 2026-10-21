import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SettingsState = {
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  discordPresence: boolean;
  language: string;
  defaultVersion: string;
  selectedRam: number;
  fpsLimit: number;
  resolution: string;
  renderDistance: string;
  javaPath: string;
  customArgs: string;
  animationLevel: string;
  reduceMotion: boolean;
  backendUrl: string;
  setLaunchOnStartup: (value: boolean) => void;
  setMinimizeToTray: (value: boolean) => void;
  setDiscordPresence: (value: boolean) => void;
  setLanguage: (value: string) => void;
  setDefaultVersion: (value: string) => void;
  setSelectedRam: (value: number) => void;
  setFpsLimit: (value: number) => void;
  setResolution: (value: string) => void;
  setRenderDistance: (value: string) => void;
  setJavaPath: (value: string) => void;
  setCustomArgs: (value: string) => void;
  setAnimationLevel: (value: string) => void;
  setReduceMotion: (value: boolean) => void;
  setBackendUrl: (value: string) => void;
  resetDefaults: () => void;
};

const defaultSettings = {
  launchOnStartup: false,
  minimizeToTray: true,
  discordPresence: true,
  language: 'English (US)',
  defaultVersion: '1.21.1',
  selectedRam: 8,
  fpsLimit: 144,
  resolution: '1920x1080',
  renderDistance: '12 Chunks',
  javaPath: 'C:/Program Files/Java/jre-21/bin/java.exe',
  customArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC',
  animationLevel: 'Smooth',
  reduceMotion: false,
  backendUrl: 'https://bayon-backend.onrender.com',
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
      setFpsLimit: (value) => set({ fpsLimit: value }),
      setResolution: (value) => set({ resolution: value }),
      setRenderDistance: (value) => set({ renderDistance: value }),
      setJavaPath: (value) => set({ javaPath: value }),
      setCustomArgs: (value) => set({ customArgs: value }),
      setAnimationLevel: (value) => set({ animationLevel: value }),
      setReduceMotion: (value) => set({ reduceMotion: value }),
      setBackendUrl: (value) => set({ backendUrl: value }),
      resetDefaults: () => set(defaultSettings),
    }),
    { name: 'bayon-client-settings' },
  ),
);
