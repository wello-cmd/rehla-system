import { translate } from '../i18n/index.js';
import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import LoadNotice from '../components/ui/LoadNotice';
import { api } from '../lib/api';
import { prepareCheckoutAttempt } from '../lib/checkoutAttempt';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

// Lazy-loaded so the camera/zxing bundle only downloads when scanning is used
const BarcodeScanner = lazy(() => import('../components/ui/BarcodeScanner'));

export default function WarehouseExitPage() {
  // Scan-first: scanning always deducts from stock. Attaching a Shopify order is optional.
  const [scanInput, setScanInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showScanner, setShowScanner] = useState(false);

  // Optional order tagging
  const [orderInput, setOrderInput] = useState('');
  const [attachedOrder, setAttachedOrder] = useState(null); // pack-progress object or null
  const [attaching, setAttaching] = useState(false);
  const [queueError, setQueueError] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const scanInputRef = useRef(null);
  const attemptRef = useRef(null);
  const inFlightRef = useRef(false);

  async function loadQueue() {
    setQueueLoading(true);
    setQueueError(null);
    try {
      setQueue(await api.get('/inventory/warehouse/queue'));
    } catch { setQueueError('Could not load the ready-to-ship queue.'); }
    finally { setQueueLoading(false); }
  }

  useEffect(() => {
    if (scanInputRef.current) scanInputRef.current.focus();
    loadQueue();
  }, []);

  const orderRef = attachedOrder
    ? (attachedOrder.order.shopify_order_name || attachedOrder.order.order_number)
    : null;

  async function attachOrder(value) {
    const val = (value || '').trim();
    if (!val) return;
    setAttaching(true);
    try {
      const data = await api.get(`/inventory/warehouse/order/${encodeURIComponent(val)}`);
      setAttachedOrder(data);
      setOrderInput(data.order.shopify_order_name || `#${data.order.order_number}`);
      toast.success(`Order ${data.order.shopify_order_name || '#' + data.order.order_number} attached`);
      setTimeout(() => scanInputRef.current?.focus(), 0);
    } catch (err) {
      toast.error(translate(err.message));
    } finally {
      setAttaching(false);
    }
  }

  function clearOrder() {
    setAttachedOrder(null);
    setOrderInput('');
    loadQueue();
    setTimeout(() => scanInputRef.current?.focus(), 0);
  }

  async function submitExit(code) {
    const val = (code || '').trim();
    if (!val || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const attempt = prepareCheckoutAttempt(attemptRef.current, {
        sku: val.toUpperCase(),
        ...(orderRef ? { order_identifier: orderRef } : {}),
      });
      attemptRef.current = attempt;
      const data = await api.post('/inventory/warehouse/exit', attempt.payload);
      attemptRef.current = null;
      setScanInput('');
      const withWarn = { ...data.product, warning: data.warning };
      setResult(withWarn);
      setHistory(prev => [{ ...withWarn, timestamp: new Date().toLocaleTimeString() }, ...prev]);

      if (data.warning) {
        toast(data.warning, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(`✓ ${data.product.name} — ${data.product.previous_stock} → ${data.product.current_stock}`);
      }
      if (data.product.low_stock) {
        toast.error(translate(`⚠ Low stock: ${data.product.name} (${data.product.current_stock} left)`));
      }
      if (data.order) setAttachedOrder(data.order); // refreshed pack progress
      if (data.order?.complete) toast.success(`🎉 Order ${orderRef} fully packed`);
    } catch (err) {
      toast.error(translate(err.message));
      setResult(null);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setTimeout(() => scanInputRef.current?.focus(), 0);
    }
  }

  function handleScan(e) { e.preventDefault(); submitExit(scanInput); }
  function handleAttach(e) { e.preventDefault(); attachOrder(orderInput); }
  function handleDetected(text) { setShowScanner(false); setScanInput(text); submitExit(text); }

  const o = attachedOrder?.order;

  return (
    <DashboardShell title={translate("Warehouse Exit Scanner")}>
      {/* SCANNER — always active. This is the primary action. */}
      <div className="card" style={{ marginBottom: 20, maxWidth: 600 }}>
        <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 12 }}> {translate("Scan item barcode or enter SKU")} {orderRef ? translate('· packing {order}',{order:orderRef}) : translate("· stock exit")}
        </p>
        <form onSubmit={handleScan} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            ref={scanInputRef}
            className="input"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder={translate("Scan or type SKU...")}
            autoFocus
            disabled={loading}
            style={{ fontSize: 18, fontFamily: 'var(--font-mono)', padding: 16, flex: '1 1 180px', minWidth: 0 }}
          />
          <button className="btn btn-secondary" type="button" onClick={() => setShowScanner(true)} disabled={loading} title={translate("Scan with camera")} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_camera</span> {translate("Scan")} </button>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '...' : translate("EXIT")}
          </button>
        </form>
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onDetect={handleDetected} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {/* Last scan result — big stock change + any warning */}
      {result && (
        <div className="card" style={{
          marginBottom: 20, maxWidth: 600,
          borderInlineStart: `4px solid ${result.warning ? 'var(--color-warning)' : result.low_stock ? 'var(--color-error)' : 'var(--color-success)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>{result.name}</h3>
              <p className="font-mono" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{translate("SKU:")} {result.sku}</p>
            </div>
            <span className={`badge badge-${result.low_stock ? 'error' : 'success'}`}>
              {result.low_stock ? translate("LOW STOCK") : translate("OK")}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: 'var(--font-mono)' }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-text-muted)' }}>{result.previous_stock}</span>
            <span className="material-symbols-outlined directional-icon" style={{ fontSize: 22, color: 'var(--color-text-dim)' }}>arrow_forward</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: result.low_stock ? 'var(--color-error)' : 'var(--color-success)' }}>{result.current_stock}</span>
            <span style={{ fontSize: 13, color: 'var(--color-error)', marginInlineStart: 4 }}>−{result.quantity_exited}</span>
          </div>
          {result.warning && (
            <p style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--color-warning-soft, rgba(240,136,62,0.12))', color: 'var(--color-warning)', fontSize: 13 }}>
              ⚠ {result.warning}
            </p>
          )}
        </div>
      )}

      {/* OPTIONAL — assign this exit to a Shopify order */}
      <div className="card" style={{ marginBottom: 20, maxWidth: 600 }}>
        <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 12 }}> {translate("Assign to a Shopify order — optional")} </p>

        {!attachedOrder ? (
          <>
            <form onSubmit={handleAttach} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <input
                className="input"
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
                placeholder={translate("e.g. #1001 — leave empty for a plain stock exit")}
                disabled={attaching}
                style={{ fontFamily: 'var(--font-mono)', flex: '1 1 200px', minWidth: 0 }}
              />
              <button className="btn btn-secondary" type="submit" disabled={attaching || !orderInput.trim()}>
                {attaching ? '...' : translate("Attach")}
              </button>
            </form>

            {(

              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>{translate("Ready to ship (")}{queue.length})</span>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={loadQueue} disabled={queueLoading} style={{ fontSize: 11 }}>
                    {queueLoading ? translate("Loading…") : translate("Refresh queue")}
                  </button>
                </div>
                <LoadNotice error={queueError} loading={queueLoading} onRetry={loadQueue} stale={queue.length > 0} />
                {!queueLoading && !queueError && queue.length === 0 && <p style={{fontSize:12,color:'var(--color-text-muted)'}}>{translate("No orders are ready to ship.")}</p>}
                {queue.slice(0, 6).map((q, i) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => attachOrder(q.shopify_order_name || q.order_number)}
                    disabled={attaching}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                      padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: "start",
                      borderBottom: i < Math.min(queue.length, 6) - 1 ? '1px solid var(--color-border-light)' : 'none',
                    }}
                  >
                    <span>
                      <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, marginInlineEnd: 8 }}>{q.shopify_order_name || `#${q.order_number}`}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{q.customer_name}</span>
                    </span>
                    <span className={`badge badge-${q.total_packed > 0 ? 'warning' : 'neutral'}`} style={{ fontSize: 10 }}>
                      {q.total_packed} / {q.total_ordered}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700 }}>{o.shopify_order_name || `#${o.order_number}`}</h3>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{o.customer_name} · {o.customer_phone}</p>
                <span className={`badge badge-${o.delivery_method === 'bosta' ? 'info' : o.delivery_method === 'own_driver' ? 'success' : 'neutral'}`} style={{ marginTop: 8, fontSize: 11 }}>
                  {o.delivery_method === 'bosta' ? translate("🚚 Bosta") : o.delivery_method === 'own_driver' ? translate("🏠 Rehla (own driver)") : translate("Delivery not assigned")}
                </span>
              </div>
              <div style={{ textAlign: "end" }}>
                <span className={`badge badge-${attachedOrder.complete ? 'success' : 'warning'}`}>
                  {attachedOrder.total_packed} / {attachedOrder.total_ordered} {translate("packed")} </span>
                <div>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={clearOrder} style={{ marginTop: 8 }}> {translate("Clear order")} </button>
                </div>
              </div>
            </div>

            {/* Pack checklist */}
            <div style={{ marginTop: 14 }}>
              {attachedOrder.items.map((it) => {
                const done = it.packed >= it.ordered;
                return (
                  <div key={it.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                    <span>
                      <span className="font-mono" style={{ fontSize: 12, marginInlineEnd: 8, color: 'var(--color-text-muted)' }}>{it.sku}</span>
                      <span style={{ fontSize: 13 }}>{it.name}</span>
                    </span>
                    <span className={`badge badge-${done ? 'success' : 'neutral'}`} style={{ fontSize: 11 }}>
                      {done ? '✓ ' : ''}{it.packed} / {it.ordered}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Session history */}
      {history.length > 0 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 12 }}>{translate("Session History")}</p>
          {history.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < history.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
              <span>
                <span className="font-mono" style={{ fontSize: 12, marginInlineEnd: 8 }}>{item.sku}</span>
                <span style={{ fontSize: 13 }}>{item.name}</span>
                {item.warning && <span title={item.warning} style={{ marginInlineStart: 6 }}>⚠</span>}
              </span>
              <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{item.timestamp}</span>
                <span className={`badge badge-${item.low_stock ? 'error' : 'success'}`} style={{ fontSize: 10 }}>
                  {item.previous_stock} → {item.current_stock}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
