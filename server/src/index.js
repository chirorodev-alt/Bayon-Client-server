import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadDb, saveDb } from './db.js';

dotenv.config();

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

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bayon Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Bayon Server] Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`[Bayon Server] Friends API:  http://0.0.0.0:${PORT}/api/friends`);
});

