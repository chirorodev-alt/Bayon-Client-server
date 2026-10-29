import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { loadDb, saveDb } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serversFile = path.join(__dirname, '..', 'data', 'servers.json');
const clientFeedbackDirectory = path.join(__dirname, '..', 'data', 'client-feedback');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'bayon-client-super-secret-key-change-in-production';

// Allow credentials and dynamic origins (Vite dev, Electron file protocol, hosted web)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Electron desktop, mobile, curl) or any origin
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Bayon-Offline-Profile'],
  })
);

app.use(express.json({ limit: '18mb' }));

// Load in-memory DB state with file sync
let db = loadDb();
const clientHeartbeats = new Map();
const clientFeedbackSubmissions = new Map();
const CLIENT_HEARTBEAT_TTL_MS = 90_000;
const CLIENT_FEEDBACK_WINDOW_MS = 60 * 60 * 1000;
const CLIENT_FEEDBACK_MAX_PER_WINDOW = 5;
const CLIENT_FEEDBACK_IMAGE_MAX_SIZE = 3 * 1024 * 1024;
fs.mkdirSync(clientFeedbackDirectory, { recursive: true });

function pruneClientHeartbeats(now = Date.now()) {
  for (const [clientId, lastSeen] of clientHeartbeats) {
    if (now - lastSeen > CLIENT_HEARTBEAT_TTL_MS) clientHeartbeats.delete(clientId);
  }
}

app.post('/api/client-presence', (req, res) => {
  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : '';
  if (!/^[a-f0-9-]{36}$/i.test(clientId)) return res.status(400).json({ error: 'A valid anonymous client session ID is required.' });
  pruneClientHeartbeats();
  clientHeartbeats.set(clientId, Date.now());
  res.setHeader('Cache-Control', 'no-store');
  res.json({ onlineUsers: clientHeartbeats.size, expiresInSeconds: CLIENT_HEARTBEAT_TTL_MS / 1000 });
});

app.get('/api/client-presence', (_req, res) => {
  pruneClientHeartbeats();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ onlineUsers: clientHeartbeats.size });
});

app.get('/api/client-notifications', (_req, res) => {
  const requestedLimit = typeof _req.query.limit === 'string' ? Number(_req.query.limit) : NaN;
  const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 100 ? requestedLimit : 30;
  const notifications = (db.clientNotifications || []).slice(-limit).reverse();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ notifications });
});

app.post('/api/client-feedback', (req, res) => {
  const now = Date.now();
  if (clientFeedbackSubmissions.size > 1000) {
    for (const [ip, timestamps] of clientFeedbackSubmissions) {
      if (!timestamps.some((createdAt) => now - createdAt < CLIENT_FEEDBACK_WINDOW_MS)) clientFeedbackSubmissions.delete(ip);
    }
  }
  const recentSubmissions = (clientFeedbackSubmissions.get(req.ip) || []).filter((createdAt) => now - createdAt < CLIENT_FEEDBACK_WINDOW_MS);
  if (recentSubmissions.length >= CLIENT_FEEDBACK_MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Feedback limit reached. Please try again later.' });
  }

  const category = req.body?.category;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!['bug', 'positive'].includes(category)) return res.status(400).json({ error: 'Choose a bug report or positive feedback category.' });
  if (!message || message.length > 2000) return res.status(400).json({ error: 'Write a message of up to 2,000 characters.' });

  let imageBuffer = null;
  let imageMimeType = '';
  let imageExtension = '';
  if (req.body?.image !== undefined && req.body.image !== null) {
    const image = req.body.image;
    const allowedImageTypes = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']]);
    if (!image || typeof image.data !== 'string' || !allowedImageTypes.has(image.mimeType)) {
      return res.status(400).json({ error: 'Attach a PNG, JPEG, or WebP image.' });
    }
    if (image.data.length > Math.ceil(CLIENT_FEEDBACK_IMAGE_MAX_SIZE * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) {
      return res.status(400).json({ error: 'Image data is invalid or larger than 3 MB.' });
    }
    imageBuffer = Buffer.from(image.data, 'base64');
    if (!imageBuffer.length || imageBuffer.length > CLIENT_FEEDBACK_IMAGE_MAX_SIZE || imageBuffer.toString('base64') !== image.data) {
      return res.status(400).json({ error: 'Image data is invalid or larger than 3 MB.' });
    }
    imageMimeType = image.mimeType;
    imageExtension = allowedImageTypes.get(imageMimeType);
    const validSignature = imageMimeType === 'image/png'
      ? imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : imageMimeType === 'image/jpeg'
        ? imageBuffer.length >= 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff
        : imageBuffer.length >= 12 && imageBuffer.toString('ascii', 0, 4) === 'RIFF' && imageBuffer.toString('ascii', 8, 12) === 'WEBP';
    if (!validSignature) return res.status(400).json({ error: 'The attached file does not match its image type.' });
  }

  const id = crypto.randomUUID();
  const imageFileName = imageBuffer ? `${id}.${imageExtension}` : null;
  const feedback = { id, category, message, createdAt: new Date(now).toISOString(), status: 'new', imageFileName, imageMimeType: imageMimeType || null };
  try {
    if (imageBuffer) fs.writeFileSync(path.join(clientFeedbackDirectory, imageFileName), imageBuffer, { flag: 'wx' });
    db.clientFeedback ??= [];
    db.clientFeedback.push(feedback);
    if (!saveDb(db)) throw new Error('Could not save the feedback entry.');
    recentSubmissions.push(now);
    clientFeedbackSubmissions.set(req.ip, recentSubmissions);
    res.status(201).json({ success: true, feedbackId: id });
  } catch (error) {
    db.clientFeedback = (db.clientFeedback || []).filter((item) => item.id !== id);
    if (imageFileName) {
      try { fs.rmSync(path.join(clientFeedbackDirectory, imageFileName), { force: true }); }
      catch (cleanupError) { console.error('Could not clean up an incomplete feedback image:', cleanupError); }
    }
    console.error('Failed saving client feedback:', error);
    res.status(500).json({ error: 'Could not save your feedback. Please try again later.' });
  }
});

// ── Root & Health ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'store.html')));
app.get('/voxel-cave.svg', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'voxel-cave.svg')));
app.get('/bayon-mark.png', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'bayon-mark.png')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Friends API (Matches Bayon Client fetchFriends contract) ──────────────────
// Contract: { friends: [{ id: string, username: string, status: 'online' | 'offline' | 'in_game', avatarUrl?: string }] }
app.get('/api/friends', (req, res) => {
  res.json({ friends: db.friends || [] });
});

