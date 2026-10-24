const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setLaunchOnStartup: (enabled) => ipcRenderer.invoke('settings:set-launch-on-startup', enabled),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('settings:set-minimize-to-tray', enabled),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window:state-change', (_event, state) => callback(state));
  },
  searchMods: (options) => ipcRenderer.invoke('mods:search', options),
  getModrinthCategories: (projectType) => ipcRenderer.invoke('mods:get-modrinth-categories', projectType),
  getMinecraftVersions: () => ipcRenderer.invoke('minecraft:get-versions'),
  getMinecraftWorlds: (profileId) => ipcRenderer.invoke('minecraft:get-worlds', profileId),
  getManagedJavaRuntimes: (preferredJavaPath) => ipcRenderer.invoke('java:get-runtimes', preferredJavaPath),
  installManagedJavaRuntime: (major) => ipcRenderer.invoke('java:install-runtime', major),
  selectJavaExecutable: () => ipcRenderer.invoke('java:select-path'),
  getClientDirectories: () => ipcRenderer.invoke('directories:get'),
  openClientDirectory: (key) => ipcRenderer.invoke('directories:open', key),
  chooseGameDataDirectory: () => ipcRenderer.invoke('directories:choose-game-data'),
  testJavaRuntime: (payload) => ipcRenderer.invoke('recovery:test-java', payload),
  createDiagnosticReport: () => ipcRenderer.invoke('recovery:create-diagnostic'),
  clearClientData: () => ipcRenderer.invoke('recovery:clear-data'),
  getAppUpdateState: () => ipcRenderer.invoke('app-update:get-state'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForAppUpdate: () => ipcRenderer.invoke('app-update:check'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  startGoogleOAuth: (clientId) => ipcRenderer.invoke('auth:google-start', clientId),
  startMicrosoftOAuth: (clientId) => ipcRenderer.invoke('auth:microsoft-start', clientId),
  signInMinecraftMicrosoft: (clientId) => ipcRenderer.invoke('minecraft:auth-sign-in', clientId),
  cancelMinecraftMicrosoftSignIn: () => ipcRenderer.invoke('minecraft:auth-cancel'),
  removeMinecraftMicrosoftAccount: (profileId) => ipcRenderer.invoke('minecraft:auth-remove', profileId),
  onAppUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('app-update:state', listener);
    return () => ipcRenderer.removeListener('app-update:state', listener);
  },
  onJavaRuntimeProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('java:runtime-progress', listener);
    return () => ipcRenderer.removeListener('java:runtime-progress', listener);
  },
  openModProject: (source, projectUrl) => ipcRenderer.invoke('mods:open-project', source, projectUrl),
  hasCurseForgeKey: () => ipcRenderer.invoke('mods:curseforge-key-available'),
  getInstalledMods: (profileId) => ipcRenderer.invoke('mods:get-installed', profileId),
  getBayonModStatus: (profileId) => ipcRenderer.invoke('mods:bayon-status', profileId),
  installBayonMod: (profileId) => ipcRenderer.invoke('mods:bayon-install', profileId),
  uninstallBayonMod: (profileId) => ipcRenderer.invoke('mods:bayon-uninstall', profileId),
  installModrinthMod: (payload) => ipcRenderer.invoke('mods:install-modrinth', payload),
  checkModrinthModUpdate: (payload) => ipcRenderer.invoke('mods:check-modrinth-update', payload),
  toggleMod: (id, enabled, profileId) => ipcRenderer.invoke('mods:toggle', id, enabled, profileId),
  uninstallMod: (id, profileId) => ipcRenderer.invoke('mods:uninstall', id, profileId),
  openModsFolder: (profileId, projectType) => ipcRenderer.invoke('mods:open-folder', profileId, projectType),
  launchMinecraft: (options) => ipcRenderer.invoke('minecraft:launch', options),
  isMinecraftRunning: () => ipcRenderer.invoke('minecraft:is-running'),
  stopMinecraft: () => ipcRenderer.invoke('minecraft:stop'),
  onLaunchProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('launch:progress', listener);
    return () => ipcRenderer.removeListener('launch:progress', listener);
  },
  getDiscordPresenceStatus: () => ipcRenderer.invoke('discord:presence-status'),
  getDiscordPresenceConfig: () => ipcRenderer.invoke('discord:presence-config'),
  configureDiscordPresence: () => ipcRenderer.invoke('discord:configure-presence'),
  reconnectDiscordPresence: () => ipcRenderer.invoke('discord:reconnect-presence'),
  updateDiscordActivity: (activity) => ipcRenderer.invoke('discord:update-activity', activity),
  disableDiscordPresence: () => ipcRenderer.invoke('discord:disable-presence'),
  onDiscordPresenceStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('discord:presence-status', listener);
    return () => ipcRenderer.removeListener('discord:presence-status', listener);
  },
});
