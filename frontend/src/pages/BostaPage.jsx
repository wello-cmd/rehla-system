import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatDate, formatDateTime, getStatusColor, timeAgo } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const BOSTA_STATUSES = ['pending', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const CHART_COLORS = ['#e5e2e1', '#988e90', '#6b6365', '#22c55e', '#ef4444', '#8b5cf6'];
const STATUS_COLORS = {
  pending: '#e5e2e1', assigned: '#988e90', out_for_delivery: '#f59e0b',
  delivered: '#22c55e', failed: '#ef4444', returned: '#8b5cf6'
};

export default function BostaPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [filters, setFilters] = useState({ status: '', start: '', end: '' });
  const [tracking, setTracking] = useState({});
  const [trackingLoading, setTrackingLoading] = useState({});

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const data = await api.get('/bosta/analytics');
      setAnalytics(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load Bosta analytics');
    } finally {
      setLoading(false);
    }
  }

  async function fetchShipments() {
    setShipmentsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.start) params.set('start', filters.start);
      if (filters.end) params.set('end', filters.end);
      const data = await api.get(`/bosta/shipments${params.toString() ? `?${params}` : ''}`);
      setShipments(data || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load shipments');
    } finally {
      setShipmentsLoading(false);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    const t = toast.loading('Syncing active Bosta shipments...');
    try {
      const result = await api.post('/bosta/sync', {});
      setSyncResult(result);
      toast.success(`Sync complete — ${result.syncedCount ?? 0} shipments updated`, { id: t });
      fetchAnalytics();
    } catch (err) {
      toast.error(err.message || 'Sync failed', { id: t });
    } finally {
      setSyncing(false);
    }
  }

  async function trackShipment(shipment) {
    if (!shipment.tracking_number) return toast.error('No tracking number');
    setTrackingLoading(prev => ({ ...prev, [shipment.id]: true }));
    try {
      const data = await api.get(`/delivery/bosta/track/${shipment.tracking_number}`);
      setTracking(prev => ({ ...prev, [shipment.id]: data }));
    } catch (err) {
      toast.error(err.message || 'Failed to fetch tracking');
    } finally {
      setTrackingLoading(prev => ({ ...prev, [shipment.id]: false }));
    }
  }

  async function downloadLabel(shipment) {
    if (!shipment.bosta_shipment_id) return toast.error('No shipment ID');
    try {
      await api.downloadBlob(`/delivery/bosta/label/${shipment.bosta_shipment_id}`, `bosta-label-${shipment.bosta_shipment_id}.pdf`);
    } catch (err) {
      toast.error(err.message || 'Failed to download label');
    }
  }

  useEffect(() => { fetchAnalytics(); }, []);
  useEffect(() => { if (activeTab === 'shipments') fetchShipments(); }, [activeTab]);

  const statusChartData = useMemo(() =>
    Object.entries(analytics?.statusBreakdown || {}).map(([name, value]) => ({
      name: name.replace(/_/g, ' '), value, color: STATUS_COLORS[name] || '#988e90'
    })),
    [analytics]
  );

  const failureChartData = useMemo(() =>
    Object.entries(analytics?.failureReasons || {}).map(([name, value]) => ({
      name: name.replace(/_/g, ' '), value
    })),
    [analytics]
  );

  return (
    <DashboardShell title="Bosta Channel">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {['overview', 'shipments', 'sync'].map(tab => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveTab(tab)}
            style={{ textTransform: 'capitalize' }}
          >
            {tab}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" onClick={triggerSync} disabled={syncing} style={{ marginLeft: 'auto' }}>
          {syncing ? 'Syncing...' : 'Sync Tracking'}
        </button>
      </div>

      {activeTab === 'overview' && (
        loading ? <p style={{ color: 'var(--color-text-dim)' }}>Loading analytics...</p> : (
          <div style={{ display: 'grid', gap: 20 }}>
            <BostaSummaryCards analytics={analytics} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <div className="card">
                <p className="text-title" style={{ marginBottom: 16 }}>Shipment Status Distribution</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusChartData} dataKey="value" nameKey="name" outerRadius={90} label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                        {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <p className="text-title" style={{ marginBottom: 16 }}>COD Overview</p>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: 16, border: '1px solid var(--color-border-light)', borderRadius: 4 }}>
                      <p className="text-label" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>COD Collected</p>
                      <p className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-success)', marginTop: 4 }}>
                        {formatEGP(analytics?.summary?.cod_collected || 0)}
                      </p>
                    </div>
                    <div style={{ padding: 16, border: '1px solid var(--color-border-light)', borderRadius: 4 }}>
                      <p className="text-label" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>COD Outstanding</p>
                      <p className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-warning)', marginTop: 4 }}>
                        {formatEGP(analytics?.summary?.cod_outstanding || 0)}
                      </p>
                    </div>
                  </div>
                  <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.codBreakdown || []}>
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={v => formatEGP(v)} />
                        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                          {(analytics?.codBreakdown || []).map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              <div className="card">
                <p className="text-title" style={{ marginBottom: 16 }}>Daily Volume — Last 30 Days</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.dailyVolume || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total" name="Total" fill="#e5e2e1" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="delivered" name="Delivered" fill="#22c55e" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <p className="text-title" style={{ marginBottom: 16 }}>Failure Reasons</p>
                {failureChartData.length === 0 ? (
                  <p style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>No failed shipments.</p>
                ) : (
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={failureChartData} dataKey="value" nameKey="name" outerRadius={80} label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                          {failureChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {analytics?.avgDeliveryTimeHrs !== null && analytics?.avgDeliveryTimeHrs !== undefined && (
                  <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--color-border-light)', borderRadius: 4 }}>
                    <p className="text-label" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Avg Delivery Time</p>
                    <p className="font-mono" style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
                      {analytics.avgDeliveryTimeHrs} hrs
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'shipments' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <form
            onSubmit={e => { e.preventDefault(); fetchShipments(); }}
            className="card"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}
          >
            <select className="input select" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {BOSTA_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            <input className="input" type="date" value={filters.start} onChange={e => setFilters({ ...filters, start: e.target.value })} />
            <input className="input" type="date" value={filters.end} onChange={e => setFilters({ ...filters, end: e.target.value })} />
            <button className="btn btn-primary" type="submit">Apply</button>
          </form>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Tracking #</th>
                    <th>COD</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shipmentsLoading ? (
                    <tr><td colSpan="8" style={{ padding: 32, textAlign: 'center' }}>Loading...</td></tr>
                  ) : shipments.length === 0 ? (
                    <tr><td colSpan="8" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-dim)' }}>No Bosta shipments found.</td></tr>
                  ) : shipments.map(s => (
                    <tr key={s.id}>
                      <td className="font-mono">
                        {s.orders?.shopify_order_name || `#${s.orders?.order_number || s.id.slice(0, 8)}`}
                      </td>
                      <td>
                        <strong>{s.orders?.customer_name || '—'}</strong>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{s.orders?.customer_phone}</div>
                      </td>
                      <td style={{ maxWidth: 200, fontSize: 12 }}>{s.customer_address || '—'}</td>
                      <td>
                        {s.tracking_number ? (
                          <span className="font-mono" style={{ fontSize: 12 }}>{s.tracking_number}</span>
                        ) : '—'}
                        {tracking[s.id] && (
                          <div style={{ fontSize: 11, marginTop: 2, color: 'var(--color-text-muted)' }}>
                            {tracking[s.id].statusName || tracking[s.id].status}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="font-mono">{formatEGP(s.cod_amount)}</span>
                        <div style={{ fontSize: 11, color: s.cod_collected ? 'var(--color-success)' : 'var(--color-text-dim)' }}>
                          {s.cod_collected ? 'Collected' : 'Outstanding'}
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${getStatusColor(s.status)}`}>
                          {s.status.replace(/_/g, ' ')}
                        </span>
                        {s.failed_reason && (
                          <div style={{ fontSize: 10, color: 'var(--color-error)', marginTop: 2 }}>
                            {s.failed_reason.replace(/_/g, ' ')}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }} title={formatDateTime(s.created_at)}>{timeAgo(s.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {s.tracking_number && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => trackShipment(s)}
                              disabled={trackingLoading[s.id]}
                            >
                              {trackingLoading[s.id] ? '...' : 'Track'}
                            </button>
                          )}
                          {s.bosta_shipment_id && (
                            <button className="btn btn-secondary btn-sm" onClick={() => downloadLabel(s)}>
                              Label
                            </button>
                          )}
                        </div>
                      </td>
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
              <p className="text-title">Tracking Sync</p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Fetches live status from Bosta API for all active shipments (not yet delivered or failed) and updates their status in the system.
              </p>
            </div>
            <button className="btn btn-primary" onClick={triggerSync} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {syncResult && (
            <div className="card" style={{ borderLeft: `4px solid ${syncResult.success ? 'var(--color-success)' : 'var(--color-error)'}` }}>
              <p className="text-title" style={{ marginBottom: 8 }}>Last Sync Result</p>
              <p style={{ fontSize: 13 }}>
                <span className={`badge badge-${syncResult.success ? 'success' : 'error'}`}>
                  {syncResult.success ? 'Success' : 'Failed'}
                </span>
                <span style={{ marginLeft: 10, color: 'var(--color-text-muted)' }}>{syncResult.message}</span>
              </p>
              {syncResult.syncedCount !== undefined && (
                <p className="font-mono" style={{ fontSize: 24, fontWeight: 800, marginTop: 12 }}>
                  {syncResult.syncedCount} shipments updated
                </p>
              )}
              {syncResult.error && (
                <p style={{ color: 'var(--color-error)', fontSize: 13, marginTop: 8 }}>{syncResult.error}</p>
              )}
            </div>
          )}

          <div className="card">
            <p className="text-title" style={{ marginBottom: 12 }}>How Tracking Sync Works</p>
            <ol style={{ paddingLeft: 20, fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 2 }}>
              <li>Finds all Bosta shipments with status not in <em>delivered</em> or <em>failed</em></li>
              <li>Calls the Bosta tracking API for each shipment&apos;s tracking number</li>
              <li>Maps Bosta status codes to system statuses (DELIVERED → delivered, IN_TRANSIT → out_for_delivery, etc.)</li>
              <li>Updates delivery order status and logs a sync event in the delivery log</li>
              <li>If a shipment is delivered, also marks the linked order and invoice as paid</li>
            </ol>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function BostaSummaryCards({ analytics }) {
  const s = analytics?.summary || {};
  const cards = [
    ['Total Shipments', s.total ?? 0, ''],
    ['Delivered', s.delivered ?? 0, 'var(--color-success)'],
    ['In Transit', s.in_transit ?? 0, 'var(--color-warning)'],
    ['Failed', s.failed ?? 0, 'var(--color-error)'],
    ['Returned', s.returned ?? 0, ''],
    ['Pending / Assigned', s.pending ?? 0, ''],
    ['COD Collected', formatEGP(s.cod_collected ?? 0), 'var(--color-success)'],
    ['COD Outstanding', formatEGP(s.cod_outstanding ?? 0), 'var(--color-warning)'],
    ['Success Rate', `${s.success_rate ?? 0}%`, s.success_rate >= 80 ? 'var(--color-success)' : 'var(--color-warning)'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {cards.map(([label, value, color]) => (
        <div className="card" key={label}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>{label}</p>
          <p className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--color-text)' }}>{value}</p>
        </div>
      ))}
    </div>
  );
}
