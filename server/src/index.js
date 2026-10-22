import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadDb, saveDb } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serversFile = path.join(__dirname, '..', 'data', 'servers.json');

const app = express();
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
);

app.use(express.json({ limit: '18mb' }));

// Load in-memory DB state with file sync
let db = loadDb();

// ── Root & Health ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'store.html')));

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
const adminPanelSecret = process.env.ADMIN_PANEL_SECRET || '';
const adminPanelPath = adminPanelSecret ? `/admin-panel-${adminPanelSecret}` : '';
const mediaDirectory = path.join(__dirname, '..', 'data', 'cosmetics');
fs.mkdirSync(mediaDirectory, { recursive: true });
app.use('/media/cosmetics', express.static(mediaDirectory, { fallthrough: false, maxAge: '1d' }));

app.get('/api/auth/google/config', (_req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

app.get('/api/auth/supabase/config', (_req, res) => {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '') || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  res.json({ configured: Boolean(url && anonKey), url: url || null, anonKey: anonKey || null });
});

app.post('/api/auth/supabase/link', async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const accessToken = req.body?.supabaseAccessToken;
  const profileId = req.body?.offlineProfileId;
  const profileUsername = req.body?.offlineUsername;
  if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Supabase Auth is not configured on the Bayon server yet.' });
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) return res.status(400).json({ error: 'Supabase sign-in did not return a valid session.' });
  if (typeof profileId !== 'string' || profileId.length < 8 || profileId.length > 100 || typeof profileUsername !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(profileUsername)) {
    return res.status(400).json({ error: 'Create or select an offline Minecraft profile first.' });
  }

  let authResponse;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  } catch {
    return res.status(502).json({ error: 'Bayon could not reach Supabase Auth. Check the Supabase project URL.' });
  }
  if (!authResponse.ok) return res.status(401).json({ error: 'Supabase could not verify this session. Request a new email link and try again.' });
  const identity = await authResponse.json();
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (!email || !identity.email_confirmed_at) return res.status(403).json({ error: 'Verify this email in Supabase before connecting your profile.' });

  let user = db.users.find((candidate) => [candidate.email, candidate.googleEmail].some((value) => typeof value === 'string' && value.toLowerCase() === email));
  let isNewUser = false;
  if (!user) {
    const base = `e_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 10)}`;
    let username = base;
    let suffix = 1;
    while (db.users.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) username = `${base.slice(0, 13)}${suffix++}`;
    user = {
      id: `user-${crypto.randomUUID()}`, username, email, emailVerifiedAt: identity.email_confirmed_at, supabaseUserId: identity.id, status: 'online',
      avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(username)}`, createdAt: new Date().toISOString(),
      bacoins: 0, ownedCosmetics: [], linkedOfflineProfiles: [],
    };
    isNewUser = true;
  }
  try {
    linkOfflineProfileToUser(user, profileId, profileUsername);
  } catch (err) {
    return res.status(err.statusCode || 409).json({ error: err.message || 'Could not connect this offline profile.' });
  }
  user.email = email;
  user.emailVerifiedAt ||= identity.email_confirmed_at;
  user.supabaseUserId = identity.id;
  user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
  user.ownedCosmetics = Array.isArray(user.ownedCosmetics) ? user.ownedCosmetics : [];
  user.status = 'online';
  if (isNewUser) db.users.push(user);
  saveDb(db);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, user: publicBayonUser(user) });
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

app.post('/api/auth/bacoins/beta', (req, res) => {
  if (process.env.BACOIN_BETA_MODE !== 'true') return res.status(404).json({ error: 'Bayon Client beta Bacoins sign-in is disabled.' });
  const profileId = req.body?.profileId;
  const profileUsername = req.body?.username;
  if (typeof profileId !== 'string' || profileId.length < 8 || profileId.length > 100 || typeof profileUsername !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(profileUsername)) return res.status(400).json({ error: 'Select a valid offline Minecraft profile first.' });
  let user = db.users.find((candidate) => candidate.linkedOfflineProfiles?.some((profile) => profile.id === profileId));
  if (!user) {
    const base = `b_${crypto.createHash('sha256').update(profileId).digest('hex').slice(0, 10)}`;
    let username = base;
    let suffix = 1;
    while (db.users.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) username = `${base.slice(0, 13)}${suffix++}`;
    user = { id: `user-${crypto.randomUUID()}`, username, status: 'online', avatarUrl: `https://mc-heads.net/avatar/${encodeURIComponent(profileUsername)}`, createdAt: new Date().toISOString(), bacoins: 0, ownedCosmetics: [], linkedOfflineProfiles: [] };
    db.users.push(user);
  }
  try { linkOfflineProfileToUser(user, profileId, profileUsername); }
  catch (error) { return res.status(409).json({ error: error.message || 'Could not create a beta Bacoins account.' }); }
  user.bacoins = Number.isSafeInteger(user.bacoins) && user.bacoins >= 0 ? user.bacoins : 0;
  user.ownedCosmetics ??= [];
  user.status = 'online';
  saveDb(db);
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, betaMode: true, token, user: publicBayonUser(user) });
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
  return { id: user.id, username: user.username, email: user.email || user.googleEmail || undefined, bacoins: user.bacoins || 0, ownedCosmetics: user.ownedCosmetics || [], equippedCosmetic: user.equippedCosmetic || null };
}

