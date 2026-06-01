// Financial Dashboard — FR-FN-01, FR-FN-02
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber, formatDate } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';

const CHART_COLORS = ['#e5e2e1', '#988e90', '#6b6365', '#4c4546', '#353535'];

export default function DashboardPage() {
  const [revenue, setRevenue] = useState(null);
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [deliverySummary, setDeliverySummary] = useState(null);
  const [plTrend, setPlTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [inventoryValue, setInventoryValue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [rev, inv, del, trend, top, invVal] = await Promise.all([
          api.get('/financial/revenue?period=month'),
          api.get('/invoices/summary'),
          api.get('/deliveries/summary'),
          api.get('/financial/pl/trend'),
          api.get('/analytics/top-products'),
          api.get('/financial/inventory-value'),
        ]);
        setRevenue(rev);
        setInvoiceSummary(inv);
        setDeliverySummary(del);
        setPlTrend(trend);
        setTopProducts(top.byRevenue || []);
        setInventoryValue(invVal);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  const renderSkeleton = (h = 120) => (
    <div className="skeleton" style={{ height: `${h}px`, width: '100%' }}></div>
  );

  return (
    <DashboardShell title="Financial Dashboard">
      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {/* Revenue Card */}
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Monthly Revenue</p>
          {loading ? renderSkeleton(48) : (
            <>
              <p style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
                {formatEGP(revenue?.revenue)}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {formatNumber(revenue?.order_count)} orders this month
              </p>
            </>
          )}
        </div>

        {/* Invoices Outstanding */}
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Outstanding Invoices</p>
          {loading ? renderSkeleton(48) : (
            <>
              <p style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)', color: invoiceSummary?.total_overdue > 0 ? 'var(--color-error)' : 'inherit' }}>
                {formatEGP(invoiceSummary?.total_outstanding)}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {formatEGP(invoiceSummary?.total_overdue)} overdue
              </p>
            </>
          )}
        </div>

        {/* Deliveries Active */}
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Active Deliveries</p>
          {loading ? renderSkeleton(48) : (
            <>
              <p style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
                {formatNumber(deliverySummary?.out_for_delivery)}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {formatNumber(deliverySummary?.pending)} pending · {formatNumber(deliverySummary?.delivered)} delivered today
              </p>
            </>
          )}
        </div>

        {/* Inventory Value */}
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Inventory Value</p>
          {loading ? renderSkeleton(48) : (
            <>
              <p style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
                {formatEGP(inventoryValue?.retail_value)}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {formatNumber(inventoryValue?.total_units)} units · {formatEGP(inventoryValue?.cost_value)} cost
              </p>
            </>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {/* P&L Trend Chart */}
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Revenue vs Expenses Trend</p>
          {loading ? renderSkeleton(260) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={plTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: '13px' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#e5e2e1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="#ef5350" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke="#4caf50" strokeWidth={2} dot={false} />
                <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--color-text-muted)' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Products */}
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '16px' }}>Top Products by Revenue</p>
          {loading ? renderSkeleton(260) : (
            <div>
              {topProducts.map((p) => {
                const idx = topProducts.indexOf(p);
                return (
                  <div key={p.sku || p.name} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: idx < topProducts.length - 1 ? '1px solid var(--color-border-light)' : 'none'
                  }}>
                    <div>
                      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginRight: '8px' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{p.name}</span>
                    </div>
                    <span className="font-mono" style={{ fontSize: '13px', fontWeight: 600 }}>
                      {formatEGP(p.revenue)}
                    </span>
                  </div>
                );
              })}
              {topProducts.length === 0 && (
                <p style={{ color: 'var(--color-text-dim)', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
                  No sales data yet
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* COD Collection */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>COD to Collect</p>
            <p style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '8px' }}>
              {loading ? '—' : formatEGP(deliverySummary?.cod_to_collect)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{loading ? '—' : deliverySummary?.failed || 0}</p>
              <p className="text-label" style={{ color: 'var(--color-error)', fontSize: '10px' }}>Failed</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{loading ? '—' : deliverySummary?.total_today || 0}</p>
              <p className="text-label" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>Today</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
