const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window:state-change', (_event, state) => callback(state));
  },
  searchMods: (options) => ipcRenderer.invoke('mods:search', options),
  openModProject: (source, projectUrl) => ipcRenderer.invoke('mods:open-project', source, projectUrl),
  hasCurseForgeKey: () => ipcRenderer.invoke('mods:curseforge-key-available'),
  getInstalledMods: () => ipcRenderer.invoke('mods:get-installed'),
  installModrinthMod: (payload) => ipcRenderer.invoke('mods:install-modrinth', payload),
  toggleMod: (id, enabled) => ipcRenderer.invoke('mods:toggle', id, enabled),
  uninstallMod: (id) => ipcRenderer.invoke('mods:uninstall', id),
  openModsFolder: () => ipcRenderer.invoke('mods:open-folder'),
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
