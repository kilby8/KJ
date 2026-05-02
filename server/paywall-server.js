require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const {
  PORT = '8787',
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_ENV = 'live',
  PAYPAL_API_BASE,
  PAYWALL_SUCCESS_URL,
  PAYWALL_CANCEL_URL,
  PAYWALL_ORIGIN,
  PAYPAL_AMOUNT = '29.00',
  PAYPAL_CURRENCY = 'USD',
  DOWNLOAD_FILE_PATH,
  TOKEN_SECRET,
  TOKEN_TTL_SECONDS = '900',
} = process.env;

if (!PAYPAL_CLIENT_ID) throw new Error('Missing PAYPAL_CLIENT_ID');
if (!PAYPAL_CLIENT_SECRET) throw new Error('Missing PAYPAL_CLIENT_SECRET');
if (!DOWNLOAD_FILE_PATH) throw new Error('Missing DOWNLOAD_FILE_PATH');
if (!TOKEN_SECRET) throw new Error('Missing TOKEN_SECRET');

const absoluteDownloadPath = path.resolve(DOWNLOAD_FILE_PATH);
if (!fs.existsSync(absoluteDownloadPath)) {
  throw new Error(`DOWNLOAD_FILE_PATH does not exist: ${absoluteDownloadPath}`);
}

const paypalBase = PAYPAL_API_BASE || (PAYPAL_ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com');

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

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  const fixed = pad ? `${b64}${'='.repeat(4 - pad)}` : b64;
  return Buffer.from(fixed, 'base64').toString('utf8');
}

function signToken(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = b64url(crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  const data = JSON.parse(fromB64url(payload));
  if (!data?.exp || Date.now() > data.exp) return null;
  return data;
}

async function getPayPalAccessToken() {
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description || 'Failed to get PayPal access token');
  }

  return data.access_token;
}

function resolveSuccessUrl(origin) {
  if (PAYWALL_SUCCESS_URL) return PAYWALL_SUCCESS_URL;
  if (!origin) throw new Error('Missing success URL context; set PAYWALL_SUCCESS_URL');
  return `${origin}?paid=1`;
}

function resolveCancelUrl(origin) {
  if (PAYWALL_CANCEL_URL) return PAYWALL_CANCEL_URL;
  if (!origin) throw new Error('Missing cancel URL context; set PAYWALL_CANCEL_URL');
  return `${origin}?canceled=1`;
}

app.post('/api/paypal/order', async (req, res) => {
  try {
    const origin = req.body?.origin;
    const amount = req.body?.amount || PAYPAL_AMOUNT;
    const currency = req.body?.currency || PAYPAL_CURRENCY;

    const accessToken = await getPayPalAccessToken();
    const createRes = await fetch(`${paypalBase}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: currency, value: amount },
          description: 'IKFS download access',
        }],
        application_context: {
          return_url: resolveSuccessUrl(origin),
          cancel_url: resolveCancelUrl(origin),
          user_action: 'PAY_NOW',
        },
      }),
    });

    const order = await createRes.json();
    if (!createRes.ok || !order?.id) {
      return res.status(400).json({ ok: false, error: order?.message || 'Failed to create PayPal order' });
    }

    const approvalUrl = (order.links || []).find(l => l.rel === 'approve')?.href;
    return res.json({ ok: true, orderId: order.id, approvalUrl });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'Unable to create PayPal order' });
  }
});

app.get('/api/download/token', async (req, res) => {
  const orderId = req.query.order_id || req.query.token;
  if (!orderId) return res.status(400).json({ ok: false, error: 'Missing order_id' });

  try {
    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const capture = await captureRes.json();
    if (!captureRes.ok || capture?.status !== 'COMPLETED') {
      return res.status(403).json({ ok: false, error: capture?.message || 'Payment not completed' });
    }

    const exp = Date.now() + Number(TOKEN_TTL_SECONDS) * 1000;
    const token = signToken({ oid: orderId, exp });
    return res.json({ ok: true, token, expiresAt: exp });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || 'Unable to verify PayPal payment' });
  }
});

app.get('/api/download', (req, res) => {
  const token = req.query.token;
  const parsed = verifyToken(token);
  if (!parsed) return res.status(403).json({ ok: false, error: 'Invalid or expired token' });

  return res.download(absoluteDownloadPath, path.basename(absoluteDownloadPath));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: 'paypal' });
});

app.listen(Number(PORT), () => {
  console.log(`Paywall API listening on http://localhost:${PORT}`);
});
