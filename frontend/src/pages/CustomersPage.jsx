import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatDate } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

function Badge({ status }) {
  const color = status === 'paid' || status === 'delivered' ? 'success'
              : status === 'pending' ? 'warning'
              : status === 'failed'  ? 'error'
              : 'neutral';
  return <span className={`badge badge-${color}`} style={{ fontSize: 10 }}>{status}</span>;
}

export default function CustomersPage() {
  const [customers, setCustomers]         = useState([]);
  const [anonymousCount, setAnonCount]    = useState(0);
  const [anonymousRevenue, setAnonRev]    = useState(0);
  const [loading, setLoading]             = useState(true);
  const [syncing, setSyncing]             = useState(false);
  const [search, setSearch]               = useState('');
  const [expanded, setExpanded]           = useState(null);
  const [sortBy, setSortBy]               = useState('total_spent');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/customers');
      setCustomers(data.customers || []);
      setAnonCount(data.anonymousCount || 0);
      setAnonRev(data.anonymousRevenue || 0);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await api.post('/shopify/sync', {});
      toast.success('Shopify sync started — reload in a moment');
      setTimeout(() => load(), 5000);
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = q
      ? customers.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email.toLowerCase().includes(q)
        )
      : customers;

    return [...list].sort((a, b) => {
      if (sortBy === 'order_count')   return (b.order_count || 0) - (a.order_count || 0);
      if (sortBy === 'last_order_at') return (b.last_order_at || '').localeCompare(a.last_order_at || '');
      return (b.total_spent || 0) - (a.total_spent || 0);
    });
  }, [customers, search, sortBy]);

  const totalRevenue = customers.reduce((s, c) => s + c.total_spent, 0);
  const totalOrders  = customers.reduce((s, c) => s + c.order_count, 0);

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied'));
  }

  return (
    <DashboardShell title="Customers">
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>Total Customers</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{customers.length}</p>
        </div>
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>Total Orders</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{totalOrders}</p>
        </div>
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>Total Revenue</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatEGP(totalRevenue)}</p>
        </div>
        <div className="card">
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 6 }}>Repeat Customers</p>
          <p style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
            {customers.filter(c => c.order_count > 1).length}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {customers.length > 0
              ? `${((customers.filter(c => c.order_count > 1).length / customers.length) * 100).toFixed(0)}% of base`
              : '—'}
          </p>
        </div>
      </div>

      {/* Anonymous-orders warning */}
      {anonymousCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-warning, #e6a817)',
          borderRadius: 4, marginBottom: 16,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-warning, #e6a817)', flexShrink: 0 }}>warning</span>
          <p style={{ fontSize: 13, flex: 1 }}>
            <strong>{anonymousCount} orders</strong> ({formatEGP(anonymousRevenue)}) have no customer data and are hidden.
            Run a Shopify sync to populate phone numbers and names.
          </p>
          <button
            className="btn btn-sm btn-secondary"
            onClick={triggerSync}
            disabled={syncing}
            style={{ flexShrink: 0, fontSize: 12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sync</span>
            {syncing ? 'Syncing…' : 'Sync Shopify'}
          </button>
        </div>
      )}

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '8px 12px', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'total_spent',   label: 'Top Spenders' },
            { id: 'order_count',   label: 'Most Orders'  },
            { id: 'last_order_at', label: 'Recent'       },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id)}
              className="btn btn-sm"
              style={{
                background:  sortBy === s.id ? 'var(--color-bg-active)' : 'transparent',
                borderColor: sortBy === s.id ? 'var(--color-border)'    : 'transparent',
                color:       sortBy === s.id ? 'var(--color-text)'      : 'var(--color-text-muted)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} customers
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-dim)' }}>
          No customers found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(c => (
            <div key={c.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Customer row */}
              <div
                onClick={() => setExpanded(expanded === c.key ? null : c.key)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.4fr 1.6fr 80px 100px 110px 90px 32px',
                  gap: 12,
                  padding: '12px 16px',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: expanded === c.key ? 'var(--color-bg-hover)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {/* Name */}
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{c.name || '(No name)'}</p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    {c.order_count > 1 && (
                      <span style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 500 }}>
                        Repeat customer
                      </span>
                    )}
                    {(c.city || c.province) && (
                      <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                        {[c.city, c.province].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-text-dim)' }}>phone</span>
                  {c.phone ? (
                    <button
                      className="font-mono"
                      onClick={e => { e.stopPropagation(); copyToClipboard(c.phone); }}
                      style={{ fontSize: 12, color: 'var(--color-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline dotted' }}
                      title="Click to copy"
                    >
                      {c.phone}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </div>

                {/* Email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-text-dim)', flexShrink: 0 }}>mail</span>
                  {c.email ? (
                    <button
                      onClick={e => { e.stopPropagation(); copyToClipboard(c.email); }}
                      style={{ fontSize: 12, color: 'var(--color-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline dotted', maxWidth: '100%' }}
                      title={c.email}
                    >
                      {c.email}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </div>

                {/* Orders */}
                <div style={{ textAlign: 'center' }}>
                  <p className="font-mono" style={{ fontSize: 16, fontWeight: 700 }}>{c.order_count}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>orders</p>
                </div>

                {/* Total spent */}
                <div style={{ textAlign: 'right' }}>
                  <p className="font-mono" style={{ fontSize: 13, fontWeight: 700 }}>{formatEGP(c.total_spent)}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>total spent</p>
                </div>

                {/* Last order */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 12 }}>{formatDate(c.last_order_at)}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>last order</p>
                </div>

                {/* Avg */}
                <div style={{ textAlign: 'right' }}>
                  <p className="font-mono" style={{ fontSize: 11 }}>{formatEGP(c.avg_order_value)}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>avg</p>
                </div>

                {/* Expand icon */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-text-muted)', transition: 'transform 0.15s', transform: expanded === c.key ? 'rotate(180deg)' : 'none' }}>
                    expand_more
                  </span>
                </div>
              </div>

              {/* Expanded order history */}
              {expanded === c.key && (
                <div style={{ borderTop: '1px solid var(--color-border-light)', background: 'var(--color-bg)', padding: '12px 16px' }}>
                  <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 10, fontSize: 11 }}>
                    ORDER HISTORY ({c.orders.length}{c.order_count > 20 ? '+' : ''})
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>Order #</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Discount</th>
                          <th>Status</th>
                          <th>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.orders.map((o, i) => (
                          <tr key={i}>
                            <td className="font-mono">{o.order_number}</td>
                            <td>{formatDate(o.created_at)}</td>
                            <td className="font-mono" style={{ fontWeight: 600 }}>{formatEGP(o.total)}</td>
                            <td className="font-mono" style={{ color: 'var(--color-text-dim)' }}>
                              {Number(o.discount_amount) > 0 ? formatEGP(o.discount_amount) : '—'}
                            </td>
                            <td><Badge status={o.status} /></td>
                            <td><Badge status={o.payment_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Address */}
                  {(c.address || c.city) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: 'var(--color-text-dim)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>
                      {[c.address, c.city, c.province, c.country].filter(Boolean).join(', ')}
                    </div>
                  )}

                  {/* Contact quick-actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: 12, textDecoration: 'none' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>call</span>
                        Call {c.phone}
                      </a>
                    )}
                    {c.phone && (
                      <a
                        href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: 12, textDecoration: 'none' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chat</span>
                        WhatsApp
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: 12, textDecoration: 'none' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>mail</span>
                        Email
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