// Add or update friend
app.post('/api/friends', (req, res) => {
  const { username, status = 'online', avatarUrl } = req.body || {};
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const validStatus = ['online', 'offline', 'in_game'].includes(status) ? status : 'online';
  const cleanUsername = username.trim();

  const existingIndex = db.friends.findIndex(
    (f) => f.username.toLowerCase() === cleanUsername.toLowerCase()
  );

  const friendObj = {
    id: existingIndex >= 0 ? db.friends[existingIndex].id : `friend-${Date.now()}`,
    username: cleanUsername,
    status: validStatus,
    avatarUrl: avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(cleanUsername)}`,
  };

  if (existingIndex >= 0) {
    db.friends[existingIndex] = { ...db.friends[existingIndex], ...friendObj };
  } else {
    db.friends.push(friendObj);
  }

  saveDb(db);
  res.status(201).json({ success: true, friend: friendObj });
});

// Update friend presence
app.patch('/api/friends/:id/presence', (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!['online', 'offline', 'in_game'].includes(status)) {
    return res.status(400).json({ error: "Status must be 'online', 'offline', or 'in_game'." });
  }

  const friend = db.friends.find((f) => f.id === id);
  if (!friend) {
    return res.status(404).json({ error: 'Friend not found.' });
  }

  friend.status = status;
  saveDb(db);
  res.json({ success: true, friend });
});

// Remove friend
app.delete('/api/friends/:id', (req, res) => {
  const { id } = req.params;
  const beforeCount = db.friends.length;
  db.friends = db.friends.filter((f) => f.id !== id);

  if (db.friends.length === beforeCount) {
    return res.status(404).json({ error: 'Friend not found.' });
  }

  saveDb(db);
  res.json({ success: true, message: 'Friend removed.' });
});

// ── Auth Endpoints ────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (username.length < 3 || username.length > 16) {
      return res.status(400).json({ error: 'Username must be between 3 and 16 characters.' });
    }

    const cleanUsername = username.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username may contain only letters, numbers, and underscores.' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
    }
    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return res.status(409).json({ error: 'Username is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      id: `user-${Date.now()}`,
      username: cleanUsername,
      passwordHash,
      status: 'online',
      avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(cleanUsername)}`,
      createdAt: new Date().toISOString(),
      bacoins: 0,
      ownedCosmetics: [],
    };

    db.users.push(newUser);
    saveDb(db);

    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        status: newUser.status,
        avatarUrl: newUser.avatarUrl,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create user account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = String(username).trim();
    const user = db.users.find((u) => u.username.toLowerCase() === cleanUsername.toLowerCase());

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d',
    });

    user.status = 'online';
    saveDb(db);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to sign in.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.id === decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// Bacoins and cosmetics are kept on the authenticated Bayon account. Offline
// Minecraft profiles are intentionally not accepted as an identity here.
const cosmeticCatalog = [
  { id: 'ember-frame', name: 'Ember Frame', description: 'A warm ember colored profile frame.', category: 'Profile frame', price: 250, accent: '#f97316' },
  { id: 'ender-glow', name: 'Ender Glow', description: 'A violet glow for your Bayon profile.', category: 'Profile effect', price: 400, accent: '#a855f7' },
  { id: 'diamond-badge', name: 'Diamond Badge', description: 'Show off a polished diamond badge.', category: 'Badge', price: 600, accent: '#38bdf8' },
  { id: 'gold-name', name: 'Golden Name', description: 'A golden name treatment in the client.', category: 'Name style', price: 800, accent: '#facc15' },
];
if (!db.cosmeticsInitialized) {
  if (!db.cosmetics.length) db.cosmetics = cosmeticCatalog;
  db.cosmeticsInitialized = true;
  saveDb(db);
}
const adminSecret = process.env.BACOIN_ADMIN_KEY || '';
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const adminPanelSecret = process.env.ADMIN_PANEL_SECRET || '';
const adminPanelPath = adminPanelSecret ? `/admin-panel-${adminPanelSecret}` : '';
const mediaDirectory = path.join(__dirname, '..', 'data', 'cosmetics');
fs.mkdirSync(mediaDirectory, { recursive: true });
app.use('/media/cosmetics', express.static(mediaDirectory, { fallthrough: false, maxAge: '1d' }));

const clientUpdateDirectory = process.env.CLIENT_UPDATE_STORAGE_DIR || path.join(__dirname, '..', 'data', 'client-updates');
const clientUpdateIncomingDirectory = path.join(clientUpdateDirectory, '.incoming');
const clientUpdateUploadSessions = new Map();
const clientUpdateChunkSize = 4 * 1024 * 1024;
const clientUpdateMaxSize = 1024 * 1024 * 1024;
fs.mkdirSync(clientUpdateIncomingDirectory, { recursive: true });
const configuredUpdateBaseVersion = process.env.CLIENT_UPDATE_BASE_VERSION || '1.0.1';
const initialUpdateVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(configuredUpdateBaseVersion) ? configuredUpdateBaseVersion : '1.0.1';
const clientUpdatePlatforms = {
  windows: { manifest: 'latest.yml', extension: '.exe', prefix: 'Bayon-Client-Setup-', signature: 'MZ' },
  linux: { manifest: 'latest-linux.yml', extension: '.AppImage', prefix: 'Bayon-Client-', signature: '\x7fELF' },
  macos: { manifest: 'latest-mac.yml', extension: '.zip', prefix: 'Bayon-Client-', signature: 'PK' },
};
for (const { manifest } of Object.values(clientUpdatePlatforms)) {
  const manifestPath = path.join(clientUpdateDirectory, manifest);
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, `version: ${initialUpdateVersion}\nfiles: []\nreleaseDate: ${new Date().toISOString()}\n`, 'utf8');
  }
}
function readClientUpdatePlatforms() {
  const currentPath = path.join(clientUpdateDirectory, 'current.json');
  if (!fs.existsSync(currentPath)) return {};
  const stored = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  return stored.platforms || (stored.version ? { windows: stored } : {});
}
app.get('/api/client-updates/releases', (_req, res) => {
  try {
    const stored = readClientUpdatePlatforms();
    const releases = {};
    for (const [platform, update] of Object.entries(stored)) {
      const config = clientUpdatePlatforms[platform];
      if (!config || typeof update?.fileName !== 'string' || path.basename(update.fileName) !== update.fileName) continue;
      const filePath = path.join(clientUpdateDirectory, update.fileName);
      if (!fs.existsSync(filePath)) continue;
      releases[platform] = {
        version: update.version,
        size: fs.statSync(filePath).size,
        downloadUrl: `/api/client-updates/download/${platform}`,
      };
    }
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.json({ releases });
  } catch (error) {
    console.error('Could not list available client downloads:', error);
    res.status(500).json({ error: 'Could not load client downloads.' });
  }
});
app.get('/api/client-updates/download/:platform', (req, res) => {
  const config = clientUpdatePlatforms[req.params.platform];
  if (!config) return res.status(404).json({ error: 'Unsupported client platform.' });
  try {
    const update = readClientUpdatePlatforms()[req.params.platform];
    if (!update || typeof update.fileName !== 'string' || path.basename(update.fileName) !== update.fileName) {
      return res.status(404).json({ error: `No ${req.params.platform} client download is available yet.` });
    }
    const filePath = path.join(clientUpdateDirectory, update.fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: `No ${req.params.platform} client download is available yet.` });
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.download(filePath, update.fileName, (error) => {
      if (error && !res.headersSent) {
        console.error(`Could not serve the ${req.params.platform} client download:`, error);
        res.status(500).json({ error: 'Could not download the Bayon Client installer.' });
      }
    });
  } catch (error) {
    console.error(`Could not load the ${req.params.platform} client download:`, error);
    res.status(500).json({ error: 'Could not download the Bayon Client installer.' });
  }
});
app.use('/api/client-updates', express.static(clientUpdateDirectory, {
  dotfiles: 'deny', index: false, fallthrough: false, maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, max-age=0'),
}));

