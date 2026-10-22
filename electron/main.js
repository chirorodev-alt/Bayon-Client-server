import { createRequire } from 'node:module';
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const DiscordRPC = require('discord-rpc');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let consoleWindow = null;
const gameConsoleBuffer = [];
let nextConsoleLogId = 1;
let appUpdateState = { status: 'idle' };
let appUpdateVersion = '';
let discordRpcClient = null;
let discordReconnectTimer = null;
let appQuitting = false;
let discordClientId = null;
let discordConfigPath = null;
let customMinecraftDataRoot = null;
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

const modrinthProjectTypes = ['mod', 'modpack', 'resourcepack', 'shader', 'datapack'];

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

function startGoogleOAuth(clientId) {
  if (typeof clientId !== 'string' || clientId.length > 512 || !clientId.endsWith('.apps.googleusercontent.com')) {
    return Promise.reject(new Error('Google OAuth client ID is invalid.'));
  }
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      if (error) reject(error);
      else resolve(result);
    };
    const server = http.createServer((request, response) => {
      const callbackUrl = new URL(request.url || '/', 'http://127.0.0.1');
      if (callbackUrl.pathname !== '/oauth2callback') {
        response.writeHead(404).end('Not found');
        return;
      }
      const receivedState = callbackUrl.searchParams.get('state') || '';
      const expectedState = Buffer.from(state);
      const actualState = Buffer.from(receivedState);
      if (actualState.length !== expectedState.length || !timingSafeEqual(actualState, expectedState)) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Bayon Client sign-in failed</h2><p>State verification failed. You can close this tab.</p>');
        finish(new Error('Google sign-in state verification failed.'));
        return;
      }
      const error = callbackUrl.searchParams.get('error');
      const code = callbackUrl.searchParams.get('code');
      if (error || !code) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Bayon Client sign-in cancelled</h2><p>You can close this tab and return to the client.</p>');
        finish(new Error(error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google did not return an authorization code.'));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Google account connected</h2><p>You can close this tab and return to Bayon Client.</p>');
      finish(null, { code, codeVerifier: verifier, redirectUri });
    });

    server.once('error', (error) => finish(error));
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') return finish(new Error('Could not start the local sign-in callback.'));
      const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      timeout = setTimeout(() => finish(new Error('Google sign-in timed out. Please try again.')), 4 * 60 * 1000);
      timeout.unref?.();
      try {
        await shell.openExternal(authUrl.toString());
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Could not open your browser for Google sign-in.'));
      }
    });
  });
}

function startMicrosoftOAuth(clientId) {
  if (typeof clientId !== 'string' || clientId.length < 10 || clientId.length > 128) {
    return Promise.reject(new Error('Microsoft OAuth client ID is invalid.'));
  }
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    let callbackServer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callbackServer?.close();
      if (error) reject(error);
      else resolve(result);
    };
    callbackServer = http.createServer((request, response) => {
      const callbackUrl = new URL(request.url || '/', 'http://127.0.0.1');
      if (callbackUrl.pathname !== '/') {
        response.writeHead(404).end('Not found');
        return;
      }
      const receivedState = callbackUrl.searchParams.get('state') || '';
      const expectedState = Buffer.from(state);
      const actualState = Buffer.from(receivedState);
      if (actualState.length !== expectedState.length || !timingSafeEqual(actualState, expectedState)) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Bayon sign-in failed</h2><p>State verification failed. You can close this tab.</p>');
        finish(new Error('Microsoft sign-in state verification failed.'));
        return;
      }
      const error = callbackUrl.searchParams.get('error');
      const code = callbackUrl.searchParams.get('code');
      if (error || !code) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Bayon sign-in canceled</h2><p>You can close this tab and return to the client.</p>');
        finish(new Error(error === 'access_denied' ? 'Microsoft sign-in was canceled.' : 'Microsoft did not return an authorization code.'));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>Microsoft account connected</h2><p>You can close this tab and return to Bayon Client.</p>');
      finish(null, { code, codeVerifier: verifier, redirectUri });
    });

    callbackServer.once('error', (error) => finish(error));
    callbackServer.listen(0, 'localhost', async () => {
      const address = callbackServer.address();
      if (!address || typeof address === 'string') return finish(new Error('Could not start the local Microsoft sign-in callback.'));
      const redirectUri = `http://localhost:${address.port}`;
      const authUrl = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope: 'openid profile email User.Read',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      timeout = setTimeout(() => finish(new Error('Microsoft sign-in timed out. Please try again.')), 4 * 60 * 1000);
      timeout.unref?.();
      try {
        await shell.openExternal(authUrl.toString());
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Could not open your browser for Microsoft sign-in.'));
      }
    });
  });
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
    instance: true,
  };

  if (discordActivity.largeImageKey) activity.largeImageKey = discordActivity.largeImageKey;
  if (discordActivity.largeImageText && discordActivity.largeImageKey) activity.largeImageText = discordActivity.largeImageText;

  if (typeof discordActivity.endTimestamp === 'number') {
    activity.endTimestamp = discordActivity.endTimestamp;
  }

  if (discordActivity.smallImageKey) {
    activity.smallImageKey = discordActivity.smallImageKey;
  }

  if (typeof discordActivity.smallImageText === 'string' && discordActivity.smallImageText.trim().length > 0) {
    activity.smallImageText = discordActivity.smallImageText.trim();
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
  if (discordReconnectTimer) {
    clearTimeout(discordReconnectTimer);
    discordReconnectTimer = null;
  }
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
        discordRpcClient = null;
        publishDiscordPresenceStatus('error', `Could not publish Discord activity: ${error.message}`);
        void client.destroy().catch(() => {});
        scheduleDiscordReconnect(clientId);
      }
    }
  });
  client.on('disconnected', () => {
    if (discordRpcClient === client) {
      discordRpcClient = null;
      publishDiscordPresenceStatus('discord-not-running', 'Discord disconnected. Open Discord and reconnect.', true);
      scheduleDiscordReconnect(clientId);
    }
  });
  client.on('error', (error) => {
    if (discordRpcClient === client) {
      discordRpcClient = null;
      publishDiscordPresenceStatus('error', `Discord Rich Presence error: ${error.message}`);
      void client.destroy().catch(() => {});
      scheduleDiscordReconnect(clientId);
    }
  });

  try {
    await client.login({ clientId });
  } catch (error) {
    if (discordRpcClient === client) {
      discordRpcClient = null;
      const message = error instanceof Error ? error.message : 'Unknown Discord RPC error.';
      console.warn(`[Discord RPC] Connection failed: ${message}`);
      publishDiscordPresenceStatus('discord-not-running', `Could not connect to Discord (${message}). Keep the desktop app open; Bayon will retry.`, true);
      scheduleDiscordReconnect(clientId);
    }
  }
  return discordPresenceStatus;
}

