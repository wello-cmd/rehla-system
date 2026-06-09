import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatDate, getStatusColor } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const STATUS_OPTIONS = ['pending', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'returned'];
const FAILURE_REASONS = [
  ['not_answered', 'Not Answered'],
  ['wrong_address', 'Wrong Address'],
  ['refused', 'Refused'],
  ['postponed', 'Postponed']
];
const CHART_COLORS = ['#6366f1','#3fb950','#f0883e','#58a6ff','#f85149','#a371f7'];
const TT = { background:'#1e1e1e', border:'1px solid #333030', color:'#ede9e8', fontSize:12, borderRadius:6 };

export default function DeliveryPage() {
  const [activeTab, setActiveTab] = useState('dispatcher');
  const [deliveries, setDeliveries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', driver_id: '', delivery_type: '', start: '', end: '' });
  const [assigning, setAssigning] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [statusTarget, setStatusTarget] = useState(null);
  const [newStatus, setNewStatus] = useState('out_for_delivery');
  const [failedReason, setFailedReason] = useState('not_answered');
  const [bostaTarget, setBostaTarget] = useState(null);
  const [bostaForm, setBostaForm] = useState({ package_size: 'SMALL', city: 'Cairo', zone: '', cod_amount: '' });
  const [tracking, setTracking] = useState({});
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', zone: '', status: 'active', availability_status: 'available' });
  const [queue, setQueue] = useState({ orders: [], drivers: [] });
  const [queueLoading, setQueueLoading] = useState(false);
  const [quickAssignTarget, setQuickAssignTarget] = useState(null);
  const [quickDriverId, setQuickDriverId] = useState('');

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const [ordersData, driversData, summaryData, analyticsData] = await Promise.all([
        api.get(`/delivery/orders${params.toString() ? `?${params}` : ''}`),
        api.get('/drivers'),
        api.get('/delivery/summary'),
        api.get('/delivery/analytics')
      ]);
      setDeliveries(ordersData);
      setDrivers(driversData);
      setSummary(summaryData);
      setAnalytics(analyticsData);
    } catch (err) {
      toast.error(err.message || 'Failed to load delivery module');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);


  async function applyFilters(e) {
    e.preventDefault();
    await fetchData();
  }

  async function assignDriver(e) {
    e.preventDefault();
    if (!assigning || !selectedDriverId) return toast.error('Select a driver first');
    try {
      await api.post('/delivery/assign', { delivery_id: assigning.id, driver_id: selectedDriverId });
      toast.success('Driver assigned');
      setAssigning(null);
      setSelectedDriverId('');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to assign driver');
    }
  }

  async function updateStatus(e) {
    e.preventDefault();
    if (!statusTarget) return;
    try {
      await api.patch(`/delivery/orders/${statusTarget.id}/status`, {
        status: newStatus,
        failed_reason: newStatus === 'failed' ? failedReason : null
      });
      toast.success('Delivery status updated');
      setStatusTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to update delivery status');
    }
  }

  async function createBostaShipment(e) {
    e.preventDefault();
    if (!bostaTarget) return;
    const loadingToast = toast.loading('Creating Bosta shipment...');
    try {
      const result = await api.post('/delivery/bosta/create', {
        delivery_order_id: bostaTarget.id,
        receiver_name: bostaTarget.orders?.customer_name,
        receiver_phone: bostaTarget.orders?.customer_phone,
        receiver_address: bostaTarget.customer_address,
        package_size: bostaForm.package_size,
        city: bostaForm.city,
        zone: bostaForm.zone,
        cod_amount: Number(bostaForm.cod_amount || bostaTarget.cod_amount || 0)
      });
      toast.success(`Bosta shipment created: ${result.trackingNumber || 'tracking pending'}`, { id: loadingToast });
      setBostaTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to create Bosta shipment', { id: loadingToast });
    }
  }

  async function fetchQueue() {
    setQueueLoading(true);
    try {
      const data = await api.get('/delivery/dispatch-queue');
      setQueue(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load dispatch queue');
    } finally {
      setQueueLoading(false);
    }
  }

  async function quickAssign(e) {
    e.preventDefault();
    if (!quickAssignTarget || !quickDriverId) return toast.error('Select a driver');
    try {
      await api.post('/delivery/assign', { delivery_id: quickAssignTarget.id, driver_id: quickDriverId });
      toast.success('Driver assigned');
      setQuickAssignTarget(null);
      setQuickDriverId('');
      fetchQueue();
    } catch (err) {
      toast.error(err.message || 'Failed to assign driver');
    }
  }

  async function trackBosta(delivery, showError = false) {
    if (!delivery.tracking_number) return;
    try {
      const data = await api.get(`/delivery/bosta/track/${delivery.tracking_number}`);
      if (data?.status !== 'not_found') {
        setTracking(prev => ({ ...prev, [delivery.id]: data }));
      }
    } catch (err) {
      if (showError) toast.error(err.message || 'Failed to fetch Bosta status');
    }
  }

  async function downloadLabel(delivery) {
    if (!delivery.bosta_shipment_id) return toast.error('No Bosta shipment ID for this order');
    try {
      await api.downloadBlob(`/delivery/bosta/label/${delivery.bosta_shipment_id}`, `bosta-label-${delivery.bosta_shipment_id}.pdf`);
    } catch (err) {
      toast.error(err.message || 'Failed to download label');
    }
  }

  function openDriverModal(driver = null) {
    setEditingDriver(driver);
    setDriverForm(driver ? {
      name: driver.name || '',
      phone: driver.phone || '',
      zone: driver.zone || '',
      status: driver.status || 'active',
      availability_status: driver.availability_status || 'available'
    } : { name: '', phone: '', zone: '', status: 'active', availability_status: 'available' });
    setDriverModalOpen(true);
  }

  async function saveDriver(e) {
    e.preventDefault();
    try {
      if (editingDriver) await api.put(`/drivers/${editingDriver.id}`, driverForm);
      else await api.post('/drivers', driverForm);
      toast.success(editingDriver ? 'Driver updated' : 'Driver added');
      setDriverModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to save driver');
    }
  }

  async function deleteDriver(driver) {
    if (!window.confirm(`Delete ${driver.name}? Active assignments will be returned to pending.`)) return;
    try {
      await api.delete(`/drivers/${driver.id}`);
      toast.success('Driver deleted');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete driver');
    }
  }

  async function toggleAvailability(driver) {
    try {
      await api.put(`/drivers/${driver.id}`, {
        availability_status: driver.availability_status === 'busy' ? 'available' : 'busy'
      });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to update availability');
    }
  }

  const failureChart = useMemo(() => Object.entries(analytics?.failedReasons || {}).map(([name, value]) => ({ name, value })), [analytics]);
  const costComparison = useMemo(() => Object.entries(analytics?.costComparison || {}).map(([type, data]) => ({ type: type.replace('_', ' '), ...data })), [analytics]);

  return (
    <DashboardShell title="Delivery Management">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {[['dispatcher', 'Dispatcher'], ['dispatch-queue', 'Dispatch Queue'], ['drivers', 'Drivers'], ['analytics', 'Analytics']].map(([id, label]) => (
          <button
            key={id}
            className={`btn ${activeTab === id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => { setActiveTab(id); if (id === 'dispatch-queue') fetchQueue(); }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'dispatcher' && (
        <>
          <SummaryCards summary={summary} />

          <form onSubmit={applyFilters} className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <select className="input select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
            <select className="input select" value={filters.driver_id} onChange={(e) => setFilters({ ...filters, driver_id: e.target.value })}>
              <option value="">All drivers</option>
              {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
            </select>
            <select className="input select" value={filters.delivery_type} onChange={(e) => setFilters({ ...filters, delivery_type: e.target.value })}>
              <option value="">All types</option>
              <option value="own_driver">Own Driver</option>
              <option value="bosta">Bosta Courier</option>
            </select>
            <input className="input" type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} />
            <input className="input" type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} />
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
                    <th>Type</th>
                    <th>Driver / Courier</th>
                    <th>COD</th>
                    <th>Status</th>
                    <th>Tracking</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="9" style={{ padding: 32, textAlign: 'center' }}>Loading deliveries...</td></tr>
                  ) : deliveries.length === 0 ? (
                    <tr><td colSpan="9" style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-dim)' }}>No delivery orders found.</td></tr>
                  ) : deliveries.map(delivery => (
                    <tr key={delivery.id}>
                      <td className="font-mono">{delivery.orders?.shopify_order_name || `#${delivery.orders?.order_number || delivery.id.slice(0, 8)}`}</td>
                      <td>
                        <strong>{delivery.orders?.customer_name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{delivery.orders?.customer_phone}</div>
                      </td>
                      <td style={{ maxWidth: 260 }}>{delivery.customer_address || 'No address'}</td>
                      <td>
                        <select
                          className="input select"
                          style={{
                            padding: '4px 24px 4px 8px',
                            fontSize: '12px',
                            width: 'auto',
                            minHeight: '28px',
                            backgroundPosition: 'right 8px center',
                            fontFamily: 'var(--font-sans)',
                            border: '1px solid var(--color-border-light)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--color-bg-card)',
                          }}
                          value={delivery.delivery_type}
                          onChange={async (e) => {
                            try {
                              await api.patch(`/delivery/orders/${delivery.id}/type`, { delivery_type: e.target.value });
                              toast.success('Delivery type updated');
                              fetchData();
                            } catch (err) {
                              toast.error(err.message || 'Failed to update delivery type');
                            }
                          }}
                        >
                          <option value="own_driver">Own Driver</option>
                          <option value="bosta">Bosta Courier</option>
                        </select>
                      </td>
                      <td>
                        {delivery.drivers?.name || (delivery.delivery_type === 'bosta' ? 'Bosta' : 'Unassigned')}
                        {delivery.drivers?.availability_status && (
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{delivery.drivers.availability_status}</div>
                        )}
                      </td>
                      <td>
                        {formatEGP(delivery.cod_amount)}
                        <div style={{ fontSize: 11, color: delivery.cod_collected ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                          {delivery.cod_collected ? 'Collected' : 'Outstanding'}
                        </div>
                      </td>
                      <td><span className={`badge badge-${getStatusColor(delivery.status)}`}>{delivery.status.replace(/_/g, ' ')}</span></td>
                      <td>
                        {delivery.tracking_number ? (
                          <>
                            <div className="font-mono" style={{ fontSize: 12 }}>{delivery.tracking_number}</div>
                            <button className="btn btn-secondary btn-sm" onClick={() => trackBosta(delivery, true)}>Track</button>
                            {tracking[delivery.id] && (
                              <div style={{ fontSize: 12, marginTop: 4 }}>{tracking[delivery.id].statusName || tracking[delivery.id].status}</div>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setAssigning(delivery); setSelectedDriverId(''); }}>Assign</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setStatusTarget(delivery); setNewStatus(delivery.status === 'assigned' ? 'out_for_delivery' : 'delivered'); }}>Status</button>
                          <button className="btn btn-primary btn-sm" onClick={() => { setBostaTarget(delivery); setBostaForm({ package_size: 'SMALL', city: 'Cairo', zone: '', cod_amount: delivery.cod_amount || '' }); }}>Bosta</button>
                          {delivery.bosta_shipment_id && <button className="btn btn-secondary btn-sm" onClick={() => downloadLabel(delivery)}>Label</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'dispatch-queue' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>
              Own-driver orders awaiting dispatch — oldest first.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={fetchQueue}>⟲ Refresh</button>
          </div>

          {/* Driver availability bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {queue.drivers.map(d => (
              <div key={d.id} style={{ padding: '8px 14px', borderRadius: 4, border: '1px solid var(--color-border-light)', fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>{d.name}</span>
                <span style={{ color: 'var(--color-text-dim)', marginLeft: 6 }}>{d.zone || 'No zone'}</span>
                <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, background: d.availability_status === 'available' ? '#22c55e22' : '#f59e0b22', color: d.availability_status === 'available' ? '#22c55e' : '#f59e0b' }}>
                  {d.availability_status}
                </span>
                <span className="font-mono" style={{ marginLeft: 8, color: 'var(--color-text-dim)', fontSize: 11 }}>{d.active_orders} active</span>
              </div>
            ))}
            {queue.drivers.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-dim)' }}>No active drivers configured.</p>}
          </div>

          {queueLoading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Order</th><th>Customer</th><th>Address</th><th>COD</th><th>Status</th><th>Assigned Driver</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {queue.orders.map(o => (
                      <tr key={o.id}>
                        <td className="font-mono" style={{ fontSize: 12 }}>{o.orders?.shopify_order_name || (o.orders?.order_number ? `#${o.orders.order_number}` : '—')}</td>
                        <td>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{o.orders?.customer_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{o.orders?.customer_phone}</div>
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.customer_address}>{o.customer_address || '—'}</td>
                        <td className="font-mono" style={{ fontSize: 13 }}>{formatEGP(o.cod_amount || 0)}</td>
                        <td><span className={`badge badge-${o.status === 'assigned' ? 'warning' : 'neutral'}`}>{o.status}</span></td>
                        <td style={{ fontSize: 13 }}>{o.drivers?.name || <span style={{ color: 'var(--color-text-dim)' }}>Unassigned</span>}</td>
                        <td>
                          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => { setQuickAssignTarget(o); setQuickDriverId(''); }}>
                            {o.drivers ? 'Reassign' : 'Assign Driver'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {queue.orders.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)' }}>No pending own-driver orders.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick-assign modal */}
          {quickAssignTarget && (
            <Modal title={`Assign Driver — ${quickAssignTarget.orders?.shopify_order_name || '#' + quickAssignTarget.orders?.order_number}`} onClose={() => setQuickAssignTarget(null)}>
              <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--color-text-dim)' }}>
                {quickAssignTarget.orders?.customer_name} · {quickAssignTarget.customer_address}
              </p>
              <form onSubmit={quickAssign} style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>Select Driver</label>
                  <select className="input" required value={quickDriverId} onChange={e => setQuickDriverId(e.target.value)}>
                    <option value="">— Choose driver —</option>
                    {queue.drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.zone || 'No zone'}) — {d.active_orders} active orders — {d.availability_status}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuickAssignTarget(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm">Assign</button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}

      {activeTab === 'drivers' && (
        <DriversPanel
          drivers={drivers}
          openDriverModal={openDriverModal}
          deleteDriver={deleteDriver}
          toggleAvailability={toggleAvailability}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsPanel analytics={analytics} failureChart={failureChart} costComparison={costComparison} />
      )}

      {assigning && (
        <Modal title="Assign Own Driver" onClose={() => setAssigning(null)}>
          <form onSubmit={assignDriver} style={{ display: 'grid', gap: 16 }}>
            <select className="input select" value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)} required>
              <option value="">Choose active available driver</option>
              {drivers.filter(driver => driver.status === 'active' && driver.availability_status !== 'busy').map(driver => (
                <option key={driver.id} value={driver.id}>{driver.name} ({driver.zone || 'No zone'})</option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit">Assign Driver</button>
          </form>
        </Modal>
      )}

      {statusTarget && (
        <Modal title="Update Delivery Status" onClose={() => setStatusTarget(null)}>
          <form onSubmit={updateStatus} style={{ display: 'grid', gap: 16 }}>
            <select className="input select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} required>
              {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
            {newStatus === 'failed' && (
              <select className="input select" value={failedReason} onChange={(e) => setFailedReason(e.target.value)} required>
                {FAILURE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}
            <button className="btn btn-primary" type="submit">Save Status</button>
          </form>
        </Modal>
      )}

      {bostaTarget && (
        <Modal title="Create Bosta Shipment" onClose={() => setBostaTarget(null)}>
          <form onSubmit={createBostaShipment} style={{ display: 'grid', gap: 12 }}>
            <input className="input" value={bostaTarget.orders?.customer_name || ''} readOnly />
            <input className="input" value={bostaTarget.orders?.customer_phone || ''} readOnly />
            <input className="input" value={bostaTarget.customer_address || ''} readOnly />
            <select className="input select" value={bostaForm.package_size} onChange={(e) => setBostaForm({ ...bostaForm, package_size: e.target.value })}>
              <option value="SMALL">Small</option>
              <option value="MEDIUM">Medium</option>
              <option value="LARGE">Large</option>
            </select>
            <input className="input" value={bostaForm.city} onChange={(e) => setBostaForm({ ...bostaForm, city: e.target.value })} placeholder="City" />
            <input className="input" value={bostaForm.zone} onChange={(e) => setBostaForm({ ...bostaForm, zone: e.target.value })} placeholder="Zone" />
            <input className="input" type="number" value={bostaForm.cod_amount} onChange={(e) => setBostaForm({ ...bostaForm, cod_amount: e.target.value })} placeholder="COD amount EGP" />
            <button className="btn btn-primary" type="submit">Create Shipment</button>
          </form>
        </Modal>
      )}

      {driverModalOpen && (
        <Modal title={editingDriver ? 'Edit Driver' : 'Add Driver'} onClose={() => setDriverModalOpen(false)}>
          <form onSubmit={saveDriver} style={{ display: 'grid', gap: 12 }}>
            <input className="input" value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} placeholder="Driver name" required />
            <input className="input" value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} placeholder="Phone" required />
            <input className="input" value={driverForm.zone} onChange={(e) => setDriverForm({ ...driverForm, zone: e.target.value })} placeholder="Zone" />
            <select className="input select" value={driverForm.status} onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select className="input select" value={driverForm.availability_status} onChange={(e) => setDriverForm({ ...driverForm, availability_status: e.target.value })}>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
            </select>
            <button className="btn btn-primary" type="submit">{editingDriver ? 'Save Driver' : 'Add Driver'}</button>
          </form>
        </Modal>
      )}
    </DashboardShell>
  );
}

function SummaryCards({ summary }) {
  const cards = [
    ['Total Today', summary?.total_today || 0, ''],
    ['Out for Delivery', summary?.out_for_delivery || 0, 'var(--color-warning)'],
    ['Delivered', summary?.delivered || 0, 'var(--color-success)'],
    ['Failed', summary?.failed || 0, 'var(--color-error)'],
    ['COD Outstanding', formatEGP(summary?.cod_outstanding || summary?.cod_to_collect || 0), '']
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
      {cards.map(([label, value, color]) => (
        <div className="card" key={label}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 8 }}>{label}</p>
          <p className="font-mono" style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--color-text)' }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function DriversPanel({ drivers, openDriverModal, deleteDriver, toggleAvailability }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <p className="text-label" style={{ color:'var(--color-text-dim)' }}>Drivers</p>
        <button className="btn btn-primary" onClick={() => openDriverModal()}>Add Driver</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {drivers.map(driver => (
          <div className="card" key={driver.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>{driver.name}</h3>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{driver.phone} · {driver.zone || 'No zone'}</p>
              </div>
              <span className={`badge badge-${driver.status === 'active' ? 'success' : 'neutral'}`}>{driver.status}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 18 }}>
              <DriverMetric label="Total" value={driver.stats?.total_deliveries || 0} />
              <DriverMetric label="Done" value={driver.stats?.delivered || 0} />
              <DriverMetric label="Failed" value={driver.stats?.failed || 0} />
              <DriverMetric label="Rate" value={`${driver.stats?.success_rate || 0}%`} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => toggleAvailability(driver)}>
                {driver.availability_status === 'busy' ? 'Mark Available' : 'Mark Busy'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => openDriverModal(driver)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => deleteDriver(driver)}>Delete</button>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                /driver/{driver.uuid_link || driver.id}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DriverMetric({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--color-border-light)', padding: 8 }}>
      <p className="text-label" style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>{label}</p>
      <p className="font-mono" style={{ fontWeight: 800, marginTop: 4 }}>{value}</p>
    </div>
  );
}

function AnalyticsPanel({ analytics, failureChart, costComparison }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>COD Collected</p>
          <p className="font-mono" style={{ fontSize: 26, fontWeight: 800 }}>{formatEGP(analytics?.cod?.collected || 0)}</p>
        </div>
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>COD Outstanding</p>
          <p className="font-mono" style={{ fontSize: 26, fontWeight: 800 }}>{formatEGP(analytics?.cod?.outstanding || 0)}</p>
        </div>
      </div>

      <div className="card">
        <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Average Delivery Time per Driver</p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics?.driverAnalytics || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis dataKey="name" tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
              <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="avg_delivery_time_hrs" name="Avg hours" fill="#6366f1" opacity={0.85} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card">
          <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Failed Delivery Rate by Reason</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={failureChart} dataKey="value" nameKey="name" outerRadius={90} innerRadius={40} paddingAngle={2} label>
                  {failureChart.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend wrapperStyle={{ fontSize:11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <p className="text-label" style={{ color:'var(--color-text-dim)', marginBottom: 14 }}>Bosta vs Own Driver</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="type" tick={{ fill:'var(--color-text-muted)', fontSize:11 }} />
                <YAxis tick={{ fill:'var(--color-text-muted)', fontSize:10 }} />
                <Tooltip contentStyle={TT} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Bar dataKey="total"     fill="#6366f1" opacity={0.5} radius={[2,2,0,0]} />
                <Bar dataKey="delivered" fill="#3fb950" radius={[2,2,0,0]} />
                <Bar dataKey="failed"    fill="#f85149" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>{title}</p>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
