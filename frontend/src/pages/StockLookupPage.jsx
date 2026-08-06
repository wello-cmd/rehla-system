import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { api } from '../lib/api';
import { formatEGP, formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

// Lazy-loaded camera scanner (shared with Warehouse Exit / Returns)
const BarcodeScanner = lazy(() => import('../components/ui/BarcodeScanner'));

export default function StockLookupPage() {
  const [scanInput, setScanInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function lookup(code) {
    const val = (code || '').trim();
    if (!val) return;
    setLoading(true);
    try {
      const res = await api.get(`/inventory/scan-lookup/${encodeURIComponent(val.toUpperCase())}`);
      setData(res);
    } catch (err) {
      toast.error(err.message || 'Not found');
      setData(null);
    } finally {
      setLoading(false);
      setScanInput('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function handleSubmit(e) { e.preventDefault(); lookup(scanInput); }
  function handleDetected(text) { setShowScanner(false); lookup(text); }

  const p = data?.product;
  const scannedId = data?.scanned_variant_id;
  const variantLabel = (v) => [v.size, v.color].filter(Boolean).join(' / ') || v.variant_name || '—';

  return (
    <DashboardShell title="Stock Lookup">
      {/* Scanner — read only */}
      <div className="card" style={{ marginBottom: 20, maxWidth: 640 }}>
        <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 12 }}>
          Scan an item to see its exact stock — nothing is deducted
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            className="input"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Scan or type SKU / barcode..."
            autoFocus
            disabled={loading}
            style={{ fontSize: 18, fontFamily: 'var(--font-mono)', padding: 16, flex: '1 1 180px', minWidth: 0 }}
          />
          <button className="btn btn-secondary" type="button" onClick={() => setShowScanner(true)} disabled={loading} title="Scan with camera" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_camera</span>
            Scan
          </button>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '...' : 'Look up'}
          </button>
        </form>
      </div>

      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner onDetect={handleDetected} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {/* Result */}
      {p && (
        <div className="card" style={{ maxWidth: 640 }}>
          {/* Product header */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {p.image_url && (
              <img src={p.image_url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>{p.name}</h2>
              <p className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{p.sku}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {p.category && <span className="badge" style={{ fontSize: 10, background: 'var(--color-bg-inset)', color: 'var(--color-text-dim)' }}>{p.category}</span>}
                {p.brand && <span className="badge" style={{ fontSize: 10, background: 'var(--color-bg-inset)', color: 'var(--color-text-dim)' }}>{p.brand}</span>}
                {p.warehouse && <span className="badge badge-info" style={{ fontSize: 10 }}>📍 {p.warehouse}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="text-label" style={{ color: 'var(--color-text-dim)', fontSize: 10 }}>Total in stock</p>
              <p className="font-mono" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, color: p.total_stock < 10 ? 'var(--color-error)' : 'var(--color-success)' }}>
                {formatNumber(p.total_stock)}
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{formatEGP(p.price)}</p>
            </div>
          </div>

          {/* Variant breakdown */}
          {data.variants.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: 8 }}>
                Stock by size / colour
              </p>
              <div className="table-container" style={{ borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th>SKU</th>
                      <th style={{ textAlign: 'right' }}>Stock</th>
                      <th style={{ textAlign: 'right' }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.variants.map(v => {
                      const isScanned = v.id === scannedId;
                      return (
                        <tr key={v.id} style={isScanned ? { background: 'var(--color-brand-dim)' } : undefined}>
                          <td>
                            {isScanned && <span style={{ color: 'var(--color-brand-hover)', marginRight: 6 }}>▸</span>}
                            <span style={{ fontWeight: isScanned ? 700 : 500 }}>{variantLabel(v)}</span>
                          </td>
                          <td className="font-mono" style={{ fontSize: 12 }}>{v.sku}</td>
                          <td className={`font-mono ${v.stock_quantity < 10 ? 'low-stock' : ''}`} style={{ textAlign: 'right', fontWeight: 700 }}>
                            {formatNumber(v.stock_quantity)}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                            {v.price ? formatEGP(v.price) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {scannedId && (
                <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 8 }}>
                  ▸ The scanned item is highlighted.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
