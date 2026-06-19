import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatDate } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#3b82f6',
  restocked: '#22c55e',
  refunded: '#8b5cf6'
};

export default function ReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orders, setOrders] = useState([]);

  // Form state
  const [form, setForm] = useState({ order_id: '', customer_name: '', reason: '', notes: '' });
  const [items, setItems] = useState([{ sku: '', name: '', quantity: 1 }]);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const data = await api.get(`/returns${params}`);
      setReturns(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  async function fetchOrders() {
    try {
      const data = await api.get('/orders?status=delivered');
      setOrders(data);
    } catch { /* non-critical */ }
  }

  function openCreate() {
    fetchOrders();
    setForm({ order_id: '', customer_name: '', reason: '', notes: '' });
    setItems([{ sku: '', name: '', quantity: 1 }]);
    setShowCreateModal(true);
  }

  // When an order is picked, pull its line items so the right SKUs/variants are
  // pre-filled — staff just adjust quantities / remove what didn't come back.
  async function onSelectOrder(orderId) {
    const selected = orders.find(o => o.id === orderId);
    setForm(p => ({ ...p, order_id: orderId, customer_name: selected?.customer_name || p.customer_name }));
    if (!orderId) {
      setItems([{ sku: '', name: '', quantity: 1 }]);
      return;
    }
    try {
      const order = await api.get(`/orders/${orderId}`);
      const lineItems = (order.items || []).map(it => ({
        sku: it.sku || '',
        name: it.name || '',
        quantity: it.quantity || 1,
        variant_id: it.variant_id || null,
        product_id: it.product_id || null,
      }));
      setItems(lineItems.length ? lineItems : [{ sku: '', name: '', quantity: 1 }]);
    } catch {
      toast.error('Could not load order items — enter them manually.');
    }
  }

  function addItem() {
    setItems(prev => [...prev, { sku: '', name: '', quantity: 1 }]);
  }

  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i, field, value) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const validItems = items.filter(it => it.sku.trim());
    if (!validItems.length || !form.reason) {
      toast.error('At least one item with a SKU and a reason are required.');
      return;
    }
    try {
      await api.post('/returns', {
        ...form,
        order_id: form.order_id || undefined,
        items: validItems.map(it => ({ ...it, quantity: Number(it.quantity) }))
      });
      toast.success('Return created');
      setShowCreateModal(false);
      fetchReturns();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAction(id, action) {
    const labels = { approve: 'Approve', restock: 'Restock items', refund: 'Mark Refunded' };
    if (!window.confirm(`${labels[action] || action} this return?`)) return;
    try {
      await api.patch(`/returns/${id}/${action}`, {});
      toast.success('Updated');
      fetchReturns();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <DashboardShell title="Returns">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select className="input" style={{ maxWidth: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="restocked">Restocked</option>
            <option value="refunded">Refunded</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={fetchReturns}>⟲ Refresh</button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Return</button>
      </div>

      {/* Summary Chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {['pending', 'approved', 'restocked', 'refunded'].map(s => {
          const count = returns.filter(r => r.status === s).length;
          return (
            <div key={s} style={{ padding: '6px 14px', borderRadius: 4, background: 'var(--color-bg-inset)', borderLeft: `3px solid ${STATUS_COLORS[s]}`, fontSize: 13 }}>
              <span style={{ color: 'var(--color-text-dim)', textTransform: 'capitalize' }}>{s}</span>
              <span className="font-mono" style={{ fontWeight: 700, marginLeft: 8 }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40 }}><div className="skeleton" style={{ height: 200 }} /></div>
        ) : (
          <div className="table-container">
            <table className="data-table t-returns">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Items</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono" style={{ fontSize: 12 }}>{formatDate(r.created_at)}</td>
                    <td>{r.customer_name || r.orders?.customer_name || '—'}</td>
                    <td className="font-mono" style={{ fontSize: 12 }}>
                      {r.orders?.shopify_order_name || (r.orders?.order_number ? `#${r.orders.order_number}` : '—')}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {(r.items || []).map((it, i) => (
                        <div key={i}><span className="font-mono">{it.sku}</span> × {it.quantity}{it.name ? ` — ${it.name}` : ''}</div>
                      ))}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.reason}</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', background: STATUS_COLORS[r.status] + '22', color: STATUS_COLORS[r.status] }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {r.status === 'pending' && (
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => handleAction(r.id, 'approve')}>Approve</button>
                        )}
                        {['pending', 'approved'].includes(r.status) && !r.restocked && (
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => handleAction(r.id, 'restock')}>Restock</button>
                        )}
                        {r.status !== 'refunded' && (
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => handleAction(r.id, 'refund')}>Refund</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)' }}>No returns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" style={{ maxWidth: 600, width: '95%' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-title" style={{ marginBottom: 20 }}>New Return</h2>
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>Customer Name</label>
                  <input className="input" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} placeholder="Walk-in / name" />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>Linked Order (optional)</label>
                  <select className="input" value={form.order_id} onChange={e => onSelectOrder(e.target.value)}>
                    <option value="">— No linked order —</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>{o.shopify_order_name || `#${o.order_number}`} — {o.customer_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>Return Reason *</label>
                <select className="input" required value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}>
                  <option value="">Select reason...</option>
                  <option value="damaged">Damaged / Defective</option>
                  <option value="wrong_item">Wrong Item Sent</option>
                  <option value="customer_changed_mind">Customer Changed Mind</option>
                  <option value="size_issue">Size / Fit Issue</option>
                  <option value="quality_issue">Quality Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="text-label">Returned Items *</label>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={addItem}>+ Add Item</button>
                </div>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <input className="input" placeholder="SKU" value={item.sku} onChange={e => updateItem(i, 'sku', e.target.value.toUpperCase())} />
                    <input className="input" placeholder="Product name (optional)" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                    <input className="input" type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                    {items.length > 1 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeItem(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Create Return</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
