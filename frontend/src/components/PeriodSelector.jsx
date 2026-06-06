// PeriodSelector — period-based date range picker
// Modes: day | month | quarter | half | year | custom
import { useState, useEffect } from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function lastDay(year, month) {
  return new Date(year, month, 0).getDate();
}

function getPeriodDates(mode, year, month, quarter, half, dayDate, customStart, customEnd) {
  const pad = n => String(n).padStart(2, '0');
  if (mode === 'day') {
    return { start: dayDate, end: dayDate, groupBy: 'day', label: dayDate || 'Select a day' };
  }
  if (mode === 'month') {
    const start = `${year}-${pad(month)}-01`;
    const end = `${year}-${pad(month)}-${lastDay(year, month)}`;
    return { start, end, groupBy: 'day', label: `${MONTHS[month - 1]} ${year}` };
  }
  if (mode === 'quarter') {
    const qStart = (quarter - 1) * 3 + 1;
    const qEnd = qStart + 2;
    const start = `${year}-${pad(qStart)}-01`;
    const end = `${year}-${pad(qEnd)}-${lastDay(year, qEnd)}`;
    return { start, end, groupBy: 'week', label: `Q${quarter} ${year}` };
  }
  if (mode === 'half') {
    const start = half === 1 ? `${year}-01-01` : `${year}-07-01`;
    const end = half === 1 ? `${year}-06-30` : `${year}-12-31`;
    return { start, end, groupBy: 'month', label: `H${half} ${year}` };
  }
  if (mode === 'year') {
    return { start: `${year}-01-01`, end: `${year}-12-31`, groupBy: 'month', label: `Year ${year}` };
  }
  // custom
  return {
    start: customStart,
    end: customEnd,
    groupBy: 'month',
    label: customStart && customEnd ? `${customStart} → ${customEnd}` : 'Set dates'
  };
}

const MODES = [
  { id: 'day',     label: 'Day' },
  { id: 'month',   label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'half',    label: 'Half Year' },
  { id: 'year',    label: 'Year' },
  { id: 'custom',  label: 'Custom' },
];

export default function PeriodSelector({ onChange }) {
  const now = new Date();
  const [mode, setMode] = useState('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [half, setHalf] = useState(now.getMonth() < 6 ? 1 : 2);
  const [dayDate, setDayDate] = useState(now.toISOString().substring(0, 10));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  function apply() {
    const dates = getPeriodDates(mode, year, month, quarter, half, dayDate, customStart, customEnd);
    onChange(dates);
  }

  useEffect(() => {
    if (mode !== 'custom') apply();
  }, [mode, year, month, quarter, half, dayDate]);

  const current = getPeriodDates(mode, year, month, quarter, half, dayDate, customStart, customEnd);

  const btnStyle = (active) => ({
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: active ? 600 : 400,
    borderRadius: '3px',
    cursor: 'pointer',
    background: active ? 'var(--color-bg-active)' : 'transparent',
    border: active ? '1px solid var(--color-border)' : '1px solid transparent',
    color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
    transition: 'all 0.1s',
  });

  const inputStyle = {
    padding: '5px 8px',
    fontSize: '12px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '3px',
    color: 'var(--color-text)',
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
      borderRadius: '4px', padding: '10px 14px',
    }}>
      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: '3px' }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={btnStyle(mode === m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ width: '1px', height: '20px', background: 'var(--color-border-light)' }} />

      {/* Sub-selectors */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {/* Year */}
        {['month', 'quarter', 'half', 'year'].includes(mode) && (
          <select style={inputStyle} value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {/* Month */}
        {mode === 'month' && (
          <select style={inputStyle} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        )}

        {/* Quarter */}
        {mode === 'quarter' && (
          <div style={{ display: 'flex', gap: '3px' }}>
            {[1,2,3,4].map(q => (
              <button key={q} onClick={() => setQuarter(q)} style={btnStyle(quarter === q)}>Q{q}</button>
            ))}
          </div>
        )}

        {/* Half */}
        {mode === 'half' && (
          <div style={{ display: 'flex', gap: '3px' }}>
            {[1,2].map(h => (
              <button key={h} onClick={() => setHalf(h)} style={btnStyle(half === h)}>H{h}</button>
            ))}
          </div>
        )}

        {/* Day */}
        {mode === 'day' && (
          <input type="date" style={inputStyle} value={dayDate} onChange={e => setDayDate(e.target.value)} />
        )}

        {/* Custom */}
        {mode === 'custom' && (
          <>
            <input type="date" style={inputStyle} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span style={{ color: 'var(--color-text-dim)', fontSize: '11px' }}>→</span>
            <input type="date" style={inputStyle} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            <button onClick={apply} style={{ ...btnStyle(true), background: 'var(--color-bg-active)' }}>Apply</button>
          </>
        )}
      </div>

      {/* Current period label */}
      {mode !== 'custom' && current.label && (
        <span style={{ marginLeft: 'auto', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)' }}>
          {current.label}
        </span>
      )}
    </div>
  );
}
