import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line, AreaChart, Area } from 'recharts';

export default function ProfitLossPage() {
  const [loading, setLoading] = useState(true);
  const [plData, setPlData] = useState(null);
  const [cashflowData, setCashflowData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function fetchPL() {
    setLoading(true);
    try {
      const queryParams = [];
      if (startDate) queryParams.push(`start=${startDate}`);
      if (endDate) queryParams.push(`end=${endDate}`);
      const qs = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

      const [pl, cashflow, trend] = await Promise.all([
        api.get(`/financial/pl${qs}`),
        api.get('/financial/cashflow'),
        api.get('/financial/pl/trend')
      ]);

      setPlData(pl);
      setCashflowData(cashflow);
      setTrendData(trend);
    } catch (err) {
      toast.error('Failed to load financial reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPL();
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    fetchPL();
  }

  async function handleDownloadPDF() {
    try {
      await api.downloadBlob('/financial/pl/pdf', 'rehla-pl-report.pdf');
      toast.success('P&L Report PDF downloaded successfully');
    } catch (err) {
      toast.error('Failed to download PDF report');
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '300px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="Profit & Loss Statement">
      {/* Date Filter & Export Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px' }}
            />
          </div>
          <span style={{ color: 'var(--color-text-dim)' }}>to</span>
          <div>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Filter Range
          </button>
        </form>

        <button className="btn btn-secondary" onClick={handleDownloadPDF}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
          Export PDF Report
        </button>
      </div>

      {loading ? renderSkeleton() : (
        <>
          {/* Main Statement Breakdown */}
          {plData && (
            <div className="card" style={{ marginBottom: '32px' }}>
              <div style={{ borderBottom: '1px solid var(--color-border-light)', paddingBottom: '16px', marginBottom: '24px' }}>
                <p className="text-label" style={{ color:'var(--color-text-dim)' }}>Income Statement</p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Reporting Period: {plData.period}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Gross Revenue */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '16px' }}>
                  <span>Gross Operating Revenue</span>
                  <span className="font-mono" style={{ fontWeight: 600 }}>{formatEGP(plData.revenue)}</span>
                </div>

                {/* COGS */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '16px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px' }}>
                  <span>Cost of Goods Sold (COGS)</span>
                  <span className="font-mono" style={{ fontWeight: 600 }}>−{formatEGP(plData.cogs)}</span>
                </div>

                {/* Gross Profit */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '18px', fontWeight: 700 }}>
                  <span>Gross Profit</span>
                  <span className="font-mono">{formatEGP(plData.grossProfit)}</span>
                </div>

                {/* Operating Expenses */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '16px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '12px' }}>
                  <span>Total Operating Expenses</span>
                  <span className="font-mono" style={{ fontWeight: 600 }}>−{formatEGP(plData.expenses)}</span>
                </div>

                {/* Net Income */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '22px', fontWeight: 800,
                  color: plData.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'
                }}>
                  <span>Net Operating Income</span>
                  <span className="font-mono">{formatEGP(plData.netProfit)}</span>
                </div>

                {/* Margins breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', borderTop: '1px solid var(--color-border-light)', paddingTop: '20px', marginTop: '10px' }}>
                  <div className="card" style={{ background: 'var(--color-bg)' }}>
                    <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '6px' }}>Gross Margin</p>
                    <p className="font-mono" style={{ fontSize: '20px', fontWeight: 700 }}>{plData.grossMargin?.toFixed(1)}%</p>
                  </div>
                  <div className="card" style={{ background: 'var(--color-bg)', borderLeft: `3px solid ${plData.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}` }}>
                    <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '6px' }}>Net Profit Margin</p>
                    <p className="font-mono" style={{ fontSize: '20px', fontWeight: 700 }}>{plData.netMargin?.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cashflow & Financial Trends */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {/* Cash Flow */}
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Cash Flow Trend (Inflow vs Outflow)</p>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={cashflowData}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-error)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--color-error)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area type="monotone" dataKey="money_in" name="Inflow (Revenue)" stroke="var(--color-success)" fillOpacity={1} fill="url(#colorIn)" />
                  <Area type="monotone" dataKey="money_out" name="Outflow (Expenses)" stroke="var(--color-error)" fillOpacity={1} fill="url(#colorOut)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Profit trend */}
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '20px' }}>Monthly Profit Trend (Net Profitability)</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background:'#1e1e1e', border:'1px solid #333030', color:'#ede9e8', fontSize:12, borderRadius:6 }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="profit" name="Net Profit (EGP)" radius={[2,2,0,0]}>
                    {trendData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#3fb950' : '#f85149'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
