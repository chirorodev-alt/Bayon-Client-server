import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');

const initialData = {
  users: [],
  friends: [],
  redeemCodes: [],
  cosmetics: [],
  adminBacoinsAdjustments: [],
};

function ensureDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

export function loadDb() {
  ensureDir();
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
  try {
    const raw = fs.readFileSync(dbFile, 'utf-8');
    const data = JSON.parse(raw);
    data.users ??= [];
    data.friends ??= [];
    data.redeemCodes ??= [];
    data.cosmetics ??= [];
    delete data.betaPairingCodes;
    data.adminBacoinsAdjustments ??= [];
    return data;
  } catch (err) {
    console.error('Failed to read db file, using memory fallback:', err);
    return initialData;
  }
}

export function saveDb(data) {
  ensureDir();
  try {
    const tempFile = `${dbFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, dbFile);
  } catch (err) {
    console.error('Failed to persist db file:', err);
  }
}