app.get('/api/auth/google/config', (_req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});
app.get('/api/auth/microsoft/config', (_req, res) => {
  res.json({ clientId: process.env.MICROSOFT_CLIENT_ID || 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb' });
});

async function verifyGoogleCredential(credential) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error('Google Sign-In is not configured on the Bayon server.');
  if (typeof credential !== 'string' || credential.length > 10_000) throw new Error('Google did not return a valid sign-in credential.');
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw new Error('Google could not verify this sign-in. Please try again.');
  const identity = await response.json();
  const validIssuer = identity.iss === 'accounts.google.com' || identity.iss === 'https://accounts.google.com';
  if (identity.aud !== process.env.GOOGLE_CLIENT_ID || identity.email_verified !== 'true' || !identity.sub || !identity.email || !validIssuer || Number(identity.exp) * 1000 <= Date.now()) {
    throw new Error('Google account verification failed.');
  }
  return identity;
}

async function exchangeGoogleAuthorization({ code, codeVerifier, redirectUri }) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new Error('Google Sign-In is not configured on the Bayon server.');
  if (typeof code !== 'string' || code.length > 4096 || typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
    throw new Error('Invalid Google authorization response.');
  }
  const parsedRedirect = new URL(redirectUri);
  if (parsedRedirect.protocol !== 'http:' || parsedRedirect.hostname !== '127.0.0.1' || !/^\d+$/.test(parsedRedirect.port) || parsedRedirect.pathname !== '/oauth2callback' || parsedRedirect.search || parsedRedirect.hash) {
    throw new Error('Invalid local Google callback address.');
  }
  const tokenBody = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: parsedRedirect.toString(),
  });
  if (process.env.GOOGLE_CLIENT_SECRET) tokenBody.set('client_secret', process.env.GOOGLE_CLIENT_SECRET);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody,
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.id_token) throw new Error('Google authorization code exchange failed. Please try again.');
  return verifyGoogleCredential(tokenData.id_token);
}

function linkOfflineProfileToUser(user, profileId, profileUsername) {
  if (typeof profileId !== 'string' || profileId.length < 8 || profileId.length > 100 || typeof profileUsername !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(profileUsername)) {
    throw new Error('Select a valid offline Minecraft profile first.');
  }
  for (const candidate of db.users) {
    candidate.linkedOfflineProfiles ??= [];
    if (candidate.id !== user.id && candidate.linkedOfflineProfiles.some((profile) => profile.id === profileId)) {
      throw new Error('This offline profile is already linked to another Bayon account.');
    }
  }
  user.linkedOfflineProfiles ??= [];
  const existing = user.linkedOfflineProfiles.find((profile) => profile.id === profileId);
  if (existing) existing.username = profileUsername;
  else user.linkedOfflineProfiles.push({ id: profileId, username: profileUsername, linkedAt: new Date().toISOString() });
}

