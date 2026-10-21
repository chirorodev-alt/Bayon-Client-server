import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const DiscordRPC = require('discord-rpc');

let mainWindow;
let discordRpcClient = null;
let discordClientId = null;
let discordConfigPath = null;
const DEFAULT_DISCORD_CLIENT_ID = '1562436714117599323';
const launcherStartTime = Date.now();
let discordActivity = {
  page: '/home',
  details: undefined,
  state: undefined,
  username: undefined,
  version: undefined,
  loader: undefined,
  buttonLabel: 'Get Bayon Client',
  buttonUrl: 'https://github.com',
};
let discordPresenceStatus = {
  state: 'connecting',
  message: 'Connecting to the Discord desktop app.',
  configured: true,
};

const discordActivityLabels = {
  '/home': 'On the launcher home screen',
  '/play': 'Configuring a Minecraft session',
  '/mods': 'Browsing mods',
  '/skins': 'Customizing a skin',
  '/settings': 'Adjusting launcher settings',
  '/accounts': 'Managing launcher accounts',
  '/profiles': 'Managing game profiles',
  '/store': 'Browsing the client store',
};

const modrinthLoaderFacets = {
  Forge: 'forge',
  Fabric: 'fabric',
  Quilt: 'quilt',
  NeoForge: 'neoforge',
};

const curseForgeLoaderIds = {
  Forge: 1,
  Fabric: 4,
  Quilt: 5,
  NeoForge: 6,
};

function assertTrustedRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Untrusted renderer request.');
  }

  const senderUrl = event.senderFrame?.url ?? '';
  const isDevRenderer = senderUrl.startsWith('http://localhost:5173/');
  const isFileRenderer = senderUrl.startsWith('file://');
  if (!isDevRenderer && !isFileRenderer) {
    throw new Error('Renderer origin is not allowed.');
  }
}

function publishDiscordPresenceStatus(state, message, configured = Boolean(discordClientId)) {
  console.log(`[Discord RPC] Status: ${state} - ${message}`);
  discordPresenceStatus = { state, message, configured };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('discord:presence-status', discordPresenceStatus);
  }
  return discordPresenceStatus;
}

function getDiscordActivity() {
  const defaultState = discordActivityLabels[discordActivity.page] ?? discordActivityLabels['/home'];
  const state = (typeof discordActivity.state === 'string' && discordActivity.state.trim().length > 0)
    ? discordActivity.state.trim()
    : defaultState;

  const details = (typeof discordActivity.details === 'string' && discordActivity.details.trim().length > 0)
    ? discordActivity.details.trim()
    : (discordActivity.username ? `Playing as ${discordActivity.username}` : 'Using Bayon Client');

  const activity = {
    details,
    state,
    startTimestamp: typeof discordActivity.startTimestamp === 'number' ? discordActivity.startTimestamp : launcherStartTime,
    largeImageKey: discordActivity.largeImageKey || 'bayon_logo',
    largeImageText: discordActivity.largeImageText || 'Bayon Client',
  };

  if (typeof discordActivity.endTimestamp === 'number') {
    activity.endTimestamp = discordActivity.endTimestamp;
  }

  if (discordActivity.smallImageKey) {
    activity.smallImageKey = discordActivity.smallImageKey;
  } else if (discordActivity.version) {
    activity.smallImageKey = 'minecraft';
  }

  if (typeof discordActivity.smallImageText === 'string' && discordActivity.smallImageText.trim().length > 0) {
    activity.smallImageText = discordActivity.smallImageText.trim();
  } else if (discordActivity.version) {
    activity.smallImageText = `${discordActivity.loader ? `${discordActivity.loader} ` : ''}${discordActivity.version}`;
  }

  if (discordActivity.partyId && typeof discordActivity.partySize === 'number' && typeof discordActivity.partyMax === 'number') {
    activity.partyId = discordActivity.partyId;
    activity.partySize = discordActivity.partySize;
    activity.partyMax = discordActivity.partyMax;
  }

  if (discordActivity.joinSecret) {
    activity.joinSecret = discordActivity.joinSecret;
  }
  if (discordActivity.spectateSecret) {
    activity.spectateSecret = discordActivity.spectateSecret;
  }
  if (discordActivity.matchSecret) {
    activity.matchSecret = discordActivity.matchSecret;
  }

  if (!discordActivity.joinSecret) {
    const buttonUrl = discordActivity.buttonUrl || 'https://github.com';
    const buttonLabel = discordActivity.buttonLabel || 'Get Bayon Client';
    if (/^https?:\/\//i.test(buttonUrl)) {
      activity.buttons = [
        {
          label: buttonLabel.trim().slice(0, 32) || 'Get Bayon Client',
          url: buttonUrl.trim(),
        },
      ];
    }
  }

  return activity;
}

