import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
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

app.use(express.json());

// Load in-memory DB state with file sync
let db = loadDb();

// ── Root & Health ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'Bayon Client API',
    status: 'online',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      friends: '/api/friends',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
      },
    },
  });
});

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
});

