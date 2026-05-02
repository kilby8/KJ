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
  const hasPayment = () => localStorage.getItem(storageKey) === '1';
  const setPayment = () => localStorage.setItem(storageKey, '1');

  function setStatus(text) {
    els.status.textContent = text || '';
  }

  function apiBase() {
    return (cfg.apiBaseUrl || '').replace(/\/+$/, '');
  }

  function isDirectPayPalMode() {
    return Boolean(cfg.paypalCheckoutUrl);
  }

  function hasDirectPaidReturn(url) {
    const paid = url.searchParams.get('paid');
    const token = url.searchParams.get('token');
    return paid === '1' || paid === 'true' || Boolean(token);
  }

  function applyConfig() {
    if (cfg.priceLabel) els.priceLabel.textContent = cfg.priceLabel;
    if (cfg.downloadUrl) els.downloadBtn.href = cfg.downloadUrl;
    else els.downloadBtn.href = '#';

    if (!cfg.paypalCheckoutUrl && !cfg.apiBaseUrl) {
      setStatus('Configure paypalCheckoutUrl or apiBaseUrl in paywall.config.js');
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
    const res = await fetch(`${apiBase()}/api/paypal/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin,
        amount: cfg.amount,
        currency: cfg.currency,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.approvalUrl) {
      throw new Error(data?.error || 'Unable to create PayPal order');
    }

    return data.approvalUrl;
  }

  async function verifyAndUnlock(orderId) {
    const url = new URL(`${apiBase()}/api/download/token`);
    url.searchParams.set('order_id', orderId);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.token) {
      throw new Error(data?.error || 'Payment verification failed');
    }

    setPayment();
    els.downloadBtn.href = `${apiBase()}/api/download?token=${encodeURIComponent(data.token)}`;
    updateGate();
    setStatus('Payment verified. Download unlocked.');
  }

  els.buyNowBtn.addEventListener('click', async () => {
    if (cfg.paypalCheckoutUrl) {
      window.location.href = cfg.paypalCheckoutUrl;
      return;
    }

    if (!cfg.apiBaseUrl) {
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
    if (isDirectPayPalMode()) {
      setPayment();
      updateGate();
      return;
    }

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
    if (isDirectPayPalMode() && hasDirectPaidReturn(current)) {
      setPayment();
      setStatus('Payment return detected. Download unlocked.');
    } else {
      const orderId = current.searchParams.get('token') || current.searchParams.get('order_id');
      if (orderId) {
        try {
          await verifyAndUnlock(orderId);
        } catch {
          // allow manual retry via button
        }
      }
    }

    updateGate();
  })();
})();
