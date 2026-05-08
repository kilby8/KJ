(function () {
  const cfg = window.PAYWALL_CONFIG || {};
  const storageKey = cfg.storageKey || 'ikfs_download_unlocked';
  const tokenStorageKey = `${storageKey}_token`;
  const adminStorageKey = `${storageKey}_is_admin`;
  const apiStorageKey = `${storageKey}_api_base`;

  const els = {
    refreshBtn: document.getElementById('refreshBtn'),
    status: document.getElementById('status'),
    diagnostics: document.getElementById('diagnostics'),
  };

  function setStatus(text) {
    els.status.textContent = text || '';
  }

  function resolveApiBase() {
    return localStorage.getItem(apiStorageKey) || cfg.apiBaseUrl || '';
  }

  function apiBase() {
    return resolveApiBase().replace(/\/+$/, '');
  }

  function getToken() {
    return localStorage.getItem(tokenStorageKey) || '';
  }

  function isAdmin() {
    return localStorage.getItem(adminStorageKey) === '1';
  }

  async function loadDiagnostics() {
    if (!apiBase()) {
      setStatus('Missing API base URL in paywall.config.js');
      return;
    }

    if (!getToken() || !isAdmin()) {
      setStatus('Admin login required. Go back to login page and sign in as admin.');
      return;
    }

    setStatus('Loading diagnostics...');
    try {
      const res = await fetch(`${apiBase()}/api/admin/troubleshoot`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Unexpected response (${res.status})`);
      }

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Diagnostics failed (${res.status})`);
      }

      els.diagnostics.textContent = JSON.stringify(data, null, 2);
      setStatus('Diagnostics loaded.');
    } catch (err) {
      setStatus(err?.message || 'Unable to load diagnostics');
    }
  }

  els.refreshBtn.addEventListener('click', () => {
    loadDiagnostics();
  });

  loadDiagnostics();
})();

