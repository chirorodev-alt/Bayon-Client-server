const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window:state-change', (_event, state) => callback(state));
  },
  searchMods: (options) => ipcRenderer.invoke('mods:search', options),
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
  checkForAppUpdate: () => ipcRenderer.invoke('app-update:check'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
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
  installModrinthMod: (payload) => ipcRenderer.invoke('mods:install-modrinth', payload),
  toggleMod: (id, enabled, profileId) => ipcRenderer.invoke('mods:toggle', id, enabled, profileId),
  uninstallMod: (id, profileId) => ipcRenderer.invoke('mods:uninstall', id, profileId),
  openModsFolder: (profileId, projectType) => ipcRenderer.invoke('mods:open-folder', profileId, projectType),
  launchMinecraft: (options) => ipcRenderer.invoke('minecraft:launch', options),
  onLaunchProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('launch:progress', listener);
    return () => ipcRenderer.removeListener('launch:progress', listener);
  },
  getDiscordPresenceStatus: () => ipcRenderer.invoke('discord:presence-status'),
  configureDiscordPresence: (clientId) => ipcRenderer.invoke('discord:configure-presence', clientId),
  reconnectDiscordPresence: () => ipcRenderer.invoke('discord:reconnect-presence'),
  updateDiscordActivity: (activity) => ipcRenderer.invoke('discord:update-activity', activity),
  disableDiscordPresence: () => ipcRenderer.invoke('discord:disable-presence'),
  onDiscordPresenceStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('discord:presence-status', listener);
    return () => ipcRenderer.removeListener('discord:presence-status', listener);
  },
});