async function connectDiscordPresence(clientId) {
  discordClientId = clientId;
  if (discordRpcClient) {
    const previousClient = discordRpcClient;
    discordRpcClient = null;
    try {
      await previousClient.destroy();
    } catch {
      // A closed or unavailable Discord IPC socket needs no further cleanup.
    }
  }

  publishDiscordPresenceStatus('connecting', 'Connecting to the Discord desktop app.');
  const client = new DiscordRPC.Client({ transport: 'ipc' });
  discordRpcClient = client;
  client.on('ready', async () => {
    if (discordRpcClient !== client) return;
    try {
      await client.setActivity(getDiscordActivity());
      if (discordRpcClient === client) {
        publishDiscordPresenceStatus('connected', 'Bayon Client activity is visible on Discord.');
      }
    } catch (error) {
      console.error('[Discord RPC Activity Error]:', error);
      if (discordRpcClient === client) {
        publishDiscordPresenceStatus('error', `Could not publish Discord activity: ${error.message}`);
      }
    }
  });
  client.on('disconnected', () => {
    if (discordRpcClient === client) {
      discordRpcClient = null;
      publishDiscordPresenceStatus('discord-not-running', 'Discord disconnected. Open Discord and reconnect.', true);
    }
  });
  client.on('error', (error) => {
    if (discordRpcClient === client) {
      publishDiscordPresenceStatus('error', `Discord Rich Presence error: ${error.message}`);
    }
  });

  try {
    await client.login({ clientId });
  } catch {
    if (discordRpcClient === client) {
      discordRpcClient = null;
      publishDiscordPresenceStatus('discord-not-running', 'Could not connect. Make sure the Discord desktop app is open.', true);
    }
  }
  return discordPresenceStatus;
}

function loadDiscordClientId() {
  if (process.env.DISCORD_CLIENT_ID && /^\d{17,20}$/.test(process.env.DISCORD_CLIENT_ID.trim())) {
    return process.env.DISCORD_CLIENT_ID.trim();
  }
  if (discordConfigPath && existsSync(discordConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(discordConfigPath, 'utf8'));
      if (typeof config.clientId === 'string' && /^\d{17,20}$/.test(config.clientId)) {
        return config.clientId;
      }
      if (config.clientId === null) {
        return null;
      }
    } catch {
      // Fall through to default
    }
  }
  return DEFAULT_DISCORD_CLIENT_ID;
}

function validateSearchOptions(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid mod search options.');
  }
  const { source, query = '', gameVersion, loader } = input;
  if (!['modrinth', 'curseforge'].includes(source)) {
    throw new Error('Choose Modrinth or CurseForge.');
  }
  if (typeof query !== 'string' || query.trim().length > 100) {
    throw new Error('Search terms must be under 100 characters.');
  }
  if (typeof gameVersion !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(gameVersion)) {
    throw new Error('Choose a valid Minecraft version.');
  }
  if (!Object.hasOwn(modrinthLoaderFacets, loader)) {
    throw new Error('Choose a supported mod loader.');
  }
  return { source, query: query.trim(), gameVersion, loader };
}

function normalizeModrinthResult(item) {
  if (!item || typeof item.project_id !== 'string' || typeof item.title !== 'string') return null;
  return {
    id: item.project_id,
    source: 'modrinth',
    name: item.title,
    summary: typeof item.description === 'string' ? item.description : '',
    author: typeof item.author === 'string' ? item.author : 'Unknown',
    iconUrl: typeof item.icon_url === 'string' ? item.icon_url : undefined,
    downloads: Number.isFinite(item.downloads) ? item.downloads : 0,
    projectUrl: `https://modrinth.com/mod/${encodeURIComponent(item.slug ?? item.project_id)}`,
    categories: Array.isArray(item.categories) ? item.categories.filter((category) => typeof category === 'string') : [],
  };
}

