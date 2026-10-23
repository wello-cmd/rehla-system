import { translate } from '../i18n/index.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../lib/api';
import { formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function WarehouseLogsPage() {
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Restock (inbound) state
  const [scanInput, setScanInput] = useState('');
  const [restockQty, setRestockQty] = useState('1');
  const [restockNotes, setRestockNotes] = useState('');
  const [restockResult, setRestockResult] = useState(null);
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockHistory, setRestockHistory] = useState([]);
  const scanRef = useRef(null);

  async function fetchLogs() {
    try {
      const data = await api.get('/inventory/logs');
      setLogs(data);
    } catch (err) {
      toast.error(translate("Failed to load warehouse audit logs"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (activeTab === 'restock' && scanRef.current) scanRef.current.focus();
  }, [activeTab]);

  async function handleRestock(e) {
    e.preventDefault();
    if (!scanInput.trim() || !restockQty || Number(restockQty) <= 0) return;
    setRestockLoading(true);
    try {
      const data = await api.post('/inventory/warehouse/restock', {
        sku: scanInput.trim().toUpperCase(),
        quantity: Number(restockQty),
        notes: restockNotes || undefined
      });
      setRestockResult(data.product);
      setRestockHistory(prev => [{ ...data.product, timestamp: new Date().toLocaleTimeString(), qty: data.product.quantity_added }, ...prev]);
      toast.success(`+${data.product.quantity_added} restocked — ${data.product.name}`);
      setScanInput('');
      setRestockQty('1');
      setRestockNotes('');
      fetchLogs();
    } catch (err) {
      toast.error(translate(err.message));
      setRestockResult(null);
    } finally {
      setRestockLoading(false);
      setTimeout(() => { if (scanRef.current) scanRef.current.focus(); }, 0);
    }
  }

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch =
        log.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.products?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.handler_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter ? log.event_type === typeFilter : true;
      return matchesSearch && matchesType;
    });
  }, [logs, searchTerm, typeFilter]);

  function getEventBadgeClass(type) {
    switch (type) {
      case 'restock': case 'return': return 'badge-success';
      case 'warehouse_exit': case 'sold': return 'badge-error';
      case 'adjustment': return 'badge-info';
      default: return 'badge-neutral';
    }
  }

  function getEventLabel(type) {
    switch (type) {
      case 'warehouse_exit': return 'Exit Scan';
      case 'sold': return 'POS Sale';
      case 'restock': return 'Restock IN';
      case 'adjustment': return 'Adjustment';
      case 'return': return 'Return IN';
      default: return type;
    }
  }

  const tabs = [
    { id: 'logs', label: 'Audit Logs' },
    { id: 'restock', label: 'Receive Stock (Inbound)' }
  ];

  return (
    <DashboardShell title={translate("Warehouse")}>
      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--color-border-light)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === t.id ? '2px solid var(--color-text)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--color-text)' : 'var(--color-text-dim)',
              marginBottom: -1
            }}
          >
            {translate(t.label)}
          </button>
        ))}
      </div>

      {/* ── AUDIT LOGS TAB ── */}
      {activeTab === 'logs' && (
        loading ? (
          <div style={{ padding: 24 }}>
            <div className="skeleton" style={{ height: 40, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 250 }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 300, flexWrap: 'wrap' }}>
                <input className="input" style={{ maxWidth: 280 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={translate("Search SKU, product, handler...")} />
                <select className="input select" style={{ maxWidth: 180 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="">{translate("All Event Types")}</option>
                  <option value="warehouse_exit">{translate("Exits (Outbound)")}</option>
                  <option value="restock">{translate("Restocks (Inbound)")}</option>
                  <option value="sold">{translate("POS Sales")}</option>
                  <option value="adjustment">{translate("Adjustments")}</option>
                  <option value="return">{translate("Returns")}</option>
                </select>
              </div>
              <button className="btn btn-secondary" onClick={fetchLogs}>{translate("⟲ Refresh")}</button>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-container">
                <table className="data-table t-whlogs">
                  <thead>
                    <tr>
                      <th>{translate("Timestamp")}</th>
                      <th>{translate("SKU")}</th>
                      <th>{translate("Order")}</th>
                      <th>{translate("Product")}</th>
                      <th>{translate("Event")}</th>
                      <th style={{ textAlign: "end" }}>{translate("Qty Change")}</th>
                      <th style={{ textAlign: "end" }}>{translate("Stock Before → After")}</th>
                      <th>{translate("Operator")}</th>
                      <th>{translate("Notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => (
                      <tr key={log.id}>
                        <td className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(log.created_at).toLocaleString()}</td>
                        <td className="font-mono" style={{ fontWeight: 600, fontSize: 12 }}>{log.sku}</td>
                        <td className="font-mono" style={{ fontSize: 12, color: log.order_number ? 'var(--color-text)' : 'var(--color-text-dim)' }}>{log.order_number || '—'}</td>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{log.products?.name || translate("Deleted Product")}</td>
                        <td><span className={`badge ${getEventBadgeClass(log.event_type)}`}>{getEventLabel(log.event_type)}</span></td>
                        <td className="font-mono" style={{ textAlign: "end", fontWeight: 700, color: log.quantity_changed > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {log.quantity_changed > 0 ? `+${log.quantity_changed}` : log.quantity_changed}
                        </td>
                        <td className="font-mono" style={{ textAlign: "end", fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {formatNumber(log.previous_quantity)} → {formatNumber(log.new_quantity)}
                        </td>
                        <td style={{ fontSize: 13 }}>{log.handler_name || translate("System")}</td>
                        <td style={{ fontSize: 12, color: 'var(--color-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.notes}>{log.notes || '—'}</td>
                      </tr>
                    ))}
                    {filteredLogs.length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)' }}>{translate("No logs found.")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}

      {/* ── RESTOCK (INBOUND) TAB ── */}
      {activeTab === 'restock' && (
        <div style={{ display: 'grid', gap: 24, maxWidth: 700 }}>
          <div className="card">
            <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>{translate("Receive Stock Inbound")}</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 20 }}> {translate("Scan a barcode or enter a SKU to add stock. Every restock is logged to the audit trail.")} </p>
            <form onSubmit={handleRestock} style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>{translate("SKU / Barcode")}</label>
                <input
                  ref={scanRef}
                  className="input"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  placeholder={translate("Scan barcode or type SKU...")}
                  autoFocus
                  disabled={restockLoading}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>{translate("Quantity Received")}</label>
                  <input className="input" type="number" min="1" value={restockQty} onChange={e => setRestockQty(e.target.value)} disabled={restockLoading} />
                </div>
                <div>
                  <label className="text-label" style={{ display: 'block', marginBottom: 6 }}>{translate("Notes (optional)")}</label>
                  <input className="input" value={restockNotes} onChange={e => setRestockNotes(e.target.value)} placeholder={translate("e.g. Supplier delivery, PO-2024-001")} disabled={restockLoading} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={restockLoading || !scanInput.trim()}>
                {restockLoading ? translate("Processing...") : translate("+ Receive Stock")}
              </button>
            </form>

            {restockResult && (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--color-bg-inset)', borderRadius: 4, borderInlineStart: '3px solid var(--color-success)' }}>
                <p style={{ fontWeight: 700, fontSize: 14 }}>{restockResult.name}</p>
                <p className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 4 }}>{translate("SKU:")} {restockResult.sku}</p>
                <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{translate("ADDED")}</p>
                    <p className="font-mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-success)' }}>+{restockResult.quantity_added}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{translate("NEW STOCK")}</p>
                    <p className="font-mono" style={{ fontSize: 22, fontWeight: 800 }}>{restockResult.current_stock}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>{translate("PREVIOUS")}</p>
                    <p className="font-mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-dim)' }}>{restockResult.previous_stock}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {restockHistory.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-light)' }}>
                <p className="text-label" style={{ color:"var(--color-text-dim)", marginBottom: 14 }}>{translate("This Session — Received")}</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>{translate("Time")}</th><th>{translate("SKU")}</th><th>{translate("Product")}</th><th style={{ textAlign: "end" }}>{translate("Added")}</th><th style={{ textAlign: "end" }}>{translate("New Stock")}</th></tr>
                </thead>
                <tbody>
                  {restockHistory.map((item, i) => (
                    <tr key={i}>
                      <td className="font-mono" style={{ fontSize: 12 }}>{item.timestamp}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{item.sku}</td>
                      <td>{item.name}</td>
                      <td className="font-mono" style={{ textAlign: "end", color: 'var(--color-success)', fontWeight: 700 }}>+{item.qty}</td>
                      <td className="font-mono" style={{ textAlign: "end" }}>{item.current_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