function scheduleDiscordReconnect(clientId) {
  if (discordReconnectTimer || !clientId || discordClientId !== clientId || appQuitting) return;
  discordReconnectTimer = setTimeout(() => {
    discordReconnectTimer = null;
    if (discordClientId === clientId && !discordRpcClient) void connectDiscordPresence(clientId);
  }, 15000);
  discordReconnectTimer.unref?.();
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
  const { source, query = '', gameVersion, loader, projectType = 'mod', offset = 0 } = input;
  if (!['modrinth', 'curseforge'].includes(source)) {
    throw new Error('Choose Modrinth or CurseForge.');
  }
  if (typeof query !== 'string' || query.trim().length > 100) {
    throw new Error('Search terms must be under 100 characters.');
  }
  if (typeof gameVersion !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(gameVersion)) {
    throw new Error('Choose a valid Minecraft version.');
  }
  if (!modrinthProjectTypes.includes(projectType)) throw new Error('Choose a supported Modrinth content type.');
  if (source === 'curseforge' && projectType !== 'mod') throw new Error('CurseForge search is available for mods only.');
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('Choose a valid catalog page.');
  if (!Object.hasOwn(modrinthLoaderFacets, loader)) {
    throw new Error('Choose a supported mod loader.');
  }
  return { source, query: query.trim(), gameVersion, loader, projectType, offset };
}

