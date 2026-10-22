import type { ModCatalogResult, ModCatalogSource, ModSearchOptions, ModrinthProjectType } from '../services/modCatalog';

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
  projectType?: ModrinthProjectType;
  worldName?: string;
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
  profileId?: string;
  projectType?: ModrinthProjectType;
  worldName?: string;
};

export type LaunchOptions = {
  version: string;
  loader: string;
  profileName?: string;
  username?: string;
  memory?: number;
  profileId?: string;
  javaPath?: string;
  customArgs?: string;
};

export type ManagedJavaRuntime = {
  major: number;
  kind: 'JRE' | 'JDK';
  installed: boolean;
  javaPath?: string;
  packageVersion?: string;
  systemJavaPath?: string;
  systemPackageVersion?: string;
};

export type JavaRuntimeProgress = {
  major: number;
  progress: number;
  status: string;
};

export type ClientDirectories = {
  gameDataDirectory: string;
  installDirectory: string;
  configurationDirectory: string;
  javaDirectory: string;
  logsDirectory: string;
};

export type JavaTestResult = { success: boolean; javaPath: string; output: string };

export type AppUpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  message?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  checkedAt?: number;
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
      getMinecraftVersions: () => Promise<string[]>;
      getMinecraftWorlds: (profileId: string) => Promise<string[]>;
      getManagedJavaRuntimes: (preferredJavaPath?: string) => Promise<ManagedJavaRuntime[]>;
      installManagedJavaRuntime: (major: number) => Promise<ManagedJavaRuntime[]>;
      selectJavaExecutable: () => Promise<string | null>;
      getClientDirectories: () => Promise<ClientDirectories>;
      openClientDirectory: (key: 'gameData' | 'install' | 'configuration' | 'java' | 'logs') => Promise<boolean>;
      chooseGameDataDirectory: () => Promise<ClientDirectories | null>;
      testJavaRuntime: (payload: { javaPath: string; gameVersion: string }) => Promise<JavaTestResult>;
      createDiagnosticReport: () => Promise<{ path: string }>;
      clearClientData: () => Promise<{ success: boolean }>;
      getAppUpdateState: () => Promise<AppUpdateState>;
      checkForAppUpdate: () => Promise<AppUpdateState>;
      installAppUpdate: () => Promise<boolean>;
      startGoogleOAuth: (clientId: string) => Promise<{ code: string; codeVerifier: string; redirectUri: string }>;
      onAppUpdateState: (callback: (state: AppUpdateState) => void) => () => void;
      onJavaRuntimeProgress: (callback: (data: JavaRuntimeProgress) => void) => () => void;
      openModProject: (source: ModCatalogSource, projectUrl: string) => Promise<void>;
      hasCurseForgeKey: () => Promise<boolean>;
      getInstalledMods: (profileId?: string) => Promise<InstalledMod[]>;
      installModrinthMod: (payload: InstallModrinthPayload) => Promise<InstalledMod[]>;
      toggleMod: (id: string, enabled: boolean, profileId?: string) => Promise<InstalledMod[]>;
      uninstallMod: (id: string, profileId?: string) => Promise<InstalledMod[]>;
      openModsFolder: (profileId?: string, projectType?: ModrinthProjectType) => Promise<void>;
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
