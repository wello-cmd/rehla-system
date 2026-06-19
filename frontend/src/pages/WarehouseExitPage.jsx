import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { api } from '../lib/api';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

// Lazy-loaded so the camera/zxing bundle only downloads when scanning is used
const BarcodeScanner = lazy(() => import('../components/ui/BarcodeScanner'));

export default function WarehouseExitPage() {
  // Order-first flow: open an order, then scan its items against it.
  const [orderInput, setOrderInput] = useState('');
  const [order, setOrder] = useState(null); // { order, items, total_ordered, total_packed, complete }
  const [openingOrder, setOpeningOrder] = useState(false);

  const [scanInput, setScanInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showScanner, setShowScanner] = useState(false);

  const orderInputRef = useRef(null);
  const scanInputRef = useRef(null);

  useEffect(() => {
    if (orderInputRef.current) orderInputRef.current.focus();
  }, []);

  // Focus the SKU field once an order is open.
  useEffect(() => {
    if (order && scanInputRef.current) scanInputRef.current.focus();
  }, [order]);

  async function openOrder(value) {
    const val = (value || '').trim();
    if (!val) return;
    setOpeningOrder(true);
    try {
      const data = await api.get(`/inventory/warehouse/order/${encodeURIComponent(val)}`);
      setOrder(data);
      setResult(null);
      setHistory([]);
      toast.success(`Order ${data.order.shopify_order_name || '#' + data.order.order_number} opened`);
    } catch (err) {
      toast.error(err.message);
      setOrder(null);
    } finally {
      setOpeningOrder(false);
    }
  }

  function closeOrder() {
    setOrder(null);
    setOrderInput('');
    setResult(null);
    setScanInput('');
    setTimeout(() => orderInputRef.current?.focus(), 0);
  }

  async function submitExit(code) {
    const val = (code || '').trim();
    if (!val || !order) return;

    const orderRef = order.order.shopify_order_name || order.order.order_number;
    setLoading(true);
    try {
      const data = await api.post('/inventory/warehouse/exit', {
        sku: val.toUpperCase(),
        order_identifier: orderRef,
      });
      setResult(data.product);
      setOrder(data.order); // refreshed pack progress
      setHistory(prev => [{ ...data.product, timestamp: new Date().toLocaleTimeString() }, ...prev]);
      toast.success(`✓ ${data.product.name} — packed for ${order.order.shopify_order_name || '#' + order.order.order_number}`);
      if (data.order.complete) {
        toast.success(`🎉 Order ${order.order.shopify_order_name || '#' + order.order.order_number} fully packed`);
      }
    } catch (err) {
      toast.error(err.message);
      setResult(null);
    } finally {
      setLoading(false);
      setScanInput('');
      setTimeout(() => scanInputRef.current?.focus(), 0);
    }
  }

  function handleOpenOrder(e) {
    e.preventDefault();
    openOrder(orderInput);
  }

  function handleScan(e) {
    e.preventDefault();
    submitExit(scanInput);
  }

  function handleDetected(text) {
    setShowScanner(false);
    setScanInput(text);
    submitExit(text);
  }

  const o = order?.order;

  return (
    <DashboardShell title="Warehouse Exit Scanner">
      {/* Step 1 — Open an order */}
      {!order && (
        <div className="card" style={{ marginBottom: '24px', maxWidth: '600px' }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>
            Scan or enter the Shopify order number
          </p>
          <form onSubmit={handleOpenOrder} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input
              ref={orderInputRef}
              className="input"
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              placeholder="e.g. #1001"
              autoFocus
              disabled={openingOrder}
              style={{ fontSize: '18px', fontFamily: 'var(--font-mono)', padding: '16px', flex: '1 1 180px', minWidth: 0 }}
            />
            <button className="btn btn-primary" type="submit" disabled={openingOrder}>
              {openingOrder ? '...' : 'OPEN ORDER'}
            </button>
          </form>
        </div>
      )}

      {/* Step 2 — Open order header + pack checklist */}
      {order && (
        <>
          <div className="card" style={{ marginBottom: '24px', maxWidth: '600px', borderLeft: `4px solid ${order.complete ? 'var(--color-success)' : 'var(--color-text)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700 }}>{o.shopify_order_name || `#${o.order_number}`}</h3>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{o.customer_name} · {o.customer_phone}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge badge-${order.complete ? 'success' : 'warning'}`}>
                  {order.total_packed} / {order.total_ordered} packed
                </span>
                <div>
                  <button className="btn btn-secondary" type="button" onClick={closeOrder} style={{ marginTop: 8 }}>
                    Close order
                  </button>
                </div>
              </div>
            </div>

            {/* Pack checklist */}
            <div style={{ marginTop: 16 }}>
              {order.items.map((it) => {
                const done = it.packed >= it.ordered;
                return (
                  <div key={it.sku} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid var(--color-border-light)'
                  }}>
                    <div>
                      <span className="font-mono" style={{ fontSize: '12px', marginRight: '8px', color: 'var(--color-text-muted)' }}>{it.sku}</span>
                      <span style={{ fontSize: '13px' }}>{it.name}</span>
                    </div>
                    <span className={`badge badge-${done ? 'success' : 'neutral'}`} style={{ fontSize: '11px' }}>
                      {done ? '✓ ' : ''}{it.packed} / {it.ordered}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SKU scanner — only active while an order is open */}
          <div className="card" style={{ marginBottom: '24px', maxWidth: '600px' }}>
            <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>
              Scan item barcode or enter SKU
            </p>
            <form onSubmit={handleScan} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                ref={scanInputRef}
                className="input"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Scan or type SKU..."
                disabled={loading}
                style={{ fontSize: '18px', fontFamily: 'var(--font-mono)', padding: '16px', flex: '1 1 180px', minWidth: 0 }}
              />
              <button className="btn btn-secondary" type="button" onClick={() => setShowScanner(true)} disabled={loading} title="Scan with camera" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_camera</span>
                Scan
              </button>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? '...' : 'EXIT'}
              </button>
            </form>
          </div>
        </>
      )}

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onDetect={handleDetected} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {/* Last Scan Result Card (FR-WH-07) */}
      {result && (
        <div className="card" style={{
          marginBottom: '24px',
          maxWidth: '600px',
          borderLeft: `4px solid ${result.low_stock ? 'var(--color-error)' : 'var(--color-success)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{result.name}</h3>
              <p className="font-mono" style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>SKU: {result.sku}</p>
            </div>
            <span className={`badge badge-${result.low_stock ? 'error' : 'success'}`}>
              {result.low_stock ? 'LOW STOCK' : 'OK'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
            <div>
              <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Previous</p>
              <p className="font-mono" style={{ fontSize: '20px', fontWeight: 600 }}>{result.previous_stock}</p>
            </div>
            <div>
              <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Exited</p>
              <p className="font-mono" style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-error)' }}>−{result.quantity_exited}</p>
            </div>
            <div>
              <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>Current</p>
              <p className={`font-mono ${result.low_stock ? 'low-stock' : ''}`} style={{ fontSize: '20px', fontWeight: 600 }}>
                {result.current_stock}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scan History */}
      {history.length > 0 && (
        <div className="card" style={{ maxWidth: '600px' }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>Session History</p>
          {history.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: i < history.length - 1 ? '1px solid var(--color-border-light)' : 'none'
            }}>
              <div>
                <span className="font-mono" style={{ fontSize: '12px', marginRight: '8px' }}>{item.sku}</span>
                <span style={{ fontSize: '13px' }}>{item.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.timestamp}</span>
                <span className={`badge badge-${item.low_stock ? 'error' : 'success'}`} style={{ fontSize: '10px' }}>
                  {item.current_stock} left
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
