import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatDate, formatDateTime, getStatusColor, timeAgo } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const STATUS_OPTIONS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PAYMENT_STATUS_OPTIONS = ['paid', 'pending', 'failed', 'refunded'];
const CHART_COLORS = ['#6366f1','#3fb950','#f0883e','#58a6ff','#f85149','#a371f7','#38bdf8'];
const TT = { background:'#1e1e1e', border:'1px solid #333030', color:'#ede9e8', fontSize:12, borderRadius:6 };

export default function ShopifyPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState(null);
  const [syncLog, setSyncLog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({ status: '', payment_status: '', start: '', end: '' });
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  async function fetchOverview() {
    setLoading(true);
    try {
      const [analyticsData, logData] = await Promise.all([
        api.get('/shopify/analytics'),
        api.get('/shopify/sync-log')
      ]);
      setAnalytics(analyticsData);
      setSyncLog(logData || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load Shopify data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrders(newOffset = 0) {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: newOffset });
      if (filters.status) params.set('status', filters.status);
      if (filters.payment_status) params.set('payment_status', filters.payment_status);
      if (filters.start) params.set('start', filters.start);
      if (filters.end) params.set('end', filters.end);
      const data = await api.get(`/shopify/orders?${params}`);
      setOrders(data.orders || []);
      setOrdersTotal(data.total || 0);
      setOffset(newOffset);
    } catch (err) {
      toast.error(err.message || 'Failed to load orders');
    } finally {
      setOrdersLoading(false);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    const t = toast.loading('Syncing Shopify products & orders...');
    try {
      const result = await api.post('/shopify/sync', {});
      toast.success(
        `Sync done — ${result.productsUpdated || 0} products updated, ${result.orders?.ordersSynced || 0} orders synced`,
        { id: t }
      );
      fetchOverview();
    } catch (err) {
      toast.error(err.message || 'Sync failed', { id: t });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { fetchOverview(); }, []);
  useEffect(() => { if (activeTab === 'orders') fetchOrders(0); }, [activeTab]);

  const statusChartData = useMemo(() =>
    Object.entries(analytics?.statusBreakdown || {}).map(([name, value]) => ({ name, value })),
    [analytics]
  );
  const paymentMethodData = useMemo(() =>
    Object.entries(analytics?.paymentMethodBreakdown || {}).map(([name, value]) => ({ name: name.replace('_', ' '), value })),
    [analytics]
  );

  return (
    <DashboardShell title="Shopify Channel">
      <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--color-border-light)', paddingBottom:4, marginBottom:24 }}>
        {[
          { id:'overview', label:'Overview' },
          { id:'orders',   label:'Orders'   },
          { id:'sync',     label:'Sync Log' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="btn btn-sm"
            style={{
              background:  activeTab === tab.id ? 'var(--color-bg-active)' : 'transparent',
              borderColor: activeTab === tab.id ? 'var(--color-border)'    : 'transparent',
              color:       activeTab === tab.id ? 'var(--color-text)'      : 'var(--color-text-muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" onClick={triggerSync} disabled={syncing} style={{ marginLeft:'auto' }}>
          <span className="material-symbols-outlined" style={{ fontSize:15 }}>{syncing ? 'hourglass_top' : 'sync'}</span>
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      {activeTab === 'overview' && (
        loading ? <p style={{ color: 'var(--color-text-dim)' }}>Loading analytics...</p> : (
          <div style={{ display: 'grid', gap: 20 }}>
            <SummaryCards analytics={analytics} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              <div className="card">
                <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Revenue — Last 30 Days</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.revenueChart || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={TT} formatter={(v) => [formatEGP(v), 'Revenue']} />
                      <Bar dataKey="revenue" name="Revenue" fill="#6366f1" opacity={0.9} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Orders per Day — Last 30 Days</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.revenueChart || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={TT} />
                      <Bar dataKey="orders" name="Orders" fill="#3fb950" opacity={0.85} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <div className="card">
                <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Order Status Breakdown</p>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusChartData} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}
                        label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                        {statusChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TT} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Payment Method Breakdown</p>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={paymentMethodData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis type="number" tick={{ fill:'var(--color-text-muted)', fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill:'var(--color-text-muted)', fontSize: 11 }} width={80} />
                      <Tooltip contentStyle={TT} />
                      <Bar dataKey="value" name="Orders" fill="#58a6ff" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card">
              <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Top 10 Products by Revenue</p>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>SKU</th>
                      <th>Name</th>
                      <th>Units Sold</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.topProducts || []).length === 0 ? (
                      <tr><td colSpan="5" style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-dim)' }}>No product data yet.</td></tr>
                    ) : (analytics?.topProducts || []).map((p, i) => (
                      <tr key={p.sku}>
                        <td className="font-mono" style={{ color: 'var(--color-text-dim)' }}>{i + 1}</td>
                        <td className="font-mono">{p.sku}</td>
                        <td>{p.name}</td>
                        <td className="font-mono">{p.units.toLocaleString()}</td>
                        <td className="font-mono">{formatEGP(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'orders' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <form
            onSubmit={e => { e.preventDefault(); fetchOrders(0); }}
            className="card"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}
          >
            <select className="input select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            <select className="input select" value={filters.payment_status} onChange={e => setFilters({ ...filters, payment_status: e.target.value })}>
              <option value="">All payment statuses</option>
              {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input" type="date" value={filters.start} onChange={e => setFilters({ ...filters, start: e.target.value })} />
            <input className="input" type="date" value={filters.end} onChange={e => setFilters({ ...filters, end: e.target.value })} />
            <button className="btn btn-primary" type="submit">Apply</button>
          </form>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-label" style={{ color: 'var(--color-text-dim)' }}>{ordersTotal} Shopify Orders</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => fetchOrders(offset - LIMIT)}>Prev</button>
                <span className="font-mono" style={{ fontSize: 12, alignSelf: 'center' }}>{offset + 1}–{Math.min(offset + LIMIT, ordersTotal)}</span>
                <button className="btn btn-secondary btn-sm" disabled={offset + LIMIT >= ordersTotal} onClick={() => fetchOrders(offset + LIMIT)}>Next</button>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Method</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersLoading ? (
                    <tr><td colSpan="8" style={{ padding: 32, textAlign: 'center' }}>Loading...</td></tr>
                  ) : orders.length === 0 ? (
                    <tr><td colSpan="8" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-dim)' }}>No orders found.</td></tr>
                  ) : orders.map(o => (
                    <tr key={o.id}>
                      <td className="font-mono">{o.shopify_order_name || `#${o.order_number}`}</td>
                      <td>
                        <strong>{o.customer_name}</strong>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{o.customer_phone}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {(Array.isArray(o.items) ? o.items : []).slice(0, 2).map((item, i) => (
                          <div key={i}>{item.quantity}x {item.name}</div>
                        ))}
                        {(Array.isArray(o.items) ? o.items : []).length > 2 && (
                          <div style={{ color: 'var(--color-text-dim)' }}>+{o.items.length - 2} more</div>
                        )}
                      </td>
                      <td className="font-mono">{formatEGP(o.total)}</td>
                      <td><span className={`badge badge-${getStatusColor(o.status)}`}>{o.status}</span></td>
                      <td><span className={`badge badge-${getStatusColor(o.payment_status)}`}>{o.payment_status}</span></td>
                      <td style={{ fontSize: 12 }}>{(o.payment_method || '').replace('_', ' ')}</td>
                      <td style={{ fontSize: 12 }}>{formatDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sync' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <p className="text-label" style={{ color:'var(--color-text-dim)' }}>Manual Sync</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Pull latest products and orders from Shopify. Rate-limited to 2 req/s with exponential backoff.
              </p>
            </div>
            <button className="btn btn-primary" onClick={triggerSync} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Run Full Sync'}
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-light)' }}>
              <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Sync History</p>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Triggered By</th>
                    <th>Status</th>
                    <th>Products Updated</th>
                    <th>Products Created</th>
                    <th>Products Skipped</th>
                    <th>Orders Synced</th>
                    <th>Customers Synced</th>
                    <th>Duration</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLog.length === 0 ? (
                    <tr><td colSpan="10" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-dim)' }}>No sync history.</td></tr>
                  ) : syncLog.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12 }} title={formatDateTime(log.synced_at)}>{timeAgo(log.synced_at)}</td>
                      <td style={{ fontSize: 12 }}>{log.triggered_by}</td>
                      <td><span className={`badge badge-${log.status === 'success' ? 'success' : 'error'}`}>{log.status}</span></td>
                      <td className="font-mono">{log.products_updated ?? '—'}</td>
                      <td className="font-mono">{log.products_created ?? '—'}</td>
                      <td className="font-mono">{log.products_skipped ?? '—'}</td>
                      <td className="font-mono">{log.orders_synced ?? '—'}</td>
                      <td className="font-mono">{log.customers_synced ?? '—'}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--color-error)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.error_details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function SummaryCards({ analytics }) {
  const s = analytics?.summary || {};
  const cards = [
    ['Total Orders', s.total_orders ?? 0, ''],
    ['Total Revenue', formatEGP(s.total_revenue ?? 0), 'var(--color-success)'],
    ['Avg Order Value', formatEGP(s.avg_order_value ?? 0), ''],
    ['Collected (incl. COD)', s.paid_orders ?? 0, 'var(--color-success)'],
    ['Pending Payment', s.pending_orders ?? 0, 'var(--color-warning)'],
    ['Delivered', s.delivered_orders ?? 0, 'var(--color-success)'],
    ['Fulfillment Rate', `${s.fulfillment_rate ?? 0}%`, s.fulfillment_rate >= 80 ? 'var(--color-success)' : 'var(--color-warning)'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      {cards.map(([label, value, color]) => (
        <div className="card" key={label}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>{label}</p>
          <p className="font-mono" style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--color-text)' }}>{value}</p>
        </div>
      ))}
    </div>
  );
}
