const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_username';
const listeners = new Set();

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername() {
  return localStorage.getItem(USER_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

export function setAuth(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
  emit();
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emit();
}

// Subscribe to login/logout changes. Returns an unsubscribe function.
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

// fetch wrapper that injects the bearer token and signs the user out on 401
// (expired/invalid session) so the app falls back to the login screen.
export async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    clearAuth();
  }
  return res;
}
