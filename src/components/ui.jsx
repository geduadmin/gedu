import { useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, Ban, CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Minus, Phone, PhoneCall, Repeat, X } from 'lucide-react';
import { initials, monthKey, monthLabel, shiftMonth } from '../lib/utils';
import { t } from '../i18n';

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const AVATAR_TONES = [
  ['#f0eeff', '#5b4fe9'],
  ['#e8f8ef', '#12884a'],
  ['#fff2e8', '#d4610f'],
  ['#ffedf5', '#c93a6c'],
  ['#e9f3ff', '#2a6cc0'],
  ['#e5f8f6', '#0c877a'],
  ['#f5ecff', '#8a3fd1'],
  ['#fff7e0', '#a86f00'],
];
const hash = (s = '') => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, lg, sm }) {
  const [bg, fg] = AVATAR_TONES[hash(name) % AVATAR_TONES.length];
  return (
    <div className={`avatar ${lg ? 'lg' : ''} ${sm ? 'sm' : ''}`} style={{ background: bg, color: fg }} title={name}>
      {initials(name)}
    </div>
  );
}

export function StageBadge({ stage }) {
  if (!stage) return <span className="badge">—</span>;
  return (
    <span className="badge stage-badge" style={{ '--c': stage.color }}>
      <span className="dot" style={{ background: stage.color }} />
      {t(stage.name)}
    </span>
  );
}

export function FlagIcons({ flags = {} }) {
  return (
    <span className="flag-icons">
      {flags.call3cx && <span title={t('Called on 3CX')}><PhoneCall size={12} /></span>}
      {flags.whatsappCall && <span title={t('Called on WhatsApp')}><Phone size={12} /></span>}
      {flags.whatsappMessage && <span title={t('Messaged on WhatsApp')}><MessageCircle size={12} /></span>}
      {flags.followingUp && <span title={t('Following up')}><Repeat size={12} /></span>}
      {flags.blocked && <span className="blocked" title={t('Blocked us')}><Ban size={12} /></span>}
    </span>
  );
}

/** "↑ 18.6% vs last month" — arrow + text, never colour alone. */
export function Delta({ value, prev, invert, suffix = t('vs last month') }) {
  if (prev === undefined) return null;
  const diff = value - prev;
  let cls = 'flat';
  let text = '0%';
  if (prev === 0 && value > 0) text = t('new');
  else if (prev !== 0) text = `${Math.abs((diff / prev) * 100).toFixed(1)}%`;
  if (diff > 0) cls = invert ? 'down' : 'up';
  if (diff < 0) cls = invert ? 'up' : 'down';
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <div className="delta num">
      <b className={cls}>
        <Icon size={13} strokeWidth={2.6} />
        {text}
      </b>
      {suffix}
    </div>
  );
}

export function Kpi({ label, value, prev, icon: Icon, tone = 'indigo', invert }) {
  return (
    <div className="card kpi">
      {Icon && (
        <div className={`kpi-icon tone-${tone}`}>
          <Icon size={21} />
        </div>
      )}
      <div className="label">{label}</div>
      <div className="value num">{value.toLocaleString()}</div>
      <Delta value={value} prev={prev} invert={invert} />
    </div>
  );
}

export function Stat({ label, value, icon: Icon, tone = 'indigo' }) {
  return (
    <div className="stat">
      <div className={`si tone-${tone}`}>
        <Icon size={17} />
      </div>
      <div>
        <div className="sl">{label}</div>
        <div className="sv num">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

export function MonthPicker({ value, onChange, months = 36 }) {
  const current = monthKey();
  const options = Array.from({ length: months }, (_, i) => shiftMonth(current, -i));
  if (!options.includes(value)) options.push(value);
  return (
    <div className="month-picker no-print">
      <CalendarDays size={16} color="var(--ink-2)" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Month')}>
        {options.map((k) => (
          <option key={k} value={k}>
            {monthLabel(k)}
          </option>
        ))}
      </select>
      <button className="icon-btn" title={t('Previous month')} onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft size={16} className="flip-rtl" />
      </button>
      <button className="icon-btn" title={t('Next month')} disabled={value >= current} onClick={() => value < current && onChange(shiftMonth(value, 1))}>
        <ChevronRight size={16} className="flip-rtl" />
      </button>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="no-print">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.value} className={value === t.value ? 'on' : ''} onClick={() => onChange(t.value)}>
            {t.icon && <t.icon size={15} />}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <div style={{ fontWeight: 650, marginBottom: 4, color: 'var(--ink)' }}>{title}</div>
      <div className="small">{children}</div>
    </div>
  );
}

export function greeting() {
  const h = new Date().getHours();
  return t(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
}