function normalizeModrinthResult(item, projectType = 'mod') {
  if (!item || typeof item.project_id !== 'string' || typeof item.title !== 'string') return null;
  return {
    id: item.project_id,
    source: 'modrinth',
    name: item.title,
    summary: typeof item.description === 'string' ? item.description : '',
    author: typeof item.author === 'string' ? item.author : 'Unknown',
    iconUrl: typeof item.icon_url === 'string' ? item.icon_url : undefined,
    downloads: Number.isFinite(item.downloads) ? item.downloads : 0,
    projectUrl: `https://modrinth.com/${projectType}/${encodeURIComponent(item.slug ?? item.project_id)}`,
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
    [`project_type:${options.projectType}`],
    [`versions:${options.gameVersion}`],
  ];
  if (options.projectType === 'mod' || options.projectType === 'modpack') {
    facets.push([`categories:${modrinthLoaderFacets[options.loader]}`]);
  }
  const url = new URL('https://api.modrinth.com/v2/search');
  if (options.query) {
    url.searchParams.set('query', options.query);
  }
  url.searchParams.set('facets', JSON.stringify(facets));
  url.searchParams.set('index', options.query ? 'relevance' : 'downloads');
  url.searchParams.set('limit', '25');
  url.searchParams.set('offset', String(options.offset));
  const response = await fetch(url, {
    headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher mod search)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Modrinth search failed (HTTP ${response.status}).`);
  const payload = await response.json();
  if (!Array.isArray(payload?.hits)) throw new Error('Modrinth returned an invalid search response.');
  return payload.hits.map((item) => normalizeModrinthResult(item, options.projectType)).filter(Boolean);
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
  url.searchParams.set('index', String(options.offset));
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

function normalizeProfileId(profileId) {
  return typeof profileId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(profileId) ? profileId : 'default';
}

function getDefaultMinecraftDataRoot() {
  return path.join(app.getPath('appData'), '.bayonclient');
}

function getMinecraftDataRoot() {
  return customMinecraftDataRoot || getDefaultMinecraftDataRoot();
}

function loadConfiguredDirectories() {
  const configPath = path.join(app.getPath('userData'), 'launcher-paths.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof config.gameDataDirectory === 'string' && path.isAbsolute(config.gameDataDirectory)) {
      customMinecraftDataRoot = path.resolve(config.gameDataDirectory);
    }
  } catch {
    customMinecraftDataRoot = null;
  }

  // Keep existing installs when upgrading from the launcher's previous default location.
  const legacyRoot = path.join(app.getPath('appData'), 'Bayon Client', 'minecraft');
  const newRoot = getDefaultMinecraftDataRoot();
  if (!customMinecraftDataRoot && !existsSync(newRoot) && existsSync(legacyRoot)) {
    try { renameSync(legacyRoot, newRoot); } catch (error) { console.warn('Could not migrate the previous Minecraft data directory:', error?.message || error); }
  }
}

function saveConfiguredDirectories() {
  const configPath = path.join(app.getPath('userData'), 'launcher-paths.json');
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ gameDataDirectory: customMinecraftDataRoot }, null, 2), 'utf8');
}

function getProfileGameDir(profileId) {
  return path.join(getMinecraftDataRoot(), 'profiles', normalizeProfileId(profileId));
}

function getContentDir(profileId, projectType = 'mod', worldName) {
  const gameDir = getProfileGameDir(profileId);
  const directoryNames = { mod: 'mods', modpack: 'modpacks', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'data-packs' };
  let targetDir = path.join(gameDir, directoryNames[projectType] || 'mods');
  if (projectType === 'datapack' && typeof worldName === 'string' && /^[a-zA-Z0-9 _.-]{1,100}$/.test(worldName)) {
    const worldDir = path.join(gameDir, 'saves', worldName);
    if (existsSync(worldDir)) targetDir = path.join(worldDir, 'datapacks');
  }
  mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

function getModsDir(profileId) {
  return getContentDir(profileId, 'mod');
}

function getModsConfigPath(profileId) {
  return path.join(app.getPath('userData'), `installed-mods-${normalizeProfileId(profileId)}.json`);
}

const BAYON_MOD_FILENAME = 'bayonclient-client.jar';

function getBayonModBundle() {
  const bundledDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'bayon-mod')
    : path.join(__dirname, '..', 'fabric-mod', 'dist');
  const jarPath = path.join(bundledDirectory, 'bayonclient.jar');
  const metadataPath = path.join(bundledDirectory, 'bayonclient.json');
  if (!existsSync(jarPath) || !existsSync(metadataPath)) {
    throw new Error('Bayon Client Fabric mod is not built yet. Run `gradlew.bat build` in the fabric-mod folder first.');
  }
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  return { jarPath, version: String(metadata.version || 'unknown'), gameVersion: String(metadata.minecraftVersion || '26.2') };
}

function getBayonModManifestPath(profileId) {
  return path.join(getProfileGameDir(profileId), '.bayonclient-managed-mod.json');
}

function getBayonModStatus(profileId) {
  let bundle;
  try { bundle = getBayonModBundle(); } catch (error) {
    return { available: false, installed: false, version: null, error: error.message };
  }
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(getBayonModManifestPath(profileId), 'utf8')); } catch {}
  const modsDir = getModsDir(profileId);
  const installedPath = manifest?.filename ? path.join(modsDir, path.basename(manifest.filename)) : '';
  const installed = Boolean(installedPath && existsSync(installedPath) && manifest?.sha256 === createHash('sha256').update(readFileSync(installedPath)).digest('hex'));
  return {
    available: true,
    installed,
    version: bundle.version,
    gameVersion: bundle.gameVersion,
    installedVersion: installed ? manifest.version : null,
    filename: installed ? manifest.filename : null,
  };
}

function installBayonMod(profileId) {
  const safeProfileId = normalizeProfileId(profileId);
  const bundle = getBayonModBundle();
  const modsDir = getModsDir(safeProfileId);
  const manifestPath = getBayonModManifestPath(safeProfileId);
  const targetPath = path.join(modsDir, BAYON_MOD_FILENAME);
  let previous = null;
  try { previous = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}

  if (existsSync(targetPath)) {
    if (!previous || previous.filename !== BAYON_MOD_FILENAME) {
      throw new Error(`A file named ${BAYON_MOD_FILENAME} already exists in this profile. It was left untouched; move or rename it before installing Bayon Client.`);
    }
    const existingHash = createHash('sha256').update(readFileSync(targetPath)).digest('hex');
    if (existingHash !== previous.sha256) {
      throw new Error('The existing Bayon mod JAR was changed outside the launcher. It was left untouched to protect your file.');
    }
  }

  const source = readFileSync(bundle.jarPath);
  const sha256 = createHash('sha256').update(source).digest('hex');
  const temporaryPath = `${targetPath}.installing`;
  writeFileSync(temporaryPath, source, { flag: 'w' });
  renameSync(temporaryPath, targetPath);
  writeFileSync(manifestPath, JSON.stringify({
    filename: BAYON_MOD_FILENAME,
    version: bundle.version,
    gameVersion: bundle.gameVersion,
    sha256,
    installedAt: Date.now(),
  }, null, 2), 'utf8');
  return getBayonModStatus(safeProfileId);
}

function uninstallBayonMod(profileId) {
  const safeProfileId = normalizeProfileId(profileId);
  const manifestPath = getBayonModManifestPath(safeProfileId);
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return getBayonModStatus(safeProfileId); }
  const filename = path.basename(String(manifest.filename || ''));
  const modPath = path.join(getModsDir(safeProfileId), filename);
  if (filename === BAYON_MOD_FILENAME && existsSync(modPath)) {
    const sha256 = createHash('sha256').update(readFileSync(modPath)).digest('hex');
    if (sha256 !== manifest.sha256) throw new Error('Bayon mod JAR changed outside the launcher, so it was left untouched.');
    unlinkSync(modPath);
  }
  unlinkSync(manifestPath);
  return getBayonModStatus(safeProfileId);
}

function readInstalledMods(profileId) {
  const configPath = getModsConfigPath(profileId);
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

function writeInstalledMods(profileId, mods) {
  const configPath = getModsConfigPath(profileId);
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(mods, null, 2), 'utf8');
}

async function installModrinthMod({ projectId, gameVersion, loader, name, summary, iconUrl, projectUrl, category, profileId, projectType = 'mod', worldName }) {
  if (!modrinthProjectTypes.includes(projectType)) throw new Error('Unsupported Modrinth content type.');
  const targetDir = getContentDir(profileId, projectType, worldName);
  const loaderFacet = modrinthLoaderFacets[loader] || 'fabric';
  const versionUrl = new URL(`https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version`);
  versionUrl.searchParams.set('game_versions', JSON.stringify([gameVersion]));
  if (projectType === 'mod' || projectType === 'modpack') versionUrl.searchParams.set('loaders', JSON.stringify([loaderFacet]));
  const response = await fetch(versionUrl, {
    headers: { 'User-Agent': 'BayonClient/1.0.0 (launcher content downloader)' },
    signal: AbortSignal.timeout(15000),
  });
  const versions = response.ok ? await response.json() : [];

  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`No ${projectType} release is available for Minecraft ${gameVersion}${projectType === 'mod' || projectType === 'modpack' ? ` with ${loader}` : ''}.`);
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
    throw new Error(`Failed to download ${projectType} file (HTTP ${fileResponse.status}).`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const rawFilename = targetFile.filename || `${projectId}.jar`;
  const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._+-]/g, '_');
  const filePath = path.join(targetDir, safeFilename);

  writeFileSync(filePath, buffer);

  const currentMods = readInstalledMods(profileId);
  const existingIndex = currentMods.findIndex((m) => m.id === projectId && (m.projectType || 'mod') === projectType);

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
    projectType,
    worldName: projectType === 'datapack' && typeof worldName === 'string' && existsSync(path.join(getProfileGameDir(profileId), 'saves', worldName)) ? worldName : undefined,
  };

  if (existingIndex >= 0) {
    currentMods[existingIndex] = newMod;
  } else {
    currentMods.unshift(newMod);
  }

  writeInstalledMods(profileId, currentMods);
  return currentMods;
}

function toggleMod(modId, enabled, profileId) {
  const currentMods = readInstalledMods(profileId);
  const mod = currentMods.find((m) => m.id === modId);
  if (!mod) {
    throw new Error('Mod not found.');
  }
  const targetDir = getContentDir(profileId, mod.projectType || 'mod', mod.worldName);

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

  writeInstalledMods(profileId, currentMods);
  return currentMods;
}

function uninstallMod(modId, profileId) {
  const currentMods = readInstalledMods(profileId);
  const modIndex = currentMods.findIndex((m) => m.id === modId);
  if (modIndex < 0) {
    return currentMods;
  }

  const mod = currentMods[modIndex];
  const targetDir = getContentDir(profileId, mod.projectType || 'mod', mod.worldName);
  const filePath = path.join(targetDir, mod.filename);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // Ignored
    }
  }

  currentMods.splice(modIndex, 1);
  writeInstalledMods(profileId, currentMods);
  return currentMods;
}

async function openModsFolder(profileId, projectType = 'mod') {
  const targetDir = getContentDir(profileId, projectType);
  await shell.openPath(targetDir);
}

const managedJavaVersions = [8, 11, 17, 21, 25];

function getManagedJavaRoot() {
  return path.join(app.getPath('userData'), 'java-runtimes', 'temurin');
}

function getManagedJavaPath(major) {
  return path.join(getManagedJavaRoot(), String(major), 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

function getWindowsJavawPath(selectedJavaPath, gameVersion) {
  if (process.platform !== 'win32') return null;
  const candidates = [];
  if (selectedJavaPath && selectedJavaPath !== 'java') {
    candidates.push(path.join(path.dirname(selectedJavaPath), 'javaw.exe'));
  }
  const expectedMajor = getMinecraftJavaMajor(gameVersion);
  const detected = getSystemJavaInstallations().get(expectedMajor);
  if (detected?.javaPath && detected.javaPath !== 'java') {
    candidates.push(path.join(path.dirname(detected.javaPath), 'javaw.exe'));
  }
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'));
  try {
    const { spawnSync } = require('node:child_process');
    const located = spawnSync('where.exe', ['javaw.exe'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (located.status === 0) candidates.push(...String(located.stdout).split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
  } catch {}
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
}

function getMinecraftJavaMajor(gameVersion) {
  const legacyVersion = /^1\.(\d+)/.exec(String(gameVersion));
  if (legacyVersion) {
    const minor = Number(legacyVersion[1]);
    if (minor <= 16) return 8;
    if (minor <= 20 && !/^1\.20\.(?:5|[6-9]|\d{2,})/.test(gameVersion)) return 17;
    return 21;
  }
  const modernMajor = Number.parseInt(String(gameVersion).split('.')[0], 10);
  return Number.isFinite(modernMajor) && modernMajor >= 25 ? 25 : 21;
}

function parseCustomJavaArgs(value) {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Java arguments must be text shorter than 4,000 characters.');
  const args = [];
  let current = '';
  let quote = null;
  for (const character of value.trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) args.push(current), current = '';
    } else {
      current += character;
    }
  }
  if (quote) throw new Error('Close the quote in your custom Java arguments.');
  if (current) args.push(current);
  if (args.some((argument) => !argument.startsWith('-'))) throw new Error('Each custom Java argument must start with a dash.');
  return args;
}

function probeJavaExecutable(javaPath) {
  if (typeof javaPath !== 'string' || !javaPath || (javaPath !== 'java' && !existsSync(javaPath))) return null;
  try {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(javaPath, ['-version'], { timeout: 8000, encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) return null;
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    const version = /version\s+"([^"]+)"/i.exec(output)?.[1] || /(?:openjdk|java)\s+(\d+(?:\.\d+)+)/i.exec(output)?.[1];
    if (!version) return null;
    const major = Number(/^1\.(\d+)/.exec(version)?.[1] || /^([0-9]+)/.exec(version)?.[1]);
    if (!Number.isFinite(major)) return null;
    return { major, javaPath: javaPath === 'java' ? 'java' : path.resolve(javaPath), packageVersion: version };
  } catch {
    return null;
  }
}

function getSystemJavaInstallations(preferredJavaPath = '') {
  const executable = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [];
  if (preferredJavaPath) candidates.push(preferredJavaPath);
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', executable));
  try {
    const { spawnSync } = require('node:child_process');
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    const located = spawnSync(locator, ['java'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (located.status === 0) candidates.push(...String(located.stdout).split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
  } catch {}
  if (process.platform === 'win32') {
    const programRoots = [...new Set([
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
      path.join(app.getPath('home'), '.jdks'),
    ].filter(Boolean))];
    for (const programRoot of programRoots) {
      for (const vendor of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Amazon Corretto', 'BellSoft', 'Zulu']) {
        const vendorRoot = path.join(programRoot, vendor);
        candidates.push(path.join(vendorRoot, 'bin', executable));
        try {
          for (const item of readdirSync(vendorRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).slice(0, 20)) {
            candidates.push(path.join(vendorRoot, item.name, 'bin', executable));
          }
        } catch {}
      }
    }
  }
  const byMajor = new Map();
  for (const candidate of [...new Set(candidates)]) {
    const runtime = probeJavaExecutable(candidate);
    if (runtime && !byMajor.has(runtime.major)) byMajor.set(runtime.major, runtime);
  }
  return byMajor;
}

function getManagedJavaStatuses(preferredJavaPath = '') {
  const systemRuntimes = getSystemJavaInstallations(preferredJavaPath);
  return managedJavaVersions.map((major) => {
    const javaPath = getManagedJavaPath(major);
    const systemRuntime = systemRuntimes.get(major);
    let release = null;
    try {
      release = JSON.parse(readFileSync(path.join(getManagedJavaRoot(), String(major), 'runtime-info.json'), 'utf8'));
    } catch {
      // An absent metadata file does not affect a successfully installed runtime.
    }
    return {
      major,
      kind: major <= 17 ? 'JRE' : 'JDK',
      installed: existsSync(javaPath),
      javaPath: existsSync(javaPath) ? javaPath : undefined,
      packageVersion: typeof release?.packageVersion === 'string' ? release.packageVersion : undefined,
      systemJavaPath: systemRuntime?.javaPath,
      systemPackageVersion: systemRuntime?.packageVersion,
    };
  });
}

function sendJavaRuntimeProgress(major, progress, status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('java:runtime-progress', { major, progress, status });
  }
}

async function installManagedJavaRuntime(major) {
  if (!managedJavaVersions.includes(major)) throw new Error('Choose a supported Java runtime version.');
  const os = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform];
  const arch = { x64: 'x64', arm64: 'aarch64', ia32: 'x86' }[process.arch];
  if (!os || !arch) throw new Error(`Java runtime downloads are not available for ${process.platform}/${process.arch}.`);

  const imageType = major <= 17 ? 'jre' : 'jdk';
  const archiveExtension = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const installRoot = getManagedJavaRoot();
  const targetDir = path.join(installRoot, String(major));
  const workDir = path.join(installRoot, `.install-${major}-${process.pid}-${Date.now()}`);
  const archivePath = path.join(workDir, `temurin-${major}.${archiveExtension}`);
  const stagingDir = path.join(workDir, 'runtime');
  const backupDir = `${targetDir}.backup-${process.pid}`;
  mkdirSync(stagingDir, { recursive: true });

  try {
    const binaryUrl = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/${imageType}/hotspot/normal/eclipse`;
    sendJavaRuntimeProgress(major, 2, `Connecting to Eclipse Temurin Java ${major}…`);
    const response = await fetch(binaryUrl, {
      headers: { 'User-Agent': 'BayonClient/1.0.0 (Eclipse Temurin runtime installer)' },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok || !response.body) throw new Error(`Temurin download failed (HTTP ${response.status}).`);
    const packageVersion = decodeURIComponent(path.basename(new URL(response.url).pathname));
    const totalBytes = Number(response.headers.get('content-length')) || 0;
    let receivedBytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        receivedBytes += chunk.length;
        const percent = totalBytes > 0 ? Math.min(80, 5 + Math.floor((receivedBytes / totalBytes) * 75)) : 5;
        const receivedMb = Math.round(receivedBytes / 1024 / 1024);
        const totalMb = totalBytes ? ` / ${Math.round(totalBytes / 1024 / 1024)} MB` : '';
        sendJavaRuntimeProgress(major, percent, `Downloading Java ${major} · ${receivedMb} MB${totalMb}`);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(archivePath));

    sendJavaRuntimeProgress(major, 83, `Verifying Java ${major} download…`);
    const checksumResponse = await fetch(`${response.url}.sha256.txt`, {
      headers: { 'User-Agent': 'BayonClient/1.0.0 (Eclipse Temurin runtime installer)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!checksumResponse.ok) throw new Error(`Could not retrieve Java ${major} SHA-256 checksum.`);
    const expectedChecksum = (await checksumResponse.text()).trim().split(/\s+/)[0].toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedChecksum)) throw new Error('Temurin returned an invalid SHA-256 checksum.');
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256');
    const { createReadStream } = await import('node:fs');
    await new Promise((resolve, reject) => createReadStream(archivePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve));
    if (hash.digest('hex') !== expectedChecksum) throw new Error('Java download checksum did not match; the runtime was not installed.');

    sendJavaRuntimeProgress(major, 87, `Extracting Java ${major}…`);
    if (process.platform === 'win32') {
      const launcherRequire = createRequire(require.resolve('minecraft-launcher-core'));
      const AdmZip = launcherRequire('adm-zip');
      const archive = new AdmZip(archivePath);
      const entries = archive.getEntries();
      const javaEntry = entries.find((entry) => /(?:^|\/)bin\/java\.exe$/i.test(entry.entryName.replace(/\\/g, '/')));
      if (!javaEntry) throw new Error('The Temurin archive does not contain java.exe.');
      const normalizedJavaPath = javaEntry.entryName.replace(/\\/g, '/');
      const rootPrefix = normalizedJavaPath.slice(0, -'bin/java.exe'.length);
      for (const entry of entries) {
        const entryName = entry.entryName.replace(/\\/g, '/');
        if (!entryName.startsWith(rootPrefix)) continue;
        const relativeName = entryName.slice(rootPrefix.length);
        if (!relativeName) continue;
        const outputPath = path.resolve(stagingDir, relativeName);
        if (!outputPath.startsWith(`${stagingDir}${path.sep}`)) throw new Error('Unsafe path in the Temurin archive.');
        if (entry.isDirectory) {
          mkdirSync(outputPath, { recursive: true });
        } else {
          mkdirSync(path.dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, entry.getData());
        }
      }
    } else {
      const { execFileSync } = await import('node:child_process');
      execFileSync('tar', ['-xzf', archivePath, '-C', stagingDir, '--strip-components=1'], { timeout: 5 * 60 * 1000, stdio: 'pipe' });
    }

    const stagedJavaPath = path.join(stagingDir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (!existsSync(stagedJavaPath)) throw new Error('Java extraction completed but java executable was not found.');
    const { execFileSync } = await import('node:child_process');
    execFileSync(stagedJavaPath, ['-version'], { timeout: 20000, stdio: 'pipe' });
    writeFileSync(path.join(stagingDir, 'runtime-info.json'), JSON.stringify({ major, packageVersion, installedAt: Date.now() }, null, 2), 'utf8');

    rmSync(backupDir, { recursive: true, force: true });
    if (existsSync(targetDir)) renameSync(targetDir, backupDir);
    try {
      renameSync(stagingDir, targetDir);
      rmSync(backupDir, { recursive: true, force: true });
    } catch (error) {
      if (existsSync(backupDir) && !existsSync(targetDir)) renameSync(backupDir, targetDir);
      throw error;
    }
    sendJavaRuntimeProgress(major, 100, `Java ${major} installed and ready.`);
    return getManagedJavaStatuses();
  } catch (error) {
    sendJavaRuntimeProgress(major, 0, `Java ${major} install failed: ${error.message}`);
    throw error;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function sendWindowState() {
  if (!mainWindow) {
    return;
  }

  const state = mainWindow.isMaximized() ? 'maximized' : 'restored';
  mainWindow.webContents.send('window:state-change', state);
}

function appendGameConsoleLog(level, source, message) {
  const entry = {
    id: nextConsoleLogId++,
    time: new Date().toLocaleTimeString(),
    level: ['error', 'warn'].includes(level) ? level : 'info',
    source: String(source || 'Game').slice(0, 40),
    message: String(message ?? '').replace(/\u0000/g, '').slice(0, 8000),
  };
  gameConsoleBuffer.push(entry);
  if (gameConsoleBuffer.length > 3000) gameConsoleBuffer.splice(0, gameConsoleBuffer.length - 3000);
  if (consoleWindow && !consoleWindow.isDestroyed() && !consoleWindow.webContents.isDestroyed()) {
    consoleWindow.webContents.send('console:log', entry);
  }
}

function openGameConsole(version, profileName = 'Profile') {
  appendGameConsoleLog('info', 'Bayon Client', `Starting ${profileName} · Minecraft ${version} · Fabric`);
  if (consoleWindow && !consoleWindow.isDestroyed()) {
    consoleWindow.show();
    consoleWindow.focus();
    return;
  }
  try {
    consoleWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 680,
    minHeight: 420,
    title: 'Bayon Client — Game Console',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    backgroundColor: '#090b0e',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', process.platform === 'win32' ? 'bayon-icon.ico' : 'bayon-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'console-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    });
    const createdWindow = consoleWindow;
    createdWindow.loadFile(path.join(__dirname, 'console.html')).catch((error) => {
      appendGameConsoleLog('error', 'Game Console', `Could not open the console window: ${error?.message || error}`);
    });
    createdWindow.once('ready-to-show', () => {
      if (!createdWindow.isDestroyed()) {
        createdWindow.show();
        createdWindow.focus();
      }
    });
    createdWindow.on('closed', () => { if (consoleWindow === createdWindow) consoleWindow = null; });
  } catch (error) {
    consoleWindow = null;
    console.warn('Could not create the game console window:', error?.message || error);
  }
}

function assertConsoleRenderer(event) {
  if (!consoleWindow || event.sender !== consoleWindow.webContents) throw new Error('Untrusted game console request.');
  if (!String(event.senderFrame?.url || '').startsWith('file://')) throw new Error('Game console origin is not allowed.');
}

function publishAppUpdateState(nextState) {
  appUpdateState = { ...nextState, checkedAt: Date.now() };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-update:state', appUpdateState);
}

function canUseAutoUpdater() {
  return app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR;
}

async function checkForClientUpdates() {
  if (!canUseAutoUpdater()) return appUpdateState;
  publishAppUpdateState({ status: 'checking' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publishAppUpdateState({ status: 'error', message: error?.message || 'Could not check for updates.' });
  }
  return appUpdateState;
}

function setupAutoUpdater() {
  if (!canUseAutoUpdater()) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.on('checking-for-update', () => publishAppUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    appUpdateVersion = info.version;
    publishAppUpdateState({ status: 'available', version: info.version, message: 'Update found. Downloading in the background…' });
  });
  autoUpdater.on('update-not-available', () => publishAppUpdateState({ status: 'idle' }));
  autoUpdater.on('download-progress', (progress) => publishAppUpdateState({
    status: 'downloading',
    version: appUpdateVersion,
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  }));
  autoUpdater.on('update-downloaded', (info) => publishAppUpdateState({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', (error) => publishAppUpdateState({ status: 'error', message: error?.message || 'Update check failed.' }));
  const initialCheck = setTimeout(() => { void checkForClientUpdates(); }, 6500);
  initialCheck.unref?.();
  const periodicCheck = setInterval(() => {
    if (!['downloading', 'downloaded'].includes(appUpdateState.status)) void checkForClientUpdates();
  }, 6 * 60 * 60 * 1000);
  periodicCheck.unref?.();
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
  loadConfiguredDirectories();
  discordConfigPath = path.join(app.getPath('userData'), 'discord-presence.json');

  ipcMain.handle('console:get-logs', (event) => {
    assertConsoleRenderer(event);
    return gameConsoleBuffer;
  });
  ipcMain.handle('console:clear', (event) => {
    assertConsoleRenderer(event);
    gameConsoleBuffer.length = 0;
    return true;
  });
  ipcMain.on('console:close', (event) => {
    assertConsoleRenderer(event);
    if (consoleWindow && !consoleWindow.isDestroyed()) consoleWindow.close();
  });
  ipcMain.handle('app-update:get-state', (event) => {
    assertTrustedRenderer(event);
    return appUpdateState;
  });

  ipcMain.handle('app:get-version', (event) => {
    assertTrustedRenderer(event);
    return app.getVersion();
  });
  ipcMain.handle('auth:google-start', async (event, clientId) => {
    assertTrustedRenderer(event);
    return startGoogleOAuth(clientId);
  });
  ipcMain.handle('auth:microsoft-start', async (event, clientId) => {
    assertTrustedRenderer(event);
    return startMicrosoftOAuth(clientId);
  });
  ipcMain.handle('app-update:check', async (event) => {
    assertTrustedRenderer(event);
    return checkForClientUpdates();
  });
  ipcMain.handle('app-update:install', (event) => {
    assertTrustedRenderer(event);
    if (!canUseAutoUpdater() || appUpdateState.status !== 'downloaded') return false;
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  const getClientDirectories = () => {
    const userData = app.getPath('userData');
    const logsDirectory = path.join(userData, 'logs');
    mkdirSync(logsDirectory, { recursive: true });
    return {
      gameDataDirectory: getMinecraftDataRoot(),
      installDirectory: path.dirname(app.getPath('exe')),
      configurationDirectory: userData,
      javaDirectory: path.dirname(getManagedJavaRoot()),
      logsDirectory,
    };
  };

  ipcMain.handle('directories:get', (event) => {
    assertTrustedRenderer(event);
    return getClientDirectories();
  });
  ipcMain.handle('directories:open', async (event, key) => {
    assertTrustedRenderer(event);
    const directoryKeys = { gameData: 'gameDataDirectory', install: 'installDirectory', configuration: 'configurationDirectory', java: 'javaDirectory', logs: 'logsDirectory' };
    const directory = getClientDirectories()[directoryKeys[key]];
    if (!directory) throw new Error('Choose a valid launcher directory.');
    mkdirSync(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle('directories:choose-game-data', async (event) => {
    assertTrustedRenderer(event);
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose Minecraft game data directory', properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = path.resolve(result.filePaths[0]);
    const comparable = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
    const selectedComparable = comparable(selected);
    const protectedDirectories = [app.getPath('home'), app.getPath('appData'), app.getPath('userData'), path.dirname(app.getPath('exe'))].map((value) => comparable(path.resolve(value)));
    const containsProtectedDirectory = protectedDirectories.some((protectedPath) => {
      const relative = path.relative(selected, protectedPath);
      return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    });
    if (!path.isAbsolute(selected) || selected === path.parse(selected).root || protectedDirectories.includes(selectedComparable) || containsProtectedDirectory) {
      throw new Error('Choose a dedicated folder for Minecraft game data.');
    }
    customMinecraftDataRoot = selected;
    saveConfiguredDirectories();
    return getClientDirectories();
  });

  ipcMain.handle('recovery:test-java', async (event, payload = {}) => {
    assertTrustedRenderer(event);
    const requestedPath = typeof payload.javaPath === 'string' ? payload.javaPath.trim() : '';
    const version = typeof payload.gameVersion === 'string' ? payload.gameVersion : '';
    let javaPath = 'java';
    if (requestedPath) {
      if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) throw new Error(`Custom Java executable was not found: ${requestedPath}`);
      javaPath = requestedPath;
    } else {
      const managedPath = getManagedJavaPath(getMinecraftJavaMajor(version));
      if (existsSync(managedPath)) javaPath = managedPath;
    }
    const { spawnSync } = await import('node:child_process');
    try {
      const result = spawnSync(javaPath, ['-version'], { timeout: 15000, encoding: 'utf8', windowsHide: true });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error([result.stderr, result.stdout].filter(Boolean).join('\n').trim() || `Java exited with code ${result.status}.`);
      return { success: true, javaPath, output: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'Java runtime started successfully.' };
    } catch (error) {
      const output = [error?.stderr, error?.stdout].filter(Boolean).map((part) => part.toString()).join('\n').trim();
      if (error?.code === 'ENOENT') throw new Error('Java was not found. Install a managed runtime or choose a Java executable in Settings.');
      throw new Error(output || `Java test failed: ${error?.message || 'unknown error'}`);
    }
  });

  ipcMain.handle('recovery:create-diagnostic', async (event) => {
    assertTrustedRenderer(event);
    const userData = app.getPath('userData');
    const reportDirectory = path.join(userData, 'diagnostics');
    mkdirSync(reportDirectory, { recursive: true });
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(reportDirectory)) {
      const candidate = path.join(reportDirectory, name);
      try { if (name.startsWith('diagnostic-') && statSync(candidate).mtimeMs < cutoff) rmSync(candidate, { force: true }); } catch {}
    }
    const directories = getClientDirectories();
    const logFiles = [];
    try {
      for (const profileId of readdirSync(path.join(getMinecraftDataRoot(), 'profiles')).slice(0, 20)) {
        const log = path.join(getMinecraftDataRoot(), 'profiles', profileId, 'logs', 'latest.log');
        try { if (statSync(log).isFile()) logFiles.push(log); } catch {}
      }
    } catch {}
    try {
      for (const name of readdirSync(directories.logsDirectory).filter((item) => item.endsWith('.log')).slice(-5)) logFiles.push(path.join(directories.logsDirectory, name));
    } catch {}
    const redact = (value) => value
      .replace(/(access[_-]?token|refresh[_-]?token|authorization|password|client[_-]?secret|api[_-]?key)(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED EMAIL]')
      .replace(new RegExp(app.getPath('home').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[USER HOME]');
    const logSections = logFiles.slice(-5).map((file) => {
      let contents = '';
      try { const buffer = readFileSync(file); contents = buffer.subarray(Math.max(0, buffer.length - 48 * 1024)).toString('utf8'); } catch {}
      return `--- ${path.basename(path.dirname(path.dirname(file)))}/${path.basename(file)} (last 48 KB max) ---\n${redact(contents)}`;
    });
    const report = [
      'Bayon Client diagnostic report (stored locally; not uploaded)',
      `Created: ${new Date().toISOString()}`,
      `App version: ${app.getVersion()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Game data: ${redact(directories.gameDataDirectory)}`,
      `Configuration: ${redact(directories.configurationDirectory)}`,
      `Java directory: ${redact(directories.javaDirectory)}`,
      `Managed Java: ${redact(JSON.stringify(getManagedJavaStatuses()))}`,
      '', ...logSections,
    ].join('\n');
    const reportPath = path.join(reportDirectory, `diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    writeFileSync(reportPath, report.slice(0, 300 * 1024), 'utf8');
    await shell.openPath(reportPath);
    return { path: reportPath };
  });

  ipcMain.handle('recovery:clear-data', async (event) => {
    assertTrustedRenderer(event);
    const gameRoot = getMinecraftDataRoot();
    const managedGameFolders = ['assets', 'libraries', 'versions', 'profiles', 'natives', 'mods', 'modpacks', 'resourcepacks', 'shaderpacks', 'data-packs'];
    for (const folder of managedGameFolders) rmSync(path.join(gameRoot, folder), { recursive: true, force: true });
    const userData = app.getPath('userData');
    for (const folder of ['java-runtimes', 'logs', 'diagnostics']) rmSync(path.join(userData, folder), { recursive: true, force: true });
    try {
      for (const name of readdirSync(userData)) {
        if (/^(installed-mods-.*\.json|discord-presence\.json)$/.test(name)) rmSync(path.join(userData, name), { force: true });
      }
    } catch {}
    customMinecraftDataRoot = null;
    saveConfiguredDirectories();
    return { success: true };
  });

  ipcMain.handle('java:get-runtimes', (event, preferredJavaPath = '') => {
    assertTrustedRenderer(event);
    return getManagedJavaStatuses(typeof preferredJavaPath === 'string' ? preferredJavaPath : '');
  });

  ipcMain.handle('java:install-runtime', async (event, major) => {
    assertTrustedRenderer(event);
    return installManagedJavaRuntime(major);
  });

  ipcMain.handle('java:select-path', async (event) => {
    assertTrustedRenderer(event);
    const filters = process.platform === 'win32'
      ? [{ name: 'Java executable', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }]
      : [{ name: 'All files', extensions: ['*'] }];
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Select Java executable', properties: ['openFile'], filters });
    if (result.canceled || !result.filePaths[0]) return null;
    const selectedPath = result.filePaths[0];
    if (!existsSync(selectedPath) || !statSync(selectedPath).isFile()) throw new Error('Choose a Java executable file.');
    const { execFileSync } = await import('node:child_process');
    try {
      execFileSync(selectedPath, ['-version'], { timeout: 15000, stdio: 'pipe' });
    } catch {
      throw new Error('The selected file could not run as a Java executable.');
    }
    return selectedPath;
  });

  ipcMain.handle('discord:presence-status', (event) => {
    assertTrustedRenderer(event);
    return discordPresenceStatus;
  });

  ipcMain.handle('discord:presence-config', (event) => {
    assertTrustedRenderer(event);
    return { clientId: loadDiscordClientId() };
  });

  ipcMain.handle('discord:configure-presence', async (event, clientId = DEFAULT_DISCORD_CLIENT_ID) => {
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
    if (discordReconnectTimer) {
      clearTimeout(discordReconnectTimer);
      discordReconnectTimer = null;
    }
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

  ipcMain.handle('minecraft:get-versions', async (event) => {
    assertTrustedRenderer(event);
    const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', {
      headers: { 'User-Agent': 'BayonClient/1.0.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Minecraft version list unavailable (HTTP ${response.status}).`);
    const manifest = await response.json();
    if (!Array.isArray(manifest?.versions)) throw new Error('Minecraft returned an invalid version list.');
    return manifest.versions
      .filter((version) => version.type === 'release' && typeof version.id === 'string')
      .map((version) => version.id);
  });

  ipcMain.handle('minecraft:get-worlds', (event, profileId) => {
    assertTrustedRenderer(event);
    const savesDir = path.join(getProfileGameDir(profileId), 'saves');
    if (!existsSync(savesDir)) return [];
    return require('node:fs').readdirSync(savesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
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
      && /^\/(?:mod|modpack|resourcepack|shader|datapack)\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname);
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

  ipcMain.handle('mods:get-installed', (event, profileId) => {
    assertTrustedRenderer(event);
    return readInstalledMods(profileId);
  });

  ipcMain.handle('mods:bayon-status', (event, profileId) => {
    assertTrustedRenderer(event);
    return getBayonModStatus(profileId);
  });

  ipcMain.handle('mods:bayon-install', (event, profileId) => {
    assertTrustedRenderer(event);
    return installBayonMod(profileId);
  });

  ipcMain.handle('mods:bayon-uninstall', (event, profileId) => {
    assertTrustedRenderer(event);
    return uninstallBayonMod(profileId);
  });

  ipcMain.handle('mods:install-modrinth', async (event, payload) => {
    assertTrustedRenderer(event);
    if (!payload || typeof payload !== 'object' || !payload.projectId) {
      throw new Error('Invalid mod install request.');
    }
    return installModrinthMod(payload);
  });

  ipcMain.handle('mods:toggle', (event, modId, enabled, profileId) => {
    assertTrustedRenderer(event);
    if (typeof modId !== 'string') throw new Error('Invalid mod ID.');
    return toggleMod(modId, Boolean(enabled), profileId);
  });

  ipcMain.handle('mods:uninstall', (event, modId, profileId) => {
    assertTrustedRenderer(event);
    if (typeof modId !== 'string') throw new Error('Invalid mod ID.');
    return uninstallMod(modId, profileId);
  });

  ipcMain.handle('mods:open-folder', async (event, profileId, projectType) => {
    assertTrustedRenderer(event);
    if (projectType && !modrinthProjectTypes.includes(projectType)) throw new Error('Invalid content type.');
    return openModsFolder(profileId, projectType || 'mod');
  });

  // ── Minecraft Launch ────────────────────────────────────────────────────────
  ipcMain.handle('minecraft:launch', async (event, input) => {
    assertTrustedRenderer(event);

    const { version = '26.3', loader = 'Fabric', username = 'Player', memory = 4, profileId, profileName = 'Profile', javaPath: requestedJavaPath = '', customArgs = '' } = input ?? {};
    openGameConsole(version, profileName);
    let stopLogPolling = null;

    const emit = (progress, status) => {
      const line = String(status);
      const level = /failed|error|exception|fatal/i.test(line) ? 'error' : /warn/i.test(line) ? 'warn' : 'info';
      appendGameConsoleLog(level, 'Launcher', line);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('launch:progress', { progress, status: line });
      }
    };

    try {
      const { Client, Authenticator } = require('minecraft-launcher-core');
      const https = require('node:https');
      const fs = require('node:fs');

      const mcRoot = getMinecraftDataRoot();
      const gameDirectory = getProfileGameDir(profileId);
      fs.mkdirSync(gameDirectory, { recursive: true });

      const gameLogPath = path.join(gameDirectory, 'logs', 'latest.log');
      let gameLogOffset = 0;
      let incompleteLine = '';
      try { gameLogOffset = statSync(gameLogPath).size; } catch {}
      const pollGameLog = () => {
        try {
          const file = readFileSync(gameLogPath);
          const start = file.length < gameLogOffset ? 0 : Math.max(gameLogOffset, file.length - 256 * 1024);
          gameLogOffset = file.length;
          if (start >= file.length) return;
          const segments = (incompleteLine + file.subarray(start).toString('utf8')).split(/\r?\n/);
          incompleteLine = segments.pop() || '';
          for (const line of segments) {
            if (!line.trim()) continue;
            const level = /\b(ERROR|FATAL|SEVERE|Exception|failed to load)\b/i.test(line) ? 'error' : /\bWARN(?:ING)?\b/i.test(line) ? 'warn' : 'info';
            const source = level === 'error' && /mod|fabric|mixin/i.test(line) ? 'Mod Error' : 'Minecraft';
            appendGameConsoleLog(level, source, line);
          }
        } catch {
          // Minecraft creates latest.log after the JVM starts.
        }
      };
      const logPollTimer = setInterval(pollGameLog, 900);
      stopLogPolling = () => clearInterval(logPollTimer);

      let selectedJavaPath = 'java';
      if (typeof requestedJavaPath === 'string' && requestedJavaPath.trim()) {
        const customJavaPath = requestedJavaPath.trim();
        if (!existsSync(customJavaPath) || !statSync(customJavaPath).isFile()) {
          throw new Error(`Custom Java executable was not found: ${customJavaPath}`);
        }
        selectedJavaPath = customJavaPath;
      } else {
        const managedJavaPath = getManagedJavaPath(getMinecraftJavaMajor(version));
        if (existsSync(managedJavaPath)) selectedJavaPath = managedJavaPath;
      }
      const customJvmArgs = parseCustomJavaArgs(customArgs);

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

      const windowsJavawPath = getWindowsJavawPath(selectedJavaPath, version);
      if (windowsJavawPath) {
        launcher.startMinecraft = (launchArguments) => {
          const childProcess = require('node:child_process');
          const minecraft = childProcess.spawn(windowsJavawPath, launchArguments, {
            cwd: launcher.options.overrides.cwd || launcher.options.root,
            detached: launcher.options.overrides.detached,
            windowsHide: true,
          });
          minecraft.stdout?.on('data', (data) => launcher.emit('data', data.toString('utf-8')));
          minecraft.stderr?.on('data', (data) => launcher.emit('data', data.toString('utf-8')));
          minecraft.on('close', (code) => launcher.emit('close', code));
          minecraft.on('error', (error) => launcher.emit('error', error));
          return minecraft;
        };
      }

      let dataProgress = 50;
      launcher.on('debug', (msg) => {
        const m = String(msg);
        appendGameConsoleLog(/error|failed|exception/i.test(m) ? 'error' : /warn/i.test(m) ? 'warn' : 'info', 'Launcher', m);
        if (m.includes('Downloading') || m.includes('download')) {
          dataProgress = Math.min(dataProgress + 1, 88);
          emit(dataProgress, m.slice(0, 80));
        }
      });

      launcher.on('data', (msg) => {
        // Minecraft stdout — game is running
        const line = String(msg);
        const level = /\b(ERROR|FATAL|Exception|failed)\b/i.test(line) ? 'error' : /\bWARN(?:ING)?\b/i.test(line) ? 'warn' : 'info';
        appendGameConsoleLog(level, level === 'error' && /mod|fabric|mixin/i.test(line) ? 'Mod Error' : 'Minecraft', line);
        emit(100, `Game running: ${line.slice(0, 60)}`);
      });

      launcher.on('error', (error) => {
        appendGameConsoleLog('error', 'Launch Error', error?.stack || error?.message || String(error));
      });

      launcher.on('close', (code) => {
        stopLogPolling?.();
        stopLogPolling = null;
        appendGameConsoleLog(Number(code) === 0 ? 'info' : 'error', 'Minecraft', `Game process closed with exit code ${code}.`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('launch:progress', { progress: 0, status: `Game closed (exit ${code}).` });
        }
      });

      const auth = Authenticator.getAuth(username || 'Player');

      await launcher.launch({
        authorization: auth,
        root: mcRoot,
        overrides: { gameDirectory },
        version: launchVersion,
        memory: { max: `${memory}G`, min: '2G' },
        javaPath: selectedJavaPath,
        customArgs: customJvmArgs,
      });

      emit(95, 'Game process started!');
      return { success: true };
    } catch (err) {
      stopLogPolling?.();
      stopLogPolling = null;
      appendGameConsoleLog('error', 'Launch Error', err?.stack || err?.message || String(err));
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
  setupAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  appQuitting = true;
  if (discordReconnectTimer) clearTimeout(discordReconnectTimer);
  discordReconnectTimer = null;
});
