require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { signToken, verifyToken } = require('./token');

const {
  PORT = '8787',
  PAYWALL_ORIGIN,
  LOGIN_USERNAME,
  LOGIN_PASSWORD,
  DOWNLOAD_FILE_PATH,
  DOWNLOAD_URL,
  TOKEN_SECRET,
  TOKEN_TTL_SECONDS = '900',
} = process.env;

if (!LOGIN_USERNAME) throw new Error('Missing LOGIN_USERNAME');
if (!LOGIN_PASSWORD) throw new Error('Missing LOGIN_PASSWORD');
if (!TOKEN_SECRET) throw new Error('Missing TOKEN_SECRET');

const absoluteDownloadPath = DOWNLOAD_FILE_PATH ? path.resolve(DOWNLOAD_FILE_PATH) : null;
if (absoluteDownloadPath && !fs.existsSync(absoluteDownloadPath)) {
  console.warn(`Warning: DOWNLOAD_FILE_PATH does not exist: ${absoluteDownloadPath}`);
}
if (!absoluteDownloadPath && !DOWNLOAD_URL) {
  console.warn('Warning: Neither DOWNLOAD_FILE_PATH nor DOWNLOAD_URL is set. /api/download will return 503.');
}

const app = express();

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
  const exp = Date.now() + Number(TOKEN_TTL_SECONDS) * 1000;
  const token = signToken({ sub: subject, exp }, TOKEN_SECRET);
  return { token, expiresAt: exp };
}

app.post('/api/auth/login', (req, res) => {
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing username or password' });
  }

  const usernameOk = safeEquals(username, LOGIN_USERNAME);
  const passwordOk = safeEquals(password, LOGIN_PASSWORD);
  if (!usernameOk || !passwordOk) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  const { token, expiresAt } = createDownloadToken(username);
  return res.json({ ok: true, token, expiresAt });
});

app.get('/api/download', (req, res) => {
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
  res.json({
    ok: true,
    authMode: 'login',
    downloadMode: DOWNLOAD_URL ? 'redirect' : (absoluteDownloadPath ? 'file' : 'unconfigured'),
  });
});

app.listen(Number(PORT), () => {
  console.log(`Paywall API listening on http://localhost:${PORT}`);
});
