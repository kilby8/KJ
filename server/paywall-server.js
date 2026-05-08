require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { signToken, verifyToken } = require('./token');
const { initAuthStore } = require('./auth-store');

const {
  PORT = '8787',
  PAYWALL_ORIGIN,
  AUTH_DB_PATH,
  DOWNLOAD_FILE_PATH,
  DOWNLOAD_URL,
  TOKEN_SECRET,
  TOKEN_TTL_SECONDS = '900',
} = process.env;

if (!TOKEN_SECRET) {
  console.warn('Warning: Missing TOKEN_SECRET. Auth and download endpoints will return 503 until set.');
}

const absoluteDownloadPath = DOWNLOAD_FILE_PATH ? path.resolve(DOWNLOAD_FILE_PATH) : null;
if (absoluteDownloadPath && !fs.existsSync(absoluteDownloadPath)) {
  console.warn(`Warning: DOWNLOAD_FILE_PATH does not exist: ${absoluteDownloadPath}`);
}
if (!absoluteDownloadPath && !DOWNLOAD_URL) {
  console.warn('Warning: Neither DOWNLOAD_FILE_PATH nor DOWNLOAD_URL is set. /api/download will return 503.');
}

const app = express();
let authStore;

app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = PAYWALL_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function safeEquals(a, b) {
  const aBuf = Buffer.from(String(a || ''), 'utf8');
  const bBuf = Buffer.from(String(b || ''), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function createDownloadToken(subject) {
  if (!TOKEN_SECRET) {
    throw new Error('Server not configured: missing TOKEN_SECRET');
  }
  const exp = Date.now() + Number(TOKEN_TTL_SECONDS) * 1000;
  const token = signToken({ sub: subject, exp }, TOKEN_SECRET);
  return { token, expiresAt: exp };
}

app.post('/api/auth/login', (req, res) => {
  if (!TOKEN_SECRET) {
    return res.status(503).json({ ok: false, error: 'Server not configured: missing TOKEN_SECRET' });
  }
  if (!authStore) {
    return res.status(503).json({ ok: false, error: 'Auth store unavailable' });
  }

  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing username or password' });
  }

  const user = authStore.getUser(username);
  const usernameOk = safeEquals(username, user?.username || '');
  const passwordOk = safeEquals(password, user?.password || '');
  if (!user || !usernameOk || !passwordOk) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  const { token, expiresAt } = createDownloadToken(username);
  return res.json({ ok: true, token, expiresAt });
});

app.get('/api/auth/login', (_req, res) => {
  return res.status(405).json({
    ok: false,
    error: 'Method Not Allowed. Use POST /api/auth/login with JSON body: { username, password }',
  });
});

app.get('/api/download', (req, res) => {
  if (!TOKEN_SECRET) {
    return res.status(503).json({ ok: false, error: 'Server not configured: missing TOKEN_SECRET' });
  }
  const token = req.query.token;
  const parsed = verifyToken(token, TOKEN_SECRET);
  if (!parsed) return res.status(403).json({ ok: false, error: 'Invalid or expired token' });

  if (DOWNLOAD_URL) {
    return res.redirect(302, DOWNLOAD_URL);
  }

  if (absoluteDownloadPath && fs.existsSync(absoluteDownloadPath)) {
    return res.download(absoluteDownloadPath, path.basename(absoluteDownloadPath));
  }

  return res.status(503).json({ ok: false, error: 'Download not configured on server. Set DOWNLOAD_URL or DOWNLOAD_FILE_PATH.' });
});

app.get('/api/health', (_req, res) => {
  const missing = [];
  if (!TOKEN_SECRET) missing.push('TOKEN_SECRET');
  if (!DOWNLOAD_URL && !absoluteDownloadPath) missing.push('DOWNLOAD_URL|DOWNLOAD_FILE_PATH');
  res.json({
    ok: missing.length === 0,
    authMode: 'login',
    authStore: authStore ? 'sqlite' : 'unavailable',
    authDbPath: authStore?.dbPath || null,
    authDbPersistence: authStore?.persistenceMode || null,
    downloadMode: DOWNLOAD_URL ? 'redirect' : (absoluteDownloadPath ? 'file' : 'unconfigured'),
    missingConfig: missing,
  });
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'ikfs-paywall-api',
    authMode: 'login',
    endpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/download?token=...'
    ]
  });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

async function start() {
  authStore = await initAuthStore(AUTH_DB_PATH);
  app.listen(Number(PORT), () => {
    console.log(`Paywall API listening on http://localhost:${PORT}`);
    console.log(`Auth DB ready at ${authStore.dbPath} (seeded admin/admin123)`);
  });
}

start().catch((err) => {
  console.error('Failed to start paywall server:', err?.message || err);
  process.exit(1);
});