app.get('/api/cosmetics', (_req, res) => res.json({ cosmetics: db.cosmetics.filter((item) => item.active !== false) }));

app.get('/api/store/config', (_req, res) => {
  res.json({ supabaseUrl: process.env.SUPABASE_URL || null, supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null });
});

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

app.post('/api/store/auth/session', async (req, res) => {
  const accessToken = req.body?.supabaseAccessToken;
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) return res.status(400).json({ error: 'Verify your email first.' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return res.status(503).json({ error: 'Email sign-in is not configured.' });
  let response;
  try {
    response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch { return res.status(502).json({ error: 'Could not reach email verification service.' }); }
  if (!response.ok) return res.status(401).json({ error: 'That email verification link is invalid or expired.' });
  const identity = await response.json();
  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (!email || !identity.email_confirmed_at) return res.status(403).json({ error: 'Verify your email before signing in.' });
  let user = db.users.find((candidate) => candidate.supabaseUserId === identity.id || [candidate.email, candidate.googleEmail].some((value) => typeof value === 'string' && value.toLowerCase() === email));
  if (!user) {
    const base = `e_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 10)}`;
    let username = base;
    let suffix = 1;
    while (db.users.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) username = `${base.slice(0, 13)}${suffix++}`;
    user = { id: `user-${crypto.randomUUID()}`, username, email, supabaseUserId: identity.id, emailVerifiedAt: identity.email_confirmed_at, createdAt: new Date().toISOString(), bacoins: 0, ownedCosmetics: [], linkedOfflineProfiles: [] };
    db.users.push(user);
  }
  user.email = email;
  user.supabaseUserId = identity.id;
  user.emailVerifiedAt ||= identity.email_confirmed_at;
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

app.post('/api/admin/session', (req, res) => {
  const supplied = typeof req.body?.secret === 'string' ? Buffer.from(req.body.secret) : Buffer.alloc(0);
  const expected = Buffer.from(adminSecret);
  if (!adminSecret || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Invalid admin key.' });
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
app.post('/api/admin/assets', requireAdmin, (req, res) => {
  const { fileName, mimeType, base64 } = req.body || {};
  const allowed = { 'model/gltf-binary': '.glb', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  if (!allowed[mimeType] || typeof base64 !== 'string' || base64.length > 16_800_000) return res.status(400).json({ error: 'Upload a GLB model or PNG, JPG, or WEBP image smaller than 12 MB.' });
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024 || (mimeType === 'model/gltf-binary' && bytes.subarray(0, 4).toString() !== 'glTF')) return res.status(400).json({ error: 'The uploaded file is invalid or too large.' });
  const id = crypto.randomBytes(16).toString('hex');
  const ext = allowed[mimeType];
  fs.writeFileSync(path.join(mediaDirectory, `${id}${ext}`), bytes, { flag: 'wx' });
  res.status(201).json({ url: `/media/cosmetics/${id}${ext}`, name: path.basename(String(fileName || 'asset'), ext) });
});

app.get(adminPanelPath || '/__admin_disabled__', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));

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
  try {
    if (fs.existsSync(serversFile)) {
      const content = fs.readFileSync(serversFile, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Failed reading servers.json:', err);
  }
  return [];
}

function saveServersConfig(list) {
  try {
    fs.mkdirSync(path.dirname(serversFile), { recursive: true });
    fs.writeFileSync(serversFile, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed saving servers.json:', err);
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

// Add or update a partner server in servers.json
app.post('/api/servers', (req, res) => {
  const { name, address, icon, color = 'server-blue', flag = 'Partner' } = req.body || {};
  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required.' });
  }

  const list = loadServersConfig();
  const id = req.body.id || name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const existingIndex = list.findIndex((s) => s.id === id);

  const newEntry = {
    id,
    name,
    address,
    icon: icon || name.charAt(0).toUpperCase(),
    color,
    flag,
  };

  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...newEntry };
  } else {
    list.push(newEntry);
  }

  saveServersConfig(list);
  res.status(201).json({ success: true, server: newEntry });
});

// Delete a partner server
app.delete('/api/servers/:id', (req, res) => {
  const { id } = req.params;
  const list = loadServersConfig();
  const filtered = list.filter((s) => s.id !== id);

  if (filtered.length === list.length) {
    return res.status(404).json({ error: 'Server not found.' });
  }

  saveServersConfig(filtered);
  res.json({ success: true, message: 'Server removed.' });
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

