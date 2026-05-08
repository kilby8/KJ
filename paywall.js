(function () {
  const cfg = window.PAYWALL_CONFIG || {};

  const els = {
    priceLabel: document.getElementById('priceLabel'),
    loginForm: document.getElementById('loginForm'),
    logoutBtn: document.getElementById('logoutBtn'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    status: document.getElementById('status'),
    downloadSection: document.getElementById('downloadSection'),
    downloadBtn: document.getElementById('downloadBtn'),
    adminSection: document.getElementById('adminSection'),
    adminBtn: document.getElementById('adminBtn'),
  };

  const storageKey = cfg.storageKey || 'ikfs_download_unlocked';
  const tokenStorageKey = `${storageKey}_token`;
  const adminStorageKey = `${storageKey}_is_admin`;
  const apiStorageKey = `${storageKey}_api_base`;

  function setStatus(text) {
    els.status.textContent = text || '';
  }

  function resolveApiBase() {
    const current = new URL(window.location.href);
    const queryApi = current.searchParams.get('api');
    if (queryApi !== null) {
      if (queryApi) {
        localStorage.setItem(apiStorageKey, queryApi);
      } else {
        localStorage.removeItem(apiStorageKey);
      }
      return queryApi || cfg.apiBaseUrl || '';
    }
    return localStorage.getItem(apiStorageKey) || cfg.apiBaseUrl || '';
  }

  function apiBase() {
    return resolveApiBase().replace(/\/+$/, '');
  }

  function getStoredToken() {
    return localStorage.getItem(tokenStorageKey) || '';
  }

  function isAdminSession() {
    return localStorage.getItem(adminStorageKey) === '1';
  }

  function setStoredToken(token, isAdmin) {
    if (token) {
      localStorage.setItem(storageKey, '1');
      localStorage.setItem(tokenStorageKey, token);
      localStorage.setItem(adminStorageKey, isAdmin ? '1' : '0');
      return;
    }
    localStorage.removeItem(storageKey);
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(adminStorageKey);
  }

  function getAdminPageUrl() {
    return cfg.adminPageUrl || 'admin.html';
  }

  function applyDownloadLink(token) {
    els.downloadBtn.href = token
      ? `${apiBase()}/api/download?token=${encodeURIComponent(token)}`
      : '#';
  }

  function updateGate() {
    const token = getStoredToken();
    const unlocked = Boolean(token);
    const adminUnlocked = unlocked && isAdminSession();
    els.downloadSection.classList.toggle('hidden', !unlocked);
    if (els.adminSection) {
      els.adminSection.classList.toggle('hidden', !adminUnlocked);
    }
    if (els.adminBtn) {
      els.adminBtn.href = getAdminPageUrl();
    }
    applyDownloadLink(token);
    if (unlocked) {
      setStatus(adminUnlocked
        ? 'Signed in as admin. Download and troubleshooting tools unlocked.'
        : 'Signed in. Download unlocked for this browser session.');
    }
  }

  async function readJsonOrThrow(res, fallbackMessage) {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`${fallbackMessage} (non-JSON response: ${res.status}${text ? ` ${text.slice(0, 80)}` : ''})`);
    }
    return res.json();
  }

  async function login(username, password) {
    const endpoint = `${apiBase()}/api/auth/login`;
    let res;

    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error(`Failed to reach API at ${endpoint}`);
    }

    const data = await readJsonOrThrow(res, 'Login failed');
    if (!res.ok || !data?.ok || !data?.token) {
      throw new Error(data?.error || `Login failed (${res.status})`);
    }

    return {
      token: data.token,
      isAdmin: Boolean(data.isAdmin),
    };
  }

  function applyConfig() {
    if (cfg.priceLabel) els.priceLabel.textContent = cfg.priceLabel;
    applyDownloadLink('');

    if (!apiBase()) {
      setStatus('Configure apiBaseUrl in paywall.config.js');
    }
  }

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!apiBase()) {
      setStatus('Missing apiBaseUrl in paywall.config.js');
      return;
    }

    const username = (els.username.value || '').trim();
    const password = els.password.value || '';
    if (!username || !password) {
      setStatus('Enter username and password.');
      return;
    }

    try {
      setStatus('Signing in...');
      const auth = await login(username, password);
      setStoredToken(auth.token, auth.isAdmin);
      els.password.value = '';
      updateGate();
    } catch (err) {
      setStatus(err?.message || 'Unable to sign in');
    }
  });

  els.logoutBtn.addEventListener('click', () => {
    setStoredToken('');
    applyDownloadLink('');
    setStatus('Logged out.');
    updateGate();
  });

  (function init() {
    applyConfig();

    updateGate();
  })();
})();
