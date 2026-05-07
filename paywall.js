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
  };

  const storageKey = cfg.storageKey || 'ikfs_download_unlocked';
  const tokenStorageKey = `${storageKey}_token`;
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

  function setStoredToken(token) {
    if (token) {
      localStorage.setItem(storageKey, '1');
      localStorage.setItem(tokenStorageKey, token);
      return;
    }
    localStorage.removeItem(storageKey);
    localStorage.removeItem(tokenStorageKey);
  }

  function applyDownloadLink(token) {
    els.downloadBtn.href = token
      ? `${apiBase()}/api/download?token=${encodeURIComponent(token)}`
      : '#';
  }

  function updateGate() {
    const token = getStoredToken();
    const unlocked = Boolean(token);
    els.downloadSection.classList.toggle('hidden', !unlocked);
    applyDownloadLink(token);
    if (unlocked) {
      setStatus('Signed in. Download unlocked for this browser session.');
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

    return data.token;
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
      const token = await login(username, password);
      setStoredToken(token);
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
