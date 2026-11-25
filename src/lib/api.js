/** Calls the app's API (same origin, session cookie). Throws Error(message) with .status on failure. */
export async function api(path, { method = 'GET', body, raw, headers } = {}) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: raw ? headers : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    const e = new Error('No connection to the server');
    e.status = 0;
    throw e;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const e = new Error(data?.error || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }
  return data;
}

/** Is the server API there, and how is it configured? null = no API (plain local dev). */
export async function checkHealth() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return await r.json();
  } catch {
    return null;
  }
}