async function createGoogleSession(identity, profileId, profileUsername) {
    if (typeof profileId !== 'string' || profileId.length < 8 || profileId.length > 100 || typeof profileUsername !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(profileUsername)) {
      throw new Error('Select a valid offline Minecraft profile first.');
    }
    let user = db.users.find((candidate) => candidate.googleSubject === identity.sub);
    const profileOwner = db.users.find((candidate) => candidate.linkedOfflineProfiles?.some((profile) => profile.id === profileId));
    if (profileOwner && profileOwner.id !== user?.id) {
      const error = new Error('This offline profile is already linked to another Bayon account.');
      error.statusCode = 409;
      throw error;
    }
    if (!user) {
      const base = `g_${identity.sub.slice(-10)}`;
      let username = base;
      let suffix = 1;
      while (db.users.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) {
        username = `${base.slice(0, 13)}${suffix++}`;
      }
      user = {
        id: `user-${crypto.randomUUID()}`,
        username,
        googleSubject: identity.sub,
        googleEmail: identity.email,
        status: 'online',
        avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(username)}`,
        createdAt: new Date().toISOString(),
        bacoins: 0,
        ownedCosmetics: [],
        linkedOfflineProfiles: [],
      };
      db.users.push(user);
    } else {
      user.googleEmail = identity.email;
    }
    linkOfflineProfileToUser(user, req.body?.offlineProfileId, req.body?.offlineUsername);
    user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
    user.ownedCosmetics = Array.isArray(user.ownedCosmetics) ? user.ownedCosmetics : [];
    user.status = 'online';
    saveDb(db);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    return { success: true, token, user: publicBayonUser(user) };
}

app.post('/api/auth/google/exchange', async (req, res) => {
  try {
    const identity = await exchangeGoogleAuthorization(req.body || {});
    res.json(await createGoogleSession(identity, req.body?.offlineProfileId, req.body?.offlineUsername));
  } catch (err) {
    res.status(err.statusCode || (err.message.includes('not configured') ? 503 : 400)).json({ error: err.message || 'Google sign-in failed.' });
  }
});

app.post('/api/auth/microsoft/exchange', async (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID || 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb';
  const { code, codeVerifier, redirectUri, offlineProfileId, offlineUsername } = req.body || {};
  if (!clientId) return res.status(503).json({ error: 'Microsoft sign-in is not configured on the Bayon server.' });
  if (typeof code !== 'string' || code.length > 4096 || typeof codeVerifier !== 'string'
      || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier) || typeof redirectUri !== 'string') {
    return res.status(400).json({ error: 'Microsoft sign-in did not return a valid authorization response.' });
  }
  let callback;
  try { callback = new URL(redirectUri); } catch { return res.status(400).json({ error: 'Invalid Microsoft sign-in callback.' }); }
  if (callback.protocol !== 'http:' || callback.hostname !== 'localhost'
      || callback.pathname !== '/' || !Number(callback.port)
      || (offlineProfileId !== undefined && (typeof offlineProfileId !== 'string' || offlineProfileId.length < 8 || offlineProfileId.length > 100))
      || (offlineUsername !== undefined && (typeof offlineUsername !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(offlineUsername)))
      || (offlineProfileId && !offlineUsername) || (!offlineProfileId && offlineUsername)) {
    return res.status(400).json({ error: 'Microsoft sign-in callback or offline profile is invalid.' });
  }

  let tokenData;
  try {
    const response = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier, scope: 'openid profile email User.Read' }),
      signal: AbortSignal.timeout(12000),
    });
    tokenData = await response.json();
    if (!response.ok || !tokenData.access_token) return res.status(401).json({ error: 'Microsoft could not complete sign-in. Check the app registration and try again.' });
  } catch { return res.status(502).json({ error: 'Could not reach Microsoft sign-in.' }); }

  let profile;
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return res.status(401).json({ error: 'Microsoft did not provide a valid account profile.' });
    profile = await response.json();
  } catch { return res.status(502).json({ error: 'Could not read the Microsoft account profile.' }); }
  if (typeof profile.id !== 'string' || !profile.id) return res.status(401).json({ error: 'Microsoft account ID is missing.' });

  const email = typeof profile.mail === 'string' && profile.mail.includes('@') ? profile.mail.trim().toLowerCase()
    : typeof profile.userPrincipalName === 'string' && profile.userPrincipalName.includes('@') ? profile.userPrincipalName.trim().toLowerCase() : '';
  let user = db.users.find((candidate) => candidate.microsoftSubject === profile.id);
  // Preserve a beta balance when its owner signs into Microsoft from the same
  // locally saved offline profile, while leaving already-authenticated users alone.
  if (!user && offlineProfileId) {
    user = db.users.find((candidate) => !candidate.microsoftSubject && !candidate.googleSubject
      && !candidate.emailVerifiedAt && !candidate.passwordHash
      && candidate.linkedOfflineProfiles?.some((linked) => linked.id === offlineProfileId));
  }
  if (!user) {
    const base = `m_${crypto.createHash('sha256').update(profile.id).digest('hex').slice(0, 10)}`;
    let username = base;
    let suffix = 1;
    while (db.users.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) username = `${base.slice(0, 13)}${suffix++}`;
    user = { id: `user-${crypto.randomUUID()}`, username, status: 'online', createdAt: new Date().toISOString(), bacoins: 0, ownedCosmetics: [], linkedOfflineProfiles: [] };
    db.users.push(user);
  }
  user.microsoftSubject = profile.id;
  if (email) user.microsoftEmail = email;
  if (offlineProfileId) {
    try { linkOfflineProfileToUser(user, offlineProfileId, offlineUsername); }
    catch (error) { return res.status(409).json({ error: error.message || 'Could not connect this offline profile.' }); }
  }
  user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
  user.ownedCosmetics ??= [];
  user.status = 'online';
  saveDb(db);
  res.json({ token: jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' }), user: publicBayonUser(user) });
});

function authenticatedUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in to your Bayon account first.' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.users.find((candidate) => candidate.id === payload.id);
    if (!user) return res.status(401).json({ error: 'Bayon account not found.' });
    user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
    user.ownedCosmetics = Array.isArray(user.ownedCosmetics) ? user.ownedCosmetics : [];
    req.bayonUser = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Sign in again to continue.' });
  }
}

function requireLinkedOfflineProfile(req, res, next) {
  const profileId = req.get('x-bayon-offline-profile');
  if (!profileId || !req.bayonUser.linkedOfflineProfiles?.some((profile) => profile.id === profileId)) {
    return res.status(403).json({ error: 'Connect this offline profile to a Bayon or Google account first.' });
  }
  next();
}

app.post('/api/auth/offline-profile', authenticatedUser, (req, res) => {
  try {
    linkOfflineProfileToUser(req.bayonUser, req.body?.profileId, req.body?.username);
    saveDb(db);
    res.json({ user: publicBayonUser(req.bayonUser) });
  } catch (err) {
    res.status(409).json({ error: err.message || 'Could not connect this offline profile.' });
  }
});

app.post('/api/auth/google/link', authenticatedUser, requireLinkedOfflineProfile, async (req, res) => {
  try {
    const identity = await exchangeGoogleAuthorization(req.body || {});
    const owner = db.users.find((user) => user.googleSubject === identity.sub && user.id !== req.bayonUser.id);
    if (owner) return res.status(409).json({ error: 'This Google account is already connected to another Bayon account.' });
    req.bayonUser.googleSubject = identity.sub;
    req.bayonUser.googleEmail = identity.email;
    saveDb(db);
    res.json({ user: publicBayonUser(req.bayonUser) });
  } catch (err) {
    res.status(err.message.includes('not configured') ? 503 : 400).json({ error: err.message || 'Could not connect this Google account.' });
  }
});

function publicBayonUser(user) {
  return { id: user.id, username: user.username, email: user.email || user.googleEmail || user.microsoftEmail || undefined, betaContactEmail: user.betaContactEmail || undefined, bacoins: user.bacoins || 0, ownedCosmetics: user.ownedCosmetics || [], equippedCosmetic: user.equippedCosmetic || null };
}

app.get('/api/cosmetics', (_req, res) => res.json({ cosmetics: db.cosmetics.filter((item) => item.active !== false) }));

app.get('/api/store/me', authenticatedUser, (_req, res) => res.json({ user: publicBayonUser(_req.bayonUser) }));
app.post('/api/store/redeem', authenticatedUser, (req, res) => {
  const normalized = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!normalized || normalized.length > 80) return res.status(400).json({ error: 'Enter a valid redeem code.' });
  const codeHash = crypto.createHash('sha256').update(normalized).digest('hex');
  const record = db.redeemCodes.find((item) => item.codeHash === codeHash);
  if (!record || record.disabled || (record.expiresAt && Date.parse(record.expiresAt) < Date.now())) return res.status(400).json({ error: 'This code is invalid or expired.' });
  record.claims ??= [];
  if (record.claims.some((claim) => claim.userId === req.bayonUser.id)) return res.status(409).json({ error: 'This code has already been used on your account.' });
  if (record.claims.length >= record.maxClaims) return res.status(409).json({ error: 'This code has reached its claim limit.' });
  const amount = Number(record.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || req.bayonUser.bacoins + amount > Number.MAX_SAFE_INTEGER) return res.status(400).json({ error: 'This code is not configured correctly.' });
  record.claims.push({ userId: req.bayonUser.id, claimedAt: new Date().toISOString() });
  req.bayonUser.bacoins += amount;
  saveDb(db);
  res.json({ user: publicBayonUser(req.bayonUser), credited: amount });
});

app.post('/api/store/auth/microsoft', async (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID || 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb';
  const { code, codeVerifier, redirectUri } = req.body || {};
  if (!clientId) return res.status(503).json({ error: 'Microsoft sign-in is not configured on the Bayon server.' });
  if (typeof code !== 'string' || code.length > 4096 || typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier) || typeof redirectUri !== 'string') return res.status(400).json({ error: 'Microsoft sign-in did not return a valid authorization response.' });
  let callback;
  try { callback = new URL(redirectUri); } catch { return res.status(400).json({ error: 'Invalid Microsoft sign-in callback.' }); }
  if (callback.origin !== req.get('origin') || callback.pathname !== '/') return res.status(400).json({ error: 'Microsoft sign-in callback does not match this store.' });
  let tokenData;
  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: codeVerifier, scope: 'openid profile email User.Read' }),
      signal: AbortSignal.timeout(12000),
    });
    tokenData = await response.json();
    if (!response.ok || !tokenData.access_token) return res.status(401).json({ error: 'Microsoft could not complete sign-in. Check the app registration and try again.' });
  } catch { return res.status(502).json({ error: 'Could not reach Microsoft sign-in.' }); }
  let profile;
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(401).json({ error: 'Microsoft did not provide a valid account profile.' });
    profile = await response.json();
  } catch { return res.status(502).json({ error: 'Could not read the Microsoft account profile.' }); }
  if (typeof profile.id !== 'string' || !profile.id) return res.status(401).json({ error: 'Microsoft account ID is missing.' });
  const email = typeof profile.mail === 'string' && profile.mail.includes('@') ? profile.mail.trim().toLowerCase() : typeof profile.userPrincipalName === 'string' && profile.userPrincipalName.includes('@') ? profile.userPrincipalName.trim().toLowerCase() : '';
  let user = db.users.find((candidate) => candidate.microsoftSubject === profile.id);
  if (!user && email) user = db.users.find((candidate) => [candidate.googleEmail, candidate.microsoftEmail, candidate.emailVerifiedAt ? candidate.email : null].some((value) => typeof value === 'string' && value.toLowerCase() === email));
  if (!user) {
    const base = `m_${crypto.createHash('sha256').update(profile.id).digest('hex').slice(0, 10)}`;
    let username = base;
    let suffix = 1;
    while (db.users.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) username = `${base.slice(0, 13)}${suffix++}`;
    user = { id: `user-${crypto.randomUUID()}`, username, status: 'online', createdAt: new Date().toISOString(), bacoins: 0, ownedCosmetics: [], linkedOfflineProfiles: [] };
    db.users.push(user);
  }
  user.microsoftSubject = profile.id;
  if (email) user.microsoftEmail = email;
  user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
  user.ownedCosmetics ??= [];
  saveDb(db);
  res.json({ token: jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' }), user: publicBayonUser(user) });
});

app.post('/api/store/cosmetics/:id/purchase', authenticatedUser, (req, res) => {
  const cosmetic = db.cosmetics.find((item) => item.id === req.params.id && item.active !== false);
  if (!cosmetic) return res.status(404).json({ error: 'Cosmetic not found.' });
  req.bayonUser.ownedCosmetics ??= [];
  if (req.bayonUser.ownedCosmetics.includes(cosmetic.id)) return res.status(409).json({ error: 'You already own this cosmetic.' });
  if (req.bayonUser.bacoins < cosmetic.price) return res.status(400).json({ error: 'Not enough Bacoins. Redeem a code in the web store first.' });
  req.bayonUser.bacoins -= cosmetic.price;
  req.bayonUser.ownedCosmetics.push(cosmetic.id);
  saveDb(db);
  res.json({ user: publicBayonUser(req.bayonUser), cosmetic });
});

function requireAdmin(req, res, next) {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.admin !== true) throw new Error('not admin');
    next();
  } catch { res.status(401).json({ error: 'Admin sign-in required.' }); }
}

app.post('/api/admin/client-notifications', requireAdmin, (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const level = ['info', 'success', 'warning'].includes(req.body?.level) ? req.body.level : 'info';
  if (!title || title.length > 90) return res.status(400).json({ error: 'Enter a notification title (up to 90 characters).' });
  if (!message || message.length > 500) return res.status(400).json({ error: 'Enter a message (up to 500 characters).' });
  db.clientNotifications ??= [];
  const notification = { id: crypto.randomUUID(), title, message, level, createdAt: new Date().toISOString() };
  db.clientNotifications.push(notification);
  db.clientNotifications = db.clientNotifications.slice(-100);
  saveDb(db);
  res.status(201).json({ notification });
});

app.get('/api/admin/client-notifications', requireAdmin, (_req, res) => {
  const notifications = [...(db.clientNotifications || [])].reverse();
  res.set('Cache-Control', 'no-store');
  res.json({ notifications });
});

app.delete('/api/admin/client-notifications/:notificationId', requireAdmin, (req, res) => {
  const notificationId = String(req.params.notificationId || '');
  db.clientNotifications ??= [];
  const previousCount = db.clientNotifications.length;
  db.clientNotifications = db.clientNotifications.filter((item) => item.id !== notificationId);
  if (db.clientNotifications.length === previousCount) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  saveDb(db);
  res.json({ success: true });
});

app.get('/api/admin/client-feedback', requireAdmin, (_req, res) => {
  const feedback = [...(db.clientFeedback || [])].reverse().map(({ imageFileName, imageMimeType, ...item }) => ({
    ...item,
    hasImage: Boolean(imageFileName && imageMimeType),
  }));
  res.set('Cache-Control', 'no-store');
  res.json({ feedback });
});

app.get('/api/admin/client-feedback/:feedbackId/image', requireAdmin, (req, res) => {
  const item = (db.clientFeedback || []).find((feedback) => feedback.id === req.params.feedbackId);
  if (!item?.imageFileName || !['image/png', 'image/jpeg', 'image/webp'].includes(item.imageMimeType)) {
    return res.status(404).json({ error: 'Feedback image not found.' });
  }
  const fileName = path.basename(item.imageFileName);
  if (fileName !== item.imageFileName) return res.status(404).json({ error: 'Feedback image not found.' });
  const imagePath = path.join(clientFeedbackDirectory, fileName);
  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Feedback image is no longer available.' });
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(item.imageMimeType).sendFile(imagePath, (error) => {
    if (error && !res.headersSent) res.status(500).json({ error: 'Could not load the feedback image.' });
  });
});

app.patch('/api/admin/client-feedback/:feedbackId', requireAdmin, (req, res) => {
  const item = (db.clientFeedback || []).find((feedback) => feedback.id === req.params.feedbackId);
  if (!item) return res.status(404).json({ error: 'Feedback not found.' });
  if (!['new', 'reviewed'].includes(req.body?.status)) return res.status(400).json({ error: 'Choose a valid feedback status.' });
  const previousStatus = item.status;
  item.status = req.body.status;
  try {
    if (!saveDb(db)) throw new Error('Could not save the feedback status.');
    res.json({ success: true, status: item.status });
  } catch (error) {
    item.status = previousStatus;
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/client-feedback/:feedbackId', requireAdmin, (req, res) => {
  db.clientFeedback ??= [];
  const index = db.clientFeedback.findIndex((feedback) => feedback.id === req.params.feedbackId);
  if (index < 0) return res.status(404).json({ error: 'Feedback not found.' });
  const [item] = db.clientFeedback.splice(index, 1);
  try {
    if (!saveDb(db)) throw new Error('Could not delete the feedback entry.');
  } catch (error) {
    db.clientFeedback.splice(index, 0, item);
    return res.status(500).json({ error: error.message });
  }
  if (item.imageFileName) {
    try { fs.rmSync(path.join(clientFeedbackDirectory, path.basename(item.imageFileName)), { force: true }); }
    catch (error) { console.error('Could not remove deleted feedback image:', error); }
  }
  res.json({ success: true });
});

app.get('/api/admin/client-updates', requireAdmin, (_req, res) => {
  try {
    const currentPath = path.join(clientUpdateDirectory, 'current.json');
    const stored = fs.existsSync(currentPath) ? JSON.parse(fs.readFileSync(currentPath, 'utf8')) : {};
    const platforms = stored.platforms || (stored.version ? { windows: stored } : {});
    res.json({ current: platforms, baseVersion: initialUpdateVersion });
  } catch (error) {
    console.error('Could not read the current client update:', error);
    res.status(500).json({ error: 'Could not read the current client update.' });
  }
});

function compareClientVersions(left, right) {
  const [leftCore, leftPrerelease] = left.split('-', 2);
  const [rightCore, rightPrerelease] = right.split('-', 2);
  const leftNumbers = leftCore.split('.').map(Number);
  const rightNumbers = rightCore.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftNumbers[index] !== rightNumbers[index]) return leftNumbers[index] - rightNumbers[index];
  }
  if (leftPrerelease === rightPrerelease) return 0;
  if (leftPrerelease === undefined) return 1;
  if (rightPrerelease === undefined) return -1;
  return leftPrerelease.localeCompare(rightPrerelease, undefined, { numeric: true });
}

app.post('/api/admin/client-updates/upload', requireAdmin, (req, res) => {
  const { version, platform, fileName, size } = req.body || {};
  const bytes = Number(size);
  const platformConfig = clientUpdatePlatforms[platform];
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || version.length > 48) return res.status(400).json({ error: 'Enter a valid client version such as 1.0.2.' });
  if (!platformConfig || typeof fileName !== 'string' || path.basename(fileName) !== fileName || !fileName.toLowerCase().endsWith(platformConfig.extension.toLowerCase()) || !Number.isSafeInteger(bytes) || bytes < 4 || bytes > clientUpdateMaxSize) {
    return res.status(400).json({ error: 'Choose the installer file for the selected platform. Files must be smaller than 1 GB.' });
  }
  let installedReleaseVersion = initialUpdateVersion;
  try {
    const currentPath = path.join(clientUpdateDirectory, 'current.json');
    const stored = fs.existsSync(currentPath) ? JSON.parse(fs.readFileSync(currentPath, 'utf8')) : {};
    const platforms = stored.platforms || (stored.version ? { windows: stored } : {});
    installedReleaseVersion = platforms[platform]?.version || initialUpdateVersion;
  } catch (error) {
    console.error('Could not read the current client update before upload:', error);
    return res.status(500).json({ error: 'Could not read the current client update.' });
  }
  if (compareClientVersions(version, installedReleaseVersion) <= 0) return res.status(400).json({ error: `Version ${version} must be newer than the current release ${installedReleaseVersion}.` });
  const uploadId = crypto.randomBytes(18).toString('hex');
  const totalChunks = Math.ceil(bytes / clientUpdateChunkSize);
  const directory = path.join(clientUpdateIncomingDirectory, uploadId);
  fs.mkdirSync(directory, { recursive: true });
  clientUpdateUploadSessions.set(uploadId, { version, platform, size: bytes, totalChunks, directory, startedAt: Date.now() });
  res.status(201).json({ uploadId, chunkSize: clientUpdateChunkSize, totalChunks });
});

app.put('/api/admin/client-updates/upload/:uploadId/:chunkIndex', requireAdmin, express.raw({ type: 'application/octet-stream', limit: clientUpdateChunkSize }), (req, res) => {
  const { uploadId } = req.params;
  const session = clientUpdateUploadSessions.get(uploadId);
  const indexText = req.params.chunkIndex;
  const index = Number(indexText);
  if (!/^[a-f0-9]{36}$/.test(uploadId) || !session || !/^\d+$/.test(indexText) || !Number.isInteger(index) || index < 0 || index >= session.totalChunks) return res.status(404).json({ error: 'Upload session not found. Start the upload again.' });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Upload chunk is empty.' });
  const expectedSize = Math.min(clientUpdateChunkSize, session.size - index * clientUpdateChunkSize);
  if (req.body.length !== expectedSize) return res.status(400).json({ error: 'Upload chunk size did not match.' });
  try {
    fs.writeFileSync(path.join(session.directory, `${index}.part`), req.body, { flag: 'wx' });
    res.status(201).json({ success: true, index });
  } catch (error) {
    res.status(error.code === 'EEXIST' ? 409 : 500).json({ error: error.code === 'EEXIST' ? 'This upload chunk was already received.' : 'Could not save the upload chunk.' });
  }
});

app.post('/api/admin/client-updates/upload/:uploadId/finish', requireAdmin, async (req, res) => {
  const { uploadId } = req.params;
  const session = clientUpdateUploadSessions.get(uploadId);
  if (!/^[a-f0-9]{36}$/.test(uploadId) || !session) return res.status(404).json({ error: 'Upload session not found. Start the upload again.' });
  const platformConfig = clientUpdatePlatforms[session.platform];
  if (!platformConfig) return res.status(400).json({ error: 'Upload platform is not supported.' });
  const platformSuffix = session.platform === 'linux' ? '-linux-x64' : session.platform === 'macos' ? '-mac-universal' : '';
  const fileName = `${platformConfig.prefix}${session.version}${platformSuffix}${platformConfig.extension}`;
  const tempPath = path.join(clientUpdateDirectory, `.${fileName}.${uploadId}.tmp`);
  const filePath = path.join(clientUpdateDirectory, fileName);
  try {
    for (let index = 0; index < session.totalChunks; index += 1) {
      const chunkPath = path.join(session.directory, `${index}.part`);
      const expectedSize = Math.min(clientUpdateChunkSize, session.size - index * clientUpdateChunkSize);
      if (!fs.existsSync(chunkPath) || fs.statSync(chunkPath).size !== expectedSize) return res.status(400).json({ error: `Upload chunk ${index + 1} is missing or incomplete.` });
    }
    const chunkStream = Readable.from((async function* streamChunks() {
      for (let index = 0; index < session.totalChunks; index += 1) {
        for await (const chunk of fs.createReadStream(path.join(session.directory, `${index}.part`))) yield chunk;
      }
    })());
    await pipeline(chunkStream, fs.createWriteStream(tempPath, { flags: 'wx' }));
    const signature = Buffer.alloc(Buffer.byteLength(platformConfig.signature));
    const descriptor = fs.openSync(tempPath, 'r');
    try { fs.readSync(descriptor, signature, 0, signature.length, 0); } finally { fs.closeSync(descriptor); }
    const expectedSignature = Buffer.from(platformConfig.signature, 'binary');
    if (fs.statSync(tempPath).size !== session.size || !signature.equals(expectedSignature)) {
      throw new Error(`The uploaded file is not a valid ${session.platform} update package.`);
    }
    const hash = crypto.createHash('sha512');
    for await (const chunk of fs.createReadStream(tempPath)) hash.update(chunk);
    const sha512 = hash.digest('base64');
    fs.renameSync(tempPath, filePath);
    const releaseDate = new Date().toISOString();
    const latestManifest = [
      `version: ${session.version}`,
      'files:',
      `  - url: ${fileName}`,
      `    sha512: ${sha512}`,
      `    size: ${session.size}`,
      `path: ${fileName}`,
      `sha512: ${sha512}`,
      `releaseDate: ${releaseDate}`,
      '',
    ].join('\n');
    const manifestTemp = path.join(clientUpdateDirectory, `.${platformConfig.manifest}.${uploadId}.tmp`);
    fs.writeFileSync(manifestTemp, latestManifest, { flag: 'wx' });
    fs.renameSync(manifestTemp, path.join(clientUpdateDirectory, platformConfig.manifest));
    const currentTemp = path.join(clientUpdateDirectory, `.current.${uploadId}.tmp`);
    const currentPath = path.join(clientUpdateDirectory, 'current.json');
    const stored = fs.existsSync(currentPath) ? JSON.parse(fs.readFileSync(currentPath, 'utf8')) : {};
    const currentPlatforms = stored.platforms || (stored.version ? { windows: stored } : {});
    const currentRelease = { platform: session.platform, version: session.version, fileName, size: session.size, sha512, releaseDate };
    currentPlatforms[session.platform] = currentRelease;
    fs.writeFileSync(currentTemp, JSON.stringify({ platforms: currentPlatforms }, null, 2), { flag: 'wx' });
    fs.renameSync(currentTemp, path.join(clientUpdateDirectory, 'current.json'));
    fs.rmSync(session.directory, { recursive: true, force: true });
    clientUpdateUploadSessions.delete(uploadId);
    res.status(201).json({ success: true, current: currentRelease });
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not publish this client update.' });
  }
});

app.post('/api/admin/session', (req, res) => {
  const supplied = typeof req.body?.secret === 'string' ? Buffer.from(req.body.secret) : Buffer.alloc(0);
  const expected = Buffer.from(adminSecret);
  const keyMatches = Boolean(adminSecret && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected));
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? Buffer.from(req.body.password) : Buffer.alloc(0);
  const expectedEmail = Buffer.from(adminEmail);
  const expectedPassword = Buffer.from(adminPassword);
  const emailMatches = Boolean(adminEmail && adminPassword && email && Buffer.from(email).length === expectedEmail.length && crypto.timingSafeEqual(Buffer.from(email), expectedEmail) && password.length === expectedPassword.length && crypto.timingSafeEqual(password, expectedPassword));
  if (!keyMatches && !emailMatches) return res.status(401).json({ error: 'Invalid admin credentials.' });
  res.json({ token: jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' }) });
});

app.get('/api/admin/cosmetics', requireAdmin, (_req, res) => res.json({ cosmetics: db.cosmetics }));
app.put('/api/admin/cosmetics', requireAdmin, (req, res) => {
  const { id, name, description, category, price, accent, modelUrl, active } = req.body || {};
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(id) || typeof name !== 'string' || name.trim().length < 2 || name.length > 60 || typeof description !== 'string' || description.length > 300 || typeof category !== 'string' || category.length > 40 || !Number.isSafeInteger(Number(price)) || Number(price) < 0 || Number(price) > 1_000_000 || typeof accent !== 'string' || !/^#[\da-fA-F]{6}$/.test(accent) || (modelUrl && (typeof modelUrl !== 'string' || !modelUrl.startsWith('/media/cosmetics/')))) return res.status(400).json({ error: 'Check the cosmetic fields and try again.' });
  const cosmetic = { id, name: name.trim(), description: description.trim(), category: category.trim(), price: Number(price), accent, modelUrl: modelUrl || null, active: active !== false };
  const index = db.cosmetics.findIndex((item) => item.id === id);
  if (index < 0) db.cosmetics.push(cosmetic); else db.cosmetics[index] = cosmetic;
  saveDb(db);
  res.json({ cosmetic });
});
app.delete('/api/admin/cosmetics/:id', requireAdmin, (req, res) => {
  db.cosmetics = db.cosmetics.filter((item) => item.id !== req.params.id);
  saveDb(db);
  res.json({ success: true });
});
app.post('/api/admin/redeem-codes', requireAdmin, (req, res) => {
  const amount = Number(req.body?.amount);
  const maxClaims = Number(req.body?.maxClaims ?? 1);
  const count = Number(req.body?.count ?? 1);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000 || !Number.isSafeInteger(maxClaims) || maxClaims < 1 || maxClaims > 10_000 || !Number.isSafeInteger(count) || count < 1 || count > 100) return res.status(400).json({ error: 'Bacoins, claim limit, or count is out of range.' });
  const codes = Array.from({ length: count }, () => {
    const code = `BAYON-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    db.redeemCodes.push({ codeHash: crypto.createHash('sha256').update(code).digest('hex'), amount, maxClaims, claims: [], createdAt: new Date().toISOString() });
    return code;
  });
  saveDb(db);
  res.status(201).json({ codes, amount, maxClaims });
});
app.get('/api/admin/redeem-codes', requireAdmin, (_req, res) => {
  const codes = db.redeemCodes.map((record) => {
    const claims = Array.isArray(record.claims) ? record.claims.length : 0;
    const expired = Boolean(record.expiresAt && Date.parse(record.expiresAt) < Date.now());
    const status = record.disabled ? 'Disabled' : expired ? 'Expired' : claims >= Number(record.maxClaims) ? 'Fully claimed' : 'Active';
    return { id: record.codeHash, amount: record.amount, maxClaims: record.maxClaims, claims, createdAt: record.createdAt, expiresAt: record.expiresAt || null, disabled: Boolean(record.disabled), status };
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ codes });
});
app.patch('/api/admin/redeem-codes/:id', requireAdmin, (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.id) || typeof req.body?.disabled !== 'boolean') return res.status(400).json({ error: 'Invalid redeem code update.' });
  const record = db.redeemCodes.find((item) => item.codeHash === req.params.id);
  if (!record) return res.status(404).json({ error: 'Redeem code not found.' });
  record.disabled = req.body.disabled;
  saveDb(db);
  res.json({ success: true });
});
app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const users = db.users.map((user) => ({ id: user.id, username: user.username, email: user.email || user.googleEmail || user.betaContactEmail || null, bacoins: Number(user.bacoins) || 0 }));
  res.json({ users });
});
app.post('/api/admin/users/:id/bacoins', requireAdmin, (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000) return res.status(400).json({ error: 'Enter an amount from 1 to 1,000,000.' });
  const user = db.users.find((candidate) => candidate.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Bayon account not found.' });
  user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
  if (user.bacoins + amount > Number.MAX_SAFE_INTEGER) return res.status(400).json({ error: 'This account balance is too large to adjust.' });
  user.bacoins += amount;
  db.adminBacoinsAdjustments ??= [];
  db.adminBacoinsAdjustments.push({ id: crypto.randomUUID(), userId: user.id, amount, createdAt: new Date().toISOString() });
  saveDb(db);
  res.json({ success: true, user: { id: user.id, username: user.username, bacoins: user.bacoins } });
});
app.post('/api/admin/assets', requireAdmin, (req, res) => {
  const { fileName, mimeType, base64 } = req.body || {};
  const allowed = { 'model/gltf-binary': '.glb', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
  if (!allowed[mimeType] || typeof base64 !== 'string' || base64.length > 16_800_000) return res.status(400).json({ error: 'Upload a GLB model or PNG, JPG, WEBP, or GIF image smaller than 12 MB.' });
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024 || (mimeType === 'model/gltf-binary' && bytes.subarray(0, 4).toString() !== 'glTF')) return res.status(400).json({ error: 'The uploaded file is invalid or too large.' });
  const id = crypto.randomBytes(16).toString('hex');
  const ext = allowed[mimeType];
  fs.writeFileSync(path.join(mediaDirectory, `${id}${ext}`), bytes, { flag: 'wx' });
  res.status(201).json({ url: `/media/cosmetics/${id}${ext}`, name: path.basename(String(fileName || 'asset'), ext) });
});