function normalizeCurseForgeResult(item) {
  if (!item || !Number.isInteger(item.id) || typeof item.name !== 'string') return null;
  const author = Array.isArray(item.authors)
    ? item.authors.map((entry) => entry?.name).filter((name) => typeof name === 'string').join(', ')
    : '';
  return {
    id: String(item.id),
    source: 'curseforge',
    name: item.name,
    summary: typeof item.summary === 'string' ? item.summary : '',
    author: author || 'Unknown',
    iconUrl: typeof item.logo?.url === 'string' ? item.logo.url : undefined,
    downloads: Number.isFinite(item.downloadCount) ? item.downloadCount : 0,
    projectUrl: `https://www.curseforge.com/minecraft/mc-mods/${encodeURIComponent(item.slug ?? String(item.id))}`,
    categories: Array.isArray(item.categories) ? item.categories.map((category) => category?.name).filter((name) => typeof name === 'string') : [],
  };
}

async function searchModrinth(options) {
  const facets = [
    ['project_type:mod'],
    [`versions:${options.gameVersion}`],
    [`categories:${modrinthLoaderFacets[options.loader]}`],
  ];
  const url = new URL('https://api.modrinth.com/v2/search');
  if (options.query) {
    url.searchParams.set('query', options.query);
  }
  url.searchParams.set('facets', JSON.stringify(facets));
  url.searchParams.set('index', options.query ? 'relevance' : 'downloads');
  url.searchParams.set('limit', '25');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher mod search)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Modrinth search failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (!Array.isArray(payload?.hits)) throw new Error('Modrinth returned an invalid search response.');
  return payload.hits.map(normalizeModrinthResult).filter(Boolean);
}

