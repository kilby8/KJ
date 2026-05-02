(function () {
  const cfg = window.PAYWALL_CONFIG || {};

  const els = {
    priceLabel: document.getElementById('priceLabel'),
    buyNowBtn: document.getElementById('buyNowBtn'),
    paidBtn: document.getElementById('paidBtn'),
    status: document.getElementById('status'),
    downloadSection: document.getElementById('downloadSection'),
    downloadBtn: document.getElementById('downloadBtn'),
    paypalHostedButtons: document.getElementById('paypal-hosted-buttons'),
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
    return Boolean(cfg.paypalHostedButtonId || cfg.paypalCheckoutUrl);
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

    if (!isDirectPayPalMode() && !cfg.apiBaseUrl) {
      setStatus('Configure paypalHostedButtonId/paypalCheckoutUrl or apiBaseUrl in paywall.config.js');
    }
  }

  async function renderHostedButtons() {
    if (!cfg.paypalHostedButtonId || !els.paypalHostedButtons || !window.paypal?.HostedButtons) {
      return;
    }

    try {
      await window.paypal.HostedButtons({
        hostedButtonId: cfg.paypalHostedButtonId,
      }).render('#paypal-hosted-buttons');
    } catch {
      setStatus('Unable to render PayPal hosted button.');
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

  if (els.buyNowBtn) {
    els.buyNowBtn.addEventListener('click', async (e) => {
      if (isDirectPayPalMode()) {
        return;
      }

      e.preventDefault();

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
  }

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
    await renderHostedButtons();

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
