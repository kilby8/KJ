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

  function applyConfig() {
    if (cfg.priceLabel) els.priceLabel.textContent = cfg.priceLabel;
    els.buyNowBtn.href = cfg.paymentUrl || '#';
    els.downloadBtn.href = cfg.downloadUrl || '#';

    if (!cfg.paymentUrl || !cfg.downloadUrl) {
      setStatus('Configure paymentUrl and downloadUrl in paywall.config.js');
    }
  }

  function updateGate() {
    const unlocked = hasPayment();
    els.downloadSection.classList.toggle('hidden', !unlocked);
    if (unlocked) {
      setStatus('Access unlocked for this browser.');
    }
  }

  els.buyNowBtn.addEventListener('click', () => {
    if (!cfg.paymentUrl) {
      setStatus('Missing payment URL. Update paywall.config.js first.');
      return;
    }
    setStatus('Complete payment, then return and click “I already paid”.');
  });

  els.paidBtn.addEventListener('click', () => {
    setPayment();
    updateGate();
  });

  const url = new URL(window.location.href);
  const paidParam = url.searchParams.get('paid');
  if (paidParam === '1' || paidParam === 'true') {
    setPayment();
  }

  applyConfig();
  updateGate();
})();