if (adminPanelPath) {
  const adminPages = ['/create-codes', '/redeem-manager', '/account', '/upload-3d-cosmetic', '/partner-servers', '/client-feedback', '/client-updates', '/client-notifications', '/upload-client-update', '/cosmetic', '/cosmatic'];
  app.get([adminPanelPath, ...adminPages.map((page) => `${adminPanelPath}${page}`)], (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
} else {
  app.get('/__admin_disabled__', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
}

app.get('/api/bacoins/me', authenticatedUser, requireLinkedOfflineProfile, (req, res) => {
  res.json({ user: publicBayonUser(req.bayonUser) });
});

app.post('/api/bacoins/redeem', authenticatedUser, requireLinkedOfflineProfile, (req, res) => {
  const normalized = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!normalized || normalized.length > 80) return res.status(400).json({ error: 'Enter a valid redeem code.' });
  const codeHash = crypto.createHash('sha256').update(normalized).digest('hex');
  const record = db.redeemCodes.find((item) => item.codeHash === codeHash);
  if (!record || record.disabled || (record.expiresAt && Date.parse(record.expiresAt) < Date.now())) {
    return res.status(400).json({ error: 'This redeem code is invalid or expired.' });
  }
  record.claims ??= [];
  if (record.claims.some((claim) => claim.userId === req.bayonUser.id)) return res.status(409).json({ error: 'This code has already been used on your account.' });
  if (record.claims.length >= record.maxClaims) return res.status(409).json({ error: 'This redeem code has reached its claim limit.' });
  const amount = Number(record.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || req.bayonUser.bacoins + amount > Number.MAX_SAFE_INTEGER) {
    return res.status(400).json({ error: 'This redeem code is not configured correctly.' });
  }
  record.claims.push({ userId: req.bayonUser.id, claimedAt: new Date().toISOString() });
  req.bayonUser.bacoins += amount;
  saveDb(db);
  res.json({ user: publicBayonUser(req.bayonUser), credited: amount });
});

app.post('/api/cosmetics/:id/purchase', authenticatedUser, requireLinkedOfflineProfile, (req, res) => {
  const cosmetic = db.cosmetics.find((item) => item.id === req.params.id && item.active !== false);
  if (!cosmetic) return res.status(404).json({ error: 'Cosmetic not found.' });
  if (req.bayonUser.ownedCosmetics.includes(cosmetic.id)) return res.status(409).json({ error: 'You already own this cosmetic.' });
  if (req.bayonUser.bacoins < cosmetic.price) return res.status(400).json({ error: 'You do not have enough Bacoins.' });
  req.bayonUser.bacoins -= cosmetic.price;
  req.bayonUser.ownedCosmetics.push(cosmetic.id);
  saveDb(db);
  res.json({ user: publicBayonUser(req.bayonUser), cosmetic });
});

app.post('/api/cosmetics/equip', authenticatedUser, requireLinkedOfflineProfile, (req, res) => {
  const id = req.body?.id;
  if (id !== null && (typeof id !== 'string' || !req.bayonUser.ownedCosmetics.includes(id))) {
    return res.status(400).json({ error: 'You can equip only cosmetics you own.' });
  }
  req.bayonUser.equippedCosmetic = id;
  saveDb(db);
  res.json({ user: publicBayonUser(req.bayonUser) });
});

// Create codes from a trusted admin environment only. The plaintext code is
// returned once; only its hash is persisted in db.json.
app.post('/api/bacoins/admin/codes', (req, res) => {
  const adminKey = process.env.BACOIN_ADMIN_KEY;
  if (!adminKey || req.get('x-bayon-admin-key') !== adminKey) return res.status(401).json({ error: 'Unauthorized.' });
  const amount = Number(req.body?.amount);
  const maxClaims = Number(req.body?.maxClaims ?? 1);
  const count = Number(req.body?.count ?? 1);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000 || !Number.isSafeInteger(maxClaims) || maxClaims < 1 || maxClaims > 10_000 || !Number.isSafeInteger(count) || count < 1 || count > 100) {
    return res.status(400).json({ error: 'amount, maxClaims, or count is out of range.' });
  }
  const codes = Array.from({ length: count }, () => {
    const code = `BAYON-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    db.redeemCodes.push({ codeHash: crypto.createHash('sha256').update(code).digest('hex'), amount, maxClaims, claims: [], createdAt: new Date().toISOString() });
    return code;
  });
  saveDb(db);
  res.status(201).json({ codes, amount, maxClaims });
});

// ── Partner Servers Directory & Live Status ───────────────────────────────────
function loadServersConfig() {
  if (!fs.existsSync(serversFile)) return [];
  try {
    const content = fs.readFileSync(serversFile, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error('Partner server configuration must be a JSON array.');
    return parsed;
  } catch (err) {
    console.error('Failed reading servers.json:', err);
    throw new Error('Could not read partner server configuration.');
  }
}

function saveServersConfig(list) {
  try {
    fs.mkdirSync(path.dirname(serversFile), { recursive: true });
    fs.writeFileSync(serversFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed saving servers.json:', err);
    throw new Error('Could not save partner server configuration.');
  }
}

// In-memory cache for live pinging: { [address]: { timestamp, data } }
const pingCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function fetchServerPing(address) {
  return new Promise((resolve) => {
    const cached = pingCache.get(address);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return resolve(cached.data);
    }

    const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`;
    const req = https.get(url, { headers: { 'User-Agent': 'BayonClient/1.0' }, timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const online = Boolean(parsed.online);
          const onlinePlayers = parsed.players?.online ?? 0;
          const maxPlayers = parsed.players?.max ?? 0;
          const formattedCount = onlinePlayers >= 1000 ? `${(onlinePlayers / 1000).toFixed(1)}k` : `${onlinePlayers}`;

          const icon = parsed.icon || `https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(address)}`;
          const result = {
            online,
            onlinePlayers,
            maxPlayers,
            formattedCount,
            motd: parsed.motd?.clean?.[0] || '',
            icon,
          };
          pingCache.set(address, { timestamp: Date.now(), data: result });
          resolve(result);
        } catch {
          resolve({
            online: false,
            onlinePlayers: 0,
            maxPlayers: 0,
            formattedCount: '0',
            motd: '',
            icon: `https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(address)}`,
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        online: false,
        onlinePlayers: 0,
        maxPlayers: 0,
        formattedCount: '0',
        motd: '',
        icon: `https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(address)}`,
      });
    });

    req.on('error', () => {
      resolve({
        online: false,
        onlinePlayers: 0,
        maxPlayers: 0,
        formattedCount: '0',
        motd: '',
        icon: `https://eu.mc-api.net/v3/server/favicon/${encodeURIComponent(address)}`,
      });
    });
  });
}

// Get all partner servers with live updated player counts and status
app.get('/api/servers', async (req, res) => {
  try {
    const servers = loadServersConfig();
    const enriched = await Promise.all(
      servers.map(async (server) => {
        const ping = await fetchServerPing(server.address);
        return {
          ...server,
          ...ping,
        };
      })
    );
    res.json({ servers: enriched });
  } catch (err) {
    console.error('Error fetching partner servers:', err);
    res.status(500).json({ error: 'Failed to fetch servers.' });
  }
});

const partnerServerColors = new Set(['server-blue', 'server-yellow', 'server-pink', 'server-red', 'server-gray', 'server-crimson']);

function isValidServerAddress(address) {
  if (address.length > 253 || /[\s/\\?#@]/.test(address)) return false;
  const match = address.match(/^(?:\[([0-9a-fA-F:.]+)\]|((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*))(?::(\d{1,5}))?$/);
  if (!match) return false;
  const port = match[3];
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535);
}

app.get('/api/admin/servers', requireAdmin, (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ servers: loadServersConfig() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/servers', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  const requestedId = typeof req.body?.id === 'string' ? req.body.id.trim().toLowerCase() : '';
  const icon = typeof req.body?.icon === 'string' ? req.body.icon.trim() : '';
  const color = typeof req.body?.color === 'string' ? req.body.color : 'server-blue';
  const flag = typeof req.body?.flag === 'string' ? req.body.flag.trim() : 'Partner';

  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Enter a server name between 2 and 60 characters.' });
  if (!isValidServerAddress(address)) return res.status(400).json({ error: 'Enter a valid server address, optionally followed by a port.' });
  if (requestedId && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(requestedId)) return res.status(400).json({ error: 'Server ID must use lowercase letters, numbers, and dashes.' });
  if (!partnerServerColors.has(color)) return res.status(400).json({ error: 'Choose a valid server color.' });
  if (flag.length > 24) return res.status(400).json({ error: 'Server label must be 24 characters or fewer.' });
  if (icon.length > 2048 || (icon.length > 4 && !icon.startsWith('https://'))) return res.status(400).json({ error: 'Server icon must be a short label or an HTTPS image URL.' });

  try {
    const list = loadServersConfig();
    let id = requestedId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `server-${crypto.randomUUID().slice(0, 8)}`;
    if (!requestedId) {
      const baseId = id;
      let suffix = 2;
      while (list.some((server) => server.id === id)) id = `${baseId}-${suffix++}`;
    }
    const existingIndex = list.findIndex((server) => server.id === id);
    const server = { id, name, address, icon: icon || name.charAt(0).toUpperCase(), color, flag: flag || 'Partner' };
    if (existingIndex >= 0) list[existingIndex] = { ...list[existingIndex], ...server };
    else list.push(server);
    saveServersConfig(list);
    res.status(existingIndex >= 0 ? 200 : 201).json({ success: true, server });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not save partner server.' });
  }
});

app.delete('/api/admin/servers/:id', requireAdmin, (req, res) => {
  try {
    const list = loadServersConfig();
    const filtered = list.filter((server) => server.id !== req.params.id);
    if (filtered.length === list.length) return res.status(404).json({ error: 'Server not found.' });
    saveServersConfig(filtered);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not remove partner server.' });
  }
});

// ── 24/7 Keep-Alive Self-Ping ─────────────────────────────────────────────────
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL || 'https://bayon-backend.onrender.com';
if (keepAliveUrl) {
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  setInterval(() => {
    try {
      const pingEndpoint = `${keepAliveUrl.replace(/\/+$/, '')}/api/health`;
      https.get(pingEndpoint, (res) => {
        console.log(`[Keep-Alive 24/7] Pinged ${pingEndpoint} -> status ${res.statusCode}`);
      }).on('error', (err) => {
        console.warn(`[Keep-Alive 24/7] Ping error: ${err.message}`);
      });
    } catch (err) {
      console.warn(`[Keep-Alive 24/7] Loop error: ${err.message}`);
    }
  }, PING_INTERVAL_MS);
  console.log(`[Keep-Alive 24/7] Active: pinging ${keepAliveUrl} every 10 min to keep awake 24/7`);
}

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bayon Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Bayon Server] Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`[Bayon Server] Friends API:  http://0.0.0.0:${PORT}/api/friends`);
  console.log(`[Bayon Server] Servers API:  http://0.0.0.0:${PORT}/api/servers`);
  if (adminPanelPath) console.log(`[Bayon Server] Private store admin route: ${adminPanelPath}`);
});
