import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Database, Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useLookups, useStore } from '../store/StoreContext';
import { STAGE_KINDS } from '../store/defaults';
import { t } from '../i18n';

const COLUMN_TYPES = { text: 'Text', number: 'Number', date: 'Date', select: 'Dropdown', checkbox: 'Yes / No' };

export default function Settings() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Settings')}</h1>
          <p>{t('Pipeline statuses, custom columns and data.')}</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <StagesCard />
        <div className="grid-2">
          <ColumnsCard />
          <CertificatesCard />
        </div>
        <DataCard />
      </div>
    </>
  );
}

function StagesCard() {
  const { state, actions } = useStore();
  const { stages } = useLookups();
  const [name, setName] = useState('');
  const counts = Object.fromEntries(stages.map((s) => [s.id, state.leads.filter((l) => l.stageId === s.id).length]));

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t('Pipeline statuses (Kanban columns)')}</h3>
      </div>
      <div className="card-body">
        <p className="small ink2" style={{ marginTop: 0 }}>
          {t('"Counts as" decides which dashboard number a status feeds (e.g. a lead moved here counts as "Interested").')}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>{t('Order')}</th>
              <th style={{ width: 60 }}>{t('Color')}</th>
              <th>{t('Name')}</th>
              <th style={{ width: 200 }}>{t('Counts as')}</th>
              <th style={{ width: 70, textAlign: 'end' }}>{t('Leads')}</th>
              <th style={{ width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <button className="icon-btn" disabled={i === 0} onClick={() => actions.moveStage(s.id, -1)}><ArrowUp size={14} /></button>
                  <button className="icon-btn" disabled={i === stages.length - 1} onClick={() => actions.moveStage(s.id, 1)}><ArrowDown size={14} /></button>
                </td>
                <td>
                  <input type="color" value={s.color} onChange={(e) => actions.updateStage(s.id, { color: e.target.value })} style={{ width: 34, height: 26, border: 0, background: 'none', cursor: 'pointer' }} />
                </td>
                <td>
                  <input className="input" value={s.name} onChange={(e) => actions.updateStage(s.id, { name: e.target.value })} />
                  {t(s.name) !== s.name && <div className="small muted" style={{ marginTop: 4 }}>{t('Shown as: {name}', { name: t(s.name) })}</div>}
                </td>
                <td>
                  <select className="select" value={s.kind} onChange={(e) => actions.updateStage(s.id, { kind: e.target.value })}>
                    {STAGE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{t(k.label)}</option>
                    ))}
                  </select>
                </td>
                <td className="num" style={{ textAlign: 'end' }}>{counts[s.id]}</td>
                <td>
                  <button
                    className="icon-btn"
                    disabled={stages.length <= 1 || counts[s.id] > 0}
                    title={counts[s.id] > 0 ? t("Can't delete: move its {n} leads to another status first", { n: counts[s.id] }) : t('Delete status')}
                    onClick={() => confirm(t('Delete the status "{name}"?', { name: t(s.name) })) && actions.deleteStage(s.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ maxWidth: 280 }} placeholder={t('New status name')} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={!name.trim()} onClick={() => { actions.addStage({ name: name.trim() }); setName(''); }}>
            <Plus size={15} /> {t('Add status')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ColumnsCard() {
  const { state, actions } = useStore();
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [options, setOptions] = useState('');

  const add = () => {
    actions.addColumn({ label: label.trim(), type, options: type === 'select' ? options.split(',').map((o) => o.trim()).filter(Boolean) : [] });
    setLabel('');
    setOptions('');
  };

  return (
    <div className="card">
      <div className="card-head"><h3>{t('Custom columns (extra lead data)')}</h3></div>
      <div className="card-body stack">
        {state.customColumns.length === 0 && <div className="small muted">{t('No custom columns yet.')}</div>}
        {state.customColumns.map((c) => (
          <div className="row" key={c.id}>
            <input className="input" value={c.label} onChange={(e) => actions.updateColumn(c.id, { label: e.target.value })} />
            <span className="badge">{t(COLUMN_TYPES[c.type] ?? c.type)}</span>
            {c.type === 'select' && (
              <input
                className="input"
                title={t('Options, comma separated')}
                defaultValue={c.options.join(', ')}
                onBlur={(e) => actions.updateColumn(c.id, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
              />
            )}
            <button className="icon-btn" title={t('Delete')} onClick={() => confirm(t('Delete column "{name}" and its data from all leads?', { name: c.label })) && actions.deleteColumn(c.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="row wrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder={t('Column name, e.g. Program')} value={label} onChange={(e) => setLabel(e.target.value)} />
          <select className="select" style={{ width: 120 }} value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(COLUMN_TYPES).map(([v, label]) => (
              <option key={v} value={v}>{t(label)}</option>
            ))}
          </select>
          {type === 'select' && (
            <input className="input" style={{ flexBasis: '100%' }} placeholder={t('Options, comma separated')} value={options} onChange={(e) => setOptions(e.target.value)} />
          )}
          <button className="btn" disabled={!label.trim()} onClick={add}>
            <Plus size={15} /> {t('Add column')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CertificatesCard() {
  const { state, actions } = useStore();
  const [text, setText] = useState(state.certificateStages.join('\n'));
  return (
    <div className="card">
      <div className="card-head"><h3>{t('Certificate stages')}</h3></div>
      <div className="card-body stack">
        <span className="small ink2">{t('One option per line — used in the "Last certificate stage" dropdown.')}</span>
        <textarea className="textarea" style={{ minHeight: 150 }} value={text} onChange={(e) => setText(e.target.value)} />
        <div>
          <button className="btn" onClick={() => actions.setCertificateStages(text.split('\n').map((s) => s.trim()).filter(Boolean))}>
            {t('Save options')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataCard() {
  const { state, actions, mode, demoAvailable } = useStore();
  const remote = mode === 'remote';
  const input = useRef(null);

  const backup = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leads-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.users) || !Array.isArray(data.leads)) throw new Error('bad file');
      if (confirm(t('Replace ALL current data with this backup?'))) actions.replaceState(data);
    } catch {
      alert(t('This is not a valid backup file.'));
    }
  };

  return (
    <div className="card">
      <div className="card-head"><h3>{t('Data')}</h3></div>
      <div className="card-body stack">
        <div className="notice">
          {remote
            ? t('Data is saved in the shared database — every employee sees the same live data from any computer. Changes save automatically.')
            : t('Local mode: data is saved in this browser only.')}
        </div>
        <div className="row wrap">
          <button className="btn" onClick={backup}><Download size={15} /> {t('Download backup')}</button>
          {!remote && <button className="btn" onClick={() => input.current.click()}><Upload size={15} /> {t('Restore backup')}</button>}
          <input ref={input} type="file" accept=".json" hidden onChange={(e) => { restore(e.target.files[0]); e.target.value = ''; }} />
          {demoAvailable && (
            <button className="btn" onClick={() => confirm(t('Add sample employees, leads and meetings?')) && actions.loadDemo()}>
              <Database size={15} /> {t('Load sample data')}
            </button>
          )}
          <span className="spacer" />
          {!remote && (
            <button className="btn danger" onClick={() => confirm(t('Delete EVERYTHING and start fresh? Download a backup first if needed.')) && actions.resetAll()}>
              <RotateCcw size={15} /> {t('Reset all data')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
