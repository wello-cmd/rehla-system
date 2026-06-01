import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatEGP } from '../lib/formatters';
import toast from 'react-hot-toast';

export default function DriverPage() {
  const { uuid } = useParams();
  const [driver, setDriver] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('out_for_delivery');
  const [failedReason, setFailedReason] = useState('not_answered');
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  async function fetchDriverJobs() {
    try {
      const data = await api.get(`/delivery/driver/${uuid}/orders`);
      setDriver(data.driver);
      setDeliveries(data.deliveries);
    } catch (err) {
      toast.error('Failed to load driver schedule. Link may be invalid.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDriverJobs();
  }, [uuid]);

  async function handleStatusUpdate(e) {
    e.preventDefault();
    if (!selectedDelivery) return;

    setUpdating(true);
    try {
      await api.patch(`/delivery/driver/${uuid}/orders/${selectedDelivery.id}/status`, {
        status: newStatus,
        failed_reason: newStatus === 'failed' ? failedReason : null,
        notes: notes.trim() || null
      });

      toast.success(`Delivery status updated to ${newStatus.replace(/_/g, ' ')}`);
      setShowStatusModal(false);
      setNotes('');
      fetchDriverJobs();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  function openStatusModal(delivery, status) {
    setSelectedDelivery(delivery);
    setNewStatus(status);
    setFailedReason('not_answered');
    setNotes('');
    setShowStatusModal(true);
  }

  const renderSkeleton = () => (
    <div style={{ padding: '16px', background: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="skeleton" style={{ height: '80px', marginBottom: '24px' }}></div>
      <div className="skeleton" style={{ height: '160px' }}></div>
    </div>
  );

  if (loading) return renderSkeleton();

  if (!driver) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', background: 'var(--color-bg)', color: 'var(--color-text)', padding: '24px', textAlign: 'center'
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-error)' }}>error</span>
        <h1 style={{ fontSize: '24px', marginTop: '16px', fontWeight: 800 }}>Invalid Link</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '8px' }}>This driver manifest link is invalid or expired.</p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text)', padding: '16px' }}>
      {/* Mobile Driver Header */}
      <div className="card" style={{ marginBottom: '24px', background: 'var(--color-bg-elevated)', borderLeft: '4px solid var(--color-text)' }}>
        <p className="text-label" style={{ color: 'var(--color-text-dim)' }}>Driver Manifest</p>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>{driver.name}</h1>
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
          <span><strong>Zone:</strong> {driver.zone || 'Global'}</span>
          <span><strong>Phone:</strong> {driver.phone}</span>
        </div>
      </div>

      <h2 className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>
        Today's Assigned Shipments ({deliveries.length})
      </h2>

      {/* Deliveries list cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {deliveries.map(d => (
          <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)' }}>
                  ORDER #{d.orders?.order_number || 'N/A'}
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginTop: '6px' }}>{d.orders?.customer_name}</h3>
              </div>
              <span className={`badge badge-${d.status === 'out_for_delivery' ? 'warning' : 'info'}`}>
                {d.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              <p style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', marginTop: '2px' }}>pin_drop</span>
                <span>{d.customer_address}</span>
              </p>
              <p style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>call</span>
                <a href={`tel:${d.orders?.customer_phone}`} style={{ color: 'var(--color-text)', textDecoration: 'underline' }}>
                  {d.orders?.customer_phone}
                </a>
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '10px' }}>
              <p className="text-label" style={{ fontSize: '9px', color: 'var(--color-text-dim)', marginBottom: 6 }}>Items</p>
              {(Array.isArray(d.orders?.items) ? d.orders.items : JSON.parse(d.orders?.items || '[]')).map((item, index) => (
                <div key={`${item.sku || item.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8 }}>
                  <span>{item.quantity}x {item.name}</span>
                  <span className="font-mono">{item.sku}</span>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              borderTop: '1px solid var(--color-border-light)', paddingTop: '10px', marginTop: '4px'
            }}>
              <div>
                <p className="text-label" style={{ fontSize: '9px', color: 'var(--color-text-dim)' }}>COD to Collect</p>
                <p className="font-mono" style={{ fontSize: '16px', fontWeight: 700 }}>
                  {formatEGP(d.cod_amount)}
                </p>
                {Number(d.cod_amount || 0) > 0 && (
                  <span className="badge badge-warning" style={{ marginTop: 6 }}>COD</span>
                )}
              </div>

              <div style={{ display: 'grid', gap: 8, minWidth: 150 }}>
                {d.status === 'assigned' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => openStatusModal(d, 'out_for_delivery')}>
                    Out for Delivery
                  </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={() => openStatusModal(d, 'delivered')}>
                  Delivered
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => openStatusModal(d, 'failed')}>
                  Failed
                </button>
              </div>
            </div>
          </div>
        ))}

        {deliveries.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-text-dim)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>task_alt</span>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>No active deliveries assigned right now.</p>
          </div>
        )}
      </div>

      {/* Update Status Overlay Modal */}
      {showStatusModal && selectedDelivery && (
        <div className="modal-overlay" style={{ padding: '16px' }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '100%', padding: '24px' }}>
            <p className="text-title" style={{ marginBottom: '20px' }}>Update Delivery Status</p>
            <form onSubmit={handleStatusUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Status</label>
                <select
                  className="input select"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  required
                >
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered (Success)</option>
                  <option value="failed">Failed / Refused</option>
                </select>
              </div>

              {newStatus === 'failed' && (
                <div>
                  <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Failure Reason</label>
                  <select
                    className="input select"
                    value={failedReason}
                    onChange={(e) => setFailedReason(e.target.value)}
                    required
                  >
                    <option value="not_answered">Phone Not Answered</option>
                    <option value="wrong_address">Wrong Delivery Address</option>
                    <option value="refused">Customer Refused Package</option>
                    <option value="postponed">Delivery Postponed by Customer</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-label" style={{ fontSize: '10px', display: 'block', marginBottom: '6px' }}>Driver Notes (Optional)</label>
                <textarea
                  className="input"
                  style={{ height: '60px', resize: 'none' }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Customer requested call 10 mins before arrival..."
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowStatusModal(false);
                    setNotes('');
                  }}
                  disabled={updating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={updating}>
                  {updating ? 'Saving...' : 'Save Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