async function searchCurseForge(options) {
  const apiKey = process.env.CURSEFORGE_API_KEY;
  if (!apiKey) {
    throw new Error('CurseForge needs CURSEFORGE_API_KEY set in the Electron process environment. The key is never sent to the renderer.');
  }

  const url = new URL('https://api.curseforge.com/v1/mods/search');
  url.searchParams.set('gameId', '432');
  url.searchParams.set('classId', '6');
  url.searchParams.set('searchFilter', options.query);
  url.searchParams.set('gameVersion', options.gameVersion);
  url.searchParams.set('modLoaderType', String(curseForgeLoaderIds[options.loader]));
  url.searchParams.set('pageSize', '20');
  url.searchParams.set('sortField', '2');
  url.searchParams.set('sortOrder', 'desc');
  const response = await fetch(url, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`CurseForge search failed (HTTP ${response.status}). Check the configured API key.`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('CurseForge returned an invalid search response.');
  return payload.data.map(normalizeCurseForgeResult).filter(Boolean);
}

let modsDir = null;
let modsConfigPath = null;

function getModsDir() {
  if (!modsDir) {
    modsDir = path.join(app.getPath('appData'), 'Bayon Client', 'minecraft', 'mods');
    if (!existsSync(modsDir)) {
      mkdirSync(modsDir, { recursive: true });
    }
  }
  return modsDir;
}

function getModsConfigPath() {
  if (!modsConfigPath) {
    modsConfigPath = path.join(app.getPath('userData'), 'installed-mods.json');
  }
  return modsConfigPath;
}

function readInstalledMods() {
  const configPath = getModsConfigPath();
  if (!existsSync(configPath)) {
    return [];
  }
  try {
    const data = JSON.parse(readFileSync(configPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeInstalledMods(mods) {
  const configPath = getModsConfigPath();
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(mods, null, 2), 'utf8');
}

async function installModrinthMod({ projectId, gameVersion, loader, name, summary, iconUrl, projectUrl, category }) {
  const targetDir = getModsDir();

  const loaderFacet = modrinthLoaderFacets[loader] || (typeof loader === 'string' ? loader.toLowerCase() : 'fabric');
  let url = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?loaders=["${encodeURIComponent(loaderFacet)}"]&game_versions=["${encodeURIComponent(gameVersion)}"]`;

  let response = await fetch(url, {
    headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher mod manager)' },
    signal: AbortSignal.timeout(15000),
  });

  let versions = [];
  if (response.ok) {
    versions = await response.json();
  }

  if (!Array.isArray(versions) || versions.length === 0) {
    url = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version?loaders=["${encodeURIComponent(loaderFacet)}"]`;
    response = await fetch(url, {
      headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher mod manager)' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      versions = await response.json();
    }
  }

  if (!Array.isArray(versions) || versions.length === 0) {
    url = `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`;
    response = await fetch(url, {
      headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher mod manager)' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      versions = await response.json();
    }
  }

  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error('No compatible releases found on Modrinth for this mod.');
  }

  const selectedVersion = versions[0];
  const targetFile = selectedVersion.files?.find((f) => f.primary) || selectedVersion.files?.[0];
  if (!targetFile || !targetFile.url) {
    throw new Error('No downloadable file found in this Modrinth release.');
  }

  const fileResponse = await fetch(targetFile.url, {
    headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher mod downloader)' },
    signal: AbortSignal.timeout(60000),
  });

  if (!fileResponse.ok) {
    throw new Error(`Failed to download mod file (HTTP ${fileResponse.status}).`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const rawFilename = targetFile.filename || `${projectId}.jar`;
  const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._+-]/g, '_');
  const filePath = path.join(targetDir, safeFilename);

  writeFileSync(filePath, buffer);

  const currentMods = readInstalledMods();
  const existingIndex = currentMods.findIndex((m) => m.id === projectId || m.filename === safeFilename);

  const newMod = {
    id: projectId,
    name: name || selectedVersion.name || projectId,
    description: summary || '',
    version: selectedVersion.version_number || gameVersion,
    loader: loader || 'Fabric',
    category: category || 'Utility',
    enabled: true,
    filename: safeFilename,
    source: 'modrinth',
    iconUrl,
    projectUrl,
    size: buffer.length,
    installedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    currentMods[existingIndex] = newMod;
  } else {
    currentMods.unshift(newMod);
  }

  writeInstalledMods(currentMods);
  return currentMods;
}

function toggleMod(modId, enabled) {
  const targetDir = getModsDir();
  const currentMods = readInstalledMods();
  const mod = currentMods.find((m) => m.id === modId);
  if (!mod) {
    throw new Error('Mod not found.');
  }

  const baseFilename = mod.filename.endsWith('.disabled')
    ? mod.filename.slice(0, -9)
    : mod.filename;

  const currentPath = path.join(targetDir, mod.filename);
  const newFilename = enabled ? baseFilename : `${baseFilename}.disabled`;
  const newPath = path.join(targetDir, newFilename);

  if (existsSync(currentPath)) {
    try {
      renameSync(currentPath, newPath);
    } catch {
      // Ignored
    }
  }

  mod.enabled = enabled;
  mod.filename = newFilename;

  writeInstalledMods(currentMods);
  return currentMods;
}

function uninstallMod(modId) {
  const targetDir = getModsDir();
  const currentMods = readInstalledMods();
  const modIndex = currentMods.findIndex((m) => m.id === modId);
  if (modIndex < 0) {
    return currentMods;
  }

  const mod = currentMods[modIndex];
  const filePath = path.join(targetDir, mod.filename);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // Ignored
    }
  }

  currentMods.splice(modIndex, 1);
  writeInstalledMods(currentMods);
  return currentMods;
}

async function openModsFolder() {
  const targetDir = getModsDir();
  await shell.openPath(targetDir);
}

