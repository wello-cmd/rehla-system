import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber, formatDate, getStatusColor } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function DeliveryPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [trackingInfo, setTrackingInfo] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningDelivery, setAssigningDelivery] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  // Fetch all necessary data
  async function fetchData() {
    try {
      const [delData, driverData, summaryData] = await Promise.all([
        api.get('/deliveries'),
        api.get('/drivers'),
        api.get('/deliveries/summary')
      ]);
      setDeliveries(delData);
      setDrivers(driverData);
      setSummary(summaryData);
    } catch (err) {
      toast.error('Failed to fetch delivery data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Driver Assignment
  async function handleAssignDriver(e) {
    e.preventDefault();
    if (!selectedDriverId) {
      toast.error('Please select a driver');
      return;
    }
    try {
      await api.post('/deliveries/assign', {
        delivery_id: assigningDelivery.id,
        driver_id: parseInt(selectedDriverId, 10)
      });
      toast.success('Driver assigned successfully');
      setShowAssignModal(false);
      setSelectedDriverId('');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to assign driver');
    }
  }

  // Create Bosta Shipment
  async function handleCreateBosta(deliveryId) {
    const loadingToast = toast.loading('Creating Bosta shipment...');
    try {
      const res = await api.post(`/deliveries/${deliveryId}/bosta`);
      toast.success(`Bosta shipment created! Tracking: ${res.trackingNumber}`, { id: loadingToast });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to create Bosta shipment', { id: loadingToast });
    }
  }

  // Track Bosta Shipment
  async function handleTrackBosta(delivery) {
    setSelectedDelivery(delivery);
    setTrackingLoading(true);
    setTrackingInfo(null);
    try {
      const tracking = await api.get(`/deliveries/${delivery.id}/track`);
      setTrackingInfo(tracking);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch Bosta tracking info');
      setSelectedDelivery(null);
    } finally {
      setTrackingLoading(false);
    }
  }

  // Download Waybill PDF
  async function handleDownloadWaybill(deliveryId) {
    try {
      await api.downloadBlob(`/deliveries/${deliveryId}/waybill`, `waybill-${deliveryId.slice(0, 8)}.pdf`);
      toast.success('Waybill downloaded successfully');
    } catch (err) {
      toast.error('Failed to download waybill');
    }
  }

  const renderSkeleton = () => (
    <div style={{ padding: '24px' }}>
      <div className="skeleton" style={{ height: '40px', marginBottom: '16px' }}></div>
      <div className="skeleton" style={{ height: '200px' }}></div>
    </div>
  );

  return (
    <DashboardShell title="Delivery Dispatcher">
      {loading ? renderSkeleton() : (
        <>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Total Today</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{summary?.total_today}</p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Out for Delivery</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)' }}>
                {summary?.out_for_delivery}
              </p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Delivered</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>
                {summary?.delivered}
              </p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>Failed</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>
                {summary?.failed}
              </p>
            </div>
            <div className="card">
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>COD to Collect</p>
              <p style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(summary?.cod_to_collect)}</p>
            </div>
          </div>

          {/* Deliveries Table */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="text-title">Active Deliveries</p>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Zone/Address</th>
                    <th>Type</th>
                    <th>Driver / Courier</th>
                    <th>COD Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>
                        {d.orders?.order_number || 'N/A'}
                      </td>
                      <td>
                        <p style={{ fontWeight: 500 }}>{d.orders?.customer_name}</p>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{d.orders?.customer_phone}</p>
                      </td>
                      <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span className="badge badge-neutral" style={{ marginRight: '6px' }}>{d.zone || 'No Zone'}</span>
                        <span style={{ fontSize: '13px' }}>{d.customer_address}</span>
                      </td>
                      <td style={{ textTransform: 'uppercase', fontSize: '12px', fontWeight: 600 }}>
                        {d.delivery_type || 'Internal'}
                      </td>
                      <td>
                        {d.drivers ? (
                          <div>
                            <p style={{ fontWeight: 500 }}>{d.drivers.name}</p>
                            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{d.drivers.phone}</p>
                          </div>
                        ) : d.tracking_number ? (
                          <div>
                            <p style={{ fontWeight: 500, color: 'var(--color-info)' }}>Bosta Courier</p>
                            <p className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Track: {d.tracking_number}</p>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-dim)', fontSize: '13px' }}>Unassigned</span>
                        )}
                      </td>
                      <td className="font-mono">{formatEGP(d.cod_amount)}</td>
                      <td>
                        <span className={`badge badge-${getStatusColor(d.status)}`}>
                          {d.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {!d.drivers && !d.tracking_number && (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setAssigningDelivery(d);
                                  setShowAssignModal(true);
                                }}
                              >
                                Assign
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleCreateBosta(d.id)}
                              >
                                Bosta
                              </button>
                            </>
                          )}
                          {d.delivery_type === 'bosta' && d.tracking_number && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleTrackBosta(d)}
                            >
                              Track
                            </button>
                          )}
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDownloadWaybill(d.id)}
                            title="Download Waybill PDF"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {deliveries.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
                        No delivery orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Assign Driver Modal */}
      {showAssignModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <p className="text-title" style={{ marginBottom: '20px' }}>Assign Internal Driver</p>
            <form onSubmit={handleAssignDriver}>
              <div style={{ marginBottom: '24px' }}>
                <label className="text-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--color-text-muted)' }}>
                  Select Driver
                </label>
                <select
                  className="input select"
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers
                    .filter(dr => dr.status === 'active')
                    .map(dr => (
                      <option key={dr.id} value={dr.id}>
                        {dr.name} ({dr.zone || 'No zone'})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAssignModal(false);
                    setAssigningDelivery(null);
                    setSelectedDriverId('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bosta Tracking Modal */}
      {selectedDelivery && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p className="text-title">Bosta Tracking: {selectedDelivery.tracking_number}</p>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedDelivery(null)}
              >
                Close
              </button>
            </div>

            {trackingLoading ? (
              <div className="skeleton" style={{ height: '150px' }}></div>
            ) : trackingInfo ? (
              <div>
                <div className="card" style={{ background: 'var(--color-bg)', marginBottom: '16px' }}>
                  <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>Current Status</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, textTransform: 'uppercase', marginTop: '6px' }}>
                    {trackingInfo.state}
                  </p>
                  {trackingInfo.deliveredAt && (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Delivered on {formatDate(trackingInfo.deliveredAt)}
                    </p>
                  )}
                </div>

                <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>Tracking History</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {trackingInfo.history?.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', borderLeft: '2px solid var(--color-border-light)', paddingLeft: '16px', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: '-5px', top: '6px', width: '8px', height: '8px',
                        borderRadius: '50%', background: idx === 0 ? 'var(--color-info)' : 'var(--color-border)'
                      }}></div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '14px' }}>{step.state}</p>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{formatDate(step.timestamp)}</p>
                        {step.note && <p style={{ fontSize: '12px', marginTop: '2px', fontStyle: 'italic' }}>{step.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--color-error)' }}>Failed to load tracking data.</p>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
