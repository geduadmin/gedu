import { locale, t } from '../i18n';

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const nowIso = () => new Date().toISOString();

/* ---------- months ---------- */
export const monthKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

export const monthRange = (key) => {
  const [y, m] = key.split('-').map(Number);
  return [new Date(y, m - 1, 1), new Date(y, m, 1)];
};

export const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
};

export const monthLabel = (key, short = false) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(locale(), {
    month: short ? 'short' : 'long',
    year: 'numeric',
  });
};

export const daysInMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const inRange = (iso, [a, b]) => {
  if (!iso) return false;
  const t = new Date(iso);
  return t >= a && t < b;
};

/* ---------- formatting ---------- */
export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(locale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const timeAgo = (iso) => {
  if (!iso) return t('never');
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 0) return t('in future');
  if (diff < 60) return t('just now');
  if (diff < 3600) return t('{n}m ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('{n}h ago', { n: Math.floor(diff / 3600) });
  const d = Math.floor(diff / 86400);
  if (d < 30) return t('{n}d ago', { n: d });
  if (d < 365) return t('{n}mo ago', { n: Math.floor(d / 30) });
  return t('{n}y ago', { n: Math.floor(d / 365) });
};

export const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

/* datetime-local <-> ISO */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

export const normalize = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
