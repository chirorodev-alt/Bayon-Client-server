import type { ModCatalogResult, ModCatalogSource, ModSearchOptions } from '../services/modCatalog';

export type DiscordPresenceStatus = {
  state: 'not-configured' | 'connecting' | 'connected' | 'discord-not-running' | 'error';
  message: string;
  configured: boolean;
};

export type DiscordActivityPayload = {
  page?: string;
  details?: string;
  state?: string;
  username?: string;
  version?: string;
  loader?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  largeImageKey?: string;
  largeImageText?: string;
  smallImageKey?: string;
  smallImageText?: string;
  partyId?: string;
  partySize?: number;
  partyMax?: number;
  joinSecret?: string;
  spectateSecret?: string;
  matchSecret?: string;
  buttonLabel?: string;
  buttonUrl?: string;
};

export type InstalledMod = {
  id: string;
  name: string;
  description: string;
  version: string;
  loader: string;
  category: string;
  enabled: boolean;
  filename: string;
  source: 'modrinth' | 'curseforge' | 'local';
  iconUrl?: string;
  projectUrl?: string;
  size?: number;
  installedAt?: number;
};

export type InstallModrinthPayload = {
  projectId: string;
  gameVersion: string;
  loader: string;
  name?: string;
  summary?: string;
  iconUrl?: string;
  projectUrl?: string;
  category?: string;
};

export type LaunchOptions = {
  version: string;
  loader: string;
  username?: string;
  memory?: number;
};

export type LaunchProgressData = {
  progress: number;
  status: string;
};

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      onWindowStateChange: (callback: (state: 'maximized' | 'restored') => void) => void;
      searchMods: (options: ModSearchOptions) => Promise<ModCatalogResult[]>;
      openModProject: (source: ModCatalogSource, projectUrl: string) => Promise<void>;
      hasCurseForgeKey: () => Promise<boolean>;
      getInstalledMods: () => Promise<InstalledMod[]>;
      installModrinthMod: (payload: InstallModrinthPayload) => Promise<InstalledMod[]>;
      toggleMod: (id: string, enabled: boolean) => Promise<InstalledMod[]>;
      uninstallMod: (id: string) => Promise<InstalledMod[]>;
      openModsFolder: () => Promise<void>;
      launchMinecraft: (options: LaunchOptions) => Promise<{ success: boolean }>;
      onLaunchProgress: (callback: (data: LaunchProgressData) => void) => () => void;
      getDiscordPresenceStatus: () => Promise<DiscordPresenceStatus>;
      configureDiscordPresence: (clientId: string) => Promise<DiscordPresenceStatus>;
      reconnectDiscordPresence: () => Promise<DiscordPresenceStatus>;
      updateDiscordActivity: (activity: DiscordActivityPayload) => Promise<DiscordPresenceStatus>;
      disableDiscordPresence: () => Promise<DiscordPresenceStatus>;
      onDiscordPresenceStatus: (callback: (status: DiscordPresenceStatus) => void) => () => void;
    };
  }
}

export {};
