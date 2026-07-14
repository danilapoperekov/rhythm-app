function configuredBase() {
  const configured = String(localStorage.getItem('rhythm-api-url') || globalThis.RHYTHM_API_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return ['localhost', '127.0.0.1'].includes(location.hostname) ? '' : null;
}

export function aiServerReady() {
  const base = configuredBase();
  return Boolean(base !== null && (base === '' || localStorage.getItem('rhythm-api-token')));
}

export async function apiFetch(path, options = {}) {
  const base = configuredBase();
  if (!base) throw new Error('AI_SERVER_NOT_CONNECTED');
  const token = localStorage.getItem('rhythm-api-token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${base}${path}`, { ...options, headers });
}
