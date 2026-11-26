import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, KanbanSquare, Upload } from 'lucide-react';
import { Avatar } from '../components/ui';
import { useLookups, useStore, useVisibleLeads } from '../store/StoreContext';
import { FLAGS } from '../store/defaults';
import { exportTemplate, LEAD_FIELDS, parseBool, parseDate, readWorkbook } from '../lib/excel';
import { normalize, uid } from '../lib/utils';
import { t } from '../i18n';
import AR from '../i18n/ar';

const DATE_FIELDS = ['createdAt', 'lastContactAt'];

function guess(header, customColumns) {
  const h = normalize(header);
  if (!h) return '';
  for (const f of LEAD_FIELDS) if (f.aliases.some((a) => normalize(a) === h) || normalize(f.label) === h) return f.key;
  for (const f of FLAGS) if (normalize(f.label) === h || normalize(f.key) === h) return 'flag:' + f.key;
  for (const c of customColumns) if (normalize(c.label) === h) return 'custom:' + c.id;
  for (const f of LEAD_FIELDS) if (f.aliases.some((a) => a.length > 3 && h.includes(normalize(a)))) return f.key;
  return 'newcol';
}

const digits = (s) => String(s ?? '').replace(/\D/g, '').slice(-9);

export default function Import() {
  const { state, user, actions } = useStore();
  const { stages, agents } = useLookups();
  const visible = useVisibleLeads();
  const isAdmin = user.role === 'admin';
  const input = useRef(null);

  const [fileName, setFileName] = useState('');
  const [wb, setWb] = useState(null);
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState({});
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Opened from an employee's pipeline: every imported lead goes to that employee.
  const target = isAdmin ? state.users.find((u) => u.id === params.get('to') && u.active) ?? null : null;
  const [assignMode, setAssignMode] = useState('one');
  const [assignee, setAssignee] = useState(isAdmin ? agents[0]?.id ?? user.id : user.id);
  const [spread, setSpread] = useState(() => new Set(agents.filter((a) => a.active).map((a) => a.id)));
  const [stageId, setStageId] = useState(stages[0]?.id);
  const [skipDup, setSkipDup] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [over, setOver] = useState(false);

  const rows = wb && sheet ? wb.sheets[sheet] : [];
  const headers = useMemo(() => {
    const set = new Set();
    rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return [...set];
  }, [rows]);

  const pickSheet = (data, name) => {
    setSheet(name);
    const hs = new Set();
    data.sheets[name].slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => hs.add(k)));
    setMapping(Object.fromEntries([...hs].map((h) => [h, h.startsWith('__EMPTY') ? '' : guess(h, state.customColumns)])));
  };

  const load = async (file) => {
    if (!file) return;
    setError('');
    setResult(null);
    try {
      const data = await readWorkbook(file);
      setFileName(file.name);
      setWb(data);
      const first = data.names.find((n) => data.sheets[n].length) ?? data.names[0];
      pickSheet(data, first);
    } catch (e) {
      console.error(e);
      setError(t('Could not read this file. Use .xlsx, .xls or .csv.'));
    }
  };

  const doImport = () => {
    setError('');
    const mapped = Object.values(mapping);
    if (!mapped.includes('name')) return setError(t('Map one column to "Name".'));
    if (isAdmin && !target && assignMode === 'spread' && spread.size === 0) return setError(t('Choose at least one employee to distribute to.'));

    // create new custom columns for "newcol" headers
    const newCols = {};
    for (const [h, t] of Object.entries(mapping)) {
      if (t === 'newcol') {
        const existing = state.customColumns.find((c) => normalize(c.label) === normalize(h));
        if (existing) newCols[h] = existing.id;
        else {
          const id = uid();
          newCols[h] = id;
          actions.addColumn({ id, label: h, type: 'text' });
        }
      }
    }

    const stageByName = Object.fromEntries(stages.flatMap((s) => [[normalize(s.name), s.id], ...(AR[s.name] ? [[normalize(AR[s.name]), s.id]] : [])]));
    const userByKey = {};
    state.users.forEach((u) => {
      userByKey[normalize(u.email)] = u.id;
      userByKey[normalize(u.name)] = u.id;
    });
    const seen = new Set();
    visible.forEach((l) => {
      if (digits(l.phone)) seen.add('p' + digits(l.phone));
      if (l.email) seen.add('e' + l.email.toLowerCase().trim());
    });

    const spreadList = [...spread];
    let rr = 0;
    let skipped = 0;
    let emptyRows = 0;
    const list = [];

    for (const r of rows) {
      const lead = { flags: {}, custom: {} };
      for (const [h, t] of Object.entries(mapping)) {
        const v = r[h];
        if (!t || v === '' || v == null) continue;
        if (t.startsWith('flag:')) lead.flags[t.slice(5)] = parseBool(v);
        else if (t.startsWith('custom:')) lead.custom[t.slice(7)] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
        else if (t === 'newcol') lead.custom[newCols[h]] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
        else if (DATE_FIELDS.includes(t)) lead[t] = parseDate(v);
        else if (t === 'stage') lead.stageId = stageByName[normalize(v)];
        else if (t === 'owner') lead.ownerId = userByKey[normalize(v)];
        else lead[t] = String(v).trim();
      }
      if (!lead.name) {
        emptyRows++;
        continue;
      }
      const p = digits(lead.phone);
      const e = lead.email?.toLowerCase().trim();
      if (skipDup && ((p && seen.has('p' + p)) || (e && seen.has('e' + e)))) {
        skipped++;
        continue;
      }
      if (p) seen.add('p' + p);
      if (e) seen.add('e' + e);

      if (!isAdmin) lead.ownerId = user.id;
      else if (target) lead.ownerId = target.id;
      else if (!lead.ownerId) lead.ownerId = assignMode === 'spread' ? spreadList[rr++ % spreadList.length] : assignee;
      if (!lead.stageId) lead.stageId = stageId;
      if (!lead.createdAt) delete lead.createdAt;
      list.push(lead);
    }

    actions.importLeads(list);
    setResult({ imported: list.length, skipped, emptyRows, newCols: Object.keys(newCols).length, to: target?.id ?? (isAdmin ? null : user.id) });
    setWb(null);
  };

  const targetOptions = (
    <>
      <option value="">{t('— Ignore —')}</option>
      <optgroup label={t('Lead fields')}>
        {LEAD_FIELDS.map((f) => (
          <option key={f.key} value={f.key}>{t(f.label)}</option>
        ))}
      </optgroup>
      <optgroup label={t('Contact status (yes/no)')}>
        {FLAGS.map((f) => (
          <option key={f.key} value={'flag:' + f.key}>{t(f.label)}</option>
        ))}
      </optgroup>
      {state.customColumns.length > 0 && (
        <optgroup label={t('Custom columns')}>
          {state.customColumns.map((c) => (
            <option key={c.id} value={'custom:' + c.id}>{c.label}</option>
          ))}
        </optgroup>
      )}
      <option value="newcol">{t('+ Keep as new custom column')}</option>
    </>
  );

  return (
    <>
      <div className="page-head">
        <div>
          {target && (
            <button className="btn ghost sm" style={{ marginInlineStart: -10, marginBottom: 6 }} onClick={() => navigate(`/pipeline/${target.id}`)}>
              <ArrowLeft size={14} className="flip-rtl" /> {t("Back to {name}'s pipeline", { name: target.name })}
            </button>
          )}
          <h1 className="row" style={{ gap: 12 }}>
            {target && <Avatar name={target.name} />}
            {target ? t("Import leads into {name}'s pipeline", { name: target.name }) : t('Import Excel')}
          </h1>
          <p>
            {target
              ? t("Every lead in the sheet goes to {name}'s pipeline, and also shows in All pipelines.", { name: target.name })
              : t('Upload an .xlsx / .xls / .csv sheet of leads, match its columns, and assign the leads.')}
          </p>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportTemplate(state.customColumns)}>
          <Download size={15} /> {t('Download template')}
        </button>
      </div>

      {result && (
        <div className="card card-pad row" style={{ marginBottom: 16, gap: 12 }}>
          <CheckCircle2 size={22} color="#006300" />
          <div>
            <b>{t('Imported {n} leads', { n: result.imported })}</b> {t('from {file}.', { file: fileName })}
            <div className="small ink2">
              {result.skipped > 0 && t('{n} duplicates skipped.', { n: result.skipped }) + ' '}
              {result.emptyRows > 0 && t('{n} rows without a name ignored.', { n: result.emptyRows }) + ' '}
              {result.newCols > 0 && t('{n} custom columns used for extra data.', { n: result.newCols })}
            </div>
          </div>
          <span className="spacer" />
          {result.imported > 0 && (
            <>
              {result.to && (
                <button className="btn primary" onClick={() => navigate(`/pipeline${isAdmin ? '/' + result.to : ''}`)}>
                  <KanbanSquare size={15} /> {isAdmin ? t("Open {name}'s pipeline", { name: state.users.find((u) => u.id === result.to)?.name }) : t('Open my pipeline')}
                </button>
              )}
              {isAdmin && (
                <button className="btn" onClick={() => navigate('/pipeline')}>
                  {t('All pipelines')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!wb ? (
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          style={{ padding: 50 }}
          onClick={() => input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}
        >
          <FileSpreadsheet size={36} />
          <div style={{ fontWeight: 650, marginTop: 6 }}>{t('Drop an Excel file here or click to choose')}</div>
          <div className="small">{t('The first row must contain the column headers.')}</div>
          <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad row wrap">
            <FileSpreadsheet size={18} />
            <b>{fileName}</b>
            <span className="muted">{t('{n} rows', { n: rows.length })}</span>
            {wb.names.length > 1 && (
              <select className="select" style={{ width: 200 }} value={sheet} onChange={(e) => pickSheet(wb, e.target.value)}>
                {wb.names.map((n) => (
                  <option key={n} value={n}>{t('Sheet: {name} ({n})', { name: n, n: wb.sheets[n].length })}</option>
                ))}
              </select>
            )}
            <span className="spacer" />
            <button className="btn" onClick={() => setWb(null)}>{t('Choose another file')}</button>
          </div>

          <div className="card">
            <div className="card-head"><h3>{t('1. Match columns')}</h3></div>
            <div className="card-body table-wrap" style={{ padding: '8px 0 0' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Column in your sheet')}</th>
                    <th>{t('Sample values')}</th>
                    <th style={{ width: 280 }}>{t('Import as')}</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h}>
                      <td><b>{h}</b></td>
                      <td className="muted wrap small">
                        {rows.slice(0, 3).map((r) => (r[h] instanceof Date ? r[h].toLocaleDateString() : String(r[h]))).filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td>
                        <select className="select" value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}>
                          {targetOptions}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card card-pad stack">
            <h3>{t('2. Options')}</h3>
            {target && (
              <div className="row" style={{ gap: 10 }}>
                <Avatar name={target.name} sm />
                <span>{t('All leads will be assigned to')} <b>{target.name}</b>.</span>
              </div>
            )}
            {isAdmin && !target && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row wrap" style={{ gap: 18 }}>
                  <label className="check">
                    <input type="radio" checked={assignMode === 'one'} onChange={() => setAssignMode('one')} /> {t('Assign all to one employee')}
                  </label>
                  <label className="check">
                    <input type="radio" checked={assignMode === 'spread'} onChange={() => setAssignMode('spread')} /> {t('Distribute evenly between employees')}
                  </label>
                </div>
                {assignMode === 'one' ? (
                  <select className="select" style={{ maxWidth: 300 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                    {state.users.filter((u) => u.active).map((u) => (
                      <option key={u.id} value={u.id}>{u.name}{u.role === 'admin' ? ' ' + t('(admin)') : ''}</option>
                    ))}
                  </select>
                ) : (
                  <div className="row wrap" style={{ gap: 14 }}>
                    {agents.filter((a) => a.active).map((a) => (
                      <label className="check" key={a.id}>
                        <input
                          type="checkbox"
                          checked={spread.has(a.id)}
                          onChange={() => setSpread((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                        />
                        {a.name}
                      </label>
                    ))}
                    {agents.length === 0 && <span className="muted">{t('Add call center employees first.')}</span>}
                  </div>
                )}
                <div className="small muted">{t('If the sheet has an "Employee" column (email or name), that wins for the rows where it matches.')}</div>
              </div>
            )}
            <label className="field" style={{ maxWidth: 300 }}>
              <span>{t('Status for rows without a status')}</span>
              <select className="select" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{t(s.name)}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
              {t('Skip duplicates (same phone or email as an existing lead)')}
            </label>
            {error && <div className="error">{error}</div>}
            <div>
              <button className="btn primary" onClick={doImport}>
                <Upload size={15} /> {t('Import {n} rows', { n: rows.length })}
              </button>
            </div>
          </div>
        </div>
      )}
      {!wb && error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}