function sendWindowState() {
  if (!mainWindow) {
    return;
  }

  const state = mainWindow.isMaximized() ? 'maximized' : 'restored';
  mainWindow.webContents.send('window:state-change', state);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    frame: false,
    backgroundColor: '#080808',
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'bayon-icon.ico' : 'bayon-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  const distHtmlPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (app.isPackaged || process.argv.includes('--prod')) {
    mainWindow.loadFile(distHtmlPath);
  } else {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      if (existsSync(distHtmlPath)) {
        mainWindow.loadFile(distHtmlPath);
      }
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('restore', sendWindowState);
  mainWindow.webContents.on('did-finish-load', () => {
    sendWindowState();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('discord:presence-status', discordPresenceStatus);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  sendWindowState();
}

app.whenReady().then(() => {
  discordConfigPath = path.join(app.getPath('userData'), 'discord-presence.json');

  ipcMain.handle('discord:presence-status', (event) => {
    assertTrustedRenderer(event);
    return discordPresenceStatus;
  });

  ipcMain.handle('discord:configure-presence', async (event, clientId) => {
    assertTrustedRenderer(event);
    if (typeof clientId !== 'string' || !/^\d{17,20}$/.test(clientId)) {
      throw new Error('Enter a valid 17–20 digit Discord Application ID.');
    }
    mkdirSync(path.dirname(discordConfigPath), { recursive: true });
    writeFileSync(discordConfigPath, JSON.stringify({ clientId }), 'utf8');
    return connectDiscordPresence(clientId);
  });

  ipcMain.handle('discord:reconnect-presence', async (event) => {
    assertTrustedRenderer(event);
    const clientId = discordClientId || loadDiscordClientId();
    if (!clientId) {
      throw new Error('Configure a Discord Application ID first.');
    }
    return connectDiscordPresence(clientId);
  });

  ipcMain.handle('discord:update-activity', async (event, input) => {
    assertTrustedRenderer(event);
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid Bayon Client activity.');
    }
    const page = (typeof input.page === 'string' && Object.hasOwn(discordActivityLabels, input.page))
      ? input.page
      : (discordActivity.page || '/home');

    discordActivity = {
      ...discordActivity,
      ...input,
      page,
    };
    if (discordRpcClient && discordPresenceStatus.state === 'connected') {
      try {
        await discordRpcClient.setActivity(getDiscordActivity());
      } catch (error) {
        publishDiscordPresenceStatus('error', `Could not update Discord activity: ${error.message}`);
      }
    }
    return discordPresenceStatus;
  });

  ipcMain.handle('discord:disable-presence', async (event) => {
    assertTrustedRenderer(event);
    discordClientId = null;
    if (discordConfigPath && existsSync(discordConfigPath)) {
      writeFileSync(discordConfigPath, JSON.stringify({ clientId: null }), 'utf8');
    }
    const client = discordRpcClient;
    discordRpcClient = null;
    if (client) await client.destroy();
    return publishDiscordPresenceStatus('not-configured', 'Discord Rich Presence is turned off.', false);
  });

  ipcMain.handle('mods:search', async (event, input) => {
    assertTrustedRenderer(event);
    const options = validateSearchOptions(input);
    return options.source === 'modrinth' ? searchModrinth(options) : searchCurseForge(options);
  });

  ipcMain.handle('mods:open-project', async (event, source, projectUrl) => {
    assertTrustedRenderer(event);
    if (!['modrinth', 'curseforge'].includes(source) || typeof projectUrl !== 'string') {
      throw new Error('Invalid mod project link.');
    }
    let url;
    try {
      url = new URL(projectUrl);
    } catch {
      throw new Error('Invalid mod project link.');
    }
    const isModrinth = source === 'modrinth'
      && url.protocol === 'https:'
      && url.hostname === 'modrinth.com'
      && /^\/mod\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname);
    const isCurseForge = source === 'curseforge'
      && url.protocol === 'https:'
      && url.hostname === 'www.curseforge.com'
      && /^\/minecraft\/mc-mods\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname);
    if ((!isModrinth && !isCurseForge) || url.search || url.hash) {
      throw new Error('Mod project links must use the official Modrinth or CurseForge project page.');
    }
    await shell.openExternal(url.toString());
  });

  ipcMain.handle('mods:curseforge-key-available', (event) => {
    assertTrustedRenderer(event);
    return Boolean(process.env.CURSEFORGE_API_KEY);
  });

  ipcMain.handle('mods:get-installed', (event) => {
    assertTrustedRenderer(event);
    return readInstalledMods();
  });

  ipcMain.handle('mods:install-modrinth', async (event, payload) => {
    assertTrustedRenderer(event);
    if (!payload || typeof payload !== 'object' || !payload.projectId) {
      throw new Error('Invalid mod install request.');
    }
    return installModrinthMod(payload);
  });

  ipcMain.handle('mods:toggle', (event, modId, enabled) => {
    assertTrustedRenderer(event);
    if (typeof modId !== 'string') throw new Error('Invalid mod ID.');
    return toggleMod(modId, Boolean(enabled));
  });

  ipcMain.handle('mods:uninstall', (event, modId) => {
    assertTrustedRenderer(event);
    if (typeof modId !== 'string') throw new Error('Invalid mod ID.');
    return uninstallMod(modId);
  });

  ipcMain.handle('mods:open-folder', async (event) => {
    assertTrustedRenderer(event);
    return openModsFolder();
  });

  // ── Minecraft Launch ────────────────────────────────────────────────────────
  ipcMain.handle('minecraft:launch', async (event, input) => {
    assertTrustedRenderer(event);

    const { version = '1.21.1', loader = 'Fabric', username = 'Player', memory = 4 } = input ?? {};

    const emit = (progress, status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('launch:progress', { progress, status });
      }
    };

    try {
      const { Client, Authenticator } = require('minecraft-launcher-core');
      const https = require('node:https');
      const fs = require('node:fs');

      const mcRoot = path.join(app.getPath('appData'), 'Bayon Client', 'minecraft');

      // Helper: simple HTTPS GET → JSON
      const fetchJson = (url) => new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'BayonClient/1.0' } }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error(`JSON parse error from ${url}: ${e.message}`)); }
          });
        }).on('error', reject);
      });

      const launchVersion = { number: version, type: 'release' };

      if (loader === 'Fabric') {
        emit(10, 'Fetching Fabric loader versions…');
        const loaderList = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}`);
        if (!Array.isArray(loaderList) || loaderList.length === 0) {
          throw new Error(`No Fabric loader found for Minecraft ${version}.`);
        }
        const loaderVersion = loaderList[0].loader.version;
        const profileId = `fabric-loader-${loaderVersion}-${version}`;

        emit(25, `Installing Fabric ${loaderVersion} for ${version}…`);
        const profileDir = path.join(mcRoot, 'versions', profileId);
        const profileJsonPath = path.join(profileDir, `${profileId}.json`);

        if (!fs.existsSync(profileJsonPath)) {
          fs.mkdirSync(profileDir, { recursive: true });
          const profileJson = await fetchJson(
            `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loaderVersion)}/profile/json`
          );
          fs.writeFileSync(profileJsonPath, JSON.stringify(profileJson, null, 2), 'utf8');
        }

        launchVersion.custom = profileId;
        emit(40, 'Fabric profile ready.');
      }

      emit(50, 'Starting Minecraft…');

      const launcher = new Client();

      let dataProgress = 50;
      launcher.on('debug', (msg) => {
        const m = String(msg);
        if (m.includes('Downloading') || m.includes('download')) {
          dataProgress = Math.min(dataProgress + 1, 88);
          emit(dataProgress, m.slice(0, 80));
        }
      });

      launcher.on('data', (msg) => {
        // Minecraft stdout — game is running
        emit(100, `Game running: ${String(msg).slice(0, 60)}`);
      });

      launcher.on('close', (code) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch:progress', { progress: 0, status: `Game closed (exit ${code}).` });
        }
      });

      const auth = Authenticator.getAuth(username || 'Player');

      await launcher.launch({
        authorization: auth,
        root: mcRoot,
        version: launchVersion,
        memory: { max: `${memory}G`, min: '2G' },
        javaPath: 'java',
      });

      emit(95, 'Game process started!');
      return { success: true };
    } catch (err) {
      emit(0, `Launch failed: ${err.message}`);
      throw err;
    }
  });

  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  createWindow();
  try {
    const savedDiscordClientId = loadDiscordClientId();
    if (savedDiscordClientId) void connectDiscordPresence(savedDiscordClientId);
  } catch (error) {
    publishDiscordPresenceStatus('error', error.message, true);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
