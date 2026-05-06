(function () {
  const cfg = window.PAYWALL_CONFIG || {};

  const els = {
    priceLabel: document.getElementById('priceLabel'),
    buyNowBtn: document.getElementById('buyNowBtn'),
    paidBtn: document.getElementById('paidBtn'),
    status: document.getElementById('status'),
    downloadSection: document.getElementById('downloadSection'),
    downloadBtn: document.getElementById('downloadBtn'),
  };

  const storageKey = cfg.storageKey || 'ikfs_download_unlocked';
  const apiStorageKey = `${storageKey}_api_base`;
  const hasPayment = () => localStorage.getItem(storageKey) === '1';
  const setPayment = () => localStorage.setItem(storageKey, '1');

  function setStatus(text) {
    els.status.textContent = text || '';
  }

  function resolveApiBase() {
    const current = new URL(window.location.href);
    const queryApi = current.searchParams.get('api');
    if (queryApi) {
      localStorage.setItem(apiStorageKey, queryApi);
      return queryApi;
    }
    return localStorage.getItem(apiStorageKey) || cfg.apiBaseUrl || '';
  }

  function apiBase() {
    return resolveApiBase().replace(/\/+$/, '');
  }

  async function readJsonOrThrow(res, fallbackMessage) {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`${fallbackMessage} (non-JSON response: ${res.status}${text ? ` ${text.slice(0, 80)}` : ''})`);
    }
    return res.json();
  }

  function applyConfig() {
    if (cfg.priceLabel) els.priceLabel.textContent = cfg.priceLabel;
    els.downloadBtn.href = '#';

    if (!apiBase()) {
      setStatus('Configure apiBaseUrl in paywall.config.js');
    }
  }

  function updateGate() {
    const unlocked = hasPayment();
    els.downloadSection.classList.toggle('hidden', !unlocked);
    if (unlocked) {
      setStatus('Access unlocked for this browser.');
    }
  }

  async function createPayPalOrder() {
    const origin = `${window.location.origin}${window.location.pathname}`;
    const endpoint = `${apiBase()}/api/paypal/order`;

    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          amount: cfg.amount,
          currency: cfg.currency,
        }),
      });
    } catch {
      throw new Error(`Failed to reach API at ${endpoint}`);
    }

    const data = await readJsonOrThrow(res, 'Unable to create PayPal order');
    if (!res.ok || !data?.ok || !data?.approvalUrl) {
      throw new Error(data?.error || `Unable to create PayPal order (${res.status})`);
    }

    return data.approvalUrl;
  }

  async function verifyAndUnlock(orderId) {
    const url = new URL(`${apiBase()}/api/download/token`);
    url.searchParams.set('order_id', orderId);

    let res;
    try {
      res = await fetch(url.toString());
    } catch {
      throw new Error(`Failed to reach API at ${url.origin}`);
    }

    const data = await readJsonOrThrow(res, 'Payment verification failed');
    if (!res.ok || !data?.ok || !data?.token) {
      throw new Error(data?.error || `Payment verification failed (${res.status})`);
    }

    setPayment();
    els.downloadBtn.href = `${apiBase()}/api/download?token=${encodeURIComponent(data.token)}`;
    updateGate();
    setStatus('Payment verified. Download unlocked.');
  }

  els.buyNowBtn.addEventListener('click', async () => {
    if (!apiBase()) {
      setStatus('Missing apiBaseUrl in paywall.config.js');
      return;
    }

    try {
      setStatus('Opening PayPal checkout…');
      const approvalUrl = await createPayPalOrder();
      window.location.href = approvalUrl;
    } catch (err) {
      setStatus(err?.message || 'Failed to start PayPal checkout');
    }
  });

  els.paidBtn.addEventListener('click', async () => {
    const current = new URL(window.location.href);
    const orderId = current.searchParams.get('token') || current.searchParams.get('order_id');
    if (!orderId) {
      setStatus('Missing order token in URL. Complete checkout first.');
      return;
    }

    try {
      await verifyAndUnlock(orderId);
    } catch (err) {
      setStatus(err?.message || 'Unable to verify payment');
    }
  });

  (async function init() {
    applyConfig();

    const current = new URL(window.location.href);
    const orderId = current.searchParams.get('token') || current.searchParams.get('order_id');
    if (orderId) {
      try {
        await verifyAndUnlock(orderId);
      } catch {
        // allow manual retry via button
      }
    }

    updateGate();
  })();
})();
