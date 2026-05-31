// Warehouse Exit Page — FR-WH-06 through FR-WH-09 (Mobile-optimized)
import { useState } from 'react';
import { api } from '../lib/api';
import { formatNumber } from '../lib/formatters';
import DashboardShell from '../components/layout/DashboardShell';
import toast from 'react-hot-toast';

export default function WarehouseExitPage() {
  const [scanInput, setScanInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  async function handleScan(e) {
    e.preventDefault();
    if (!scanInput.trim()) return;

    setLoading(true);
    try {
      const data = await api.post('/inventory/warehouse/exit', { sku: scanInput.trim().toUpperCase() });
      setResult(data.product);
      setHistory(prev => [{ ...data.product, timestamp: new Date().toLocaleTimeString() }, ...prev]);
      toast.success(`✓ ${data.product.name} — Stock: ${data.product.current_stock}`);
      if (data.product.low_stock) {
        toast.error(`⚠ Low stock alert: ${data.product.name} (${data.product.current_stock} remaining)`);
      }
    } catch (err) {
      toast.error(err.message);
      setResult(null);
    } finally {
      setLoading(false);
      setScanInput('');
    }
  }

  return (
    <DashboardShell title="Warehouse Exit Scanner">
      {/* Scanner Input */}
      <div className="card" style={{ marginBottom: '24px', maxWidth: '600px' }}>
        <p className="text-label" style={{ color: 'var(--color-text-dim)', marginBottom: '12px' }}>
          Scan Barcode or Enter SKU
        </p>
        <form onSubmit={handleScan} style={{ display: 'flex', gap: '12px' }}>
          <input
            className="input"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Scan or type SKU..."
            autoFocus
            disabled={loading}
            style={{ fontSize: '18px', fontFamily: 'var(--font-mono)', padding: '16px' }}
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '...' : 'EXIT'}
          </button>
        </form>
      </div>

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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
