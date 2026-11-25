import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Categorical slots from the validated reference palette (light mode), fixed order.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
export const BRAND = '#5b4fe9';
const GRID = '#eef0f4';
const AXIS = '#e3e6ec';
const TICK = { fill: '#98a2b3', fontSize: 11 };

function TooltipBox({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="t">{labelFormatter ? labelFormatter(label) : label}</div>
      {payload.map((p) => (
        <div className="r" key={p.dataKey}>
          <span className="dot" style={{ background: p.color || p.fill }} />
          {p.name}
          <b className="num">{p.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ series }) {
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <span key={s.key}>
          <i style={{ background: s.color ?? SERIES[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Single-series area with gradient wash — the hero chart. */
export function AreaHero({ data, xKey, yKey, name, color = BRAND, height = 290, labelFormatter, tickFormatter }) {
  const gid = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="4 4" />
        <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} tickFormatter={tickFormatter} dy={8} />
        <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox labelFormatter={labelFormatter} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey={yKey}
          name={name}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${gid})`}
          dot={false}
          activeDot={{ r: 6, fill: '#fff', stroke: color, strokeWidth: 3 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Multi-series line chart (≤3 series). One y-axis. */
export function LinesChart({ data, xKey, series, height = 260, labelFormatter }) {
  return (
    <div>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="4 4" />
          <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} dy={8} />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipBox labelFormatter={labelFormatter} />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? SERIES[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series horizontal bars with value labels at the bar end. */
export function HBarChart({ data, color = BRAND, name = 'Leads', height }) {
  const h = height ?? Math.max(150, data.length * 32 + 20);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap={7}>
        <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="4 4" />
        <XAxis type="number" allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ ...TICK, fill: '#667085' }} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: 'rgba(91,79,233,0.05)' }} />
        <Bar dataKey="value" name={name} fill={color} radius={[0, 6, 6, 0]} maxBarSize={16} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" style={{ fill: '#667085', fontSize: 11, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Ordinal ramp (single hue, light → dark) for funnel stages.
const FUNNEL_RAMP = ['#8b7ff5', '#7466f0', '#5b4fe9', '#4a3fd3', '#3a30b5'];

/** Lead funnel: widths step down; each row shows count and conversion from the previous step. */
export function Funnel({ steps }) {
  const widths = [100, 86, 72, 58, 46];
  return (
    <div className="funnel">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <div className="funnel-row" key={s.label} title={`${s.label}: ${s.value}`}>
            <div className="funnel-bar-wrap">
              <div className="funnel-bar num" style={{ width: `${widths[i] ?? 40}%`, background: FUNNEL_RAMP[i % FUNNEL_RAMP.length] }}>
                {s.value.toLocaleString()}
              </div>
            </div>
            <div className="funnel-meta">
              <b>{s.label}</b>
              <span>{conv === null ? s.hint : `${conv}% of previous step`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
